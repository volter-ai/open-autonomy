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
