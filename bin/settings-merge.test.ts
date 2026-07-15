import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_SETTINGS_PATH,
  CODEX_HOOKS_PATH,
  STOP_HOOK_OPT_OUT_KEY,
  settingsMergeStrategies,
} from './settings-merge.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const CURRENT_GATE = 'node_modules/ztrack/plugins/ztrack/hooks/stop-loop.sh';
const GENERATED = JSON.stringify({
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: `bash ${CURRENT_GATE}` }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: `bash ${CURRENT_GATE}` }] }],
  },
});

function commands(config: Record<string, any>, event: 'Stop' | 'SubagentStop'): string[] {
  return config.hooks[event].flatMap((entry: { hooks?: Array<{ command?: string }> }) =>
    (entry.hooks ?? []).flatMap((hook) => typeof hook.command === 'string' ? [hook.command] : []));
}

for (const path of [CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH]) {
  const merge = settingsMergeStrategies[path]!.merge;
  describe(`${path} structured validation-gate merge`, () => {
    test('adds both gate events while preserving adopter-owned configuration', () => {
      const existing = JSON.stringify({
        permissions: { allow: ['Bash(npm test)'] },
        hooks: { PostToolUse: [{ hooks: [{ command: 'echo adopter-hook' }] }] },
      });
      const result = merge(existing, GENERATED);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!.content);
      expect(parsed.permissions.allow).toEqual(['Bash(npm test)']);
      expect(parsed.hooks.PostToolUse).toEqual([{ hooks: [{ command: 'echo adopter-hook' }] }]);
      expect(commands(parsed, 'Stop')).toEqual([`bash ${CURRENT_GATE}`]);
      expect(commands(parsed, 'SubagentStop')).toEqual([`bash ${CURRENT_GATE}`]);
    });

    test('is idempotent', () => {
      const once = merge('{}', GENERATED)!.content;
      const twice = merge(once, GENERATED)!;
      const parsed = JSON.parse(twice.content);
      expect(commands(parsed, 'Stop')).toHaveLength(1);
      expect(commands(parsed, 'SubagentStop')).toHaveLength(1);
      expect(twice.note).toBe('already up to date');
    });

    test('migrates retired and prior OA commands without dropping adopter hooks', () => {
      const existing = JSON.stringify({ hooks: {
        Stop: [
          { hooks: [{ command: 'echo adopter-stop' }] },
          { hooks: [{ command: 'if [ -f node_modules/ztrack/plugins/ztrack-gate/hooks/stop-loop.sh ]; then bash node_modules/ztrack/plugins/ztrack-gate/hooks/stop-loop.sh; fi' }] },
        ],
        SubagentStop: [{ hooks: [{ command: `bash ${CURRENT_GATE}` }] }],
      } });
      const result = merge(existing, GENERATED)!;
      const parsed = JSON.parse(result.content);
      expect(commands(parsed, 'Stop')).toEqual(['echo adopter-stop', `bash ${CURRENT_GATE}`]);
      expect(commands(parsed, 'SubagentStop')).toEqual([`bash ${CURRENT_GATE}`]);
      expect(result.note).toContain('replaced 1 OA gate hook');
    });

    test('honors the existing durable maintainer opt-out byte-for-byte', () => {
      const existing = JSON.stringify({ [STOP_HOOK_OPT_OUT_KEY]: true, hooks: { Stop: [] } }, null, 2);
      const result = merge(existing, GENERATED)!;
      expect(result.content).toBe(existing);
      expect(result.note).toBe('validation gate opt-out honored');
    });

    test('refuses malformed JSON and conflicting non-array gate events', () => {
      expect(merge('{ nope', GENERATED)).toBeUndefined();
      expect(merge(JSON.stringify({ hooks: { Stop: 'owned-shape' } }), GENERATED)).toBeUndefined();
      expect(merge('{}', '{ nope')).toBeUndefined();
    });
  });
}

describe('ztrack-backed profile hook parity', () => {
  for (const profile of ['simple-gh', 'simple-gh-sdlc', 'simple-sdlc', 'soc2-baseline']) {
    test(`${profile} installs byte-identical current Claude and Codex gates`, () => {
      const claude = readFileSync(join(REPO_ROOT, 'profiles', profile, '.claude', 'settings.json'), 'utf8');
      const codex = readFileSync(join(REPO_ROOT, 'profiles', profile, '.codex', 'hooks.json'), 'utf8');
      expect(codex).toBe(claude);
      const parsed = JSON.parse(claude);
      expect(Object.keys(parsed.hooks).sort()).toEqual(['Stop', 'SubagentStop']);
      for (const event of ['Stop', 'SubagentStop'] as const) {
        const command = commands(parsed, event)[0];
        expect(command).toContain(CURRENT_GATE);
        expect(command).toContain('exit 2');
        expect(command).not.toContain('plugins/ztrack-gate/');
      }
    });
  }
});
