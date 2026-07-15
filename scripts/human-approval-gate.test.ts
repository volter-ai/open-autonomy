import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  approvalCommandSha,
  commandQualifies,
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
const FULL_HEAD = 'a'.repeat(40);
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

describe('/agent approve — explicit human result, independent of PR author identity', () => {
  test('a write+ maintainer may authorize the exact current head, including through the GraphQL author shape', () => {
    for (const command of [
      { body: `/agent approve ${FULL_HEAD}`, user: { login: 'alice' } },
      { body: `/agent approve ${FULL_HEAD.toUpperCase()}`, author: { login: 'alice' } },
    ]) {
      expect(commandQualifies(command, FULL_HEAD, permissionOf({ alice: 'admin' }))).toBe(true);
    }
  });

  test('a stale SHA, non-maintainer, bare command, short SHA, or trailing text fails closed', () => {
    expect(commandQualifies(
      { body: `/agent approve ${'b'.repeat(40)}`, user: { login: 'alice' } },
      FULL_HEAD,
      permissionOf({ alice: 'admin' }),
    )).toBe(false);
    expect(commandQualifies(
      { body: `/agent approve ${FULL_HEAD}`, user: { login: 'mallory' } },
      FULL_HEAD,
      permissionOf({ mallory: 'read' }),
    )).toBe(false);
    for (const body of ['/agent approve', '/agent approve abc123', `/agent approve ${FULL_HEAD} looks good`]) {
      expect(approvalCommandSha(body)).toBeUndefined();
    }
  });

  test('the parser keeps whitespace exact so it matches the workflow trigger', () => {
    expect(approvalCommandSha(`  /agent approve ${FULL_HEAD}  `)).toBeUndefined();
    expect(approvalCommandSha(`/agent   approve ${FULL_HEAD}`)).toBeUndefined();
    expect(approvalCommandSha(`/AGENT approve ${FULL_HEAD}`)).toBeUndefined();
  });

  test('the real gate posts success for a current command and pending for the same command after the head changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-human-command-'));
    const gh = join(dir, 'gh');
    const log = join(dir, 'gh.log');
    writeFileSync(gh, `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$GH_LOG"
case "$*" in
  *"--json headRefOid,labels,files,body,closingIssuesReferences"*)
    printf '{"headRefOid":"%s","labels":[],"files":[{"path":"scripts/human-approval-gate.ts"}],"body":"Closes #205","closingIssuesReferences":[]}\n' "$GH_HEAD" ;;
  *"issue view 205"*) printf '{"labels":[]}\n' ;;
  *"pulls/42/reviews"*) printf '[]\n' ;;
  *"issues/42/comments?per_page=100"*) printf '%s\n' "$GH_COMMENTS" ;;
  *"collaborators/alice/permission"*) printf '%s\n' "$GH_PERMISSION" ;;
  *"--json assignees,reviewRequests"*) printf '{"assignees":[],"reviewRequests":[]}\n' ;;
  *"--json comments"*) printf '{"comments":[{"body":"<!-- human-approval-gate -->"}]}\n' ;;
  *) printf '\n' ;;
esac
`);
    chmodSync(gh, 0o755);
    const eventPath = join(dir, 'event.json');
    const run = (head: string, comments: unknown[][] = [[{
      id: 7,
      body: `/agent approve ${FULL_HEAD}`,
      user: { login: 'alice' },
    }]], event?: unknown): string => {
      writeFileSync(log, '');
      if (event) writeFileSync(eventPath, JSON.stringify(event));
      const result = spawnSync(process.execPath, [join(import.meta.dir, 'human-approval-gate.ts')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          GH_LOG: log,
          GH_HEAD: head,
          GH_PERMISSION: 'admin',
          GH_COMMENTS: JSON.stringify(comments),
          GITHUB_REPOSITORY: 'acme/repo',
          GITHUB_EVENT_PATH: event ? eventPath : undefined,
          PR_NUMBER: '42',
        },
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };
    try {
      expect(run(FULL_HEAD)).toContain('approved=true → success');
      expect(run('b'.repeat(40))).toContain('approved=false → pending');
      expect(run(FULL_HEAD, [[]])).toContain('approved=false → pending');
      // A mutation event outranks an eventually-consistent listing that still contains the old command.
      for (const event of [
        { action: 'deleted', issue: { pull_request: {} }, comment: { id: 7, body: `/agent approve ${FULL_HEAD}`, user: { login: 'alice' } } },
        { action: 'edited', issue: { pull_request: {} }, comment: { id: 7, body: 'approval withdrawn', user: { login: 'alice' } } },
      ]) {
        expect(run(FULL_HEAD, undefined, event)).toContain('approved=false → pending');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
