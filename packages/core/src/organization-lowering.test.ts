import { describe, expect, test } from 'bun:test';
import type { ComponentManifestV2, FacetKind } from './organization-component';
import type { OrganizationIR } from './organization-ir';
import {
  composePreservationCertificates, emitExecutableArtifact, lowerControlToExecution,
  lowerExecutionToV1, lowerOrganizationToControl, lowerToExecutionFixedPoint, type PreservationCertificate,
} from './organization-lowering';
import { deriveAtomicObligations, validateDeploymentCandidate, type AssurancePolicy, type DeploymentCandidateV2 } from './organization-solver';

const evidence = { assurance: 'conformance-tested' as const, source: { uri: 'test://conformance' } };
function manifest(id: string, facets: Array<[string, FacetKind, string[]]>): ComponentManifestV2 {
  return {
    schema: 'autonomy.component.v2', id, version: '1', configuration: { id: `${id}.config`, version: '1' },
    facets: Object.fromEntries(facets.map(([key, facet, operations]) => [key, { facet, operations, interface: 'api', evidence }])),
    interfaces: { api: { id: 'api', version: '1', transport: 'function' } }, state: [],
    trust: [{ principal: id, zone: `${id}-zone`, enforcedBy: id, evidence }],
    failure: { detection: ['exit'], healthCriterion: 'process responds', recovery: ['restart'], evidence },
    topology: { mode: 'standalone', minimumInstances: 1, isolation: 'process', evidence },
  };
}
const manifests = {
  controller: manifest('controller', [['actor', 'actor', ['run', 'identity']]]),
  worker: manifest('worker', [['behavior', 'behavior', ['invoke']], ['execution', 'execution', ['launch']]]),
  secure: manifest('secure', [['behavior', 'behavior', ['invoke']], ['execution', 'execution', ['launch']], ['authority', 'authority', ['enforce']]]),
};
const policy: AssurancePolicy = { minimum: { low: 'asserted', medium: 'asserted', high: 'conformance-tested', critical: 'conformance-tested' }, allowApproximation: false, acceptedAssumptions: [] };
const organization = (): OrganizationIR => ({ schema: 'autonomy.organization.v2', name: 'lowering', behaviors: { code: { kind: 'skill', inline: { task: 'code' } } }, actors: { coder: { kind: 'agent', behaviors: ['code'] } } });
function candidate(worker: 'worker' | 'secure'): DeploymentCandidateV2 {
  const composition = { instances: { controller: { manifest: 'controller' }, [worker]: { manifest: worker } }, authorities: {} };
  return validateDeploymentCandidate(deriveAtomicObligations(organization()), composition, manifests, {}, policy);
}

describe('P8 organization to control lowering', () => {
  test('requires a compatible candidate and accounts for every atomic obligation with provenance', () => {
    const good = lowerOrganizationToControl(organization(), candidate('worker'));
    expect(good.errors).toEqual([]);
    expect(good.output?.schema).toBe('autonomy.control.v1');
    expect(good.certificate?.dispositions.map((item) => item.obligation).sort()).toEqual(deriveAtomicObligations(organization()).map((item) => item.id).sort());
    expect(good.sourceMap.every((relation) => relation.sources.length > 0)).toBe(true);
    const incomplete = candidate('worker'); incomplete.ledger.obligations.pop();
    expect(lowerOrganizationToControl(organization(), incomplete).errors[0]).toContain('deployment ledger omits');
  });

  test('keeps runtime endpoints, credentials, isolation, and rendering below Organization IR', () => {
    const source = organization();
    const control = lowerOrganizationToControl(source, candidate('worker')).output!;
    const result = lowerControlToExecution(control, candidate('worker'), { runtimes: { coder: { provider: 'worker', runtime: 'codex-cli', endpoint: 'unix:///worker', isolation: 'container', credentialRefs: ['repo-token'], instructionRenderer: 'chat-v1' } } });
    expect(result.output?.steps[0]).toMatchObject({ endpoint: 'unix:///worker', isolation: 'container', credentialRefs: ['repo-token'], instructionRenderer: 'chat-v1' });
    expect(JSON.stringify(source)).not.toContain('repo-token');
    expect(result.newObligations.map((item) => item.id)).toContain('obl:execution.coder:code.credential.repo-token');
  });
});

describe('P8 preservation composition and solver feedback', () => {
  test('composes certificates only across aligned levels, assumptions, and observations', () => {
    const first = lowerOrganizationToControl(organization(), candidate('worker')).certificate!;
    const control = lowerOrganizationToControl(organization(), candidate('worker')).output!;
    const second = lowerControlToExecution(control, candidate('worker'), { runtimes: { coder: { provider: 'worker', runtime: 'cli', isolation: 'process' } } }).certificate!;
    expect(composePreservationCertificates(first, second).errors).toEqual([]);
    const broken: PreservationCertificate = { ...second, assumptions: [...second.assumptions, 'missing-guarantee'] };
    expect(composePreservationCertificates(first, broken).errors).toContain("undischarged intermediate assumption 'missing-guarantee'");
    expect(composePreservationCertificates(first, { ...second, from: 'invocation' }).errors[0]).toContain('certificate level mismatch');
    expect(composePreservationCertificates(first, { ...second, observationProjections: [] }).errors[0]).toContain('is not composed');
  });

  test('backtracks when feasibility lowering creates an unsupported credential obligation', () => {
    const result = lowerToExecutionFixedPoint(organization(), [candidate('worker'), candidate('secure')], manifests, {}, policy, (selected) => {
      const provider = selected.composition.instances.secure ? 'secure' : 'worker';
      return { runtimes: { coder: { provider, runtime: 'cli', isolation: 'process', credentialRefs: ['repo-token'] } } };
    });
    expect(result.errors).toEqual([]);
    expect(result.candidate?.composition.instances.secure).toBeDefined();
    expect(result.obligations.some((item) => item.id.includes('credential.repo-token'))).toBe(true);
    expect(emitExecutableArtifact(result).errors).toEqual([]);
  });

  test('never emits from a provisional candidate whose new obligations remain open', () => {
    const result = lowerToExecutionFixedPoint(organization(), [candidate('worker')], manifests, {}, policy, () => ({ runtimes: { coder: { provider: 'worker', runtime: 'cli', isolation: 'process', credentialRefs: ['repo-token'] } } }));
    expect(result.execution).toBeUndefined();
    expect(result.errors[0]).toContain('failed lowering obligations');
    expect(emitExecutableArtifact(result).errors).toEqual(['lowering fixed point is not closed']);
  });

  test('mechanically lowers a bounded supported subset to v1 and rejects unsupported actor multiplicity', () => {
    const source = organization();
    source.behaviors!.code = { kind: 'skill', source: { uri: './skills/code/SKILL.md' } };
    source.actors.coder.activation = [{ kind: 'manual' }];
    const staged = lowerToExecutionFixedPoint(source, [validateDeploymentCandidate(deriveAtomicObligations(source), { instances: { controller: { manifest: 'controller' }, worker: { manifest: 'worker' } }, authorities: {} }, manifests, {}, policy)], manifests, {}, policy,
      () => ({ runtimes: { coder: { provider: 'worker', runtime: 'cli', isolation: 'process' } } }));
    const lowered = lowerExecutionToV1(source, staged.execution!, { targets: ['local'], policy: { box: {} } });
    expect(lowered.errors).toEqual([]);
    expect(lowered.output?.agents.coder).toMatchObject({ behavior: './skills/code/SKILL.md', triggers: [{ dispatch: true }] });
    expect(lowered.certificate?.dispositions.every((item) => item.disposition === 'preserved')).toBe(true);
    source.behaviors!.review = { kind: 'skill', source: { uri: './skills/review/SKILL.md' } };
    source.actors.coder.behaviors.push('review');
    expect(lowerExecutionToV1(source, staged.execution!, { targets: ['local'], policy: { box: {} } }).errors).toContain("v1 cannot represent actor 'coder' with 2 behaviors");
  });
});
