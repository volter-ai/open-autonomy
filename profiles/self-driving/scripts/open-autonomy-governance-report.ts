#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { DecisionIndex } from './public-agent-decision-index.js';

export interface GovernanceReport {
  schema: 'open-autonomy.governance-report.v1';
  generated_at: string;
  issues_seen: number;
  decisions_seen: number;
  by_latest_decision: Record<string, number>;
  human_required: number;
  retry_related: number;
  open_prs_seen: number;
}

interface Options {
  index: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const index = value('--index');
  if (!index) usage();
  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
}

export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
  const byLatest: Record<string, number> = {};
  let humanRequired = 0;
  let retryRelated = 0;
  let openPrs = 0;
  for (const issue of index.issues) {
    const decision = issue.latest_decision?.decision ?? 'unknown';
    byLatest[decision] = (byLatest[decision] ?? 0) + 1;
    if (/human|required|blocked|escalat/i.test(decision) || /human|required|blocked|escalat/i.test(issue.latest_decision?.next_action ?? '')) {
      humanRequired += 1;
    }
    if (/retry|failure|budget/i.test(decision) || /retry|failure|budget/i.test(issue.latest_decision?.reason ?? '')) retryRelated += 1;
    if (issue.latest_pr) openPrs += 1;
  }
  return {
    schema: 'open-autonomy.governance-report.v1',
    generated_at: now.toISOString(),
    issues_seen: index.issues.length,
    decisions_seen: index.decisions,
    by_latest_decision: byLatest,
    human_required: humanRequired,
    retry_related: retryRelated,
    open_prs_seen: openPrs,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`governance-report=issues:${report.issues_seen} decisions:${report.decisions_seen}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
