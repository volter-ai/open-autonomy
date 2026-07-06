// BL-22 dev/04: `open-autonomy lint <profileDir>` exposes check-profiles-grade validation to an external
// profile author, who previously got none of this repo's own safety net.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

function lint(profileDir: string): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'lint-profile.ts'), profileDir], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

describe('open-autonomy lint', () => {
  test('a bundled profile lints clean', () => {
    const r = lint('profiles/hello');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('lint OK');
  });

  test('reports a missing resource AND a skill/folder name mismatch together, writing nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-lint-'));
    try {
      mkdirSync(join(dir, 'skills/wrongname'), { recursive: true });
      writeFileSync(join(dir, 'skills/wrongname/SKILL.md'), '---\nname: not-matching\n---\n');
      writeFileSync(
        join(dir, 'ir.yml'),
        [
          'schema: autonomy.ir.v1',
          'targets: [local]',
          'agents:',
          '  x: { behavior: wrongname, capabilities: [tasks:converse], triggers: [{ cron: "*/5 * * * *" }] }',
          'policy: { box: {} }',
          'resources: [missing.md]',
        ].join('\n'),
      );
      const r = lint(dir);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('missing copy source: missing.md');
      expect(r.stderr).toContain('must equal its folder "wrongname"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('no ir.yml at the given path is a usage error, not a crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-lint-empty-'));
    try {
      const r = lint(dir);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('no ir.yml');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
