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
import {
  checkDevDepInstallability,
  checkTermfleetPorts,
  classifyPort,
  effectiveOmit,
  ensurePtyModule,
  occupantOf,
  omitsDev,
  pickPtyDepName,
  portOf,
  probePtyLoad,
  resolvePtyDir,
  type DevDepIO,
  type RunFn,
  type TermfleetPortIO,
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
    // OA-09: these fixtures do a REAL `npm install termfleet`, so the port/provider coexistence check
    // (bin/preflight.ts) is live here, not skipped — and this test suite's own dev box legitimately runs
    // termfleet as fleet infrastructure on the doc-default port, exactly the coexistence scenario OA-09
    // exists to name (docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md). Pin to an
    // unrelated port so THAT box-wide fact — orthogonal to what THIS describe block tests (collisions) —
    // downgrades to a caution, never a hard-fail that would make these collision assertions flaky on a
    // dev box vs. a clean CI runner.
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'preflight.ts')], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:18471' },
    });
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
  const runCli = (dir: string, env: Record<string, string | undefined>): { exitCode: number; stdout: string } => {
    const fullEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ...env })) {
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// OA-09: termfleet port/provider coexistence — every fleet dev box already runs termfleet as
// machine-wide infrastructure (docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md).
// These tests exercise the extracted, dependency-injected `classifyPort`/`checkTermfleetPorts` (the `io`
// seam stands in for a real TCP connect, a real `/healthz` fetch, and a real `ss`/`lsof` shell-out) so a
// regression back to a bare "is the port open" check, or a collapsed warn-vs-caution policy, goes red
// here without ever binding a real socket. `classifyPort`'s shapes were verified against a REAL
// termfleet@0.2.0 provider/console during development (not asserted here, to keep the suite offline):
// a provider's `/healthz` answers `{"ok":true,"provider":"virtual-tmux","instanceId":"<uuid>"}` and its
// `/` answers a plain 404 — exactly the shape `curl -fsS .../` misreads as free.
describe('classifyPort / occupantOf — termfleet port classification (OA-09)', () => {
  const neverHttp = async () => undefined;
  const neverOpen = async () => false;
  const alwaysOpen = async () => true;
  const noRun: RunFn = () => ({ status: 1, stdout: '', stderr: 'not found' });

  test('portOf: parses the port out of a URL; undefined for a portless/unparsable one', () => {
    expect(portOf('http://127.0.0.1:7602')).toBe(7602);
    expect(portOf('http://127.0.0.1')).toBeUndefined();
    expect(portOf('not a url')).toBeUndefined();
    expect(portOf(undefined)).toBeUndefined();
  });

  test('a port that refuses the TCP connect classifies free — the HTTP probe is never even attempted', async () => {
    let httpCalled = false;
    const io: TermfleetPortIO = {
      tcpProbe: neverOpen,
      httpGet: async () => {
        httpCalled = true;
        return undefined;
      },
      run: noRun,
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const c = await classifyPort(7373, io);
    expect(c).toEqual({ port: 7373, status: 'free' });
    expect(httpCalled).toBe(false);
  });

  test('a real termfleet PROVIDER /healthz shape ({ok:true,provider,instanceId}) classifies termfleet-provider, naming kind + instance', async () => {
    const io: TermfleetPortIO = {
      tcpProbe: alwaysOpen,
      httpGet: async () => ({ status: 200, body: JSON.stringify({ ok: true, provider: 'virtual-tmux', instanceId: 'abc-123', build: {} }) }),
      run: noRun,
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const c = await classifyPort(7373, io);
    expect(c).toEqual({ port: 7373, status: 'termfleet-provider', kind: 'virtual-tmux', instanceId: 'abc-123' });
  });

  test('a real termfleet CONSOLE /healthz shape ({ok:true,service:"console"}) classifies termfleet-console', async () => {
    const io: TermfleetPortIO = {
      tcpProbe: alwaysOpen,
      httpGet: async () => ({ status: 200, body: JSON.stringify({ ok: true, service: 'console' }) }),
      run: noRun,
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const c = await classifyPort(7373, io);
    expect(c.status).toBe('termfleet-console');
  });

  test('a plain 404 (the exact shape `curl -fsS .../` misreads as free) classifies foreign-http, never free — the whole point of probing /healthz over the root path', async () => {
    const io: TermfleetPortIO = {
      tcpProbe: alwaysOpen,
      httpGet: async () => ({ status: 404, body: 'Not Found' }),
      run: noRun,
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const c = await classifyPort(7373, io);
    expect(c.status).toBe('foreign-http');
  });

  test('an occupied port whose HTTP GET never even answers (non-HTTP protocol) still classifies foreign-http via occupant naming, not free', async () => {
    const io: TermfleetPortIO = {
      tcpProbe: alwaysOpen,
      httpGet: neverHttp,
      run: (cmd) =>
        cmd === 'ss'
          ? { status: 0, stdout: 'LISTEN 0 511 127.0.0.1:7373 0.0.0.0:*  users:(("sshd",pid=555,fd=9))\n', stderr: '' }
          : { status: 1, stdout: '', stderr: '' },
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const c = await classifyPort(7373, io);
    expect(c.status).toBe('foreign-http');
    expect(c.occupant).toBe('pid 555 (sshd)');
  });

  test('occupantOf: names pid + command from `ss -ltnp`, matched on the LOCAL-ADDRESS column (not a coincidental peer-port match)', () => {
    const run: RunFn = (cmd) =>
      cmd === 'ss'
        ? {
            status: 0,
            stdout: [
              'LISTEN 0 511 127.0.0.1:9999 0.0.0.0:*  users:(("decoy",pid=1,fd=1))', // peer/unrelated line first
              'LISTEN 0 511 127.0.0.1:7373 0.0.0.0:*  users:(("node",pid=42,fd=9))',
            ].join('\n'),
            stderr: '',
          }
        : { status: 1, stdout: '', stderr: '' };
    expect(occupantOf(7373, run)).toBe('pid 42 (node)');
  });

  test('occupantOf: falls back to `lsof -iTCP:<port> -sTCP:LISTEN -Fpc` when `ss` is unavailable', () => {
    const run: RunFn = (cmd) =>
      cmd === 'lsof' ? { status: 0, stdout: 'p777\ncpython3\n', stderr: '' } : { status: 1, stdout: '', stderr: 'ss: not found' };
    expect(occupantOf(7373, run)).toBe('pid 777 (python3)');
  });

  test('occupantOf: neither ss nor lsof available ⇒ undefined (not a throw) — the caller reports "occupant unidentified"', () => {
    expect(occupantOf(7373, noRun)).toBeUndefined();
  });
});

describe('checkTermfleetPorts — warn-vs-caution policy + machine-global state (OA-09)', () => {
  // A minimal but complete fake IO builder. `occupied` maps port -> a classification outcome (via a
  // provider/console/foreign-http fixture body); anything not listed classifies free (TCP refused).
  function fakeIo(opts: {
    occupied?: Record<number, { body: string } | 'foreign-non-http'>;
    env?: Record<string, string | undefined>;
    currentContext?: string; // if set, ~/.termfleet/current.json exists with this baseUrl (or '' for corrupt/no baseUrl)
    advertised?: string[]; // ~/.termfleet/providers/*.json baseUrls
  }): TermfleetPortIO {
    const occupied = opts.occupied ?? {};
    const home = '/home/x/.termfleet';
    return {
      tcpProbe: async (_h, port) => port in occupied,
      httpGet: async (url) => {
        const port = Number(new URL(url).port);
        const o = occupied[port];
        if (!o || o === 'foreign-non-http') return undefined;
        return { status: 200, body: o.body };
      },
      run: () => ({ status: 1, stdout: '', stderr: '' }), // occupant-naming not under test here
      existsSync: (p) =>
        p === join('/repo', 'node_modules', 'termfleet', 'package.json') || // simulate "termfleet is installed" (past the skip gate)
        (p === join(home, 'current.json') && opts.currentContext !== undefined) ||
        (p === join(home, 'providers') && !!opts.advertised),
      readdirSync: (p) => (p === join(home, 'providers') ? (opts.advertised ?? []).map((_u, i) => `p${i}.json`) : []),
      readFileSync: (p) => {
        if (p === join(home, 'current.json')) return opts.currentContext ? JSON.stringify({ baseUrl: opts.currentContext }) : '{}';
        const m = /p(\d+)\.json$/.exec(p);
        if (m && opts.advertised) return JSON.stringify({ baseUrl: opts.advertised[Number(m[1])] });
        return '{}';
      },
      env: { ...opts.env },
      homedir: () => '/home/x',
    };
  }
  const providerBody = (kind = 'virtual-tmux', instanceId = 'abc') => ({ body: JSON.stringify({ ok: true, provider: kind, instanceId }) });

  test('termfleet not yet installed in THIS repo ⇒ skip entirely (deferred to a re-run after `npm install termfleet`) — never probes a real socket for a bare scaffold', async () => {
    let probed = false;
    const io: TermfleetPortIO = {
      tcpProbe: async () => {
        probed = true;
        return false;
      },
      httpGet: async () => undefined,
      run: () => ({ status: 1, stdout: '', stderr: '' }),
      existsSync: () => false, // no node_modules/termfleet anywhere
      readdirSync: () => [],
      readFileSync: () => '',
      env: {},
      homedir: () => '/home/x',
    };
    const r = await checkTermfleetPorts('/repo', io);
    expect(r.notes.some((n) => n.includes('skip'))).toBe(true);
    expect(r.warns).toEqual([]);
    expect(r.failed).toBe(false);
    expect(probed).toBe(false);
  });

  test('a clean box (both default ports free, no pin, no machine-global state) ⇒ no warns, no cautions — the no-false-alarm baseline', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({}));
    expect(r.warns).toEqual([]);
    expect(r.cautions).toEqual([]);
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => n.includes('7373') && n.includes('free'))).toBe(true);
  });

  test('AC-1 shape: UNPINNED + a foreign termfleet PROVIDER on the doc-default port 7373 ⇒ hard warn naming port, "termfleet provider", kind, and instanceId', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({ occupied: { 7373: providerBody('virtual-tmux', 'ef19-decoy') } }));
    expect(r.failed).toBe(true);
    const w = r.warns.join('\n');
    expect(w).toContain('7373');
    expect(w).toContain('termfleet provider');
    expect(w).toContain("kind 'virtual-tmux'");
    expect(w).toContain('ef19-decoy');
    expect(w).toContain('TERMFLEET_PROVIDER_URL'); // prescribes the pin
  });

  test('AC-2 shape: UNPINNED + a foreign NON-termfleet service on 7373 ⇒ hard warn naming it a non-termfleet service', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({ occupied: { 7373: 'foreign-non-http' } }));
    expect(r.failed).toBe(true);
    expect(r.warns.join('\n')).toContain('non-termfleet service');
  });

  test('pinned to a DIFFERENT provider + a foreign occupant on the (unused) doc-default port ⇒ CAUTION only, never a hard warn (no-false-alarm: the operator already did the right thing)', async () => {
    const r = await checkTermfleetPorts(
      '/repo',
      fakeIo({ occupied: { 7373: providerBody() }, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' } }),
    );
    expect(r.warns).toEqual([]);
    expect(r.failed).toBe(false);
    expect(r.cautions.some((c) => c.includes('7373'))).toBe(true);
  });

  test("the PINNED port itself is occupied by a real termfleet provider ⇒ a plain confirming note, no warn/caution", async () => {
    const r = await checkTermfleetPorts(
      '/repo',
      fakeIo({ occupied: { 7602: providerBody('virtual-tmux', 'mine') }, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' } }),
    );
    expect(r.warns).toEqual([]);
    expect(r.cautions).toEqual([]);
    expect(r.notes.some((n) => n.includes('7602') && n.includes('pinned'))).toBe(true);
  });

  test('the PINNED port itself is occupied by something that is NOT a termfleet provider ⇒ hard warn (the pin would connect to the wrong thing)', async () => {
    const r = await checkTermfleetPorts(
      '/repo',
      fakeIo({ occupied: { 7602: 'foreign-non-http' }, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' } }),
    );
    expect(r.failed).toBe(true);
    expect(r.warns.join('\n')).toContain('not a termfleet provider');
  });

  test('~/.termfleet/current.json exists + UNPINNED ⇒ hard warn (a `termfleet use` context silently beats auto-discovery for an unpinned loop)', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({ currentContext: 'http://127.0.0.1:9000' }));
    expect(r.failed).toBe(true);
    const w = r.warns.join('\n');
    expect(w).toContain('current.json');
    expect(w).toContain('http://127.0.0.1:9000');
  });

  test('~/.termfleet/current.json exists + PINNED ⇒ caution only (the pin wins over current-context, so it is harmless)', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({ currentContext: 'http://127.0.0.1:9000', env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' } }));
    expect(r.warns).toEqual([]);
    expect(r.cautions.some((c) => c.includes('current.json'))).toBe(true);
  });

  test('~/.termfleet/providers/*.json advertisements are noted (and their ports get classified too), never a hard warn purely for existing', async () => {
    const r = await checkTermfleetPorts('/repo', fakeIo({ advertised: ['http://127.0.0.1:9500'] }));
    expect(r.notes.some((n) => n.includes('9500'))).toBe(true);
    expect(r.notes.some((n) => n.includes('9500') && n.includes('free'))).toBe(true); // classified, found free
  });
});
