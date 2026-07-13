// open-autonomy doctor's check implementations (OA-18) — split from bin/doctor.ts so tests can import
// pure/testable functions directly. IMPORTANT: this module must NEVER execute anything at import time
// (every other bin/*.ts verb module runs its CLI logic unconditionally on import, which is why tests for
// those spawn a subprocess instead of importing them directly — see bin/autonomy-compile.test.ts). Keeping
// this file side-effect-free on import (registering the exit/signal handlers below is the one exception,
// and they are no-ops until a probe is actually created) lets bin/doctor-checks.test.ts unit-test each
// check function in isolation, while bin/doctor.ts (the thin CLI entry bin/open-autonomy.ts dynamically
// imports) still executes the genuine end-to-end CLI same as every other verb.
//
// The audit's §5 verdict: "make the install self-verifying end-to-end — a doctor/verify step that, before
// declaring success, proves the actual failure chain this audit walked." Everything between `compile` and
// the first surviving worker is today either swallowed (a best-effort fetch, a dropped exit code, a
// dead-idle session read as `done`) or checked by nothing at all (docs/adoption-fixes/OA-18-*.md). This
// verb walks that exact chain, in order, and refuses to bless an install that would produce a zombie loop.
//
//   npx open-autonomy doctor [--live] [--json] [--branch-prefix oa-doctor]
//
// Contract (see the spec doc for the full rationale):
//   - checks run 1->7 in the audit's failure-chain order: self, env, provider, auth, harness, skills, live.
//     Every check reports PASS | FAIL | WARN | SKIP; a failed check does not stop the run unless a LATER
//     check depends on its artifact (5 gates 6; 5-6 gate 7).
//   - exit 0 iff no FAIL; exit 1 on any FAIL; exit 2 on a usage error.
//   - --json emits { checks: [{ id, status, detail, finding }], verdict }.
//   - READ-ONLY guarantee: the only filesystem/git mutation this verb ever makes is a throwaway probe
//     worktree + branch under `.worktrees/` (check 5), always removed on exit — including on failure or a
//     signal (`git worktree remove --force` + `git branch -D`, registered before the probe is created).
//   - SPEND guarantee: without --live, doctor launches no agent session and makes no model call. Check 4
//     (auth) uses only each coding CLI's own non-spending introspection command, never a real prompt.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { GENERATED_MANIFEST_PATH, isScript, missingCopySourcesIn, parseIr, readGeneratedManifest } from '@open-autonomy/core';
import { BUNDLE_DATA_FILES } from '../scripts/bundle-data-files.ts';

// --- shared result shape -----------------------------------------------------------------------------
export type CheckId = 'self' | 'env' | 'provider' | 'auth' | 'harness' | 'skills' | 'live';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  detail: string;
  finding: string[]; // the audit finding IDs this check maps to (docs/adoption-fixes/OA-18-*.md's coverage table)
}
const PASS = (id: CheckId, detail: string, finding: string[] = []): CheckResult => ({ id, status: 'PASS', detail, finding });
const FAIL = (id: CheckId, detail: string, finding: string[] = []): CheckResult => ({ id, status: 'FAIL', detail, finding });
const WARN = (id: CheckId, detail: string, finding: string[] = []): CheckResult => ({ id, status: 'WARN', detail, finding });
const SKIP = (id: CheckId, detail: string, finding: string[] = []): CheckResult => ({ id, status: 'SKIP', detail, finding });

// --- CLI arg parsing -----------------------------------------------------------------------------------
export interface DoctorArgs {
  live: boolean;
  json: boolean;
  branchPrefix: string;
}
export const USAGE = 'usage: open-autonomy doctor [--live] [--json] [--branch-prefix oa-doctor]\n' +
  '  --live spends: it launches one real coding-CLI session (check 7) — costs money on a metered account.';

// `help` (an explicit --help/-h) is NOT a usage error — it prints USAGE to stdout and exits 0; `usageError`
// (a bad/missing argument) prints to stderr and exits 2. bin/doctor.ts branches on which key is present.
export function parseDoctorArgs(argv: string[]): DoctorArgs | { help: true } | { usageError: string } {
  let live = false;
  let json = false;
  let branchPrefix = 'oa-doctor';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') live = true;
    else if (a === '--json') json = true;
    else if (a === '--branch-prefix') {
      const v = argv[++i];
      if (!v) return { usageError: `open-autonomy doctor: --branch-prefix needs a value\n${USAGE}` };
      branchPrefix = v;
    } else if (a === '--help' || a === '-h') return { help: true };
    else return { usageError: `open-autonomy doctor: unrecognized argument "${a}"\n${USAGE}` };
  }
  return { live, json, branchPrefix };
}

// --- tiny process/version helpers ----------------------------------------------------------------------
function toolOutput(cmd: string, args: string[]): string | undefined {
  try {
    // env: process.env is EXPLICIT (not the implicit-inherit default) on purpose: under bun, spawnSync's
    // implicit inheritance does not reliably see a same-process `process.env.PATH` mutation made after
    // startup (observed empirically; a PATH-shim test would otherwise silently resolve the REAL system
    // binary instead of the shim) — an explicit object read always reflects the CURRENT process.env.
    const r = spawnSync(cmd, args, { encoding: 'utf8', env: process.env });
    if (r.error) return undefined;
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    return r.status === 0 ? out || '(no output)' : undefined;
  } catch {
    return undefined;
  }
}
function parseVersionNumbers(s: string): number[] {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [];
}
function versionAtLeast(actual: number[], min: number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    const a = actual[i] ?? 0;
    const b = min[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}
function lastJsonLine<T>(stdout: string): T | undefined {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      return JSON.parse(line) as T;
    } catch {
      /* not the JSON line */
    }
  }
  return undefined;
}
function readJsonSafe(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}
function resolveFromRepo(cwd: string, specifier: string): string | undefined {
  try {
    return createRequire(join(cwd, 'package.json')).resolve(specifier);
  } catch {
    return undefined;
  }
}
async function importFromRepo(cwd: string, specifier: string): Promise<Record<string, any> | undefined> {
  const p = resolveFromRepo(cwd, specifier);
  if (!p) return undefined;
  try {
    return (await import(pathToFileURL(p).href)) as Record<string, any>;
  } catch {
    return undefined;
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
/** Race a promise against a hard timeout — for any network call into a termfleet SDK client, whose
 *  underlying transport (socket.io) can hang indefinitely against a non-cooperating occupant instead of
 *  erroring. The timer is `.unref()`d so a still-pending timeout can never itself keep the process alive
 *  past doctor's own natural exit. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    if (typeof t.unref === 'function') t.unref();
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// =========================================================================================================
// CHECK 1 — self: the CLI runs from its installed artifact.
// =========================================================================================================
// Deliberate deviation from a literal "dynamically import every verb module": bin/preflight.ts and
// bin/harness-push.ts have NO import.meta.main guard — importing them EXECUTES their (mutating / networked)
// top-level logic unconditionally (preflight rebuilds node-pty + may rewrite package-lock.json; harness-push
// shells to `gh`/`git push`). Doing that here would violate doctor's own read-only/spend guarantees. In the
// PUBLISHED artifact there is also no separate verb file to import in the first place — `bun build` fuses
// every bin/*.ts into the one dist/cli.js bundle doctor itself already IS (scripts/build-cli.ts's static
// sibling-read scan is the build-time proof that fused). So this check's real, safe, and load-bearing work
// is: (a) verify the SIBLING DATA FILES the emit paths read (backend.mjs, runner-frontend.ts,
// control-backend.mjs, runtime/*, egress-guard.sh) exist and are readable NEXT TO the running bundle — these
// ship as separate files, independent of the JS bundle's own integrity; (b) dynamically import both
// substrate compilers (side-effect-free at import time — see readSiblingOrThrow in both emit.ts modules)
// and dry-run-compile every bundled profile to every target it declares, IN MEMORY — this is what actually
// exercises a lazy sibling read a profile's OWN targets might not otherwise trigger (e.g. egress-guard.sh,
// gated behind a profile's policy flag). Together (a)+(b) reproduce F-1 faithfully without executing any
// verb's CLI logic.
//
// The expected sibling set is DERIVED from scripts/bundle-data-files.ts — the SAME declaration
// scripts/build-cli.ts copies into dist/ — so the two can never drift: a future data file added to the
// build's manifest is covered by this check automatically, and one FORGOTTEN there is caught here as an
// F-1 FAIL by construction (the OA-18 skeptic-panel PROOF FIX 7). Single-file entries are asserted present
// + readable; a `dir` entry (runtime/) is asserted to be a non-empty dir with at least one `.ts` inside.
const REQUIRED_SIBLING_FILES = BUNDLE_DATA_FILES.filter((f) => !f.dir).map((f) => f.dest);
const REQUIRED_SIBLING_DIRS = BUNDLE_DATA_FILES.filter((f) => f.dir).map((f) => f.dest);

function ownBaseDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}
function ownPackageJson(): Record<string, unknown> {
  return readJsonSafe(join(ownBaseDir(), '..', 'package.json'));
}
// `baseDirOverride` exists ONLY for check 1's own test suite (bin/doctor-checks.test.ts): in the PUBLISHED
// artifact, `ownBaseDir()` (dist/'s dirname) is exactly "next to the running bundle" — real production
// never passes an override. In a dev checkout, `bun test` runs bin/doctor-checks.ts UNBUNDLED, so its own
// dirname (bin/) never has backend.mjs etc. next to it (those live under packages/*/src/); tests that need
// a synthetic "bundle" (AC-1's "delete a shipped file") build one with the real `scripts/build-cli.ts` (or
// a scratch copy of it) and pass its path here, rather than doctor-checks.ts guessing dev-checkout layout.
function profilesRootFor(baseDir: string): string {
  return join(baseDir, '..', 'profiles');
}
function bundledProfileDirs(baseDir: string): string[] {
  const root = profilesRootFor(baseDir);
  try {
    return readdirSync(root)
      .filter((n) => existsSync(join(root, n, 'ir.yml')))
      .map((n) => join(root, n))
      .sort();
  } catch {
    return [];
  }
}

function satisfiesRange(version: string, range: string): boolean {
  const clean = range.trim();
  if (clean === '*' || clean === '' || /^(workspace:|file:|git\+|link:)/.test(clean)) return true; // not this check's concern
  const m = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(clean);
  if (!m) return true; // an exotic range we can't parse -- don't false-positive a WARN
  const [maj, min, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const v = parseVersionNumbers(version);
  if (clean.startsWith('^')) return maj > 0 ? v[0] === maj : v[0] === maj && v[1] === min;
  if (clean.startsWith('~')) return v[0] === maj && v[1] === min;
  return v[0] === maj && v[1] === min && v[2] === patch;
}
function versionSkewWarning(cwd: string, installedVersion: string): string | undefined {
  const pkg = readJsonSafe(join(cwd, 'package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const range = pkg.dependencies?.['open-autonomy'] ?? pkg.devDependencies?.['open-autonomy'];
  if (!range) return undefined; // most adopters run via npx and pin nothing -- nothing to compare
  if (satisfiesRange(installedVersion, range)) return undefined;
  return (
    `installed open-autonomy@${installedVersion} does not satisfy this repo's package.json pin ` +
    `("open-autonomy": "${range}") — reinstall to sync, or report both versions if filing an issue.`
  );
}

export async function checkSelf(cwd: string, baseDirOverride?: string): Promise<CheckResult> {
  const base = baseDirOverride ?? ownBaseDir();
  const pkg = baseDirOverride ? readJsonSafe(join(base, '..', 'package.json')) : ownPackageJson();
  const version = typeof pkg.version === 'string' ? pkg.version : '(unknown)';

  const missingFiles: string[] = [];
  for (const f of REQUIRED_SIBLING_FILES) {
    const p = join(base, f);
    let ok = existsSync(p);
    if (ok) {
      try {
        readFileSync(p);
      } catch {
        ok = false;
      }
    }
    if (!ok) missingFiles.push(f);
  }
  for (const d of REQUIRED_SIBLING_DIRS) {
    let ok = false;
    try {
      ok = readdirSync(join(base, d)).some((f) => f.endsWith('.ts'));
    } catch {
      /* the dir is absent next to the bundle */
    }
    if (!ok) missingFiles.push(`${d}/*.ts`);
  }

  if (missingFiles.length) {
    return FAIL(
      'self',
      `this open-autonomy install (${version}) is missing ${missingFiles.join(', ')} from its published artifact — ` +
        `every 'compile' invocation will crash (ENOENT). This is a broken publish, not your repo: pin the last ` +
        `known-good version (npm install -D open-autonomy@<prev>) and report the version upstream.`,
      ['F-1'],
    );
  }

  let Local: Record<string, any>;
  let Github: Record<string, any>;
  try {
    [Local, Github] = await Promise.all([import('@open-autonomy/substrate-local'), import('@open-autonomy/substrate-github')]);
  } catch (e) {
    return FAIL('self', `failed to import a substrate compiler module: ${(e as Error).message}`, ['F-1']);
  }

  const profileDirs = bundledProfileDirs(base);
  const compileFails: string[] = [];
  for (const profileDir of profileDirs) {
    let ir;
    try {
      ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
    } catch (e) {
      compileFails.push(`${profileDir}: ir.yml parse error: ${(e as Error).message}`);
      continue;
    }
    for (const target of ir.targets) {
      try {
        const out =
          target === 'gh-actions' ? Github.compileGithub(ir) : target === 'local' ? Local.compileLocal(ir) : undefined;
        if (!out) continue; // an unrecognized/undeclared target -- not this check's concern
        const missing = missingCopySourcesIn(out, profileDir);
        if (missing.length) compileFails.push(`${profileDir} -> ${target}: missing copy source(s): ${missing.join(', ')}`);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.startsWith('open-autonomy: packaging bug')) {
          const m = /sibling data file '([^']+)'/.exec(msg);
          compileFails.push(`${profileDir} -> ${target}: missing shipped file '${m ? m[1] : '(unknown)'}'`);
        } else {
          compileFails.push(`${profileDir} -> ${target}: ${msg}`);
        }
      }
    }
  }
  if (compileFails.length) {
    return FAIL(
      'self',
      `this open-autonomy install (${version}) fails to compile ${compileFails.length} bundled profile/target ` +
        `combination(s) in memory — a broken publish: ${compileFails.join(' | ')}`,
      ['F-1'],
    );
  }

  const skew = versionSkewWarning(cwd, version);
  if (skew) return WARN('self', skew, ['F-1', 'F-14']);

  return PASS(
    'self',
    `installed open-autonomy@${version}: every shipped data file present + readable, ${profileDirs.length} ` +
      `bundled profile(s) compile clean in memory to every declared target.`,
    ['F-1', 'F-14'],
  );
}

// =========================================================================================================
// CHECK 2 — env: toolchain/env sanity (supersedes preflight's checks, with the F-5 false-alarm fixed).
// =========================================================================================================
function npmOmitsDev(cwd: string): boolean {
  try {
    const r = spawnSync('npm', ['config', 'get', 'omit'], { encoding: 'utf8', cwd, env: process.env });
    return /(^|[,\s])dev([,\s]|$)/i.test(r.stdout ?? '');
  } catch {
    return false;
  }
}
// A node crash's actual "Error: <message>" line is usually a few lines IN (after the source-frame excerpt
// node prints first), not among the last few lines (those are just stack frames + the "Node.js vX" footer)
// -- prefer the first `<SomeError>: message` line; fall back to the raw text's first line if none matches.
function loaderErrorSummary(stderrOrStdout: string): string {
  const lines = stderrOrStdout.trim().split('\n');
  const errorLine = lines.find((l) => /^\s*\w*Error:/.test(l));
  return (errorLine ?? lines[0] ?? '(no output)').trim();
}
// Walk up from a resolved file until we find the nearest package.json whose "name" matches `pkgName` — used
// to locate termfleet's OWN package.json so we read ITS declared pty dependency, never a hardcoded name.
function nearestNamedPackageDir(fromFile: string, pkgName: string): string | undefined {
  let dir = dirname(fromFile);
  for (;;) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      const pkg = readJsonSafe(pj);
      if (pkg.name === pkgName) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
function isWorkspaceShadow(resolvedPath: string): boolean {
  let real: string;
  try {
    real = realpathSync(resolvedPath);
  } catch {
    return false;
  }
  return !real.split(sep).includes('node_modules');
}

export function checkEnv(cwd: string): CheckResult {
  const problems: string[] = [];
  const notes: string[] = [];

  // a. toolchain versions
  const nodeMinStr = typeof (ownPackageJson().engines as Record<string, string> | undefined)?.node === 'string'
    ? (ownPackageJson().engines as Record<string, string>).node
    : '>=22.18';
  const nodeMin = parseVersionNumbers(nodeMinStr);
  if (!versionAtLeast(parseVersionNumbers(process.versions.node), nodeMin)) {
    problems.push(`node ${process.versions.node} < required ${nodeMinStr.replace(/^>=/, '')}`);
  }
  const gitV = toolOutput('git', ['--version']);
  if (!gitV) problems.push('git not found on PATH (required for agent worktrees)');
  else if (!versionAtLeast(parseVersionNumbers(gitV), [2, 5, 0])) problems.push(`${gitV} < required 2.5 (worktree support)`);
  if (!toolOutput('tmux', ['-V'])) problems.push("tmux not found on PATH (termfleet's local provider runs sessions in tmux)");
  if (!toolOutput('bun', ['--version'])) problems.push('bun not found on PATH (the emitted scripts/runner.ts and ztrack presets run under bun)');
  else notes.push('node/git/tmux/bun present');

  // b. devDeps actually installed (F-6): NODE_ENV=production / npm omit=dev silently no-ops `npm install -D`.
  const repoPkg = readJsonSafe(join(cwd, 'package.json')) as { devDependencies?: Record<string, string> };
  const needsZtrack = !!repoPkg.devDependencies && 'ztrack' in repoPkg.devDependencies;
  const envHostile = process.env.NODE_ENV === 'production' || npmOmitsDev(cwd);
  let ztrackResolvable = true;
  if (needsZtrack) {
    try {
      createRequire(join(cwd, 'package.json')).resolve('ztrack');
    } catch {
      ztrackResolvable = false;
    }
  }
  if (needsZtrack && !ztrackResolvable) {
    problems.push(
      envHostile
        ? "NODE_ENV=production (or npm config omit=dev) — 'npm install -D ztrack' silently installs nothing on this box. Fix: NODE_ENV=development npm install -D ztrack (or npm config delete omit)."
        : 'ztrack is declared in devDependencies but not resolvable from node_modules — run npm install.',
    );
  } else if (needsZtrack) {
    notes.push('ztrack resolves from node_modules');
  }

  // b2. @termfleet/core actually installed + resolvable (mirrors (b) above exactly, for a REQUIRED runtime
  // dependency instead of a devDependency): packages/substrate-local/src/backend.mjs and runner.ts both
  // `import { resolveDefaultProvider } from '@termfleet/core/local-providers.js'` at runtime, at first live
  // scheduler tick — so an install where this doesn't resolve is not merely degraded, it's DEAD on its
  // first tick. Under npm's default hoisting this often worked "by luck" (something else in the tree
  // transitively pulled @termfleet/core in); under pnpm's strict non-hoisting layout nothing hoists it, so
  // it silently ERR_MODULE_NOT_FOUNDs with no doctor/preflight signal beforehand (proven live). Scoped to
  // installs where the local substrate is actually in play — same signal checkLive (check 7) already gates
  // its own dispatch-path checks on: scripts/run-agent.mjs existing (the local runner's real entry point;
  // a github-substrate install never emits it, so this never false-alarms there).
  const localRunnerInPlay = existsSync(join(cwd, 'scripts', 'run-agent.mjs'));
  if (localRunnerInPlay) {
    let termfleetCoreResolvable = true;
    try {
      createRequire(join(cwd, 'package.json')).resolve('@termfleet/core/local-providers.js');
    } catch {
      termfleetCoreResolvable = false;
    }
    if (!termfleetCoreResolvable) {
      problems.push(
        "'@termfleet/core/local-providers.js' is not resolvable from node_modules — it is a REQUIRED runtime " +
          "dependency of the local runner (packages/substrate-local's backend.mjs and runner.ts both import it at " +
          "the very first scheduler tick), not merely a dev tool: without it every dispatch dies ERR_MODULE_NOT_FOUND. " +
          'Fix: npm install @termfleet/core (or your package manager\'s equivalent — e.g. pnpm add @termfleet/core, ' +
          'yarn add @termfleet/core, bun add @termfleet/core; under npm hoisting this sometimes resolves ' +
          "transitively without being declared, but a non-hoisting installer like pnpm never hoists it for you).",
      );
    } else {
      notes.push('@termfleet/core resolves from node_modules');
    }
  }

  // c. the pty module termfleet ACTUALLY depends on -- never a hardcoded name -- load-probed in a child.
  const termfleetEntry = resolveFromRepo(cwd, 'termfleet');
  if (termfleetEntry) {
    const termfleetDir = nearestNamedPackageDir(termfleetEntry, 'termfleet');
    const termfleetPkg = termfleetDir ? readJsonSafe(join(termfleetDir, 'package.json')) : {};
    const deps = { ...(termfleetPkg.dependencies as Record<string, string> | undefined) };
    const ptyDepName = Object.keys(deps).find((d) => /pty/i.test(d));
    if (ptyDepName && termfleetDir) {
      let ptyResolved: string | undefined;
      try {
        ptyResolved = createRequire(join(termfleetDir, 'package.json')).resolve(ptyDepName);
      } catch {
        /* falls through to the "not resolvable" branch below */
      }
      if (!ptyResolved) {
        problems.push(`termfleet declares pty dependency '${ptyDepName}' but it does not resolve from node_modules — reinstall termfleet.`);
      } else {
        // Explicitly 'node' (never `process.execPath`): the published CLI always runs under node (its
        // shebang is `#!/usr/bin/env node`), and that is the runtime whose loader behavior this check must
        // reproduce — termfleet itself only ever runs under node. This also sidesteps a real bun quirk: bun's
        // OWN `-e` require() swallows an uncaught throw and exits 0 instead of propagating a nonzero status
        // (verified empirically), which would silently mask a genuine load failure whenever this check
        // itself happens to run under bun (`bun bin/open-autonomy.ts doctor`, the dev-mode `autonomy` script,
        // or `bun test`) — using 'node' here is correct AND immune to that.
        const load = spawnSync('node', ['-e', `require(${JSON.stringify(ptyResolved)})`], { encoding: 'utf8', env: process.env });
        if (load.status !== 0) {
          problems.push(
            `termfleet's pty module '${ptyDepName}' is installed but does not load under node ${process.versions.node} ` +
              `(${loaderErrorSummary(load.stderr || load.stdout || '')}) — the provider will crash at first launch. ` +
              `Fix: npm rebuild ${ptyDepName}.`,
          );
        } else {
          notes.push(`pty module '${ptyDepName}' loads cleanly`);
        }
      }
    }

    // d. workspace shadowing: termfleet/@termfleet/core resolving into the repo's own workspace/source tree.
    if (isWorkspaceShadow(termfleetEntry)) {
      problems.push(
        `'termfleet' resolves to a workspace source path (${termfleetEntry}), not a registry install — the runner ` +
          `would execute in-development code as its SDK. Run the loop from outside this workspace.`,
      );
    }
    const coreEntry = resolveFromRepo(cwd, '@termfleet/core/package.json');
    if (coreEntry && isWorkspaceShadow(coreEntry)) {
      problems.push(
        `'@termfleet/core' resolves to your repo's own workspace at ${dirname(coreEntry)}, shadowing the published ` +
          `dependency — the runner would execute your in-development code as its SDK. npm cannot prefer the registry ` +
          `package over a workspace link; run the loop from a directory outside this workspace, or rename/version-fence ` +
          `the colliding package.`,
      );
    }
  } else {
    notes.push('termfleet not installed yet — pty/shadowing checks skipped (run after `npm install termfleet`)');
  }
  // Self-reference collision: the REPO's own package name colliding with a bare specifier the vendored
  // runtime imports (backend.mjs: `termfleet`, `@termfleet/core`) — Node would resolve the bare specifier
  // to the repo's own package.json under npm workspaces/self-referencing, same hazard as (d) above.
  const ownName = (readJsonSafe(join(cwd, 'package.json')) as { name?: string }).name;
  if (ownName === 'termfleet' || ownName === '@termfleet/core') {
    problems.push(`this repo's own package.json is named '${ownName}', colliding with a runner dependency of the same name (Node self-reference) — rename it.`);
  }

  if (problems.length) return FAIL('env', problems.join(' | '), ['F-4', 'F-5', 'F-6']);
  return PASS('env', notes.join('; ') || 'toolchain + devDeps + pty + workspace checks all clean', ['F-4', 'F-5', 'F-6']);
}

// =========================================================================================================
// CHECK 3 — provider: reachability + IDENTITY on the configured ports (never a bare curl /).
// =========================================================================================================
function probeTcpOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* already closed */
      }
      resolve(v);
    };
    const sock = createConnection({ host, port });
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}
function lsofOccupant(port: number): string | undefined {
  try {
    const r = spawnSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-Fpc'], { encoding: 'utf8', env: process.env });
    if (r.status !== 0) return undefined;
    let pid: string | undefined;
    let cmd: string | undefined;
    for (const l of (r.stdout || '').split('\n')) {
      if (l.startsWith('p')) pid = l.slice(1);
      if (l.startsWith('c')) cmd = l.slice(1);
    }
    return pid ? `pid ${pid}${cmd ? ` (${cmd})` : ''}` : undefined;
  } catch {
    return undefined;
  }
}
function portOf(url: string): number | undefined {
  try {
    const p = Number(new URL(url).port);
    return p || undefined;
  } catch {
    return undefined;
  }
}

export async function checkProvider(cwd: string): Promise<CheckResult> {
  const pinned = process.env.TERMFLEET_PROVIDER_URL;
  const localProviders = await importFromRepo(cwd, '@termfleet/core/local-providers.js');
  const termfleetSdk = await importFromRepo(cwd, 'termfleet');
  if (!localProviders || !termfleetSdk) {
    return SKIP('provider', 'termfleet is not installed in this repo yet — provider identity cannot be checked until it is (npm install termfleet)', ['F-8']);
  }

  let resolved: { baseUrl: string; source: string; label?: string } | undefined;
  try {
    resolved = await localProviders.resolveDefaultProvider({ url: pinned });
  } catch {
    /* no live/pinned provider found via SDK discovery -- fall through to the raw occupant probe below */
  }

  if (resolved) {
    // `client.snapshot()` opens a socket.io connection under the hood — against a non-termfleet occupant
    // (a plain HTTP server, or anything that never completes a socket.io handshake) it can hang far past
    // any reasonable check budget instead of erroring, which would make doctor itself the zombie this
    // whole spec exists to catch. Race it against a short, explicit timeout and always disconnect the
    // client on the way out, so a stuck occupant can never keep this check (or the process) alive.
    const client = new termfleetSdk.ProviderClient(termfleetSdk.providerRefFromUrl(resolved.baseUrl));
    try {
      const snap = await withTimeout<any>(client.snapshot(), 5000);
      // The occupant's SELF-REPORTED identity from its own snapshot — provider kind + instanceId + live
      // session count. This is the strongest identity signal the SDK surface exposes; doctor does NOT get a
      // cryptographic ownership proof, and this install carries no declared "expected provider prefix" to
      // compare against, so doctor deliberately does NOT claim the provider is "yours". (AC-5 partial
      // coverage, disclosed in the proof: a foreign termfleet provider that answers on the pinned port is
      // reported here with its identity so the operator can eyeball the mismatch, rather than doctor
      // asserting an ownership it can't verify.)
      const identity = [snap.provider ? `kind '${snap.provider}'` : undefined, snap.instanceId ? `instance ${snap.instanceId}` : undefined]
        .filter(Boolean)
        .join(', ');
      const sessions = (snap.windows ?? []).length;
      if (pinned) {
        return PASS(
          'provider',
          `${resolved.baseUrl} (the pinned TERMFLEET_PROVIDER_URL) is serving a termfleet provider — ` +
            `${identity || 'no identity fields reported'}, ${sessions} live session(s). doctor confirms it is REACHABLE and ` +
            `speaks termfleet; it cannot verify OWNERSHIP from a bare URL pin — confirm this instance/kind is the one you ` +
            `started, not a co-tenant's, before dispatching.`,
          ['F-8'],
        );
      }
      return WARN(
        'provider',
        `no TERMFLEET_PROVIDER_URL pin — auto-discovery is in effect; it found ${resolved.baseUrl} ` +
          `(${resolved.label ? `${resolved.label}, ` : ''}${identity || 'no identity fields reported'}, ${sessions} live ` +
          `session(s)), owned by whoever started it. Pin TERMFLEET_PROVIDER_URL and confirm the instance is yours.`,
        ['F-8'],
      );
    } catch {
      /* resolved a URL but it didn't actually answer the SDK (error OR timeout) -- name the occupant below */
    } finally {
      try {
        client.disconnect();
      } catch {
        /* best-effort -- nothing to disconnect if it never connected */
      }
    }
  }

  const candidates = (pinned ? [portOf(pinned)] : [7373, 7402]).filter((p): p is number => typeof p === 'number');
  for (const port of candidates) {
    if (await probeTcpOpen('127.0.0.1', port)) {
      const occ = lsofOccupant(port);
      return FAIL(
        'provider',
        `port ${port} is occupied but it is NOT answering as this install's termfleet provider — ` +
          `${occ ? `occupant: ${occ}` : 'occupant unidentified (lsof unavailable)'}. A plain "the port answered something" ` +
          `is never "nothing running": attaching this loop to a foreign occupant would grant launch rights on a shared ` +
          `box. Fix: run your own console/provider on repo-unique ports and pin TERMFLEET_PROVIDER_URL=<url> everywhere ` +
          `the loop runs.`,
        ['F-8'],
      );
    }
  }
  return SKIP('provider', 'no provider is running yet — start termfleet before dispatching (docs/OPERATIONS.md#local-runner-quickstart step 2)', ['F-8']);
}

// =========================================================================================================
// CHECK 4 — auth: coding-CLI sign-in ACTUALLY verified (never `--version`).
// =========================================================================================================
const INTROSPECTION: Record<string, { cmd: string; args: string[] }> = {
  claude: { cmd: 'claude', args: ['auth', 'status'] },
  codex: { cmd: 'codex', args: ['login', 'status'] },
};
const UNSUPPORTED_SUBCOMMAND = /unknown (sub)?command|not a (claude |codex )?command|no such (sub)?command|unrecognized/i;
const LOGGED_OUT = /not (logged|signed) in|unauthenticated|please (log|sign) in|no (active )?session/i;

export function checkAuth(): CheckResult {
  const harness = process.env.TERMFLEET_AGENT || 'claude';
  const spec = INTROSPECTION[harness];
  if (!spec) {
    return WARN('auth', `no known non-spending introspection command for harness "${harness}" — cannot verify sign-in without --live`, ['F-13']);
  }
  const r = spawnSync(spec.cmd, spec.args, { encoding: 'utf8', timeout: 15000, env: process.env });
  if (r.error) {
    return FAIL('auth', `the '${spec.cmd}' CLI is not installed on PATH (${(r.error as Error).message}) — install it first.`, ['F-13']);
  }
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (UNSUPPORTED_SUBCOMMAND.test(out)) {
    return WARN(
      'auth',
      `'${spec.cmd} ${spec.args.join(' ')}' is not supported by this CLI version — cannot verify sign-in without a model ` +
        `call ('${spec.cmd} --version' succeeding does not mean signed in); re-run with --live to prove it.`,
      ['F-13'],
    );
  }
  if (r.status === 0 && !LOGGED_OUT.test(out)) {
    return PASS('auth', `'${spec.cmd} ${spec.args.join(' ')}' reports a signed-in identity.`, ['F-13']);
  }
  return FAIL(
    'auth',
    `the '${spec.cmd}' CLI is installed but NOT signed in ('${spec.cmd} --version' succeeding does not mean signed in). ` +
      `Fix: run '${spec.cmd}' then '/login' (or 'codex login'), and re-run doctor.`,
    ['F-13'],
  );
}

// =========================================================================================================
// CHECK 5 — harness integrity, proven from a FRESHLY CREATED worktree (the load-bearing check).
// =========================================================================================================
export interface HarnessProbe {
  result: CheckResult;
  worktree?: string;
  branch?: string;
  base?: string;
  sha?: string;
  manifestFiles?: string[];
}
interface ProbeRestore {
  excludePath?: string; // .git/info/exclude — the OA-02 ensureRunnerPathsIgnored appends to it
  excludeExisted: boolean;
  excludeBytes?: Buffer;
  worktreesRoot: string; // <cwd>/.worktrees
  worktreesPreexisted: boolean;
}
interface ProbeController {
  cwd: string;
  branch: string;
  worktree?: string; // recorded from the child's stdout; may be undefined if a signal beat the recording
  restore?: ProbeRestore;
}
let activeProbe: ProbeController | undefined;

/** The worktree path the runner would have created for `branch` — path SANITIZATION only (mirrors
 *  runner-frontend's worktreePathFor), never the base-ref DECISION the anti-drift rule protects. Used only
 *  as a last-resort fallback for cleanup; git's own records (worktreePathForBranch) are preferred. */
function probeWorktreePath(cwd: string, branch: string): string {
  return join(cwd, '.worktrees', branch.replace(/[^0-9A-Za-z._-]/g, '-'));
}
/** Ask git itself which worktree (if any) holds `branch` — authoritative even when doctor never recorded
 *  the path (a signal / spawn-timeout landing after `git worktree add` but before doctor read stdout). */
function worktreePathForBranch(cwd: string, branch: string): string | undefined {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', env: process.env });
  if (r.status !== 0) return undefined;
  let currentPath: string | undefined;
  for (const line of (r.stdout || '').split('\n')) {
    if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
    else if (line === `branch refs/heads/${branch}` && currentPath) return currentPath;
  }
  return undefined;
}

export function cleanupProbe(): void {
  if (!activeProbe) return;
  const { cwd, branch, worktree, restore } = activeProbe;
  activeProbe = undefined; // clear FIRST so a re-entrant signal can't double-run this
  const warn = (m: string) => process.stderr.write(`doctor: ${m}\n`);

  // 1. Remove the probe worktree. Prefer git's own record (survives the pre-record signal window), then the
  //    recorded path, then the derived path — a `git worktree remove --force` on a path that was never a
  //    worktree is a harmless no-op; only a SURVIVING worktree afterward is a real leak, warned in step 3.
  const wtPath = worktreePathForBranch(cwd, branch) ?? worktree ?? probeWorktreePath(cwd, branch);
  const rmWt = spawnSync('git', ['worktree', 'remove', '--force', wtPath], { cwd, encoding: 'utf8', env: process.env });
  spawnSync('git', ['worktree', 'prune'], { cwd, env: process.env }); // drop any stale admin entry

  // 2. Delete the probe branch (git refuses this while the branch is checked out in a worktree — hence
  //    strictly after step 1).
  const rmBr = spawnSync('git', ['branch', '-D', branch], { cwd, encoding: 'utf8', env: process.env });

  // 3. VERIFY both removals took; WARN loudly (never discard the status) on residue.
  if (existsSync(wtPath)) warn(`cleanup could not remove probe worktree ${wtPath}: ${(rmWt.stderr || rmWt.stdout || '').trim() || `exit ${rmWt.status}`}`);
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd, env: process.env }).status === 0)
    warn(`cleanup could not remove probe branch ${branch}: ${(rmBr.stderr || rmBr.stdout || '').trim() || `exit ${rmBr.status}`}`);

  // 4. Restore .git/info/exclude BYTE-for-byte — the probe ran through OA-02's ensureRunnerPathsIgnored,
  //    which appends `.worktrees/`, `node_modules`, `.open-autonomy/runner-state/` when missing; the
  //    read-only guarantee requires verbatim restoration (read bytes → write bytes back), not a line-strip.
  if (restore?.excludePath) {
    try {
      if (restore.excludeExisted && restore.excludeBytes !== undefined) writeFileSync(restore.excludePath, restore.excludeBytes);
      else if (!restore.excludeExisted && existsSync(restore.excludePath)) rmSync(restore.excludePath); // we created it — remove it
    } catch (e) {
      warn(`cleanup could not restore .git/info/exclude (${restore.excludePath}): ${(e as Error).message}`);
    }
  }

  // 5. If doctor created the .worktrees/ container and it is now empty, remove it — a clean run leaves no
  //    residue. Guarded: only when it did NOT pre-exist AND is genuinely empty (rmdir, never a recursive rm).
  if (restore && !restore.worktreesPreexisted && existsSync(restore.worktreesRoot)) {
    try {
      if (readdirSync(restore.worktreesRoot).length === 0) rmdirSync(restore.worktreesRoot);
    } catch {
      /* non-empty (a concurrent runner/probe artifact) or racing — leave it; git status stays clean either way */
    }
  }
}
process.on('exit', cleanupProbe);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    cleanupProbe();
    process.exit(130);
  });
}

/** Capture the two things OA-02's ensureRunnerPathsIgnored (which the worktree-probe runs through) will
 *  mutate, so cleanupProbe can restore them and keep doctor's read-only guarantee airtight. */
function snapshotProbeMutations(cwd: string): ProbeRestore {
  const commonDir = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', env: process.env }).stdout.trim();
  const excludePath = commonDir ? join(resolve(cwd, commonDir), 'info', 'exclude') : undefined;
  const excludeExisted = excludePath ? existsSync(excludePath) : false;
  const worktreesRoot = join(cwd, '.worktrees');
  return {
    excludePath,
    excludeExisted,
    excludeBytes: excludeExisted ? readFileSync(excludePath!) : undefined,
    worktreesRoot,
    worktreesPreexisted: existsSync(worktreesRoot),
  };
}

export async function checkHarness(cwd: string, branchPrefix: string): Promise<HarnessProbe> {
  const manifestPath = join(cwd, GENERATED_MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    return {
      result: FAIL(
        'harness',
        "no .open-autonomy/generated.json — this directory is not a compiled install (or predates the manifest); run 'npx open-autonomy compile <profile> local .'",
        ['F-2', 'F-3'],
      ),
    };
  }
  const manifestFiles = readGeneratedManifest(cwd);
  const problems: string[] = [];
  // Files check (b) already explains as uncommitted/gitignored — if the worktree probe (d) ALSO reports
  // one of these missing, that's simply a CONSEQUENCE of it not being committed (a worktree only ever
  // materializes committed files), not a fresh finding. Tracked so (d)'s F-2-wedge message is reserved for
  // files that are genuinely clean+tracked on the trunk yet still absent from the probe worktree — the
  // actual base-ref-mismatch signature — instead of restating (b)'s own uncommitted-files message.
  const explainedByCommitState = new Set<string>();

  // a. every manifest path exists in the working tree.
  const missingOnDisk = manifestFiles.filter((f) => !existsSync(join(cwd, f)));
  if (missingOnDisk.length) problems.push(`missing from the working tree (${missingOnDisk.length}): ${missingOnDisk.join(', ')}`);

  // b. every manifest path is tracked and clean.
  const isGitRepo = spawnSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'ignore', env: process.env }).status === 0;
  if (isGitRepo && manifestFiles.length) {
    const status = spawnSync('git', ['status', '--porcelain', '--', ...manifestFiles], { cwd, encoding: 'utf8', env: process.env });
    const statusPaths = (status.stdout || '')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        const raw = l.slice(3);
        return raw.includes(' -> ') ? raw.slice(raw.lastIndexOf(' -> ') + 4) : raw;
      });
    const lsFiles = spawnSync('git', ['ls-files', '--', ...manifestFiles], { cwd, encoding: 'utf8', env: process.env });
    const tracked = new Set((lsFiles.stdout || '').split('\n').filter((l) => l.length > 0));
    const statusSet = new Set(statusPaths);
    const untrackedSilent = manifestFiles.filter((f) => !tracked.has(f) && !statusSet.has(f));
    const gitignored = untrackedSilent.filter((f) => existsSync(join(cwd, f)));
    const dirty = statusPaths.concat(untrackedSilent.filter((f) => !existsSync(join(cwd, f))));
    if (dirty.length) {
      problems.push(
        `${dirty.length} compile-owned file(s) are uncommitted (agents run in git worktrees, which see only committed ` +
          `files — every worker will die at launch): ${dirty.join(', ')}. Fix: git add ${dirty.join(' ')} && git commit.`,
      );
      for (const f of dirty) explainedByCommitState.add(f);
    }
    if (gitignored.length) {
      problems.push(
        `${gitignored.length} compile-owned file(s) are gitignored (untracked, so invisible to a worktree): ` +
          `${gitignored.join(', ')}. Fix: git add -f ${gitignored.join(' ')} && git commit.`,
      );
      for (const f of gitignored) explainedByCommitState.add(f);
    }
  }

  // c. create a real worktree through the RUNNER'S OWN worktree-probe entry point (never a doctor
  // reimplementation of the base-ref decision — see runner-frontend.ts's worktreeProbe/ensureWorktree).
  const branch = `${branchPrefix}/probe-${Date.now()}-${process.pid}`;
  let worktree: string | undefined;
  let base: string | undefined;
  let sha: string | undefined;
  const bunAvailable = !!toolOutput('bun', ['--version']);
  const runnerTsExists = existsSync(join(cwd, 'scripts', 'runner.ts'));
  if (!bunAvailable) {
    problems.push('bun is not on PATH — cannot run the worktree probe (bun scripts/runner.ts worktree-probe)');
  } else if (!runnerTsExists) {
    problems.push("scripts/runner.ts is missing — cannot probe the runner's own worktree creation (no local runner in this install?)");
  } else {
    // Snapshot what the probe (via OA-02's ensureRunnerPathsIgnored) is about to touch, so cleanupProbe can
    // restore it verbatim (read-only guarantee): .git/info/exclude bytes + whether .worktrees/ pre-existed.
    const restore = snapshotProbeMutations(cwd);
    activeProbe = { cwd, branch, restore }; // registered BEFORE the probe runs so a signal mid-creation still cleans up
    const r = spawnSync('bun', ['scripts/runner.ts', 'worktree-probe', branch], { cwd, encoding: 'utf8', timeout: 60000, env: process.env });

    // Test-only seam (never set in real use): simulate a signal landing in the window AFTER the child
    // created the worktree on disk but BEFORE doctor records its path (activeProbe.worktree still unset) —
    // the untested leak the panel flagged. cleanupProbe must still remove the worktree (via git's records).
    const preRecordHoldMs = Number(process.env.OA_DOCTOR_TEST_HOLD_BEFORE_RECORD_MS || 0);
    if (preRecordHoldMs > 0) await sleep(preRecordHoldMs);

    if (r.status !== 0) {
      const out = (r.stderr || r.stdout || '').trim();
      if (r.status === 2 && /unknown command/i.test(out)) {
        // CONCERN 6: a pre-OA-18 install's scripts/runner.ts has no `worktree-probe` verb — the single most
        // common field FAIL now that doctor is INSTALL-AGENT.md's first mechanical gate for EXISTING adopters.
        problems.push(
          "this install's scripts/runner.ts predates the 'worktree-probe' verb (OA-18) — its harness worktree " +
            'integrity cannot be proven until the runner is refreshed. Re-compile/upgrade the harness ' +
            '(npx open-autonomy compile <profile> local . , or open-autonomy upgrade), then commit and re-run doctor.',
        );
      } else {
        problems.push(`worktree-probe failed: ${out || `exit ${r.status}`}`);
      }
    } else {
      const parsed = lastJsonLine<{ branch: string; worktree: string; base: string; sha: string }>(r.stdout || '');
      if (!parsed) {
        problems.push('worktree-probe produced no parseable output');
      } else {
        ({ worktree, base, sha } = parsed);
        activeProbe.worktree = worktree;

        // Test-only seam (never set in real use): holds the process here, with the probe worktree already
        // created AND recorded, for a deterministic window a test can send SIGINT/SIGTERM into — proving the
        // read-only guarantee (AC-12: "including a kill -INT mid-run") without a timing-dependent race.
        const holdMs = Number(process.env.OA_DOCTOR_TEST_HOLD_PROBE_MS || 0);
        if (holdMs > 0) await sleep(holdMs);

        // d. inside that fresh worktree, every manifest path exists with bytes identical to the main checkout.
        const missingInWorktree: string[] = [];
        const mismatched: string[] = [];
        for (const f of manifestFiles) {
          const wtPath = join(worktree!, f);
          if (!existsSync(wtPath)) {
            missingInWorktree.push(f);
            continue;
          }
          const trunkPath = join(cwd, f);
          if (existsSync(trunkPath) && !readFileSync(trunkPath).equals(readFileSync(wtPath))) mismatched.push(f);
        }
        // Files (b) already flagged as uncommitted/gitignored are EXPECTED to be missing from any worktree
        // (worktrees only ever materialize committed files) — don't restate that as a fresh F-2 finding.
        // Only a file that is clean+tracked on the trunk yet STILL missing from the probe worktree is the
        // genuine base-ref-mismatch signature (the pre-OA-02 origin/<trunk> wedge).
        const genuinelyStale = missingInWorktree.filter((f) => !explainedByCommitState.has(f));
        if (genuinelyStale.length) {
          problems.push(
            `the runner based its worktree on ${base} @ ${sha}, which is missing ${genuinelyStale.length} compile-owned ` +
              `file(s) present (committed, clean) on your local trunk: ${genuinelyStale.join(', ')}. Your install's runner ` +
              `bases new worktrees on the fetched remote trunk whenever an 'origin' remote exists (scripts/runner.ts ` +
              `ensureWorktree) — so on this repo the harness is invisible to agents until it reaches origin/<trunk>. This ` +
              `contradicts the fully-local guarantee (known defect, fixed by OA-02); until your install carries that fix: ` +
              `push the harness branch, or upgrade open-autonomy.`,
          );
        }
        if (mismatched.length) problems.push(`byte mismatch between trunk and the probe worktree for: ${mismatched.join(', ')}`);
      }
    }
  }

  const detail = problems.length
    ? problems.join(' | ')
    : `all ${manifestFiles.length} compile-owned file(s) present, tracked, clean` +
      (worktree ? `; runner based its probe worktree on ${base} @ ${sha}, byte-identical` : '');
  return {
    result: problems.length ? FAIL('harness', detail, ['F-2', 'F-3']) : PASS('harness', detail, ['F-2', 'F-3']),
    worktree,
    branch,
    base,
    sha,
    manifestFiles,
  };
}

// =========================================================================================================
// CHECK 6 — skills: resolution in the check-5 probe worktree.
// =========================================================================================================
interface ManifestAgentLike {
  kind?: 'agent' | 'human';
  skill?: string;
}
interface AutonomyManifestLike {
  agents?: Record<string, ManifestAgentLike>;
}

export function checkSkills(harness: HarnessProbe): CheckResult {
  if (!harness.worktree) {
    return SKIP('skills', `skipped — the 'harness' check could not create a probe worktree (${harness.result.detail})`, ['F-3']);
  }
  const manifestYamlPath = join(harness.worktree, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(manifestYamlPath)) {
    return FAIL('skills', 'no .open-autonomy/autonomy.yml in the probe worktree — cannot resolve dispatchable agents', ['F-3']);
  }
  let manifest: AutonomyManifestLike;
  try {
    manifest = parseYaml(readFileSync(manifestYamlPath, 'utf8')) as AutonomyManifestLike;
  } catch (e) {
    return FAIL('skills', `.open-autonomy/autonomy.yml in the probe worktree does not parse: ${(e as Error).message}`, ['F-3']);
  }
  const harnessName = process.env.TERMFLEET_AGENT || 'claude';
  const problems: string[] = [];
  let checked = 0;
  for (const [role, agent] of Object.entries(manifest.agents ?? {})) {
    if (agent.kind === 'human') continue; // parked, never launched -- see runner-frontend.ts's human route
    const behavior = agent.skill;
    if (!behavior || isScript(behavior)) continue; // a script agent has no SKILL.md / launch prompt
    checked++;
    const promptPath = join(harness.worktree, 'scripts', 'prompts', harnessName, `${role}.txt`);
    if (!existsSync(promptPath)) {
      problems.push(
        `agent '${role}' would die at launch with "Unknown command: /${behavior}" — scripts/prompts/${harnessName}/${role}.txt ` +
          `is missing from the agent worktree.`,
      );
    } else {
      const marker = harnessName === 'codex' ? `$${behavior}` : `/${behavior}`;
      if (!readFileSync(promptPath, 'utf8').includes(marker)) {
        problems.push(`agent '${role}': its launch prompt does not reference skill '${marker}'.`);
      }
    }
    for (const dir of ['.claude', '.codex']) {
      const skillPath = join(harness.worktree, dir, 'skills', behavior, 'SKILL.md');
      if (!existsSync(skillPath)) {
        problems.push(
          `agent '${role}' would die at launch with "Unknown command: /${behavior}" — ${dir}/skills/${behavior}/SKILL.md ` +
            `is missing from the agent worktree (present on your working tree but not at the worktree base; see the ` +
            `'harness' check).`,
        );
        continue;
      }
      const name = readFileSync(skillPath, 'utf8').match(/^name:\s*(.+?)\s*$/m)?.[1];
      if (name !== behavior) {
        problems.push(
          `agent '${role}' would die at launch with "Unknown command: /${behavior}" — ${dir}/skills/${behavior}/SKILL.md ` +
            `frontmatter name '${name ?? '(missing)'}' ≠ folder '${behavior}' (the launch trigger resolves by name).`,
        );
      }
    }
  }
  if (problems.length) return FAIL('skills', problems.join(' | '), ['F-3']);
  return PASS('skills', `${checked} dispatchable agent(s) resolve to a name-matching skill file in the probe worktree.`, ['F-3']);
}

// =========================================================================================================
// CHECK 7 — --live: one real tick that launches a worker which SURVIVES launch.
// =========================================================================================================
const LIVE_FINDINGS = ['F-2', 'F-3', 'F-8', 'F-12', 'F-13'];

/** The session id (terminalId) the install's own launch chain prints as its last JSON line
 *  (autonomy-runner.mjs's `launch` → `console.log(JSON.stringify({ id, agent, ... }))`, forwarded up
 *  through run-agent.mjs's inherited stdio). */
function sessionIdFromLaunch(stdout: string): string | undefined {
  const o = lastJsonLine<{ id?: unknown }>(stdout);
  return o && typeof o.id === 'string' ? o.id : undefined;
}
/** Run the install's OWN runner CLI (`node scripts/autonomy-runner.mjs <verb> …`) — the same backend a PM
 *  dispatch's list/cancel go through — in the probe worktree, with the ambient env (so the provider pin is
 *  INHERITED, never re-injected). Returns parsed JSON or undefined. */
function runnerCli<T>(cwd: string, worktree: string, args: string[]): T | undefined {
  const r = spawnSync('node', [join(cwd, 'scripts', 'autonomy-runner.mjs'), ...args], {
    cwd: worktree,
    encoding: 'utf8',
    timeout: 30000,
    env: process.env,
  });
  try {
    return JSON.parse(r.stdout || 'null') as T;
  } catch {
    return undefined;
  }
}

export async function checkLive(cwd: string, harness: HarnessProbe, skills: CheckResult): Promise<CheckResult> {
  // 5 gates 7: no probe worktree → nothing to launch into.
  if (!harness.worktree) {
    return SKIP('live', `skipped — the 'harness' check could not create a probe worktree (${harness.result.detail})`, LIVE_FINDINGS);
  }
  // 6 gates 7 (spec "5–6 gate 7"): never spend a real session on an install whose agents can't even resolve
  // their skills — that session is guaranteed to die at launch, so spending on it proves nothing new.
  if (skills.status !== 'PASS') {
    return SKIP('live', `skipped — the 'skills' check did not PASS (${skills.status}); a live session would spend on an install whose agents can't resolve their skills`, LIVE_FINDINGS);
  }
  // The live probe launches through the install's OWN dispatch chain (below), which needs termfleet resolvable.
  if (!resolveFromRepo(cwd, 'termfleet')) {
    return FAIL('live', 'termfleet is not installed in this repo — cannot launch a real session (npm install termfleet).', LIVE_FINDINGS);
  }
  const runAgent = join(cwd, 'scripts', 'run-agent.mjs');
  if (!existsSync(runAgent)) {
    return FAIL('live', 'scripts/run-agent.mjs is missing — this is not a local-runner install; cannot launch through the dispatch path.', LIVE_FINDINGS);
  }

  // A doctor-owned agent + prompt, delivered exactly the way a real dispatch delivers one: through
  // AUTONOMY_PROMPT_DIR (run-agent.mjs → autonomy-runner.mjs reads `${AUTONOMY_PROMPT_DIR}/<agent>.txt`).
  const agent = `oa-doctor-probe-${process.pid}`;
  const promptDir = mkdtempSync(join(tmpdir(), 'oa-doctor-live-prompt-'));
  writeFileSync(join(promptDir, `${agent}.txt`), 'Reply with exactly DOCTOR-OK and nothing else, then stop.\n');
  const surviveMs = Number(process.env.OA_DOCTOR_LIVE_SURVIVE_MS || 30000);
  const launchTimeoutMs = Number(process.env.TERMFLEET_LAUNCH_TIMEOUT_MS || 180000);

  try {
    // LAUNCH — through the install's real entry point (run-agent.mjs → autonomy-runner.mjs launch → the SDK),
    // the SAME path a PM dispatch takes. Crucially, TERMFLEET_PROVIDER_URL is NOT set on a setupCommand here —
    // it is left to be INHERITED from doctor's own ambient env by the child launch, which is exactly the F-8
    // pin-inheritance property this check exists to prove (a doctor-injected pin would MASK that failure).
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AUTONOMY_AGENT: agent,
      AUTONOMY_PROMPT_DIR: promptDir,
    };
    const launch = spawnSync('node', [runAgent], { cwd: harness.worktree, encoding: 'utf8', timeout: launchTimeoutMs, env });
    const terminalId = sessionIdFromLaunch(launch.stdout || '');
    if (!terminalId) {
      return FAIL(
        'live',
        `the worker died at launch — the dispatch chain (run-agent.mjs → autonomy-runner.mjs) produced no ` +
          `session id. Launch output:\n${((launch.stderr || launch.stdout || '') as string).trim().slice(-1500) || '(no output)'}`,
        LIVE_FINDINGS,
      );
    }

    // SURVIVAL — poll the install's OWN `runner list` (autonomy-runner.mjs list), the same backend a PM's
    // WIP/dedup check reads, for the survival window. Disappearing before the window ends means it died at
    // launch (unless it emitted DOCTOR-OK — checked via a terminal capture below).
    const start = Date.now();
    let alive = true;
    const pollMs = Math.max(500, Math.min(2000, surviveMs));
    while (Date.now() - start < surviveMs) {
      const sessions = runnerCli<Array<{ id: string }>>(cwd, harness.worktree, ['list']) ?? [];
      if (!sessions.some((s) => s.id === terminalId)) {
        alive = false;
        break;
      }
      await sleep(pollMs);
    }

    // On a non-survivor, capture the terminal (the evidence that today dies inside tmux) to distinguish a
    // clean "finished after emitting DOCTOR-OK" from a real death. Terminal capture is SDK-only (the runner
    // CLI doesn't expose it) — an observe-only read, timeout-guarded, best-effort.
    let capture = '';
    let sawOk = false;
    if (!alive) {
      const termfleetSdk = await importFromRepo(cwd, 'termfleet');
      const localProviders = await importFromRepo(cwd, '@termfleet/core/local-providers.js');
      if (termfleetSdk && localProviders) {
        try {
          const provider = await localProviders.resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL });
          const client = new termfleetSdk.ProviderClient(termfleetSdk.providerRefFromUrl(provider.baseUrl));
          try {
            const cap = await withTimeout<any>(client.captureTerminal(terminalId, 40), 5000);
            capture = cap?.content ?? '';
          } finally {
            try {
              client.disconnect();
            } catch {
              /* best-effort */
            }
          }
        } catch {
          /* provider unreachable / session already gone — capture stays empty */
        }
      }
      sawOk = capture.includes('DOCTOR-OK');
    }

    // ALWAYS cancel through the install's OWN runner (autonomy-runner.mjs cancel <id>) — same path an
    // operator/PM uses; best-effort, its own timeout.
    runnerCli(cwd, harness.worktree, ['cancel', terminalId]);

    if (!alive && !sawOk) {
      return FAIL(
        'live',
        `the worker died within ~${Math.round((Date.now() - start) / 1000)}s of launch. Terminal capture:\n${capture.slice(0, 1500) || '(no capture — session already reaped)'}`,
        LIVE_FINDINGS,
      );
    }
    return PASS(
      'live',
      `session ${terminalId} ${sawOk ? 'emitted DOCTOR-OK' : `survived the ${surviveMs / 1000}s window`}; launched via ` +
        `scripts/run-agent.mjs (the PM dispatch path, pin inherited), cancelled via scripts/autonomy-runner.mjs.`,
      LIVE_FINDINGS,
    );
  } finally {
    rmSync(promptDir, { recursive: true, force: true }); // mkdtemp path only — never a bare variable
  }
}

// =========================================================================================================
// Orchestration + reporting.
// =========================================================================================================
export interface DoctorReport {
  checks: CheckResult[];
  verdict: 'PASS' | 'FAIL';
}

/** Run every check in the audit's failure-chain order and return the full report. Exported so tests (and
 *  the spend-gate proof) can drive the checks directly without spawning a child process.
 *  `selfBaseDirOverride` is check 1's test-only seam (see profilesRootFor's comment) — never set in real use. */
export async function runDoctor(
  cwd: string,
  opts: { live: boolean; branchPrefix: string; selfBaseDirOverride?: string },
): Promise<DoctorReport> {
  const checks: CheckResult[] = [];
  checks.push(await checkSelf(cwd, opts.selfBaseDirOverride));
  checks.push(checkEnv(cwd));
  checks.push(await checkProvider(cwd));
  checks.push(checkAuth());
  const harness = await checkHarness(cwd, opts.branchPrefix);
  checks.push(harness.result);
  const skills = checkSkills(harness);
  checks.push(skills);
  // --live is the ONLY branch that ever launches a session or makes a model call (the spend guarantee,
  // AC-11) -- checkLive is simply never called otherwise, not merely gated inside it. When it IS called,
  // it self-gates on 5 (harness worktree) AND 6 (skills PASS) — the spec's "5–6 gate 7".
  checks.push(
    opts.live
      ? await checkLive(cwd, harness, skills)
      : SKIP('live', 'not run — pass --live to launch one real session and prove the loop end-to-end (spend guarantee: no session/model call without --live).', ['F-2', 'F-3', 'F-8', 'F-12', 'F-13']),
  );
  cleanupProbe();
  const verdict: DoctorReport['verdict'] = checks.some((c) => c.status === 'FAIL') ? 'FAIL' : 'PASS';
  return { checks, verdict };
}

const STATUS_GLYPH: Record<CheckStatus, string> = { PASS: '✓', FAIL: '✗', WARN: '!', SKIP: '-' };
/** Render the report as the human-readable report text (a single string, so the caller can write it and
 *  ONLY THEN exit — a bare console.log + immediate process.exit() can truncate a long FAIL detail). */
export function renderHuman(report: DoctorReport): string {
  const lines = ['open-autonomy doctor — proving the local-runner install end-to-end (audit failure-chain order)\n'];
  for (const c of report.checks) lines.push(`[${STATUS_GLYPH[c.status]}] ${c.status.padEnd(4)} ${c.id.padEnd(9)} ${c.detail}`);
  lines.push(`\ndoctor: ${report.verdict === 'PASS' ? 'OK — no FAILs' : 'FAILED — fix the FAIL(s) above and re-run.'}`);
  return lines.join('\n');
}
