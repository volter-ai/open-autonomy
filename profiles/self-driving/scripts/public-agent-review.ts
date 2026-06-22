#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { readControlFileContext, renderControlFilePrompt } from './public-agent-control-files.js';
import { runClaudeAgent } from './agent-loop.js';

// The reviewer's verdict, as the agent loop's submit schema. Read-only tools only: review runs in a
// trusted job, so its agent reads (the diff + changed files for full context) but does not execute.
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    human_required: { type: 'boolean' },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'risk', 'human_required', 'summary', 'findings'],
};

export interface ReviewerVerdict {
  verdict: 'pass' | 'fail';
  risk: 'low' | 'medium' | 'high';
  human_required: boolean;
  summary: string;
  findings: string[];
  failure_kind?: 'model_error';
}

interface Options {
  provider: 'anthropic' | 'openai';
  model: string;
  diff: string;
  ci?: string;
  controlFiles?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... bun scripts/public-agent-review.ts --diff diff.patch [--control-files control-files.json] --provider openai|anthropic --model model --out review.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const diff = value('--diff');
  const model = value('--model');
  const provider = value('--provider') ?? 'openai';
  if (!diff || !model || (provider !== 'openai' && provider !== 'anthropic')) usage();
  return { diff, model, provider, ci: value('--ci'), controlFiles: value('--control-files'), out: value('--out') ?? '.agent-run/review.json' };
}

export function parseReviewerVerdict(text: string): ReviewerVerdict {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed) as Partial<ReviewerVerdict>;
  if (parsed.verdict !== 'pass' && parsed.verdict !== 'fail') throw new Error('reviewer returned invalid verdict');
  if (parsed.risk !== 'low' && parsed.risk !== 'medium' && parsed.risk !== 'high') throw new Error('reviewer returned invalid risk');
  if (typeof parsed.human_required !== 'boolean') throw new Error('reviewer returned invalid human_required');
  if (!parsed.summary || typeof parsed.summary !== 'string') throw new Error('reviewer returned no summary');
  if (!Array.isArray(parsed.findings) || parsed.findings.some((item) => typeof item !== 'string')) {
    throw new Error('reviewer returned invalid findings');
  }
  return parsed as ReviewerVerdict;
}

export function renderReviewPrompt(diff: string, ci = '', controlContext = ''): string {
  return [
    'You are the reviewer agent for a self-building OSS repository.',
    'Review the PR diff and CI result. Return strict JSON only.',
    'Schema: verdict pass|fail, risk low|medium|high, human_required boolean, summary string, findings string[].',
    'Mark human_required true for workflow changes, secret exposure, auth/security-sensitive behavior, unclear broad rewrites, or changes you cannot confidently review.',
    'A broad non-workflow code change can be low risk when the diff is focused, tested, and understandable.',
    'Apply the repository constitution, policy, standards, and review rubric when provided.',
    '',
    'Control files:',
    controlContext || '(not provided)',
    '',
    'CI:',
    ci || '(not provided)',
    '',
    'Diff:',
    diff,
  ].join('\n');
}

export function modelFailureVerdict(error: unknown): ReviewerVerdict {
  const message = error instanceof Error ? error.message : String(error);
  return {
    verdict: 'fail',
    risk: 'high',
    human_required: false,
    summary: 'Reviewer model call failed.',
    findings: [sanitizeMessage(message)],
    failure_kind: 'model_error',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prompt = renderReviewPrompt(
    readFileSync(options.diff, 'utf8'),
    options.ci ? readFileSync(options.ci, 'utf8') : '',
    options.controlFiles ? renderControlFilePrompt(JSON.parse(readFileSync(options.controlFiles, 'utf8'))) : renderControlFilePrompt(readControlFileContext('.')),
  );
  let verdict: ReviewerVerdict;
  try {
    const artifact = await runClaudeAgent<ReviewerVerdict>({
      system:
        'You are the reviewer agent for a self-building OSS repository. Investigate the change with your tools — read the changed files for full context — apply the constitution, policy, standards, and rubric, then submit a strict verdict. Mark human_required for workflow changes, secret exposure, auth/security-sensitive behavior, unclear broad rewrites, or anything you cannot confidently review.',
      goal: prompt,
      result: { schema: REVIEW_SCHEMA },
      model: options.model,
    });
    verdict = parseReviewerVerdict(JSON.stringify(artifact));
  } catch (error) {
    verdict = modelFailureVerdict(error);
  }
  writeFileSync(options.out, `${JSON.stringify(verdict, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `verdict=${verdict.verdict}`,
      `risk=${verdict.risk}`,
      `human_required=${verdict.human_required ? 'true' : 'false'}`,
      '',
    ].join('\n'));
  }
  process.stdout.write(`review=${verdict.verdict}:${verdict.risk}\n`);
  if (verdict.verdict !== 'pass' || verdict.human_required) process.exit(78);
}

function sanitizeMessage(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/ghp_[A-Za-z0-9]{30,}/g, '[redacted]')
    .slice(0, 500);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
