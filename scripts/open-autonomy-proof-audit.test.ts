import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { auditProofLedger } from './open-autonomy-proof-audit.js';

const FIXTURE_DIR = '.agent-run/proof-audit-test';
const EMPTY_LEDGER = `${FIXTURE_DIR}/empty/TEST_RUNS.md`;
const LIVE_LEDGER = `${FIXTURE_DIR}/live/TEST_RUNS.md`;

describe('open autonomy proof audit', () => {
  beforeAll(() => {
    mkdirSync(`${FIXTURE_DIR}/empty`, { recursive: true });
    mkdirSync(`${FIXTURE_DIR}/live`, { recursive: true });
    writeFileSync(EMPTY_LEDGER, '# Test Runs\n\nUse this file as the live-run ledger.\n');
    writeFileSync(
      LIVE_LEDGER,
      '# Test Runs\n\n- operator-pause-resume: https://github.com/volter-ai/open-autonomy-testbed/actions/runs/12345678 (manual fixture)\n',
    );
  });

  afterAll(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  test('a live-run ledger only counts when it records at least one workflow run', () => {
    const roadmap = [
      'items:',
      '  - id: one',
      '    phase: 1',
      '    priority: high',
      '    status: active',
      '    title: One',
      '    proof_gate: gate-one',
      '    acceptance:',
      '      - done',
    ].join('\n');
    const empty = auditProofLedger(roadmap, `| \`gate-one\` | live testbed runs in \`${EMPTY_LEDGER}\` | done |`);
    expect(empty.passed).toBe(false);
    expect(empty.proof_gates[0]?.evidence).toHaveLength(0);
    const live = auditProofLedger(roadmap, `| \`gate-one\` | live testbed runs in \`${LIVE_LEDGER}\` | done |`);
    expect(live.passed).toBe(true);
    expect(live.proof_gates[0]?.evidence).toContain(LIVE_LEDGER);
  });


  test('passes only when every roadmap proof gate is done in the ledger', () => {
    const roadmap = [
      'items:',
      '  - id: one',
      '    phase: 1',
      '    priority: high',
      '    status: active',
      '    title: One',
      '    proof_gate: gate-one',
      '    acceptance:',
      '      - done',
    ].join('\n');
    const pass = auditProofLedger(roadmap, '| `gate-one` | `scripts/open-autonomy-proof-audit.ts` | done |');
    expect(pass.passed).toBe(true);
    expect(pass.proof_gates[0]?.evidence).toContain('scripts/open-autonomy-proof-audit.ts');
    const wrongStatus = auditProofLedger(roadmap, '| `gate-one` | `scripts/open-autonomy-proof-audit.ts` | missing |');
    expect(wrongStatus.passed).toBe(false);
    const noEvidence = auditProofLedger(roadmap, '| `gate-one` | copied sentence | done |');
    expect(noEvidence.passed).toBe(false);
  });
});
