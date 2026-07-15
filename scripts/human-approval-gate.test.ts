import { describe, expect, test } from 'bun:test';
import {
  DEVELOP_ONLY_LABEL,
  HUMAN_APPROVAL_REQUIRED_LABEL,
  developOnlyFromLookup,
  isMaintainerPermission,
  isSensitivePath,
  linkedIssueNumbers,
  loadHumanRequiredGlobs,
  qualifies,
  requiresHumanApproval,
  type Review,
} from './human-approval-gate';

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

  test('an unreadable label lookup fails CLOSED (scoped), never open', () => {
    // Live-proven on the testbed (BL-5 dev/03): the workflow token lacked issues:read, the failed
    // lookup returned the same '' as "no labels", and every develop-only PR auto-passed. A security
    // gate that cannot read its inputs must hold, not wave through.
    expect(developOnlyFromLookup(null)).toBe(true); // lookup failed → scoped
    expect(developOnlyFromLookup('')).toBe(false); // issue readable, no labels → unscoped
    expect(developOnlyFromLookup('origin:roadmap-planner,priority:high')).toBe(false);
    expect(developOnlyFromLookup(`${DEVELOP_ONLY_LABEL},origin:roadmap-planner`)).toBe(true);
  });
});

describe('approval routing labels', () => {
  test('the non-hold review-routing label scopes the human gate', () => {
    expect(requiresHumanApproval([HUMAN_APPROVAL_REQUIRED_LABEL], false, [], [])).toBe(true);
  });

  test('ordinary labels do not scope the human gate', () => {
    expect(requiresHumanApproval(['ready'], false, [], [])).toBe(false);
  });
});

describe('isSensitivePath — the boundary scripts are inside the gated scope', () => {
  // NOT a fixture: these globs are the repo's REAL compiled .open-autonomy/human-required-paths.json
  // (self-driving's declared policy.risk.human_required_paths, projected at compile). The gate's own
  // qualification logic must never be one un-gated agent PR from change — so this pins the scope on the
  // regenerated data, at BOTH layers (the installed copy and its profile source).
  const globs = loadHumanRequiredGlobs('.');

  test('every boundary script is in scope, at installed AND profile-source paths', () => {
    for (const name of ['human-approval-gate', 'rearm-auto-merge', 'reconcile-merged-issues', 'check-supply-chain']) {
      expect(isSensitivePath(`scripts/${name}.ts`, globs)).toBe(true);
      expect(isSensitivePath(`profiles/self-driving/scripts/${name}.ts`, globs)).toBe(true);
    }
    expect(isSensitivePath('scripts/finalize-agent-review.ts', globs)).toBe(true);
    expect(isSensitivePath('packages/substrate-github/src/runtime/finalize-agent-review.ts', globs)).toBe(true);
  });

  test('non-boundary dev tooling in scripts/ is NOT scoped (enumerated by name, not a broad glob)', () => {
    for (const f of ['scripts/bench-judge.ts', 'scripts/transcript.ts', 'scripts/agent.ts']) {
      expect(isSensitivePath(f, globs)).toBe(false);
    }
  });

  test('proposer transcripts under .open-autonomy/history/ never count as scope', () => {
    expect(isSensitivePath('.open-autonomy/history/run-1/transcript.md', [new Bun.Glob('**/*.md')])).toBe(false);
  });

  test('a missing scope file yields no path scope (labels still gate)', () => {
    expect(loadHumanRequiredGlobs('/nonexistent-root')).toEqual([]);
  });
});
