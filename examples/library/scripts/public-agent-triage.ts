#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

type Decision =
  | 'approve_run'
  | 'needs_clarification'
  | 'reject_spam'
  | 'reject_abuse'
  | 'reject_out_of_scope'
  | 'reject_too_large'
  | 'duplicate';

interface TriageResult {
  decision: Decision;
  reason: string;
  question?: string;
}

interface IssueContext {
  title?: string;
  body?: string;
  number?: number;
  user?: { login?: string };
  comments?: Array<{ body?: string; author?: { login?: string }; createdAt?: string }>;
}

interface Options {
  issue: string;
  provider: 'anthropic' | 'openai';
  model: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... bun scripts/public-agent-triage.ts --issue issue.json --provider anthropic|openai --model model --out triage.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const provider = value('--provider') ?? 'anthropic';
  const model = value('--model');
  const out = value('--out') ?? 'triage.json';
  if (!issue || !model || (provider !== 'anthropic' && provider !== 'openai')) usage();
  return { issue, provider, model, out };
}

export function parseTriageDecision(text: string): TriageResult {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed) as Partial<TriageResult>;
  const allowed: Decision[] = [
    'approve_run',
    'needs_clarification',
    'reject_spam',
    'reject_abuse',
    'reject_out_of_scope',
    'reject_too_large',
    'duplicate',
  ];
  if (!allowed.includes(parsed.decision as Decision)) throw new Error('triage returned invalid decision');
  if (!parsed.reason || typeof parsed.reason !== 'string') throw new Error('triage returned no reason');
  return {
    decision: parsed.decision as Decision,
    reason: parsed.reason,
    question: typeof parsed.question === 'string' ? parsed.question : undefined,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const issue = JSON.parse(readFileSync(options.issue, 'utf8')) as IssueContext;
  const pmApproved = pmApprovedDevelop(issue);
  if (pmApproved) {
    writeResult(options.out, pmApproved);
    return;
  }
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const token = process.env.MODEL_PROXY_TOKEN;
  if (!proxyUrl || !token) throw new Error('MODEL_PROXY_URL and MODEL_PROXY_TOKEN are required');
  const prompt = renderTriagePrompt(issue);

  const result = options.provider === 'anthropic'
    ? await callAnthropic(proxyUrl, token, options.model, prompt)
    : await callOpenAI(proxyUrl, token, options.model, prompt);
  writeResult(options.out, result);
}

export function pmApprovedDevelop(issue: IssueContext): TriageResult | undefined {
  const latestPmDevelop = issue.comments
    ?.filter((comment) => /^\/agent\s+(develop|run|continue)\b[\s\S]*\n\s*PM reason:/i.test(comment.body?.trim() ?? ''))
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))[0];
  if (!latestPmDevelop) return undefined;
  return {
    decision: 'approve_run',
    reason: `PM already approved develop for this issue: ${pmReason(latestPmDevelop.body)}`,
  };
}

function pmReason(body: string | undefined): string {
  const match = body?.match(/PM reason:\s*([\s\S]*)/i);
  return match?.[1]?.trim() || 'no PM reason provided';
}

function renderTriagePrompt(issue: IssueContext): string {
  const comments = (issue.comments ?? [])
    .slice(-10)
    .map((comment) => `- ${comment.author?.login ?? 'unknown'} at ${comment.createdAt ?? 'unknown'}: ${comment.body ?? ''}`)
    .join('\n');
  return [
    'You are a public OSS issue triage gate for an automated coding agent.',
    'Decide whether spending agent tokens is appropriate.',
    'Return strict JSON only with decision, reason, and optional question.',
    'Allowed decisions: approve_run, needs_clarification, reject_spam, reject_abuse, reject_out_of_scope, reject_too_large, duplicate.',
    '',
    `Issue #${issue.number ?? 'unknown'} by ${issue.user?.login ?? 'unknown'}`,
    `Title: ${issue.title ?? ''}`,
    `Body:\n${issue.body ?? ''}`,
    `Recent comments:\n${comments || 'none'}`,
  ].join('\n');
}

function writeResult(out: string, result: TriageResult): void {
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  const approved = result.decision === 'approve_run';
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `approved=${approved ? 'true' : 'false'}\ndecision=${result.decision}\n`);
  }
  process.stdout.write(`triage=${result.decision}\n`);
  if (!approved) process.exit(78);
}

async function callAnthropic(proxyUrl: string, token: string, model: string, prompt: string): Promise<TriageResult> {
  const res = await fetch(new URL('/anthropic/v1/messages', proxyUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json() as { content?: Array<{ text?: string }> };
  if (!res.ok) throw new Error(`triage model call failed: ${res.status}`);
  return parseTriageDecision(body.content?.map((part) => part.text ?? '').join('\n') ?? '');
}

async function callOpenAI(proxyUrl: string, token: string, model: string, prompt: string): Promise<TriageResult> {
  const res = await fetch(new URL('/openai/v1/chat/completions', proxyUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok) throw new Error(`triage model call failed: ${res.status}`);
  return parseTriageDecision(body.choices?.[0]?.message?.content ?? '');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
