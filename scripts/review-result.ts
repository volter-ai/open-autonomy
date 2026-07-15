// Substrate-neutral parser for the standard merge-review result. Both runner effects and code-host adapters
// consume this protocol; neither should depend on the other's implementation merely to validate it.
import { readFileSync, statSync } from 'node:fs';

export const REVIEW_RESULT_SCHEMA = 'open-autonomy.review.v1';
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
  const allowed = new Set(['schema', 'pr', 'headSha', 'verdict', 'outcome', 'summary', 'findings', 'humanApprovalRequired']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`review result has unknown fields: ${unknown.join(', ')}`);
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
  if (typeof value.humanApprovalRequired !== 'boolean') throw new Error('review result.humanApprovalRequired must be boolean');
  if (value.verdict === 'success' && value.outcome !== 'approved') throw new Error('a successful verdict must be approved');
  if (value.verdict === 'failure' && !['changes-requested', 'human-required'].includes(value.outcome!)) {
    throw new Error('a failed verdict must request changes or human attention');
  }
  if (value.verdict === 'skip' && value.outcome !== 'not-applicable') throw new Error('a skipped verdict must be not-applicable');
  return value as ReviewResult;
}
