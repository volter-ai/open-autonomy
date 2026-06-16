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
}

interface Options {
  target: string;
  ci: string;
  review: string;
  reviewedHeadSha?: string;
  currentHeadSha?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-merge-gate.ts --target target.json --ci ci.json --review review.json [--reviewed-head-sha SHA --current-head-sha SHA] --out merge-gate.json`);
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
