// OA-10 skeptic-panel coverage gap (Finding 1): the upgrade CLI (bin/autonomy-upgrade.ts) must pass the
// settings-merge strategy into BOTH planUpgrade and applyUpgrade, or every `upgrade --apply` reverts an
// adopter's merged .claude/settings.json back to the profile's whole-file copy (AC-7). The core contract is
// unit-tested in packages/core/src/upgrade.test.ts; THIS file pins the CLI WIRING end-to-end, so reverting
// either settingsMergeStrategies arg in autonomy-upgrade.ts goes red here.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

function run(cmd: string, args: string[], cwd = REPO_ROOT): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}
const compile = (args: string[]) => run('bun', [join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), ...args]);
// The upgrade CLI compiles via compileGithub, so target it with the github-carrying profile.
const upgrade = (dir: string, extra: string[] = []) =>
  run('bun', [join(REPO_ROOT, 'bin', 'autonomy-upgrade.ts'), '--profile', join(REPO_ROOT, 'profiles', 'simple-gh-sdlc'), '--target', dir, ...extra]);

describe('autonomy-upgrade CLI — harness gate merge wiring', () => {
  test('upgrade --apply preserves adopter config and both mandatory Claude gate events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-upg-'));
    try {
      // Seed an adopter's own settings.json, then merge the OA hook in via a fresh compile.
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }));
      const c = compile(['simple-gh-sdlc', 'local', dir]);
      expect(c.exitCode).toBe(0);
      const merged = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(merged.permissions.allow).toEqual(['Bash(npm test)']);
      expect(merged.hooks.Stop).toHaveLength(1);
      expect(merged.hooks.SubagentStop).toHaveLength(1);

      // Now the LONG-TERM maintenance path: upgrade --apply. Without the CLI's merge wiring this reverts the
      // file to the profile's whole-file copy (permissions lost). With it, the adopter's file is preserved.
      const u = upgrade(dir, ['--apply']);
      expect(u.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(after.permissions.allow).toEqual(['Bash(npm test)']); // NOT reverted
      expect(after.hooks.Stop).toHaveLength(1); // still exactly one — not duplicated, not dropped
      expect(after.hooks.SubagentStop).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('upgrade --apply preserves adopter Codex hooks and both mandatory gate events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-gate-upg-codex-'));
    try {
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(
        join(dir, '.codex', 'hooks.json'),
        JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'echo adopter' }] }] } }, null, 2),
      );
      const c = compile(['simple-gh-sdlc', 'local', dir]);
      expect(c.exitCode).toBe(0);
      const merged = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8'));
      expect(merged.hooks.PostToolUse).toHaveLength(1);
      expect(merged.hooks.Stop).toHaveLength(1);
      expect(merged.hooks.SubagentStop).toHaveLength(1);

      const u = upgrade(dir, ['--apply']);
      expect(u.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8'));
      expect(after.hooks.PostToolUse).toHaveLength(1);
      expect(after.hooks.Stop).toHaveLength(1);
      expect(after.hooks.SubagentStop).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
