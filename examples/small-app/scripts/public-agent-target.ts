#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export type AgentTargetKind = 'issue' | 'pull_request';

export interface AgentTarget {
  kind: AgentTargetKind;
  issue: number;
  branch: string;
  base?: string;
  pull_request?: number;
  head_sha?: string;
  can_develop: boolean;
  reason?: string;
}

interface Options {
  event: string;
  pr?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-target.ts --event "$GITHUB_EVENT_PATH" [--pr pr.json] --out .agent-run/target.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const event = value('--event');
  if (!event) usage();
  return { event, pr: value('--pr'), out: value('--out') ?? '.agent-run/target.json' };
}

export function resolveAgentTarget(event: unknown, pr: unknown = undefined): AgentTarget {
  const payload = event as {
    issue?: { number?: number; pull_request?: unknown };
    inputs?: { issue_number?: string; pr_number?: string };
    pull_request?: {
      number?: number;
      head?: { ref?: string; repo?: { owner?: { login?: string }; full_name?: string } };
      base?: { ref?: string };
    };
    repository?: { default_branch?: string; full_name?: string };
  };
  const issue = Number(payload.issue?.number ?? payload.pull_request?.number ?? payload.inputs?.issue_number ?? payload.inputs?.pr_number);
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('event.issue.number is required');

  if (!payload.issue?.pull_request && !payload.pull_request && !payload.inputs?.pr_number) {
    return {
      kind: 'issue',
      issue,
      branch: `agent/issue-${issue}`,
      base: payload.repository?.default_branch,
      can_develop: true,
    };
  }

  const pull = pr as {
    number?: number;
    headRefName?: string;
    headRepositoryOwner?: { login?: string };
    headRepository?: { owner?: { login?: string } };
    isCrossRepository?: boolean;
    baseRefName?: string;
  } | undefined;
  const eventPull = payload.pull_request;
  const headOwner = pull?.headRepositoryOwner?.login ?? pull?.headRepository?.owner?.login;
  const branch = pull?.headRefName ?? eventPull?.head?.ref;
  const isCrossRepository = pull?.isCrossRepository === true
    || (Boolean(eventPull?.head?.repo?.full_name)
      && Boolean(payload.repository?.full_name)
      && eventPull?.head?.repo?.full_name !== payload.repository?.full_name);
  const canDevelop = Boolean(branch) && !isCrossRepository && branch!.startsWith('agent/issue-');
  return {
    kind: 'pull_request',
    issue,
    pull_request: Number(pull?.number ?? eventPull?.number ?? issue),
    branch: branch ?? `agent/issue-${issue}`,
    base: pull?.baseRefName ?? eventPull?.base?.ref ?? payload.repository?.default_branch,
    can_develop: canDevelop,
    reason: canDevelop
      ? undefined
      : `pull request head must be a same-repository agent/issue-* branch${headOwner ? ` owned by ${headOwner}` : ''}`,
  };
}

function writeOutputs(target: AgentTarget): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `kind=${target.kind}`,
    `issue=${target.issue}`,
    `branch=${target.branch}`,
    `pull_request=${target.pull_request ?? ''}`,
    `can_develop=${target.can_develop ? 'true' : 'false'}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const event = JSON.parse(readFileSync(options.event, 'utf8'));
  const pr = options.pr ? JSON.parse(readFileSync(options.pr, 'utf8')) : undefined;
  const target = resolveAgentTarget(event, pr);
  writeFileSync(options.out, `${JSON.stringify(target, null, 2)}\n`);
  writeOutputs(target);
  process.stdout.write(`agent-target=${target.kind}:${target.branch}\n`);
  if (!target.can_develop) process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
