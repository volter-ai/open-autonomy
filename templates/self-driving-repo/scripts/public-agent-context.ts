#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';

export interface DeveloperContext {
  target: unknown;
  issue: unknown;
  recent_issue_comments: unknown[];
  previous_decisions: unknown[];
  current_pr: null | {
    number?: number;
    title?: string;
    url?: string;
    headRefName?: string;
    updatedAt?: string;
    files?: unknown[];
    diff?: string;
  };
  context_sources: string[];
}

interface Options {
  target: string;
  issue: string;
  comments?: string;
  decisions?: string;
  pr?: string;
  prDiff?: string;
  out: string;
}

const MAX_COMMENTS = 20;
const MAX_DECISIONS = 30;
const MAX_DIFF_CHARS = 30_000;

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-context.ts --target target.json --issue issue.json [--comments comments.json] [--decisions decisions.json] [--pr pr.json] [--pr-diff diff.patch] --out context.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const target = value('--target');
  const issue = value('--issue');
  const out = value('--out');
  if (!target || !issue || !out) usage();
  return {
    target,
    issue,
    comments: value('--comments'),
    decisions: value('--decisions'),
    pr: value('--pr'),
    prDiff: value('--pr-diff'),
    out,
  };
}

export function buildDeveloperContext(input: {
  target: unknown;
  issue: unknown;
  comments?: unknown;
  decisions?: unknown;
  pr?: unknown;
  prDiff?: string;
}): DeveloperContext {
  const comments = normalizeArray(input.comments)
    .sort((a, b) => Date.parse(String((b as { createdAt?: string }).createdAt ?? '')) - Date.parse(String((a as { createdAt?: string }).createdAt ?? '')))
    .slice(0, MAX_COMMENTS);
  const decisions = normalizeArray(input.decisions)
    .sort((a, b) => Date.parse(String((b as { created_at?: string }).created_at ?? '')) - Date.parse(String((a as { created_at?: string }).created_at ?? '')))
    .slice(0, MAX_DECISIONS);
  const pr = normalizePr(input.pr);
  const sources = ['target', 'issue'];
  if (comments.length) sources.push('issue_comments');
  if (decisions.length) sources.push('previous_decisions');
  if (pr) sources.push('current_pr');
  if (pr && input.prDiff) sources.push('current_pr_diff');
  return {
    target: input.target,
    issue: input.issue,
    recent_issue_comments: comments,
    previous_decisions: decisions,
    current_pr: pr ? {
      ...pr,
      diff: input.prDiff ? truncate(input.prDiff, MAX_DIFF_CHARS) : undefined,
    } : null,
    context_sources: sources,
  };
}

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { comments?: unknown }).comments)) {
    return (value as { comments: unknown[] }).comments;
  }
  return [];
}

function normalizePr(value: unknown): DeveloperContext['current_pr'] {
  if (!value || typeof value !== 'object') return null;
  const pr = value as DeveloperContext['current_pr'];
  if (!pr?.number) return null;
  return pr;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`;
}

function readJson(path: string | undefined): unknown {
  if (!path) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = buildDeveloperContext({
    target: readJson(options.target),
    issue: readJson(options.issue),
    comments: readJson(options.comments),
    decisions: readJson(options.decisions),
    pr: readJson(options.pr),
    prDiff: options.prDiff ? readFileSync(options.prDiff, 'utf8') : undefined,
  });
  writeFileSync(options.out, `${JSON.stringify(context, null, 2)}\n`);
  process.stdout.write(`context=${options.out}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
