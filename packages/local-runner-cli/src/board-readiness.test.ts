// TA.2 acceptance tests — packages/local-runner-cli/src/board-readiness.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root, so `profiles/<name>` paths below are
// repo-root-relative — same convention as packages/core/src/setup-pack.test.ts.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasDispatchableWork, readMaturitySignals, resolveBoardKind } from './board-readiness.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';

const CWD = '/fake/repo';

// --- board-kind resolution: the profile's OWN declared board type must win over the actor-name default -

describe('readMaturitySignals / resolveBoardKind — derives board type from setup-pack.yml, not actor name', () => {
  test('simple-sdlc: ztrack + oa-approved allowlist (m4_allowlist_label)', () => {
    const signals = readMaturitySignals('profiles/simple-sdlc');
    expect(signals).toEqual({ m4Predicate: 'ztrack', m4AllowlistLabel: 'oa-approved' });
  });

  test('simple-gh: ztrack, no allowlist — codeHost is `github` (its PRs land there) but the BOARD is ztrack; codeHost must never be used as a board-type proxy', () => {
    const signals = readMaturitySignals('profiles/simple-gh');
    expect(signals).toEqual({ m4Predicate: 'ztrack' });
  });

  test('simple-gh-sdlc: gh-issues, no allowlist', () => {
    const signals = readMaturitySignals('profiles/simple-gh-sdlc');
    expect(signals).toEqual({ m4Predicate: 'gh-issues' });
  });

  test('self-driving: gh-issues, no allowlist', () => {
    const signals = readMaturitySignals('profiles/self-driving');
    expect(signals).toEqual({ m4Predicate: 'gh-issues' });
  });

  test('THE BUG THIS UNIT FIXES: simple-sdlc\'s dispatcher is named `pm`, and #140\'s identity default maps `pm` -> gh-issues — but resolveBoardKind must read the profile\'s pack and return ztrack, not silently misfire the identity default', () => {
    const kind = resolveBoardKind({ profileDir: 'profiles/simple-sdlc', actor: 'pm' });
    expect(kind).toEqual({ variant: 'ztrack', allowlistLabel: 'oa-approved', source: 'setup-pack' });
  });

  test('a ztrack-board manager (simple-gh) is NOT overridden by the (also-ztrack, coincidentally-matching) identity default — pack still wins', () => {
    const kind = resolveBoardKind({ profileDir: 'profiles/simple-gh', actor: 'manager' });
    expect(kind).toEqual({ variant: 'ztrack', source: 'setup-pack' });
  });

  test('identity defaults are the FALLBACK ONLY — used when no profileDir is given', () => {
    expect(resolveBoardKind({ actor: 'manager' })).toEqual({ variant: 'ztrack', source: 'identity-default' });
    expect(resolveBoardKind({ actor: 'pm' })).toEqual({ variant: 'gh-issues', source: 'identity-default' });
  });

  test('identity defaults are the FALLBACK ONLY — used when profileDir has no setup-pack.yml (e.g. TS.1 not adopted yet)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-readiness-nopack-'));
    try {
      expect(readMaturitySignals(dir)).toBeUndefined();
      expect(resolveBoardKind({ profileDir: dir, actor: 'pm' })).toEqual({ variant: 'gh-issues', source: 'identity-default' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('neither a resolvable pack nor a proven identity default -> throws loudly (never guesses)', () => {
    expect(() => resolveBoardKind({ actor: 'some-unrecognized-agent' })).toThrow(/cannot resolve board kind/);
    expect(() => resolveBoardKind({})).toThrow(/cannot resolve board kind/);
  });
});

// --- hasDispatchableWork — ztrack variant (simple-gh's manager shape: no allowlist fence) ---------------

describe('hasDispatchableWork — ztrack variant, no allowlist (simple-gh shape)', () => {
  test('empty board -> false', () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, variant: 'ztrack', proc: stub.runner });
    expect(v.actionable).toBe(false);
    expect(v.reason).toMatch(/board empty/);
  });

  test('one ready item, no in-flight branch -> true', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-1'], () => fail('unknown revision', 1));
    const v = hasDispatchableWork({ cwd: CWD, variant: 'ztrack', proc: stub.runner });
    expect(v.actionable).toBe(true);
    expect(v.actionableCount).toBe(1);
  });

  test('a ready item with an open agent/issue-<id> branch already in flight -> false (the parked/in-flight leg)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-2', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-2'], () => ok('deadbeef')); // branch exists = in flight
    const v = hasDispatchableWork({ cwd: CWD, variant: 'ztrack', proc: stub.runner });
    expect(v.actionable).toBe(false);
    expect(v.reason).toMatch(/already in flight/);
  });

  test('two ready items, one fresh + one in flight -> true (the fresh one still counts)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () =>
        ok(JSON.stringify([{ identifier: 'X-3', labels: [] }, { identifier: 'X-4', labels: [] }])),
      )
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-3'], () => ok('deadbeef'))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-4'], () => fail('unknown revision', 1));
    const v = hasDispatchableWork({ cwd: CWD, variant: 'ztrack', proc: stub.runner });
    expect(v.actionable).toBe(true);
    expect(v.actionableCount).toBe(1);
    expect(v.readyCount).toBe(2);
  });
});

// --- hasDispatchableWork — simple-sdlc shape: ztrack + oa-approved allowlist fence ----------------------

describe('hasDispatchableWork — simple-sdlc shape (ztrack + oa-approved allowlist)', () => {
  test('empty board -> false', () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(v.variant).toBe('ztrack');
    expect(v.allowlistLabel).toBe('oa-approved');
    expect(v.actionable).toBe(false);
  });

  test('a `ready` item WITHOUT oa-approved -> false (fenced)', () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'S-1', labels: [] }])));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(v.actionable).toBe(false);
    expect(v.reason).toMatch(/oa-approved.*allowlist/);
  });

  test('the SAME item, now carrying oa-approved -> true (fence lifts)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'S-1', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-S-1'], () => fail('unknown revision', 1));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(v.actionable).toBe(true);
    expect(v.actionableCount).toBe(1);
  });

  test('oa-approved but already in flight (agent/issue-<id> branch/worktree exists) -> false', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'S-2', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-S-2'], () => ok('deadbeef'));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(v.actionable).toBe(false);
    expect(v.reason).toMatch(/already in flight/);
  });
});

// --- hasDispatchableWork — gh-issues variant (simple-gh-sdlc / self-driving shape) -----------------------

describe('hasDispatchableWork — gh-issues variant, no allowlist (simple-gh-sdlc / self-driving shape)', () => {
  test('empty board -> false', () => {
    const stub = new StubProc().onArgs('gh', ['issue', 'list'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-gh-sdlc', proc: stub.runner });
    expect(v.variant).toBe('gh-issues');
    expect(v.actionable).toBe(false);
  });

  test('one ready, non-parked issue with no open PR for it -> true', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 7, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-gh-sdlc', proc: stub.runner });
    expect(v.actionable).toBe(true);
    expect(v.actionableCount).toBe(1);
  });

  test('a ready item with an OPEN agent/issue-<n> PR branch already in flight -> false', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 8, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok(JSON.stringify([{ headRefName: 'agent/issue-8' }])));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/self-driving', proc: stub.runner });
    expect(v.actionable).toBe(false);
    expect(v.reason).toMatch(/already in flight/);
  });

  test('a ready item already labeled `needs-info`/`human-required` is parked, same as eligibility.ts — not actionable', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 9, labels: [{ name: 'ready' }, { name: 'human-required' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/self-driving', proc: stub.runner });
    expect(v.actionable).toBe(false);
  });

  test('an open PR branch for a DIFFERENT issue does not block an unrelated ready item -> true', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 10, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok(JSON.stringify([{ headRefName: 'agent/issue-99' }])));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-gh-sdlc', proc: stub.runner });
    expect(v.actionable).toBe(true);
  });
});

// --- board-type correctness: the exact bug this task names (a ztrack-board `pm` must not default to gh-issues) --

describe('hasDispatchableWork — board-type correctness (the DESIGN §Q2 bug this unit fixes)', () => {
  test('simple-sdlc\'s `pm` probes ztrack (via its pack), never gh — even though #140\'s identity default for `pm` is gh-issues', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'S-9', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-S-9'], () => fail('unknown revision', 1))
      .onArgs('gh', ['issue', 'list'], () => fail('must never be called for a ztrack-board profile', 127))
      .onArgs('gh', ['pr', 'list'], () => fail('must never be called for a ztrack-board profile', 127));
    const v = hasDispatchableWork({ cwd: CWD, profileDir: 'profiles/simple-sdlc', actor: 'pm', proc: stub.runner });
    expect(v.variant).toBe('ztrack');
    expect(v.source).toBe('setup-pack');
    expect(v.actionable).toBe(true);
    expect(stub.calls.some((c) => c.cmd === 'gh')).toBe(false);
  });

  test('WITHOUT a profileDir, the same `pm` actor falls back to the (here, wrong-for-simple-sdlc) identity default gh-issues — documenting the fallback is identity-only, not board-aware', () => {
    const stub = new StubProc().onArgs('gh', ['issue', 'list'], () => ok('[]'));
    const v = hasDispatchableWork({ cwd: CWD, actor: 'pm', proc: stub.runner });
    expect(v.variant).toBe('gh-issues');
    expect(v.source).toBe('identity-default');
  });
});
