// BL-14: fixture test for the fresh-compile clobber guard, exercised through the REAL CLI (not just the
// underlying findClobbers unit — the AC is about `open-autonomy compile` behavior end-to-end: refuse by
// default, --force overrides, and an additive profile never trips it).
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  test('commit-the-harness text names the worktree failure mode and the exact git commands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-text-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.stdout).toContain('git worktrees');
      expect(r.stdout).toContain('Unknown command: /develop');
      expect(r.stdout).toContain('git add scripts/ scheduler/ .claude/ .codex/ .open-autonomy/ standards/');
      expect(r.stdout).toContain('git commit -m "Install the open-autonomy harness"');
      expect(r.stdout).toContain('docs/OPERATIONS.md#local-runner-quickstart');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
