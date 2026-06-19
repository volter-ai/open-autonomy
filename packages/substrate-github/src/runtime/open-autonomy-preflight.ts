#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readAutonomyConfig, referencedAutonomyPaths } from './open-autonomy-config.js';

export interface PreflightInput {
  root?: string;
  env?: Record<string, string | undefined>;
  labels?: string[];
  branchProtection?: { required_checks?: string[]; protected?: boolean };
}

export interface PreflightCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface PreflightReport {
  schema: 'open-autonomy.preflight.v1';
  ready: boolean;
  checks: PreflightCheck[];
  missing: string[];
}

interface Options {
  root: string;
  labels?: string;
  branchProtection?: string;
  out: string;
}

const REQUIRED_FILES = [
  'AGENTS.md',
  '.open-autonomy/autonomy.yml',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/review-rubric.yml',
  '.github/workflows/public-agent.yml',
  '.github/workflows/public-agent-review.yml',
  '.github/workflows/public-agent-pm.yml',
  '.github/workflows/open-autonomy-planner.yml',
  '.github/workflows/open-autonomy-upgrade.yml',
  'scripts/public-agent-control-files.ts',
  'scripts/public-agent-planner.ts',
  'scripts/public-agent-decision-index.ts',
  'VERSION',
];

const REQUIRED_ENV = [
  'MODEL_PROXY_URL',
  'PUBLIC_AGENT_TRIAGE_MODEL',
];

const REQUIRED_SECRET_NAMES = [
  'MODEL_PROXY_ADMIN_TOKEN',
];

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-preflight.ts [--root .] [--labels labels.json] [--branch-protection branch.json] --out preflight.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes('--help')) usage();
  return {
    root: value('--root') ?? '.',
    labels: value('--labels'),
    branchProtection: value('--branch-protection'),
    out: value('--out') ?? '.agent-run/preflight.json',
  };
}

export function buildPreflightReport(input: PreflightInput = {}): PreflightReport {
  const root = input.root ?? '.';
  const env = input.env ?? process.env;
  const labels = new Set(input.labels ?? []);
  const checks: PreflightCheck[] = [];

  for (const file of REQUIRED_FILES) {
    checks.push({
      id: `file:${file}`,
      status: existsSync(`${root}/${file}`) ? 'pass' : 'fail',
      message: existsSync(`${root}/${file}`) ? `found ${file}` : `missing ${file}`,
    });
  }

  const config = readAutonomyConfig(root);
  for (const path of referencedAutonomyPaths(config)) {
    checks.push({
      id: `autonomy-ref:${path}`,
      status: existsSync(`${root}/${path}`) ? 'pass' : 'fail',
      message: existsSync(`${root}/${path}`) ? `found referenced asset ${path}` : `missing referenced asset ${path}`,
    });
  }

  for (const name of REQUIRED_ENV) {
    checks.push({
      id: `env:${name}`,
      status: env[name] ? 'pass' : 'warn',
      message: env[name] ? `configured ${name}` : `repository variable ${name} is not visible in this preflight environment`,
    });
  }

  for (const name of REQUIRED_SECRET_NAMES) {
    checks.push({
      id: `secret:${name}`,
      status: env[name] ? 'pass' : 'warn',
      message: env[name] ? `secret ${name} is available to this workflow` : `secret ${name} cannot be confirmed from this environment`,
    });
  }

  for (const label of ['agent-paused', 'agent-blocked', 'human-required', 'needs-info', 'origin:roadmap-planner']) {
    checks.push({
      id: `label:${label}`,
      status: labels.size === 0 || labels.has(label) ? 'pass' : 'warn',
      message: labels.size === 0 || labels.has(label) ? `label ${label} present or unchecked` : `label ${label} should be created`,
    });
  }

  const requiredChecks = input.branchProtection?.required_checks ?? [];
  checks.push({
    id: 'branch-protection:required-ci',
    status: requiredChecks.length === 0 || requiredChecks.includes('ci') ? 'pass' : 'warn',
    message: requiredChecks.length === 0 ? 'branch protection not provided' : `required checks: ${requiredChecks.join(', ')}`,
  });

  const missing = checks.filter((check) => check.status === 'fail').map((check) => check.id);
  return {
    schema: 'open-autonomy.preflight.v1',
    ready: missing.length === 0,
    checks,
    missing,
  };
}

function readLabels(path: string | undefined): string[] {
  if (!path) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((label) => typeof label === 'string' ? label : (label as { name?: string }).name ?? '').filter(Boolean);
}

function readBranchProtection(path: string | undefined): PreflightInput['branchProtection'] {
  if (!path) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as PreflightInput['branchProtection'];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = buildPreflightReport({
    root: options.root,
    labels: readLabels(options.labels),
    branchProtection: readBranchProtection(options.branchProtection),
  });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`preflight=${report.ready ? 'ready' : 'blocked'}\n`);
  if (!report.ready) process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
