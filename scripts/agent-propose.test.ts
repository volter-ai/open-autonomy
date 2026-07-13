// DUAL mode (this change): a numeric ref keeps the original `Closes #<n>` GitHub auto-close behavior
// unchanged; a non-numeric STORE ref (e.g. `COMBO-9`, a work item from a non-GitHub-issue tracker) gets a
// `Tracker: <ref>` reference line instead — NEVER a close keyword, since no store-native ref has a numbered
// GitHub issue behind it for GitHub to auto-close. Importing this module runs no side effects (no git/gh
// calls) — the executable body is gated behind `import.meta.main`, which is false for an imported module —
// so this suite exercises the real, exported logic agent-propose.ts itself uses, not a reimplementation.
//
// Also covers resolveBaseBranch — the retry (gh api) -> local git origin/HEAD -> literal 'main' fallback
// chain for the PR base branch. Both this suite and the ref-shape suite above import only pure/exported
// logic from agent-propose.ts; the rest of the file is the PROPOSE effect itself (git/gh side effects),
// gated behind `import.meta.main` so importing the module for either suite doesn't run it.
import { describe, expect, test } from 'bun:test';
import { isDedupCandidate, refKind, refTrailer, REF_PATTERN, resolveBaseBranch, type ResolveBaseBranchDeps } from './agent-propose';

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

// resolveBaseBranch stubs the two real calls the function makes (`gh api .../default_branch` and
// `git symbolic-ref refs/remotes/origin/HEAD`) plus `sleep`, so retries are exercised without shelling out
// or actually pausing.
const depsWith = (over: Partial<ResolveBaseBranchDeps>): ResolveBaseBranchDeps => {
  const sleeps: number[] = [];
  return {
    ghApiDefaultBranch: () => '',
    gitSymbolicRefOriginHead: () => '',
    sleep: (s: number) => { sleeps.push(s); },
    ...over,
  };
};

describe('resolveBaseBranch — api retries -> local git origin/HEAD -> literal main', () => {
  test('api succeeds immediately: unchanged behavior, no retries/fallback needed', () => {
    let calls = 0;
    const deps = depsWith({
      ghApiDefaultBranch: () => { calls++; return 'dev'; },
      gitSymbolicRefOriginHead: () => { throw new Error('should not be reached'); },
    });
    expect(resolveBaseBranch(deps)).toBe('dev');
    expect(calls).toBe(1);
  });

  test('api fails then succeeds on the 2nd attempt: retry actually retries, uses the api result', () => {
    let calls = 0;
    const sleeps: number[] = [];
    const deps = depsWith({
      ghApiDefaultBranch: () => { calls++; return calls === 1 ? '' : 'trunk'; },
      sleep: (s) => sleeps.push(s),
      gitSymbolicRefOriginHead: () => { throw new Error('should not be reached'); },
    });
    expect(resolveBaseBranch(deps)).toBe('trunk');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([4]); // slept once, between attempt 1 and 2
  });

  test('api fails all 3 retries, local git origin/HEAD resolves: uses that', () => {
    let apiCalls = 0;
    const sleeps: number[] = [];
    const deps = depsWith({
      ghApiDefaultBranch: () => { apiCalls++; return ''; },
      sleep: (s) => sleeps.push(s),
      gitSymbolicRefOriginHead: () => 'dev',
    });
    expect(resolveBaseBranch(deps)).toBe('dev');
    expect(apiCalls).toBe(3);
    expect(sleeps).toEqual([4, 4]); // slept between attempts 1->2 and 2->3, not after the last
  });

  test('api fails all 3 retries, local git origin/HEAD ALSO fails/unset: falls back to literal main', () => {
    const deps = depsWith({
      ghApiDefaultBranch: () => '',
      gitSymbolicRefOriginHead: () => '',
    });
    expect(resolveBaseBranch(deps)).toBe('main');
  });

  test('respects a custom attempts count (does not hardcode 3)', () => {
    let calls = 0;
    const deps = depsWith({
      ghApiDefaultBranch: () => { calls++; return ''; },
      attempts: 1,
    });
    expect(resolveBaseBranch(deps)).toBe('main');
    expect(calls).toBe(1);
  });
});
