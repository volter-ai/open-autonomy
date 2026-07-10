// schedule.json loading + normalization. Accepts BOTH shapes:
//   legacy: { intervalSeconds, env, scripts: string[] }              — one shared min-gap for every line.
//   new:    { intervalSeconds?, env, scripts: [{cmd, intervalSeconds?, reconciled?, eligibility?, agent?}] }
//            — per-script min-gap + explicit reconciled/eligibility/agent, closing the shared-interval
//            limitation the S6/T6 forks both inherited from run.mjs (U4's stated generalization).
// The repo keeps COMMITTING schedule.json (design contract) — this module only ever READS it from cwd.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedSchedule, NormalizedScript, RawSchedule, RawScheduleScriptObject } from './types.ts';

/** Same two regexes S6 (manager) and T6 (pm) proved, tried in order — the pre-U4 fork behavior, kept as
 *  the DEFAULT reconciled-agent detector when a script doesn't explicitly declare `reconciled`. A script
 *  matching neither gets the old clock-gated (non-reconciled) treatment, exactly like every non-manager/
 *  non-pm schedule line already does today. */
const DEFAULT_RECONCILED_AGENT_RES: RegExp[] = [/(?:^|\s)AUTONOMY_AGENT=manager(?:\s|$)/, /(?:^|\s)AUTONOMY_AGENT=pm(?:\s|$)/];

/** Parse the AUTONOMY_AGENT=<role> identity out of a schedule command line, if present — used both for
 *  default reconciled-detection and for keying per-agent reconciler/backoff/last-fire state and matching
 *  `oa dispatch <agent>`. */
export function agentOf(cmd: string): string | null {
  const m = cmd.match(/(?:^|\s)AUTONOMY_AGENT=(\S+)/);
  return m ? m[1]! : null;
}

function defaultIsReconciled(cmd: string): boolean {
  return DEFAULT_RECONCILED_AGENT_RES.some((re) => re.test(cmd));
}

/** Normalize a raw schedule.json object (either shape) into one script-line list, each carrying its own
 *  resolved min-gap/reconciled/eligibility/agent — the shape every other verb (reconciler/once/dispatch/
 *  doctor) consumes, so they never have to know which shape the file was written in. */
export function normalizeSchedule(raw: RawSchedule): NormalizedSchedule {
  const topIntervalSeconds = Number(raw.intervalSeconds ?? 900);
  const scripts: NormalizedScript[] = (raw.scripts ?? []).map((entry) => {
    const obj: RawScheduleScriptObject = typeof entry === 'string' ? { cmd: entry } : entry;
    const cmd = obj.cmd;
    const agent = obj.agent ?? agentOf(cmd);
    const reconciled = obj.reconciled ?? defaultIsReconciled(cmd);
    return {
      cmd,
      intervalSeconds: Number(obj.intervalSeconds ?? topIntervalSeconds),
      reconciled,
      eligibility: obj.eligibility ?? 'ztrack',
      agent,
    };
  });
  return { intervalSeconds: topIntervalSeconds, env: raw.env ?? {}, scripts };
}

/** Read + parse schedule.json from `path` (default `<cwd>/scheduler/schedule.json`, overridable via
 *  AUTONOMY_SCHEDULE — matching run.mjs's own env var, unchanged). Throws with the raw JSON.parse error
 *  message on a malformed file — doctor.ts wraps this to report a parse failure instead of crashing. */
export function loadSchedule(cwd: string = process.cwd(), path?: string): NormalizedSchedule {
  const schedulePath = path ?? process.env.AUTONOMY_SCHEDULE ?? join(cwd, 'scheduler', 'schedule.json');
  const raw = JSON.parse(readFileSync(schedulePath, 'utf8')) as RawSchedule;
  return normalizeSchedule(raw);
}

export function reconciledScripts(schedule: NormalizedSchedule): NormalizedScript[] {
  return schedule.scripts.filter((s) => s.reconciled);
}
export function otherScripts(schedule: NormalizedSchedule): NormalizedScript[] {
  return schedule.scripts.filter((s) => !s.reconciled);
}
