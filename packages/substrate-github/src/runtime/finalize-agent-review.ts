#!/usr/bin/env bun
// Trusted realization of a merge reviewer's `code:review` result. The model decides; this script validates
// that decision against the PR+SHA bound before the model ran, persists the human-visible effects, and posts
// the authoritative status LAST. It runs in a separate base-branch checkout with a separate token, so the
// model never possesses statuses:write and cannot leave an early green status behind if its run later fails.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

export const REVIEW_RESULT_SCHEMA = 'open-autonomy.review.v1';
export const HUMAN_APPROVAL_LABEL = 'human-approval-required';
export const MAX_RESULT_BYTES = 64 * 1024;

export type ReviewResult = {
  schema: typeof REVIEW_RESULT_SCHEMA;
  pr: number;
  headSha: string;
  verdict: 'success' | 'failure' | 'skip';
  outcome: 'approved' | 'changes-requested' | 'human-required' | 'not-applicable';
  summary: string;
  findings: string[];
  humanApprovalRequired: boolean;
};

const isSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);

/** Strictly parse the model-owned artifact. Unknown/missing/oversized output is never publishable. */
export function parseReviewResult(path: string): ReviewResult {
  if (statSync(path).size > MAX_RESULT_BYTES) throw new Error(`review result exceeds ${MAX_RESULT_BYTES} bytes`);
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReviewResult>;
  if (value.schema !== REVIEW_RESULT_SCHEMA) throw new Error(`review result has unsupported schema '${value.schema ?? ''}'`);
  if (!Number.isInteger(value.pr) || Number(value.pr) <= 0) throw new Error('review result.pr must be a positive integer');
  if (!isSha(value.headSha)) throw new Error('review result.headSha must be a full commit SHA');
  if (!['success', 'failure', 'skip'].includes(value.verdict ?? '')) throw new Error('review result.verdict is invalid');
  if (!['approved', 'changes-requested', 'human-required', 'not-applicable'].includes(value.outcome ?? '')) {
    throw new Error('review result.outcome is invalid');
  }
  if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 1000) {
    throw new Error('review result.summary must be 1..1000 characters');
  }
  if (!Array.isArray(value.findings) || value.findings.some((v) => typeof v !== 'string' || v.length > 2000)) {
    throw new Error('review result.findings must be an array of strings up to 2000 characters each');
  }
  if (value.findings.length > 50) throw new Error('review result has too many findings');
  if (value.findings.reduce((n, finding) => n + finding.length, 0) > 30_000) {
    throw new Error('review result findings exceed 30000 characters');
  }
  if (typeof value.humanApprovalRequired !== 'boolean') throw new Error('review result.humanApprovalRequired must be boolean');
  if (value.verdict === 'success' && value.outcome !== 'approved') throw new Error('a successful verdict must be approved');
  if (value.verdict === 'failure' && !['changes-requested', 'human-required'].includes(value.outcome!)) {
    throw new Error('a failed verdict must request changes or human attention');
  }
  if (value.verdict === 'skip' && value.outcome !== 'not-applicable') throw new Error('a skipped verdict must be not-applicable');
  return value as ReviewResult;
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

  const current = JSON.parse(gh(['pr', 'view', String(expectedPr), '-R', repo, '--json', 'headRefOid,state'])) as {
    headRefOid?: string; state?: string;
  };
  if (current.state !== 'OPEN' || current.headRefOid?.toLowerCase() !== expectedSha.toLowerCase()) {
    process.stdout.write(`agent-review: stale/closed target #${expectedPr}; no current-head effect\n`);
    process.exit(0);
  }

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
  postStatus('success', final.reason);
  process.stdout.write(`agent-review: #${expectedPr} success (${expectedSha.slice(0, 7)})\n`);
}
