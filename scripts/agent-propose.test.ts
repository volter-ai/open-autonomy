// DUAL mode (this change): a numeric ref keeps the original `Closes #<n>` GitHub auto-close behavior
// unchanged; a non-numeric STORE ref (e.g. `COMBO-9`, a work item from a non-GitHub-issue tracker) gets a
// `Tracker: <ref>` reference line instead — NEVER a close keyword, since no store-native ref has a numbered
// GitHub issue behind it for GitHub to auto-close. Importing this module runs no side effects (no git/gh
// calls) — the executable body is gated behind `import.meta.main`, which is false for an imported module —
// so this suite exercises the real, exported logic agent-propose.ts itself uses, not a reimplementation.
import { describe, expect, test } from 'bun:test';
import { isDedupCandidate, refKind, refTrailer, REF_PATTERN } from './agent-propose';

describe('refKind — the ref shape catalog', () => {
  test('a bare digit string is numeric', () => {
    expect(refKind('7')).toBe('numeric');
    expect(refKind('123456')).toBe('numeric');
  });
  test('a non-numeric store id is "store"', () => {
    expect(refKind('COMBO-9')).toBe('store');
    expect(refKind('proj.123')).toBe('store');
    expect(refKind('abc_def')).toBe('store');
  });
  test('empty ref is "none"', () => {
    expect(refKind('')).toBe('none');
  });
  test('a ref with characters outside the widened pattern is "none" (refused, not silently coerced)', () => {
    expect(refKind('has space')).toBe('none');
    expect(refKind('slash/es')).toBe('none');
    expect(refKind('#7')).toBe('none');
  });
});

describe('REF_PATTERN — widened from digit-only to [A-Za-z0-9._-]+', () => {
  test('matches numeric and store-shaped refs alike', () => {
    expect(REF_PATTERN.test('7')).toBe(true);
    expect(REF_PATTERN.test('COMBO-9')).toBe(true);
    expect(REF_PATTERN.test('release.2026-07')).toBe(true);
  });
  test('does not match refs with disallowed characters', () => {
    expect(REF_PATTERN.test('has space')).toBe(false);
    expect(REF_PATTERN.test('a/b')).toBe(false);
  });
});

describe('refTrailer — DUAL mode, the actual commit/PR-body line', () => {
  test('numeric ref -> Closes #<n> (unchanged behavior)', () => {
    expect(refTrailer('7')).toBe('Closes #7');
  });
  test('non-numeric store ref -> Tracker: <ref>, never a close keyword', () => {
    const trailer = refTrailer('COMBO-9');
    expect(trailer).toBe('Tracker: COMBO-9');
    expect(trailer).not.toContain('Closes');
    expect(trailer).not.toMatch(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b/i); // no GitHub close keyword, any casing
  });
  test('absent ref -> no trailer at all (an autonomous/cron proposer)', () => {
    expect(refTrailer('')).toBe('');
  });
  test('a store ref never produces a close keyword even if it LOOKS issue-like', () => {
    // Guards against a regression that greedily extracts trailing digits (e.g. from "issue-7") and closes
    // the wrong thing — the whole ref must be numeric, not merely contain digits.
    const trailer = refTrailer('issue-7');
    expect(trailer).toBe('Tracker: issue-7');
    expect(trailer).not.toContain('Closes #7');
    expect(trailer).not.toContain('Closes #');
  });
});

describe('isDedupCandidate — the merged-duplicate guard applies to store refs too', () => {
  test('a numeric ref is a dedup candidate (unchanged)', () => {
    expect(isDedupCandidate('7')).toBe(true);
  });
  test('a non-numeric store ref IS a dedup candidate (this change — previously excluded)', () => {
    expect(isDedupCandidate('COMBO-9')).toBe(true);
  });
  test('an absent ref is not a dedup candidate (no work-item identity to dedup against)', () => {
    expect(isDedupCandidate('')).toBe(false);
  });
});
