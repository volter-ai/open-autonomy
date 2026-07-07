// BL-14: fixture test for the fresh-compile clobber guard, exercised through the REAL CLI (not just the
// underlying findClobbers unit — the AC is about `open-autonomy compile` behavior end-to-end: refuse by
// default, --force overrides, and an additive profile never trips it).
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

function compile(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), ...args], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

describe('autonomy-compile — fresh-compile clobber guard (BL-14)', () => {
  test('compiling self-driving into a dir with an existing, DIFFERENT README.md refuses and names the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme\n");
      const r = compile(['self-driving', 'gh-actions', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('would overwrite');
      expect(r.stderr).toContain('README.md');
      expect(r.stderr).toContain('--force');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--force proceeds and overwrites', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-force-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme\n");
      const r = compile(['self-driving', 'gh-actions', dir, '--force']);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('an additive profile (simple-gh-sdlc) compiling into the SAME populated dir is never refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-overlay-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme, totally unrelated\n");
      writeFileSync(join(dir, 'package.json'), '{"name":"their-app","version":"1.0.0"}\n');
      const r = compile(['simple-gh-sdlc', 'gh-actions', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
      expect(r.stderr).not.toContain('would overwrite');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('compiling into a fresh (non-existent) dir is never refused', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-clobber-fresh-'));
    const dir = join(parent, 'nested', 'outdir');
    try {
      const r = compile(['hello', 'gh-actions', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('autonomy-compile — printed next-steps include the commit-the-harness step (OA-03, AC-7)', () => {
  test('no-tracker profile (hello, local): "Commit the harness" is step 4, "Run the loop" is step 5', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-hello-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('4. Commit the harness');
      expect(r.stdout).toContain('5. Run the loop');
      // The commit step must appear BEFORE the run-the-loop step.
      expect(r.stdout.indexOf('Commit the harness')).toBeGreaterThan(0);
      expect(r.stdout.indexOf('Commit the harness')).toBeLessThan(r.stdout.indexOf('Run the loop'));
      // No tracker step for `hello` — numbering must not skip to 5/6.
      expect(r.stdout).not.toContain('5. Commit the harness');
      expect(r.stdout).not.toContain('6. Run the loop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('tracker profile (simple-sdlc, local): "Commit the harness" is step 5, "Run the loop" is step 6', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-sdlc-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('4. Tracker');
      expect(r.stdout).toContain('5. Commit the harness');
      expect(r.stdout).toContain('6. Run the loop');
      expect(r.stdout.indexOf('Commit the harness')).toBeLessThan(r.stdout.indexOf('Run the loop'));
      expect(r.stdout).not.toContain('4. Commit the harness');
      expect(r.stdout).not.toContain('5. Run the loop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('commit-the-harness text names the worktree failure mode and a staging list DERIVED from this compile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-text-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.stdout).toContain('git worktrees');
      expect(r.stdout).toContain('Unknown command: /develop');
      // hello's footprint: no standards/ (hardcoding it made the printed command die with
      // `fatal: pathspec 'standards/' did not match any files` and the &&-chained commit never ran).
      expect(r.stdout).toContain('git add .claude/ .codex/ .open-autonomy/ scheduler/ scripts/');
      expect(r.stdout).not.toContain('standards/');
      expect(r.stdout).toContain('git commit -m "Install the open-autonomy harness"');
      expect(r.stdout).toContain('docs/OPERATIONS.md#local-runner-quickstart');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a profile WITH standards/ (simple-sdlc) still stages it — the derived list is per-profile, not truncated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-sdlc-stage-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.stdout).toContain('git add .claude/ .codex/ .open-autonomy/ scheduler/ scripts/ standards/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("hello's exact printed commit command RUNS clean end-to-end (git exits 0, everything staged + committed)", () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-runcmd-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      // The printed command line includes the `cd <dir> && ` prefix (outDir != '.'), so it is runnable as-is.
      const line = r.stdout.split('\n').find((l) => l.includes('git add '));
      expect(line).toBeDefined();
      const initGit = (args: string[]) => Bun.spawnSync(['git', ...args], { cwd: dir });
      initGit(['init', '-q']);
      initGit(['config', 'user.email', 'oa03-test@example.com']);
      initGit(['config', 'user.name', 'OA-03 test']);
      const run = Bun.spawnSync(['bash', '-c', line!.trim()], { stdout: 'pipe', stderr: 'pipe' });
      const stderr = run.stderr.toString('utf8');
      expect(stderr).not.toContain('did not match any files'); // the exact Blocker-2 failure mode
      expect(run.exitCode).toBe(0);
      // Everything the compile wrote is now committed — the working tree is clean.
      const st = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: dir, stdout: 'pipe' });
      expect(st.stdout.toString('utf8').trim()).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

// OA-04 (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md): compiling into a repo whose
// package.json (or a declared workspace member) collides with the runner's own dependency namespace must
// refuse LOUDLY before writing anything — mirroring the clobber guard's shape (refuse by default,
// `--force` overrides). At compile time termfleet is typically not installed yet, so no real npm install
// is needed here — this exercises checks A/B (the static protected-name set) exactly as the spec's own
// note describes; bin/preflight.test.ts's OA-04 describe block covers the full checks A+B+C against a
// real npm-installed fixture (needs termfleet actually on disk for Check C to have anything to probe).
describe('autonomy-compile — OA-04 namespace-collision gate', () => {
  test('a target repo whose root package.json is itself named "termfleet" (with a colliding workspace member) refuses before writing any file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', exports: { '.': './dist/index.js' }, workspaces: ['packages/*'] }),
      );
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@termfleet/core', version: '0.2.0' }));
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('COLLISION (self-reference)');
      expect(r.stderr).toContain('COLLISION (workspace shadowing)');
      expect(r.stderr).toContain('--force');
      expect(r.stdout).not.toMatch(/installed \d+ files/); // nothing written
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--force compiles anyway despite the collision (the same escape hatch the clobber guard uses)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-force-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev' }));
      const r = compile(['simple-sdlc', 'local', dir, '--force']);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a target repo with an unrelated name and no workspace collision compiles clean (no false alarm)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-clean-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'their-totally-unrelated-app', version: '1.0.0' }));
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
      expect(r.stderr).not.toContain('COLLISION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a target dir with NO package.json at all is never checked (nothing to collide with yet) — compiles clean', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-collision-compile-nopkg-'));
    const dir = join(parent, 'fresh');
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toContain('COLLISION');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);
});
