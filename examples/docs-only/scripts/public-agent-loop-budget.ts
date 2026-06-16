#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export type RetryKind = 'ci' | 'review';

export interface CommentLike {
  body?: string;
  createdAt?: string;
  author?: { login?: string };
}

export interface LoopBudgetDecision {
  decision: 'retry' | 'budget_exhausted' | 'repeated_failure' | 'not_retryable';
  reason: string;
  attempts: number;
  max_attempts: number;
  next_attempt?: number;
  failure_signature: string;
  comment?: string;
}

interface RetryMarker {
  kind: RetryKind;
  reason: string;
  failure_signature: string;
  attempt: number;
  max: number;
}

interface Options {
  kind: RetryKind;
  reason: string;
  maxAttempts: number;
  issueComments?: string;
  prComments?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-loop-budget.ts --kind ci|review --reason "failure" --max-attempts 2 [--issue-comments issue-comments.json] [--pr-comments pr-comments.json] --out .agent-run/loop-budget.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const kind = value('--kind');
  const reason = value('--reason');
  const maxRaw = value('--max-attempts') ?? '2';
  const maxAttempts = Number.parseInt(maxRaw, 10);
  if ((kind !== 'ci' && kind !== 'review') || !reason || !Number.isInteger(maxAttempts) || maxAttempts <= 0) usage();
  return {
    kind,
    reason,
    maxAttempts,
    issueComments: value('--issue-comments'),
    prComments: value('--pr-comments'),
    out: value('--out') ?? '.agent-run/loop-budget.json',
  };
}

export function decideLoopBudget(input: {
  kind: RetryKind;
  reason: string;
  maxAttempts: number;
  issueComments?: CommentLike[];
  prComments?: CommentLike[];
}): LoopBudgetDecision {
  const failureSignature = signature(input.reason);
  const markers = retryMarkers([...(input.issueComments ?? []), ...(input.prComments ?? [])]);
  const attempts = markers.length;
  const sameFailure = markers.some((marker) => marker.kind === input.kind && marker.failure_signature === failureSignature);

  if (sameFailure) {
    return {
      decision: 'repeated_failure',
      reason: `${input.kind} retry stopped: repeated failure signature ${failureSignature}`,
      attempts,
      max_attempts: input.maxAttempts,
      failure_signature: failureSignature,
    };
  }

  if (attempts >= input.maxAttempts) {
    return {
      decision: 'budget_exhausted',
      reason: `retry budget exhausted: ${attempts}/${input.maxAttempts} attempts already used`,
      attempts,
      max_attempts: input.maxAttempts,
      failure_signature: failureSignature,
    };
  }

  const nextAttempt = attempts + 1;
  return {
    decision: 'retry',
    reason: `${input.kind} retry allowed: attempt ${nextAttempt}/${input.maxAttempts}`,
    attempts,
    max_attempts: input.maxAttempts,
    next_attempt: nextAttempt,
    failure_signature: failureSignature,
    comment: renderRetryComment(input.kind, input.reason, nextAttempt, input.maxAttempts),
  };
}

function retryMarkers(comments: CommentLike[]): RetryMarker[] {
  const seenBodies = new Set<string>();
  const markers: RetryMarker[] = [];
  for (const comment of comments) {
    const body = comment.body?.trim();
    if (!body || seenBodies.has(body)) continue;
    seenBodies.add(body);
    const marker = parseRetryMarker(body);
    if (marker) markers.push(marker);
  }
  return markers;
}

function parseRetryMarker(body: string): RetryMarker | undefined {
  const match = /^Agent autopilot retry: (CI failed|reviewer requested another develop pass) \(([\s\S]*)\)\. Attempt (\d+) of (\d+)\./.exec(body);
  if (!match) return undefined;
  const kind: RetryKind = match[1] === 'CI failed' ? 'ci' : 'review';
  const reason = match[2] ?? '';
  return {
    kind,
    reason,
    failure_signature: signature(reason),
    attempt: Number.parseInt(match[3] ?? '0', 10),
    max: Number.parseInt(match[4] ?? '0', 10),
  };
}

function renderRetryComment(kind: RetryKind, reason: string, nextAttempt: number, maxAttempts: number): string {
  const label = kind === 'ci' ? 'CI failed' : 'reviewer requested another develop pass';
  return `Agent autopilot retry: ${label} (${reason}). Attempt ${nextAttempt} of ${maxAttempts}.`;
}

function signature(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200) || 'unknown';
}

function readComments(path: string | undefined): CommentLike[] {
  if (!path) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (Array.isArray(parsed)) return parsed as CommentLike[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { comments?: unknown }).comments)) {
    return (parsed as { comments: CommentLike[] }).comments;
  }
  return [];
}

function writeOutputs(decision: LoopBudgetDecision): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `decision=${decision.decision}`,
    `reason=${decision.reason}`,
    `attempts=${decision.attempts}`,
    `max_attempts=${decision.max_attempts}`,
    `next_attempt=${decision.next_attempt ?? ''}`,
    `failure_signature=${decision.failure_signature}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const decision = decideLoopBudget({
    kind: options.kind,
    reason: options.reason,
    maxAttempts: options.maxAttempts,
    issueComments: readComments(options.issueComments),
    prComments: readComments(options.prComments),
  });
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  writeOutputs(decision);
  process.stdout.write(`loop-budget=${decision.decision}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
