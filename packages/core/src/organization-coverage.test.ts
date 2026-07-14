import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  ORGANIZATION_AUDIT_RESIDUALS,
  ORGANIZATION_BASELINE_OBLIGATIONS,
  ORGANIZATION_P1_OBLIGATIONS,
  ORGANIZATION_P2_OBLIGATIONS,
  ORGANIZATION_SEMANTIC_COVERAGE,
} from './organization-coverage';

const publicSurfaceFiles = [
  'organization-ir.ts',
  'organization-profile.ts',
  'organization-substrate.ts',
  'organization-state.ts',
  'organization-compile.ts',
  'organization-modules.ts',
  'organization-canonical.ts',
  'organization-normalize.ts',
  'organization-compiler.ts',
];

function declaredInterfaceFields(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const file of publicSurfaceFiles) {
    const path = `packages/core/src/${file}`;
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      result.set(statement.name.text, statement.members
        .filter((member): member is ts.PropertySignature | ts.MethodSignature =>
          ts.isPropertySignature(member) || ts.isMethodSignature(member))
        .map((member) => member.name.getText(source))
        .sort());
    }
  }
  return result;
}

describe('B0 semantic coverage and residual accounting', () => {
  test('enumerates every own field of every exported Organization IR interface', () => {
    const declared = declaredInterfaceFields();
    const covered = new Map(ORGANIZATION_SEMANTIC_COVERAGE.map((item) => [item.interface, [...item.fields].sort()]));
    expect([...covered.keys()].sort()).toEqual([...declared.keys()].sort());
    for (const [interfaceName, fields] of declared) expect(covered.get(interfaceName)).toEqual(fields);
  });

  test('coverage entries have unique interfaces and fields plus an explicit semantic owner', () => {
    const interfaces = ORGANIZATION_SEMANTIC_COVERAGE.map((item) => item.interface);
    expect(new Set(interfaces).size).toBe(interfaces.length);
    for (const item of ORGANIZATION_SEMANTIC_COVERAGE) {
      expect(item.denotation.trim().length).toBeGreaterThan(0);
      expect(item.fields.length).toBeGreaterThan(0);
      expect(new Set(item.fields).size).toBe(item.fields.length);
      expect(item.owner).toMatch(/^(B0|P\d+)$/);
    }
  });

  test('has no untriaged residual and every residual id and finding is unique', () => {
    expect(ORGANIZATION_AUDIT_RESIDUALS.length).toBeGreaterThan(0);
    expect(new Set(ORGANIZATION_AUDIT_RESIDUALS.map((item) => item.id)).size).toBe(ORGANIZATION_AUDIT_RESIDUALS.length);
    expect(new Set(ORGANIZATION_AUDIT_RESIDUALS.map((item) => item.finding)).size).toBe(ORGANIZATION_AUDIT_RESIDUALS.length);
    for (const residual of ORGANIZATION_AUDIT_RESIDUALS) expect(residual.owner).toMatch(/^P(?:[1-9]|1[0-3])$/);
  });

  test('accounts for every formal B0 obligation and assigns every unresolved claim to a residual', () => {
    const audit = readFileSync('docs/ORGANIZATION-IR-LENS-AUDIT.md', 'utf8');
    const documented = [...audit.matchAll(/^\| (B0-[A-Z]+-\d+) /gm)].map((match) => match[1]).sort();
    const recorded = ORGANIZATION_BASELINE_OBLIGATIONS.map((item) => item.id).sort();
    expect(recorded).toEqual(documented);
    const residualIds = new Set(ORGANIZATION_AUDIT_RESIDUALS.map((item) => item.id));
    for (const obligation of ORGANIZATION_BASELINE_OBLIGATIONS) {
      if (obligation.disposition === 'unresolved') expect(residualIds.has(obligation.residual ?? '')).toBe(true);
      else expect(obligation.evidence?.trim().length).toBeGreaterThan(0);
    }
  });

  test('accounts for every formal P1 obligation with evidence and no unresolved disposition', () => {
    const audit = readFileSync('docs/ORGANIZATION-IR-LENS-AUDIT.md', 'utf8');
    const documented = [...audit.matchAll(/^\| (P1-[A-Z]+-\d+) /gm)].map((match) => match[1]).sort();
    expect(ORGANIZATION_P1_OBLIGATIONS.map((item) => item.id).sort()).toEqual(documented);
    for (const obligation of ORGANIZATION_P1_OBLIGATIONS) {
      expect(obligation.disposition).not.toBe('unresolved');
      expect(obligation.evidence?.trim().length).toBeGreaterThan(0);
    }
  });

  test('accounts for every formal P2 obligation with evidence and no unresolved disposition', () => {
    const audit = readFileSync('docs/ORGANIZATION-IR-LENS-AUDIT.md', 'utf8');
    const documented = [...audit.matchAll(/^\| (P2-[A-Z]+-\d+) /gm)].map((match) => match[1]).sort();
    expect(ORGANIZATION_P2_OBLIGATIONS.map((item) => item.id).sort()).toEqual(documented);
    for (const obligation of ORGANIZATION_P2_OBLIGATIONS) {
      expect(obligation.disposition).not.toBe('unresolved');
      expect(obligation.evidence?.trim().length).toBeGreaterThan(0);
    }
  });
});
