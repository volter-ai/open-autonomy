#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { runClaudeAgent } from './agent-loop.js';

// The PM decision, as the agent loop's submit schema. Read-only tools: PM has no artifact:author, so its
// agent investigates but never executes; the deterministic harness still does the privileged dispatch.
const PM_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['develop', 'review', 'needs_info', 'duplicate', 'spam', 'human_required', 'wont_fix', 'ignore'] },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    human_required: { type: 'boolean' },
    reason: { type: 'string' },
    question: { type: 'string' },
    duplicate_of: { type: 'number' },
  },
  required: ['action', 'risk', 'human_required', 'reason'],
};

export type PmAction =
  | 'develop'
  | 'review'
  | 'needs_info'
  | 'duplicate'
  | 'spam'
  | 'human_required'
  | 'wont_fix'
  | 'ignore';

export interface PmDecision {
  action: PmAction;
  risk: 'low' | 'medium' | 'high';
  human_required: boolean;
  reason: string;
  question?: string;
  duplicate_of?: number;
}

interface Options {
  issue: string;
  provider: 'anthropic' | 'openai';
  model: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... bun scripts/public-agent-pm.ts --issue issue.json --provider openai|anthropic --model model --out pm.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const provider = value('--provider') ?? 'openai';
  const model = value('--model');
  if (!issue || !model || (provider !== 'openai' && provider !== 'anthropic')) usage();
  return { issue, provider, model, out: value('--out') ?? '.agent-run/pm.json' };
}

export function parsePmDecision(text: string): PmDecision {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed) as Partial<PmDecision>;
  const actions: PmAction[] = ['develop', 'review', 'needs_info', 'duplicate', 'spam', 'human_required', 'wont_fix', 'ignore'];
  if (!actions.includes(parsed.action as PmAction)) throw new Error('PM returned invalid action');
  if (parsed.risk !== 'low' && parsed.risk !== 'medium' && parsed.risk !== 'high') throw new Error('PM returned invalid risk');
  if (typeof parsed.human_required !== 'boolean') throw new Error('PM returned invalid human_required');
  if (!parsed.reason || typeof parsed.reason !== 'string') throw new Error('PM returned no reason');
  return {
    action: parsed.action as PmAction,
    risk: parsed.risk,
    human_required: parsed.human_required,
    reason: parsed.reason,
    question: typeof parsed.question === 'string' ? parsed.question : undefined,
    duplicate_of: Number.isInteger(parsed.duplicate_of) ? Number(parsed.duplicate_of) : undefined,
  };
}

export function pmFailureDecision(error: unknown): PmDecision {
  return {
    action: 'ignore',
    risk: 'low',
    human_required: false,
    reason: `PM model decision unavailable: ${redact(String(error instanceof Error ? error.message : error))}`,
  };
}

export function renderPmPrompt(issueJson: string): string {
  return [
    'You are the PM agent for a self-building OSS repository.',
    'Triage this public issue and recommend exactly one next action.',
    'You do not authorize execution. A deterministic dispatcher will decide.',
    'Return strict JSON only.',
    'Schema: action, risk, human_required, reason, optional question, optional duplicate_of.',
    'Allowed actions: develop, review, needs_info, duplicate, spam, human_required, wont_fix, ignore.',
    'Choose develop only for clear, scoped, non-security work with enough acceptance criteria.',
    'Choose ignore when an agent run for this issue is queued or in_progress.',
    'Choose review when open_agent_pr exists and the PR appears ready for reviewer attention.',
    'Choose develop again only when there is no queued/in_progress run and the issue has new human information after the last PM or agent action.',
    'If a human reply after a PM needs_info comment provides an exact file and concrete requested text or acceptance criteria, choose develop.',
    'For failed, blocked, or stalled agent work with no new human input, choose ignore unless human_required is warranted by risk or ambiguity.',
    'Choose needs_info when reproduction, scope, or desired behavior is missing.',
    'Choose human_required for security-sensitive, workflow, policy, legal, credential, maintainer-trust, or ambiguous product decisions.',
    'Choose human_required for operational-control issues whose purpose is to pause, inspect, retry, resume, or repo-pause automation instead of changing repository files.',
    'If labels include agent-blocked, human-required, security, or agent-paused, choose ignore unless you are explaining human_required from new human input.',
    'Use open_agent_pr, open_agent_pr.comments, agent_runs, labels, previous_decisions, and issue comments in the issue context to avoid duplicate starts and duplicate reviews, and to notice stuck or blocked work.',
    'If previous_decisions show policy_blocked, budget_exhausted, needs_info_stale, ci-repeated-failure, or review-repeated-failure with no newer human input, choose ignore or human_required instead of develop.',
    'If an open canonical agent PR exists and has no newer review/status marker after its latest update, choose review instead of develop when the PR appears ready.',
    'If a failed or stale run has newer human input with concrete requested changes, develop may be appropriate; otherwise avoid restarting failed work blindly.',
    'The PM control surface is comments: develop maps to /agent develop on the issue; review maps to /agent review on the open PR.',
    '',
    'Issue context JSON:',
    issueJson,
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prompt = renderPmPrompt(readFileSync(options.issue, 'utf8'));
  const decision = await (async () => {
    try {
      const artifact = await runClaudeAgent<PmDecision>({
        system:
          'You are the PM agent for a self-building OSS repository. Triage the issue: investigate with your read tools (read the referenced code/files for context), then submit a decision. Choose develop/review only for clear, scoped, low-risk work; needs_info when underspecified; human_required for workflow/secret/auth/security-sensitive matters or anything you cannot confidently route.',
        goal: prompt,
        result: { schema: PM_SCHEMA },
        model: options.model,
      });
      return parsePmDecision(JSON.stringify(artifact));
    } catch (error) {
      return pmFailureDecision(error);
    }
  })();
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  process.stdout.write(`pm=${decision.action}:${decision.risk}\n`);
}

function redact(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, 'sk-redacted')
    .replace(/\b(?:ghp|github_pat|anthropic)_[A-Za-z0-9_:-]{12,}\b/g, 'token-redacted');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
