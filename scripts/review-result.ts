// Substrate-neutral parser for the standard merge-review result. Both runner effects and code-host adapters
// consume this protocol; neither should depend on the other's implementation merely to validate it.
import { readFileSync, statSync } from 'node:fs';

export const REVIEW_RESULT_SCHEMA = 'open-autonomy.review.v1';
export const MAX_RESULT_BYTES = 64 * 1024;
export const MAX_REVIEW_SUMMARY_LENGTH = 1000;
const TRUNCATED_SUMMARY_SUFFIX = '…';

// A blocking review escalation is a verified HumanTask (packages/core/src/job.ts), narrowed so every
// trusted `human-required` effect has a named recipient and an explicit completion channel.
export type ReviewHumanTask = {
  ask: string;
  assignTo: string;
  completion: {
    ac: string;
    via: 'review' | 'label' | 'artifact' | 'command';
    check: 'deterministic' | 'judge' | 'both';
  };
};

export type ReviewResult = {
  schema: typeof REVIEW_RESULT_SCHEMA;
  pr: number;
  headSha: string;
  verdict: 'success' | 'failure' | 'skip';
  outcome: 'approved' | 'changes-requested' | 'human-required' | 'not-applicable';
  summary: string;
  findings: string[];
  humanApprovalRequired: boolean;
  humanTask?: ReviewHumanTask;
};

const isSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);

/** Normalize the one bounded prose field without altering any authority-bearing result field. */
export function normalizeReviewSummary(summary: string): string {
  if (summary.length <= MAX_REVIEW_SUMMARY_LENGTH) return summary;
  return `${summary.slice(0, MAX_REVIEW_SUMMARY_LENGTH - TRUNCATED_SUMMARY_SUFFIX.length)}${TRUNCATED_SUMMARY_SUFFIX}`;
}

/** Strictly parse the model-owned artifact. Only an oversized, otherwise-valid summary is normalized. */
export function parseReviewResult(path: string): ReviewResult {
  if (statSync(path).size > MAX_RESULT_BYTES) throw new Error(`review result exceeds ${MAX_RESULT_BYTES} bytes`);
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReviewResult>;
  const allowed = new Set(['schema', 'pr', 'headSha', 'verdict', 'outcome', 'summary', 'findings', 'humanApprovalRequired', 'humanTask']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`review result has unknown fields: ${unknown.join(', ')}`);
  if (value.schema !== REVIEW_RESULT_SCHEMA) throw new Error(`review result has unsupported schema '${value.schema ?? ''}'`);
  if (!Number.isInteger(value.pr) || Number(value.pr) <= 0) throw new Error('review result.pr must be a positive integer');
  if (!isSha(value.headSha)) throw new Error('review result.headSha must be a full commit SHA');
  if (!['success', 'failure', 'skip'].includes(value.verdict ?? '')) throw new Error('review result.verdict is invalid');
  if (!['approved', 'changes-requested', 'human-required', 'not-applicable'].includes(value.outcome ?? '')) {
    throw new Error('review result.outcome is invalid');
  }
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new Error('review result.summary must be 1..1000 characters');
  }
  value.summary = normalizeReviewSummary(value.summary);
  if (!Array.isArray(value.findings) || value.findings.some((v) => typeof v !== 'string' || v.length > 2000)) {
    throw new Error('review result.findings must be an array of strings up to 2000 characters each');
  }
  if (value.findings.length > 50) throw new Error('review result has too many findings');
  if (typeof value.humanApprovalRequired !== 'boolean') throw new Error('review result.humanApprovalRequired must be boolean');
  if (value.verdict !== 'success' && value.humanApprovalRequired) {
    throw new Error('only an approved result may require the separate human-approval gate');
  }
  if (value.verdict === 'success' && value.outcome !== 'approved') throw new Error('a successful verdict must be approved');
  if (value.verdict === 'failure' && !['changes-requested', 'human-required'].includes(value.outcome!)) {
    throw new Error('a failed verdict must request changes or human attention');
  }
  if (value.verdict === 'skip' && value.outcome !== 'not-applicable') throw new Error('a skipped verdict must be not-applicable');
  if (value.outcome === 'human-required') {
    const task = value.humanTask as Partial<ReviewHumanTask> | undefined;
    const completion = task?.completion as Partial<ReviewHumanTask['completion']> | undefined;
    if (!task || typeof task.ask !== 'string' || !task.ask.trim() || task.ask.length > 2000) {
      throw new Error('human-required result.humanTask.ask must be 1..2000 characters');
    }
    if (typeof task.assignTo !== 'string' || !task.assignTo.trim() || task.assignTo.length > 200) {
      throw new Error('human-required result.humanTask.assignTo must be 1..200 characters');
    }
    const unknownTask = Object.keys(task).filter((key) => !['ask', 'assignTo', 'completion'].includes(key));
    if (unknownTask.length) throw new Error(`review result.humanTask has unknown fields: ${unknownTask.join(', ')}`);
    if (!completion || typeof completion.ac !== 'string' || !completion.ac.trim() || completion.ac.length > 2000) {
      throw new Error('human-required result.humanTask.completion.ac must be 1..2000 characters');
    }
    const unknownCompletion = Object.keys(completion).filter((key) => !['ac', 'via', 'check'].includes(key));
    if (unknownCompletion.length) {
      throw new Error(`review result.humanTask.completion has unknown fields: ${unknownCompletion.join(', ')}`);
    }
    if (!['review', 'label', 'artifact', 'command'].includes(completion.via ?? '')) {
      throw new Error('human-required result.humanTask.completion.via is invalid');
    }
    if (!['deterministic', 'judge', 'both'].includes(completion.check ?? '')) {
      throw new Error('human-required result.humanTask.completion.check is invalid');
    }
  } else if (value.humanTask !== undefined) {
    throw new Error('review result.humanTask is only valid for a human-required outcome');
  }
  return value as ReviewResult;
}
