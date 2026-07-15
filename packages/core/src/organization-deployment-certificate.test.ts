import { describe, expect, test } from 'bun:test';
import { verifyDeploymentPlanningCertificate, type DeploymentPlanningCertificate } from './organization-deployment-certificate';

const valid = (): DeploymentPlanningCertificate => ({
  schema: 'autonomy.deployment-planning-certificate.v1', generatedAt: '2026-07-15T00:00:00Z',
  search: { completeness: 'finite-exhaustive', domainCardinality: 2, explored: 2 },
  hardConstraints: ['region:us', 'capacity:10'], sourceObligations: ['store'],
  objectiveDimensions: [{ key: 'cost', direction: 'minimize', unit: 'USD', horizon: 'month' }, { key: 'capacity', direction: 'maximize', unit: 'request', horizon: 'second' }],
  knownAdapters: ['storage-adapter'], knownMigrations: ['schema-v2'],
  evidence: [{ id: 'observed', assurance: 'live-observed', observedAt: '2026-07-14T00:00:00Z', expiresAt: '2026-07-16T00:00:00Z' }],
  frontier: [{ id: 'balanced', hardConstraints: [
    { constraint: 'region:us', satisfied: true, evidence: ['observed'] }, { constraint: 'capacity:10', satisfied: true, evidence: ['observed'] },
  ], objectives: {
    cost: { value: 10, unit: 'USD', horizon: 'month', uncertainty: { kind: 'exact' }, evidence: 'observed' },
    capacity: { value: 20, unit: 'request', horizon: 'second', uncertainty: { kind: 'bounded', lower: 15, upper: 25 }, evidence: 'observed' },
  }, adapters: ['storage-adapter'], migrations: ['schema-v2'],
  adapterWitnesses: [{ artifact: 'storage-adapter', obligations: ['store'], evidence: ['observed'] }],
  migrationWitnesses: [{ artifact: 'schema-v2', obligations: ['store'], evidence: ['observed'] }] }],
});

describe('independent deployment planning certificate verification', () => {
  test('accepts a complete, dimensioned, fresh certificate', () => expect(verifyDeploymentPlanningCertificate(valid())).toEqual({ valid: true, errors: [] }));

  test('rejects incomplete search and missing hard witnesses', () => {
    const certificate = valid(); certificate.search.explored = 1; certificate.frontier[0]!.hardConstraints.pop();
    const result = verifyDeploymentPlanningCertificate(certificate);
    expect(result.errors).toContain('finite-exhaustive search must explore the exact domain cardinality');
    expect(result.errors.some((item) => item.includes('exact hard-constraint inventory'))).toBe(true);
  });

  test('rejects unit substitution, stale evidence, and unwitnessed artifacts', () => {
    const certificate = valid(); certificate.frontier[0]!.objectives.cost!.unit = 'request'; certificate.evidence[0]!.expiresAt = '2026-07-01T00:00:00Z'; certificate.frontier[0]!.adapterWitnesses = [];
    const result = verifyDeploymentPlanningCertificate(certificate);
    expect(result.errors.some((item) => item.includes('changes its unit or horizon'))).toBe(true);
    expect(result.errors).toContain("evidence 'observed' is stale");
    expect(result.errors.some((item) => item.includes('exact selected adapter inventory'))).toBe(true);
  });

  test('rejects asserted evidence without scoped acceptance and dominated frontier members', () => {
    const certificate = valid(); certificate.evidence[0] = { id: 'observed', assurance: 'asserted', observedAt: '2026-07-14T00:00:00Z' };
    const dominated = structuredClone(certificate.frontier[0]!); dominated.id = 'dominated'; dominated.objectives.cost!.value = 11; dominated.objectives.capacity!.value = 19; certificate.frontier.push(dominated);
    const result = verifyDeploymentPlanningCertificate(certificate);
    expect(result.errors.some((item) => item.includes('lacks scoped acceptance'))).toBe(true);
    expect(result.errors).toContain("frontier candidate 'dominated' is dominated by 'balanced'");
  });
});
