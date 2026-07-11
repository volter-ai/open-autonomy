// Shared types for @volter/oa. Kept dependency-injectable throughout (a `proc`/`sessions` seam on every
// verb that shells out) so the test suite can stub `gh`/`ztrack`/the termfleet runner SDK without needing
// real binaries or a real termfleet provider on the box — see src/test-support/*.

/** The result shape every verb's process-spawning code depends on — a narrowed mirror of Node's
 *  child_process.spawnSync result, portable enough to fake in tests without child_process at all. */
export interface ProcResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/** The one process-spawning seam every verb goes through (gh/ztrack probes, launching a schedule
 *  command, resolving a specifier for the OA-04 collision probe). Default impl wraps
 *  node:child_process.spawnSync (src/proc.ts); tests inject a stub that recognizes specific
 *  argv shapes and returns canned output — see src/test-support/stub-proc.ts. */
export type ProcRunner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; shell?: boolean; encoding?: 'utf8'; env?: NodeJS.ProcessEnv; stdio?: 'inherit' },
) => ProcResult;

/** A live session as the termfleet-backed runner SDK reports it — the subset the reconciler/status/doctor
 *  verbs actually read. Mirrors the shape scripts/autonomy-runner.mjs's `list()` returns. */
export interface Session {
  id: string;
  agent: string;
  status: 'running' | 'paused' | 'awaiting-human' | string;
  [key: string]: unknown;
}

/** The runner SDK seam (scripts/autonomy-runner.mjs's TermfleetRunner, dynamically imported from the
 *  adopter repo's own installed copy at CWD-relative `scripts/autonomy-runner.mjs`). Tests inject a stub
 *  implementing this interface directly — no real termfleet provider, no real file on disk required. */
export interface SessionRunner {
  list(): Promise<Session[]>;
  reapIdle(opts: { idleMs: number; agents: Set<string>; since: Map<string, number> }): Promise<Array<{ agent: string; id: string }>>;
}

/** A single schedule line, normalized from either schedule.json shape (see src/config.ts). `cmd` is the
 *  literal shell command (unchanged from the legacy `scripts: string[]` entries) so `fireCommands` never
 *  has to special-case the two shapes once normalized. */
export interface NormalizedScript {
  cmd: string;
  /** min-gap floor in seconds for THIS script — the per-agent-cadence generalization U4 exists to add.
   *  Legacy schedule.json (one shared `intervalSeconds`) normalizes every script to that one value. */
  intervalSeconds: number;
  /** true => this script gets the S6/T6 state-gated/eligibility-driven reconciler treatment; false =>
   *  the old clock-gated min-gap-only cadence (self-throttling skills, e.g. a planner). */
  reconciled: boolean;
  /** which eligibility probe variant a reconciled script uses — 'ztrack' (S6: ztrack ready/in-progress
   *  issues + gh PR-concluded) or 'gh-issues' (T6: gh-issue ready/parked labels + gh PR-concluded, no
   *  in-progress leg). Only meaningful when reconciled === true; default 'ztrack'. */
  eligibility: 'ztrack' | 'gh-issues';
  /** the AUTONOMY_AGENT identity this script launches, parsed from `cmd` (or explicit in the object
   *  shape) — used by dispatch/status/doctor to key per-agent state and match `oa dispatch <agent>`. */
  agent: string | null;
}

export interface NormalizedSchedule {
  /** legacy top-level min-gap fallback (seconds) — used when a script/config didn't specify its own. */
  intervalSeconds: number;
  env: Record<string, string>;
  scripts: NormalizedScript[];
}

/** Raw schedule.json — accepts BOTH the legacy shape (scripts: string[]) and the new per-script object
 *  shape (scripts: [{cmd, intervalSeconds?, reconciled?, eligibility?, agent?}]). See src/config.ts. */
export interface RawScheduleScriptObject {
  cmd: string;
  intervalSeconds?: number;
  reconciled?: boolean;
  eligibility?: 'ztrack' | 'gh-issues';
  agent?: string;
}
export interface RawSchedule {
  intervalSeconds?: number;
  env?: Record<string, string>;
  scripts: Array<string | RawScheduleScriptObject>;
}
