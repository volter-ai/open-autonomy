#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { PmDecision } from './public-agent-pm.js';

export interface DispatchDecision {
  action: 'comment' | 'skip';
  reason: string;
  comment?: string;
  target?: 'issue' | 'pull_request';
  target_number?: number;
  command?: '/agent develop' | '/agent review';
}

interface Options {
  issue: string;
  pm: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-dispatcher.ts --issue issue.json --pm pm.json --out dispatch.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const pm = value('--pm');
  if (!issue || !pm) usage();
  return { issue, pm, out: value('--out') ?? '.agent-run/dispatch.json' };
}

export function decideDispatch(issue: unknown, pm: PmDecision): DispatchDecision {
  const item = issue as {
    number?: number;
    labels?: Array<{ name?: string }>;
    comments?: Array<{ body?: string; createdAt?: string; author?: { login?: string } }>;
    open_agent_pr?: { number?: number; updatedAt?: string; comments?: Array<{ body?: string; createdAt?: string; author?: { login?: string } }> } | null;
    agent_runs?: Array<{ status?: string; conclusion?: string; createdAt?: string; updatedAt?: string }>;
  };
  const issueNumber = item.number;
  if (!issueNumber) return { action: 'skip', reason: 'issue number is missing' };
  const blockingLabel = blockingLabelName(item.labels);
  if (blockingLabel) return { action: 'skip', reason: `blocking label present: ${blockingLabel}` };
  if (hasActiveRun(item.agent_runs)) {
    return { action: 'skip', reason: 'an agent run is already queued or in progress for this issue' };
  }
  if (pm.action === 'develop') {
    if (item.open_agent_pr?.number && !hasNewHumanCommentAfter(item.comments, item.open_agent_pr.updatedAt)) {
      return { action: 'skip', reason: `open agent PR #${item.open_agent_pr.number} already exists; review it before starting another develop pass` };
    }
    const latestAgentMarker = latestPublicWorkMarker(item.comments);
    if (latestAgentMarker && !hasNewHumanCommentAfter(item.comments, latestAgentMarker.createdAt)) {
      return { action: 'skip', reason: 'prior agent attempt exists with no newer human input' };
    }
    return {
      action: 'comment',
      reason: pm.reason,
      target: 'issue',
      target_number: issueNumber,
      command: '/agent develop',
      comment: `/agent develop\n\nPM reason: ${pm.reason}`,
    };
  }
  if (pm.action === 'review') {
    const pr = item.open_agent_pr?.number;
    if (!pr) return { action: 'skip', reason: 'PM requested review, but no open agent PR was found' };
    const latestReviewMarker = latestPublicWorkMarker(item.open_agent_pr?.comments);
    if (latestReviewMarker && !hasNewHumanCommentAfter(item.open_agent_pr?.comments, latestReviewMarker.createdAt)) {
      return { action: 'skip', reason: `prior agent review exists on PR #${pr} with no newer human input` };
    }
    return {
      action: 'comment',
      reason: pm.reason,
      target: 'pull_request',
      target_number: pr,
      command: '/agent review',
      comment: `/agent review\n\nPM reason: ${pm.reason}`,
    };
  }
  if (pm.action === 'needs_info') {
    const repeat = repeatedPmStatus(item.comments);
    if (repeat) return repeat;
    return {
      action: 'comment',
      reason: pm.reason,
      target: 'issue',
      target_number: issueNumber,
      comment: `PM agent needs more information.\n\n${pm.question ?? pm.reason}`,
    };
  }
  if (pm.action === 'duplicate') {
    const repeat = repeatedPmStatus(item.comments);
    if (repeat) return repeat;
    return {
      action: 'comment',
      reason: pm.reason,
      target: 'issue',
      target_number: issueNumber,
      comment: `PM agent thinks this may be a duplicate${pm.duplicate_of ? ` of #${pm.duplicate_of}` : ''}.\n\n${pm.reason}`,
    };
  }
  if (pm.action === 'spam' || pm.action === 'human_required' || pm.action === 'wont_fix') {
    const repeat = repeatedPmStatus(item.comments);
    if (repeat) return repeat;
    return {
      action: 'comment',
      reason: pm.reason,
      target: 'issue',
      target_number: issueNumber,
      comment: `PM agent marked this as ${pm.action.replaceAll('_', ' ')}.\n\n${pm.reason}`,
    };
  }
  return { action: 'skip', reason: pm.reason };
}

function hasActiveRun(runs: Array<{ status?: string }> | undefined): boolean {
  return runs?.some((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'waiting' || run.status === 'requested') ?? false;
}

function hasNewHumanCommentAfter(
  comments: Array<{ body?: string; createdAt?: string; author?: { login?: string } }> | undefined,
  timestamp: string | undefined,
): boolean {
  if (!timestamp) return false;
  const cutoff = Date.parse(timestamp);
  if (!Number.isFinite(cutoff)) return false;
  return comments?.some((comment) => {
    const created = Date.parse(comment.createdAt ?? '');
    if (!Number.isFinite(created) || created <= cutoff) return false;
    const author = comment.author?.login ?? '';
    return !isBotAuthor(author) && !isAgentCommand(comment.body);
  }) ?? false;
}

function repeatedPmStatus(
  comments: Array<{ body?: string; createdAt?: string; author?: { login?: string } }> | undefined,
): DispatchDecision | undefined {
  const latest = latestPmStatusMarker(comments);
  if (latest && !hasNewHumanCommentAfter(comments, latest.createdAt)) {
    return { action: 'skip', reason: 'prior PM status exists with no newer human input' };
  }
  return undefined;
}

function latestPublicWorkMarker(
  comments: Array<{ body?: string; createdAt?: string; author?: { login?: string } }> | undefined,
): { createdAt: string } | undefined {
  return comments
    ?.filter((comment) => comment.createdAt && (isAgentCommand(comment.body) || isAgentStatusComment(comment.body) || isPmStatusComment(comment.body)))
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))[0] as { createdAt: string } | undefined;
}

function latestPmStatusMarker(
  comments: Array<{ body?: string; createdAt?: string; author?: { login?: string } }> | undefined,
): { createdAt: string } | undefined {
  return comments
    ?.filter((comment) => comment.createdAt && isPmStatusComment(comment.body))
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))[0] as { createdAt: string } | undefined;
}

function isAgentCommand(body: string | undefined): boolean {
  return /^\/agent\s+(develop|run|continue|retry|review)\b/i.test(body?.trim() ?? '');
}

function isAgentStatusComment(body: string | undefined): boolean {
  const text = body?.trim() ?? '';
  return /^Agent (review blocked|review requires human review|review:|autopilot retry|merge blocked|CI blocked|run blocked)/i.test(text);
}

function isPmStatusComment(body: string | undefined): boolean {
  return /^PM agent (needs more information|thinks this may be a duplicate|marked this as)/i.test(body?.trim() ?? '');
}

function isBotAuthor(author: string): boolean {
  return author === 'github-actions' || author === 'github-actions[bot]' || author.endsWith('[bot]');
}

function blockingLabelName(labels: Array<{ name?: string }> | undefined): string | undefined {
  const blocking = new Set(['agent-paused', 'agent-blocked', 'human-required', 'security']);
  return labels?.map((label) => (label.name ?? '').toLowerCase()).find((name) => blocking.has(name));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const decision = decideDispatch(
    JSON.parse(readFileSync(options.issue, 'utf8')),
    JSON.parse(readFileSync(options.pm, 'utf8')) as PmDecision,
  );
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  process.stdout.write(`dispatch=${decision.action}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
