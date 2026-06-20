#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDecision, type AgentDecision } from './public-agent-decision.js';

export interface DecisionIndexSubject {
  issue: number;
  latest_decision?: AgentDecision;
  latest_by_stage: Record<string, AgentDecision>;
  latest_pr?: number;
  latest_next_action?: string;
  latest_risk?: string;
  updated_at?: string;
}

export interface DecisionIndex {
  schema: 'open-autonomy.decision-index.v1';
  generated_at: string;
  decisions: number;
  issues: DecisionIndexSubject[];
}

interface Options {
  sessionsDir: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes('--help')) usage();
  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
}

export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
  const byIssue = new Map<number, DecisionIndexSubject>();
  const sorted = [...decisions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const decision of sorted) {
    const subject = byIssue.get(decision.issue) ?? {
      issue: decision.issue,
      latest_by_stage: {},
    };
    subject.latest_decision = decision;
    subject.latest_by_stage[decision.stage] = decision;
    subject.latest_pr = decision.pr ?? subject.latest_pr;
    subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
    subject.latest_risk = decision.risk ?? subject.latest_risk;
    subject.updated_at = decision.created_at;
    byIssue.set(decision.issue, subject);
  }
  return {
    schema: 'open-autonomy.decision-index.v1',
    generated_at: now.toISOString(),
    decisions: sorted.length,
    issues: [...byIssue.values()].sort((a, b) => b.issue - a.issue),
  };
}

export function readDecisionFiles(root: string): AgentDecision[] {
  const files = walk(root).filter((path) => /\/decisions\/[^/]+\.json$/.test(path));
  const decisions: AgentDecision[] = [];
  for (const file of files) {
    try {
      decisions.push(validateDecision(JSON.parse(readFileSync(file, 'utf8'))));
    } catch {
      continue;
    }
  }
  return decisions;
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write(`decision-index=${index.decisions}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
