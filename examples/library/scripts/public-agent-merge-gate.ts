#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import type { CiDecision } from './public-agent-ci.js';
import type { ReviewerVerdict } from './public-agent-review.js';
import type { AgentTarget } from './public-agent-target.js';

export interface MergeGateDecision {
  decision: 'merge' | 'human_required' | 'wait' | 'develop_retry' | 'blocked';
  reason: string;
}

export interface MergeGateContext {
  reviewedHeadSha?: string;
  currentHeadSha?: string;
  blockers?: MergeBlockerContext;
}

export interface MergeBlockerContext {
  labels?: Array<{ name?: string }>;
  comments?: Array<{ body?: string; createdAt?: string; author?: { login?: string } }>;
}

interface Options {
  target: string;
  ci: string;
  review: string;
  blockers?: string;
  reviewedHeadSha?: string;
  currentHeadSha?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-merge-gate.ts --target target.json --ci ci.json --review review.json [--blockers blockers.json] [--reviewed-head-sha SHA --current-head-sha SHA] --out merge-gate.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const target = value('--target');
  const ci = value('--ci');
  const review = value('--review');
  if (!target || !ci || !review) usage();
  return {
    target,
    ci,
    review,
    blockers: value('--blockers'),
    reviewedHeadSha: value('--reviewed-head-sha'),
    currentHeadSha: value('--current-head-sha'),
    out: value('--out') ?? '.agent-run/merge-gate.json',
  };
}

export function decideMerge(target: AgentTarget, ci: CiDecision, review: ReviewerVerdict, context: MergeGateContext = {}): MergeGateDecision {
  if (target.kind !== 'pull_request' || !target.pull_request) {
    return { decision: 'human_required', reason: 'merge gate requires a pull request target' };
  }
  if (!target.branch.startsWith('agent/issue-')) {
    return { decision: 'human_required', reason: 'merge gate only auto-merges canonical agent branches' };
  }
  const reviewedHeadSha = context.reviewedHeadSha ?? target.head_sha;
  if (!reviewedHeadSha) {
    return { decision: 'human_required', reason: 'merge gate requires the reviewed PR head SHA' };
  }
  if (context.currentHeadSha && context.currentHeadSha !== reviewedHeadSha) {
    return { decision: 'wait', reason: `PR head changed after review: reviewed ${reviewedHeadSha}, current ${context.currentHeadSha}` };
  }
  const blocker = findMergeBlocker(context.blockers);
  if (blocker) {
    return { decision: 'human_required', reason: blocker };
  }
  if (ci.decision !== 'pass') {
    return { decision: ci.decision, reason: `CI gate did not pass: ${ci.reason}` };
  }
  if (review.verdict !== 'pass') {
    if (review.failure_kind === 'model_error') {
      return { decision: 'blocked', reason: `review did not complete: ${review.summary}` };
    }
    return { decision: 'develop_retry', reason: `review failed: ${review.summary}` };
  }
  if (review.human_required || review.risk !== 'low') {
    return { decision: 'human_required', reason: `review requires human attention: ${review.risk} risk` };
  }
  return { decision: 'merge', reason: 'review passed with low risk and required CI passed' };
}

export function findMergeBlocker(context: MergeBlockerContext | undefined): string | undefined {
  const blockingLabel = context?.labels
    ?.map((label) => (label.name ?? '').toLowerCase())
    .find((name) => ['agent-blocked', 'human-required', 'security', 'do-not-merge', 'no-automerge', 'hold', 'agent-develop-only', 'agent-review-only'].includes(name));
  if (blockingLabel) return `maintainer blocking label present: ${blockingLabel}`;

  const latestSignal = context?.comments
    ?.filter((comment) => comment.createdAt && !isBotAuthor(comment.author?.login ?? ''))
    .map((comment) => ({ ...comment, signal: mergeCommentSignal(comment.body) }))
    .filter((comment) => comment.signal)
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))[0];
  if (latestSignal?.signal === 'block') {
    return 'maintainer blocking comment present';
  }
  return undefined;
}

function mergeCommentSignal(body: string | undefined): 'block' | 'unblock' | undefined {
  const text = body?.trim() ?? '';
  if (/\b(ok to merge|okay to merge|merge approved|clear hold|hold cleared|unblock merge|resume merge)\b/i.test(text)) return 'unblock';
  if (/\b(hold|do not merge|don't merge|needs maintainer|needs human|human review required|block merge|stop auto-merge|no auto-merge)\b/i.test(text)) return 'block';
  return undefined;
}

function isBotAuthor(author: string): boolean {
  return author === 'github-actions' || author === 'github-actions[bot]' || author.endsWith('[bot]');
}

function writeOutputs(decision: MergeGateDecision): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `decision=${decision.decision}`,
    `reason=${decision.reason}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const decision = decideMerge(
    JSON.parse(readFileSync(options.target, 'utf8')) as AgentTarget,
    JSON.parse(readFileSync(options.ci, 'utf8')) as CiDecision,
    JSON.parse(readFileSync(options.review, 'utf8')) as ReviewerVerdict,
    {
      reviewedHeadSha: options.reviewedHeadSha,
      currentHeadSha: options.currentHeadSha,
      blockers: options.blockers ? JSON.parse(readFileSync(options.blockers, 'utf8')) as MergeBlockerContext : undefined,
    },
  );
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  writeOutputs(decision);
  process.stdout.write(`merge-gate=${decision.decision}\n`);
  if (decision.decision !== 'merge') process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
