// Continuous mode (`oa start`) — the S6/T6 reconciler, ported verbatim in spirit + generalized to
// PER-SCRIPT state (U4's per-agent-cadence closure of the shared-interval limitation both forks
// inherited: S6/T6 tracked exactly one reconciled script — `manager`/`pm` — sharing one lastFire/backoff/
// launchedAt; here every reconciled script gets its OWN independent {lastFire, backoff, launchedAt,
// consecutiveFastDeaths} keyed by its parsed AUTONOMY_AGENT identity, so a future second reconciled agent
// (a planner, per the study's II.6.1 note) doesn't have to share cadence/backoff with the first).
//
// A fast heartbeat (~20s, POLL_MS) that RECONCILES desired state — "a reconciled agent is running
// whenever !paused && work is eligible" — instead of clock-firing. Each script's own `intervalSeconds`
// (schedule.json) is a MIN-GAP FLOOR: a safety rail against back-to-back fires, never what decides when
// it runs. Unreconciled scripts keep the OLD clock-gated cadence, now also per-script instead of shared.
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedSchedule, NormalizedScript, ProcRunner, Session, SessionRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule, otherScripts as otherScriptsOf, reconciledScripts as reconciledScriptsOf } from './config.ts';
import { isPaused, pausedMessage } from './pause.ts';
import { buildTickEnv } from './env.ts';
import { type EligibilityVariant, makeEligibilityCheck } from './eligibility.ts';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';
import { recordFire } from './status.ts';
import { runPreflight } from './preflight.ts';

const FAST_DEATH_MS = 60_000; // "ended within 60s of launch" (II.6.1 change 3, verbatim)
const BACKOFF_CAP_MS = 30 * 60 * 1000; // cap 30 min (verbatim)

interface ReconcilerState {
  lastFire: number;
  launchedAt: number;
  consecutiveFastDeaths: number;
  backoffUntil: number;
  eligible: () => boolean;
}

/** 2x per consecutive fast-death (verbatim), engaging once the 3rd consecutive fast death is observed
 *  (n=3 → 2x, n=4 → 4x, n=5 → 8x, …, capped at 30 min). Base unit is the script's OWN min-gap floor so
 *  the safety scales with whatever cadence is configured. Exported for direct unit-testing of the
 *  escalation curve (driving 4+ real fast-death cycles through the heartbeat would be slow and flaky). */
export function backoffMsFor(n: number, intervalMs: number): number {
  if (n < 3) return 0;
  return Math.min(intervalMs * 2 ** (n - 2), BACKOFF_CAP_MS);
}

function keyOf(script: NormalizedScript, index: number): string {
  return script.agent ?? `#${index}`;
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
  /** the env object OA-09's AUTONOMY_PROVIDER_URL_SOURCE export is written into and every tick env is
   *  built from (default process.env). Tests inject their own to observe the export. */
  ambient?: NodeJS.ProcessEnv;
  /** OA-09 auto-discovery hook forwarded to the preflight (see preflight.ts). */
  resolveDefault?: () => Promise<{ baseUrl: string; source: string }>;
  /** test hook — the fast-death threshold (default 60s, run.mjs verbatim). Only tests shrink this: the
   *  healthy-lifetime reset path is otherwise untestable without a real 60s session. */
  fastDeathMs?: number;
  /** test hook — called once per heartbeat after all work is done for that iteration. */
  onHeartbeat?: (n: number) => void;
}

export async function start(opts: StartOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.ambient ?? process.env;
  const signal = opts.signal;
  const pollMs = Math.max(1000, opts.pollMs ?? Number(process.env.AUTONOMY_REAP_POLL_MS ?? 20000));
  const idleReapMs = opts.idleReapMs ?? Number(process.env.AUTONOMY_IDLE_REAP_MS ?? 60000);
  const fastDeathMs = opts.fastDeathMs ?? FAST_DEATH_MS;

  const schedule: NormalizedSchedule = loadSchedule(cwd);
  const reconciled = reconciledScriptsOf(schedule);
  const others = otherScriptsOf(schedule);

  // The full run.mjs guard chain (termfleet-installed / OA-04 collision probe / OA-09 provider-origin
  // log + AUTONOMY_PROVIDER_URL_SOURCE export / OA-03 uncommitted-harness) — run BEFORE the heartbeat
  // loop, exactly like run.mjs ran it top-level before both modes. Shared with `oa once` via runPreflight
  // so the two modes can never drift apart on what they refuse.
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
    /* no prompts dir — script-only schedule */
  }

  const sessionRunnerFactory = opts.sessionRunnerFactory ?? defaultSessionRunner;
  const runner = await sessionRunnerFactory(cwd);

  const states = new Map<string, ReconcilerState>();
  reconciled.forEach((script, i) => {
    states.set(keyOf(script, i), {
      lastFire: 0,
      launchedAt: 0,
      consecutiveFastDeaths: 0,
      backoffUntil: 0,
      eligible: makeEligibilityCheck(cwd, script.eligibility as EligibilityVariant, proc),
    });
  });
  const otherLastFire = new Map<string, number>(others.map((s, i) => [keyOf(s, i), 0]));
  const idleSince = new Map<string, number>();
  let paused = false;

  let heartbeat = 0;
  while (!signal?.aborted) {
    heartbeat += 1;
    const now = Date.now();
    const nowPaused = isPaused(cwd);
    if (nowPaused !== paused) {
      console.error(nowPaused ? pausedMessage(cwd) : '[oa] unpaused — resuming ticks.');
      paused = nowPaused;
    }

    // ---- reconciler: one independent state machine per reconciled script (II.6.1: state-gated fire) ----
    for (const [i, script] of reconciled.entries()) {
      const key = keyOf(script, i);
      const st = states.get(key)!;
      const intervalMs = script.intervalSeconds * 1000;
      const sessions: Session[] | null = await listSessionsBestEffort(cwd, runner);
      const label = script.agent ?? key;
      const matching = sessions === null ? null : sessions.filter((s) => s.agent === script.agent && (s.status === 'running' || s.status === 'paused'));
      const inFlight = matching === null ? true : matching.length > 0;
      if (matching === null) console.error(`[oa] ${label}: session probe unavailable — assuming in flight (fail closed, never stack)`);

      if (st.launchedAt && !inFlight) {
        const lifetimeMs = now - st.launchedAt;
        st.launchedAt = 0;
        if (lifetimeMs < fastDeathMs) {
          st.consecutiveFastDeaths += 1;
          console.error(`[oa] ${label}: session ended after ${lifetimeMs}ms (< ${fastDeathMs}ms) — consecutive fast-deaths now ${st.consecutiveFastDeaths}`);
          if (st.consecutiveFastDeaths >= 3) {
            st.backoffUntil = now + backoffMsFor(st.consecutiveFastDeaths, intervalMs);
            console.error(`[oa] ${label}: CRASH-LOOP BACKOFF engaged (${st.consecutiveFastDeaths} consecutive fast deaths) — next attempt not before ${new Date(st.backoffUntil).toISOString()}`);
          }
        } else {
          if (st.consecutiveFastDeaths) console.error(`[oa] ${label}: session ran ${lifetimeMs}ms (healthy) — crash-loop count reset from ${st.consecutiveFastDeaths}`);
          st.consecutiveFastDeaths = 0;
          st.backoffUntil = 0;
        }
      }

      if (paused) {
        // drain-not-kill: an in-flight wave is left alone; death bookkeeping above still runs. No NEW
        // fire is ever considered while paused.
      } else if (inFlight) {
        // a wave is already running this heartbeat — nothing to decide, the singleton holds.
      } else if (now < st.backoffUntil) {
        console.error(`[oa] ${label}: backing off (${Math.ceil((st.backoffUntil - now) / 1000)}s remaining, ${st.consecutiveFastDeaths} consecutive fast deaths)`);
      } else if (now - st.lastFire < intervalMs) {
        // inside the min-gap floor — no log (would spam every heartbeat).
      } else if (st.eligible()) {
        console.error(`[oa] ${label}: firing (eligible, min-gap elapsed, not in flight, no backoff)`);
        const env = buildTickEnv(schedule.env, ambient, 'cron'); // D2: this heartbeat is the automatic fire
        const result = proc(script.cmd, [], { shell: true, stdio: 'inherit', env });
        // Last ACTUAL fire — deliberately NOT advanced while paused/in-flight/backed-off/ineligible, so
        // that unpausing (or backoff/eligibility clearing) lets it fire on the very NEXT heartbeat rather
        // than waiting out a stale interval: the "bounded resurrection latency" II.6.3 promises.
        st.lastFire = now;
        recordFire(cwd, label, script.cmd);
        if (result.status !== 0 || result.error) {
          st.consecutiveFastDeaths += 1;
          console.error(`[oa] ${label}: launch FAILED synchronously — consecutive fast-deaths now ${st.consecutiveFastDeaths}`);
          if (st.consecutiveFastDeaths >= 3) {
            st.backoffUntil = now + backoffMsFor(st.consecutiveFastDeaths, intervalMs);
            console.error(`[oa] ${label}: CRASH-LOOP BACKOFF engaged (${st.consecutiveFastDeaths} consecutive fast deaths) — next attempt not before ${new Date(st.backoffUntil).toISOString()}`);
          }
          st.launchedAt = 0;
        } else {
          st.launchedAt = now;
        }
      }
      // else: eligible() returned false — it already logged every probe it ran plus the overall verdict.
    }

    // ---- non-reconciled script lines: unchanged clock-gated cadence, now per-script (self-throttling
    // skills, e.g. a planner) — no state-gating, only each script's own min-gap floor. ----
    for (const [i, script] of others.entries()) {
      const key = keyOf(script, i);
      const last = otherLastFire.get(key) ?? 0;
      const intervalMs = script.intervalSeconds * 1000;
      if (now - last >= intervalMs) {
        if (!paused) proc(script.cmd, [], { shell: true, stdio: 'inherit', env: buildTickEnv(schedule.env, ambient, 'cron') }); // D2: automatic per-script fire
        otherLastFire.set(key, now); // advances even while paused — matches pre-U4 behavior
      }
    }

    if (runner) {
      try {
        const reaped = await runner.reapIdle({ idleMs: idleReapMs, agents, since: idleSince });
        for (const r of reaped) console.log(`[oa] reaped idle ${r.agent} (${r.id})`);
        await reconcilePendingEffects(cwd, runner, proc);
      } catch (e) {
        console.error('[oa] reap error:', (e as Error)?.message ?? e);
      }
    }

    opts.onHeartbeat?.(heartbeat);
    await sleep(pollMs, signal);
  }
}

// Post-session effects: the local mirror of github's post-skill job step. When a session recorded by
// runner.ts's launch seam is GONE from the runner's live list (finished + reaped), run its recorded
// effect in its worktree and retire the marker. Crash-safe: a marker outlives a missed reap and is
// reconciled on a later tick.
async function reconcilePendingEffects(cwd: string, runner: SessionRunner, proc: ProcRunner): Promise<void> {
  const effectsDir = join(cwd, '.open-autonomy', 'runner-state', 'effects');
  let files: string[] = [];
  try {
    files = readdirSync(effectsDir).filter((f) => f.endsWith('.json'));
  } catch {
    return; // no markers dir yet
  }
  if (!files.length) return;
  let live: Set<string>;
  try {
    live = new Set((await runner.list()).map((s) => s.id));
  } catch {
    return; // liveness unknown -> wait a tick
  }
  for (const file of files) {
    const path = join(effectsDir, file);
    let marker: { id: string; agent: string; effect: string; worktree: string; env?: Record<string, string> };
    try {
      marker = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (live.has(marker.id)) continue; // session still running -> its effect runs after it finishes
    console.log(`[oa] post-session effect: ${marker.agent} (${marker.id}) -> ${marker.effect} in ${marker.worktree}`);
    proc('bun', [marker.effect], { cwd: marker.worktree, stdio: 'inherit', env: { ...process.env, ...marker.env } });
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

export { reconcilePendingEffects };
