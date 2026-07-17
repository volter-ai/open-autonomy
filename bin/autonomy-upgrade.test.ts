// OA-10 skeptic-panel coverage gap (Finding 1): the upgrade CLI (bin/autonomy-upgrade.ts) must pass the
// settings-merge strategy into BOTH planUpgrade and applyUpgrade, or every `upgrade --apply` reverts an
// adopter's merged .claude/settings.json back to the profile's whole-file copy (AC-7). The core contract is
// unit-tested in packages/core/src/upgrade.test.ts; THIS file pins the CLI WIRING end-to-end, so reverting
// either settingsMergeStrategies arg in autonomy-upgrade.ts goes red here.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

function run(cmd: string, args: string[], cwd = REPO_ROOT): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}
const compile = (args: string[]) => run('bun', [join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), ...args]);
const upgrade = (dir: string, extra: string[] = [], substrate = 'gh-actions') =>
  run('bun', [
    join(REPO_ROOT, 'bin', 'autonomy-upgrade.ts'),
    '--profile', join(REPO_ROOT, 'profiles', 'simple-gh-sdlc'),
    '--target', dir,
    '--substrate', substrate,
    ...extra,
  ]);

function tree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[path.slice(root.length + 1)] = readFileSync(path).toString('base64');
    }
  };
  walk(root);
  return out;
}

describe('autonomy-upgrade CLI — settings.json merge wiring (AC-7, Finding 1)', () => {
  test('upgrade --apply PRESERVES a merged .claude/settings.json: permissions survive, Stop hook stays length 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-upg-'));
    try {
      // Seed an adopter's own settings.json, then merge the OA hook in via a fresh compile.
      mkdirSync(join(dir, '.claude'), { recursive: true });
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }));
      writeFileSync(join(dir, '.codex', 'hooks.json'), JSON.stringify({ adopter: { keep: true } }));
      const c = compile(['simple-gh-sdlc', 'local', dir]);
      expect(c.exitCode).toBe(0);
      const merged = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(merged.permissions.allow).toEqual(['Bash(npm test)']);
      expect(merged.hooks.Stop).toHaveLength(1);
      expect(merged.hooks.SubagentStop).toHaveLength(1);
      const mergedCodex = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8'));
      expect(mergedCodex.adopter.keep).toBe(true);
      expect(mergedCodex.hooks.Stop).toHaveLength(1);
      expect(mergedCodex.hooks.SubagentStop).toHaveLength(1);

      // Now the LONG-TERM maintenance path: upgrade --apply. Without the CLI's merge wiring this reverts the
      // file to the profile's whole-file copy (permissions lost). With it, the adopter's file is preserved.
      const u = upgrade(dir, ['--apply']);
      expect(u.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(after.permissions.allow).toEqual(['Bash(npm test)']); // NOT reverted
      expect(after.hooks.Stop).toHaveLength(1); // still exactly one — not duplicated, not dropped
      expect(after.hooks.SubagentStop).toHaveLength(1);
      const afterCodex = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8'));
      expect(afterCodex.adopter.keep).toBe(true);
      expect(afterCodex.hooks.Stop).toHaveLength(1);
      expect(afterCodex.hooks.SubagentStop).toHaveLength(1);
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

describe('autonomy-upgrade CLI — substrate-aware local planning and apply (#241)', () => {
  test('requires an explicit known substrate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa241-usage-'));
    try {
      const args = ['--profile', join(REPO_ROOT, 'profiles', 'simple-gh-sdlc'), '--target', dir];
      const missing = run('bun', [join(REPO_ROOT, 'bin', 'autonomy-upgrade.ts'), ...args]);
      expect(missing.exitCode).toBe(2);
      expect(missing.stderr).toContain('--substrate <local|gh-actions>');
      const unknown = run('bun', [join(REPO_ROOT, 'bin', 'autonomy-upgrade.ts'), ...args, '--substrate', 'magic']);
      expect(unknown.exitCode).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('local dry-run plans local machinery and writes zero bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa241-dry-'));
    try {
      writeFileSync(join(dir, 'owned.txt'), 'keep\n');
      const before = tree(dir);
      const result = upgrade(dir, [], 'local');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('scheduler/run.mjs');
      expect(result.stdout).toContain('scheduler/schedule.json');
      expect(result.stdout).toContain('scripts/runner.ts');
      expect(tree(dir)).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('local target data is planned/applied and a second dry-run converges to zero', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa241-local-'));
    const configPath = join(dir, 'schedule-config.json');
    try {
      writeFileSync(configPath, JSON.stringify({
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { retrySeconds: 4321 },
      }));
      const extra = ['--provider-url', 'http://127.0.0.1:7602', '--local-schedule-config', configPath];
      const first = upgrade(dir, extra, 'local');
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain('scheduler/schedule.json');
      const applied = upgrade(dir, [...extra, '--apply'], 'local');
      expect(applied.exitCode).toBe(0);
      const schedule = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')) as {
        env: Record<string, string>;
        jobs: Array<{ retrySeconds: number }>;
      };
      expect(schedule.jobs.length).toBeGreaterThan(0);
      expect(schedule.jobs.every((job) => job.retrySeconds === 4321)).toBe(true);
      expect(schedule.env.TERMFLEET_PROVIDER_URL).toBe('http://127.0.0.1:7602');
      const second = upgrade(dir, extra, 'local');
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain('upgrade-changes=0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('local apply preserves an operator-removed pause fence and hand-authored unowned files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa241-owned-'));
    try {
      const initial = compile(['simple-gh-sdlc', 'local', dir]);
      expect(initial.exitCode).toBe(0);
      const pause = join(dir, '.open-autonomy', 'paused');
      expect(readFileSync(pause, 'utf8')).toContain('PAUSED');
      unlinkSync(pause);
      const custom = join(dir, 'scripts', 'adopter-owned.ts');
      writeFileSync(custom, 'export const keep = true;\n');
      const result = upgrade(dir, ['--apply', '--prune'], 'local');
      expect(result.exitCode).toBe(0);
      expect(() => readFileSync(pause)).toThrow();
      expect(readFileSync(custom, 'utf8')).toContain('keep = true');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
