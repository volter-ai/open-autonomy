import { describe, expect, test } from 'bun:test';
import { escapeRegExp, highestExistingId, teamKeyFromConfig, parseArgs } from './next-free-issue-id.mjs';

describe('escapeRegExp — neutralizes regex metacharacters', () => {
  test('escapes each metacharacter in the standard set', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  test('leaves a plain alphanumeric team key untouched', () => {
    expect(escapeRegExp('LOCAL')).toBe('LOCAL');
  });
});

describe('highestExistingId — regex-injection regression (CodeQL js/regex-injection)', () => {
  const listDir = () => ['LOCAL-3.md', 'OTHER-9.md', 'LOCAL-11.md', 'SECRET-40.md'];

  test('a plain team key only matches its own store files', () => {
    expect(highestExistingId('LOCAL', '.', listDir)).toBe(11);
  });

  test('a team arg containing "|" (alternation) must NOT be compiled as a live alternation', () => {
    // Before the fix, `LOCAL|OTHER|SECRET` was spliced unescaped into `^${team}-(\d+)\.md$`, which regex
    // alternation's low precedence parses as three top-level branches (`^LOCAL`, `OTHER`, `SECRET-(\d+)\.md$`)
    // instead of one literal team prefix — `^LOCAL` alone matched "LOCAL-3.md" with an unparticipating capture
    // group, corrupting the result to NaN instead of the correct answer. After the fix, the whole string is
    // escaped so it's compared literally: no store file is named "LOCAL|OTHER|SECRET-<n>.md", so this must be 0.
    expect(highestExistingId('LOCAL|OTHER|SECRET', '.', listDir)).toBe(0);
  });

  test('a team arg containing ".*" (wildcard) must NOT act as a wildcard', () => {
    // Before the fix, `.*` as an unescaped prefix made the whole pattern effectively `^.*-(\d+)\.md$`,
    // matching every file in the listing regardless of team and returning 40 (SECRET-40.md's id) — a
    // cross-team id collision risk. After the fix it must match nothing here, since no file is literally
    // named ".*-<n>.md".
    expect(highestExistingId('.*', '.', listDir)).toBe(0);
  });

  test('a team arg containing "(" alone must not throw or be treated as a group', () => {
    expect(() => highestExistingId('LOCAL(', '.', listDir)).not.toThrow();
    expect(highestExistingId('LOCAL(', '.', listDir)).toBe(0);
  });

  test('a literal team key that itself contains an escaped metacharacter still matches its own files', () => {
    const dir = () => ['A.B-2.md', 'AXB-2.md'];
    // "A.B" must match only the file literally named "A.B-2.md", not "AXB-2.md" (which a live `.` would
    // also match as "any character").
    expect(highestExistingId('A.B', '.', dir)).toBe(2);
  });
});

describe('parseArgs + teamKeyFromConfig — untrusted --team still flows through the same escape path', () => {
  test('a --team value with regex metacharacters is accepted as an opaque string (escaping happens at RegExp construction, not here)', () => {
    const opts = parseArgs(['--team', 'A(B'], () => null);
    expect(opts.team).toBe('A(B');
    expect(opts.teamSource).toBe('--team');
  });

  test('teamKeyFromConfig passes through whatever local.teamKey the config declares, untouched', () => {
    const read = () => JSON.stringify({ local: { teamKey: 'WEIRD|TEAM' } });
    expect(teamKeyFromConfig('.volter/tracker-config.json', read)).toBe('WEIRD|TEAM');
  });
});
