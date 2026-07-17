import { describe, expect, test } from 'bun:test';
import { checkDispatchArgs, resolveBaseBranch, type ResolveBaseBranchDeps } from './agent-propose';

// The PROPOSE effect's git/gh side effects are gated behind `import.meta.main`, so importing its small pure
// helpers does not run them. These deps stub the two real calls resolveBaseBranch makes (`gh api
// .../default_branch` and `git symbolic-ref refs/remotes/origin/HEAD`) plus `sleep`, so retries are exercised
// without shelling out or actually pausing.
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

describe('checkDispatchArgs — trusted default-branch gate trigger', () => {
  test('uses repository_dispatch with a deterministic event type and bound payload', () => {
    expect(checkDispatchArgs('security-gate.yml', 'a'.repeat(40), '42')).toEqual([
      'api', '-X', 'POST', 'repos/{owner}/{repo}/dispatches',
      '-f', 'event_type=open-autonomy-security-gate',
      '-f', `client_payload[sha]=${'a'.repeat(40)}`,
      '-f', 'client_payload[pr]=42',
    ]);
  });

  test('cannot carry a caller-selected workflow ref', () => {
    const args = checkDispatchArgs('security-gate.yml', 'b'.repeat(40), '7');
    expect(args).not.toContain('--ref');
    expect(args).not.toContain('workflow');
    expect(args).not.toContain('run');
  });

  test('rejects a workflow name that cannot map to a bounded event type', () => {
    expect(() => checkDispatchArgs('../security gate.yml', 'a'.repeat(40), '1')).toThrow('invalid dispatched check workflow name');
  });
});
