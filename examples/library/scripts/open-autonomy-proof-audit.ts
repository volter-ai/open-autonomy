#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { parseRoadmapItems } from './public-agent-planner.js';

export interface ProofAuditResult {
  schema: 'open-autonomy.proof-audit.v1';
  passed: boolean;
  proof_gates: Array<{ id: string; status: 'present' | 'missing' }>;
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
  const gates = parseRoadmapItems(roadmapText).map((item) => item.proof_gate);
  const proof_gates = gates.map((id) => ({
    id,
    status: ledgerText.includes(`\`${id}\``) && rowStatus(ledgerText, id) === 'done' ? 'present' as const : 'missing' as const,
  }));
  return {
    schema: 'open-autonomy.proof-audit.v1',
    passed: proof_gates.every((item) => item.status === 'present'),
    proof_gates,
  };
}

function rowStatus(text: string, id: string): string {
  const row = text.split(/\r?\n/).find((line) => line.includes(`\`${id}\``)) ?? '';
  return row.split('|').map((part) => part.trim()).at(-2) ?? '';
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
