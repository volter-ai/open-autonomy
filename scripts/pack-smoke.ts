#!/usr/bin/env bun
// Release smoke gate (OA-01, part C — "the release process whose only packaging gate is optional human
// diligence" fix). Build → `npm pack` → install the PACKED tarball into a throwaway project → run every
// CLI verb via `npx --no-install open-autonomy …` under PLAIN NODE (the published artifact's actual
// runtime — never bun). This is the "the source tree lies about packaging" test RELEASING.md has always
// prescribed, now a script instead of an inline recipe one maintainer might skip.
//
// Wired three ways so no single human's diligence is load-bearing again (see
// docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md):
//   1. `check:pack-smoke` is chained into `bun run check` (package.json).
//   2. `prepublishOnly` runs it after every build, so even a hand-run `npm publish` can't ship a tarball
//      whose verbs don't run.
//   3. RELEASING.md step 3 calls this script instead of an inline shell one-liner.
//
// Dev-only — not part of the runtime mirror set (like scripts/bench-*.ts), never injected into an install.
//
// SAFETY: every scratch dir here comes from `mkdtempSync` — never widen a cleanup `rm` to a raw
// shell-interpolated variable that could resolve empty; `fs.rmSync` only ever targets a path this script
// itself just received back from `mkdtempSync`.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

const REPO_ROOT = process.cwd();

let failures = 0;
function fail(step: string, detail: string): void {
  failures++;
  console.error(`\npack-smoke: FAIL — ${step}\n${detail.trim()}\n`);
}
function ok(step: string): void {
  console.log(`pack-smoke: ok — ${step}`);
}

// When THIS script runs as `prepublishOnly` under `npm publish --dry-run` (as AC7 exercises, and as any
// real dry-run publish does), npm sets `npm_config_dry_run=true` in the environment — and that inherited
// config leaks into every nested npm invocation this script makes (`npm pack`, `npm install`), silently
// turning them into no-ops too (a dry-run `npm pack` reports success but writes no tarball). Strip it so
// this script's OWN npm calls are always real, regardless of what invoked the script.
const CHILD_ENV = { ...process.env };
delete CHILD_ENV.npm_config_dry_run;

function run(cmd: string, args: string[], opts: Record<string, unknown> = {}): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, { encoding: 'utf8', env: CHILD_ENV, ...opts });
}

let packDir: string | undefined;
let installDir: string | undefined;

function reportAndExit(): never {
  // Cleanup only ever targets a directory THIS script created via mkdtempSync above — never a
  // shell-interpolated variable that could resolve to something unintended.
  for (const d of [packDir, installDir]) {
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  if (failures > 0) {
    console.error(`\npack-smoke: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\npack-smoke: all checks passed ✓');
  process.exit(0);
}

// ---------- 1. Build ----------
console.log('pack-smoke: bun run build …');
const build = run('bun', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
if (build.status !== 0) {
  fail('bun run build', `exit ${build.status}`);
  reportAndExit();
}

// ---------- 2. npm pack into a scratch dir ----------
packDir = mkdtempSync(join(tmpdir(), 'oa-pack-smoke-pack-'));
const packResult = run('npm', ['pack', '--silent', '--pack-destination', packDir], { cwd: REPO_ROOT });
if (packResult.status !== 0 || !(packResult.stdout ?? '').trim()) {
  fail('npm pack', packResult.stderr || packResult.stdout || `exit ${packResult.status}`);
  reportAndExit();
}
const tgzName = packResult.stdout.trim().split('\n').pop()!.trim();
const tgzPath = join(packDir, tgzName);
if (!existsSync(tgzPath)) {
  fail('npm pack', `expected tarball at ${tgzPath}, not found`);
  reportAndExit();
}
ok(`npm pack → ${tgzPath}`);

// ---------- 3. Tarball manifest assertion ----------
const manifestResult = run('tar', ['tzf', tgzPath]);
const manifest = new Set((manifestResult.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean));
const bundledProfiles = readdirSync(join(REPO_ROOT, 'profiles'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, 'profiles', e.name, 'ir.yml')))
  .map((e) => e.name)
  .sort();
const requiredEntries = [
  'package/dist/cli.js',
  'package/dist/egress-guard.sh',
  'package/dist/backend.mjs',
  'package/dist/runner-frontend.ts',
  'package/dist/control-backend.mjs',
  ...bundledProfiles.map((p) => `package/profiles/${p}/ir.yml`),
  // npm strips a file literally named `.gitignore` from every package — self-driving carries it as the
  // no-dot resource `gitignore` and the github compiler emits it to `.gitignore` (RELEASING.md gotcha).
  'package/profiles/self-driving/gitignore',
];
for (const entry of requiredEntries) {
  if (!manifest.has(entry)) fail('tarball manifest', `missing ${entry}`);
}
if (![...manifest].some((e) => /^package\/dist\/runtime\/.*\.ts$/.test(e))) {
  fail('tarball manifest', 'expected at least one package/dist/runtime/*.ts entry, found none');
}
if (failures > 0) reportAndExit();
ok(`tarball manifest — ${requiredEntries.length} required entries + runtime/*.ts present (${bundledProfiles.length} bundled profiles: ${bundledProfiles.join(', ')})`);

// ---------- 4. Install the tarball into a throwaway project ----------
installDir = mkdtempSync(join(tmpdir(), 'oa-pack-smoke-install-'));
run('git', ['init', '-q'], { cwd: installDir });
run('npm', ['init', '-y'], { cwd: installDir });
const install = run('npm', ['install', tgzPath], { cwd: installDir });
if (install.status !== 0) {
  fail('npm install <tarball>', install.stderr || install.stdout || `exit ${install.status}`);
  reportAndExit();
}
ok(`installed tarball into throwaway project ${installDir}`);

const pkgRoot = join(installDir, 'node_modules', 'open-autonomy');

// Every verb below runs via `npx --no-install open-autonomy …` — the published bin's shebang is
// `#!/usr/bin/env node`, so this is plain node, never bun, matching what an adopter actually runs.
function cli(args: string[], cwd: string): SpawnSyncReturns<string> {
  return run('npx', ['--no-install', 'open-autonomy', ...args], { cwd });
}

// ---------- --help ----------
{
  const r = cli(['--help'], installDir);
  if (r.status !== 0 || !(r.stdout || '').trim()) fail('--help', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  // OA-11 AC-6: the PACKED artifact's help must carry the corrected adoption hint — overlays first, the
  // whole-repo scaffold labeled SCAFFOLD — not just the source tree. This is the one help check that would
  // have caught 0.4.1's published tarball still shipping the pre-fix hint even after the source fix landed
  // (a stale `dist/cli.js` built before the fix, or a build step that didn't pick it up).
  else if (!/SCAFFOLD/.test(r.stdout || '')) fail('--help', `packed help missing "SCAFFOLD" label (OA-11):\n${r.stdout}`);
  else ok('--help (OA-11: packed help says SCAFFOLD)');
}

// ---------- compile simple-sdlc local . — the audit's exact failing command ----------
{
  const dir = join(installDir, 'ac-local');
  mkdirSync(dir, { recursive: true });
  const r = cli(['compile', 'simple-sdlc', 'local', '.'], dir);
  if (r.status !== 0) fail('compile simple-sdlc local .', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else if (!existsSync(join(dir, 'scheduler', 'run.mjs'))) fail('compile simple-sdlc local .', 'scheduler/run.mjs missing');
  else if (!existsSync(join(dir, '.claude', 'skills'))) fail('compile simple-sdlc local .', '.claude/skills/ missing');
  else if (!/Next steps/.test(r.stdout || '')) fail('compile simple-sdlc local .', `"Next steps" block not printed:\n${r.stdout}`);
  else {
    // OA-15: the PACKED artifact's emitted next-steps must be version-pinned (blob/v<version>, never
    // blob/main) and must name its own version — this is the exact drift F-14 found (an old install's
    // guide link silently morphing with whatever `main` says later), verified here from the actual
    // packed tarball, never the source tree.
    const pkgVersion = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
    if (!/blob\/v\d+\.\d+\.\d+/.test(r.stdout || '')) {
      fail('compile simple-sdlc local .', `next-steps guide link is not version-pinned (blob/v…):\n${r.stdout}`);
    } else if (!r.stdout?.includes(`open-autonomy v${pkgVersion}`)) {
      fail('compile simple-sdlc local .', `next-steps doesn't name this package's own version (v${pkgVersion}):\n${r.stdout}`);
    } else {
      ok('compile simple-sdlc local . (OA-15: next-steps version-pinned)');
    }
  }
}

// ---------- compile self-driving gh-actions . ----------
{
  const dir = join(installDir, 'ac-gh-selfdriving');
  mkdirSync(dir, { recursive: true });
  const r = cli(['compile', 'self-driving', 'gh-actions', '.'], dir);
  const workflowsDir = join(dir, '.github', 'workflows');
  if (r.status !== 0) fail('compile self-driving gh-actions .', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else if (!existsSync(join(dir, '.gitignore'))) fail('compile self-driving gh-actions .', '.gitignore not written');
  else if (!existsSync(workflowsDir) || readdirSync(workflowsDir).filter((f) => f.endsWith('.yml')).length === 0)
    fail('compile self-driving gh-actions .', 'no non-empty .github/workflows/*.yml');
  else ok('compile self-driving gh-actions .');
}

// ---------- compile simple-gh-sdlc gh-actions . — the additive gh overlay ----------
{
  const dir = join(installDir, 'ac-gh-simple');
  mkdirSync(dir, { recursive: true });
  const r = cli(['compile', 'simple-gh-sdlc', 'gh-actions', '.'], dir);
  if (r.status !== 0) fail('compile simple-gh-sdlc gh-actions .', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else ok('compile simple-gh-sdlc gh-actions .');
}

// ---------- compile soc2-baseline gh-actions . — the RUNTIME read of dist/egress-guard.sh ----------
// soc2-baseline is the only bundled profile that sets policy.box.gh-actions.private_egress_guard, so this
// is the one verb in the matrix that actually READS dist/egress-guard.sh at runtime and emits it into the
// install (the other compiles exercise only the packaging/manifest layers). A present-but-corrupt or
// absent file fails HERE even if the tarball manifest above looked fine.
{
  const dir = join(installDir, 'ac-gh-soc2');
  mkdirSync(dir, { recursive: true });
  const r = cli(['compile', 'soc2-baseline', 'gh-actions', '.'], dir);
  const emitted = join(dir, 'scripts', 'egress-guard.sh');
  if (r.status !== 0) fail('compile soc2-baseline gh-actions .', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else if (!existsSync(emitted)) fail('compile soc2-baseline gh-actions .', 'emitted scripts/egress-guard.sh missing');
  else {
    const emittedSrc = readFileSync(emitted, 'utf8');
    const shipped = readFileSync(join(pkgRoot, 'dist', 'egress-guard.sh'), 'utf8');
    if (!emittedSrc.trim()) fail('compile soc2-baseline gh-actions .', 'emitted scripts/egress-guard.sh is empty');
    else if (emittedSrc !== shipped)
      fail('compile soc2-baseline gh-actions .', 'emitted scripts/egress-guard.sh differs from the shipped dist/egress-guard.sh');
    else ok('compile soc2-baseline gh-actions . — runtime read of dist/egress-guard.sh, emitted byte-equal');
  }
}

// ---------- lint <bundled hello profile> ----------
{
  const r = cli(['lint', join(pkgRoot, 'profiles', 'hello')], installDir);
  if (r.status !== 0) fail('lint profiles/hello', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else ok('lint profiles/hello');
}

// ---------- conformance exec ----------
{
  const r = cli(['conformance', 'exec'], installDir);
  if (r.status !== 0) fail('conformance exec', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else ok('conformance exec');
}

// ---------- upgrade (bare) — must be a CONTROLLED refusal (usage), never a raw crash ----------
{
  const r = cli(['upgrade'], installDir);
  const stderr = r.stderr || '';
  if (r.status === 0) fail('upgrade (bare)', 'expected a nonzero usage exit, got 0');
  else if (/ENOENT/.test(stderr)) fail('upgrade (bare)', `stderr contains ENOENT (a crash, not a controlled refusal):\n${stderr}`);
  else if (!/usage/i.test(stderr) && !/--profile|--target/.test(stderr)) fail('upgrade (bare)', `stderr doesn't look like usage/flag help:\n${stderr}`);
  else ok(`upgrade (bare) — controlled refusal, exit ${r.status}`);
}

// ---------- preflight — must exit 0 here (OA-05) ----------
// The packed throwaway project has no termfleet installed and no package-lock.json, so BOTH preflight
// checks legitimately take their skip paths — a nonzero exit in this environment means the gate is crying
// wolf (the exact F-5 failure mode: preflight false-failing where nothing is wrong), not that the env is
// bad. Any-exit-accepted was the pre-OA-05 stance, kept only because the pty check itself false-failed.
// OA-14 added a THIRD real check (agent auth) whose skip path is "no verdict either way" — never silent
// on this box specifically. Force the ANTHROPIC_API_KEY bypass so this smoke test isn't hostage to
// whatever real `claude` CLI (signed in or not) happens to be on the machine running `bun run check`.
{
  const r = run('npx', ['--no-install', 'open-autonomy', 'preflight'], {
    cwd: installDir,
    env: { ...CHILD_ENV, ANTHROPIC_API_KEY: 'test-pack-smoke-bypass' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.signal) fail('preflight', `killed by signal ${r.signal} (crash)`);
  else if (!out.trim()) fail('preflight', 'no diagnostic output at all (silent failure)');
  else if (r.status !== 0) fail('preflight', `expected exit 0 on the all-skip path (no termfleet, no lockfile), got ${r.status}:\n${out}`);
  else ok('preflight — exit 0 (skip paths, no false failure)');
}

// ---------- compile simple-sdlc local (dry run, no outDir) ----------
{
  const r = cli(['compile', 'simple-sdlc', 'local'], installDir);
  if (r.status !== 0) fail('compile simple-sdlc local (dry run)', `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  else if (!(r.stdout || '').trim()) fail('compile simple-sdlc local (dry run)', 'no file list printed');
  else ok('compile simple-sdlc local (dry run)');
}

// ---------- doctor --json (OA-18) — check 1 (self) is meaningful with NO repo at all: this is exactly
// the release gate the spec's Dependencies section calls for ("OA-01's tarball-smoke CI should run
// `open-autonomy doctor` from the packed tarball, making every future publish self-verifying"). A broken
// publish (a missing sibling data file, F-1) makes check 1 FAIL right here, at release time, instead of at
// the first adopter's `npx open-autonomy doctor` months later. The other checks are env/repo-dependent
// (this installDir is not a compiled install), so only check 1's status is asserted strictly; the run as a
// whole must simply behave (valid JSON, a real exit code, no crash/signal) — never itself the thing that's
// broken.
{
  const r = cli(['doctor', '--json'], installDir);
  if (r.signal) fail('doctor --json', `killed by signal ${r.signal} (crash)`);
  else if (r.status !== 0 && r.status !== 1) fail('doctor --json', `unexpected exit ${r.status} (expected 0 or 1, never a usage/crash code)\n${r.stdout}\n${r.stderr}`);
  else {
    let parsed: { checks?: Array<{ id: string; status: string }>; verdict?: string } = {};
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      fail('doctor --json', `stdout did not parse as JSON:\n${r.stdout}`);
    }
    const self = parsed.checks?.find((c) => c.id === 'self');
    if (!self) fail('doctor --json', `no "self" check in the JSON output:\n${r.stdout}`);
    else if (self.status === 'FAIL') fail('doctor --json', `check 1 (self) FAILed against the packed artifact — a broken publish:\n${r.stdout}`);
    else ok(`doctor --json — self: ${self.status}, verdict: ${parsed.verdict}`);
  }
}

reportAndExit();
