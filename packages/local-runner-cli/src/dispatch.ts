// `oa dispatch <agent>` — the manual single dispatch. Fires exactly the one schedule line whose parsed
// AUTONOMY_AGENT identity (or explicit `agent` field) matches `agentName`, directly — bypassing the
// reconciler's state-gating/eligibility/backoff entirely (this is a human's explicit, one-off act, not a
// tick). It bypasses cadence only: the declared fence, environment/provider pin, singleton command, and
// finite concurrency cap remain controls on every path through the trigger executor. A deliberately
// fence-exempt setup probe uses the lower-level run-agent adapter explicitly; it is not disguised as an
// ordinary scheduled-job dispatch.
import type { ProcResult, ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { buildTickEnv } from './env.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { activeScheduledSessionCount } from './capacity.ts';
import { acceptControlGeneration } from './control-generation.ts';
import { resolvedFencePath } from './activation-paths.ts';

export interface DispatchResult {
  ok: boolean;
  matched: string | null;
  result?: ProcResult;
  reason?: string;
}

export function dispatch(agentName: string, opts: { cwd?: string; proc?: ProcRunner } = {}): DispatchResult {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const schedule = loadSchedule(cwd);
  let generation;
  try {
    generation = acceptControlGeneration(cwd, proc);
  } catch (error) {
    return { ok: false, matched: null, reason: (error as Error).message };
  }
  const job = schedule.jobs.find((candidate) => candidate.agent === agentName);
  if (!job) {
    return { ok: false, matched: null, reason: `[oa] dispatch: no scheduled job matches agent "${agentName}" (declared: ${schedule.jobs.map((candidate) => candidate.agent).filter(Boolean).join(', ') || 'none'})` };
  }
  if (job.fence && existsSync(resolvedFencePath(cwd, job.fence))) {
    return { ok: false, matched: job.cmd, reason: `[oa] dispatch: job "${job.name}" is fenced by ${job.fence}` };
  }
  const env = buildTickEnv(schedule.env, process.env, 'dispatch');
  if (generation) {
    env.AUTONOMY_CONTROL_ROOT = cwd;
    env.AUTONOMY_CONTROL_SHA = generation.sha;
  }
  if (job.agent && Number.isFinite(schedule.maxConcurrent)) {
    const active = activeScheduledSessionCount(cwd, schedule, env, proc);
    if (active === null) {
      return { ok: false, matched: job.cmd, reason: `[oa] dispatch: runner liveness is unavailable while maxConcurrent=${schedule.maxConcurrent} is enforced` };
    }
    if (active >= schedule.maxConcurrent) {
      return { ok: false, matched: job.cmd, reason: `[oa] dispatch: maxConcurrent=${schedule.maxConcurrent} is already reached` };
    }
  }
  console.error(`[oa] dispatch: firing ${agentName} -> ${job.cmd}`);
  // D2 (post-review, TC.3): tag this fire AUTONOMY_TRIGGER_KIND=dispatch — this is a human's explicit,
  // one-off act (this file's own header comment), never the reconciler's automatic heartbeat, even though
  // it fires the exact same schedule-line STRING (which may itself carry AUTONOMY_SINGLETON=1 baked in —
  // that alone is not a "this was automatic" signal; see env.ts's own doc comment on buildTickEnv).
  const result = proc(job.cmd, [], { cwd, shell: true, stdio: 'inherit', env });
  return { ok: result.status === 0 && !result.error, matched: job.cmd, result };
}
