// OA-18 doctor — unit-level tests for the check implementations in bin/doctor-checks.ts. This file
// imports the module DIRECTLY (safe: doctor-checks.ts is deliberately side-effect-free on import — see
// its header comment), unlike every other bin/*.ts verb module, which this repo's convention tests by
// spawning a subprocess (bin/autonomy-compile.test.ts) because THEY execute unconditionally on import.
//
// Fixture installs are REAL compiled output (compileLocal + materialize against profiles/simple-sdlc's
// actual skill files, standards, etc — never a hand-rolled stub), so SKILL.md frontmatter, prompt files,
// and the generated manifest are byte-identical to what an adopter would actually get.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseIr, materialize } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import {
  checkAuth,
  checkEnv,
  checkHarness,
  checkSelf,
  checkSkills,
  cleanupProbe,
  parseDoctorArgs,
  runDoctor,
} from './doctor-checks.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const SIMPLE_SDLC_DIR = join(REPO_ROOT, 'profiles', 'simple-sdlc');

function git(dir: string, args: string[], env?: Record<string, string>) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
}
function gitInit(dir: string) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'oa18-test@example.com']);
  git(dir, ['config', 'user.name', 'OA18 test']);
}
function commitAll(dir: string, msg: string) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

/** A REAL compiled `simple-sdlc local` install, materialized with the profile's actual skill/standards
 *  files (never a hand-rolled stub) — the caller owns cleanup (mkdtemp path). */
function scaffoldSimpleSdlc(): string {
  const ir = parseIr(readFileSync(join(SIMPLE_SDLC_DIR, 'ir.yml'), 'utf8'));
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa18-doctor-fixture-'));
  materialize(out, dir, (from) => readFileSync(join(SIMPLE_SDLC_DIR, from), 'utf8'));
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true }); // OA-07's day-one fence isn't this test's concern
  return dir;
}

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

describe('parseDoctorArgs', () => {
  test('defaults', () => {
    const r = parseDoctorArgs([]);
    expect(r).toEqual({ live: false, json: false, branchPrefix: 'oa-doctor' });
  });
  test('--live --json --branch-prefix mine', () => {
    const r = parseDoctorArgs(['--live', '--json', '--branch-prefix', 'mine']);
    expect(r).toEqual({ live: true, json: true, branchPrefix: 'mine' });
  });
  test('--branch-prefix with no value -> usage error (exit-2 shape)', () => {
    const r = parseDoctorArgs(['--branch-prefix']);
    expect('usageError' in r).toBe(true);
  });
  test('unknown flag -> usage error', () => {
    const r = parseDoctorArgs(['--bogus']);
    expect('usageError' in r).toBe(true);
  });
  test('--help -> usage error (exit-2 shape, not a crash)', () => {
    const r = parseDoctorArgs(['--help']);
    expect('usageError' in r).toBe(true);
  });
});

describe('checkAuth (AC-6, F-13) — PATH-shim CLIs, never `--version` as evidence', () => {
  function shim(dir: string, name: string, script: string): void {
    const p = join(dir, name);
    writeFileSync(p, `#!/bin/sh\n${script}\n`);
    chmodSync(p, 0o755);
  }
  function withShimOnPath<T>(dir: string, fn: () => T): T {
    const savedPath = process.env.PATH;
    const savedHarness = process.env.TERMFLEET_AGENT;
    process.env.PATH = `${dir}:${savedPath ?? ''}`;
    try {
      return fn();
    } finally {
      process.env.PATH = savedPath;
      if (savedHarness === undefined) delete process.env.TERMFLEET_AGENT;
      else process.env.TERMFLEET_AGENT = savedHarness;
    }
  }

  test('signed-out claude -> FAIL, never citing --version as evidence', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-authshim-')));
    shim(dir, 'claude', 'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo "You are not logged in."; exit 1; fi\necho "1.2.3"; exit 0');
    const r = withShimOnPath(dir, () => checkAuth());
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('NOT signed in');
    expect(r.detail).not.toMatch(/'claude --version' succeeding does not mean signed in\)\.\s*$/); // the message NAMES the pitfall, doesn't fall for it
    expect(r.finding).toContain('F-13');
    cleanupAll();
  });

  test('signed-in claude -> PASS', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-authshim-')));
    shim(dir, 'claude', 'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo "Logged in as someone@example.com"; exit 0; fi\necho "1.2.3"; exit 0');
    const r = withShimOnPath(dir, () => checkAuth());
    expect(r.status).toBe('PASS');
    cleanupAll();
  });

  test('CLI version with no introspection subcommand -> WARN (use --live), never a FAIL', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-authshim-')));
    shim(dir, 'claude', 'if [ "$1" = "auth" ]; then echo "error: unknown command \'auth\'" >&2; exit 1; fi\necho "1.2.3"; exit 0');
    const r = withShimOnPath(dir, () => checkAuth());
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('--live');
    cleanupAll();
  });

  test('no claude on PATH at all -> FAIL naming it not installed', () => {
    // A trivial, ISOLATED PATH (no ':'-appended real system dirs) -- this box may genuinely have a real
    // `claude` binary installed, so proving "not found" requires excluding the real PATH entirely, not
    // just prepending an empty shim dir ahead of it.
    const savedPath = process.env.PATH;
    process.env.PATH = track(mkdtempSync(join(tmpdir(), 'oa18-authshim-empty-')));
    try {
      const r = checkAuth();
      expect(r.status).toBe('FAIL');
      expect(r.detail).toContain('not installed on PATH');
    } finally {
      process.env.PATH = savedPath;
    }
    cleanupAll();
  });

  test('TERMFLEET_AGENT=codex uses codex login status, independently of claude', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-authshim-codex-')));
    shim(dir, 'codex', 'if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in"; exit 0; fi\necho "0.1.0"; exit 0');
    // Save/restore TERMFLEET_AGENT itself explicitly here (not just via withShimOnPath's own save/restore,
    // which captures its snapshot AFTER this line would have already mutated it, permanently leaking
    // 'codex' into every later test/process in this run — a real isolation bug this test used to have).
    const savedAgent = process.env.TERMFLEET_AGENT;
    process.env.TERMFLEET_AGENT = 'codex';
    try {
      const r = withShimOnPath(dir, () => checkAuth());
      expect(r.status).toBe('PASS');
      expect(r.detail).toContain('codex');
    } finally {
      if (savedAgent === undefined) delete process.env.TERMFLEET_AGENT;
      else process.env.TERMFLEET_AGENT = savedAgent;
    }
    cleanupAll();
  });
});

describe('checkEnv (AC-2/AC-4, F-4/F-6) — devDeps + NODE_ENV + workspace shadowing', () => {
  test('AC-2: ztrack declared but unresolvable + NODE_ENV=production -> FAIL naming NODE_ENV', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-env-')));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter', devDependencies: { ztrack: '1.0.0' } }));
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const r = checkEnv(dir);
      expect(r.status).toBe('FAIL');
      expect(r.detail).toContain('NODE_ENV=production');
      expect(r.detail).toContain('NODE_ENV=development npm install -D ztrack');
      expect(r.finding).toContain('F-6');
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
    }
    cleanupAll();
  });

  test('ztrack declared + resolvable (regardless of NODE_ENV) -> that sub-check is clean', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-env-ok-')));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter', devDependencies: { ztrack: '1.0.0' } }));
    mkdirSync(join(dir, 'node_modules', 'ztrack'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'ztrack', 'package.json'), JSON.stringify({ name: 'ztrack', version: '1.0.0', main: 'index.js' }));
    writeFileSync(join(dir, 'node_modules', 'ztrack', 'index.js'), 'module.exports = {};\n');
    const r = checkEnv(dir);
    expect(r.detail).not.toContain('NODE_ENV');
    cleanupAll();
  });

  test('AC-4a: a workspace package literally named @termfleet/core shadows the registry install -> FAIL', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-shadow-')));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', workspaces: ['packages/*'] }));
    // The "workspace source" the shadow points at (outside any node_modules).
    mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@termfleet/core', version: '9.9.9', main: 'index.js' }));
    writeFileSync(join(dir, 'packages', 'core', 'index.js'), 'module.exports = {};\n');
    // A real (non-shadowed) `termfleet` registry-style install so the pty sub-check has something to walk,
    // reusing the ACTUAL termfleet package already present in this monorepo (packages/substrate-local's own
    // node_modules) rather than a fake — its own resolved path is itself under a node_modules/ segment, so
    // it is correctly NOT flagged as a shadow.
    const realTermfleetDir = join(REPO_ROOT, 'packages', 'substrate-local', 'node_modules', 'termfleet');
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    if (existsSync(realTermfleetDir)) symlinkSync(realTermfleetDir, join(dir, 'node_modules', 'termfleet'), 'dir');
    mkdirSync(join(dir, 'node_modules', '@termfleet'), { recursive: true });
    symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', '@termfleet', 'core'), 'dir');

    const r = checkEnv(dir);
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('@termfleet/core');
    expect(r.detail).toContain('workspace');
    expect(r.finding).toContain('F-4');
    cleanupAll();
  });

  test("AC-4b: the repo's own package.json named 'termfleet' collides (self-reference) -> FAIL", () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-selfref-')));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet' }));
    const r = checkEnv(dir);
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain("named 'termfleet'");
    cleanupAll();
  });

  test('no repo package.json at all -> no crash, reports what it can', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-env-nopkg-')));
    expect(() => checkEnv(dir)).not.toThrow();
    cleanupAll();
  });

  // AC-3 (F-5, both directions): the pty module termfleet ACTUALLY depends on is resolved from ITS OWN
  // dependency graph (never a hardcoded name) and LOAD-TESTED (require()'d), never merely existence-checked
  // by path -- the exact bug class preflight.ts's `build/{Release,Debug}/pty.node` existsSync check had.
  function scaffoldFakeTermfleetWithPty(dir: string, ptyPkgName: string, ptyIndexJs: string): void {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter' }));
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'termfleet', 'package.json'),
      JSON.stringify({ name: 'termfleet', version: '0.1.0', main: 'index.js', dependencies: { [ptyPkgName]: '^1.0.0' } }),
    );
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'module.exports = {};\n');
    mkdirSync(join(dir, 'node_modules', ptyPkgName), { recursive: true });
    writeFileSync(join(dir, 'node_modules', ptyPkgName, 'package.json'), JSON.stringify({ name: ptyPkgName, version: '1.0.0', main: 'index.js' }));
    writeFileSync(join(dir, 'node_modules', ptyPkgName, 'index.js'), ptyIndexJs);
  }

  test('AC-3a: a pty module that FAILS to require() -> FAIL naming the ACTUAL resolved package name + loader error', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-pty-broken-')));
    // A deliberately UNCONVENTIONAL name -- proves the check reads it from termfleet's OWN
    // dependencies, never a hardcoded '@homebridge/node-pty-prebuilt-multiarch' literal.
    scaffoldFakeTermfleetWithPty(dir, 'some-other-vendors-pty-native', "throw new Error('simulated native binding load failure');\n");
    const r = checkEnv(dir);
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('some-other-vendors-pty-native');
    expect(r.detail).toContain('simulated native binding load failure');
    expect(r.finding).toContain('F-5');
    cleanupAll();
  });

  test('AC-3b: a pty module with NO build/Release dir at all (prebuilds-only) that LOADS fine -> PASS, no false alarm, no build-toolchain advice', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-pty-healthy-')));
    // Deliberately no build/Release/pty.node anywhere -- the OLD preflight-style existsSync check would
    // have declared this "rebuild FAILED" on a perfectly healthy box (F-5's false-alarm class).
    scaffoldFakeTermfleetWithPty(dir, 'vendor-prebuilt-only-pty', 'module.exports = { loaded: true };\n');
    expect(existsSync(join(dir, 'node_modules', 'vendor-prebuilt-only-pty', 'build'))).toBe(false);
    const r = checkEnv(dir);
    expect(r.status).not.toBe('FAIL');
    expect(r.detail).toContain('vendor-prebuilt-only-pty');
    expect(r.detail.toLowerCase()).not.toContain('rebuild');
    expect(r.detail.toLowerCase()).not.toContain('build toolchain');
    cleanupAll();
  });
});

describe('checkSelf (AC-1/AC-14, F-1/F-14) — against a REAL built artifact', () => {
  test('AC-1: a healthy built dist -> PASS naming every bundled profile compiling clean', async () => {
    const build = spawnSync('bun', ['run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(build.status).toBe(0);
    const r = await checkSelf(REPO_ROOT, join(REPO_ROOT, 'dist'));
    expect(r.status === 'PASS' || r.status === 'WARN').toBe(true); // WARN only on a version-skew pin, never a FAIL
    cleanupAll();
  });

  // A synthetic "installed package" root: <root>/package.json + <root>/profiles/ (real, symlinked so the
  // dry-compile loop has real bundled profiles to walk) + <root>/dist/ (a copy of the real build, minus
  // whatever file the test deletes) — mirrors an npm install's actual layout (package.json one level above
  // dist/, profiles/ as a sibling of dist/, per package.json's own "files": ["dist/", "profiles/", ...]).
  function scaffoldBrokenInstallRoot(fileToDelete: string): { root: string; dist: string; version: string } {
    const root = track(mkdtempSync(join(tmpdir(), 'oa18-selfcheck-broken-')));
    const dist = join(root, 'dist');
    mkdirSync(dist, { recursive: true });
    spawnSync('cp', ['-r', join(REPO_ROOT, 'dist') + '/.', dist]);
    rmSync(join(dist, fileToDelete), { recursive: true, force: true });
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
    symlinkSync(join(REPO_ROOT, 'profiles'), join(root, 'profiles'), 'dir');
    return { root, dist, version: pkg.version };
  }

  test('AC-1: deleting egress-guard.sh beside dist/cli.js -> FAIL naming the file + the installed version + "broken publish"', async () => {
    const build = spawnSync('bun', ['run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(build.status).toBe(0);
    const { dist, version } = scaffoldBrokenInstallRoot('egress-guard.sh');
    const r = await checkSelf(REPO_ROOT, dist);
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('egress-guard.sh');
    expect(r.detail).toContain(version);
    expect(r.detail).toContain('broken publish');
    expect(r.finding).toContain('F-1');
    cleanupAll();
  });

  test('AC-1: for ANY target substrate, including local — deleting a data file fails self even though a `local`-only repo would never itself read it', async () => {
    // egress-guard.sh is read only by a gh-actions compile with private_egress_guard set (soc2-baseline) —
    // an adopter compiling `local` only would never trip OA-01's lazy read themselves. Doctor's self-check
    // still catches it because it dry-compiles EVERY bundled profile to EVERY declared target, not just the
    // one this repo happens to use.
    const build = spawnSync('bun', ['run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(build.status).toBe(0);
    const { dist } = scaffoldBrokenInstallRoot('egress-guard.sh');
    const r = await checkSelf(REPO_ROOT, dist); // a bare `local` install of THIS test repo has no bearing here -- self is target-agnostic
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('egress-guard.sh');
    cleanupAll();
  });

  test('AC-14: an installed version that does not satisfy the repo package.json pin -> WARN naming both, never FAIL', async () => {
    const build = spawnSync('bun', ['run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(build.status).toBe(0);
    const fixtureRepo = track(mkdtempSync(join(tmpdir(), 'oa18-versionskew-')));
    writeFileSync(join(fixtureRepo, 'package.json'), JSON.stringify({ name: 'adopter', dependencies: { 'open-autonomy': '0.1.0' } }));
    const r = await checkSelf(fixtureRepo, join(REPO_ROOT, 'dist'));
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('0.1.0');
    expect(r.finding).toContain('F-14');
    cleanupAll();
  });
});

describe('checkHarness (AC-7/AC-8/AC-12, F-2/F-3) — the load-bearing worktree-integrity check', () => {
  test('no .open-autonomy/generated.json -> FAIL naming "not a compiled install"', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-harness-nomanifest-')));
    const { result } = await checkHarness(dir, 'oa-doctor');
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('not a compiled install');
    cleanupAll();
  });

  test('AC-7: a compile-owned file is uncommitted -> FAIL listing exactly that file, no worktree left behind', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    git(dir, ['add', '-A']);
    // Commit everything EXCEPT one harness file (leave it uncommitted/dirty).
    // `git rm --cached` (not `reset HEAD`, which needs a prior commit that doesn't exist yet here)
    // unstages the file from the index, leaving it untracked on disk -- exactly the AC-7 scenario.
    git(dir, ['rm', '--cached', '-q', '.claude/skills/develop/SKILL.md']);
    git(dir, ['commit', '-q', '-m', 'partial harness']);
    const { result, worktree } = await checkHarness(dir, 'oa-doctor');
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('.claude/skills/develop/SKILL.md');
    expect(result.detail).toContain('uncommitted');
    // checkHarness itself never cleans up (that's the CALLER's job -- runDoctor calls cleanupProbe() once
    // after every check has read the worktree); simulate that here before checking the read-only guarantee
    // (AC-12): even on a FAIL, no worktree/branch survives once the caller cleans up.
    cleanupProbe();
    expect(worktree ? existsSync(worktree) : true).toBe(false);
    const wt = git(dir, ['worktree', 'list']);
    expect(wt.stdout.split('\n').filter(Boolean).length).toBe(1); // only the main checkout
    const branches = git(dir, ['branch', '--list', 'oa-doctor/*']);
    expect(branches.stdout.trim()).toBe('');
    cleanupAll();
  });

  test('a fully committed harness -> PASS, reports the base ref/sha the runner chose, and cleans up', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'full harness');
    const { result, worktree, base, sha } = await checkHarness(dir, 'oa-doctor');
    expect(result.status).toBe('PASS');
    expect(base).toBe('HEAD'); // local-git codeHost -> HEAD (OA-02), proven via the runner's OWN worktree-probe entry
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(worktree).toBeTruthy();
    expect(existsSync(worktree!)).toBe(true); // still present -- checkHarness itself never cleans up
    cleanupProbe(); // the caller's job (runDoctor calls this once after every check has read the worktree)
    expect(existsSync(worktree!)).toBe(false);
    cleanupAll();
  });

  test('AC-8: doctor invokes the RUNNER\'S OWN worktree-probe (not a reimplementation) — proven by a stale, pre-OA-02-shaped scripts/runner.ts reporting its OWN (wrong) base, unmodified by doctor', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    // Swap in a MINIMAL fake scripts/runner.ts whose worktree-probe verb reports a DELIBERATELY WRONG base
    // string (never what a real ensureWorktree would choose) — if doctor ever reimplemented the base-ref
    // decision instead of shelling out to THIS file, the fake's absurd base would never surface. Proves the
    // seam is real, not just plausible.
    const fakeRunner = `#!/usr/bin/env bun
const [cmd, branch] = process.argv.slice(2);
if (cmd === 'worktree-probe') {
  const { spawnSync } = require('node:child_process');
  spawnSync('git', ['worktree', 'add', '-b', branch, '.worktrees/' + branch.replace(/[^0-9A-Za-z._-]/g, '-'), 'HEAD']);
  console.log(JSON.stringify({ branch, worktree: '.worktrees/' + branch.replace(/[^0-9A-Za-z._-]/g, '-'), base: 'DEFINITELY-NOT-A-REAL-BASE', sha: 'deadbeef' }));
  process.exit(0);
}
process.exit(1);
`;
    writeFileSync(join(dir, 'scripts', 'runner.ts'), fakeRunner);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'swap in a fake runner.ts for AC-8']);
    const { result, base } = await checkHarness(dir, 'oa-doctor');
    // The fake's absurd base string surfaces verbatim -- proof doctor read it FROM the runner, not derived it.
    expect(base).toBe('DEFINITELY-NOT-A-REAL-BASE');
    void result;
    cleanupAll();
  });

  test('AC-8 (literal): a repo with a resolvable-but-stale origin/main — a PRE-OA-02-shaped runner.ts FAILs naming the base+sha+missing files; the CURRENT (post-OA-02) runner.ts on the IDENTICAL repo PASSes, with ZERO doctor code involved in the difference', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    // A remote EXISTS and origin/main RESOLVES -- to a commit that predates the harness -- exactly the
    // audit's F-2 trigger (worktree-base.test.ts's own fixture for the RUNNER side of this same defect).
    writeFileSync(join(dir, 'stale.txt'), 'pre-harness state the remote knows about\n');
    git(dir, ['add', 'stale.txt']);
    git(dir, ['commit', '-q', '-m', 'stale: what origin/main points at']);
    const staleSha = git(dir, ['rev-parse', 'HEAD']).stdout.trim();
    git(dir, ['remote', 'add', 'origin', 'https://127.0.0.1:1/nope.git']); // unreachable by design -- never actually fetched
    git(dir, ['update-ref', 'refs/remotes/origin/main', staleSha]); // origin/main RESOLVES (the defect's trigger)
    commitAll(dir, 'install the harness (committed locally, never pushed)');

    // A minimal PRE-OA-02-SHAPED stand-in: the documented old bug is "always fetch + base on origin/<trunk>
    // whenever it resolves, regardless of declared codeHost" (see runner-frontend.ts's ensureWorktree
    // comment + docs/adoption-fixes/OA-02-*.md) -- reconstructed here only far enough to exercise doctor's
    // seam (a worktree-probe verb + that one behavior), never doctor's own logic.
    const preOA02Runner = `#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
const [cmd, branch] = process.argv.slice(2);
function git(args) { return spawnSync('git', args, { encoding: 'utf8' }); }
if (cmd === 'worktree-probe') {
  const trunk = git(['symbolic-ref', '--short', 'HEAD']).stdout.trim() || 'main';
  git(['fetch', 'origin', trunk]); // best-effort, ignored -- the pre-OA-02 bug never gated this on codeHost
  const originResolves = git(['rev-parse', '--verify', '--quiet', 'origin/' + trunk]).status === 0;
  const base = originResolves ? 'origin/' + trunk : 'HEAD'; // <- the bug: repo-shape-driven, not codeHost-driven
  const worktree = '.worktrees/' + branch.replace(/[^0-9A-Za-z._-]/g, '-');
  const add = git(['worktree', 'add', '-b', branch, worktree, base]);
  if (add.status !== 0) { console.error(add.stderr); process.exit(1); }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).stdout.trim();
  console.log(JSON.stringify({ branch, worktree, base, sha, codeHost: 'local-git' }));
  process.exit(0);
}
process.exit(1);
`;
    const currentRunnerSrc = readFileSync(join(dir, 'scripts', 'runner.ts'), 'utf8');

    // --- run 1: the PRE-OA-02-shaped runner.ts is what's committed -----------------------------------
    writeFileSync(join(dir, 'scripts', 'runner.ts'), preOA02Runner);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'swap in a pre-OA-02-shaped runner.ts']);
    const preResult = await checkHarness(dir, 'oa-doctor');
    expect(preResult.result.status).toBe('FAIL');
    expect(preResult.base).toBe('origin/main'); // named, exactly as the audit's finding demands
    expect(preResult.sha).toBe(staleSha);
    expect(preResult.result.detail).toContain('origin/main');
    expect(preResult.result.detail).toContain(staleSha);
    expect(preResult.result.detail).toMatch(/\.claude\/skills\/(draft|develop|review|pm)\/SKILL\.md/);

    // --- run 2: restore the CURRENT (post-OA-02) runner.ts on the IDENTICAL repo shape ---------------
    writeFileSync(join(dir, 'scripts', 'runner.ts'), currentRunnerSrc);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'restore the current runner.ts']);
    const postResult = await checkHarness(dir, 'oa-doctor');
    expect(postResult.result.status).toBe('PASS');
    expect(postResult.base).toBe('HEAD'); // local-git codeHost -> HEAD, per OA-02 -- same doctor code, different verdict
    cleanupAll();
  });

  test('bun missing on PATH -> FAIL naming bun, no crash', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const emptyPathDir = track(mkdtempSync(join(tmpdir(), 'oa18-nobun-')));
    const savedPath = process.env.PATH;
    process.env.PATH = emptyPathDir;
    try {
      const { result } = await checkHarness(dir, 'oa-doctor');
      expect(result.status).toBe('FAIL');
      expect(result.detail).toContain('bun is not on PATH');
    } finally {
      process.env.PATH = savedPath;
    }
    cleanupAll();
  });
});

describe('checkSkills (AC-9, F-3) — resolution in the check-5 probe worktree', () => {
  test('a healthy simple-sdlc install -> PASS naming the dispatchable agent count', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const harness = await checkHarness(dir, 'oa-doctor');
    const skills = checkSkills(harness);
    cleanupProbe();
    expect(skills.status).toBe('PASS');
    expect(skills.detail).toMatch(/\d+ dispatchable agent/);
    cleanupAll();
  });

  test('AC-9: a committed SKILL.md whose frontmatter name mismatches its folder -> FAIL naming "Unknown command: /develop"', async () => {
    const dir = track(scaffoldSimpleSdlc());
    const skillPath = join(dir, '.claude', 'skills', 'develop', 'SKILL.md');
    writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace(/^name:\s*develop\s*$/m, 'name: totally-different'));
    gitInit(dir);
    commitAll(dir, 'harness with a mismatched skill name');
    const harness = await checkHarness(dir, 'oa-doctor');
    const skills = checkSkills(harness);
    cleanupProbe();
    expect(skills.status).toBe('FAIL');
    expect(skills.detail).toContain('Unknown command: /develop');
    expect(skills.detail).toContain('totally-different');
    expect(skills.finding).toContain('F-3');
    cleanupAll();
  });

  test('AC-9 (missing): the committed SKILL.md file itself is absent -> FAIL naming "Unknown command: /develop"', async () => {
    const dir = track(scaffoldSimpleSdlc());
    rmSync(join(dir, '.claude', 'skills', 'develop', 'SKILL.md'), { force: true });
    gitInit(dir);
    commitAll(dir, 'harness missing a skill file');
    const harness = await checkHarness(dir, 'oa-doctor');
    const skills = checkSkills(harness);
    cleanupProbe();
    expect(skills.status).toBe('FAIL');
    expect(skills.detail).toContain('Unknown command: /develop');
    cleanupAll();
  });

  test('SKIP when check 5 could not produce a worktree (no manifest at all)', () => {
    const noManifestHarness = { result: { id: 'harness' as const, status: 'FAIL' as const, detail: 'no manifest', finding: [] } };
    const skills = checkSkills(noManifestHarness);
    expect(skills.status).toBe('SKIP');
    expect(skills.detail).toContain('harness');
  });
});

describe('runDoctor — ordering (AC-15), reporting (AC-13), spend gate (AC-11)', () => {
  test('AC-15: checks always come back in the audit failure-chain order self,env,provider,auth,harness,skills,live', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-order-')));
    const report = await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    expect(report.checks.map((c) => c.id)).toEqual(['self', 'env', 'provider', 'auth', 'harness', 'skills', 'live']);
    cleanupAll();
  });

  test('AC-13: independent checks still report when an earlier one FAILs; dependent checks SKIP naming the blocker', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-report-')));
    const report = await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    // No manifest at all -> harness FAILs, and skills/live SKIP naming it (dependent-check contract).
    expect(byId.harness.status).toBe('FAIL');
    expect(byId.skills.status).toBe('SKIP');
    expect(byId.skills.detail).toContain('harness');
    // env/auth are INDEPENDENT of harness and still report a real (non-SKIP-because-of-harness) status.
    expect(['PASS', 'FAIL', 'WARN']).toContain(byId.env.status);
    expect(['PASS', 'FAIL', 'WARN']).toContain(byId.auth.status);
    cleanupAll();
  });

  test('exit-code contract: verdict is FAIL iff any check is FAIL', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-verdict-')));
    const report = await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    expect(report.verdict).toBe(report.checks.some((c) => c.status === 'FAIL') ? 'FAIL' : 'PASS');
    cleanupAll();
  });

  test('AC-11: without --live, no launch/session code path ever runs (checkLive is never invoked)', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const report = await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    const live = report.checks.find((c) => c.id === 'live')!;
    expect(live.status).toBe('SKIP');
    expect(live.detail).toContain('pass --live');
    // No termfleet-launch evidence anywhere else in the report either.
    expect(JSON.stringify(report.checks)).not.toMatch(/createAgentWindow|DOCTOR-OK/);
    cleanupAll();
  });

  test('JSON shape (AC-13): every check has {id,status,detail,finding[]}; verdict is PASS|FAIL', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-jsonshape-')));
    const report = await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    for (const c of report.checks) {
      expect(typeof c.id).toBe('string');
      expect(['PASS', 'FAIL', 'WARN', 'SKIP']).toContain(c.status);
      expect(typeof c.detail).toBe('string');
      expect(Array.isArray(c.finding)).toBe(true);
    }
    expect(['PASS', 'FAIL']).toContain(report.verdict);
    cleanupAll();
  });
});

describe('read-only guarantee (AC-12) — cleanupProbe leaves the repo untouched even after a mid-run interruption', () => {
  test('calling cleanupProbe with no active probe is a safe no-op', () => {
    expect(() => cleanupProbe()).not.toThrow();
  });

  test('after a full run against a real repo, git status is unchanged and no oa-doctor/* ref remains', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const before = git(dir, ['status', '--porcelain']).stdout;
    await runDoctor(dir, { live: false, branchPrefix: 'oa-doctor' });
    const after = git(dir, ['status', '--porcelain']).stdout;
    expect(after).toBe(before);
    expect(git(dir, ['branch', '--list', 'oa-doctor/*']).stdout.trim()).toBe('');
    // `git worktree remove` deletes the specific probe worktree directory; it does not necessarily remove
    // the now-empty `.worktrees/` CONTAINER, so the read-only guarantee is "no probe worktree survives",
    // not "the container directory itself is gone" (that would be a stronger claim than the spec makes).
    const worktreeList = git(dir, ['worktree', 'list']).stdout.trim().split('\n');
    expect(worktreeList.length).toBe(1); // only the main checkout
    cleanupAll();
  });
});
