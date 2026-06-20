#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export interface CiPolicy {
  required_checks: string[];
  optional_checks: string[];
  stale_after_minutes: number;
  missing_required_check: 'blocked' | 'human_required' | 'wait';
  failed_required_check: 'develop_retry' | 'blocked' | 'human_required';
  max_ci_fix_attempts: number;
}

export interface CheckRun {
  name: string;
  state?: string;
  conclusion?: string;
  bucket?: string;
  completedAt?: string;
}

export interface CiDecision {
  decision: 'pass' | 'wait' | 'develop_retry' | 'blocked' | 'human_required';
  reason: string;
  required: Array<{ name: string; status: 'pass' | 'missing' | 'pending' | 'failed' | 'stale'; conclusion?: string }>;
}

export const DEFAULT_CI_POLICY: CiPolicy = {
  required_checks: ['ci'],
  optional_checks: [],
  stale_after_minutes: 60,
  missing_required_check: 'blocked',
  failed_required_check: 'develop_retry',
  max_ci_fix_attempts: 2,
};

interface Options {
  checks: string;
  policy?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-ci.ts --checks checks.json [--policy ci-policy.json] --out .agent-run/ci.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const checks = value('--checks');
  if (!checks) usage();
  return { checks, policy: value('--policy'), out: value('--out') ?? '.agent-run/ci.json' };
}

export function evaluateCi(checks: CheckRun[], policy: CiPolicy = DEFAULT_CI_POLICY, now = new Date()): CiDecision {
  const required = policy.required_checks.map((name) => {
    const check = checks.find((candidate) => candidate.name === name);
    if (!check) return { name, status: 'missing' as const };
    const bucket = (check.bucket ?? '').toLowerCase();
    const state = normalizeState(check.state, bucket);
    const conclusion = normalizeConclusion(check.conclusion, bucket);
    if (state && state !== 'COMPLETED') return { name, status: 'pending' as const, conclusion: check.conclusion };
    if (conclusion !== 'SUCCESS') return { name, status: 'failed' as const, conclusion: check.conclusion };
    if (check.completedAt && isStale(check.completedAt, policy.stale_after_minutes, now)) {
      return { name, status: 'stale' as const, conclusion: check.conclusion };
    }
    return { name, status: 'pass' as const, conclusion: check.conclusion };
  });

  const firstProblem = required.find((check) => check.status !== 'pass');
  if (!firstProblem) return { decision: 'pass', reason: 'all required checks passed', required };
  if (firstProblem.status === 'pending') return { decision: 'wait', reason: `${firstProblem.name} is still pending`, required };
  if (firstProblem.status === 'missing') return { decision: policy.missing_required_check, reason: `${firstProblem.name} is missing`, required };
  if (firstProblem.status === 'stale') return { decision: 'wait', reason: `${firstProblem.name} is stale`, required };
  return { decision: policy.failed_required_check, reason: `${firstProblem.name} failed`, required };
}

// `gh pr checks --json state` reports a rollup that, for a finished check, is the CONCLUSION
// (SUCCESS/FAILURE/SKIPPED/…) rather than the Checks-API status (COMPLETED). So only the known
// in-flight states mean "not yet completed"; every other non-empty state is terminal. (The Checks-API
// IN_PROGRESS/QUEUED forms are handled by the same set.)
const PENDING_STATES = new Set(['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', 'REQUESTED']);
function normalizeState(state: string | undefined, bucket: string): string {
  const normalized = (state ?? '').toUpperCase();
  if (normalized) return PENDING_STATES.has(normalized) ? normalized : 'COMPLETED';
  if (bucket === 'pending') return 'IN_PROGRESS';
  if (bucket === 'pass' || bucket === 'fail' || bucket === 'cancel' || bucket === 'skipping') return 'COMPLETED';
  return '';
}

function normalizeConclusion(conclusion: string | undefined, bucket: string): string {
  const normalized = (conclusion ?? '').toUpperCase();
  if (normalized) return normalized;
  if (bucket === 'pass') return 'SUCCESS';
  if (bucket === 'fail') return 'FAILURE';
  if (bucket === 'cancel') return 'CANCELLED';
  if (bucket === 'skipping') return 'SKIPPED';
  return '';
}

function isStale(completedAt: string, staleAfterMinutes: number, now: Date): boolean {
  const completed = new Date(completedAt);
  if (!Number.isFinite(completed.getTime())) return false;
  // A commit STATUS (vs a check run) has no completion time — gh reports the zero date
  // ("0001-01-01T00:00:00Z", a large negative epoch). Treat "no real completion time" as not stale
  // rather than ~2000 years old (which would wedge the gate at "stale → wait" forever).
  if (completed.getTime() <= 0) return false;
  return now.getTime() - completed.getTime() > staleAfterMinutes * 60_000;
}

function writeOutputs(decision: CiDecision): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `decision=${decision.decision}`,
    `reason=${decision.reason}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const checks = JSON.parse(readFileSync(options.checks, 'utf8')) as CheckRun[];
  const policy = options.policy ? JSON.parse(readFileSync(options.policy, 'utf8')) as CiPolicy : DEFAULT_CI_POLICY;
  const decision = evaluateCi(checks, policy);
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  writeOutputs(decision);
  process.stdout.write(`ci-decision=${decision.decision}\n`);
  if (decision.decision !== 'pass') process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
