#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { writeJson } from './public-agent-bundle.js';

export const DECISION_SCHEMA = 'volter.agent.decision.v1' as const;

export const DECISION_STAGES = [
  'pm_triage',
  'dispatch',
  'target',
  'triage',
  'develop',
  'publish',
  'ci',
  'review',
  'strategy_review',
  'retry',
  'merge_gate',
  'escalation',
] as const;

export type DecisionStage = (typeof DECISION_STAGES)[number];
export type DecisionRisk = 'low' | 'medium' | 'high' | 'risky';

export interface DecisionSubject {
  type: 'issue' | 'pr' | 'run' | 'repo';
  number?: number;
  head_sha?: string;
  branch?: string;
}

export interface DecisionAttempt {
  kind: 'develop' | 'review' | 'pm' | 'retry' | 'merge';
  index: number;
  max: number;
}

export interface AgentDecision {
  schema: typeof DECISION_SCHEMA;
  id: string;
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence: string[];
  next_action?: string;
  created_at: string;
}

export interface DecisionInput {
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence?: string[];
  next_action?: string;
}

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{12,}/g,
  /rk_live_[A-Za-z0-9]{12,}/g,
  /xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /anthropic_[A-Za-z0-9_-]{20,}/g,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
  const createdAt = now.toISOString();
  const redacted = redactSecrets({
    schema: DECISION_SCHEMA,
    stage: input.stage,
    issue: input.issue,
    pr: input.pr,
    run_id: input.run_id,
    actor: input.actor,
    decision: input.decision,
    risk: input.risk,
    subject: input.subject,
    attempt: input.attempt,
    reason: input.reason,
    failure_signature: input.failure_signature,
    supersedes: input.supersedes,
    evidence: input.evidence ?? [],
    next_action: input.next_action,
    created_at: createdAt,
  });
  const id = `dec_${createHash('sha256').update(JSON.stringify(redacted)).digest('hex').slice(0, 16)}`;
  return validateDecision({ ...redacted, id });
}

export function validateDecision(value: unknown): AgentDecision {
  if (!value || typeof value !== 'object') throw new Error('decision must be an object');
  const decision = value as Partial<AgentDecision>;
  if (decision.schema !== DECISION_SCHEMA) throw new Error('unsupported decision schema');
  if (!decision.id || typeof decision.id !== 'string' || !/^dec_[A-Fa-f0-9]{12,64}$/.test(decision.id)) throw new Error('decision.id is invalid');
  if (!decision.stage || !isDecisionStage(decision.stage)) throw new Error('decision.stage is invalid');
  if (!Number.isInteger(decision.issue) || Number(decision.issue) <= 0) throw new Error('decision.issue is invalid');
  if (decision.pr !== undefined && (!Number.isInteger(decision.pr) || Number(decision.pr) <= 0)) throw new Error('decision.pr is invalid');
  if (decision.run_id !== undefined && typeof decision.run_id !== 'string') throw new Error('decision.run_id is invalid');
  if (!decision.actor || typeof decision.actor !== 'string') throw new Error('decision.actor is required');
  if (!decision.decision || typeof decision.decision !== 'string') throw new Error('decision.decision is required');
  if (decision.risk !== undefined && !['low', 'medium', 'high', 'risky'].includes(decision.risk)) throw new Error('decision.risk is invalid');
  if (decision.subject !== undefined) validateSubject(decision.subject);
  if (decision.attempt !== undefined) validateAttempt(decision.attempt);
  if (decision.reason !== undefined && typeof decision.reason !== 'string') throw new Error('decision.reason is invalid');
  if (decision.failure_signature !== undefined && typeof decision.failure_signature !== 'string') throw new Error('decision.failure_signature is invalid');
  if (decision.supersedes !== undefined && (!Array.isArray(decision.supersedes) || decision.supersedes.some((id) => typeof id !== 'string'))) {
    throw new Error('decision.supersedes is invalid');
  }
  if (!Array.isArray(decision.evidence) || decision.evidence.some((item) => typeof item !== 'string')) throw new Error('decision.evidence is invalid');
  if (decision.next_action !== undefined && typeof decision.next_action !== 'string') throw new Error('decision.next_action is invalid');
  if (!decision.created_at || typeof decision.created_at !== 'string' || Number.isNaN(Date.parse(decision.created_at))) throw new Error('decision.created_at is invalid');
  return redactSecrets(decision) as AgentDecision;
}

export function writeDecision(outDir: string, decision: AgentDecision): string {
  const valid = validateDecision(decision);
  const filename = `${safeSegment(valid.stage)}-${safeSegment(valid.id)}.json`;
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, filename);
  writeJson(path, valid);
  return path;
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = redactSecrets(item);
  }
  return out as T;
}

function validateSubject(subject: DecisionSubject): void {
  if (!subject || typeof subject !== 'object') throw new Error('decision.subject is invalid');
  if (!['issue', 'pr', 'run', 'repo'].includes(subject.type)) throw new Error('decision.subject.type is invalid');
  if (subject.number !== undefined && (!Number.isInteger(subject.number) || subject.number <= 0)) throw new Error('decision.subject.number is invalid');
  if (subject.head_sha !== undefined && typeof subject.head_sha !== 'string') throw new Error('decision.subject.head_sha is invalid');
  if (subject.branch !== undefined && typeof subject.branch !== 'string') throw new Error('decision.subject.branch is invalid');
}

function validateAttempt(attempt: DecisionAttempt): void {
  if (!attempt || typeof attempt !== 'object') throw new Error('decision.attempt is invalid');
  if (!['develop', 'review', 'pm', 'retry', 'merge'].includes(attempt.kind)) throw new Error('decision.attempt.kind is invalid');
  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
  if (!Number.isInteger(attempt.max) || attempt.max <= 0) throw new Error('decision.attempt.max is invalid');
  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
}

function isDecisionStage(value: string): value is DecisionStage {
  return (DECISION_STAGES as readonly string[]).includes(value);
}

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[redacted]'), value);
}

function safeSegment(value: string): string {
  return basename(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

function parseArgs(argv: string[]): DecisionInput & { outDir: string; createdAt?: string } {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const stage = value('--stage');
  const issue = value('--issue');
  const actor = value('--actor');
  const decision = value('--decision');
  const outDir = value('--out-dir');
  if (!stage || !issue || !actor || !decision || !outDir) usage();
  return {
    stage: stage as DecisionStage,
    issue: Number(issue),
    pr: optionalNumber(value('--pr')),
    run_id: value('--run-id'),
    actor,
    decision,
    risk: value('--risk') as DecisionRisk | undefined,
    subject: parseJson(value('--subject-json')),
    attempt: parseJson(value('--attempt-json')),
    reason: value('--reason'),
    failure_signature: value('--failure-signature'),
    supersedes: parseList(value('--supersedes')),
    evidence: parseList(value('--evidence')),
    next_action: value('--next-action'),
    outDir,
    createdAt: value('--created-at'),
  };
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision.ts --stage develop --issue 123 --actor bot --decision pr-ready --out-dir out/decisions [--run-id run_...]`);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number(value);
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { outDir, createdAt, ...input } = parseArgs(process.argv.slice(2));
  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
  const path = writeDecision(resolve(outDir), decision);
  process.stdout.write(`decision=${path}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
