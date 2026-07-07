#!/usr/bin/env node
// open-autonomy preflight — make an adopter repo install-ready, STRUCTURALLY, so the environment
// gotchas the first live install hit never reach the operator. Run from the adopter repo root AFTER
// installing the runner deps (`npm install termfleet` + `npm install -D ztrack`), BEFORE committing the
// harness. Idempotent — safe to re-run.
//
//   1. node-pty — termfleet's PTY provider dependency (today @homebridge/node-pty-prebuilt-multiarch,
//      discovered from termfleet's OWN package.json — never hardcoded) ships prebuilt natives, not source;
//      the health check that matters is "does it load under this Node", verified with a real `require` in a
//      child `node` process — never a compiled-artifact path guess (build/Release/pty.node), which a healthy
//      prebuilt install never has and which used to false-fail every clean install (see
//      docs/adoption-fixes/OA-05-preflight-false-pty-failure.md). Rebuilding only runs (and its output is
//      only shown) when the load probe actually fails, and success/failure is decided by a re-probe, not by
//      npm's own "rebuilt dependencies successfully" text — so this can never again print a false FAILED
//      next to a real success.
//   2. lockfile — adding the runner deps under a different Node/npm than the repo's CI can desync
//      package-lock.json so the repo's CI `npm ci` rejects it ("package.json and package-lock.json are not in
//      sync") — and `npm run build` passes locally (it reuses node_modules) so it only surfaces in CI, on the
//      first agent PR. We verify `npm ci` under the repo's *CI Node version* in a throwaway copy (the repo's
//      node_modules is never touched) and regenerate the lock under that Node if it's out of sync.
import { existsSync, readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
let failed = false;
const note = (m: string) => console.log(`preflight: ${m}`);
const warn = (m: string) => { console.log(`preflight: ! ${m}`); failed = true; };
const run = (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const have = (cmd: string) => { try { return run(cmd, ['--version']).status === 0; } catch { return false; } };

// ── 1. node-pty: termfleet's provider native module ─────────────────────────────────────────────
// Extracted as a pure(ish), dependency-injected helper (bin/preflight.test.ts) instead of a script with
// top-level side effects — the `io` seam (fs reads + the spawn used for both the load probe and `npm
// rebuild`) is what lets tests assert "probe passes ⇒ npm is never invoked" without a real install.

// Shaped after spawnSync's return, loosened where the runtimes disagree: when the executable is MISSING,
// node's spawnSync returns `status: null` while bun's returns `status: undefined` with null stdout/stderr
// (both set `error` ENOENT; neither sets `signal`) — verified empirically on node v22 / bun 1.3. Consumers
// must use nullish (`== null`) checks, never `=== null`.
export type RunFn = (cmd: string, args: string[], opts?: Record<string, unknown>) => {
  status: number | null | undefined;
  stdout: string | null | undefined;
  stderr: string | null | undefined;
  signal?: string | null | undefined;
};

export interface PtyIO {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => string;
  run: RunFn;
}

const defaultPtyIO: PtyIO = { existsSync, readFileSync: (p) => readFileSync(p, 'utf8'), run };

/** termfleet declares its PTY provider as a normal `dependencies` entry — pick the one matching
 *  `/node-pty/i` (today `@homebridge/node-pty-prebuilt-multiarch`) instead of hardcoding a name that will
 *  rot the day termfleet swaps implementations (it already ships a fork, not upstream `node-pty`). */
export function pickPtyDepName(termfleetPkgJsonText: string): string | null {
  let pkg: { dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(termfleetPkgJsonText);
  } catch {
    return null;
  }
  const deps = pkg.dependencies ?? {};
  return Object.keys(deps).find((k) => /node-pty/i.test(k)) ?? null;
}

/** Resolve honoring nesting: npm hoists to `<cwd>/node_modules/<name>` when it can; when it can't (a
 *  conflicting top-level version), it nests under `<cwd>/node_modules/termfleet/node_modules/<name>`. Check
 *  the hoisted location first, then the nested one — never just the hoisted path. */
export function resolvePtyDir(cwd: string, name: string, existsFn: (p: string) => boolean): string | null {
  const hoisted = join(cwd, 'node_modules', name);
  if (existsFn(hoisted)) return hoisted;
  const nested = join(cwd, 'node_modules', 'termfleet', 'node_modules', name);
  if (existsFn(nested)) return nested;
  return null;
}

export interface ProbeOutcome {
  ok: boolean;
  stderr: string;
  /** True when the probe process never RAN at all — `node` not found on PATH (spawnSync: no exit status,
   *  no signal; node reports status null, bun status undefined — see RunFn). This is an ENVIRONMENT
   *  problem, not a module-load failure: reporting it as "failed to load" and prescribing a rebuild +
   *  build toolchain would be exactly the F-5 cry-wolf class this check exists to kill. A SIGNAL-killed
   *  probe (also status null, but signal set — e.g. a corrupt `.node` segfaulting the loader) is NOT this:
   *  that's a genuine load failure the rebuild path exists for. Callers must branch on this BEFORE
   *  treating `!ok` as a broken module. */
  nodeMissing: boolean;
}

/** Health = a load probe, not an artifact path. Run under `node` EXPLICITLY (never the current
 *  `process.execPath`): preflight itself may run under bun, whose native-module ABI is not the one the
 *  termfleet provider actually runs under at launch — an in-process or bun-executed probe could pass where
 *  the real provider fails, or crash preflight itself on a bad `.node`. A child `node` probe is isolated and
 *  reports cleanly either way. */
export function probePtyLoad(ptyDir: string, runFn: RunFn): ProbeOutcome {
  const r = runFn('node', ['-e', 'require(process.argv[1])', ptyDir]);
  // Nullish (== null) on purpose: node's spawnSync reports a missing executable as status null, bun's as
  // status undefined (verified live — a strict === null misdiagnosed the bun path as a module failure).
  const nodeMissing = r.status == null && r.signal == null;
  return { ok: r.status === 0, stderr: (r.stderr ?? '').trim(), nodeMissing };
}

/** The version of the `node` binary the probe actually ran under — NOT `process.versions.node` (when
 *  preflight itself runs under bun, that reports bun's Node-compat target, not the system `node` the child
 *  probe used, which is the ABI that actually matters here). Falls back to an honest label if `node
 *  --version` can't be read for some reason (never worth failing the check over) — the messages read
 *  "… under node ${version}", so the fallback must not be the literal 'node' ("under node node"). */
function realNodeVersion(runFn: RunFn): string {
  const r = runFn('node', ['--version']);
  return (r.stdout ?? '').trim() || '(version unknown)';
}

const tail = (s: string, n = 20) => s.trim().split('\n').slice(-n).join('\n');
const indent = (s: string, n = 4) => s.split('\n').map((l) => `${' '.repeat(n)}${l}`).join('\n');

export interface PtyCheckResult {
  notes: string[];
  warns: string[];
  failed: boolean;
  /** True iff `npm rebuild` was actually invoked — i.e. the initial probe failed. Exposed so tests can
   *  assert a passing probe NEVER triggers a rebuild (today's bug: `npm rebuild` ran on every healthy env). */
  rebuildAttempted: boolean;
}

export function ensurePtyModule(cwd: string, io: PtyIO = defaultPtyIO): PtyCheckResult {
  const notes: string[] = [];
  const warns: string[] = [];
  let rebuildAttempted = false;
  const note = (m: string) => notes.push(m);
  const warn = (m: string) => warns.push(m);

  const termfleetPkgPath = join(cwd, 'node_modules', 'termfleet', 'package.json');
  if (!io.existsSync(termfleetPkgPath)) {
    note('termfleet not installed yet — skip node-pty check (run after `npm install termfleet`)');
    return { notes, warns, failed: warns.length > 0, rebuildAttempted };
  }

  const name = pickPtyDepName(io.readFileSync(termfleetPkgPath));
  if (!name) {
    note('termfleet declares no node-pty dependency — skip');
    return { notes, warns, failed: warns.length > 0, rebuildAttempted };
  }

  const ptyDir = resolvePtyDir(cwd, name, io.existsSync);
  if (!ptyDir) {
    warn(`termfleet's PTY dependency ${name} is not installed — re-run \`npm install\``);
    return { notes, warns, failed: warns.length > 0, rebuildAttempted };
  }

  const nodeVersion = realNodeVersion(io.run);
  const first = probePtyLoad(ptyDir, io.run);
  if (first.ok) {
    note(`${name} loads under node ${nodeVersion} (termfleet provider can start) ✓`);
    return { notes, warns, failed: warns.length > 0, rebuildAttempted };
  }
  if (first.nodeMissing) {
    // The probe never ran — `node` isn't on PATH. That's an environment gap, NOT a broken module:
    // rebuilding can't help (npm needs node too) and prescribing a build toolchain would be a fresh
    // false diagnosis of the exact kind this check replaces. Warn with the real remedy and stop.
    warn('node not found on PATH — install Node 22+ (the termfleet runner and this probe run under node) and re-run `open-autonomy preflight`');
    return { notes, warns, failed: warns.length > 0, rebuildAttempted };
  }

  // Probe failed — show the REAL error's tail (not a guessed artifact path; a raw `require` crash is a
  // long multi-frame stack, so only the tail is worth printing), then rebuild and judge the outcome solely
  // by a re-probe. `npm rebuild`'s own output is CAPTURED, never `stdio: 'inherit'`ed, so its "rebuilt
  // dependencies successfully" (printed even when the rebuild was a no-op — see the linked doc) can never
  // reach the terminal standalone; it only ever appears, if at all, folded into a labeled failure block
  // below, and only on the branch that already says FAILED.
  note(`${name} failed to load under node ${nodeVersion}:\n${indent(tail(first.stderr || '(no error output)'))}`);
  note(`rebuilding ${name} for node ${nodeVersion}…`);
  rebuildAttempted = true;
  const rebuild = io.run('npm', ['rebuild', name], { cwd });
  const rebuildOutput = `${rebuild.stdout ?? ''}${rebuild.stderr ?? ''}`;
  const second = probePtyLoad(ptyDir, io.run);
  if (second.ok) {
    note(`${name} rebuilt for node ${nodeVersion} ✓`);
  } else {
    warn(
      `${name} rebuild FAILED — install the build toolchain (Xcode CLT / build-essential) and re-run \`open-autonomy preflight\`\n` +
        `  npm rebuild output (tail):\n${indent(tail(rebuildOutput || '(no output)'))}\n` +
        `  loader error after rebuild (tail):\n${indent(tail(second.stderr || '(no error output)'))}`,
    );
  }
  return { notes, warns, failed: warns.length > 0, rebuildAttempted };
}

// ── 2. lockfile: `npm ci` under the repo's CI Node version ──────────────────────────────────────
function detectCiNodeMajor(): string | null {
  if (existsSync(join(cwd, '.nvmrc'))) {
    const m = readFileSync(join(cwd, '.nvmrc'), 'utf8').match(/(\d+)/);
    if (m) return m[1]!;
  }
  const wf = join(cwd, '.github/workflows');
  if (existsSync(wf)) {
    for (const f of readdirSync(wf)) {
      if (!/\.ya?ml$/.test(f)) continue;
      const m = readFileSync(join(wf, f), 'utf8').match(/node-version:\s*['"]?(\d+)/);
      if (m) return m[1]!;
    }
  }
  try {
    const eng = (JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).engines || {}).node as string | undefined;
    const m = eng && eng.match(/(\d+)/);
    if (m) return m[1]!;
  } catch { /* no/invalid package.json */ }
  return null;
}

// A real lock↔package.json desync (npm's EUSAGE), vs an environment/mount failure we must NOT mistake for a
// bad lock (don't regenerate on those — that could corrupt a fine lock).
const isLockDesync = (out: string) => /not in sync|EUSAGE|Missing:|can only install packages when/i.test(out);

function verifyLock(): void {
  if (!existsSync(join(cwd, 'package-lock.json'))) { note('no package-lock.json (not an npm repo) — skip lockfile check'); return; }
  const ci = detectCiNodeMajor();
  const local = process.versions.node.split('.')[0]!;
  const useDocker = !!ci && ci !== local && have('docker') && run('docker', ['info'], { stdio: 'ignore' }).status === 0;
  // Verify in a THROWAWAY copy (package.json + lock only) so the repo's node_modules — with the node-pty we
  // just rebuilt — is never disturbed. The copy lives UNDER cwd (not $TMPDIR) so Docker Desktop, which on
  // macOS only file-shares /Users etc. and NOT /var/folders, can mount it. `npm ci --dry-run` does the
  // lock↔package.json sync check (fails fast when out of sync) without installing.
  const t = mkdtempSync(join(cwd, '.oa-preflight-'));
  try {
    copyFileSync(join(cwd, 'package.json'), join(t, 'package.json'));
    copyFileSync(join(cwd, 'package-lock.json'), join(t, 'package-lock.json'));
    const inNode = (a: string[]) => {
      const r = useDocker
        ? run('docker', ['run', '--rm', '-v', `${t}:/app`, '-w', '/app', `node:${ci}`, ...a])
        : run(a[0]!, a.slice(1), { cwd: t });
      return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    };
    const where = useDocker
      ? `under node:${ci} (the repo's CI version)`
      : `(local node ${local}${ci && ci !== local ? `; CI uses ${ci} but docker is unavailable — best-effort local check` : ''})`;
    note(`verifying the lockfile with \`npm ci\` ${where}…`);
    const first = inNode(['npm', 'ci', '--dry-run', '--no-audit', '--no-fund']);
    if (first.status === 0) { note("lockfile in sync — the repo's CI `npm ci` will accept it ✓"); return; }
    if (!isLockDesync(first.out)) {
      warn(`could not verify the lockfile (environment issue, not a lock desync) — verify manually with \`npm ci\`:\n${first.out.trim().split('\n').slice(-3).join('\n')}`);
      return;
    }
    note('CI `npm ci` REJECTS the current lock (Node/npm version drift) — regenerating package-lock.json under the CI Node…');
    inNode(['npm', 'install', '--package-lock-only', '--no-audit', '--no-fund']);
    if (inNode(['npm', 'ci', '--dry-run', '--no-audit', '--no-fund']).status !== 0) {
      warn('npm ci still failing after lock regen — resolve the lockfile manually');
      return;
    }
    copyFileSync(join(t, 'package-lock.json'), join(cwd, 'package-lock.json'));
    note('package-lock.json regenerated under the CI Node + `npm ci` now passes ✓ — commit the updated lock');
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
}

// Wrapped in an exported function — never auto-run at module-eval time — so importing this module
// (bin/preflight.test.ts, which tests ensurePtyModule/pickPtyDepName/resolvePtyDir/probePtyLoad directly;
// bin/open-autonomy.ts, which dynamic-`import()`s this file to delegate the `preflight` subcommand) never
// triggers a top-level `process.exit()` as a side effect of loading the module. `bin/open-autonomy.ts`
// calls `runPreflightCli()` explicitly after importing; running this file directly (`bun bin/preflight.ts`)
// runs it too, via the `import.meta.main` guard below (matches bin/check-doc-vars.ts's convention).
export function runPreflightCli(): void {
  console.log('open-autonomy preflight — environment checks for a local-runner install\n');
  const ptyResult = ensurePtyModule(cwd);
  for (const n of ptyResult.notes) note(n);
  for (const w of ptyResult.warns) warn(w);
  verifyLock();
  console.log(failed ? '\npreflight: FAILED — fix the item(s) above and re-run.' : '\npreflight: OK — environment is install-ready ✓');
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) runPreflightCli();
