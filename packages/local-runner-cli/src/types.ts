// Shared types for @volter/oa. Kept dependency-injectable throughout (a `proc`/`sessions` seam on every
// verb that shells out) so the test suite can stub external CLIs and the session-runner SDK without
// needing real binaries or a real provider on the box — see src/test-support/*.

/** The result shape every verb's process-spawning code depends on — a narrowed mirror of Node's
 *  child_process.spawnSync result, portable enough to fake in tests without child_process at all. */
export interface ProcResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/** The one process-spawning seam every verb goes through (diagnostic probes, launching a schedule
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

/** One substrate job. Domain services decide whether useful work exists after the job launches. */
export interface NormalizedJob {
  name: string;
  cmd: string;
  intervalSeconds: number;
  retrySeconds: number;
  fence?: string;
  workspace?: 'shared' | 'isolated';
  agent: string | null;
}

export interface NormalizedSchedule {
  /** legacy top-level min-gap fallback (seconds) — used when a script/config didn't specify its own. */
  intervalSeconds: number;
  env: Record<string, string>;
  jobs: NormalizedJob[];
  /** @deprecated Use `jobs`. Kept as a read-only migration alias for existing consumers. */
  scripts: NormalizedJob[];
  maxConcurrent: number;
}

/** @deprecated Use `NormalizedJob`. */
export type NormalizedScript = NormalizedJob;

/** Raw schedule.json — accepts both legacy `scripts` and generic `jobs`. Legacy objects may carry
 *  command, cadence, retry, fence, and agent identity only; scheduler policy is never inferred. */
export interface RawScheduleScriptObject {
  cmd: string;
  intervalSeconds?: number;
  retrySeconds?: number;
  fence?: string;
  workspace?: 'shared' | 'isolated';
  agent?: string;
}
export interface RawScheduleJob {
  name: string;
  command: string;
  intervalSeconds?: number;
  retrySeconds?: number;
  fence?: string;
  workspace?: 'shared' | 'isolated';
  agent?: string;
}
export interface RawSchedule {
  intervalSeconds?: number;
  env?: Record<string, string>;
  scripts?: Array<string | RawScheduleScriptObject>;
  jobs?: RawScheduleJob[];
  maxConcurrent?: number;
}
