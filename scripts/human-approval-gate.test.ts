import { describe, expect, test } from 'bun:test';
import { DEVELOP_ONLY_LABEL, isMaintainerPermission, linkedIssueNumbers, qualifies, type Review } from './human-approval-gate';

const HEAD = 'abc123';
// A permission oracle keyed by login — what the live gate resolves via repos/{repo}/collaborators/{login}/permission.
const permissionOf = (perms: Record<string, string>) => (login: string) => isMaintainerPermission(perms[login] ?? 'none');

const review = (over: Partial<Review>): Review => ({
  state: 'APPROVED',
  commit_id: HEAD,
  user: { login: 'alice' },
  ...over,
});

describe('qualifies — maintainership by repo permission ONLY', () => {
  test('an APPROVED review from a read-only collaborator does NOT qualify', () => {
    expect(qualifies(review({}), HEAD, permissionOf({ alice: 'read' }))).toBe(false);
  });

  test('write / maintain / admin all qualify', () => {
    for (const perm of ['write', 'maintain', 'admin']) {
      expect(qualifies(review({}), HEAD, permissionOf({ alice: perm }))).toBe(true);
    }
  });

  test('author_association is never a fast path — OWNER with read permission fails', () => {
    expect(qualifies(review({ author_association: 'OWNER' }), HEAD, permissionOf({ alice: 'read' }))).toBe(false);
  });

  test('per-SHA re-earn: an Approve on a stale head does not qualify', () => {
    expect(qualifies(review({ commit_id: 'stale' }), HEAD, permissionOf({ alice: 'admin' }))).toBe(false);
  });

  test('event-payload lowercase state is normalized', () => {
    expect(qualifies(review({ state: 'approved' }), HEAD, permissionOf({ alice: 'write' }))).toBe(true);
  });

  test('non-approve states never qualify', () => {
    expect(qualifies(review({ state: 'CHANGES_REQUESTED' }), HEAD, permissionOf({ alice: 'admin' }))).toBe(false);
  });
});

describe('isMaintainerPermission', () => {
  test('read/triage/none are not maintainer permissions', () => {
    for (const perm of ['read', 'triage', 'none', '']) expect(isMaintainerPermission(perm)).toBe(false);
  });
});

describe('linkedIssueNumbers — the PR→issue link the gate scopes agent-develop-only through', () => {
  test('prefers the code-host link graph (closingIssuesReferences)', () => {
    expect(linkedIssueNumbers([{ number: 12 }, { number: 12 }, { number: 40 }], 'Closes #99')).toEqual([12, 40]);
  });

  test('falls back to close-keyword parsing when the graph is empty', () => {
    expect(linkedIssueNumbers([], 'Closes #7.\n\nAlso fixes #9 and resolves #7 again.')).toEqual([7, 9]);
    expect(linkedIssueNumbers(undefined, 'Fixed #33')).toEqual([33]);
  });

  test('a bare "#N" mention is NOT a close link', () => {
    expect(linkedIssueNumbers([], 'Related to #5, see #6')).toEqual([]);
  });

  test('a develop-only hold on the linked issue scopes the PR (the gate owns the label)', () => {
    // The fixture link: PR body closes #12; the issue carries the label. This is the pure half of the
    // scoping decision — the live half (gh issue view) just supplies issueLabelsOf.
    const issueLabelsOf: Record<number, string[]> = { 12: [DEVELOP_ONLY_LABEL, 'origin:roadmap-planner'] };
    const scoped = linkedIssueNumbers(undefined, 'Closes #12').some((n) => (issueLabelsOf[n] ?? []).includes(DEVELOP_ONLY_LABEL));
    expect(scoped).toBe(true);
  });
});
