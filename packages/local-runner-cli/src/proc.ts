// The default ProcRunner — a thin wrapper around node:child_process.spawnSync, matching run.mjs's
// original call shape exactly (status/stdout/stderr/error). Every verb takes a `proc` param defaulting to
// this, so tests can inject a stub (src/test-support/stub-proc.ts) instead of shelling out to a real
// `gh`/`ztrack`/`node`.
import { spawnSync } from 'node:child_process';
import type { ProcResult, ProcRunner } from './types.ts';

export const defaultProc: ProcRunner = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    shell: opts.shell,
    encoding: 'utf8',
    env: opts.env ?? process.env,
    stdio: opts.stdio,
  });
  const result: ProcResult = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  if (r.error) result.error = r.error;
  return result;
};

/** First non-empty line of a string, or a placeholder — matches run.mjs's `firstLine` used to keep error
 *  logs to one readable line instead of a raw multi-line stderr dump. */
export function firstLine(s: string | undefined): string {
  return (s || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '(no output)';
}

/** Prefer the thrown 'Error [ERR_*]: <msg>' line over an ERR_* token buried a few frames up in a code
 *  frame, else the first non-empty line — verbatim port of run.mjs's OA-04 probe helper. */
export function firstErrLine(s: string | undefined): string {
  const lines = (s || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /^Error\b/.test(l)) || lines.find((l) => /\bERR_[A-Z_]+/.test(l)) || lines[0] || 'no error output';
}
