#!/usr/bin/env bun
// Trusted realization of a merge reviewer's `code:review` result. The model decides; this script validates
// that decision against the PR+SHA bound before the model ran, persists the human-visible effects, and posts
// the authoritative status LAST. It runs in a separate base-branch checkout with a separate token, so the
// model never possesses statuses:write and cannot leave an early green status behind if its run later fails.
import { execFileSync } from 'node:child_process';
import {
  parseReviewResult,
  type ReviewResult,
} from './review-result.js';
export {
  MAX_RESULT_BYTES,
  REVIEW_RESULT_SCHEMA,
  parseReviewResult,
  type ReviewResult,
} from './review-result.js';

export const HUMAN_APPROVAL_LABEL = 'human-approval-required';
const isSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);

// Break-glass integration (framework issue #234). A maintainer's `/agent break-glass <head-sha> <reason>`
// comment posts agent-review=success out-of-band via scripts/break-glass-gate.ts. This reviewer effect is the
// one place that posts agent-review=FAILURE, and it re-fires whenever the reviewer re-runs on the SAME head
// (reopened / ready_for_review / an explicit `/agent reviewer`). So before posting any failure we check for a
// qualifying break-glass on the CURRENT head and, if present, DEFER — leaving agent-review at the break-glass
// success rather than clobbering a maintainer's deliberate, audited override. Per-SHA: a new push has a new
// head with no matching break-glass, so review resumes normally.
//
// This is a SELF-CONTAINED copy of break-glass-gate.ts's parse + maintainer primitives: this file is mirrored
// verbatim into the generic substrate runtime (bin/sync-runtime.ts), which must NOT import the code-host gate
// script. The regex is kept identical to BREAK_GLASS_RE and the check is deliberately at-least-as-strict and
// fail-closed — a non-matching SHA, a non-maintainer, or an unreadable permission means NO deferral, so the
// failure still posts. It changes no PR state; human-approval remains a fully independent gate.
const BREAK_GLASS_RE = /^\/agent break-glass ([0-9a-fA-F]{40})\s+(.+\S)$/;
type BreakGlassComment = { body?: string; user?: { login?: string }; author?: { login?: string } };

/** True iff some PR comment is a qualifying break-glass for `headSha` from a current write+ maintainer. */
export function breakGlassClearsHead(
  comments: BreakGlassComment[],
  headSha: string,
  isMaintainer: (login: string) => boolean,
): boolean {
  return comments.some((c) => {
    const m = c.body?.match(BREAK_GLASS_RE);
    if (!m || m[1].toLowerCase() !== headSha.toLowerCase()) return false;
    const login = c.user?.login ?? c.author?.login ?? '';
    return Boolean(login) && isMaintainer(login);
  });
}

export type Finalization = { state: 'success' | 'failure' | 'skip'; result?: ReviewResult; reason: string };

/** A non-successful model job always wins over any artifact it happened to leave behind. */
export function decideFinalization(args: {
  jobResult: string;
  expectedPr: number;
  expectedSha: string;
  artifact?: ReviewResult;
  artifactError?: string;
}): Finalization {
  if (args.jobResult !== 'success') return { state: 'failure', reason: `reviewer job concluded ${args.jobResult || 'unknown'}` };
  if (args.artifactError) return { state: 'failure', reason: `invalid review result: ${args.artifactError}` };
  const r = args.artifact;
  if (!r) return { state: 'failure', reason: 'reviewer produced no result' };
  if (r.pr !== args.expectedPr || r.headSha.toLowerCase() !== args.expectedSha.toLowerCase()) {
    return { state: 'failure', reason: 'review result does not match the bound PR and head SHA' };
  }
  if (r.verdict === 'skip') return { state: 'skip', result: r, reason: r.summary };
  return { state: r.verdict, result: r, reason: r.summary };
}

if (import.meta.main) {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const expectedPr = Number(process.env.EXPECTED_PR ?? 0);
  const expectedSha = process.env.EXPECTED_SHA ?? '';
  const jobResult = process.env.REVIEWER_JOB_RESULT ?? '';
  const resultPath = process.env.REVIEW_RESULT_PATH ?? '';
  const humanApprovalWorkflow = process.env.HUMAN_APPROVAL_WORKFLOW ?? '';
  if (!repo || !Number.isInteger(expectedPr) || expectedPr <= 0 || !isSha(expectedSha) || !resultPath) {
    throw new Error('finalize-agent-review: missing or invalid trusted binding inputs');
  }

  const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const postStatus = (state: 'success' | 'failure', description: string): void => {
    gh(['api', '-X', 'POST', `repos/${repo}/statuses/${expectedSha}`, '-f', `state=${state}`, '-f', 'context=agent-review',
      '-f', `description=${description.replace(/\s+/g, ' ').slice(0, 140)}`]);
  };

  const currentTargetStillMatches = (): boolean => {
    const current = JSON.parse(gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'headRefOid,state'])) as {
      headRefOid?: string; state?: string;
    };
    return current.state === 'OPEN' && current.headRefOid?.toLowerCase() === expectedSha.toLowerCase();
  };
  const stopIfTargetChanged = (stage: string, exitCode = 0): void => {
    if (currentTargetStillMatches()) return;
    process.stdout.write(`agent-review: stale/closed target #${expectedPr} before ${stage}; no further PR effect\n`);
    process.exit(exitCode);
  };
  stopIfTargetChanged('finalization');

  let artifact: ReviewResult | undefined;
  let artifactError: string | undefined;
  try { artifact = parseReviewResult(resultPath); } catch (e) { artifactError = e instanceof Error ? e.message : String(e); }
  const final = decideFinalization({ jobResult, expectedPr, expectedSha, artifact, artifactError });
  if (final.state === 'skip') {
    process.stdout.write(`agent-review: #${expectedPr} not applicable (${final.reason})\n`);
    process.exit(0);
  }

  const marker = `<!-- open-autonomy-agent-review:${expectedSha}:${final.state} -->`;
  const findings = final.result?.findings?.length ? `\n\n${final.result.findings.map((f) => `- ${f}`).join('\n')}` : '';
  const task = final.result?.outcome === 'human-required' ? final.result.humanTask! : undefined;
  const taskDetails = task ? `\n\n### Human task\n\n**Assigned to:** ${task.assignTo}\n\n` +
    `**Ask:** ${task.ask}\n\n**Completion:** ${task.completion.ac}\n\n` +
    `Response channel: \`${task.completion.via}\`; verification: \`${task.completion.check}\`.` : '';
  const body = `${marker}\n**Agent review: ${final.state === 'success' ? 'pass' : 'fail'}.** ${final.reason}${findings}${taskDetails}`;
  const ensureComment = (): void => {
    const comments = gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'comments', '--jq', '[.comments[].body]']);
    if (!(JSON.parse(comments) as string[]).some((comment) => comment.includes(marker))) {
      gh(['pr', 'comment', String(expectedPr), '-R', repo, '--body', body]);
    }
  };

  // A maintainer break-glass on the current head clears agent-review deliberately; never clobber it with a
  // re-posted failure (see the header note). Fail-closed: any read/permission error defers to posting failure.
  const breakGlassClearsCurrentHead = (): boolean => {
    try {
      const raw = gh(['api', `repos/${repo}/issues/${expectedPr}/comments?per_page=100`, '--paginate', '--slurp']);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as BreakGlassComment[] | BreakGlassComment[][];
      const comments = Array.isArray(parsed[0]) ? (parsed as BreakGlassComment[][]).flat() : (parsed as BreakGlassComment[]);
      const cache = new Map<string, boolean>();
      const isMaintainer = (login: string): boolean => {
        if (!login) return false;
        if (cache.has(login)) return cache.get(login)!;
        let perm = '';
        try { perm = gh(['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.permission']).trim(); } catch { perm = ''; }
        const r = perm === 'admin' || perm === 'write' || perm === 'maintain';
        cache.set(login, r);
        return r;
      };
      return breakGlassClearsHead(comments, expectedSha, isMaintainer);
    } catch (e) {
      process.stderr.write(`agent-review: break-glass check failed (${e instanceof Error ? e.message : String(e)}); NOT deferring — posting failure\n`);
      return false;
    }
  };

  if (final.state === 'failure') {
    if (breakGlassClearsCurrentHead()) {
      process.stdout.write(`agent-review: #${expectedPr} failure DEFERRED — valid maintainer break-glass on current head ${expectedSha.slice(0, 7)}; leaving agent-review success in place\n`);
      process.exit(0);
    }
    postStatus('failure', final.reason);
    // Failure is bound to the reviewed SHA and is safe to publish even if the PR advances. Re-check before
    // touching PR/issue-scoped state so an old review cannot comment on or park a newer head.
    stopIfTargetChanged('failure routing', 1);
    ensureComment();
    if (final.result?.outcome === 'human-required') {
      const task = final.result.humanTask!; // parseReviewResult requires a complete verified task here.
      for (const issue of JSON.parse(gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'closingIssuesReferences',
        '--jq', '[.closingIssuesReferences[].number]'])) as number[]) {
        const taskMarker = `<!-- open-autonomy-human-task:${expectedSha}:${issue} -->`;
        const comments = JSON.parse(gh(['issue', 'view', String(issue), '-R', repo, '--json', 'comments',
          '--jq', '[.comments[].body]'])) as string[];
        if (!comments.some((comment) => comment.includes(taskMarker))) {
          gh(['issue', 'comment', String(issue), '-R', repo, '--body', `${taskMarker}\n### Human task\n\n` +
            `**Assigned to:** ${task.assignTo}\n\n**Ask:** ${task.ask}\n\n` +
            `**Completion:** ${task.completion.ac}\n\n` +
            `Response channel: \`${task.completion.via}\`; verification: \`${task.completion.check}\`.`]);
        }
        // The durable typed ask must exist before the issue is parked. A comment failure throws, so an
        // unrecorded or malformed escalation can never become a bare human-required label.
        gh(['issue', 'edit', String(issue), '-R', repo, '--add-label', 'human-required']);
      }
    }
    process.exit(1);
  }

  // For success, required durable side effects land BEFORE green. Any failure leaves agent-review absent
  // (or at its prior non-current-run state), never newly green from this run.
  stopIfTargetChanged('success routing');
  if (humanApprovalWorkflow) {
    const labels = JSON.parse(gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'labels',
      '--jq', '[.labels[].name]'])) as string[];
    if (final.result?.humanApprovalRequired && !labels.includes(HUMAN_APPROVAL_LABEL)) {
      gh(['pr', 'edit', String(expectedPr), '-R', repo, '--add-label', HUMAN_APPROVAL_LABEL]);
    } else if (!final.result?.humanApprovalRequired && labels.includes(HUMAN_APPROVAL_LABEL)) {
      gh(['pr', 'edit', String(expectedPr), '-R', repo, '--remove-label', HUMAN_APPROVAL_LABEL]);
    }
    gh(['workflow', 'run', humanApprovalWorkflow, '-R', repo, '-f', `pr=${expectedPr}`]);
  } else if (final.result?.humanApprovalRequired) {
    throw new Error('review requested human approval but this profile has no human-approval workflow');
  }
  ensureComment();
  // Labels/comments are PR-scoped and GitHub offers no conditional-on-head mutation API. Re-check after
  // those durable effects and immediately before the authoritative SHA-bound green status. A concurrent
  // push can at worst leave an old-SHA comment/routing hint; it can never bless the new head.
  stopIfTargetChanged('green status');
  postStatus('success', final.reason);
  process.stdout.write(`agent-review: #${expectedPr} success (${expectedSha.slice(0, 7)})\n`);
}
