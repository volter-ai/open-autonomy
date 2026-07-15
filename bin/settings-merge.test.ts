// OA-10c: unit coverage for the `.claude/settings.json` merge strategy itself — the CLI-owned policy that
// materialize/findClobbers (fresh compile) and planUpgrade/applyUpgrade (upgrade) both call through.
// bin/autonomy-compile.test.ts exercises this through the real CLI end-to-end; this file pins the merge
// function's own contract (append-if-absent, idempotent, preserves unrelated keys, refuses on bad JSON).
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_SETTINGS_PATH, STOP_HOOK_OPT_OUT_KEY, settingsMergeStrategies } from './settings-merge.ts';

const REPO_ROOT = join(import.meta.dir, '..');
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

// The DURABLE opt-out (skeptic-panel BLOCKER fix): the sentinel `_openAutonomyStopHookOptOut: true` makes
// merge a no-op so the Stop hook is NEVER (re-)added — on compile or upgrade. These pin the exact behavior
// the docs now promise (docs/OPERATIONS.md#claude-settings).
describe('mergeClaudeSettings — the durable Stop-hook opt-out sentinel', () => {
  test('with the sentinel set and NO hook, merge returns the file byte-for-byte unchanged (hook never added)', () => {
    const existing = JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, [STOP_HOOK_OPT_OUT_KEY]: true }, null, 2);
    const result = merge(existing, GENERATED);
    expect(result).toBeDefined();
    expect(result!.content).toBe(existing); // exact same bytes — a true structural no-op
    const parsed = JSON.parse(result!.content);
    expect(parsed.hooks).toBeUndefined(); // no Stop hook appended
    expect(parsed.permissions.allow).toEqual(['Bash(npm test)']); // untouched
  });

  test('with the sentinel set, an operator who ALSO removed a previously-merged hook keeps it removed', () => {
    // The realistic durable-opt-out state: they set the sentinel AND deleted the OA hook entry.
    const existing = JSON.stringify({ [STOP_HOOK_OPT_OUT_KEY]: true, hooks: { Stop: [] } }, null, 2);
    const result = merge(existing, GENERATED);
    expect(result!.content).toBe(existing);
    expect(JSON.parse(result!.content).hooks.Stop).toEqual([]); // still empty — not re-added
  });

  test('sentinel === false (or absent) does NOT opt out — the hook is merged as normal', () => {
    const existing = JSON.stringify({ [STOP_HOOK_OPT_OUT_KEY]: false });
    const parsed = JSON.parse(merge(existing, GENERATED)!.content);
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('bash the-stop-hook.sh'); // added — false is not opt-out
  });
});

// Finding 4b nit: a command-LESS Stop entry (which the command-identity dedup can't catch) must still be
// deduped structurally, so re-merging is idempotent even in that degenerate case.
describe('mergeClaudeSettings — structural dedup of a command-less entry', () => {
  const COMMANDLESS_GENERATED = JSON.stringify({ hooks: { Stop: [{ matcher: 'x' }] } });
  test('a command-less generated Stop entry is appended once, then never duplicated on re-merge', () => {
    const first = merge(JSON.stringify({ permissions: {} }), COMMANDLESS_GENERATED)!.content;
    expect(JSON.parse(first).hooks.Stop).toHaveLength(1);
    const second = merge(first, COMMANDLESS_GENERATED)!.content;
    expect(JSON.parse(second).hooks.Stop).toHaveLength(1); // not duplicated
  });
});

// Finding 4b: the merge only reconciles hooks.Stop. Pin the PROFILE's shipped settings.json to Stop-only,
// so adding any other key to it (which the merge would silently drop on every merged install) trips here
// and forces the merge to be extended. Both carrying profiles ship the byte-identical file.
describe('profile .claude/settings.json shape pin (Finding 4b — merge is Stop-only)', () => {
  for (const profile of ['simple-sdlc', 'simple-gh-sdlc']) {
    test(`profiles/${profile}/.claude/settings.json is hooks.Stop ONLY (extend the merge before adding a key)`, () => {
      const raw = readFileSync(join(REPO_ROOT, 'profiles', profile, '.claude', 'settings.json'), 'utf8');
      const parsed = JSON.parse(raw);
      expect(Object.keys(parsed)).toEqual(['hooks']); // no permissions / other top-level keys
      expect(Object.keys(parsed.hooks)).toEqual(['Stop']); // no other hook events
      expect(Array.isArray(parsed.hooks.Stop)).toBe(true);
    });
  }
});

// The loop's enforcement was silently dead in an adopter (ponder) because the profile's Stop-hook
// pointed at `node_modules/ztrack/plugins/ztrack-gate/hooks/stop-loop.sh`, but a newer ztrack renamed
// the plugin dir `ztrack-gate` -> `ztrack` (0.3.0). The `if [ -f ... ]` guard on the vanished path
// no-ops, so `ztrack loop start` armed a loop nothing ever held. ztrack is a dependency here, so we can
// resolve each path the profile hardcodes against the SHIPPED plugin: if a rename outruns the wiring
// again, this fails CI instead of silently disabling the drive-to-green loop for every adopter.
describe('profile Stop-hook path resolves in the installed ztrack (loop must not be silently dead)', () => {
  const profilesDir = join(REPO_ROOT, 'profiles');
  const profiles = readdirSync(profilesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(profilesDir, name, '.claude', 'settings.json')));
  for (const profile of profiles) {
    const raw = readFileSync(join(profilesDir, profile, '.claude', 'settings.json'), 'utf8');
    const commands: string[] = Object.values(JSON.parse(raw).hooks ?? {})
      .flat()
      .flatMap((e: { hooks?: Array<{ command?: string }> }) => e.hooks ?? [])
      .map((h) => h.command ?? '');
    const paths = [...new Set(commands.flatMap((c) => [...c.matchAll(/node_modules\/\S*stop-loop\.sh/g)].map((m) => m[0])))];
    if (paths.length === 0) continue; // this profile ships no loop hook — nothing to resolve
    test(`${profile}: at least one wired stop-loop.sh path resolves under node_modules/ztrack`, () => {
      const resolved = paths.filter((p) => existsSync(join(REPO_ROOT, p)));
      expect(resolved.length).toBeGreaterThan(0);
    });
  }
});
