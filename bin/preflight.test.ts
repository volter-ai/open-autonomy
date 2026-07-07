// OA-05: bin/preflight.ts's node-pty check must be a load PROBE, never a compiled-artifact path guess —
// a healthy prebuilt install never has build/Release/pty.node and the old check false-failed every clean
// environment (docs/adoption-fixes/OA-05-preflight-false-pty-failure.md). These tests exercise the
// extracted, dependency-injected `ensurePtyModule` (pattern: bin/ztrack-preset.test.ts / scripts/
// open-autonomy-preflight.test.ts — test the extracted helper, not the CLI's top-level side effects) with
// a fixture `node_modules/termfleet` and an injected `run` seam standing in for `spawnSync`, so a REVERT
// to the old "does build/Release/pty.node exist" check goes red here: that check never calls `run` at
// all, so it can neither discover the dep name dynamically, nor honor nesting, nor skip a rebuild when a
// probe passes.
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePtyModule, pickPtyDepName, probePtyLoad, resolvePtyDir, type RunFn } from './preflight';

// ── fixture builder ──────────────────────────────────────────────────────────────────────────────
// Builds a throwaway repo root with a fixture `node_modules/termfleet/package.json` declaring the given
// PTY dep name (or none), and — unless `install: false` — a stub install of that dep at the hoisted or
// nested location. No real npm install; the load probe itself is faked via the injected `run` seam, so
// these never touch the network or a real node-pty build.
function fixtureRepo(depName: string | null, opts: { nested?: boolean; install?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-preflight-pty-'));
  mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', 'termfleet', 'package.json'),
    JSON.stringify({
      name: 'termfleet',
      version: '0.2.0',
      dependencies: depName ? { [depName]: '^1.0.0', 'some-other-dep': '^2.0.0' } : { lodash: '^4.17.0' },
    }),
  );
  if (depName && opts.install !== false) {
    const loc = opts.nested
      ? join(dir, 'node_modules', 'termfleet', 'node_modules', depName)
      : join(dir, 'node_modules', depName);
    mkdirSync(loc, { recursive: true });
    writeFileSync(join(loc, 'package.json'), JSON.stringify({ name: depName, version: '1.0.0' }));
  }
  return dir;
}

// A fake `run` seam: records every invocation, answers the `node -e require(...)` probe with a scripted
// outcome, and answers `npm rebuild` with a scripted outcome too (defaulting to npm's real-world "rebuilt
// dependencies successfully" no-op text — the exact phrase that must never stand alone as a success signal).
// `nodeMissing: true` models `node` absent from PATH: spawnSync returns status null (the process never ran)
// for EVERY node invocation, including `node --version`.
function fakeRun(opts: {
  probe: boolean | boolean[]; // one outcome, or one per successive probe call
  rebuildStdout?: string;
  rebuildStatus?: number;
  nodeMissing?: boolean;
}): { run: RunFn; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const probes = Array.isArray(opts.probe) ? [...opts.probe] : [opts.probe];
  const run: RunFn = (cmd, args) => {
    calls.push({ cmd, args });
    // bun-style ENOENT shape (status undefined, null stdio) — the shape the live CLI actually sees, since
    // preflight runs under bun; probePtyLoad must handle node's status-null shape too (tested separately).
    if (cmd === 'node' && opts.nodeMissing) return { status: undefined, stdout: null, stderr: null };
    if (cmd === 'node' && args[0] === '--version') return { status: 0, stdout: 'v22.22.2\n', stderr: '' };
    if (cmd === 'node') {
      const ok = probes.length > 1 ? probes.shift()! : probes[0]!;
      return ok ? { status: 0, stdout: '', stderr: '' } : { status: 1, stdout: '', stderr: "Cannot find module '.../pty.node'" };
    }
    if (cmd === 'npm') {
      return { status: opts.rebuildStatus ?? 0, stdout: opts.rebuildStdout ?? 'rebuilt dependencies successfully\n', stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${cmd}` };
  };
  return { run, calls };
}

const io = (dir: string, run: RunFn) => ({
  existsSync: (p: string) => existsSync(p),
  readFileSync: (p: string) => readFileSync(p, 'utf8'),
  run,
});

describe('pickPtyDepName — dynamic discovery, never a hardcoded name', () => {
  test('picks a renamed dep matching /node-pty/i (e.g. a fork named node-pty-next)', () => {
    expect(pickPtyDepName(JSON.stringify({ dependencies: { 'node-pty-next': '^1.0.0', react: '^18.0.0' } }))).toBe('node-pty-next');
  });

  test("today's real published shape: @homebridge/node-pty-prebuilt-multiarch", () => {
    expect(pickPtyDepName(JSON.stringify({ dependencies: { '@homebridge/node-pty-prebuilt-multiarch': '^0.13.1' } }))).toBe(
      '@homebridge/node-pty-prebuilt-multiarch',
    );
  });

  test('no dependency matches /node-pty/i → null (the skip case)', () => {
    expect(pickPtyDepName(JSON.stringify({ dependencies: { lodash: '^4.0.0' } }))).toBeNull();
  });

  test('unparseable package.json → null, not a throw', () => {
    expect(pickPtyDepName('{ not json')).toBeNull();
  });
});

describe('resolvePtyDir — honors nesting', () => {
  test('hoisted location wins when both notionally exist (checked first)', () => {
    const seen: string[] = [];
    const exists = (p: string) => {
      seen.push(p);
      return true;
    };
    const dir = resolvePtyDir('/repo', 'node-pty-x', exists);
    expect(dir).toBe(join('/repo', 'node_modules', 'node-pty-x'));
    expect(seen[0]).toBe(join('/repo', 'node_modules', 'node-pty-x'));
  });

  test('falls back to node_modules/termfleet/node_modules/<name> when not hoisted', () => {
    const exists = (p: string) => p === join('/repo', 'node_modules', 'termfleet', 'node_modules', 'node-pty-x');
    expect(resolvePtyDir('/repo', 'node-pty-x', exists)).toBe(join('/repo', 'node_modules', 'termfleet', 'node_modules', 'node-pty-x'));
  });

  test('neither location exists → null', () => {
    expect(resolvePtyDir('/repo', 'node-pty-x', () => false)).toBeNull();
  });
});

describe('probePtyLoad — a real `require` probe under node, driven by the injected run seam', () => {
  test('exit 0 ⇒ ok, no stderr required', () => {
    const { run } = fakeRun({ probe: true });
    expect(probePtyLoad('/repo/node_modules/x', run)).toEqual({ ok: true, stderr: '', nodeMissing: false });
  });

  test('nonzero exit ⇒ not ok, carries the real loader error', () => {
    const { run } = fakeRun({ probe: false });
    const r = probePtyLoad('/repo/node_modules/x', run);
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('Cannot find module');
  });

  test('invokes node explicitly with a require of the given path — never bun, never process.execPath', () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const run: RunFn = (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0, stdout: '', stderr: '' };
    };
    probePtyLoad('/repo/node_modules/x', run);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('node');
    expect(calls[0]!.args).toEqual(['-e', 'require(process.argv[1])', '/repo/node_modules/x']);
  });

  test('node not on PATH, node-runtime shape (status null, no signal) ⇒ nodeMissing, distinct from a load failure', () => {
    const run: RunFn = () => ({ status: null, stdout: '', stderr: '', signal: null });
    const r = probePtyLoad('/repo/node_modules/x', run);
    expect(r.ok).toBe(false);
    expect(r.nodeMissing).toBe(true);
  });

  test('node not on PATH, bun-runtime shape (status undefined, null stdio) ⇒ nodeMissing too (== null, never === null)', () => {
    const { run } = fakeRun({ probe: true, nodeMissing: true });
    const r = probePtyLoad('/repo/node_modules/x', run);
    expect(r.ok).toBe(false);
    expect(r.nodeMissing).toBe(true);
  });

  test('a SIGNAL-killed probe (status null but signal set — e.g. a corrupt .node segfaulting node) is a load failure, NOT nodeMissing', () => {
    const run: RunFn = () => ({ status: null, stdout: '', stderr: '', signal: 'SIGSEGV' });
    const r = probePtyLoad('/repo/node_modules/x', run);
    expect(r.ok).toBe(false);
    expect(r.nodeMissing).toBe(false);
  });
});

describe('ensurePtyModule — the assembled check', () => {
  let dirs: string[] = [];
  const mk = (...args: Parameters<typeof fixtureRepo>) => {
    const d = fixtureRepo(...args);
    dirs.push(d);
    return d;
  };
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };

  test('termfleet not installed at all → skip note, not a failure, and no process is ever spawned', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-preflight-pty-'));
    dirs.push(dir);
    const { run, calls } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.rebuildAttempted).toBe(false);
    expect(r.notes.some((n) => /skip/i.test(n))).toBe(true);
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test('termfleet installed but declares no node-pty dependency → skip note, not a failure', () => {
    const dir = mk(null);
    const { run, calls } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => /no node-pty dependency/i.test(n))).toBe(true);
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test('dep-name discovery targets a fixture-declared renamed dep (node-pty-next), not a hardcoded name', () => {
    const dir = mk('node-pty-next');
    const { run } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => n.includes('node-pty-next') && n.includes('✓'))).toBe(true);
    cleanup();
  });

  test('nested-only install location (node_modules/termfleet/node_modules/<name>) is resolved and probed', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch', { nested: true });
    const { run } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => n.includes('@homebridge/node-pty-prebuilt-multiarch') && n.includes('✓'))).toBe(true);
    expect(r.warns).toEqual([]);
    cleanup();
  });

  test('declared dep installed at neither location → actionable warn, no probe/rebuild attempted', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch', { install: false });
    const { run, calls } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(true);
    expect(r.warns.some((w) => w.includes('not installed') && w.includes('npm install'))).toBe(true);
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test('probe-success ⇒ no rebuild attempted at all (today\'s bug: npm rebuild ran on every healthy env)', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch');
    const { run, calls } = fakeRun({ probe: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.rebuildAttempted).toBe(false);
    expect(calls.every((c) => c.cmd !== 'npm')).toBe(true);
    expect(r.notes.some((n) => n.includes('✓'))).toBe(true);
    expect(r.notes.join('\n')).not.toMatch(/FAILED/);
    cleanup();
  });

  test('probe fails then the rebuild fixes it (re-probe passes) ⇒ ONE success line, never a FAILED line', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch');
    const { run, calls } = fakeRun({ probe: [false, true] });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(false);
    expect(r.rebuildAttempted).toBe(true);
    expect(calls.some((c) => c.cmd === 'npm' && c.args[0] === 'rebuild')).toBe(true);
    const successLines = r.notes.filter((n) => n.includes('✓'));
    expect(successLines).toHaveLength(1);
    expect(successLines[0]).toContain('rebuilt');
    expect([...r.notes, ...r.warns].join('\n')).not.toMatch(/FAILED/);
    cleanup();
  });

  test('node missing from PATH ⇒ an install-Node warn, NEVER a rebuild attempt or toolchain advice (not a false module failure)', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch');
    const { run, calls } = fakeRun({ probe: true, nodeMissing: true });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(true);
    expect(r.rebuildAttempted).toBe(false);
    expect(calls.every((c) => c.cmd !== 'npm')).toBe(true);
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toContain('node not found on PATH');
    expect(r.warns[0]).toContain('install Node 22+');
    // The misdiagnosis this branch prevents: no "failed to load", no rebuild noise, no toolchain advice.
    const all = [...r.notes, ...r.warns].join('\n');
    expect(all).not.toContain('failed to load');
    expect(all).not.toContain('build toolchain');
    expect(all).not.toMatch(/rebuild/i);
    cleanup();
  });

  test('probe fails and stays failed after rebuild ⇒ exactly one FAILED block with the real loader error + toolchain advice, and NO ✓ line for this check', () => {
    const dir = mk('@homebridge/node-pty-prebuilt-multiarch');
    const { run, calls } = fakeRun({ probe: [false, false], rebuildStdout: 'rebuilt dependencies successfully\n' });
    const r = ensurePtyModule(dir, io(dir, run));
    expect(r.failed).toBe(true);
    expect(r.rebuildAttempted).toBe(true);
    expect(calls.some((c) => c.cmd === 'npm')).toBe(true);
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toMatch(/FAILED/);
    expect(r.warns[0]).toContain('build toolchain');
    expect(r.warns[0]).toContain("Cannot find module");
    // Mutual exclusivity: success and failure output for this check never coexist.
    expect(r.notes.some((n) => n.includes('✓'))).toBe(false);
    cleanup();
  });
});

// ── the CLI driver: warn → exit 1 wiring (spawn-level, import.meta.main path) ────────────────────
// ensurePtyModule returns notes/warns; runPreflightCli replays them through the printing note/warn
// helpers, and `warn` is what sets `failed` → exit 1. That replay is the one seam the DI tests above
// can't see: a mutation replaying warns as notes would keep every unit test green while the gate
// silently stopped failing. So drive the real CLI (`bun bin/preflight.ts`, the direct-execution
// import.meta.main path — pattern: bin/lint-profile.test.ts) against on-disk fixtures and assert the
// exit code itself.
describe('runPreflightCli — a pty warn fails the gate (exit 1), skips pass it (exit 0)', () => {
  const REPO_ROOT = join(import.meta.dir, '..');
  const runCli = (cwd: string): { exitCode: number; stdout: string } => {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8') };
  };

  test('a pty warn (dep declared but installed nowhere) exits 1 and prints the preflight: ! prefix', () => {
    // No package-lock.json in the fixture, so the lockfile check skips — the pty warn is the only
    // failure source, isolating the warn→exit-code wiring.
    const dir = fixtureRepo('@homebridge/node-pty-prebuilt-multiarch', { install: false });
    const r = runCli(dir);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('preflight: ! ');
    expect(r.stdout).toContain('is not installed');
    expect(r.stdout).toContain('preflight: FAILED');
    rmSync(dir, { recursive: true, force: true });
  });

  test('the all-skip path (no termfleet, no lockfile) exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-preflight-pty-'));
    const r = runCli(dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('termfleet not installed yet — skip');
    expect(r.stdout).toContain('preflight: OK');
    rmSync(dir, { recursive: true, force: true });
  });
});

// ── OA-04: the namespace-collision check, wired into the real CLI, against REAL npm-installed fixtures
// (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md's exact AC fixture recipe). These hit
// the real npm registry (a genuine `termfleet` install, ~5-10s) — the point is to reproduce the audit's
// EXACT empirically-observed failure (a real `@termfleet/core@0.2.0` workspace-symlinked over the real
// published copy), not a stand-in. bin/collision-check.test.ts's own LIVE fixtures cover the same checks
// without the network dependency; these additionally prove the checks are actually WIRED into
// `runPreflightCli` end to end, in the exact shape the acceptance criteria's commands describe.
describe('runPreflightCli — OA-04 namespace collisions against real npm fixtures', () => {
  const REPO_ROOT = join(import.meta.dir, '..');
  const runCli = (cwd: string): { exitCode: number; stdout: string } => {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8') };
  };
  const npmInstall = (dir: string, ...args: string[]) => {
    const r = Bun.spawnSync(['npm', 'install', ...args, '--no-audit', '--no-fund'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
    if (r.exitCode !== 0) throw new Error(`npm install ${args.join(' ')} failed in ${dir}:\n${r.stderr.toString('utf8')}`);
  };

  test('AC-1/AC-2 fixture: a host repo named "termfleet" with a workspace "@termfleet/core" — preflight names BOTH collisions and fails', () => {
    // The spec's exact fixture recipe: root package.json named "termfleet" (with `exports` + a
    // `workspaces` glob + a declared dep on @termfleet/core), a workspace member packages/core =
    // @termfleet/core@0.2.0, then `npm install && npm install termfleet` (both succeed — this is the
    // audit's real repro shape, not a synthetic stand-in).
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-e2e-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'termfleet',
          version: '0.0.0-dev',
          exports: { '.': './dist/index.js' },
          workspaces: ['packages/*'],
          dependencies: { '@termfleet/core': '^0.2.0' },
        }),
      );
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(
        join(dir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: '@termfleet/core', version: '0.2.0', exports: { '.': './dist/index.js' } }),
      );
      npmInstall(dir);
      npmInstall(dir, 'termfleet');

      const r = runCli(dir);
      expect(r.exitCode).toBe(1);
      // Today (pre-fix) this text is entirely absent — only pty/lockfile lines would print.
      expect(r.stdout).toContain('COLLISION (self-reference)');
      expect(r.stdout).toContain('"termfleet"');
      expect(r.stdout).toContain('COLLISION (workspace shadowing)');
      expect(r.stdout).toContain('@termfleet/core');
      expect(r.stdout).toContain('npm has NO flag to prefer a registry copy over a workspace link');
      expect(r.stdout).toContain('preflight: FAILED');

      // AC-2 (same fixture): compile refuses loudly too, before writing any file — and --force overrides.
      const compileNoForce = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), 'simple-sdlc', 'local', dir], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(compileNoForce.exitCode).toBe(1);
      const compileErr = compileNoForce.stderr.toString('utf8');
      expect(compileErr).toContain('COLLISION');
      expect(compileNoForce.stdout.toString('utf8')).not.toMatch(/installed \d+ files/); // nothing was written
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('AC-4 fixture: a workspace member named "ws" (a real transitive dep of termfleet) — preflight names it AND the owning chain', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-e2e-transitive-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'some-fleet-repo', version: '0.0.0-dev', workspaces: ['packages/*'] }),
      );
      mkdirSync(join(dir, 'packages', 'ws'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'ws', 'package.json'), JSON.stringify({ name: 'ws', version: '9.9.9-local' }));
      npmInstall(dir);
      npmInstall(dir, 'termfleet'); // pulls in termfleet's real dependency tree, including its real "ws" dep

      const r = runCli(dir);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain('COLLISION (workspace shadowing)');
      expect(r.stdout).toContain('"ws"');
      expect(r.stdout).toContain('ws ← termfleet'); // the owning chain, discovered dynamically — never hardcoded
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('AC-5 fixture: a clean repo (npm init; npm install termfleet, no workspaces) — no false alarm', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-e2e-clean-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-real-app', version: '1.0.0' }));
      npmInstall(dir, 'termfleet');
      const r = runCli(dir);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("namespace-collision check: no collisions between this repo and the runner's dependency namespace ✓");
      expect(r.stdout).not.toContain('COLLISION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('AC-5 fixture: a workspace repo whose member names never intersect the protected set — no false alarm', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-e2e-nonintersecting-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-cool-app', version: '1.0.0', workspaces: ['packages/*'] }));
      mkdirSync(join(dir, 'packages', 'utils'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'utils', 'package.json'), JSON.stringify({ name: '@my-cool-app/utils', version: '1.0.0' }));
      npmInstall(dir);
      npmInstall(dir, 'termfleet');
      const r = runCli(dir);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).not.toContain('COLLISION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
