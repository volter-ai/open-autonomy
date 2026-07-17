// Generic local substrate loop. It realizes cadence, fences, concurrency, retries, session singleton,
// reaping, and opaque completion effects. It does not query tasks, PRs, or role-specific state.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { NormalizedJob, ProcRunner, Session, SessionRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { buildTickEnv } from './env.ts';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';
import { recordFire } from './status.ts';
import { runPreflight } from './preflight.ts';
import { verifyControlGeneration, verifyControlPaths } from './control-generation.ts';
import { resolvedFencePath } from './activation-paths.ts';

const FAST_DEATH_MS = 60_000;
const BACKOFF_CAP_MS = 30 * 60 * 1000;

interface JobState {
  lastFire: number;
  nextFireAt: number;
  launchedAt: number;
  consecutiveFastDeaths: number;
  backoffUntil: number;
}

interface DurableScheduleState {
  schema: 'open-autonomy.local-schedule-state.v1';
  jobs: Record<string, { attemptedAtMs: number; status: number; error?: string }>;
}

function scheduleStatePath(cwd: string): string {
  return join(cwd, '.open-autonomy', 'runner-state', 'schedule-state.json');
}

function loadDurableState(cwd: string): DurableScheduleState {
  const empty: DurableScheduleState = { schema: 'open-autonomy.local-schedule-state.v1', jobs: {} };
  try {
    const loaded = JSON.parse(readFileSync(scheduleStatePath(cwd), 'utf8')) as DurableScheduleState;
    return loaded?.schema === empty.schema && loaded.jobs && typeof loaded.jobs === 'object' ? loaded : empty;
  } catch {
    return empty;
  }
}

function saveDurableState(cwd: string, state: DurableScheduleState): void {
  const path = scheduleStatePath(cwd);
  mkdirSync(join(cwd, '.open-autonomy', 'runner-state'), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, path);
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
  /** Atomic-activation supervisor hook. False drains this generation: no new fires, while reaping and
   * completion effects continue. Ordinary callers omit it and retain the historical behavior. */
  canFire?: () => boolean;
  stopWhenDrained?: boolean;
  generationSha?: string;
}

const active = (session: Session): boolean => session.status === 'running' || session.status === 'paused' || session.status === 'awaiting-human';
const fenced = (cwd: string, job: NormalizedJob, env: NodeJS.ProcessEnv): boolean =>
  !!job.fence && existsSync(resolvedFencePath(cwd, job.fence, env));

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
  const durableState = loadDurableState(cwd);
  const states = new Map(schedule.jobs.map((job) => {
    const prior = durableState.jobs[job.name];
    const attemptedAtMs = Number(prior?.attemptedAtMs);
    const hasPrior = Number.isFinite(attemptedAtMs) && attemptedAtMs > 0 && Number.isFinite(Number(prior?.status));
    const delayMs = Number(prior?.status) === 0 ? job.intervalSeconds * 1000 : job.retrySeconds * 1000;
    return [job.name, {
      lastFire: hasPrior ? attemptedAtMs : 0,
      nextFireAt: hasPrior ? attemptedAtMs + delayMs : 0,
      launchedAt: hasPrior && prior!.status === 0 && !!job.agent ? attemptedAtMs : 0,
      consecutiveFastDeaths: 0,
      backoffUntil: 0,
    } satisfies JobState];
  }));
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
          durableState.jobs[job.name] = { attemptedAtMs: now, status: 1, error: `session ended after ${lifetimeMs}ms` };
          saveDurableState(cwd, durableState);
          if (state.consecutiveFastDeaths >= 3) {
            state.backoffUntil = now + backoffMsFor(state.consecutiveFastDeaths, job.retrySeconds * 1000);
          }
        } else {
          state.consecutiveFastDeaths = 0;
          state.backoffUntil = 0;
        }
      }

      if (opts.canFire && !opts.canFire()) continue;
      if (fenced(cwd, job, ambient) || inFlight || (!!job.agent && activeCount >= schedule.maxConcurrent)) continue;
      if (now < state.backoffUntil || now < state.nextFireAt) continue;

      const env = buildTickEnv(schedule.env, ambient, 'cron');
      const result = proc(job.cmd, [], { cwd, shell: true, stdio: 'inherit', env });
      state.lastFire = now;
      recordFire(cwd, job.name, job.cmd);
      durableState.jobs[job.name] = {
        attemptedAtMs: now,
        status: result.status ?? 1,
        ...(result.error ? { error: result.error.message } : {}),
      };
      saveDurableState(cwd, durableState);
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
        markWorkspaceLeasesObserved(cwd, reaped.map((result) => result.id));
        await reconcilePendingEffects(cwd, runner, proc);
        await reconcileWorkspaceLeases(cwd, runner, proc);
      } catch (error) {
        console.error('[oa] reap error:', (error as Error)?.message ?? error);
      }
    }

    opts.onHeartbeat?.(heartbeat);
    if (opts.stopWhenDrained && opts.canFire && !opts.canFire()) {
      const belongsToGeneration = activeSessions.some((session) => {
        const sha = typeof session.controlSha === 'string' ? session.controlSha : '';
        return sha ? sha === opts.generationSha : scheduledAgents.has(session.agent);
      });
      if (!belongsToGeneration && !hasPendingGenerationState(cwd)) return;
    }
    await sleep(pollMs, signal);
  }
}

function hasPendingGenerationState(cwd: string): boolean {
  for (const name of ['effects', 'workspaces']) {
    try {
      if (readdirSync(join(cwd, '.open-autonomy', 'runner-state', name)).some((file) => file.endsWith('.json'))) return true;
    } catch { /* absent means empty */ }
  }
  return false;
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
    let marker: {
      schema?: string;
      id: string;
      agent: string;
      effect: string;
      worktree: string;
      env?: Record<string, string>;
      controlRoot?: string;
      controlSha?: string;
    };
    try {
      marker = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      parkLegacyEffect(cwd, path, file, 'marker is not valid JSON');
      continue;
    }
    if (live.has(marker.id)) continue;
    // The provider may have returned the terminal ID before list() exposes it. A co-located fresh lease
    // distinguishes that bootstrap gap from a completed session; old markers without leases retain the
    // historical immediate-reconciliation behavior.
    try {
      const lease = JSON.parse(readFileSync(join(cwd, '.open-autonomy', 'runner-state', 'workspaces', file), 'utf8')) as WorkspaceLease;
      const createdAt = Date.parse(lease.createdAt);
      if (!lease.observedLiveAt && Number.isFinite(createdAt) && Date.now() - createdAt < workspaceLeaseBootstrapGraceMs()) continue;
    } catch {
      /* no readable lease: preserve backward-compatible effect reconciliation */
    }
    if (
      marker.schema !== 'open-autonomy.effect-marker.v2' ||
      !marker.controlRoot ||
      !marker.controlSha
    ) {
      parkLegacyEffect(cwd, path, file, 'marker predates accepted control generations');
      continue;
    }
    let root = '';
    let activeRoot = '';
    try {
      root = realpathSync(resolve(marker.controlRoot));
      activeRoot = realpathSync(resolve(cwd));
    } catch { /* invalid root stays empty and fails closed below */ }
    if (!root || root !== activeRoot) {
      console.error(`[oa] effect ${file} names control root ${root}, not active root ${resolve(cwd)}; retaining marker`);
      continue;
    }
    try {
      verifyControlGeneration(cwd, marker.controlSha, proc);
      verifyControlPaths(cwd, marker.controlSha, [
        marker.effect,
        'scripts/runner.ts',
        '.open-autonomy/autonomy.json',
        '.open-autonomy/autonomy.yml',
      ], proc);
    } catch (error) {
      console.error(`[oa] effect ${file} refused: ${(error as Error).message}; retaining marker`);
      continue;
    }
    const effect = resolve(root, marker.effect);
    if (effect !== root && !effect.startsWith(root + sep)) {
      console.error(`[oa] effect ${file} escapes the accepted control root; retaining marker`);
      continue;
    }
    console.log(`[oa] post-session effect: ${marker.agent} (${marker.id}) [control ${marker.controlSha.slice(0, 12)}] -> ${effect} in ${marker.worktree}`);
    const result = proc('bun', [effect], {
      cwd: marker.worktree,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...marker.env,
        AUTONOMY_CONTROL_ROOT: root,
        AUTONOMY_CONTROL_SHA: marker.controlSha,
        AUTONOMY_TRUSTED_RUNNER: join(root, 'scripts', 'runner.ts'),
      },
    });
    if (result.status === 0 && !result.error) {
      try { unlinkSync(path); } catch { /* ignore */ }
    } else {
      console.error(`[oa] post-session effect failed; retaining ${file} for retry: ${result.error?.message ?? `exit ${result.status ?? 'unknown'}`}`);
    }
  }
}

function parkLegacyEffect(cwd: string, path: string, file: string, reason: string): void {
  const quarantine = join(cwd, '.open-autonomy', 'runner-state', 'effect-quarantine');
  mkdirSync(quarantine, { recursive: true });
  const parked = join(quarantine, file);
  try { renameSync(path, parked); } catch { return; }
  const command = `oa recover-effect ${parked} --control-sha <accepted-sha>`;
  writeFileSync(`${parked}.recovery.txt`, `${reason}.\nInspect the marker, then recover explicitly:\n${command}\n`);
  console.error(`[oa] parked effect ${file}: ${reason}. Inspect it, then run: ${command}`);
}

export { reconcilePendingEffects };

interface WorkspaceLease {
  schema: 'open-autonomy.workspace-lease.v1';
  id: string;
  agent: string;
  branch: string;
  worktree: string;
  createdAt: string;
  observedLiveAt?: string;
}

const DEFAULT_WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS = 120_000;

function workspaceLeaseBootstrapGraceMs(): number {
  const configured = Number(process.env.AUTONOMY_WORKSPACE_LEASE_GRACE_MS ?? DEFAULT_WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS;
}

/** Reaping is itself authoritative observation: persist it so a just-reaped session does not wait out the
 * bootstrap grace before its effect and workspace can reconcile. */
function markWorkspaceLeasesObserved(cwd: string, ids: string[]): void {
  if (!ids.length) return;
  const wanted = new Set(ids);
  const dir = join(cwd, '.open-autonomy', 'runner-state', 'workspaces');
  let files: string[] = [];
  try { files = readdirSync(dir).filter((file) => file.endsWith('.json')); } catch { return; }
  const observedLiveAt = new Date().toISOString();
  for (const file of files) {
    const path = join(dir, file);
    try {
      const lease = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceLease;
      if (!wanted.has(lease.id) || lease.observedLiveAt) continue;
      writeFileSync(path, `${JSON.stringify({ ...lease, observedLiveAt }, null, 2)}\n`);
    } catch { /* workspace reconciliation owns malformed-lease handling */ }
  }
}

export { markWorkspaceLeasesObserved };

/** Reclaim runner-owned isolated workspaces after their session and any completion effect finish.
 * Clean worktrees are removed immediately. Dirty or unreadable worktrees are moved to a quarantine
 * receipt exactly once so operator evidence is retained without an infinite cleanup retry loop. */
export async function reconcileWorkspaceLeases(
  cwd: string,
  runner: SessionRunner,
  proc: ProcRunner = defaultProc,
): Promise<void> {
  const leasesDir = join(cwd, '.open-autonomy', 'runner-state', 'workspaces');
  const effectsDir = join(cwd, '.open-autonomy', 'runner-state', 'effects');
  const quarantineDir = join(cwd, '.open-autonomy', 'runner-state', 'workspace-quarantine');
  let files: string[] = [];
  try {
    files = readdirSync(leasesDir).filter((file) => file.endsWith('.json'));
  } catch {
    return;
  }
  let live: Set<string>;
  try {
    live = new Set((await runner.list()).map((session) => session.id));
  } catch {
    return;
  }
  const records: Array<{ file: string; path: string; lease: WorkspaceLease }> = [];
  for (const file of files) {
    const path = join(leasesDir, file);
    let lease: WorkspaceLease;
    try {
      lease = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceLease;
      if (lease.schema !== 'open-autonomy.workspace-lease.v1' || !lease.id || !lease.branch || !lease.worktree)
        throw new Error('invalid workspace lease');
    } catch {
      mkdirSync(quarantineDir, { recursive: true });
      try { renameSync(path, join(quarantineDir, file)); } catch { /* leave it for inspection */ }
      continue;
    }
    records.push({ file, path, lease });
  }
  const handled = new Set<string>();
  for (const record of records) {
    const { lease } = record;
    if (handled.has(lease.worktree)) continue;
    handled.add(lease.worktree);
    const peers = records.filter((candidate) => candidate.lease.worktree === lease.worktree);
    const livePeers = peers.filter((peer) => live.has(peer.lease.id));
    for (const peer of livePeers) {
      if (peer.lease.observedLiveAt) continue;
      peer.lease.observedLiveAt = new Date().toISOString();
      try { writeFileSync(peer.path, `${JSON.stringify(peer.lease, null, 2)}\n`); } catch { /* retry next heartbeat */ }
    }
    if (livePeers.length || peers.some((peer) => existsSync(join(effectsDir, peer.file)))) continue;
    const now = Date.now();
    const graceMs = workspaceLeaseBootstrapGraceMs();
    const bootstrapping = peers.some((peer) => {
      if (peer.lease.observedLiveAt) return false;
      const createdAt = Date.parse(peer.lease.createdAt);
      return Number.isFinite(createdAt) && now - createdAt < graceMs;
    });
    if (bootstrapping) continue;
    if (!existsSync(lease.worktree)) {
      for (const peer of peers) try { unlinkSync(peer.path); } catch { /* retry later */ }
      continue;
    }
    const status = proc('git', ['status', '--porcelain'], { cwd: lease.worktree });
    if (status.status !== 0 || status.error || status.stdout.trim()) {
      mkdirSync(quarantineDir, { recursive: true });
      for (const peer of peers) {
        const receipt = {
          ...peer.lease,
          quarantinedAt: new Date().toISOString(),
          reason: status.status !== 0 || status.error ? 'git status failed' : 'worktree has uncommitted changes',
        };
        writeFileSync(join(quarantineDir, peer.file), `${JSON.stringify(receipt, null, 2)}\n`);
        try { unlinkSync(peer.path); } catch { /* quarantine receipt is already durable */ }
      }
      console.error(`[oa] retained dirty workspace for ${lease.agent} (${lease.id}): ${lease.worktree}`);
      continue;
    }
    const removed = proc('git', ['worktree', 'remove', lease.worktree], { cwd });
    if (removed.status !== 0 || removed.error) {
      console.error(`[oa] workspace cleanup failed for ${lease.agent} (${lease.id}); retaining lease`);
      continue;
    }
    proc('git', ['branch', '-D', lease.branch], { cwd });
    for (const peer of peers) try { unlinkSync(peer.path); } catch { /* cleanup already succeeded */ }
    console.log(`[oa] cleaned workspace for ${lease.agent} (${lease.id})`);
  }
}
