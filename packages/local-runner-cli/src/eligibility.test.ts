import { describe, expect, test } from 'bun:test';
import { makeEligibilityCheck, openPrNeedsActionEligible, rollupNodeConcluded } from './eligibility.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';

const CWD = '/fake/repo';

describe('rollupNodeConcluded — BOTH CheckRun.status and StatusContext.state (kept verbatim per the build brief)', () => {
  test('CheckRun: COMPLETED is concluded; QUEUED/IN_PROGRESS are not', () => {
    expect(rollupNodeConcluded({ status: 'COMPLETED' })).toBe(true);
    expect(rollupNodeConcluded({ status: 'QUEUED' })).toBe(false);
    expect(rollupNodeConcluded({ status: 'IN_PROGRESS' })).toBe(false);
  });
  test('StatusContext: SUCCESS/FAILURE/ERROR are concluded; PENDING/EXPECTED are not — the twin agent-review arm', () => {
    expect(rollupNodeConcluded({ state: 'SUCCESS' })).toBe(true);
    expect(rollupNodeConcluded({ state: 'FAILURE' })).toBe(true);
    expect(rollupNodeConcluded({ state: 'ERROR' })).toBe(true);
    expect(rollupNodeConcluded({ state: 'PENDING' })).toBe(false);
    expect(rollupNodeConcluded({ state: 'EXPECTED' })).toBe(false);
  });
  test('a node with neither status nor state is NOT concluded', () => {
    expect(rollupNodeConcluded({})).toBe(false);
  });
});

describe('openPrNeedsActionEligible — shared PR leg', () => {
  test('an open PR with an EMPTY rollup (checks have not reported in yet) is NOT eligible', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () => ok(JSON.stringify([{ headRefName: 'x', statusCheckRollup: [] }])));
    const notes: string[] = [];
    expect(openPrNeedsActionEligible(CWD, stub.runner, (l) => notes.push(l))).toBe(false);
  });

  test('a CheckRun rollup still QUEUED is NOT eligible (pending CI must never spin-spawn a respawn)', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () =>
      ok(JSON.stringify([{ headRefName: 'x', statusCheckRollup: [{ status: 'QUEUED' }] }])),
    );
    expect(openPrNeedsActionEligible(CWD, stub.runner, () => {})).toBe(false);
  });

  test('a CheckRun rollup COMPLETED is eligible', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () =>
      ok(JSON.stringify([{ headRefName: 'x', statusCheckRollup: [{ status: 'COMPLETED' }] }])),
    );
    expect(openPrNeedsActionEligible(CWD, stub.runner, () => {})).toBe(true);
  });

  test('a StatusContext rollup in PENDING is NOT eligible (this is the exact twin agent-review shape)', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () =>
      ok(JSON.stringify([{ headRefName: 'x', statusCheckRollup: [{ state: 'PENDING' }] }])),
    );
    expect(openPrNeedsActionEligible(CWD, stub.runner, () => {})).toBe(false);
  });

  test('a StatusContext rollup in SUCCESS is eligible', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () =>
      ok(JSON.stringify([{ headRefName: 'x', statusCheckRollup: [{ state: 'SUCCESS' }] }])),
    );
    expect(openPrNeedsActionEligible(CWD, stub.runner, () => {})).toBe(true);
  });

  test('gh probe failure -> unknown -> treated as NOT eligible, loud on stderr (not asserted here, but never throws)', () => {
    const stub = new StubProc().onArgs('gh', ['pr', 'list'], () => fail('gh: not authenticated'));
    expect(openPrNeedsActionEligible(CWD, stub.runner, () => {})).toBe(false);
  });
});

describe('makeEligibilityCheck — ztrack variant (S6)', () => {
  test('ready ztrack issues -> eligible; PR leg and in-progress leg never even probed (short-circuit OR)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
      .onArgs('gh', ['pr', 'list'], () => fail('should not be called', 127));
    const eligible = makeEligibilityCheck(CWD, 'ztrack', stub.runner);
    expect(eligible()).toBe(true);
  });

  test('no ready issues, no concluded PRs, but an in-progress ztrack issue -> eligible (S6 third leg present)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'))
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'in-progress'], () => ok(JSON.stringify([{ identifier: 'X-2' }])));
    const eligible = makeEligibilityCheck(CWD, 'ztrack', stub.runner);
    expect(eligible()).toBe(true);
  });

  test('nothing ready, nothing concluded, nothing in-progress -> not eligible', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'))
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'in-progress'], () => ok('[]'));
    const eligible = makeEligibilityCheck(CWD, 'ztrack', stub.runner);
    expect(eligible()).toBe(false);
  });
});

describe('makeEligibilityCheck — gh-issues variant (T6)', () => {
  test('a ready, non-parked gh issue -> eligible', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list'], () => fail('should not be called', 127));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(true);
  });

  test('a ready issue ALSO labeled needs-info is parked -> not eligible via that leg', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }, { name: 'needs-info' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(false);
  });

  test('a ready issue ALSO labeled human-required is parked -> not eligible via that leg', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 2, labels: [{ name: 'ready' }, { name: 'human-required' }] }])))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(false);
  });

  test('the ztrack in-progress leg is DROPPED for gh-issues — never probed even when both other legs are false', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'))
      .onArgs('npx', ['ztrack'], () => fail('gh-issues variant must never call ztrack', 127));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(false);
    expect(stub.calls.some((c) => c.cmd === 'npx')).toBe(false);
  });

  test('an open PR whose StatusContext rollup (agent-review) has concluded -> eligible via the PR leg', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok(JSON.stringify([{ headRefName: 'agent/x', statusCheckRollup: [{ state: 'SUCCESS' }] }])));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(true);
  });
});

describe('makeEligibilityCheck — verdict-change logging (verdict lines only flush on CHANGE)', () => {
  test('repeated stable-false verdicts across probe cycles do not keep re-flushing the same lines (smoke: no throw, verdict stable)', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(false);
    expect(eligible()).toBe(false);
    expect(eligible()).toBe(false);
  });

  test('a verdict flip (false -> true) is reflected correctly on the next call', () => {
    let ready = false;
    const stub = new StubProc()
      .on((c, a) => c === 'gh' && a[0] === 'issue', () => (ready ? ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }] }])) : ok('[]')))
      .onArgs('gh', ['pr', 'list'], () => ok('[]'));
    const eligible = makeEligibilityCheck(CWD, 'gh-issues', stub.runner);
    expect(eligible()).toBe(false);
    ready = true;
    expect(eligible()).toBe(true);
  });
});
