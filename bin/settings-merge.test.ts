// OA-10c: unit coverage for the `.claude/settings.json` merge strategy itself — the CLI-owned policy that
// materialize/findClobbers (fresh compile) and planUpgrade/applyUpgrade (upgrade) both call through.
// bin/autonomy-compile.test.ts exercises this through the real CLI end-to-end; this file pins the merge
// function's own contract (append-if-absent, idempotent, preserves unrelated keys, refuses on bad JSON).
import { describe, expect, test } from 'bun:test';
import { CLAUDE_SETTINGS_PATH, settingsMergeStrategies } from './settings-merge.ts';

const merge = settingsMergeStrategies[CLAUDE_SETTINGS_PATH]!.merge;
const GENERATED = JSON.stringify({
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bash the-stop-hook.sh' }] }] },
});

describe('mergeClaudeSettings (bin/settings-merge.ts)', () => {
  test('appends the Stop hook entry onto an existing file with no hooks key at all', () => {
    const existing = JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
    const result = merge(existing, GENERATED);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!.content);
    expect(parsed.permissions.allow).toEqual(['Bash(npm test)']); // untouched
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('bash the-stop-hook.sh');
    expect(result!.note).toBe('+1 Stop hook');
  });

  test('leaves every OTHER key untouched, including a nested one', () => {
    const existing = JSON.stringify({
      permissions: { allow: ['Bash(npm test)'], deny: ['Bash(rm -rf /)'] },
      env: { FOO: 'bar' },
    });
    const parsed = JSON.parse(merge(existing, GENERATED)!.content);
    expect(parsed.permissions).toEqual({ allow: ['Bash(npm test)'], deny: ['Bash(rm -rf /)'] });
    expect(parsed.env).toEqual({ FOO: 'bar' });
  });

  test('preserves an existing UNRELATED hook event (e.g. PostToolUse) verbatim', () => {
    const existing = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'echo hi' }] }] } });
    const parsed = JSON.parse(merge(existing, GENERATED)!.content);
    expect(parsed.hooks.PostToolUse).toEqual([{ hooks: [{ command: 'echo hi' }] }]);
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('bash the-stop-hook.sh');
  });

  test('is idempotent: re-merging an already-merged file does not duplicate the Stop entry', () => {
    const existing = JSON.stringify({ permissions: { allow: [] } });
    const once = merge(existing, GENERATED)!.content;
    const twice = merge(once, GENERATED);
    expect(twice).toBeDefined();
    const parsed = JSON.parse(twice!.content);
    expect(parsed.hooks.Stop).toHaveLength(1);
    expect(twice!.note).toBe('already up to date');
  });

  test('appends alongside an existing, DIFFERENT Stop hook entry (never drops the adopter\'s own hook)', () => {
    const existing = JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'echo my-own-hook' }] }] } });
    const parsed = JSON.parse(merge(existing, GENERATED)!.content);
    expect(parsed.hooks.Stop).toHaveLength(2);
    const commands = parsed.hooks.Stop.flatMap((e: { hooks: Array<{ command: string }> }) => e.hooks.map((h) => h.command));
    expect(commands).toContain('echo my-own-hook');
    expect(commands).toContain('bash the-stop-hook.sh');
  });

  test('returns undefined (refuse) when the EXISTING file is not valid JSON', () => {
    expect(merge('{ not json', GENERATED)).toBeUndefined();
  });

  test('returns undefined (defensive) when the GENERATED content is somehow not valid JSON', () => {
    expect(merge(JSON.stringify({ permissions: {} }), '{ not json')).toBeUndefined();
  });
});
