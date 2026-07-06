#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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

// This preflight is itself a self-driving-carried resource (only self-driving lists it in `resources:`),
// so these six are genuinely self-driving-SCAFFOLD invariants, not an accidental hardcode — a fork stays
// this shape as long as it forks self-driving's install layout (roadmap.yml/review-rubric.yml/
// upgrade-cli.ts are self-driving concepts, not part of the generic autonomy.ir.v1 manifest schema).
const REQUIRED_FILES = [
  'AGENTS.md',
  '.open-autonomy/autonomy.yml',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/review-rubric.yml',
  'scripts/open-autonomy-upgrade-cli.ts',
  'VERSION',
];

// Per-agent workflow files: DERIVED from the compiled manifest's own `agents` map (`workflowFile`), not a
// hardcoded name list — the hardcoded [developer, reviewer, pm, planner].yml this used to be would silently
// stop validating (or falsely fail) the moment a self-driving fork renamed/added/removed an agent. A
// `kind: human` actor carries no workflowFile (docs/SPEC.md#the-ir) and is correctly skipped.
function agentWorkflowFiles(root: string): string[] {
  try {
    const manifest = Bun.YAML.parse(readFileSync(`${root}/.open-autonomy/autonomy.yml`, 'utf8')) as {
      agents?: Record<string, { workflowFile?: string }>;
    };
    return Object.values(manifest.agents ?? {})
      .map((a) => a.workflowFile)
      .filter((f): f is string => Boolean(f))
      .map((f) => `.github/workflows/${f}`)
      .sort();
  } catch {
    return []; // no manifest yet -> the missing `.open-autonomy/autonomy.yml` file check above already fails loud
  }
}

const REQUIRED_ENV = [
  'MODEL_PROXY_URL',
];

// No admin secret is required in an installation: in-cell agents mint/revoke their model runs via the
// workflow's GitHub OIDC identity (id-token: write). The admin token is an operator/treasury credential,
// never stored in a fleet repo.
const REQUIRED_SECRET_NAMES: string[] = [];

// The seam-contract labels (docs/SPEC.md#capabilities — contract constants vs tunable policy): names the
// gate/control-plane machinery acts on at author time. Renaming one is a spec change, so they are a code
// constant here — NOT read from policy (an install must not be able to rename the seam out from under the
// components that hardcode it).
export const SEAM_CONTRACT_LABELS = [
  'human-required', // the human-approval gate's scope trigger
  'agent-develop-only', // the gate's develop-only hold (read via the PR's linked issue)
  'agent-paused', // the control plane's pause-verb marker
  'needs-info', // human-block label the control plane's answer verb clears
  'agent-blocked', // human-block label the control plane's resolutions clear
];

// The labels an install should have seeded: the contract constants + the install's OWN declared label
// policy, read from the compiled manifest — never a hand-kept copy (this list used to be the fifth
// hand-maintained copy of the label vocabulary; now the manifest is the only tunable source).
export function expectedLabels(root = '.'): string[] {
  let policy: {
    merge?: { maintainer_block_labels?: string[] };
    planner?: { issue_origin_label_prefix?: string; priority_labels?: Record<string, string> };
  } = {};
  try {
    const manifest = (Bun.YAML.parse(readFileSync(`${root}/.open-autonomy/autonomy.yml`, 'utf8')) ?? {}) as {
      policy?: typeof policy;
    };
    policy = manifest.policy ?? {};
  } catch {
    /* no manifest → contract constants only (the missing manifest is reported by its own check) */
  }
  const block = Array.isArray(policy.merge?.maintainer_block_labels) ? policy.merge.maintainer_block_labels : [];
  const planner = policy.planner ?? {};
  // `<origin-prefix>roadmap-planner` is the planner's provenance label for roadmap-born issues; the prefix
  // is the policy half, the `roadmap-planner` suffix is the planner-skill convention.
  const origin = planner.issue_origin_label_prefix ? [`${planner.issue_origin_label_prefix}roadmap-planner`] : [];
  const priority = Object.values(planner.priority_labels ?? {});
  return [...new Set([...SEAM_CONTRACT_LABELS, ...block, ...origin, ...priority])];
}

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

  for (const file of [...REQUIRED_FILES, ...agentWorkflowFiles(root)]) {
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

  // A local runner never mints a model token through the proxy (ambient/local model access instead —
  // docs/SPEC.md#the-box), so MODEL_PROXY_URL genuinely does not apply there. `scheduler/run.mjs` exists
  // ONLY in a local-substrate compile (packages/substrate-local's emit), so its presence is a reliable,
  // derived signal — not a guess — for scoping the check out instead of forever WARNING on a var this
  // install will never set. Decision recorded (BL-27 dev/03): stays a WARN, never a hard FAIL, for a
  // gh-actions install missing it too — an operator may be mid-setup, and a preflight FAIL here would
  // block on a var that's cheap to add later, unlike a genuinely missing structural file.
  const isLocalRunner = existsSync(`${root}/scheduler/run.mjs`);
  for (const name of REQUIRED_ENV) {
    if (name === 'MODEL_PROXY_URL' && isLocalRunner) {
      checks.push({ id: `env:${name}`, status: 'pass', message: `${name} does not apply to a local-runner install (agents use ambient/local model access, not the proxy)` });
      continue;
    }
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

  for (const label of expectedLabels(root)) {
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
  // A bare run (no CI step pre-creating the output dir) used to crash ENOENT here — mkdir -p the parent
  // first so `--out .agent-run/preflight.json` works from a clean checkout, not just under the workflow
  // that happens to `mkdir -p .agent-run/preflight` as a separate step first.
  mkdirSync(dirname(options.out), { recursive: true });
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
