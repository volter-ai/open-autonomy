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
    const pass = auditProofLedger(roadmap, '| `gate-one` | test | done |');
    expect(pass.passed).toBe(true);
    const fail = auditProofLedger(roadmap, '| `gate-one` | test | missing |');
    expect(fail.passed).toBe(false);
  });
});
