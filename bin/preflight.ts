#!/usr/bin/env node
// open-autonomy preflight — make an adopter repo install-ready, STRUCTURALLY, so the environment
// gotchas the first live install hit never reach the operator. Run from the adopter repo root AFTER
// installing the runner deps (`npm install termfleet` + `npm install -D ztrack`), BEFORE committing the
// harness. Idempotent — safe to re-run.
//
//   0. dev-dependency installability — `NODE_ENV=production` (or any npm config that resolves to
//      `omit=dev`: npm_config_omit, a persisted `.npmrc` omit=dev, the legacy production=true) makes
//      `npm install -D ztrack` exit 0 and install NOTHING — the pin lands in package.json, node_modules
//      stays untouched, and ztrack's own hint then prescribes the exact command that just no-opped (see
//      docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md). Run FIRST — a poisoned install
//      environment explains any later missing-module symptom the checks below would otherwise report as
//      an unrelated crash.
//   1. namespace collisions — an npm-workspace host (or a workspace member of one) whose package NAME
//      collides with the runner's own dependency namespace (termfleet, @termfleet/core, ztrack, and their
//      transitive deps) silently shadows or self-references the published package (see
//      docs/adoption-fixes/OA-04-workspace-name-collision-detection.md). Implemented in ./collision-check.ts
//      (shared with bin/autonomy-compile.ts's compile-time gate).
//   2. node-pty — termfleet's PTY provider dependency (today @homebridge/node-pty-prebuilt-multiarch,
//      discovered from termfleet's OWN package.json — never hardcoded) ships prebuilt natives, not source;
//      the health check that matters is "does it load under this Node", verified with a real `require` in a
//      child `node` process — never a compiled-artifact path guess (build/Release/pty.node), which a healthy
//      prebuilt install never has and which used to false-fail every clean install (see
//      docs/adoption-fixes/OA-05-preflight-false-pty-failure.md). Rebuilding only runs (and its output is
//      only shown) when the load probe actually fails, and success/failure is decided by a re-probe, not by
//      npm's own "rebuilt dependencies successfully" text — so this can never again print a false FAILED
//      next to a real success.
//   3. termfleet port/provider coexistence — on every fleet dev box termfleet already runs as machine-wide
//      infrastructure (F-8, docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md): the
//      documented default ports (7373/7402) may already be held by the box's OWN provider, and a naive
//      `curl -fsS .../` probe misreads an occupied port as free (a provider answers `/` with 404). Probe
//      each candidate port's `/healthz` + body shape (never the root path) to classify it free / termfleet
//      provider (kind + instanceId) / termfleet console / a foreign HTTP service — naming the occupant via
//      `ss`/`lsof` when the HTTP shape doesn't identify it — and read the machine-global
//      `~/.termfleet/{providers/*.json,current.json}` state an UNPINNED loop's resolution chain would
//      actually consult. Runs entirely over plain TCP/HTTP (never the termfleet SDK) so it works even
//      before `npm install termfleet`.
//   4. lockfile — adding the runner deps under a different Node/npm than the repo's CI can desync
//      package-lock.json so the repo's CI `npm ci` rejects it ("package.json and package-lock.json are not in
//      sync") — and `npm run build` passes locally (it reuses node_modules) so it only surfaces in CI, on the
//      first agent PR. We verify `npm ci` under the repo's *CI Node version* in a throwaway copy (the repo's
//      node_modules is never touched) and regenerate the lock under that Node if it's out of sync.
import { existsSync, readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkNamespaceCollisions } from './collision-check.ts';

const cwd = process.cwd();
let failed = false;
let cautioned = false;
const note = (m: string) => console.log(`preflight: ${m}`);
const warn = (m: string) => { console.log(`preflight: ! ${m}`); failed = true; };
// Third output tier (OA-06): a PROMINENT `!`-prefixed line, same as warn(), but never sets `failed` — for
// a condition worth the operator's attention (an environment that silently no-ops `npm install -D`) that
// preflight must not itself fail the gate over (it may be running BEFORE the devDependency is even
// declared, e.g. docs/OPERATIONS.md's step order — see checkDevDepInstallability below). It DOES set
// `cautioned` so the final summary doesn't print a bare "install-ready ✓" that contradicts the caution.
const caution = (m: string) => { console.log(`preflight: ! ${m}`); cautioned = true; };
const run = (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const have = (cmd: string) => { try { return run(cmd, ['--version']).status === 0; } catch { return false; } };

// ── 0. dev-dependency installability: NODE_ENV=production / npm omit=dev silent no-op ───────────────
// Extracted as a pure(ish), dependency-injected helper (bin/preflight.test.ts), matching OA-05's pattern —
// the `io` seam (existsSync/readFileSync/run + an injectable `env`) lets tests assert the omit-detection
// and the evidence-gate decision without mutating global `process.env` or touching a real npm config.

export interface DevDepIO {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => string;
  run: RunFn;
  env: Record<string, string | undefined>;
}

const defaultDevDepIO: DevDepIO = {
  existsSync,
  readFileSync: (p) => readFileSync(p, 'utf8'),
  run,
  env: process.env,
};

export interface DevDepCheckResult {
  notes: string[];
  warns: string[];
  /** Prominent `!`-line output that must NOT set `failed` — see caution() above. */
  cautions: string[];
  failed: boolean;
}

export interface OmitProbe {
  /** The raw, trimmed value `npm config get omit` reports — empty when nothing is omitted, else a
   *  comma-separated list (`dev`, `dev,optional`). Only meaningful when `ok` is true. */
  omit: string;
  /** Whether the probe itself SUCCEEDED (npm exited 0). A NON-zero exit (npm not on PATH, or — before the
   *  `--no-workspaces` flag below — the ENOWORKSPACES error npm raises for this command inside a workspace
   *  MEMBER) leaves stdout empty, which must NOT be mistaken for "healthy, nothing omitted". */
  ok: boolean;
}

/** npm's EFFECTIVE omit config — not just `NODE_ENV` — since `npm_config_omit`, a persisted `.npmrc`
 *  `omit=dev`/`omit[]=dev`, and the legacy `production=true` (npm translates it to `omit=dev` itself) all
 *  funnel into this single value; `npm config get omit` is the one thing npm itself consults, so testing
 *  it (not one of its inputs) is what catches every route to the same silent no-op.
 *
 *  Run with `--no-workspaces`: inside an npm WORKSPACE MEMBER (a first-class adopter host — see check #1's
 *  OA-04 header), a bare `npm config get omit` exits 1 with `ENOWORKSPACES` and EMPTY stdout, so reading
 *  stdout alone would report "nothing omitted" and silently skip the check while the F-6 no-op fully
 *  reproduces (a member's `NODE_ENV=production npm install -D <pkg>` writes the pin, installs nothing).
 *  `--no-workspaces` makes the command succeed and report the real value in a member too (verified npm
 *  10.9.7 / 11.12.1). Returns `ok:false` on ANY non-zero exit so the caller can NOTE "couldn't determine"
 *  rather than treat an unreadable config as healthy. */
export function effectiveOmit(io: Pick<DevDepIO, 'run'>): OmitProbe {
  const r = io.run('npm', ['config', 'get', 'omit', '--no-workspaces']);
  return { omit: (r.stdout ?? '').trim(), ok: r.status === 0 };
}

/** Whether the effective omit set includes `dev` — a word-boundary test so `dev` matches standalone or
 *  comma-adjacent (`dev,optional` / `optional,dev`) but never a substring like a hypothetical `devx`. */
export function omitsDev(omit: string): boolean {
  return /\bdev\b/.test(omit);
}

/** Resolve a declared devDependency the way Node itself would from THIS package — walking up the
 *  node_modules chain (cwd/node_modules → parent/node_modules → … → root), NOT a single fixed
 *  `cwd/node_modules/<name>` path. In an npm WORKSPACE MEMBER a devDependency HOISTS to the workspace
 *  ROOT's node_modules (verified: member-local absent, root present, `require.resolve` from the member
 *  succeeds) — probing only the member-local path would FALSE-ALARM a healthy production member (F-5
 *  cry-wolf). Walk-up (via the injected `existsSync` seam) models the same hoisting resolution without an
 *  `exports`-map subpath hazard that a bare `require.resolve('<name>/package.json')` can hit. */
export function devDepResolvable(cwd: string, name: string, existsFn: (p: string) => boolean): boolean {
  let dir = cwd;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsFn(join(dir, 'node_modules', name, 'package.json'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false; // reached the filesystem root
    dir = parent;
  }
}

// Lead with `--include=dev`: it is the ONLY override that works on EVERY route to omit=dev. When the
// omission comes from a persisted `.npmrc omit=dev`, `npm_config_omit=dev`, or the legacy `production=true`,
// that EXPLICIT config beats the NODE_ENV-derived DEFAULT, so `NODE_ENV=development npm install -D <pkg>`
// installs NOTHING too (verified) — an operator who follows only the NODE_ENV form loops on the same no-op.
// `NODE_ENV=development` is offered as a secondary note only when the cause IS the NODE_ENV default.
const devDepOverride = (pkg: string, nodeEnvDefault: boolean): string => {
  const primary = `npm install -D ${pkg} --include=dev`;
  return nodeEnvDefault
    ? `${primary}   (or, since NODE_ENV=production is the cause: NODE_ENV=development npm install -D ${pkg})`
    : primary;
};

/** Detect the effective dev-dependency omission and, when present, print a caution ALWAYS (cause +
 *  consequence + override) but escalate to a hard failure ONLY when there is concrete evidence the no-op
 *  already happened: a `devDependencies` key in this repo's package.json that Node cannot resolve. Two
 *  tiers on purpose — see docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md "Why two tiers":
 *  preflight can run BEFORE ztrack is even declared (docs/OPERATIONS.md's local-git flow), so it must
 *  never hard-fail on omit=dev alone — only on a devDependency that is DECLARED but unresolvable. */
export function checkDevDepInstallability(cwd: string, io: DevDepIO = defaultDevDepIO): DevDepCheckResult {
  const notes: string[] = [];
  const warns: string[] = [];
  const cautions: string[] = [];
  const note = (m: string) => notes.push(m);
  const warn = (m: string) => warns.push(m);
  const caution = (m: string) => cautions.push(m);

  const pkgPath = join(cwd, 'package.json');
  if (!io.existsSync(pkgPath)) {
    // No package.json ⇒ not an npm project ⇒ no `npm install -D` target here, so we skip the WHOLE check
    // (including the omit caution) deliberately — there is nothing this environment could no-op an install
    // INTO. A note records the skip so a silent pass is never mistaken for "omit was checked and clean".
    note('no package.json — skip devDependency-installability check');
    return { notes, warns, cautions, failed: false };
  }

  const probe = effectiveOmit(io);
  if (!probe.ok) {
    // The probe itself failed (npm not on PATH, or some other non-zero exit) — we could NOT determine the
    // omit config. Never treat that as "healthy, nothing omitted" (the silent-ship trap); surface it as a
    // note with the exact command to check by hand.
    note(
      "could not determine npm's dev-dependency omit config (`npm config get omit --no-workspaces` exited " +
        'nonzero) — if this box sets NODE_ENV=production or omit=dev, `npm install -D` installs NOTHING; ' +
        'verify manually with: npm config get omit --no-workspaces',
    );
    return { notes, warns, cautions, failed: false };
  }
  if (!omitsDev(probe.omit)) {
    // Silent on a healthy box: no NODE_ENV/omit is in effect, so `npm install -D` behaves normally — this
    // check must never cry wolf (the F-5 lesson OA-05 already had to unlearn once).
    return { notes, warns, cautions, failed: false };
  }

  const nodeEnvDefault = io.env.NODE_ENV === 'production';
  const cause = nodeEnvDefault ? 'NODE_ENV=production → npm omit=dev' : `npm omit=${probe.omit}`;
  caution(
    `this environment omits devDependencies (${cause}): 'npm install -D ztrack' will exit 0 and install ` +
      `NOTHING. Override: ${devDepOverride('ztrack', nodeEnvDefault)}`,
  );

  let pkg: { devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(io.readFileSync(pkgPath));
  } catch {
    note('package.json is not valid JSON — skip the declared-devDependency evidence check');
    return { notes, warns, cautions, failed: warns.length > 0 };
  }

  const declared = Object.keys(pkg.devDependencies ?? {});
  const missing = declared.filter((name) => !devDepResolvable(cwd, name, io.existsSync));
  if (missing.length > 0) {
    // "declared but not installed" — NOT "already happened": a devDep can also be legitimately absent from
    // an intentional prune / platform-restricted optional, so state the fact, not a presumed cause.
    warn(
      `declared devDependencies not installed (omit=dev, so \`npm install -D\` would be a no-op) — missing: ` +
        `${missing.join(', ')}. Re-run: ${devDepOverride(missing.join(' '), nodeEnvDefault)}`,
    );
  }

  return { notes, warns, cautions, failed: warns.length > 0 };
}

// ── 2. node-pty: termfleet's provider native module ─────────────────────────────────────────────
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

// ── 3. termfleet port/provider coexistence (OA-09) ───────────────────────────────────────────────
// Extracted as a pure(ish), dependency-injected helper (bin/preflight.test.ts) — the `io` seam (a fake TCP
// probe, a fake HTTP probe, a fake `ss`/`lsof` occupant lookup, and injectable fs/env) lets tests assert the
// port classification and the warn-vs-caution policy without ever binding a real socket or shelling out.

/** The port a termfleet URL is bound to, or undefined for an unparsable/portless URL. */
export function portOf(url: string | undefined): number | undefined {
  if (!url) return undefined;
  try {
    const p = Number(new URL(url).port);
    return p > 0 ? p : undefined;
  } catch {
    return undefined;
  }
}

export type TcpProbeFn = (host: string, port: number, timeoutMs: number) => Promise<boolean>;
export type HttpGetFn = (url: string, timeoutMs: number) => Promise<{ status: number; body: string } | undefined>;

/** A real TCP connect probe: true iff SOMETHING accepted the connection (occupied), false on refusal/timeout
 *  (free). Never throws — every failure mode (ECONNREFUSED, ETIMEDOUT, host unreachable) resolves `false`. */
function defaultTcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const sock = createConnection({ host, port });
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
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

/** A real HTTP GET, used ONLY against a port already known to be occupied (the TCP probe above) — never the
 *  bare, `-f`-style root-path check this whole doc/check exists to replace. Returns undefined on any
 *  failure (non-HTTP occupant, timeout) so the caller falls back to naming the occupant via ss/lsof. */
async function defaultHttpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string } | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    return { status: res.status, body };
  } catch {
    return undefined;
  }
}

/** Name the pid/command listening on `port` — `ss -ltnp` first (Linux, no root needed for same-user
 *  processes), falling back to `lsof -iTCP:<port> -sTCP:LISTEN` (macOS/BSD, or a Linux box without `ss`).
 *  Matched against the LOCAL-ADDRESS column specifically (not just "line contains :<port>"), so a port that
 *  merely appears as a PEER port on some unrelated connection is never misreported as the listener. */
export function occupantOf(port: number, run: RunFn): string | undefined {
  const ss = run('ss', ['-ltnp']);
  if (ss.status === 0) {
    for (const line of (ss.stdout ?? '').split('\n')) {
      const fields = line.trim().split(/\s+/);
      const local = fields[3]; // State Recv-Q Send-Q Local:Port Peer:Port Process...
      if (!local || !local.endsWith(`:${port}`)) continue;
      const m = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
      return m ? `pid ${m[2]} (${m[1]})` : undefined;
    }
  }
  const lsof = run('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-Fpc']);
  if (lsof.status === 0) {
    let pid: string | undefined;
    let cmd: string | undefined;
    for (const l of (lsof.stdout ?? '').split('\n')) {
      if (l.startsWith('p')) pid = l.slice(1);
      if (l.startsWith('c')) cmd = l.slice(1);
    }
    if (pid) return `pid ${pid}${cmd ? ` (${cmd})` : ''}`;
  }
  return undefined;
}

export type PortStatus = 'free' | 'termfleet-provider' | 'termfleet-console' | 'foreign-http';

export interface PortClassification {
  port: number;
  status: PortStatus;
  kind?: string;
  instanceId?: string;
  occupant?: string;
}

export interface TermfleetPortIO {
  tcpProbe: TcpProbeFn;
  httpGet: HttpGetFn;
  run: RunFn;
  existsSync: (p: string) => boolean;
  readdirSync: (p: string) => string[];
  readFileSync: (p: string) => string;
  env: Record<string, string | undefined>;
  homedir: () => string;
}

const defaultTermfleetPortIO: TermfleetPortIO = {
  tcpProbe: defaultTcpProbe,
  httpGet: defaultHttpGet,
  run,
  existsSync,
  readdirSync: (p) => readdirSync(p),
  readFileSync: (p) => readFileSync(p, 'utf8'),
  env: process.env,
  homedir,
};

/** Classify a single port: free / a termfleet provider (its OWN self-reported identity contract — `{ok:true,
 *  provider:<kind>, instanceId }`) / a termfleet console (`{ok:true, service:"console"}`) / a foreign HTTP
 *  service (anything else that answers, including a plain 404 — the exact case `curl -fsS .../` misreads as
 *  free). Verified against a REAL termfleet@0.2.0 provider/console (npm registry): a provider's `/healthz`
 *  returns `{"ok":true,"provider":"virtual-tmux","build":{...},"instanceId":"<uuid>"}` and its `/` returns a
 *  plain 404 — exactly the shape this check (and the rewritten docs) rely on. */
export async function classifyPort(port: number, io: TermfleetPortIO = defaultTermfleetPortIO): Promise<PortClassification> {
  const open = await io.tcpProbe('127.0.0.1', port, 800);
  if (!open) return { port, status: 'free' };
  const http = await io.httpGet(`http://127.0.0.1:${port}/healthz`, 1500);
  if (http) {
    try {
      const body = JSON.parse(http.body) as { ok?: boolean; provider?: string; instanceId?: string; service?: string };
      if (body.ok === true && typeof body.provider === 'string') {
        return { port, status: 'termfleet-provider', kind: body.provider, instanceId: body.instanceId };
      }
      if (body.ok === true && body.service === 'console') {
        return { port, status: 'termfleet-console' };
      }
    } catch {
      /* not JSON (or not the termfleet shape) — falls through to the foreign-http classification below */
    }
  }
  return { port, status: 'foreign-http', occupant: occupantOf(port, io.run) };
}

export interface TermfleetPortsResult {
  notes: string[];
  warns: string[];
  cautions: string[];
  failed: boolean;
}

/** Describe an occupied port's identity for a message — always naming SOMETHING concrete (kind + instance,
 *  or the occupying pid/command), never a bare "something is there". */
function describeOccupant(c: PortClassification): string {
  if (c.status === 'termfleet-provider') {
    return `a termfleet provider (kind '${c.kind ?? 'unknown'}'${c.instanceId ? `, instance ${c.instanceId}` : ''})`;
  }
  if (c.status === 'termfleet-console') return 'a termfleet console';
  return `a non-termfleet service${c.occupant ? ` (${c.occupant})` : ' (occupant unidentified — ss/lsof unavailable)'}`;
}

/** Probe the doc-default ports (7373 console, 7402 provider) plus any pinned/advertised port, classify each,
 *  and read the machine-global termfleet state an UNPINNED loop's resolution chain would actually consult
 *  (`~/.termfleet/current.json`, `~/.termfleet/providers/*.json`). Two-tier output, same as every other
 *  check in this file: a hard `warn()` only when the install is genuinely at risk — UNPINNED with a foreign
 *  occupant live on a port the naive quickstart would use, or a `~/.termfleet/current.json` that would
 *  silently beat auto-discovery — vs a soft `caution()`/`note()` when the install is already pinned
 *  elsewhere (a foreign occupant on an UNUSED default port is informational, not a blocker). */
export async function checkTermfleetPorts(cwd: string, io: TermfleetPortIO = defaultTermfleetPortIO): Promise<TermfleetPortsResult> {
  const notes: string[] = [];
  const warns: string[] = [];
  const cautions: string[] = [];
  const note = (m: string) => notes.push(m);
  const warn = (m: string) => warns.push(m);
  const caution = (m: string) => cautions.push(m);

  // Same scoping as ensurePtyModule above: until THIS repo actually depends on termfleet, nothing here
  // would bind these ports for THIS install — deferred to a re-run after `npm install termfleet`
  // (preflight is explicitly documented as safe/expected to re-run, docs/OPERATIONS.md step 1). This also
  // means the check never fires probing a bare scaffold/pre-install repo dir.
  if (!io.existsSync(join(cwd, 'node_modules', 'termfleet', 'package.json'))) {
    note('termfleet not installed yet — skip port/provider coexistence check (run after `npm install termfleet`)');
    return { notes, warns, cautions, failed: false };
  }

  const pinned = io.env.TERMFLEET_PROVIDER_URL?.trim() || undefined;
  const pinnedPort = portOf(pinned);
  const home = io.env.TERMFLEET_HOME || join(io.homedir(), '.termfleet');

  // Machine-global state the resolution chain (@termfleet/core's local-providers.js) actually consults for
  // an UNPINNED loop — read directly off disk, never through the SDK (preflight must work pre-install).
  let currentContextUrl: string | undefined;
  const currentContextPath = join(home, 'current.json');
  if (io.existsSync(currentContextPath)) {
    try {
      const parsed = JSON.parse(io.readFileSync(currentContextPath)) as { baseUrl?: string };
      currentContextUrl = typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl : undefined;
    } catch {
      /* corrupt current.json — still worth flagging its mere presence below */
    }
    if (pinned) {
      caution(
        `~/.termfleet/current.json exists${currentContextUrl ? ` (points at ${currentContextUrl})` : ''} — harmless here ` +
          `since TERMFLEET_PROVIDER_URL is pinned, which wins over it in the resolution chain.`,
      );
    } else {
      warn(
        `~/.termfleet/current.json exists${currentContextUrl ? ` (points at ${currentContextUrl})` : ''} — this machine-global ` +
          `\`termfleet use\` context BEATS zero-config auto-discovery for an UNPINNED install and would silently attach this ` +
          `loop's launches to it. Fix: export TERMFLEET_PROVIDER_URL=<your own provider's url> before running the loop ` +
          `(docs/OPERATIONS.md#local-runner-quickstart step 2), or make it durable: ` +
          `\`open-autonomy compile <profile> local . --provider-url <url>\`.`,
      );
    }
  }

  const providersDir = join(home, 'providers');
  const advertised: string[] = [];
  if (io.existsSync(providersDir)) {
    let files: string[] = [];
    try {
      files = io.readdirSync(providersDir).filter((f) => f.endsWith('.json'));
    } catch {
      files = [];
    }
    for (const f of files) {
      try {
        const rec = JSON.parse(io.readFileSync(join(providersDir, f))) as { baseUrl?: string };
        if (typeof rec.baseUrl === 'string' && rec.baseUrl.trim()) advertised.push(rec.baseUrl);
      } catch {
        /* skip a corrupt advertisement record rather than fail the whole check */
      }
    }
  }
  if (advertised.length) {
    note(
      `${advertised.length} termfleet provider(s) advertised machine-globally (~/.termfleet/providers/): ${advertised.join(', ')} ` +
        `— self-advertised, not necessarily still live; the port classification below confirms.`,
    );
  }

  const candidatePorts = [...new Set([7373, 7402, pinnedPort, ...advertised.map(portOf)].filter((p): p is number => typeof p === 'number'))];

  for (const port of candidatePorts) {
    const c = await classifyPort(port, io);
    if (c.status === 'free') {
      note(`port ${port}: free`);
      continue;
    }
    const identity = describeOccupant(c);
    if (pinnedPort === port) {
      // The pinned port itself — the one thing this install actually depends on.
      if (c.status === 'termfleet-provider') {
        note(`port ${port} (your pinned TERMFLEET_PROVIDER_URL) is serving ${identity} ✓`);
      } else {
        warn(
          `your pinned TERMFLEET_PROVIDER_URL points at port ${port}, but it is occupied by ${identity}, not a termfleet ` +
            `provider — the pin will connect to the wrong thing (or fail). Fix: point TERMFLEET_PROVIDER_URL at your own ` +
            `provider's real port.`,
        );
      }
      continue;
    }
    // An unpinned default (or advertised-but-not-pinned) port occupied by something foreign.
    const prescribe =
      `pick a repo-unique port (see docs/OPERATIONS.md#local-runner-quickstart step 2) and pin it: ` +
      `export TERMFLEET_PROVIDER_URL=http://127.0.0.1:<your-port>`;
    if (pinned) {
      caution(
        `port ${port} is occupied by ${identity} — this install is pinned to a different provider (${pinned}), so this ` +
          `doesn't affect it; noting it in case anything here ever falls back to the doc-default ports.`,
      );
    } else {
      warn(`port ${port} is occupied by ${identity} and this install is UNPINNED — ${prescribe}.`);
    }
  }

  return { notes, warns, cautions, failed: warns.length > 0 };
}

// ── 4. lockfile: `npm ci` under the repo's CI Node version ──────────────────────────────────────
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
export async function runPreflightCli(): Promise<void> {
  console.log('open-autonomy preflight — environment checks for a local-runner install\n');
  // Run FIRST (docs/adoption-fixes/OA-06...): a poisoned install environment (NODE_ENV=production / npm
  // omit=dev silently no-opping `npm install -D`) explains any downstream missing-module symptom the
  // checks below would otherwise report as an unrelated crash.
  const devDepResult = checkDevDepInstallability(cwd);
  for (const n of devDepResult.notes) note(n);
  for (const c of devDepResult.cautions) caution(c);
  for (const w of devDepResult.warns) warn(w);
  // Run next (docs/adoption-fixes/OA-04...): a namespace collision explains any further downstream failure
  // the checks below would otherwise report as an unrelated crash.
  const collisionResult = checkNamespaceCollisions(cwd);
  for (const n of collisionResult.notes) note(n);
  for (const w of collisionResult.warns) warn(w);
  const ptyResult = ensurePtyModule(cwd);
  for (const n of ptyResult.notes) note(n);
  for (const w of ptyResult.warns) warn(w);
  // OA-09: a foreign termfleet/HTTP occupant on the doc-default (or pinned) ports, and the machine-global
  // `~/.termfleet` state an unpinned loop would silently defer to — named here, before compile/commit, so
  // the coexistence hazard is caught structurally rather than discovered as a silently-dead `serve &`.
  const portsResult = await checkTermfleetPorts(cwd);
  for (const n of portsResult.notes) note(n);
  for (const c of portsResult.cautions) caution(c);
  for (const w of portsResult.warns) warn(w);
  verifyLock();
  const okSummary = cautioned
    ? '\npreflight: OK — no blocking issues, but REVIEW the caution(s) above before installing (compile + commit the harness, then prove the loop with `npx open-autonomy doctor`)'
    : '\npreflight: OK — environment is install-ready ✓ (compile + commit the harness, then prove the loop with `npx open-autonomy doctor`)';
  console.log(failed ? '\npreflight: FAILED — fix the item(s) above and re-run.' : okSummary);
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) await runPreflightCli();
