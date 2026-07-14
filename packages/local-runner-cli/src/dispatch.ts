// `oa dispatch <agent>` — the manual single dispatch. Fires exactly the one schedule line whose parsed
// AUTONOMY_AGENT identity (or explicit `agent` field) matches `agentName`, directly — bypassing the
// reconciler's state-gating/eligibility/backoff entirely (this is a human's explicit, one-off act, not a
// tick). Deliberately does NOT check the pause marker: this is the documented workaround multiple
// installs already rely on (e.g. "First run is a manual dispatch... — required even while paused, the
// paused driver fires nothing, so this breaks the circularity" — the same shape `AUTONOMY_AGENT=<agent>
// node scripts/run-agent.mjs` already had before this CLI existed). Prints a note when paused so the
// operator knows they're intentionally overriding the fence, not being silently let through.
import type { ProcResult, ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { isPaused } from './pause.ts';
import { buildTickEnv } from './env.ts';

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
  const job = schedule.jobs.find((candidate) => candidate.agent === agentName);
  if (!job) {
    return { ok: false, matched: null, reason: `[oa] dispatch: no scheduled job matches agent "${agentName}" (declared: ${schedule.jobs.map((candidate) => candidate.agent).filter(Boolean).join(', ') || 'none'})` };
  }
  if (isPaused(cwd)) {
    console.error(`[oa] dispatch: install is PAUSED — dispatching "${agentName}" anyway (manual dispatch bypasses the fence by design; the reconciler will not pick up further work until unpaused).`);
  }
  console.error(`[oa] dispatch: firing ${agentName} -> ${job.cmd}`);
  // D2 (post-review, TC.3): tag this fire AUTONOMY_TRIGGER_KIND=dispatch — this is a human's explicit,
  // one-off act (this file's own header comment), never the reconciler's automatic heartbeat, even though
  // it fires the exact same schedule-line STRING (which may itself carry AUTONOMY_SINGLETON=1 baked in —
  // that alone is not a "this was automatic" signal; see env.ts's own doc comment on buildTickEnv).
  const result = proc(job.cmd, [], { shell: true, stdio: 'inherit', env: buildTickEnv(schedule.env, process.env, 'dispatch') });
  return { ok: result.status === 0 && !result.error, matched: job.cmd, result };
}
