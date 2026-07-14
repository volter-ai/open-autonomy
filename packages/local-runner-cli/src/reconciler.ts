// Generic local substrate loop. It realizes cadence, fences, concurrency, retries, session singleton,
// reaping, and opaque completion effects. It does not query tasks, PRs, or role-specific state.
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedJob, ProcRunner, Session, SessionRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { buildTickEnv } from './env.ts';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';
import { recordFire } from './status.ts';
import { runPreflight } from './preflight.ts';

const FAST_DEATH_MS = 60_000;
const BACKOFF_CAP_MS = 30 * 60 * 1000;

interface JobState {
  lastFire: number;
  nextFireAt: number;
  launchedAt: number;
  consecutiveFastDeaths: number;
  backoffUntil: number;
}

export function backoffMsFor(n: number, intervalMs: number): number {
  if (n < 3) return 0;
  return Math.min(Math.max(1000, intervalMs) * 2 ** (n - 2), BACKOFF_CAP_MS);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export interface StartOptions {
  cwd?: string;
  proc?: ProcRunner;
  signal?: AbortSignal;
  pollMs?: number;
  idleReapMs?: number;
  sessionRunnerFactory?: (cwd: string) => Promise<SessionRunner | null>;
  ambient?: NodeJS.ProcessEnv;
  resolveDefault?: () => Promise<{ baseUrl: string; source: string }>;
  fastDeathMs?: number;
  onHeartbeat?: (n: number) => void;
}

const active = (session: Session): boolean => session.status === 'running' || session.status === 'paused' || session.status === 'awaiting-human';
const fenced = (cwd: string, job: NormalizedJob): boolean =>
  existsSync(join(cwd, '.open-autonomy', 'paused')) || (!!job.fence && existsSync(join(cwd, job.fence)));

export async function start(opts: StartOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.ambient ?? process.env;
  const signal = opts.signal;
  const pollMs = Math.max(10, opts.pollMs ?? Number(process.env.AUTONOMY_REAP_POLL_MS ?? 20000));
  const idleReapMs = opts.idleReapMs ?? Number(process.env.AUTONOMY_IDLE_REAP_MS ?? 60000);
  const fastDeathMs = opts.fastDeathMs ?? FAST_DEATH_MS;
  const schedule = loadSchedule(cwd);

  const pre = await runPreflight(schedule, {
    cwd,
    proc,
    ambient,
    ...(opts.resolveDefault ? { resolveDefault: opts.resolveDefault } : {}),
  });
  if (!pre.ok) throw new Error(pre.message ?? '[oa] start: preflight failed — see errors above');

  const harness = process.env.TERMFLEET_AGENT || 'claude';
  let agents = new Set<string>();
  try {
    agents = new Set(
      readdirSync(join(cwd, 'scripts', 'prompts', harness))
        .filter((f) => f.endsWith('.txt'))
        .map((f) => f.slice(0, -4)),
    );
  } catch {
    /* script-only schedule */
  }

  const runner = await (opts.sessionRunnerFactory ?? defaultSessionRunner)(cwd);
  const states = new Map(schedule.jobs.map((job) => [job.name, { lastFire: 0, nextFireAt: 0, launchedAt: 0, consecutiveFastDeaths: 0, backoffUntil: 0 }]));
  const scheduledAgents = new Set(schedule.jobs.map((job) => job.agent).filter((agent): agent is string => !!agent));
  const idleSince = new Map<string, number>();
  let heartbeat = 0;

  while (!signal?.aborted) {
    heartbeat += 1;
    const now = Date.now();
    const sessions = await listSessionsBestEffort(cwd, runner);
    const activeSessions = sessions?.filter(active) ?? [];
    let activeCount = activeSessions.filter((session) => scheduledAgents.has(session.agent)).length;

    for (const job of schedule.jobs) {
      const state = states.get(job.name)!;
      const intervalMs = job.intervalSeconds * 1000;
      const matching = job.agent && sessions ? activeSessions.filter((session) => session.agent === job.agent) : [];
      const livenessUnknown = !!job.agent && sessions === null;
      const inFlight = livenessUnknown || matching.length > 0;

      if (state.launchedAt && !inFlight) {
        const lifetimeMs = now - state.launchedAt;
        state.launchedAt = 0;
        if (lifetimeMs < fastDeathMs) {
          state.consecutiveFastDeaths += 1;
          state.nextFireAt = now + job.retrySeconds * 1000;
          if (state.consecutiveFastDeaths >= 3) {
            state.backoffUntil = now + backoffMsFor(state.consecutiveFastDeaths, job.retrySeconds * 1000);
          }
        } else {
          state.consecutiveFastDeaths = 0;
          state.backoffUntil = 0;
        }
      }

      if (fenced(cwd, job) || inFlight || activeCount >= schedule.maxConcurrent) continue;
      if (now < state.backoffUntil || now < state.nextFireAt) continue;

      const env = buildTickEnv(schedule.env, ambient, 'cron');
      const result = proc(job.cmd, [], { shell: true, stdio: 'inherit', env });
      state.lastFire = now;
      recordFire(cwd, job.name, job.cmd);
      if (result.status !== 0 || result.error) {
        state.consecutiveFastDeaths += 1;
        state.nextFireAt = now + job.retrySeconds * 1000;
        if (state.consecutiveFastDeaths >= 3) {
          state.backoffUntil = now + backoffMsFor(state.consecutiveFastDeaths, job.retrySeconds * 1000);
        }
      } else if (job.agent) {
        state.nextFireAt = now + intervalMs;
        state.launchedAt = now;
        activeCount += 1;
      } else {
        state.consecutiveFastDeaths = 0;
        state.backoffUntil = 0;
        state.nextFireAt = now + intervalMs;
      }
    }

    if (runner) {
      try {
        const reaped = await runner.reapIdle({ idleMs: idleReapMs, agents, since: idleSince });
        for (const result of reaped) console.log(`[oa] reaped idle ${result.agent} (${result.id})`);
        await reconcilePendingEffects(cwd, runner, proc);
      } catch (error) {
        console.error('[oa] reap error:', (error as Error)?.message ?? error);
      }
    }

    opts.onHeartbeat?.(heartbeat);
    await sleep(pollMs, signal);
  }
}

// Effects are deliberately opaque to the scheduler: it runs the recorded command after the associated
// session disappears, without interpreting the effect, task, branch, or code host.
async function reconcilePendingEffects(cwd: string, runner: SessionRunner, proc: ProcRunner): Promise<void> {
  const effectsDir = join(cwd, '.open-autonomy', 'runner-state', 'effects');
  let files: string[] = [];
  try {
    files = readdirSync(effectsDir).filter((file) => file.endsWith('.json'));
  } catch {
    return;
  }
  let live: Set<string>;
  try {
    live = new Set((await runner.list()).map((session) => session.id));
  } catch {
    return;
  }
  for (const file of files) {
    const path = join(effectsDir, file);
    let marker: { id: string; agent: string; effect: string; worktree: string; env?: Record<string, string> };
    try {
      marker = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      try { unlinkSync(path); } catch { /* ignore */ }
      continue;
    }
    if (live.has(marker.id)) continue;
    console.log(`[oa] post-session effect: ${marker.agent} (${marker.id}) -> ${marker.effect} in ${marker.worktree}`);
    proc('bun', [marker.effect], { cwd: marker.worktree, stdio: 'inherit', env: { ...process.env, ...marker.env } });
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}

export { reconcilePendingEffects };
