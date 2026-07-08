// OA-18 doctor — end-to-end CLI tests. Unlike bin/doctor-checks.test.ts (which imports the check
// functions directly), these spawn the REAL CLI artifact (`node dist/cli.js doctor`) as a subprocess —
// the same shape pack-smoke.ts uses for every other verb, and the only way to prove the SIGINT read-only
// guarantee (a signal has to land on an actual child process, never the test runner's own).
import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseIr, materialize } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import { installStubTermfleet } from '../packages/substrate-local/src/test-support/stub-termfleet.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'dist', 'cli.js');
const SIMPLE_SDLC_DIR = join(REPO_ROOT, 'profiles', 'simple-sdlc');

// Build once for the whole file (every test here runs the REAL packed artifact).
const build = spawnSync('bun', ['run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
if (build.status !== 0) throw new Error(`bin/doctor.test.ts: \`bun run build\` failed:\n${build.stdout}\n${build.stderr}`);

function git(dir: string, args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function gitInit(dir: string) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'oa18-e2e@example.com']);
  git(dir, ['config', 'user.name', 'OA18 e2e']);
}
function commitAll(dir: string, msg: string) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}
function scaffoldSimpleSdlc(): string {
  const ir = parseIr(readFileSync(join(SIMPLE_SDLC_DIR, 'ir.yml'), 'utf8'));
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa18-doctor-e2e-'));
  materialize(out, dir, (from) => readFileSync(join(SIMPLE_SDLC_DIR, from), 'utf8'));
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true });
  return dir;
}
function cli(args: string[], cwd: string, env: Record<string, string> = {}) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
afterAll(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('doctor CLI — usage + exit codes', () => {
  test('exit 2 on a bad flag, never a crash', () => {
    const r = cli(['doctor', '--nope'], REPO_ROOT);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage');
  });

  test('exit 2 on --branch-prefix with no value', () => {
    const r = cli(['doctor', '--branch-prefix'], REPO_ROOT);
    expect(r.status).toBe(2);
  });

  test('--help is a usage message on stdout, exit 0 (help is not a usage error)', () => {
    const r = cli(['doctor', '--help'], REPO_ROOT);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('doctor');
  });
});

describe('doctor CLI — JSON shape + exit-code contract (AC-13)', () => {
  test('a healthy, committed simple-sdlc install: --json validates shape; exit reflects the presence of any FAIL', () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const r = cli(['doctor', '--json'], dir);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.map((c: { id: string }) => c.id)).toEqual(['self', 'env', 'provider', 'auth', 'harness', 'skills', 'live']);
    for (const c of parsed.checks) {
      expect(['PASS', 'FAIL', 'WARN', 'SKIP']).toContain(c.status);
      expect(typeof c.detail).toBe('string');
      expect(Array.isArray(c.finding)).toBe(true);
    }
    expect(['PASS', 'FAIL']).toContain(parsed.verdict);
    const anyFail = parsed.checks.some((c: { status: string }) => c.status === 'FAIL');
    expect(r.status).toBe(anyFail ? 1 : 0);
    expect(parsed.verdict).toBe(anyFail ? 'FAIL' : 'PASS');
    // harness + skills must PASS on this healthy, committed fixture regardless of this box's claude/termfleet state.
    const byId = Object.fromEntries(parsed.checks.map((c: { id: string }) => [c.id, c]));
    expect(byId.harness.status).toBe('PASS');
    expect(byId.skills.status).toBe('PASS');
    // No file in the repo changed as a side effect of running doctor.
    expect(git(dir, ['status', '--porcelain']).stdout).toBe('');
  });

  test('the human-readable form lists checks in the same audit failure-chain order (AC-15)', () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const r = cli(['doctor'], dir);
    const idsInOrder = ['self', 'env', 'provider', 'auth', 'harness', 'skills', 'live'];
    let lastIndex = -1;
    for (const id of idsInOrder) {
      const idx = r.stdout.indexOf(` ${id} `.replace(/ {2,}/g, ' ')); // tolerate padding
      const idx2 = r.stdout.search(new RegExp(`\\b${id}\\b`));
      const foundAt = idx >= 0 ? idx : idx2;
      expect(foundAt).toBeGreaterThan(lastIndex);
      lastIndex = foundAt;
    }
  });
});

describe('doctor CLI — spend guarantee (AC-11)', () => {
  test('without --live, no coding-CLI/session-launch process runs other than auth introspection', () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    // A PATH shim that logs every invocation of "claude"/"codex"/anything named like a session launcher,
    // so we can assert on EXACTLY what got spawned.
    const spyDir = track(mkdtempSync(join(tmpdir(), 'oa18-spend-spy-')));
    const log = join(spyDir, 'invocations.log');
    for (const name of ['claude', 'codex']) {
      const p = join(spyDir, name);
      writeFileSync(p, `#!/bin/sh\necho "${name} $*" >> "${log}"\nif [ "$1" = "auth" ] || [ "$1" = "login" ]; then echo "not logged in" >&2; exit 1; fi\necho "1.0.0"\n`);
      spawnSync('chmod', ['+x', p]);
    }
    cli(['doctor'], dir, { PATH: `${spyDir}:${process.env.PATH ?? ''}` });
    const invocations = existsSync(log) ? readFileSync(log, 'utf8') : '';
    // The ONLY line should be the auth introspection call (`claude auth status`), never a launch/session verb.
    const lines = invocations.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(1);
    for (const line of lines) expect(line).toMatch(/^claude auth status$/);
    expect(invocations).not.toMatch(/createAgentWindow|DOCTOR-OK|run-agent/);
  });
});

describe('doctor CLI — read-only guarantee under a kill -INT mid-run (AC-12)', () => {
  test('SIGINT while the harness probe holds a just-created worktree: cleanup still runs', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const before = git(dir, ['status', '--porcelain']).stdout;

    const proc = Bun.spawn(['node', CLI, 'doctor'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, OA_DOCTOR_TEST_HOLD_PROBE_MS: '6000' },
    });
    // Poll for the probe worktree to actually appear (self/env/provider/auth run first, at whatever speed
    // THIS box's `claude auth status` etc. happen to run; a fixed sleep would race) instead of guessing a
    // fixed delay -- deterministic up to the poll's own generous ceiling.
    const worktreesRoot = join(dir, '.worktrees');
    // Poll until the probe worktree is actually POPULATED, not merely that `.worktrees/` exists: the probe
    // creates the parent dir and THEN `git worktree add` populates it, so a bare existsSync can win the race
    // and read an empty dir (the flake). The 6000ms HOLD window keeps it present far longer than the poll
    // interval, so once `add` completes the next poll sees it well inside the window.
    const listWorktrees = () =>
      existsSync(worktreesRoot) ? spawnSync('ls', [worktreesRoot], { encoding: 'utf8' }).stdout.trim() : '';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && listWorktrees().length === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // Confirm the probe worktree actually exists RIGHT NOW (the hold window), not just assume timing.
    const worktreesDuring = listWorktrees();
    proc.kill('SIGINT');
    await proc.exited;

    const after = git(dir, ['status', '--porcelain']).stdout;
    expect(after).toBe(before);
    expect(git(dir, ['branch', '--list', 'oa-doctor/*']).stdout.trim()).toBe('');
    const wt = git(dir, ['worktree', 'list']).stdout.trim().split('\n');
    expect(wt.length).toBe(1); // only the main checkout -- the probe worktree is gone
    // The probe DID exist mid-run (otherwise this test would trivially pass without proving anything).
    expect(worktreesDuring.trim().length).toBeGreaterThan(0);
  }, 30_000);

  test('CONCERN 2: SIGINT in the PRE-RECORD window (worktree on disk but its path not yet recorded by doctor) still cleans up worktree + branch', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    const before = git(dir, ['status', '--porcelain']).stdout;
    const excludeBefore = existsSync(join(dir, '.git', 'info', 'exclude')) ? readFileSync(join(dir, '.git', 'info', 'exclude')) : Buffer.alloc(0);

    // OA_DOCTOR_TEST_HOLD_BEFORE_RECORD_MS holds AFTER the probe child created the worktree on disk but
    // BEFORE doctor records its path (activeProbe.worktree still undefined) — the exact leak window the
    // panel flagged. cleanupProbe must recover the worktree from git's OWN records, not the unrecorded path.
    const proc = Bun.spawn(['node', CLI, 'doctor'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, OA_DOCTOR_TEST_HOLD_BEFORE_RECORD_MS: '6000' },
    });
    const worktreesRoot = join(dir, '.worktrees');
    // Poll until POPULATED (see the sibling test above): existsSync alone races the empty parent dir the
    // probe creates just before `git worktree add` fills it.
    const listWorktrees = () =>
      existsSync(worktreesRoot) ? spawnSync('ls', [worktreesRoot], { encoding: 'utf8' }).stdout.trim() : '';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && listWorktrees().length === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const worktreesDuring = listWorktrees();
    proc.kill('SIGINT');
    await proc.exited;

    expect(git(dir, ['status', '--porcelain']).stdout).toBe(before);
    expect(git(dir, ['branch', '--list', 'oa-doctor/*']).stdout.trim()).toBe('');
    expect(git(dir, ['worktree', 'list']).stdout.trim().split('\n').length).toBe(1);
    const excludeAfter = existsSync(join(dir, '.git', 'info', 'exclude')) ? readFileSync(join(dir, '.git', 'info', 'exclude')) : Buffer.alloc(0);
    expect(excludeAfter.equals(excludeBefore)).toBe(true); // restored even on a mid-run signal
    expect(worktreesDuring.trim().length).toBeGreaterThan(0); // the leak window really did open
  }, 30_000);
});

describe('doctor CLI — provider identity (AC-5, F-8): a plain HTTP occupant is never "nothing running"', () => {
  test('port occupied by a non-termfleet HTTP server -> FAIL naming the occupant, never SKIP/"nothing running"', async () => {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    // termfleet must be RESOLVABLE from the fixture's node_modules for checkProvider to proceed past its
    // own "not installed" SKIP -- symlink in the REAL termfleet + @termfleet/core this monorepo already has
    // (packages/substrate-local's own install), never a fake stand-in.
    const realTermfleet = join(REPO_ROOT, 'packages', 'substrate-local', 'node_modules', 'termfleet');
    const realCore = join(REPO_ROOT, 'packages', 'substrate-local', 'node_modules', '@termfleet', 'core');
    if (!existsSync(realTermfleet) || !existsSync(realCore)) {
      // Environment doesn't have termfleet installed at all (e.g. `bun install` skipped it) -- document and skip.
      console.warn('doctor.test.ts: skipping provider-occupant test -- no real termfleet install found under packages/substrate-local/node_modules');
      return;
    }
    spawnSync('mkdir', ['-p', join(dir, 'node_modules', '@termfleet')]);
    spawnSync('ln', ['-s', realTermfleet, join(dir, 'node_modules', 'termfleet')]);
    spawnSync('ln', ['-s', realCore, join(dir, 'node_modules', '@termfleet', 'core')]);

    const server = createServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const r = cli(['doctor', '--json'], dir, { TERMFLEET_PROVIDER_URL: `http://127.0.0.1:${port}` });
      const parsed = JSON.parse(r.stdout);
      const provider = parsed.checks.find((c: { id: string }) => c.id === 'provider');
      expect(provider.status).toBe('FAIL');
      // Never the SKIP-path conclusion ("no provider is running yet") -- a FAIL naming a real occupant is
      // the whole point (the message DOES legitimately quote the phrase "nothing running" while explaining
      // that this is NOT that case, which is why this asserts the SKIP wording is absent, not a bare
      // substring match on the quoted phrase itself).
      expect(provider.detail.toLowerCase()).not.toContain('no provider is running yet');
      expect(provider.status).not.toBe('SKIP');
      expect(provider.detail).toContain(String(port));
      expect(provider.finding).toContain('F-8');
    } finally {
      server.close();
    }
  }, 20_000);
});

describe('doctor CLI — --live (AC-6, AC-10): the real dispatch chain end-to-end, driven against a stub termfleet, zero model calls', () => {
  // Every test here runs the REAL packed `dist/cli.js doctor --live` — the actual dispatch chain
  // (run-agent.mjs -> autonomy-runner.mjs -> backend.mjs) — against the SAME stub termfleet
  // (packages/substrate-local/src/test-support/stub-termfleet.ts) OA-08's launch-verification.test.ts and
  // bin/doctor-checks.test.ts's companion describe use. There is no real termfleet provider, no real
  // coding-CLI session, and no model call anywhere in this block — it is durable (survives a box wipe) by
  // construction, closing OA-18's AC-6/AC-10 "live-pending" gap as a committed, deterministic CI test.

  // A PATH-shim `claude` reporting a signed-in identity, so `doctor --live`'s exit code in the pass/fail
  // tests below reflects ONLY the 'live' check under test (never an incidental FAIL from 'auth' because
  // this box has no real claude install, or has one that happens to be logged out) — the same shim technique
  // bin/doctor-checks.test.ts's checkAuth suite and this file's own spend-guarantee test already use.
  function signedInClaudeShimDir(): string {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa18-live-claude-shim-')));
    const p = join(dir, 'claude');
    writeFileSync(p, `#!/bin/sh\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo "Logged in as oa18-e2e@example.com"; exit 0; fi\necho "1.2.3"; exit 0\n`);
    spawnSync('chmod', ['+x', p]);
    return dir;
  }

  function scaffoldWithStubTermfleet(): { dir: string; sessionsFile: string } {
    const dir = track(scaffoldSimpleSdlc());
    gitInit(dir);
    commitAll(dir, 'harness');
    // Node's module resolution walks UP from any importer to the nearest ancestor node_modules on disk,
    // independent of git — so installing the stub once at the repo root also resolves from the probe
    // worktree the runner creates under it (see stub-termfleet.ts's own header comment).
    installStubTermfleet(dir);
    return { dir, sessionsFile: join(dir, 'oa18-stub-sessions.log') };
  }

  test('AC-10 pass: a healthy install -> `doctor --live` launches exactly one (stub) session that survives, exits 0', () => {
    const { dir, sessionsFile } = scaffoldWithStubTermfleet();
    const shimDir = signedInClaudeShimDir();
    const r = cli(['doctor', '--live', '--json'], dir, {
      PATH: `${shimDir}:${process.env.PATH ?? ''}`,
      OA_STUB_TF_SESSIONS_FILE: sessionsFile,
      OA_DOCTOR_LIVE_SURVIVE_MS: '800',
    });
    const parsed = JSON.parse(r.stdout);
    const live = parsed.checks.find((c: { id: string }) => c.id === 'live');
    expect(live.status).toBe('PASS');
    expect(live.detail).toContain('survived');
    expect(live.detail).toContain('run-agent.mjs');
    expect(parsed.verdict).toBe('PASS');
    expect(r.status).toBe(0);
    expect(existsSync(sessionsFile)).toBe(true); // a real (stub) createAgentWindow call actually happened
  }, 30_000);

  test('AC-10 fail: a session that dies at launch -> `doctor --live` exits non-zero, embedding the captured terminal contents', () => {
    const { dir } = scaffoldWithStubTermfleet();
    const shimDir = signedInClaudeShimDir();
    const deadTerminal = 'Unknown command: /develop\nsession terminated';
    const r = cli(['doctor', '--live', '--json'], dir, {
      PATH: `${shimDir}:${process.env.PATH ?? ''}`,
      OA_STUB_TF_DIE: '1',
      OA_STUB_TF_CAPTURE: deadTerminal,
      OA_DOCTOR_LIVE_SURVIVE_MS: '500',
    });
    const parsed = JSON.parse(r.stdout);
    const live = parsed.checks.find((c: { id: string }) => c.id === 'live');
    expect(live.status).toBe('FAIL');
    expect(live.detail).toContain(deadTerminal); // the exact evidence a real tmux reaper would have destroyed
    expect(parsed.verdict).toBe('FAIL');
    expect(r.status).not.toBe(0);
  }, 30_000);

  test('AC-6: on a box where the coding CLI is signed out, `doctor --live` exits non-zero naming the captured login prompt (independently of the static auth FAIL)', () => {
    const { dir } = scaffoldWithStubTermfleet();
    const signedOutDir = track(mkdtempSync(join(tmpdir(), 'oa18-live-claude-signedout-')));
    const p = join(signedOutDir, 'claude');
    writeFileSync(p, `#!/bin/sh\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo "You are not logged in."; exit 1; fi\necho "1.2.3"; exit 0\n`);
    spawnSync('chmod', ['+x', p]);
    const loginPrompt = 'Please log in to continue.\nVisit https://claude.ai/login?code=XYZ789 to authenticate.';
    const r = cli(['doctor', '--live', '--json'], dir, {
      PATH: `${signedOutDir}:${process.env.PATH ?? ''}`,
      OA_STUB_TF_DIE: '1',
      OA_STUB_TF_CAPTURE: loginPrompt,
      OA_DOCTOR_LIVE_SURVIVE_MS: '500',
    });
    expect(r.status).not.toBe(0);
    const parsed = JSON.parse(r.stdout);
    // (a) the static check ALSO catches it, unconditionally of --live (F-13's first line of defense) — never
    // citing `claude --version` as evidence.
    const auth = parsed.checks.find((c: { id: string }) => c.id === 'auth');
    expect(auth.status).toBe('FAIL');
    expect(auth.detail).toContain('NOT signed in');
    // (b) --live's OWN evidence: the launched session died at a real captured login prompt.
    const live = parsed.checks.find((c: { id: string }) => c.id === 'live');
    expect(live.status).toBe('FAIL');
    expect(live.detail).toContain(loginPrompt);
    expect(parsed.verdict).toBe('FAIL');
  }, 30_000);
});
