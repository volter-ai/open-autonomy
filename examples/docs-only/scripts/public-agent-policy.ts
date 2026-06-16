#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export interface CommentLike {
  body?: string;
  createdAt?: string;
  author?: { login?: string };
}

export interface PullRequestLike {
  number?: number;
  headRefName?: string;
  updatedAt?: string;
  state?: string;
}

export interface PolicyDecision {
  decision: 'allow' | 'blocked' | 'needs_info' | 'needs_info_stale' | 'budget_exhausted' | 'policy_blocked';
  reason: string;
  next_action: 'triage' | 'human_required' | 'wait';
  develop_attempts: number;
  max_develop_attempts: number;
  open_agent_prs: number;
  max_open_agent_prs: number;
}

interface Options {
  issue: string;
  comments: string;
  openPrs: string;
  target: string;
  maxDevelopAttempts: number;
  maxOpenAgentPrs: number;
  staleNeedsInfoMinutes: number;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-policy.ts --issue issue.json --comments comments.json --open-prs open-prs.json --target target.json --max-develop-attempts 3 --max-open-agent-prs 5 --stale-needs-info-minutes 10080 --out policy.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const comments = value('--comments');
  const openPrs = value('--open-prs');
  const target = value('--target');
  if (!issue || !comments || !openPrs || !target) usage();
  return {
    issue,
    comments,
    openPrs,
    target,
    maxDevelopAttempts: positiveInt(value('--max-develop-attempts') ?? '3', '--max-develop-attempts'),
    maxOpenAgentPrs: positiveInt(value('--max-open-agent-prs') ?? '5', '--max-open-agent-prs'),
    staleNeedsInfoMinutes: positiveInt(value('--stale-needs-info-minutes') ?? '10080', '--stale-needs-info-minutes'),
    out: value('--out') ?? '.agent-run/policy.json',
  };
}

export function decidePolicy(input: {
  issue: { number?: number; labels?: Array<{ name?: string }> };
  comments?: CommentLike[];
  openPrs?: PullRequestLike[];
  target: { branch?: string; pull_request?: number | null };
  maxDevelopAttempts: number;
  maxOpenAgentPrs: number;
  staleNeedsInfoMinutes: number;
  now?: Date;
}): PolicyDecision {
  const comments = input.comments ?? [];
  const openAgentPrs = (input.openPrs ?? []).filter((pr) => pr.headRefName?.startsWith('agent/issue-'));
  const ownBranch = input.target.branch;
  const ownPr = input.target.pull_request;
  const hasOwnOpenPr = openAgentPrs.some((pr) => pr.number === ownPr || pr.headRefName === ownBranch);
  const labels = new Set((input.issue.labels ?? []).map((label) => (label.name ?? '').toLowerCase()));
  const developAttempts = countDevelopAttempts(comments);

  if (labels.has('agent-paused') || labels.has('agent-blocked') || labels.has('human-required') || labels.has('security')) {
    return decision('policy_blocked', `blocking label present: ${[...labels].find((label) => ['agent-paused', 'agent-blocked', 'human-required', 'security'].includes(label))}`, 'human_required', input, developAttempts, openAgentPrs.length);
  }

  const needsInfo = latestNeedsInfoWithoutHumanReply(comments);
  if (needsInfo) {
    const ageMinutes = ageInMinutes(needsInfo.createdAt, input.now ?? new Date());
    if (ageMinutes >= input.staleNeedsInfoMinutes) {
      return decision('needs_info_stale', `needs-info has no human response after ${Math.floor(ageMinutes)} minutes`, 'human_required', input, developAttempts, openAgentPrs.length);
    }
    return decision('needs_info', 'needs-info has no newer human response', 'wait', input, developAttempts, openAgentPrs.length);
  }

  if (developAttempts >= input.maxDevelopAttempts) {
    return decision('budget_exhausted', `develop attempt budget exhausted: ${developAttempts}/${input.maxDevelopAttempts}`, 'human_required', input, developAttempts, openAgentPrs.length);
  }

  if (!hasOwnOpenPr && openAgentPrs.length >= input.maxOpenAgentPrs) {
    return decision('policy_blocked', `open agent PR limit reached: ${openAgentPrs.length}/${input.maxOpenAgentPrs}`, 'human_required', input, developAttempts, openAgentPrs.length);
  }

  return decision('allow', 'policy allows develop triage', 'triage', input, developAttempts, openAgentPrs.length);
}

function decision(
  status: PolicyDecision['decision'],
  reason: string,
  nextAction: PolicyDecision['next_action'],
  input: { maxDevelopAttempts: number; maxOpenAgentPrs: number },
  developAttempts: number,
  openAgentPrs: number,
): PolicyDecision {
  return {
    decision: status,
    reason,
    next_action: nextAction,
    develop_attempts: developAttempts,
    max_develop_attempts: input.maxDevelopAttempts,
    open_agent_prs: openAgentPrs,
    max_open_agent_prs: input.maxOpenAgentPrs,
  };
}

function countDevelopAttempts(comments: CommentLike[]): number {
  const markers = new Set<string>();
  for (const comment of comments) {
    const body = comment.body?.trim() ?? '';
    if (/^\/agent\s+(develop|run|continue)\b/i.test(body) || /^Agent autopilot retry:/i.test(body)) {
      markers.add(`${comment.createdAt ?? ''}:${body}`);
    }
  }
  return markers.size;
}

function latestNeedsInfoWithoutHumanReply(comments: CommentLike[]): CommentLike | undefined {
  const sorted = [...comments]
    .filter((comment) => comment.createdAt)
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
  const latestNeedsInfo = sorted.find((comment) => /^PM agent needs more information\./i.test(comment.body?.trim() ?? ''));
  if (!latestNeedsInfo) return undefined;
  const cutoff = Date.parse(latestNeedsInfo.createdAt ?? '');
  const humanReply = sorted.some((comment) => {
    const created = Date.parse(comment.createdAt ?? '');
    if (!Number.isFinite(created) || created <= cutoff) return false;
    const author = comment.author?.login ?? '';
    return !isBotAuthor(author) && !/^\/agent\b/i.test(comment.body?.trim() ?? '');
  });
  return humanReply ? undefined : latestNeedsInfo;
}

function ageInMinutes(timestamp: string | undefined, now: Date): number {
  const created = Date.parse(timestamp ?? '');
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now.getTime() - created) / 60_000);
}

function isBotAuthor(author: string): boolean {
  return author === 'github-actions' || author === 'github-actions[bot]' || author.endsWith('[bot]');
}

function positiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function readComments(path: string): CommentLike[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (Array.isArray(parsed)) return parsed as CommentLike[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { comments?: unknown }).comments)) {
    return (parsed as { comments: CommentLike[] }).comments;
  }
  return [];
}

function writeOutputs(policy: PolicyDecision): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `decision=${policy.decision}`,
    `next_action=${policy.next_action}`,
    `allowed=${policy.decision === 'allow' ? 'true' : 'false'}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const policy = decidePolicy({
    issue: JSON.parse(readFileSync(options.issue, 'utf8')) as { number?: number; labels?: Array<{ name?: string }> },
    comments: readComments(options.comments),
    openPrs: JSON.parse(readFileSync(options.openPrs, 'utf8')) as PullRequestLike[],
    target: JSON.parse(readFileSync(options.target, 'utf8')) as { branch?: string; pull_request?: number | null },
    maxDevelopAttempts: options.maxDevelopAttempts,
    maxOpenAgentPrs: options.maxOpenAgentPrs,
    staleNeedsInfoMinutes: options.staleNeedsInfoMinutes,
  });
  writeFileSync(options.out, `${JSON.stringify(policy, null, 2)}\n`);
  writeOutputs(policy);
  process.stdout.write(`policy=${policy.decision}\n`);
  if (policy.decision !== 'allow') process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
