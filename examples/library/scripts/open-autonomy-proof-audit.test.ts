import { describe, expect, test } from 'bun:test';
import { auditProofLedger } from './open-autonomy-proof-audit.js';

describe('open autonomy proof audit', () => {
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
