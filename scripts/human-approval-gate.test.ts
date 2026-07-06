import { describe, expect, test } from 'bun:test';
import { isMaintainerPermission, qualifies, type Review } from './human-approval-gate';

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
