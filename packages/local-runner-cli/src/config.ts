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

/** Identity-aware eligibility defaults — each maps to the variant its PROVEN fork actually shipped with:
 *  S6's `manager` ran against a ztrack board; T6's `pm` ran against GitHub issues. A legacy string[]
 *  schedule carried over from either install therefore probes the RIGHT board with zero config changes —
 *  a twin-shaped `AUTONOMY_AGENT=pm` line must never default to ztrack probes that fail loudly on every
 *  cycle (that repo has no ztrack board to ask). */
const DEFAULT_ELIGIBILITY_BY_AGENT: Record<string, 'ztrack' | 'gh-issues'> = {
  manager: 'ztrack', // S6 (supercode)
  pm: 'gh-issues', // T6 (twin)
};

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
 *  doctor) consumes, so they never have to know which shape the file was written in.
 *
 *  Validation (throws a loud config Error — a misconfigured reconciled script must fail at LOAD, not
 *  produce a reconciler whose in-flight filter silently never matches):
 *   - a reconciled script MUST have a resolvable agent identity (parsed AUTONOMY_AGENT or explicit
 *     `agent:` key) — without one the singleton check can never see its own sessions, so every launch
 *     would double-fire and read back as a false fast-death.
 *   - two reconciled scripts must not share one agent identity — their reconciler state (backoff/min-gap/
 *     last-fire/in-flight) is keyed by it and would silently collapse into one state machine.
 *   - a reconciled script whose agent is neither `manager` nor `pm` MUST declare `eligibility` explicitly
 *     — there is no proven default board-probe for an unrecognized identity, and guessing one means every
 *     probe fails loudly forever on an install that doesn't run that board. */
export function normalizeSchedule(raw: RawSchedule): NormalizedSchedule {
  const topIntervalSeconds = Number(raw.intervalSeconds ?? 900);
  const scripts: NormalizedScript[] = (raw.scripts ?? []).map((entry) => {
    const obj: RawScheduleScriptObject = typeof entry === 'string' ? { cmd: entry } : entry;
    const cmd = obj.cmd;
    const agent = obj.agent ?? agentOf(cmd);
    const reconciled = obj.reconciled ?? defaultIsReconciled(cmd);

    if (reconciled && !agent) {
      throw new Error(
        `[oa] schedule.json: reconciled script "${cmd}" has no resolvable agent identity — the reconciler's ` +
          'in-flight (singleton) check is keyed by agent, so an agent-less reconciled script would double-fire ' +
          'and register false fast-deaths. Fix: add an explicit `"agent": "<name>"` key to the script object, ' +
          'or put AUTONOMY_AGENT=<name> in the command line.',
      );
    }

    let eligibility = obj.eligibility;
    if (reconciled && !eligibility) {
      eligibility = agent ? DEFAULT_ELIGIBILITY_BY_AGENT[agent] : undefined;
      if (!eligibility) {
        throw new Error(
          `[oa] schedule.json: reconciled script for agent "${agent}" has no eligibility variant and no proven ` +
            'default exists for that identity (only `manager` → "ztrack" [S6] and `pm` → "gh-issues" [T6] carry ' +
            'defaults). Fix: add an explicit `"eligibility": "ztrack" | "gh-issues"` key to the script object.',
        );
      }
    }

    return {
      cmd,
      intervalSeconds: Number(obj.intervalSeconds ?? topIntervalSeconds),
      reconciled,
      eligibility: eligibility ?? 'ztrack', // non-reconciled scripts never read this field; keep the type total
      agent,
    };
  });

  // Two reconciled scripts sharing one agent identity would key into ONE reconciler state machine
  // (backoff/min-gap/last-fire silently collapse) — reject loudly instead.
  const seenReconciledAgents = new Set<string>();
  for (const s of scripts) {
    if (!s.reconciled || !s.agent) continue;
    if (seenReconciledAgents.has(s.agent)) {
      throw new Error(
        `[oa] schedule.json: two reconciled scripts declare the same agent "${s.agent}" — their reconciler state ` +
          '(backoff / min-gap / last-fire / in-flight) is keyed by agent identity and would collapse into one ' +
          'state machine. Fix: give each reconciled script a distinct agent, or make one of them non-reconciled.',
      );
    }
    seenReconciledAgents.add(s.agent);
  }

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
