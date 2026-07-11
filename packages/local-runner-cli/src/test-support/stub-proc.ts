// A scriptable ProcRunner stub: tests register handlers keyed by a predicate over (cmd, args) and get a
// canned ProcResult back — no real `gh`/`ztrack`/`git`/`node` subprocess is ever spawned. Every call is
// recorded so a test can assert on what WOULD have been shelled out, exactly (argv, cwd, env). This is
// the "stub gh/runner/agents" seam the build brief asks for.
import type { ProcResult, ProcRunner } from '../types';

export interface RecordedCall {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ProcHandler {
  match: (cmd: string, args: string[]) => boolean;
  respond: (cmd: string, args: string[], calls: RecordedCall[]) => ProcResult;
}

export function ok(stdout = ''): ProcResult {
  return { status: 0, stdout, stderr: '' };
}
export function fail(stderr = 'stub failure', status = 1): ProcResult {
  return { status, stdout: '', stderr };
}

export class StubProc {
  calls: RecordedCall[] = [];
  private handlers: ProcHandler[] = [];

  on(match: ProcHandler['match'], respond: ProcHandler['respond']): this {
    this.handlers.unshift({ match, respond }); // most-recently-registered wins (lets a test override a default)
    return this;
  }

  /** Convenience: match on an exact leading argv prefix (e.g. ['issue', 'list']). */
  onArgs(cmd: string, argsPrefix: string[], respond: ProcHandler['respond']): this {
    return this.on(
      (c, a) => c === cmd && argsPrefix.every((v, i) => a[i] === v),
      respond,
    );
  }

  runner: ProcRunner = (cmd, args, opts = {}) => {
    this.calls.push({ cmd, args, cwd: opts.cwd, env: opts.env });
    for (const h of this.handlers) {
      if (h.match(cmd, args)) return h.respond(cmd, args, this.calls);
    }
    return fail(`stub-proc: no handler registered for "${cmd} ${args.join(' ')}"`, 127);
  };
}
