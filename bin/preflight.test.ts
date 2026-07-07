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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkDevDepInstallability,
  effectiveOmit,
  ensureAgentAuth,
  ensurePtyModule,
  omitsDev,
  pickPtyDepName,
  probePtyLoad,
  resolvePtyDir,
  type AgentAuthIO,
  type DevDepIO,
  type RunFn,
} from './preflight';

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
  // OA-14's agent-auth check would otherwise probe whatever REAL `claude` CLI happens to be on this box's
  // PATH (signed in or not) — a test-determinism hazard unrelated to what this describe block tests. Force
  // the ANTHROPIC_API_KEY bypass so ensureAgentAuth is a no-op here, isolating these checks from ambient
  // machine auth state (never a real `claude` invocation either way — see OA-14's own describe block below).
  const runCli = (cwd: string): { exitCode: number; stdout: string } => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ANTHROPIC_API_KEY: 'test-oa-preflight-bypass' })) {
      if (v !== undefined) env[k] = v;
    }
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd, stdout: 'pipe', stderr: 'pipe', env });
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
  // OA-14's agent-auth check would otherwise probe whatever REAL `claude` CLI happens to be on this box's
  // PATH (signed in or not) — a test-determinism hazard unrelated to what this describe block tests. Force
  // the ANTHROPIC_API_KEY bypass so ensureAgentAuth is a no-op here, isolating these checks from ambient
  // machine auth state (never a real `claude` invocation either way — see OA-14's own describe block below).
  const runCli = (cwd: string): { exitCode: number; stdout: string } => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ANTHROPIC_API_KEY: 'test-oa-preflight-bypass' })) {
      if (v !== undefined) env[k] = v;
    }
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd, stdout: 'pipe', stderr: 'pipe', env });
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

// ── OA-06: dev-dependency installability (NODE_ENV=production / npm omit=dev silent no-op) ──────────
// docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md. A tamper that reverts the omit-detection
// (e.g. back to a bare `process.env.NODE_ENV === 'production'` test) must go red here: the `.npmrc
// omit=dev` case below never sets NODE_ENV at all, so a NODE_ENV-only check would wrongly stay silent. A
// tamper that guts the evidence-gate (hard-failing on omit=dev alone, or never failing at all) must also
// go red: the "all devDeps present" and "declared but missing" cases below assert OPPOSITE `failed`
// values from the exact same omit=dev starting point.
function fakeDevDepIo(opts: {
  omit: string;
  files?: Record<string, string>;
  nodeEnv?: string;
  installed?: string[]; // devDependency names resolvable via a node_modules/<name>/package.json (any depth)
  omitOk?: boolean; // whether the `npm config get omit` probe itself succeeds (default true)
}): { io: DevDepIO; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const files = opts.files ?? {};
  const installed = new Set(opts.installed ?? []);
  const omitOk = opts.omitOk ?? true;
  const run: RunFn = (cmd, args) => {
    calls.push({ cmd, args });
    // The check must call it WITH `--no-workspaces` (the workspace-member ENOWORKSPACES fix) — match that
    // exact arg vector so a tamper that drops the flag stops matching and the probe reads as failed.
    if (cmd === 'npm' && args.join(' ') === 'config get omit --no-workspaces') {
      return omitOk ? { status: 0, stdout: `${opts.omit}\n`, stderr: '' } : { status: 1, stdout: '', stderr: 'npm error code ENOWORKSPACES' };
    }
    return { status: 1, stdout: '', stderr: `unexpected run() call in fakeDevDepIo: ${cmd} ${args.join(' ')}` };
  };
  const io: DevDepIO = {
    existsSync: (p) => {
      if (Object.prototype.hasOwnProperty.call(files, p)) return true;
      // Resolvable-by-NAME at any node_modules depth — models Node's walk-up resolution (a devDep declared
      // in a workspace member hoists to the ROOT node_modules; devDepResolvable walks up to find it). The
      // regex intentionally matches the name regardless of directory level.
      const m = p.match(/node_modules\/(.+)\/package\.json$/);
      if (m) return installed.has(m[1]!);
      return false;
    },
    readFileSync: (p) => {
      if (files[p] === undefined) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
    run,
    env: opts.nodeEnv === undefined ? {} : { NODE_ENV: opts.nodeEnv },
  };
  return { io, calls };
}

describe('effectiveOmit / omitsDev — parsing npm\'s single effective config value', () => {
  test('effectiveOmit reads `npm config get omit --no-workspaces` verbatim, trimmed, ok:true on exit 0', () => {
    const seen: { cmd: string; args: string[] }[] = [];
    const run: RunFn = (cmd, args) => { seen.push({ cmd, args }); return { status: 0, stdout: 'dev,optional\n', stderr: '' }; };
    expect(effectiveOmit({ run })).toEqual({ omit: 'dev,optional', ok: true });
    // The --no-workspaces flag is load-bearing (workspace-member ENOWORKSPACES) — pin the exact invocation.
    expect(seen[0]).toEqual({ cmd: 'npm', args: ['config', 'get', 'omit', '--no-workspaces'] });
  });

  test('effectiveOmit is empty (ok:true) when nothing is omitted (npm prints a blank line)', () => {
    const run: RunFn = () => ({ status: 0, stdout: '\n', stderr: '' });
    expect(effectiveOmit({ run })).toEqual({ omit: '', ok: true });
  });

  test('effectiveOmit reports ok:false on a NON-zero exit (ENOWORKSPACES / npm missing) — NOT mistaken for "nothing omitted"', () => {
    const run: RunFn = () => ({ status: 1, stdout: '', stderr: 'npm error code ENOWORKSPACES' });
    expect(effectiveOmit({ run })).toEqual({ omit: '', ok: false });
  });

  test('omitsDev matches a bare "dev" value', () => expect(omitsDev('dev')).toBe(true));
  test('omitsDev matches "dev" combined with other omitted categories, either order', () => {
    expect(omitsDev('dev,optional')).toBe(true);
    expect(omitsDev('optional,dev')).toBe(true);
  });
  test('omitsDev is false for the empty string', () => expect(omitsDev('')).toBe(false));
  test('omitsDev never matches a substring like "devx" (word-boundary, not substring)', () => {
    expect(omitsDev('devx')).toBe(false);
  });
});

describe('checkDevDepInstallability — the assembled check, DI-driven (AC-6 matrix)', () => {
  const PKG = '/repo/package.json';

  test('no package.json at all → skip note, never calls npm config get omit, never fails', () => {
    const { io, calls } = fakeDevDepIo({ omit: 'dev' });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.cautions).toEqual([]);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => /skip/i.test(n))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('AC-6 case 1: omit empty (healthy box) ⇒ fully silent — no caution, no warn, not failed', () => {
    const { io } = fakeDevDepIo({ omit: '', files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { ztrack: '^1.0.0' } }) } });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.cautions).toEqual([]);
    expect(r.warns).toEqual([]);
  });

  test('AC-6 case 2: omit=dev + every declared devDependency resolves ⇒ caution only, NOT failed', () => {
    const { io } = fakeDevDepIo({
      omit: 'dev',
      nodeEnv: 'production',
      files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { ztrack: '^1.0.0' } }) },
      installed: ['ztrack'],
    });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.cautions).toHaveLength(1);
    expect(r.cautions[0]).toContain('NODE_ENV=production');
    expect(r.cautions[0]).toContain('omit=dev');
    expect(r.cautions[0]).toContain('install NOTHING');
    // The robust override leads with --include=dev (works on every omit source); NODE_ENV=development is
    // offered only as a secondary note here because the cause IS the NODE_ENV default.
    expect(r.cautions[0]).toContain('npm install -D ztrack --include=dev');
    expect(r.cautions[0]).toContain('NODE_ENV=development npm install -D ztrack');
  });

  test('scoped devDependency (@types/node) present ⇒ caution only (the @scope/ is not stripped in the lookup)', () => {
    const { io } = fakeDevDepIo({
      omit: 'dev',
      nodeEnv: 'production',
      files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { '@types/node': '^22.0.0' } }) },
      installed: ['@types/node'],
    });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.cautions).toHaveLength(1);
  });

  test('scoped devDependency (@types/node) MISSING ⇒ hard fail naming the full scoped name', () => {
    const { io } = fakeDevDepIo({
      omit: 'dev',
      nodeEnv: 'production',
      files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { '@types/node': '^22.0.0' } }) },
      installed: [],
    });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toContain('@types/node');
  });

  test('no devDependencies declared at all (omit=dev) ⇒ caution only, not failed (nothing to have no-opped yet)', () => {
    const { io } = fakeDevDepIo({ omit: 'dev', nodeEnv: 'production', files: { [PKG]: JSON.stringify({ name: 'app' }) } });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.cautions).toHaveLength(1);
  });

  test('AC-6 case 3: omit=dev + a declared devDependency is MISSING ⇒ hard fail, names the package + --include=dev override', () => {
    const { io } = fakeDevDepIo({
      omit: 'dev',
      nodeEnv: 'production',
      files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { ztrack: '^1.0.0' } }) },
      installed: [],
    });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.cautions).toHaveLength(1); // the always-caution still fires
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toContain('ztrack');
    expect(r.warns[0]).toContain('npm install -D ztrack --include=dev');
    // Softened wording — "not installed", not the unprovable "already happened".
    expect(r.warns[0]).not.toContain('already happened');
  });

  test('multiple declared devDependencies, only some missing ⇒ names only the missing ones', () => {
    const { io } = fakeDevDepIo({
      omit: 'dev',
      nodeEnv: 'production',
      files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { ztrack: '^1.0.0', typescript: '^5.0.0' } }) },
      installed: ['typescript'],
    });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.warns[0]).toContain('ztrack');
    expect(r.warns[0]).not.toContain('typescript');
  });

  test('omit=dev via .npmrc/npm_config_omit WITHOUT NODE_ENV=production ⇒ cautions naming "omit=dev", override is --include=dev ONLY (no NODE_ENV=development, which would no-op here)', () => {
    const { io } = fakeDevDepIo({ omit: 'dev', files: { [PKG]: JSON.stringify({ name: 'app' }) } }); // no nodeEnv passed
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.cautions).toHaveLength(1);
    expect(r.cautions[0]).toContain('omit=dev');
    expect(r.cautions[0]).not.toContain('NODE_ENV=production');
    expect(r.cautions[0]).toContain('npm install -D ztrack --include=dev');
    // The .npmrc/explicit-config path must NOT prescribe NODE_ENV=development — it beats-nothing there.
    expect(r.cautions[0]).not.toContain('NODE_ENV=development');
  });

  test('couldn\'t determine (probe exits nonzero, e.g. ENOWORKSPACES/npm missing) ⇒ a NOTE, never silent-healthy, never a caution/fail', () => {
    const { io } = fakeDevDepIo({ omit: '', omitOk: false, nodeEnv: 'production', files: { [PKG]: JSON.stringify({ name: 'app', devDependencies: { ztrack: '^1.0.0' } }) } });
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.cautions).toEqual([]);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => /could not determine/i.test(n) && /omit/i.test(n))).toBe(true);
  });

  test('unparseable package.json ⇒ notes the parse failure, never throws, never fails', () => {
    const { io } = fakeDevDepIo({ omit: 'dev', nodeEnv: 'production', files: { [PKG]: '{ not json' } });
    expect(() => checkDevDepInstallability('/repo', io)).not.toThrow();
    const r = checkDevDepInstallability('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.cautions).toHaveLength(1); // the omit caution already fired before the parse attempt
  });
});

// ── OA-06 live CLI fixtures — the real `npm config get omit` under the real npm binary, wired into
// `runPreflightCli` end to end. Unlike the DI tests above (which stub `run`), these spawn the actual CLI
// with a real npm on PATH, so a tamper that stops calling `npm config get omit` (e.g. reverts to a bare
// `process.env.NODE_ENV` check) goes red on the `.npmrc`-only case, which never sets NODE_ENV at all.
describe('runPreflightCli — OA-06 dev-dependency installability against a real npm binary', () => {
  const REPO_ROOT = join(import.meta.dir, '..');
  // Same OA-14 isolation as the describe blocks above: default the ANTHROPIC_API_KEY bypass so
  // ensureAgentAuth never probes whatever real `claude` happens to be on this box's PATH; a per-test `env`
  // can still override it (none here do — this suite isn't testing agent auth).
  const runCli = (dir: string, env: Record<string, string | undefined>): { exitCode: number; stdout: string } => {
    const fullEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ANTHROPIC_API_KEY: 'test-oa-preflight-bypass', ...env })) {
      if (v !== undefined) fullEnv[k] = v;
    }
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd: dir, stdout: 'pipe', stderr: 'pipe', env: fullEnv });
    return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8') };
  };
  // Ambient env vars that would themselves poison the "healthy box" fixture — stripped explicitly rather
  // than trusted to be absent from whatever shell runs `bun test`.
  const CLEAN_ENV = { NODE_ENV: undefined, npm_config_omit: undefined, npm_config_production: undefined };

  test('AC-1: NODE_ENV=production, no devDependencies declared yet ⇒ caution naming both NODE_ENV=production and omit=dev, both overrides, exit 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-e2e-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', version: '1.0.0' }));
      const r = runCli(dir, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.stdout).toContain('NODE_ENV=production');
      expect(r.stdout).toContain('omit=dev');
      expect(r.stdout).toContain('install NOTHING');
      expect(r.stdout).toContain('NODE_ENV=development npm install -D ztrack');
      expect(r.stdout).toContain('--include=dev');
      expect(r.exitCode).toBe(0); // caution only — nothing declared-but-missing yet
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-2: NODE_ENV=production with ztrack declared in devDependencies but absent from node_modules ⇒ exit 1, names ztrack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-e2e-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', version: '1.0.0', devDependencies: { ztrack: '^1.0.0' } }));
      const r = runCli(dir, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain('ztrack');
      expect(r.stdout).toContain('declared');
      expect(r.stdout).toContain('npm install -D ztrack --include=dev');
      expect(r.stdout).toContain('preflight: FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-2b: NODE_ENV=production with ztrack declared AND actually present in node_modules ⇒ caution only, exit unaffected by this check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-e2e-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', version: '1.0.0', devDependencies: { ztrack: '^1.0.0' } }));
      mkdirSync(join(dir, 'node_modules', 'ztrack'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'ztrack', 'package.json'), JSON.stringify({ name: 'ztrack', version: '1.0.0' }));
      const r = runCli(dir, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.stdout).toContain('NODE_ENV=production');
      expect(r.exitCode).toBe(0); // the operator already used the override — must not cry wolf
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-3: no noise on a healthy box (NODE_ENV unset, no omit config) — grep -ci NODE_ENV|omit is 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-e2e-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', version: '1.0.0' }));
      const r = runCli(dir, CLEAN_ENV);
      const hits = (r.stdout.match(/NODE_ENV|omit/gi) ?? []).length;
      expect(hits).toBe(0);
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-4: .npmrc omit=dev WITHOUT NODE_ENV set ⇒ still cautions (mentions omit), exit unaffected (no devDeps declared)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-e2e-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'adopter-repo', version: '1.0.0' }));
      writeFileSync(join(dir, '.npmrc'), 'omit=dev\n');
      const r = runCli(dir, CLEAN_ENV);
      expect(r.stdout).toMatch(/omit/i);
      // The .npmrc path must lead with --include=dev and NOT prescribe the (here-broken) NODE_ENV=development.
      expect(r.stdout).toContain('npm install -D ztrack --include=dev');
      expect(r.stdout).not.toContain('NODE_ENV=development');
      expect(r.exitCode).toBe(0);
      rmSync(join(dir, '.npmrc')); // literal filename — never a variable
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  // ── BLOCKER 1: npm WORKSPACE MEMBER — a first-class adopter host (this file's OA-04 header). A bare
  // `npm config get omit` exits 1 (ENOWORKSPACES) with empty stdout in a member, so reading stdout alone
  // would silently skip the check while the F-6 no-op fully reproduces. These run the REAL CLI from inside
  // a member dir, so a tamper that drops `--no-workspaces` goes red (the probe fails → the check would
  // silently skip, dropping the caution these assert). No `npm install` needed — ENOWORKSPACES fires purely
  // from the workspace-root package.json, so these stay fast and network-free.
  const mkWorkspace = (member: object): string => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-devdep-ws-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'ws-root', version: '1.0.0', workspaces: ['packages/*'] }));
    mkdirSync(join(dir, 'packages', 'app'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'app', 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', ...member }));
    return dir;
  };

  test('BLOCKER-1a: NODE_ENV=production inside a workspace MEMBER ⇒ caution still emitted (--no-workspaces makes the omit probe work despite ENOWORKSPACES); no false-alarm exit', () => {
    const root = mkWorkspace({}); // member declares no devDeps
    const member = join(root, 'packages', 'app');
    try {
      const r = runCli(member, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.stdout).toContain('omit=dev');
      expect(r.stdout).toContain('install NOTHING');
      expect(r.exitCode).toBe(0); // caution only — the member declares nothing missing
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('BLOCKER-1b (RIDER): a workspace member with a devDep HOISTED to the root node_modules ⇒ CAUTION-ONLY (exit 0), never a hard-fail (the hoisted copy resolves via walk-up)', () => {
    const root = mkWorkspace({ devDependencies: { 'left-pad': '^1.3.0' } });
    const member = join(root, 'packages', 'app');
    // Simulate npm's hoist: the member's devDep lands in the ROOT node_modules, NOT the member's own.
    mkdirSync(join(root, 'node_modules', 'left-pad'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'left-pad', 'package.json'), JSON.stringify({ name: 'left-pad', version: '1.3.0' }));
    try {
      const r = runCli(member, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.stdout).toContain('omit=dev'); // the caution still fires
      expect(r.stdout).not.toContain('preflight: FAILED'); // but the hoisted devDep resolves → no hard-fail
      expect(r.stdout).not.toContain('left-pad'); // not reported missing
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('BLOCKER-1b sibling: a workspace member whose declared devDep is missing EVERYWHERE (member + root) ⇒ hard-fail naming it (the evidence gate still fires through walk-up)', () => {
    const root = mkWorkspace({ devDependencies: { 'left-pad': '^1.3.0' } }); // nothing installed anywhere
    const member = join(root, 'packages', 'app');
    try {
      const r = runCli(member, { ...CLEAN_ENV, NODE_ENV: 'production' });
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain('left-pad');
      expect(r.stdout).toContain('preflight: FAILED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

// ── OA-14: agent auth — `claude auth status --json` real probe, never `claude --version` ────────────
// docs/adoption-fixes/OA-14-claude-signin-verification.md (F-13). `claude --version` succeeds identically
// signed-in or signed-out, so a logged-out operator passed every preflight check pre-fix and only found
// out ~45s into the loop's first real launch. These tests exercise the extracted, dependency-injected
// `ensureAgentAuth` (a fake `run` seam standing in for spawnSync — NEVER a real `claude` making a network
// or model call) AND the assembled CLI against PATH-shimmed STUB `claude` binaries (shell scripts — never
// the real signed-in CLI). A tamper that reverts to `--version` or to exit-code parsing must go red on the
// "field beats exit code" pair below: real observed behavior on the investigation box is exit 1 on a
// signed-out `auth status --json` (JSON is still the default output mode) — an exit-code-only check would
// get that backwards.
function fakeAuthRun(opts: {
  status?: number | null;
  stdout?: string;
  stderr?: string;
}): { run: RunFn; calls: { cmd: string; args: string[]; opts?: Record<string, unknown> }[] } {
  const calls: { cmd: string; args: string[]; opts?: Record<string, unknown> }[] = [];
  const run: RunFn = (cmd, args, callOpts) => {
    calls.push({ cmd, args, opts: callOpts });
    if (opts.status === undefined && opts.stdout === undefined && opts.stderr === undefined) {
      return { status: null, stdout: null, stderr: null }; // CLI missing from PATH (bun-runtime ENOENT shape)
    }
    return { status: opts.status ?? 0, stdout: opts.stdout ?? '', stderr: opts.stderr ?? '' };
  };
  return { run, calls };
}

describe('ensureAgentAuth — DI-driven, stub `run` only (never a real claude/codex call)', () => {
  test('signed in (loggedIn: true, exit 0) ⇒ pass, no warn', () => {
    const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true, "authMethod": "claude.ai"}\n' });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => /signed in/.test(n) && n.includes('✓'))).toBe(true);
    // The exact command must be the real auth probe — never `--version` — as sign-in evidence.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('claude');
    expect(calls[0]!.args).toEqual(['auth', 'status', '--json']);
    expect(calls[0]!.args).not.toContain('--version');
  });

  test('signed out (loggedIn: false) ⇒ hard gate: warn + failed:true, names the /login remedy', () => {
    const { run } = fakeAuthRun({ status: 1, stdout: '{"loggedIn": false, "authMethod": "none"}\n' });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(true);
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toContain('NOT signed in');
    expect(r.warns[0]).toContain('/login');
  });

  test('field beats exit code: loggedIn:true with a NONZERO exit still PASSES (guards a revert to exit-code parsing)', () => {
    const { run } = fakeAuthRun({ status: 1, stdout: '{"loggedIn": true}\n' });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
  });

  test('field beats exit code: loggedIn:false with a ZERO exit still WARNS (guards a revert to exit-code parsing)', () => {
    const { run } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": false}\n' });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(true);
    expect(r.warns).toHaveLength(1);
  });

  test('ANTHROPIC_API_KEY set ⇒ pass with a note, and the auth-status probe is NEVER invoked', () => {
    const { run, calls } = fakeAuthRun({ status: 1, stdout: '{"loggedIn": false}\n' }); // would fail if it were ever called
    const r = ensureAgentAuth({ run, env: { ANTHROPIC_API_KEY: 'sk-test-dummy' } });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => n.includes('ANTHROPIC_API_KEY'))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('an EMPTY ANTHROPIC_API_KEY (unset-equivalent, `test -n` semantics) does NOT bypass the probe', () => {
    const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true}\n' });
    const r = ensureAgentAuth({ run, env: { ANTHROPIC_API_KEY: '' } });
    expect(r.failed).toBe(false);
    expect(calls).toHaveLength(1); // the probe still ran — an empty string is not "set"
  });

  // FIX 5: the non-interactive claude credential routes — a bearer token, or the Bedrock/Vertex cloud
  // routes — legitimately report `loggedIn: false` on a healthy box (claude authenticates without a
  // `/login` session), so each must bypass the probe with a note instead of hard-failing (residual F-5).
  for (const v of ['ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
    test(`${v} set ⇒ pass with a note, probe NEVER invoked (a logged-out stub behind it would fail if called)`, () => {
      const { run, calls } = fakeAuthRun({ status: 1, stdout: '{"loggedIn": false}\n' });
      const r = ensureAgentAuth({ run, env: { [v]: '1' } });
      expect(r.failed).toBe(false);
      expect(r.warns).toEqual([]);
      expect(r.notes.some((n) => n.includes(v))).toBe(true);
      expect(calls).toHaveLength(0);
    });

    test(`an EMPTY ${v} does NOT bypass the probe (\`test -n\` semantics)`, () => {
      const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true}\n' });
      const r = ensureAgentAuth({ run, env: { [v]: '' } });
      expect(r.failed).toBe(false);
      expect(calls).toHaveLength(1);
    });
  }

  test('older CLI: `auth status --json` errors with no loggedIn field ⇒ a NOTE, gate stays green (feature-detect, not version-parse)', () => {
    const { run } = fakeAuthRun({ status: 1, stdout: '', stderr: "error: unknown command 'auth'\n" });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => /cannot verify sign-in/i.test(n))).toBe(true);
  });

  test('claude not on PATH (status null, bun-runtime ENOENT shape) ⇒ a NOTE, gate stays green — never a hard fail on a missing CLI here', () => {
    const { run } = fakeAuthRun({});
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => /could not run/i.test(n))).toBe(true);
  });

  test('claude not on PATH, node-runtime ENOENT shape (status null explicitly) ⇒ same soft note, not a hard fail', () => {
    const run: RunFn = () => ({ status: null, stdout: '', stderr: '' });
    const r = ensureAgentAuth({ run, env: {} });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
  });

  test('default harness is claude when TERMFLEET_AGENT is unset', () => {
    const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true}\n' });
    ensureAgentAuth({ run, env: {} });
    expect(calls[0]!.cmd).toBe('claude');
  });

  test('TERMFLEET_AGENT=codex — no probe wired for this spec yet ⇒ a NOTE naming the gap, gate stays green, no process spawned', () => {
    const { run, calls } = fakeAuthRun({ status: 1, stdout: '{"loggedIn": false}\n' }); // would fail this test if ever invoked
    const r = ensureAgentAuth({ run, env: { TERMFLEET_AGENT: 'codex' } });
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
    expect(r.notes.some((n) => n.includes('codex') && /manually/i.test(n))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('ANTHROPIC_API_KEY bypass only applies to the claude harness — TERMFLEET_AGENT=codex + a key set still just notes the gap', () => {
    const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true}\n' });
    const r = ensureAgentAuth({ run, env: { TERMFLEET_AGENT: 'codex', ANTHROPIC_API_KEY: 'sk-test-dummy' } });
    expect(r.failed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test('the probe is wrapped with a ~10s timeout (safety against a hanging CLI)', () => {
    const { run, calls } = fakeAuthRun({ status: 0, stdout: '{"loggedIn": true}\n' });
    ensureAgentAuth({ run, env: {} });
    expect(calls[0]!.opts).toMatchObject({ timeout: 10_000 });
  });
});

// ── runPreflightCli — OA-14 wired end to end against PATH-shimmed STUB `claude` binaries. Unlike the DI
// tests above, these drive the real CLI (bun bin/preflight.ts) so a mutation that fails to WIRE
// ensureAgentAuth into the main sequence (or replays its warn as a note) goes red here even though the
// unit tests above would stay green. The stub `claude` is a plain shell script — NEVER the real signed-in
// CLI, and NEVER a `-p` model call (the billed probe this spec explicitly does not implement in preflight).
describe('runPreflightCli — OA-14 agent-auth gate, against PATH-shimmed stub `claude` CLIs', () => {
  const REPO_ROOT = join(import.meta.dir, '..');
  function shim(dir: string, name: string, script: string): void {
    const p = join(dir, name);
    writeFileSync(p, `#!/bin/sh\n${script}\n`);
    chmodSync(p, 0o755);
  }
  // A bare empty repo (no package.json/node_modules/lockfile) so every OTHER preflight check cleanly
  // SKIPs — isolating the agent-auth check as the only possible source of a warn/failure in these tests.
  function emptyRepo(): string {
    return mkdtempSync(join(tmpdir(), 'oa-preflight-auth-'));
  }
  function runCli(cwd: string, binDir: string, extraEnv: Record<string, string | undefined> = {}): { exitCode: number; stdout: string } {
    const fullEnv: Record<string, string> = {};
    // Default the harness + every claude auth-bypass var UNSET (undefined → filtered out below) so ambient
    // env on the machine running the suite can't flip AC-1/AC-3/AC-5: `TERMFLEET_AGENT=codex` would divert
    // to the note-green branch, and any of ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_USE_* set
    // ambiently would bypass the probe entirely — all reasons unrelated to what these tests assert. A test
    // overrides via extraEnv (AC-4 sets ANTHROPIC_API_KEY back on).
    const cleared: Record<string, undefined> = {
      TERMFLEET_AGENT: undefined,
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_CODE_USE_BEDROCK: undefined,
      CLAUDE_CODE_USE_VERTEX: undefined,
    };
    for (const [k, v] of Object.entries({ ...process.env, ...cleared, ...extraEnv, PATH: `${binDir}:${process.env.PATH ?? ''}` })) {
      if (v !== undefined) fullEnv[k] = v;
    }
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], { cwd, stdout: 'pipe', stderr: 'pipe', env: fullEnv });
    return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8') };
  }

  test('AC-1/AC-3: a logged-out stub claude ⇒ preflight prints a `preflight: !` warning naming the signed-out CLI + /login remedy, exit 1', () => {
    const repo = emptyRepo();
    const bin = mkdtempSync(join(tmpdir(), 'oa-preflight-auth-bin-'));
    try {
      shim(
        bin,
        'claude',
        [
          'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
          '  echo \'{"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty"}\'',
          '  exit 1', // the REAL signed-out exit code observed on the investigation box — must not be trusted
          'fi',
          'echo "2.1.202 (Claude Code)"; exit 0', // --version — must NEVER be treated as sign-in evidence
        ].join('\n'),
      );
      const r = runCli(repo, bin, { ANTHROPIC_API_KEY: undefined });
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain('preflight: ! ');
      expect(r.stdout).toContain('NOT signed in');
      expect(r.stdout).toContain('/login');
      expect(r.stdout).toContain('preflight: FAILED');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test('AC-2: a signed-in stub claude ⇒ passes (note, no warn), exit 0', () => {
    const repo = emptyRepo();
    const bin = mkdtempSync(join(tmpdir(), 'oa-preflight-auth-bin-'));
    try {
      shim(
        bin,
        'claude',
        [
          'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
          '  echo \'{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty"}\'',
          '  exit 0',
          'fi',
          'echo "2.1.202 (Claude Code)"; exit 0',
        ].join('\n'),
      );
      const r = runCli(repo, bin, { ANTHROPIC_API_KEY: undefined });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('signed in');
      // Narrow to the AUTH-specific warn substring, NOT the bare `preflight: ! ` prefix: OA-09's
      // provider/port check emits `caution()` lines with that SAME prefix when a termfleet provider
      // occupies 7373/7402 (true on a fleet dev box), which would make this go RED post-merge for a
      // reason unrelated to agent auth. `is NOT signed in` is uniquely the auth warn (bin/preflight.ts).
      expect(r.stdout).not.toContain('is NOT signed in');
      expect(r.stdout).toContain('preflight: OK');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test('AC-4: logged-out stub claude PLUS ANTHROPIC_API_KEY set ⇒ NOT false-flagged — passes with a note, claude is never invoked', () => {
    const repo = emptyRepo();
    const bin = mkdtempSync(join(tmpdir(), 'oa-preflight-auth-bin-'));
    try {
      // Touches a marker if ever invoked — this test asserts the marker is ABSENT (the key bypasses the
      // probe entirely, so a logged-out stub answering it must never even be observed).
      shim(
        bin,
        'claude',
        [
          `touch "${join(bin, '.invoked')}"`,
          'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
          '  echo \'{"loggedIn": false}\'',
          '  exit 1',
          'fi',
          'exit 0',
        ].join('\n'),
      );
      const r = runCli(repo, bin, { ANTHROPIC_API_KEY: 'sk-test-dummy-set' });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('ANTHROPIC_API_KEY');
      // Auth-specific negative (see AC-2's note) — not the bare prefix OA-09's port caution shares.
      expect(r.stdout).not.toContain('is NOT signed in');
      expect(existsSync(join(bin, '.invoked'))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test('AC-5: an older-CLI stub that errors on `auth status` (unknown subcommand) ⇒ a note, gate stays GREEN on this check alone', () => {
    const repo = emptyRepo();
    const bin = mkdtempSync(join(tmpdir(), 'oa-preflight-auth-bin-'));
    try {
      shim(
        bin,
        'claude',
        [
          'if [ "$1" = "auth" ]; then',
          '  echo "error: unknown command \'auth\'" >&2',
          '  exit 1',
          'fi',
          'echo "1.0.0 (Claude Code)"; exit 0',
        ].join('\n'),
      );
      const r = runCli(repo, bin, { ANTHROPIC_API_KEY: undefined });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('cannot verify sign-in');
      // Auth-specific negative (see AC-2's note) — not the bare prefix OA-09's port caution shares.
      expect(r.stdout).not.toContain('is NOT signed in');
      expect(r.stdout).toContain('preflight: OK');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test('never invokes `claude -p` (the billed probe is reserved for the doctor tier, not preflight)', () => {
    const repo = emptyRepo();
    const bin = mkdtempSync(join(tmpdir(), 'oa-preflight-auth-bin-'));
    try {
      // The tripwire is a MARKER FILE, not a stderr line: runCli returns only stdout, so an earlier
      // stderr-only tripwire had NO teeth (a real `-p` call would leave the suite green). The stub touches
      // `.p-invoked` if ever called with `-p` (a regression to the billed deep probe) and still exits
      // nonzero; the assertion is that the marker is ABSENT — this test goes red the instant preflight
      // shells out `claude -p`, no matter where that call's output goes. NEVER wire a real `claude -p`.
      shim(
        bin,
        'claude',
        [
          `if [ "$1" = "-p" ]; then touch "${join(bin, '.p-invoked')}"; echo "PREFLIGHT MUST NEVER CALL claude -p" >&2; exit 99; fi`,
          'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo \'{"loggedIn": true}\'; exit 0; fi',
          'exit 0',
        ].join('\n'),
      );
      const r = runCli(repo, bin, { ANTHROPIC_API_KEY: undefined });
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(bin, '.p-invoked'))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

// ── AC-6 (docs): no doc still claims `claude --version` verifies sign-in; INSTALL-AGENT's Phase-0 gates
// on a real coding-CLI auth line alongside `gh auth status`. A plain grep — but pinned as a test so a
// future doc edit that reintroduces the wrong advice fails `bun run check`, not just a one-off audit.
describe('OA-14 docs (AC-6): no `claude --version` sign-in advice; INSTALL-AGENT Phase 0 has an auth line', () => {
  const REPO_ROOT = join(import.meta.dir, '..');
  const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');

  test('docs/OPERATIONS.md, docs/INSTALL-AGENT.md, README.md never cite `claude --version` as sign-in verification', () => {
    for (const doc of ['docs/OPERATIONS.md', 'docs/INSTALL-AGENT.md', 'README.md']) {
      expect(read(doc)).not.toContain('claude --version');
    }
  });

  test('docs/OPERATIONS.md documents the real `claude auth status --json` probe, honoring the ANTHROPIC_API_KEY alternative', () => {
    const text = read('docs/OPERATIONS.md');
    expect(text).toContain('claude auth status --json');
    expect(text).toMatch(/loggedIn.*true/);
    expect(text).toContain('ANTHROPIC_API_KEY');
  });

  test("docs/INSTALL-AGENT.md's Phase-0 snippet gates on coding-CLI auth alongside `gh auth status`", () => {
    const text = read('docs/INSTALL-AGENT.md');
    const phase0 = text.slice(text.indexOf('## Phase 0'), text.indexOf('## Phase 1'));
    expect(phase0).toContain('gh auth status');
    expect(phase0).toContain('claude auth status');
  });
});
