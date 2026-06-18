#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseRoadmapItems } from './public-agent-planner.js';

export interface ProofAuditResult {
  schema: 'open-autonomy.proof-audit.v1';
  passed: boolean;
  proof_gates: Array<{ id: string; status: 'present' | 'missing'; evidence: string[] }>;
}

interface Options {
  roadmap: string;
  ledger: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-proof-audit.ts --roadmap .open-autonomy/roadmap.yml --ledger docs/PROOF_LEDGER.md --out proof-audit.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const roadmap = value('--roadmap');
  const ledger = value('--ledger');
  if (!roadmap || !ledger) usage();
  return { roadmap, ledger, out: value('--out') ?? '.agent-run/proof-audit.json' };
}

export function auditProofLedger(roadmapText: string, ledgerText: string): ProofAuditResult {
  // Proposed items are aspirational roadmap candidates awaiting human ratification. They carry
  // no proven evidence yet, so they are exempt from the ledger audit until a human promotes them
  // to active work. Every non-proposed item must still cite real evidence.
  const gates = parseRoadmapItems(roadmapText)
    .filter((item) => item.status !== 'proposed')
    .map((item) => item.proof_gate);
  const proof_gates = gates.map((id) => {
    const row = ledgerRow(ledgerText, id);
    const evidence = row ? validatedEvidence(row.evidence) : [];
    return {
      id,
      status: row?.status === 'done' && evidence.length > 0 ? 'present' as const : 'missing' as const,
      evidence,
    };
  });
  return {
    schema: 'open-autonomy.proof-audit.v1',
    passed: proof_gates.every((item) => item.status === 'present'),
    proof_gates,
  };
}

function ledgerRow(text: string, id: string): { evidence: string; status: string } | undefined {
  const row = text.split(/\r?\n/).find((line) => line.includes(`\`${id}\``)) ?? '';
  const cells = row.split('|').map((part) => part.trim());
  if (cells.length < 5) return undefined;
  return { evidence: cells.at(-3) ?? '', status: cells.at(-2) ?? '' };
}

const RUN_URL_PATTERN = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+/;

function validatedEvidence(text: string): string[] {
  const evidence = new Set<string>();
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const value = match[1] ?? '';
    if (isRunId(value)) {
      evidence.add(value);
      continue;
    }
    if (!isExistingPath(value)) continue;
    // A live-run ledger only counts as evidence when it actually records at least one
    // workflow run. An empty TEST_RUNS.md template must not pass on a file-exists technicality.
    if (isLiveRunLedger(value) && !ledgerHasRunRecord(value)) continue;
    evidence.add(value);
  }
  for (const match of text.matchAll(new RegExp(RUN_URL_PATTERN, 'g'))) {
    evidence.add(match[0] ?? '');
  }
  return Array.from(evidence).sort();
}

function isLiveRunLedger(value: string): boolean {
  return value.split('/').at(-1) === 'TEST_RUNS.md';
}

function ledgerHasRunRecord(value: string): boolean {
  try {
    return RUN_URL_PATTERN.test(readFileSync(value, 'utf8'));
  } catch {
    return false;
  }
}

function isExistingPath(value: string): boolean {
  if (!value.includes('/') && !value.startsWith('.')) return false;
  if (value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) return false;
  return existsSync(value);
}

function isRunId(value: string): boolean {
  return /^\d{8,}$/.test(value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = auditProofLedger(readFileSync(options.roadmap, 'utf8'), readFileSync(options.ledger, 'utf8'));
  writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`proof-audit=${result.passed ? 'pass' : 'fail'}\n`);
  if (!result.passed) process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
