import { describe, expect, test } from 'bun:test';
import { parseAgentCommand } from './public-agent-command.js';
import { buildDeveloperContext } from './public-agent-context.js';
import { parseControlScope, renderStatusComment, summarizeAgentStatus } from './public-agent-control.js';
import { evaluateCi } from './public-agent-ci.js';
import { decideDispatch, decidePmUnavailable } from './public-agent-dispatcher.js';
import { decideLoopBudget } from './public-agent-loop-budget.js';
import { decideMerge } from './public-agent-merge-gate.js';
import { decidePolicy } from './public-agent-policy.js';
import { parsePmDecision, pmFailureDecision } from './public-agent-pm.js';
import { modelFailureVerdict, parseReviewerVerdict } from './public-agent-review.js';
import { resolveAgentTarget } from './public-agent-target.js';

describe('public agent command and target control', () => {
  test('maps develop aliases and review commands', () => {
    expect(parseAgentCommand({ comment: { body: '/agent develop' } }).verb).toBe('develop');
    expect(parseAgentCommand({ comment: { body: '/agent run' } }).verb).toBe('develop');
    expect(parseAgentCommand({ comment: { body: '/agent continue' } }).verb).toBe('develop');
    expect(parseAgentCommand({ comment: { body: '/agent review' } }).verb).toBe('review');
    expect(parseAgentCommand({ label: { name: 'agent-session' } }).verb).toBe('develop');
    expect(parseAgentCommand({ inputs: { command: '/agent develop' } }).verb).toBe('develop');
  });

  test('maps operator controls without starting development', () => {
    expect(parseAgentCommand({ comment: { body: '/agent pause' } }).verb).toBe('pause');
    expect(parseAgentCommand({ comment: { body: '/agent resume repo' } }).verb).toBe('resume');
    expect(parseAgentCommand({ comment: { body: '/agent cancel' } }).verb).toBe('cancel');
    expect(parseAgentCommand({ comment: { body: '/agent retry' } }).verb).toBe('retry');
    expect(parseAgentCommand({ comment: { body: '/agent status' } }).verb).toBe('status');
    expect(parseControlScope('/agent pause repo')).toBe('repo');
    expect(parseControlScope('/agent pause')).toBe('issue');
  });

  test('renders operator status summaries', () => {
    const summary = summarizeAgentStatus({
      issue: { number: 72, labels: [{ name: 'agent-paused' }, { name: 'bug' }] },
      openPr: { number: 73, headRefName: 'agent/issue-72' },
      runs: [
        { databaseId: 1, status: 'in_progress' },
        { databaseId: 2, status: 'completed', conclusion: 'success' },
      ],
      proxyRuns: {
        run_active: { issue: 72, active: true },
        run_done: { issue: 72, active: false },
      },
      repoPaused: true,
    });
    expect(summary.paused).toBe(true);
    expect(summary.repo_paused).toBe(true);
    expect(summary.active_workflow_runs).toBe(1);
    expect(summary.active_proxy_runs).toEqual(['run_active']);
    expect(renderStatusComment(summary)).toContain('active proxy runs: run_active');
  });

  test('resolves issue targets to canonical branches', () => {
    expect(resolveAgentTarget({ issue: { number: 12 }, repository: { default_branch: 'main' } })).toEqual({
      kind: 'issue',
      issue: 12,
      branch: 'agent/issue-12',
      base: 'main',
      can_develop: true,
    });
  });

  test('resolves workflow dispatch issue targets', () => {
    expect(resolveAgentTarget({ inputs: { issue_number: '44' }, repository: { default_branch: 'main' } })).toEqual({
      kind: 'issue',
      issue: 44,
      branch: 'agent/issue-44',
      base: 'main',
      can_develop: true,
    });
  });

  test('resolves workflow dispatch PR review targets', () => {
    expect(resolveAgentTarget(
      { inputs: { pr_number: '45' }, repository: { default_branch: 'main' } },
      { number: 45, headRefName: 'agent/issue-45', isCrossRepository: false, baseRefName: 'main' },
    )).toEqual({
      kind: 'pull_request',
      issue: 45,
      pull_request: 45,
      branch: 'agent/issue-45',
      base: 'main',
      can_develop: true,
    });
  });

  test('rejects non-agent PR branches for autonomous development', () => {
    const target = resolveAgentTarget(
      { issue: { number: 22, pull_request: {} }, repository: { default_branch: 'main' } },
      { number: 22, headRefName: 'feature/manual', isCrossRepository: false, baseRefName: 'main' },
    );
    expect(target.kind).toBe('pull_request');
    expect(target.can_develop).toBe(false);
  });

  test('resolves pull_request_target events and rejects forks', () => {
    const target = resolveAgentTarget({
      repository: { full_name: 'volter/twin', default_branch: 'main' },
      pull_request: {
        number: 33,
        head: { ref: 'agent/issue-33', repo: { full_name: 'someone/twin' } },
        base: { ref: 'main' },
      },
    });
    expect(target.kind).toBe('pull_request');
    expect(target.can_develop).toBe(false);
  });
});

describe('public agent PM dispatcher', () => {
  test('parses strict PM decisions', () => {
    expect(parsePmDecision('{"action":"develop","risk":"low","human_required":false,"reason":"clear docs issue"}')).toEqual({
      action: 'develop',
      risk: 'low',
      human_required: false,
      reason: 'clear docs issue',
    });
  });

  test('turns PM model failures into ignore decisions', () => {
    const decision = pmFailureDecision(new Error('PM returned invalid human_required sk-testsecret000000000000'));
    expect(decision.action).toBe('ignore');
    expect(decision.human_required).toBe(false);
    expect(decision.reason).toContain('PM model decision unavailable');
    expect(decision.reason).not.toContain('sk-testsecret000000000000');
  });

  test('maps develop recommendations to agent comments', () => {
    const decision = decideDispatch(
      { number: 50, labels: [], comments: [] },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear docs issue' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.target).toBe('issue');
    expect(decision.target_number).toBe(50);
    expect(decision.command).toBe('/agent develop');
    expect(decision.comment?.startsWith('/agent develop')).toBe(true);
  });

  test('does not start develop while an agent run is active', () => {
    const decision = decideDispatch(
      { number: 50, labels: [], comments: [], agent_runs: [{ status: 'in_progress' }] },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear docs issue' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.reason).toContain('already queued or in progress');
    expect(decision.comment).toContain('PM agent is waiting.');
  });

  test('does not dispatch when blocking labels are present', () => {
    const decision = decideDispatch(
      { number: 50, labels: [{ name: 'agent-blocked' }], comments: [] },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear docs issue' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.reason).toContain('blocking label present');
    expect(decision.comment).toContain('PM agent is waiting.');
  });

  test('honors autonomy mode labels before develop', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [{ name: 'agent-audit-only' }] },
      target: { branch: 'agent/issue-70' },
      comments: [],
      openPrs: [],
      maxDevelopAttempts: 2,
      maxOpenAgentPrs: 5,
      staleNeedsInfoMinutes: 60,
    });
    expect(decision.decision).toBe('policy_blocked');
    expect(decision.autonomy_mode).toBe('audit-only');
    expect(decision.reason).toContain('does not allow develop');
  });

  test('does not auto-develop maintainer-held issues', () => {
    const decision = decideDispatch(
      { number: 50, labels: [{ name: 'agent-maintainer-hold' }], comments: [] },
      { action: 'develop', risk: 'low', human_required: false, reason: 'exercise pause and resume commands' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.reason).toContain('agent-maintainer-hold');
    expect(decision.command).toBeUndefined();
  });

  test('does not start develop when an open agent PR needs review', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [{ author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: '/agent develop' }],
        open_agent_pr: { number: 60, updatedAt: '2026-06-16T07:20:00Z' },
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear docs issue' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.reason).toContain('open agent PR #60 already exists');
    expect(decision.comment).toContain('PM agent is waiting for review.');
  });

  test('does not start another develop when the prior agent attempt has no newer human input', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: '/agent develop\n\nPM reason: clear docs issue' },
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:20:00Z', body: '/agent develop\n\nPM reason: clear docs issue' },
        ],
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear docs issue' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior agent attempt exists');
  });

  test('treats blocked agent status comments as prior work until a human responds', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'Agent review blocked: retry cap reached for this PR.' },
        ],
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'try again' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior agent attempt exists');
  });

  test('allows another develop when a human comments after the prior agent attempt', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: '/agent develop\n\nPM reason: clear docs issue' },
          { author: { login: 'maintainer' }, createdAt: '2026-06-16T07:20:00Z', body: 'Please retry with a shorter note.' },
        ],
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'new acceptance detail' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.command).toBe('/agent develop');
  });

  test('does not start develop after an unresolved PM needs-info comment', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'PM agent needs more information.\n\nCan you add expected behavior?' },
        ],
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'clear now' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior agent attempt exists');
  });

  test('allows another develop when a human comments after the open agent PR update', () => {
    const decision = decideDispatch(
      {
        number: 50,
        labels: [],
        comments: [{ author: { login: 'maintainer' }, createdAt: '2026-06-16T07:30:00Z', body: 'Please also update the note.' }],
        open_agent_pr: { number: 60, updatedAt: '2026-06-16T07:20:00Z' },
      },
      { action: 'develop', risk: 'low', human_required: false, reason: 'new acceptance detail' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.command).toBe('/agent develop');
  });

  test('maps review recommendations to PR comments', () => {
    const decision = decideDispatch(
      { number: 51, labels: [], comments: [], open_agent_pr: { number: 55 } },
      { action: 'review', risk: 'low', human_required: false, reason: 'agent PR is ready' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.target).toBe('pull_request');
    expect(decision.target_number).toBe(55);
    expect(decision.command).toBe('/agent review');
    expect(decision.comment?.startsWith('/agent review')).toBe(true);
  });

  test('does not start another review when the prior PR review has no newer human input', () => {
    const decision = decideDispatch(
      {
        number: 51,
        labels: [],
        comments: [],
        open_agent_pr: {
          number: 55,
          comments: [
            { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: '/agent review\n\nPM reason: ready' },
            { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:11:00Z', body: 'Agent review blocked: CI gate is blocked. ci is missing' },
          ],
        },
      },
      { action: 'review', risk: 'low', human_required: false, reason: 'agent PR is ready' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior agent review exists');
  });

  test('allows another review when a human comments after the prior PR review', () => {
    const decision = decideDispatch(
      {
        number: 51,
        labels: [],
        comments: [],
        open_agent_pr: {
          number: 55,
          comments: [
            { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'Agent review blocked: CI gate is blocked. ci is missing' },
            { author: { login: 'maintainer' }, createdAt: '2026-06-16T07:20:00Z', body: 'CI is fixed, review again.' },
          ],
        },
      },
      { action: 'review', risk: 'low', human_required: false, reason: 'agent PR is ready' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.command).toBe('/agent review');
  });

  test('does not repeat PM needs-info comments without newer human input', () => {
    const decision = decideDispatch(
      {
        number: 53,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'PM agent needs more information.\n\nCan you add steps?' },
        ],
      },
      { action: 'needs_info', risk: 'low', human_required: false, reason: 'missing repro', question: 'Can you add steps?' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior PM status exists');
  });

  test('allows PM needs-info again after a human response', () => {
    const decision = decideDispatch(
      {
        number: 53,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'PM agent needs more information.\n\nCan you add steps?' },
          { author: { login: 'maintainer' }, createdAt: '2026-06-16T07:20:00Z', body: 'Here are the steps.' },
        ],
      },
      { action: 'needs_info', risk: 'low', human_required: false, reason: 'missing expected result', question: 'What should happen?' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.comment).toContain('What should happen?');
  });

  test('turns needs-info into a comment, not a dispatch', () => {
    const decision = decideDispatch(
      { number: 53, labels: [], comments: [] },
      { action: 'needs_info', risk: 'low', human_required: false, reason: 'missing repro', question: 'Can you add steps?' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.comment).toContain('Can you add steps?');
  });

  test('does not invent a review target without an open PR', () => {
    const decision = decideDispatch(
      { number: 54, labels: [], comments: [] },
      { action: 'review', risk: 'low', human_required: false, reason: 'ready' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.comment).toContain('PM agent cannot review yet.');
  });

  test('turns ignore into a visible no-action status once', () => {
    const decision = decideDispatch(
      { number: 54, labels: [], comments: [] },
      { action: 'ignore', risk: 'low', human_required: false, reason: 'no newer human input after prior work' },
    );
    expect(decision.action).toBe('comment');
    expect(decision.comment).toContain('PM agent is not taking action.');
  });

  test('does not repeat visible no-action statuses without newer human input', () => {
    const decision = decideDispatch(
      {
        number: 54,
        labels: [],
        comments: [
          { author: { login: 'github-actions' }, createdAt: '2026-06-16T07:10:00Z', body: 'PM agent is not taking action.\n\nNo newer human input.' },
        ],
      },
      { action: 'ignore', risk: 'low', human_required: false, reason: 'still no newer human input' },
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior PM status exists');
  });

  test('turns PM budget outages into a visible waiting status', () => {
    const decision = decidePmUnavailable(
      { number: 54, labels: [], comments: [] },
      'PM model budget is temporarily unavailable; the PM agent will retry on a later sweep.',
    );
    expect(decision.action).toBe('comment');
    expect(decision.comment).toContain('PM agent is waiting.');
    expect(decision.reason).toContain('temporarily unavailable');
  });

  test('does not repeat PM budget outage statuses without newer human input', () => {
    const decision = decidePmUnavailable(
      {
        number: 54,
        labels: [],
        comments: [
          {
            author: { login: 'github-actions' },
            createdAt: '2026-06-16T07:10:00Z',
            body: 'PM agent is waiting.\n\nPM model budget is temporarily unavailable.',
          },
        ],
      },
      'PM model budget is temporarily unavailable; the PM agent will retry on a later sweep.',
    );
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('prior PM status exists');
  });
});

describe('public agent CI, review, and merge gates', () => {
  test('passes when required CI succeeded recently', () => {
    const decision = evaluateCi(
      [{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-06-16T12:00:00Z' }],
      undefined,
      new Date('2026-06-16T12:30:00Z'),
    );
    expect(decision.decision).toBe('pass');
  });

  test('accepts gh pr checks bucket output for passed CI', () => {
    const decision = evaluateCi(
      [{ name: 'ci', bucket: 'pass', completedAt: '2026-06-16T12:00:00Z' }],
      undefined,
      new Date('2026-06-16T12:30:00Z'),
    );
    expect(decision.decision).toBe('pass');
  });

  test('blocks when required CI is missing', () => {
    const decision = evaluateCi([]);
    expect(decision.decision).toBe('blocked');
    expect(decision.reason).toBe('ci is missing');
  });

  test('routes failed CI to develop retry', () => {
    const decision = evaluateCi([{ name: 'ci', state: 'COMPLETED', conclusion: 'FAILURE' }]);
    expect(decision.decision).toBe('develop_retry');
  });

  test('waits when required CI is stale', () => {
    const decision = evaluateCi(
      [{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-06-16T10:00:00Z' }],
      undefined,
      new Date('2026-06-16T12:00:01Z'),
    );
    expect(decision.decision).toBe('wait');
    expect(decision.reason).toBe('ci is stale');
  });

  test('parses strict reviewer verdicts', () => {
    expect(parseReviewerVerdict('{"verdict":"pass","risk":"low","human_required":false,"summary":"ok","findings":[]}')).toEqual({
      verdict: 'pass',
      risk: 'low',
      human_required: false,
      summary: 'ok',
      findings: [],
    });
  });

  test('turns reviewer model failures into blocked non-human verdicts', () => {
    const verdict = modelFailureVerdict(new Error('review model call failed: 400: bad request sk-testsecret000000000000'));
    expect(verdict.verdict).toBe('fail');
    expect(verdict.risk).toBe('high');
    expect(verdict.human_required).toBe(false);
    expect(verdict.failure_kind).toBe('model_error');
    expect(verdict.findings[0]).toContain('review model call failed: 400');
    expect(verdict.findings[0]).not.toContain('sk-testsecret000000000000');
  });

  test('blocks merge on reviewer model failures without requiring humans', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'fail', risk: 'high', human_required: false, summary: 'Reviewer model call failed.', findings: [], failure_kind: 'model_error' },
    );
    expect(decision.decision).toBe('blocked');
  });

  test('only merges low-risk passing reviews on passing CI', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'pass', risk: 'low', human_required: false, summary: 'ok', findings: [] },
    );
    expect(decision.decision).toBe('merge');
  });

  test('does not merge when the PR head changed after review', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'reviewed123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'pass', risk: 'low', human_required: false, summary: 'ok', findings: [] },
      { currentHeadSha: 'current456' },
    );
    expect(decision.decision).toBe('wait');
    expect(decision.reason).toContain('PR head changed after review');
  });

  test('does not merge when a maintainer blocking label is present', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'pass', risk: 'low', human_required: false, summary: 'ok', findings: [] },
      { blockers: { labels: [{ name: 'do-not-merge' }], comments: [] } },
    );
    expect(decision.decision).toBe('human_required');
    expect(decision.reason).toContain('blocking label');
  });

  test('does not auto-merge develop-only autonomy mode', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'pass', risk: 'low', human_required: false, summary: 'ok', findings: [] },
      { blockers: { labels: [{ name: 'agent-develop-only' }], comments: [] } },
    );
    expect(decision.decision).toBe('human_required');
    expect(decision.reason).toContain('agent-develop-only');
  });

  test('does not merge after a maintainer hold comment', () => {
    const decision = decideMerge(
      { kind: 'pull_request', issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true },
      { decision: 'pass', reason: 'ok', required: [{ name: 'ci', status: 'pass', conclusion: 'SUCCESS' }] },
      { verdict: 'pass', risk: 'low', human_required: false, summary: 'ok', findings: [] },
      { blockers: { comments: [{ author: { login: 'maintainer' }, createdAt: '2026-06-16T12:00:00Z', body: 'hold, do not merge yet' }] } },
    );
    expect(decision.decision).toBe('human_required');
    expect(decision.reason).toContain('blocking comment');
  });

  test('ignores bot hold comments and later maintainer unblock comments', () => {
    const base = { kind: 'pull_request' as const, issue: 7, pull_request: 7, branch: 'agent/issue-7', head_sha: 'abc123', can_develop: true };
    const ci = { decision: 'pass' as const, reason: 'ok', required: [{ name: 'ci', status: 'pass' as const, conclusion: 'SUCCESS' }] };
    const review = { verdict: 'pass' as const, risk: 'low' as const, human_required: false, summary: 'ok', findings: [] };
    expect(decideMerge(base, ci, review, {
      blockers: { comments: [{ author: { login: 'github-actions[bot]' }, createdAt: '2026-06-16T12:00:00Z', body: 'do not merge' }] },
    }).decision).toBe('merge');
    expect(decideMerge(base, ci, review, {
      blockers: {
        comments: [
          { author: { login: 'maintainer' }, createdAt: '2026-06-16T12:00:00Z', body: 'do not merge' },
          { author: { login: 'maintainer' }, createdAt: '2026-06-16T12:05:00Z', body: 'ok to merge' },
        ],
      },
    }).decision).toBe('merge');
  });

  test('allows the first bounded autopilot retry', () => {
    const decision = decideLoopBudget({
      kind: 'ci',
      reason: 'ci failed',
      maxAttempts: 2,
      issueComments: [],
      prComments: [],
    });
    expect(decision.decision).toBe('retry');
    expect(decision.next_attempt).toBe(1);
    expect(decision.comment).toContain('Attempt 1 of 2');
  });

  test('stops when the combined issue and PR retry budget is exhausted', () => {
    const decision = decideLoopBudget({
      kind: 'review',
      reason: 'new review issue',
      maxAttempts: 2,
      issueComments: [
        { body: 'Agent autopilot retry: CI failed (ci failed). Attempt 1 of 2.' },
        { body: 'Agent autopilot retry: reviewer requested another develop pass (missing tests). Attempt 2 of 2.' },
      ],
      prComments: [
        { body: 'Agent autopilot retry: CI failed (ci failed). Attempt 1 of 2.' },
      ],
    });
    expect(decision.decision).toBe('budget_exhausted');
    expect(decision.attempts).toBe(2);
  });

  test('stops repeated same-failure retries before spending another attempt', () => {
    const decision = decideLoopBudget({
      kind: 'ci',
      reason: 'CI failed',
      maxAttempts: 2,
      issueComments: [
        { body: 'Agent autopilot retry: CI failed (ci failed). Attempt 1 of 2.' },
      ],
    });
    expect(decision.decision).toBe('repeated_failure');
    expect(decision.failure_signature).toBe('ci failed');
  });

  test('blocks direct develop after the attempt budget is exhausted', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70' },
      comments: [
        { createdAt: '2026-06-16T10:00:00Z', body: '/agent develop' },
        { createdAt: '2026-06-16T11:00:00Z', body: 'Agent autopilot retry: CI failed (ci failed). Attempt 1 of 2.' },
      ],
      openPrs: [],
      maxDevelopAttempts: 2,
      maxOpenAgentPrs: 5,
      staleNeedsInfoMinutes: 60,
    });
    expect(decision.decision).toBe('budget_exhausted');
  });

  test('does not count operator retry as a direct develop attempt', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70' },
      comments: [
        { createdAt: '2026-06-16T10:00:00Z', body: '/agent retry' },
      ],
      openPrs: [],
      maxDevelopAttempts: 1,
      maxOpenAgentPrs: 5,
      staleNeedsInfoMinutes: 60,
    });
    expect(decision.decision).toBe('allow');
    expect(decision.develop_attempts).toBe(0);
  });

  test('blocks unresolved needs-info until a human replies', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70' },
      comments: [
        { author: { login: 'github-actions[bot]' }, createdAt: '2026-06-16T10:00:00Z', body: 'PM agent needs more information.\n\nWhat should happen?' },
      ],
      openPrs: [],
      maxDevelopAttempts: 3,
      maxOpenAgentPrs: 5,
      staleNeedsInfoMinutes: 60,
      now: new Date('2026-06-16T10:30:00Z'),
    });
    expect(decision.decision).toBe('needs_info');
    expect(decision.next_action).toBe('wait');
  });

  test('escalates stale needs-info without human reply', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70' },
      comments: [
        { author: { login: 'github-actions[bot]' }, createdAt: '2026-06-16T10:00:00Z', body: 'PM agent needs more information.\n\nWhat should happen?' },
      ],
      openPrs: [],
      maxDevelopAttempts: 3,
      maxOpenAgentPrs: 5,
      staleNeedsInfoMinutes: 60,
      now: new Date('2026-06-16T12:00:00Z'),
    });
    expect(decision.decision).toBe('needs_info_stale');
    expect(decision.next_action).toBe('human_required');
  });

  test('blocks new issue develop when the open agent PR limit is reached', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70' },
      comments: [],
      openPrs: [
        { number: 1, headRefName: 'agent/issue-1' },
        { number: 2, headRefName: 'agent/issue-2' },
      ],
      maxDevelopAttempts: 3,
      maxOpenAgentPrs: 2,
      staleNeedsInfoMinutes: 60,
    });
    expect(decision.decision).toBe('policy_blocked');
    expect(decision.reason).toContain('open agent PR limit reached');
  });

  test('allows updating an existing agent PR when the open PR limit is reached', () => {
    const decision = decidePolicy({
      issue: { number: 70, labels: [] },
      target: { branch: 'agent/issue-70', pull_request: 70 },
      comments: [],
      openPrs: [
        { number: 70, headRefName: 'agent/issue-70' },
        { number: 2, headRefName: 'agent/issue-2' },
      ],
      maxDevelopAttempts: 3,
      maxOpenAgentPrs: 2,
      staleNeedsInfoMinutes: 60,
    });
    expect(decision.decision).toBe('allow');
  });
});

describe('public agent developer context', () => {
  test('includes recent comments, prior decisions, and current PR diff', () => {
    const context = buildDeveloperContext({
      target: { issue: 80, branch: 'agent/issue-80' },
      issue: { number: 80, title: 'Fix docs' },
      comments: {
        comments: [
          { createdAt: '2026-06-16T10:00:00Z', body: 'old' },
          { createdAt: '2026-06-16T11:00:00Z', body: 'new' },
        ],
      },
      decisions: [
        { stage: 'review', created_at: '2026-06-16T12:00:00Z', decision: 'develop_retry' },
        { stage: 'ci', created_at: '2026-06-16T11:30:00Z', decision: 'pass' },
      ],
      pr: { number: 81, title: 'Agent run', headRefName: 'agent/issue-80', files: [{ path: 'README.md' }] },
      prDiff: 'diff --git a/README.md b/README.md\n',
    });
    expect(context.recent_issue_comments.map((comment) => (comment as { body: string }).body)).toEqual(['new', 'old']);
    expect(context.previous_decisions.map((decision) => (decision as { stage: string }).stage)).toEqual(['review', 'ci']);
    expect(context.current_pr?.diff).toContain('diff --git');
    expect(context.context_sources).toContain('previous_decisions');
    expect(context.context_sources).toContain('current_pr_diff');
  });
});
