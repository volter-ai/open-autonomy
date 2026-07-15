import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH, settingsMergeStrategies } from './settings-merge.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const CURRENT_GATE = 'node_modules/ztrack/plugins/ztrack/hooks/stop-loop.sh';
const RETIRED_GATE = 'node_modules/ztrack/plugins/ztrack-gate/hooks/stop-loop.sh';
const GENERATED = JSON.stringify({
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: `bash ${CURRENT_GATE}` }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: `bash ${CURRENT_GATE}` }] }],
  },
});

function commands(config: Record<string, unknown>, event: 'Stop' | 'SubagentStop'): string[] {
  const hooks = config.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  return hooks[event].flatMap((entry) => entry.hooks.map((hook) => hook.command));
}

for (const path of [CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH]) {
  const merge = settingsMergeStrategies[path]!.merge;
  describe(`${path} mandatory gate merge`, () => {
    test('adds Stop and SubagentStop while preserving adopter-owned configuration', () => {
      const existing = JSON.stringify({
        permissions: { allow: ['Bash(npm test)'] },
        hooks: { PostToolUse: [{ hooks: [{ command: 'echo adopter-hook' }] }] },
      });
      const result = merge(existing, GENERATED);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!.content);
      expect(parsed.permissions).toEqual({ allow: ['Bash(npm test)'] });
      expect(parsed.hooks.PostToolUse).toEqual([{ hooks: [{ command: 'echo adopter-hook' }] }]);
      expect(commands(parsed, 'Stop')).toContain(`bash ${CURRENT_GATE}`);
      expect(commands(parsed, 'SubagentStop')).toContain(`bash ${CURRENT_GATE}`);
    });

    test('is content-idempotent and never duplicates either event', () => {
      const once = merge('{}', GENERATED)!.content;
      const twice = merge(once, GENERATED)!.content;
      expect(twice).toBe(once);
      const parsed = JSON.parse(twice);
      expect(commands(parsed, 'Stop')).toHaveLength(1);
      expect(commands(parsed, 'SubagentStop')).toHaveLength(1);
    });

    test('replaces the retired fail-open OA command instead of retaining it', () => {
      const retired = JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ command: `if [ -f ${RETIRED_GATE} ]; then bash ${RETIRED_GATE}; fi` }] }],
        },
      });
      const result = merge(retired, GENERATED)!;
      expect(result.content).not.toContain('ztrack-gate');
      const parsed = JSON.parse(result.content);
      expect(commands(parsed, 'Stop')).toEqual([`bash ${CURRENT_GATE}`]);
      expect(commands(parsed, 'SubagentStop')).toEqual([`bash ${CURRENT_GATE}`]);
      expect(result.note).toContain('replaced 1 OA gate hook');
    });

    test('preserves unrelated hooks on the same events', () => {
      const existing = JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ command: 'echo adopter-stop' }] }],
          SubagentStop: [{ hooks: [{ command: 'echo adopter-subagent-stop' }] }],
        },
      });
      const parsed = JSON.parse(merge(existing, GENERATED)!.content);
      expect(commands(parsed, 'Stop')).toContain('echo adopter-stop');
      expect(commands(parsed, 'SubagentStop')).toContain('echo adopter-subagent-stop');
    });

    test('refuses malformed existing or generated JSON', () => {
      expect(merge('{ not json', GENERATED)).toBeUndefined();
      expect(merge('{}', '{ not json')).toBeUndefined();
    });
  });
}

describe('ztrack-backed profile hook artifacts', () => {
  for (const profile of ['simple-gh', 'simple-sdlc', 'simple-gh-sdlc', 'soc2-baseline']) {
    test(`${profile} carries byte-identical fail-closed Claude and Codex gates`, () => {
      const claudePath = join(REPO_ROOT, 'profiles', profile, CLAUDE_SETTINGS_PATH);
      const codexPath = join(REPO_ROOT, 'profiles', profile, CODEX_HOOKS_PATH);
      const claude = readFileSync(claudePath, 'utf8');
      const codex = readFileSync(codexPath, 'utf8');
      expect(codex).toBe(claude);
      expect(claude).toContain(CURRENT_GATE);
      expect(claude).not.toContain('ztrack-gate');
      expect(claude).toContain('exit 2');
      const parsed = JSON.parse(claude);
      expect(commands(parsed, 'Stop')).toHaveLength(1);
      expect(commands(parsed, 'SubagentStop')).toHaveLength(1);
    });
  }

  test('the profile-pinned ztrack package ships the configured hook target', () => {
    expect(existsSync(join(REPO_ROOT, CURRENT_GATE))).toBe(true);
  });
});
