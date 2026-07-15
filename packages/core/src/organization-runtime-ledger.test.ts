import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateCheckpointTransition, validateRuntimeLedger, type RuntimeLedgerCorpus } from './organization-runtime-ledger';

const audit = readFileSync('docs/ORGANIZATION-RUNTIME-LENS-AUDIT.md', 'utf8');
const expected = [...audit.matchAll(/^\| (R\d+-[A-Z]+-\d+) /gm)].map((match) => match[1]!);
const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/baseline.json', 'utf8')) as RuntimeLedgerCorpus;
const manifest = JSON.parse(readFileSync('docs/organization-runtime-punchlist.json', 'utf8')) as { items: Array<{ id: string; dependsOn: string[] }> };
const baseline = JSON.parse(readFileSync('docs/runtime-ledgers/baseline-manifest.json', 'utf8')) as { semanticInputs: Array<{ path: string; digest: string }>; fixtureCorpus: Array<{ path: string; digest: string }> };
const closure = JSON.parse(readFileSync('docs/runtime-ledgers/r0-closure.json', 'utf8')) as RuntimeLedgerCorpus;
const r1Closure = JSON.parse(readFileSync('docs/runtime-ledgers/r1-closure.json', 'utf8')) as RuntimeLedgerCorpus;
const r2Closure = JSON.parse(readFileSync('docs/runtime-ledgers/r2-closure.json', 'utf8')) as RuntimeLedgerCorpus;
const r3Closure = JSON.parse(readFileSync('docs/runtime-ledgers/r3-closure.json', 'utf8')) as RuntimeLedgerCorpus;

describe('runtime proof-accounting ledger', () => {
  test('seeds every formal runtime obligation exactly once at unknown', () => {
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.obligationLedger).toHaveLength(121);
    expect(corpus.obligationLedger.every((entry) => entry.assurance === 'unknown' && entry.disposition === 'unresolved')).toBe(true);
  });

  test('rejects unknown and duplicate obligations, missing provenance, and premature closure', () => {
    const broken = structuredClone(corpus);
    broken.obligationLedger[0]!.id = 'R0-FAKE-1';
    broken.obligationLedger[1]!.id = broken.obligationLedger[2]!.id;
    broken.evidenceLedger.push({ id: 'bad', kind: 'artifact', uri: '', producer: '' });
    broken.checkpointStateLedger[0]!.status = 'complete';
    const codes = validateRuntimeLedger(broken, expected, manifest.items).map((error) => error.code);
    expect(codes).toContain('obligation.unknown');
    expect(codes).toContain('obligation.duplicate');
    expect(codes).toContain('obligation.missing');
    expect(codes).toContain('evidence.provenance');
    expect(codes).toContain('checkpoint.unresolved-obligation');
  });

  test('rejects the minimal no-evidence, invalid-enum, and dependency-deletion closure exploits', () => {
    const broken = structuredClone(corpus);
    for (const entry of broken.obligationLedger.filter((entry) => entry.checkpoint === 'R0')) {
      entry.disposition = 'preserved'; entry.assurance = 'assumed';
    }
    broken.checkpointStateLedger[0]!.status = 'complete';
    broken.checkpointStateLedger[0]!.dependsOn = [];
    (broken.obligationLedger[0] as { assurance: string }).assurance = 'bogus';
    const codes = validateRuntimeLedger(broken, expected, manifest.items).map((error) => error.code);
    expect(codes).toContain('obligation.invalid-assurance');
    expect(codes).toContain('checkpoint.unresolved-obligation');
    expect(codes).toContain('checkpoint.missing-coverage');

    const downstream = structuredClone(corpus);
    downstream.checkpointStateLedger[1]!.dependsOn = [];
    expect(validateRuntimeLedger(downstream, expected, manifest.items).map((error) => error.code)).toContain('checkpoint.dependencies');
  });

  test('permits only the declared checkpoint lifecycle', () => {
    expect(validateCheckpointTransition('blocked', 'ready')).toBe(true);
    expect(validateCheckpointTransition('ready', 'complete')).toBe(false);
    expect(validateCheckpointTransition('complete', 'in-progress')).toBe(false);
  });

  test('freezes resolvable semantic inputs and the executable fixture corpus', () => {
    expect(baseline.semanticInputs.length).toBeGreaterThanOrEqual(6);
    expect(baseline.fixtureCorpus.length).toBeGreaterThanOrEqual(20);
    for (const input of [...baseline.semanticInputs, ...baseline.fixtureCorpus]) {
      expect(input.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(readFileSync(input.path).byteLength).toBeGreaterThan(0);
    }
  });

  test('closes R0 only with evidence and opens exactly its R1 successor', () => {
    expect(validateRuntimeLedger(closure, expected, manifest.items)).toEqual([]);
    expect(closure.checkpointStateLedger.find((entry) => entry.id === 'R0')?.status).toBe('complete');
    expect(closure.checkpointStateLedger.find((entry) => entry.id === 'R1')?.status).toBe('ready');
    expect(closure.obligationLedger.filter((entry) => entry.checkpoint === 'R0').every((entry) => entry.evidence.length > 0 && entry.assurance !== 'unknown')).toBe(true);
  });

  test('closes R1 only after independent semantic evidence and opens R2', () => {
    expect(validateRuntimeLedger(r1Closure, expected, manifest.items)).toEqual([]);
    expect(r1Closure.checkpointStateLedger.find((entry) => entry.id === 'R1')?.status).toBe('complete');
    expect(r1Closure.checkpointStateLedger.find((entry) => entry.id === 'R2')?.status).toBe('ready');
    expect(r1Closure.obligationLedger.filter((entry) => entry.checkpoint === 'R1')
      .every((entry) => entry.evidence.includes('ev-r1-external-review') && entry.assurance === 'property-tested')).toBe(true);
  });

  test('closes R2 only after adversarial package evidence and opens R3', () => {
    expect(validateRuntimeLedger(r2Closure, expected, manifest.items)).toEqual([]);
    expect(r2Closure.checkpointStateLedger.find((entry) => entry.id === 'R2')?.status).toBe('complete');
    expect(r2Closure.checkpointStateLedger.find((entry) => entry.id === 'R3')?.status).toBe('ready');
    expect(r2Closure.obligationLedger.filter((entry) => entry.checkpoint === 'R2')
      .every((entry) => entry.evidence.includes('ev-r2-external-review') && entry.assurance === 'property-tested')).toBe(true);
  });

  test('closes R3 only after independently reviewed TCK evidence and opens R4', () => {
    expect(validateRuntimeLedger(r3Closure, expected, manifest.items)).toEqual([]);
    expect(r3Closure.checkpointStateLedger.find((entry) => entry.id === 'R3')?.status).toBe('complete');
    expect(r3Closure.checkpointStateLedger.find((entry) => entry.id === 'R4')?.status).toBe('ready');
    expect(r3Closure.obligationLedger.filter((entry) => entry.checkpoint === 'R3')
      .every((entry) => entry.evidence.includes('ev-r3-review') && entry.assurance === 'property-tested')).toBe(true);
  });

  test('closes R4 only after clean-room differential evidence and opens R5', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r4-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R4')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R5')?.status).toBe('ready');
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R4').every((entry) => entry.disposition === 'preserved' && entry.evidence.length > 0)).toBe(true);
  });

  test('closes R5 only after adversarial compiler API evidence and opens R6', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r5-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R5')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R6')?.status).toBe('ready');
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R5').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r5-review'))).toBe(true);
  });

  test('closes R6 only after SDK-only provider and retained-accounting evidence and opens R7', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r6-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R6')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R7')?.status).toBe('ready');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R6').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r6-review'))).toBe(true);
  });

  test('closes R7 only after independently replayed planning evidence and opens R8', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r7-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R7')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R8')?.status).toBe('ready');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R7').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r7-review'))).toBe(true);
  });

  test('closes R8 only after reproducible supply-chain and live-provenance evidence and opens R9', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r8-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R8')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R9')?.status).toBe('ready');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R8').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r8-review'))).toBe(true);
  });

  test('closes R9 only after replayed migration, reversible cutover, and repository dogfood evidence and opens R10', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r9-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R9')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R10')?.status).toBe('ready');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R9').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r9-review'))).toBe(true);
  });

  test('closes R10 only after authority, distribution, custody, and skeptical-review evidence and opens every dependency-ready successor', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r10-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R10')?.status).toBe('complete');
    expect(['R11','R12','R13','R14'].every(id => corpus.checkpointStateLedger.find(entry => entry.id === id)?.status === 'ready')).toBe(true);
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R10').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r10-review'))).toBe(true);
  });

  test('closes independently ready R14 with telemetry, refinement, version-pin, and review evidence', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r14-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R14')?.status).toBe('complete');
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R11')?.status).toBe('ready');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R14').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r14-review'))).toBe(true);
  });

  test('closes R13 only after exact native interoperation and adversarial review evidence', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r13-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R13')?.status).toBe('complete');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R13').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r13-review'))).toBe(true);
  });

  test('closes R17 only after serializable registry and adversarial recovery evidence', () => {
    const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r17-closure.json','utf8')) as RuntimeLedgerCorpus;
    expect(validateRuntimeLedger(corpus, expected, manifest.items)).toEqual([]);
    expect(corpus.checkpointStateLedger.find((entry) => entry.id === 'R17')?.status).toBe('complete');
    expect(corpus.residualLedger).toEqual([]);
    expect(corpus.obligationLedger.filter((entry) => entry.checkpoint === 'R17').every((entry) => entry.assurance === 'property-tested' && entry.evidence.includes('ev-r17-review'))).toBe(true);
  });
});
