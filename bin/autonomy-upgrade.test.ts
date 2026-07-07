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

describe('autonomy-upgrade CLI — settings.json merge wiring (AC-7, Finding 1)', () => {
  test('upgrade --apply PRESERVES a merged .claude/settings.json: permissions survive, Stop hook stays length 1', () => {
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

      // Now the LONG-TERM maintenance path: upgrade --apply. Without the CLI's merge wiring this reverts the
      // file to the profile's whole-file copy (permissions lost). With it, the adopter's file is preserved.
      const u = upgrade(dir, ['--apply']);
      expect(u.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(after.permissions.allow).toEqual(['Bash(npm test)']); // NOT reverted
      expect(after.hooks.Stop).toHaveLength(1); // still exactly one — not duplicated, not dropped
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('the durable Stop-hook opt-out sentinel SURVIVES upgrade --apply (hook not re-added)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-upg-optout-'));
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true });
      // The durable opt-out state: sentinel set, no Stop hook.
      writeFileSync(
        join(dir, '.claude', 'settings.json'),
        JSON.stringify({ _openAutonomyStopHookOptOut: true, permissions: { allow: [] } }, null, 2),
      );
      // A fresh compile must honor it (no hook added) — establishes the manifest so upgrade has prior state.
      const c = compile(['simple-gh-sdlc', 'local', dir]);
      expect(c.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).hooks).toBeUndefined();

      const u = upgrade(dir, ['--apply']);
      expect(u.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(after.hooks).toBeUndefined(); // STILL no Stop hook — the opt-out held across upgrade
      expect(after._openAutonomyStopHookOptOut).toBe(true); // sentinel untouched
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
