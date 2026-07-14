import { describe, expect, test } from 'bun:test';
import { INITIAL_COMPONENT_CATALOG } from './organization-component-catalog';
import type { ComponentManifestV2 } from './organization-component';
import type { OrganizationIR } from './organization-ir';
import {
  deriveAtomicObligations, solveDeploymentV2, validateDeploymentCandidate,
  type AssurancePolicy,
} from './organization-solver';

const organization = (): OrganizationIR => ({
  schema: 'autonomy.organization.v2', name: 'solver-test',
  behaviors: { code: { kind: 'skill', inline: { procedure: 'change code' } } },
  actors: { coder: { kind: 'agent', behaviors: ['code'] } },
});
const acceptingPolicy = (catalog: Record<string, ComponentManifestV2>): AssurancePolicy => ({
  minimum: { low: 'asserted', medium: 'asserted', high: 'asserted', critical: 'asserted' }, allowApproximation: false, asOf: '2026-07-14',
  acceptedAssumptions: Object.values(catalog).flatMap((manifest) => Object.keys(manifest.facets).map((facet) => ({
    assumption: `trust:${manifest.id}:${facet}:asserted`, acceptedBy: 'operator', scope: '*', untilVersion: manifest.version,
  }))),
});

describe('P7 atomic obligation derivation and assurance', () => {
  test('derives deterministic obligations from every semantic leaf plus durable identities', () => {
    const first = deriveAtomicObligations(organization());
    const second = deriveAtomicObligations({ ...organization(), actors: structuredClone(organization().actors), behaviors: structuredClone(organization().behaviors) });
    expect(first).toEqual(second);
    expect(first.map((item) => item.path)).toContain('behaviors.code.inline.procedure');
    expect(first.map((item) => item.path)).toContain('actors.coder.behaviors.0');
    expect(first.map((item) => item.id)).toContain('obl:actors.coder.identity');
  });

  test('does not promote asserted claims without an identified scoped acceptance', () => {
    const composition = { instances: { hermes: { manifest: 'hermes-agent' }, worker: { manifest: 'coding-worker-runtime' } }, authorities: { work: 'hermes', attempt: 'worker' } };
    const rejected = validateDeploymentCandidate(deriveAtomicObligations(organization()), composition, INITIAL_COMPONENT_CATALOG, {}, { ...acceptingPolicy(INITIAL_COMPONENT_CATALOG), acceptedAssumptions: [] });
    expect(rejected.ledger.unresolved.length).toBeGreaterThan(0);
    const accepted = validateDeploymentCandidate(deriveAtomicObligations(organization()), composition, INITIAL_COMPONENT_CATALOG, {}, acceptingPolicy(INITIAL_COMPONENT_CATALOG));
    expect(accepted.ledger.unresolved).toEqual([]);
    expect(accepted.ledger.witnesses.some((witness) => witness.assumptions[0]?.startsWith('trust:'))).toBe(true);
  });
});

describe('P7 constructive finite solver', () => {
  test('constructs candidates, independently revalidates them, and orders objectives deterministically', () => {
    const policy = acceptingPolicy(INITIAL_COMPONENT_CATALOG);
    const first = solveDeploymentV2(organization(), INITIAL_COMPONENT_CATALOG, {}, policy, { completeness: 'finite-exhaustive', maxCandidates: 1000 });
    const second = solveDeploymentV2(organization(), Object.fromEntries(Object.entries(INITIAL_COMPONENT_CATALOG).reverse()), {}, policy, { completeness: 'finite-exhaustive', maxCandidates: 1000 });
    expect(first.status).toBe('compatible');
    expect(first.complete).toBe(true);
    expect(first.candidates.map((candidate) => candidate.objective)).toEqual(second.candidates.map((candidate) => candidate.objective));
    for (const candidate of first.candidates) expect(validateDeploymentCandidate(candidate.ledger.obligations, candidate.composition, INITIAL_COMPONENT_CATALOG, {}, policy).ledger.unresolved).toEqual([]);
  });

  test('reports bounded exhaustion as exhaustion, never incompatibility', () => {
    const result = solveDeploymentV2(organization(), INITIAL_COMPONENT_CATALOG, {}, acceptingPolicy(INITIAL_COMPONENT_CATALOG), { completeness: 'bounded-heuristic', maxCandidates: 0 });
    expect(result).toMatchObject({ status: 'exhausted', complete: false, explored: 0, unsatisfiedCore: [], coreMinimality: 'none' });
  });

  test('returns a checkable atomic core when a finite registry cannot meet assurance', () => {
    const policy: AssurancePolicy = { minimum: { low: 'conformance-tested', medium: 'conformance-tested', high: 'conformance-tested', critical: 'live-observed' }, allowApproximation: false, acceptedAssumptions: [] };
    const result = solveDeploymentV2(organization(), INITIAL_COMPONENT_CATALOG, {}, policy, { completeness: 'finite-exhaustive', maxCandidates: 1000 });
    expect(result.status).toBe('incompatible');
    expect(result.complete).toBe(true);
    expect(result.unsatisfiedCore).toHaveLength(1);
    expect(result.coreMinimality).toBe('atomic-witness');
    expect(deriveAtomicObligations(organization()).some((item) => item.id === result.unsatisfiedCore[0])).toBe(true);
  });

  test('rejects a globally incoherent manual candidate even when every facet is pointwise present', () => {
    const org = organization();
    org.workTypes = { change: { lifecycle: { initial: 'ready', terminal: ['done'], states: { ready: {}, done: {} }, transitions: [{ from: 'ready', to: 'done', event: 'complete' }] } } };
    const composition = { instances: { hermes: { manifest: 'hermes-agent' }, store: { manifest: 'durable-work-store' }, worker: { manifest: 'coding-worker-runtime' } }, authorities: { work: 'hermes' } };
    const candidate = validateDeploymentCandidate(deriveAtomicObligations(org), composition, INITIAL_COMPONENT_CATALOG, {}, acceptingPolicy(INITIAL_COMPONENT_CATALOG));
    expect(candidate.ledger.witnesses.find((item) => item.obligation === 'global:composition')?.errors[0]).toContain('overlapping authoritative owners');
  });
});
