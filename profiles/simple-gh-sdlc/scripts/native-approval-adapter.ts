#!/usr/bin/env bun
// Optional GitHub code-host adapter: materialize a trusted `agent-review=success` decision as a native
// APPROVE review through a separately configured identity. This is not an agent, a runner capability, or a
// replacement for either `agent-review` or `human-approval`. It is useful only when branch protection also
// requires a native approving review.
import { execFileSync } from 'node:child_process';
import { parseReviewResult } from './review-result.js';

const SHA_RE = /^[0-9a-f]{40}$/i;
const WRITE_PERMISSIONS = new Set(['write', 'maintain', 'admin']);

export type NativeApprovalBinding = { pr: number; sha: string };
export type NativeApprovalInput = NativeApprovalBinding & {
  repo: string;
  readToken: string;
  approvalToken: string;
};
export type NativeApprovalResult = { outcome: 'approved' | 'already-approved'; actor: string };
export type GhApi = (token: string, args: string[]) => string;

type Pull = { number?: number; state?: string; draft?: boolean; head?: { sha?: string }; user?: { login?: string } };
type Status = { context?: string; state?: string };
type Review = { id?: number; state?: string; commit_id?: string; user?: { login?: string } };

function json<T>(raw: string, description: string): T {
  try { return JSON.parse(raw) as T; }
  catch { throw new Error(`native-approval: invalid ${description} response`); }
}

function reviewsJson(raw: string): Review[] {
  const parsed = json<Review[] | Review[][]>(raw, 'reviews');
  return Array.isArray(parsed[0]) ? (parsed as Review[][]).flat() : parsed as Review[];
}

function assertBinding(pr: number, sha: string): NativeApprovalBinding {
  if (!Number.isInteger(pr) || pr <= 0 || !SHA_RE.test(sha)) {
    throw new Error('native-approval: requires one positive PR number and one full head SHA');
  }
  return { pr, sha: sha.toLowerCase() };
}

/** Resolve an exact target from the trusted reviewer artifact or explicit retry inputs. */
export function resolveNativeApprovalBinding(args: {
  resultPath?: string;
  expectedPr?: string;
  expectedSha?: string;
}): NativeApprovalBinding {
  const hasExplicit = !!args.expectedPr || !!args.expectedSha;
  if (hasExplicit && (!args.expectedPr || !args.expectedSha)) {
    throw new Error('native-approval: EXPECTED_PR and EXPECTED_SHA must be supplied together');
  }
  const explicit = hasExplicit ? assertBinding(Number(args.expectedPr), args.expectedSha!) : undefined;
  if (!args.resultPath) {
    if (!explicit) throw new Error('native-approval: missing trusted result artifact or explicit retry binding');
    return explicit;
  }
  const result = parseReviewResult(args.resultPath);
  if (result.verdict !== 'success' || result.outcome !== 'approved') {
    throw new Error('native-approval: reviewer artifact is not an approved success');
  }
  const artifact = assertBinding(result.pr, result.headSha);
  if (explicit && (explicit.pr !== artifact.pr || explicit.sha !== artifact.sha)) {
    throw new Error('native-approval: explicit binding does not match reviewer artifact');
  }
  return artifact;
}

function pullStillBound(pull: Pull, binding: NativeApprovalBinding): boolean {
  return pull.number === binding.pr && pull.state === 'open' && pull.draft !== true
    && pull.head?.sha?.toLowerCase() === binding.sha;
}

/**
 * Apply one native approval. Every decision is re-read from GitHub; no actor association, branch name,
 * repository convention, or same-SHA PR search is trusted.
 */
export function applyNativeApproval(input: NativeApprovalInput, api: GhApi): NativeApprovalResult {
  if (!input.repo || !input.readToken) throw new Error('native-approval: missing repository/read credential');
  if (!input.approvalToken) {
    throw new Error('native-approval: OPEN_AUTONOMY_NATIVE_APPROVAL_TOKEN is not configured');
  }
  const binding = assertBinding(input.pr, input.sha);
  const prPath = `repos/${input.repo}/pulls/${binding.pr}`;
  const call = (token: string, args: string[], description: string): string => {
    try { return api(token, args); }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`native-approval: ${description} failed (${reason})`);
    }
  };
  const pull = json<Pull>(call(input.readToken, ['api', prPath], 'reading bound pull request'), 'pull request');
  if (!pullStillBound(pull, binding)) {
    throw new Error(`native-approval: PR #${binding.pr} is closed, draft, or no longer at ${binding.sha}`);
  }

  const identity = json<{ login?: string }>(
    call(input.approvalToken, ['api', 'user'], 'resolving configured approval identity'),
    'approval identity',
  );
  const actor = identity.login?.trim() ?? '';
  if (!actor) throw new Error('native-approval: configured approval credential has no resolvable identity');
  const author = pull.user?.login ?? '';
  if (actor.toLowerCase() === author.toLowerCase()) {
    throw new Error(`native-approval: configured actor ${actor} cannot approve its own PR`);
  }
  const permission = json<{ permission?: string }>(
    call(input.approvalToken, ['api', `repos/${input.repo}/collaborators/${actor}/permission`],
      `checking ${actor}'s current repository permission`),
    'approval identity permission',
  ).permission ?? '';
  if (!WRITE_PERMISSIONS.has(permission)) {
    throw new Error(`native-approval: configured actor ${actor} has '${permission || 'none'}' permission; write+ is required`);
  }

  const combined = json<{ statuses?: Status[] }>(
    call(input.readToken, ['api', `repos/${input.repo}/commits/${binding.sha}/status`],
      'reading authoritative agent-review status'),
    'commit status',
  );
  const agentReview = (combined.statuses ?? []).find((status) => status.context === 'agent-review');
  if (agentReview?.state !== 'success') {
    throw new Error(`native-approval: authoritative agent-review is not successful on ${binding.sha}`);
  }

  const reviews = reviewsJson(call(input.approvalToken,
    ['api', `${prPath}/reviews?per_page=100`, '--paginate', '--slurp'], 'reading existing reviews'));
  const alreadyApproved = reviews.some((review) => review.user?.login?.toLowerCase() === actor.toLowerCase()
    && review.state?.toUpperCase() === 'APPROVED' && review.commit_id?.toLowerCase() === binding.sha);
  if (alreadyApproved) return { outcome: 'already-approved', actor };

  call(input.approvalToken, [
    'api', '-X', 'POST', `${prPath}/reviews`,
    '-f', 'event=APPROVE',
    '-f', `commit_id=${binding.sha}`,
    '-f', `body=Native approval materialized from agent-review success on ${binding.sha}.`,
  ], 'posting native approval');

  // PR mutations have no compare-and-swap API. Re-read both target and effect so a concurrent push cannot
  // be reported as success. Profiles that require this adapter must also dismiss stale reviews.
  const afterPull = json<Pull>(call(input.readToken, ['api', prPath], 're-reading bound pull request'),
    'post-approval pull request');
  if (!pullStillBound(afterPull, binding)) {
    throw new Error(`native-approval: PR #${binding.pr} changed while approval was being recorded`);
  }
  const afterReviews = reviewsJson(call(input.approvalToken,
    ['api', `${prPath}/reviews?per_page=100`, '--paginate', '--slurp'], 'verifying recorded approval'));
  const recorded = afterReviews.some((review) => review.user?.login?.toLowerCase() === actor.toLowerCase()
    && review.state?.toUpperCase() === 'APPROVED' && review.commit_id?.toLowerCase() === binding.sha);
  if (!recorded) throw new Error('native-approval: GitHub did not record the exact-head approving review');
  return { outcome: 'approved', actor };
}

if (import.meta.main) {
  const binding = resolveNativeApprovalBinding({
    resultPath: process.env.REVIEW_RESULT_PATH || undefined,
    expectedPr: process.env.EXPECTED_PR || undefined,
    expectedSha: process.env.EXPECTED_SHA || undefined,
  });
  const readToken = process.env.GH_TOKEN ?? '';
  const approvalToken = process.env.OPEN_AUTONOMY_NATIVE_APPROVAL_TOKEN ?? '';
  const api: GhApi = (token, args) => execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: token },
  }).trim();
  const result = applyNativeApproval({
    repo: process.env.GITHUB_REPOSITORY ?? '',
    ...binding,
    readToken,
    approvalToken,
  }, api);
  process.stdout.write(`native-approval: #${binding.pr} ${result.outcome} by ${result.actor} (${binding.sha.slice(0, 7)})\n`);
}
