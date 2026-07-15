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
  const body = `${marker}\n**Agent review: ${final.state === 'success' ? 'pass' : 'fail'}.** ${final.reason}${findings}`;
  const ensureComment = (): void => {
    const comments = gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'comments', '--jq', '[.comments[].body]']);
    if (!(JSON.parse(comments) as string[]).some((comment) => comment.includes(marker))) {
      gh(['pr', 'comment', String(expectedPr), '-R', repo, '--body', body]);
    }
  };

  if (final.state === 'failure') {
    postStatus('failure', final.reason);
    // Failure is bound to the reviewed SHA and is safe to publish even if the PR advances. Re-check before
    // touching PR/issue-scoped state so an old review cannot comment on or park a newer head.
    stopIfTargetChanged('failure routing', 1);
    ensureComment();
    if (final.result?.outcome === 'human-required') {
      for (const issue of JSON.parse(gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'closingIssuesReferences',
        '--jq', '[.closingIssuesReferences[].number]'])) as number[]) {
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
