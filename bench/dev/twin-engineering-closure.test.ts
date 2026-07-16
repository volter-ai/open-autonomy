import { describe, expect, test } from 'bun:test';
import { INITIAL_COMPONENT_CATALOG } from '@open-autonomy/core';
import { twinEngineeringExternalClaims, validateTwinEngineeringClosure, type TwinEngineeringClosureBundle } from './twin-engineering-closure';
import type { BenchWorld } from './bench-world';

function world(id: 'hermes-agent' | 'paperclip'): BenchWorld {
  return {
    schema: 'open-autonomy.bench-world.v1',
    target: {
      kind: 'compiled-substrate', id, organizationDigest: 'sha256:unchanged-org', deploymentDigest: `sha256:${id}`,
      composition: { instances: { controller: { manifest: id } }, authorities: id === 'paperclip'
        ? { work: 'controller', budget: 'controller' } : { work: 'controller' } },
      artifacts: [{ role: 'native-deployment', uri: `bundle://${id}`, digest: `sha256:${id}-artifact` }],
    },
    services: [{ kind: 'service', id: 'slack', contract: { id: 'slack-api', version: '2026-07' }, required: true, endpoint: 'https://slack.com/api' }],
    serviceBindings: [{ provider: 'controller', service: 'slack', interface: id === 'hermes-agent' ? 'hermes-gateway' : 'paperclip-api' }],
    twins: [{ kind: 'digital-twin', id: `volter-${id}`, service: 'slack', contract: { id: 'slack-api', version: '2026-07' },
      implementation: { package: '@volter/twin-slack', version: '0.1.0', revision: 'git:abc123' },
      scenario: { id: 'matched-r24', digest: `sha256:${'b'.repeat(64)}` }, coveredOperations: ['events.message', 'chat.postMessage'],
      knownGaps: [], conformanceEvidence: ['test://slack-contract'], }], simulators: [],
  };
}

function bundle(): TwinEngineeringClosureBundle {
  return {
    schema: 'open-autonomy.twin-engineering-closure.v1', profile: 'twin-conformant-engineering', checkpoints: ['R24'],
    worlds: ['hermes-agent', 'paperclip'].map((id) => ({ id, world: world(id as 'hermes-agent' | 'paperclip'),
      serviceRealizations: [{ service: 'slack', mode: 'digital-twin', evidence: ['test://slack-contract'] }],
      substrateEvidence: [`trace://${id}`], })),
    excludedExternalClaims: twinEngineeringExternalClaims(), residuals: [],
  };
}

describe('twin-conformant engineering closure', () => {
  test('accepts actual matched substrates in one pinned service-twin world', () => {
    expect(validateTwinEngineeringClosure(bundle(), INITIAL_COMPONENT_CATALOG)).toEqual([]);
  });

  test('rejects replacing the second substrate with another Hermes cell', () => {
    const value = bundle(); value.worlds[1]!.world = world('hermes-agent');
    expect(validateTwinEngineeringClosure(value, INITIAL_COMPONENT_CATALOG)).toContain('R24 requires actual Hermes and Paperclip compiled-substrate cells');
  });

  test('rejects claim inflation and unresolved engineering residuals', () => {
    const value = bundle(); value.excludedExternalClaims = []; value.residuals = ['unowned fault'];
    const errors = validateTwinEngineeringClosure(value, INITIAL_COMPONENT_CATALOG);
    expect(errors).toContain('external claim must remain excluded: real-human-usability-and-accessibility');
    expect(errors).toContain('engineering closure has untriaged residuals');
  });

  test('rejects a declared twin realization without its pinned twin', () => {
    const value = bundle(); value.worlds[0]!.world.twins = [];
    expect(validateTwinEngineeringClosure(value, INITIAL_COMPONENT_CATALOG)).toContain("hermes-agent: service 'slack' declares twin mode without exactly one pinned twin");
  });
});
