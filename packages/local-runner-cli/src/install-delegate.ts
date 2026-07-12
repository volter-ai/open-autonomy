// TE.8 — `oa install` delegate. Spawns (never imports) the monorepo's own `bin/install.ts` orchestrator —
// the ONE real, unifying entrypoint that chains all seven install phases (TE.1-TE.7) into one command.
//
// WHY SUBPROCESS, NEVER A DIRECT IMPORT (repeat of oa.ts's own header rule, applied to this one verb): this
// package (`@volter/oa`) ships with a minimal, deliberately portable dependency footprint and `oa.ts` must
// stay plain, unbundled Node so it runs with nothing but the Node runtime itself (see oa.ts's own header).
// `bin/install.ts` (like every TE.1-TE.7 sibling it chains) takes RUNTIME imports of `@open-autonomy/core`
// that only resolve under `bun`'s extension-free internal module resolution — importing it directly from
// here would pull that whole monorepo-only dependency graph into this package, exactly the "core imports
// broke local-runner-cli's portability" mistake TA.3's builder already hit and documented (see
// bin/install-detect.ts's own "HOME rationale" header for the identical reasoning applied to every TE.*
// file). Spawning `bun` as a separate process keeps the two packages' dependency graphs fully isolated, at
// the cost of requiring `bun` on PATH for this one verb only — every other `oa` verb stays pure Node.
//
// WHY THIS IS HONEST, NOT A GAP: `bin/install.ts` is dev-time-only monorepo tooling — like every TE.1-TE.7
// sibling, it is NEVER part of the published `dist/cli.js` bundle (see bin/install-execute.ts's own header:
// "never part of the published dist/cli.js bundle"; verified against scripts/bundle-data-files.ts, which
// lists no TE.* file). So a real, standalone-vendored `@volter/oa` install (outside this monorepo) genuinely
// has nowhere to delegate to — `resolveInstallScript` returns undefined in that case, and this module says
// so plainly rather than pretending. Per T0.1's frozen decision (both `open-autonomy` 0.4.2's `@volter/oa`
// coverage and `@volter/oa` itself remain unpublished), the SOURCE CHECKOUT is the canonical path today —
// `oa install` only works when run from within (or vendored alongside a live copy of) volter-ai/open-autonomy.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { ProcResult } from './types.ts';

export type SpawnFn = (cmd: string, args: string[], opts: { cwd?: string; stdio: 'inherit' }) => ProcResult;

const realSpawn: SpawnFn = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: opts.stdio, encoding: 'utf8' });
  const result: ProcResult = { status: r.status, stdout: '', stderr: '' };
  if (r.error) result.error = r.error;
  return result;
};

/** Resolve `bin/install.ts` relative to THIS FILE's own on-disk location — the "resolvable relative to
 *  itself" test (mirrored by bin/open-autonomy.ts's own `install` stub — see its header for the sibling
 *  version of this same idiom). `fromFile` defaults to this module's own `import.meta.url` but is
 *  injectable so a test can point it at a synthetic layout without touching the real filesystem tree.
 *  Layout (real monorepo): packages/local-runner-cli/src/install-delegate.ts -> repo root is THREE levels
 *  up (src -> local-runner-cli -> packages -> root), then `bin/install.ts`. Returns undefined (never
 *  throws, never guesses) when nothing is there — a standalone/vendored `@volter/oa` outside this
 *  monorepo, or a checkout that predates TE.8. */
export function resolveInstallScript(fromFile: string = import.meta.url): string | undefined {
  const here = dirname(fileURLToPath(fromFile));
  const candidate = join(here, '..', '..', '..', 'bin', 'install.ts');
  return existsSync(candidate) ? candidate : undefined;
}

export const INSTALL_NOT_AVAILABLE_MESSAGE =
  '[oa] install: bin/install.ts was not found relative to this package (@volter/oa) — expected for a ' +
  'standalone/vendored install outside the open-autonomy monorepo, or a checkout that predates TE.8. The ' +
  'one-shot install agent is SOURCE-CHECKOUT-ONLY today (T0.1\'s frozen decision: neither `open-autonomy` ' +
  '0.4.2 nor `@volter/oa` itself covers it once published). Clone volter-ai/open-autonomy and run ' +
  '`bun bin/install.ts <targetRepoDir> --help` from within that checkout instead.';

export interface RunInstallDelegateOptions {
  cwd?: string;
  spawn?: SpawnFn;
  /** override resolution — tests only; production always resolves from this file's own location. */
  scriptPath?: string;
}

export interface InstallDelegateResult {
  available: boolean;
  scriptPath?: string;
  code: number;
  /** empty when the child ran (it already wrote its own output via the inherited stdio) — only ever
   *  populated for THIS module's own diagnostic (not-available / failed-to-spawn) messages. */
  message: string;
}

/** Delegate `argv` to `bin/install.ts` as a real child process with inherited stdio (the child's own
 *  stdout/stderr/exit-code ARE the product surface — never buffered/re-printed by this wrapper) — see file
 *  header for why this is a spawn, never an import. Never touches board state, never launches an agent,
 *  never executes a go-live command itself: it only ever hands the human's argv through to the same
 *  orchestrator `bun bin/install.ts` runs directly, which carries its own gate/safety discipline unchanged. */
export function runInstallDelegate(argv: string[], opts: RunInstallDelegateOptions = {}): InstallDelegateResult {
  const scriptPath = opts.scriptPath ?? resolveInstallScript();
  if (!scriptPath) {
    return { available: false, code: 1, message: INSTALL_NOT_AVAILABLE_MESSAGE };
  }
  const spawn = opts.spawn ?? realSpawn;
  const r = spawn('bun', [scriptPath, ...argv], { cwd: opts.cwd ?? process.cwd(), stdio: 'inherit' });
  if (r.error) {
    return {
      available: true,
      scriptPath,
      code: 1,
      message: `[oa] install: failed to spawn \`bun ${scriptPath}\` (${r.error.message}) — is bun installed and on PATH?`,
    };
  }
  return { available: true, scriptPath, code: r.status ?? 1, message: '' };
}
