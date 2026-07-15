import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseOrganizationIr } from './organization-ir-yaml';

const spec = readFileSync('docs/ORGANIZATION-IR-SPEC.md', 'utf8');

describe('R1 normative Organization IR specification', () => {
  test('publishes every required semantic domain and explicit normative/informative boundaries', () => {
    for (const term of ['MUST', 'denotation', 'Defaults and absence', 'Identity, equality, and equivalence',
      'Composition algebra', 'Events and state', 'Versions, extensions, and migration', 'Lowering and assurance',
      'Unsupported and implementation-defined domains', 'Informative architecture guidance']) expect(spec).toContain(term);
    expect(spec).toContain('ORGANIZATION-IR-FIELD-SEMANTICS.md');
    expect(spec).toContain('organization-ir.ts');
  });

  test('keeps the generated field appendix byte-stable', () => {
    const before = readFileSync('docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', 'utf8');
    const result = spawnSync('bun', ['scripts/generate-organization-field-semantics.ts'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(readFileSync('docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', 'utf8')).toBe(before);
  });

  test('executes the positive and wrong-sort negative examples', () => {
    expect(() => parseOrganizationIr(readFileSync('docs/examples/autonomous-coding-org.v2.yml', 'utf8'))).not.toThrow();
    expect(() => parseOrganizationIr(readFileSync('docs/examples/invalid/wrong-sort-reference.v2.yml', 'utf8'))).toThrow("unknown behavior 'implement'");
  });
});
