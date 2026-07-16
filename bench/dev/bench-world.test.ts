import { describe, expect, test } from 'bun:test';
import { INITIAL_COMPONENT_CATALOG, SLACK_CONVERSATION_BRIDGE } from '@open-autonomy/core';
import { validateBenchWorld, type BenchWorld } from './bench-world';

function world(): BenchWorld {
  return {
    schema: 'open-autonomy.bench-world.v1',
    target: {
      kind: 'compiled-substrate', id: 'hermes-target', organizationDigest: 'sha256:organization', deploymentDigest: 'sha256:deployment',
      composition: {
        instances: { hermes: { manifest: 'hermes-agent' }, worker: { manifest: 'coding-worker-runtime' } },
        authorities: { work: 'hermes', attempt: 'worker' },
      },
      artifacts: [{ role: 'hermes-deployment', uri: 'bundle://hermes/config', digest: 'sha256:artifact' }],
    },
    services: [{ kind: 'service', id: 'slack', contract: { id: 'slack-events-and-web-api', version: '2026-07' }, required: true, endpoint: 'https://slack.com/api' }],
    serviceBindings: [{ provider: 'hermes', service: 'slack', interface: 'hermes-gateway' }],
    twins: [{
      kind: 'digital-twin', id: 'volter-slack', service: 'slack', contract: { id: 'slack-events-and-web-api', version: '2026-07' },
      implementation: { package: '@volter/twin-slack', version: '0.1.0' }, coveredOperations: ['events.message', 'chat.postMessage'],
      knownGaps: ['socket-mode'], conformanceEvidence: ['test://slack-sdk-and-event-delivery'],
    }],
    simulators: [{ kind: 'behavioral-simulator', id: 'worker-scenario', role: 'worker', version: '1', contract: 'fixture://worker-outcomes', calibrationEvidence: ['report://worker-transfer'] }],
  };
}

describe('bench-world boundary algebra', () => {
  test('runs a real compiled Hermes composition inside a Slack service twin world', () => {
    const result = validateBenchWorld(world(), INITIAL_COMPONENT_CATALOG, { 'slack-conversation-bridge': SLACK_CONVERSATION_BRIDGE });
    expect(result.errors).toEqual([]);
  });

  test('does not permit a digital twin to replace Hermes or another substrate component', () => {
    const value = world();
    value.twins[0]!.service = 'hermes';
    expect(validateBenchWorld(value, INITIAL_COMPONENT_CATALOG).errors).toContain(
      "twins.0: digital twin may only substitute a declared service, not a substrate component ('hermes')",
    );
  });

  test('requires exact service-contract identity and explicit operation coverage', () => {
    const value = world();
    value.twins[0]!.contract.version = 'wrong';
    value.twins[0]!.coveredOperations = [];
    const result = validateBenchWorld(value, INITIAL_COMPONENT_CATALOG);
    expect(result.errors).toContain("twins.0: twin contract does not match service 'slack'");
    expect(result.errors).toContain('twins.0: covered operations must be explicit');
  });

  test('keeps behavioral simulators separate and reports missing calibration', () => {
    const value = world();
    value.simulators[0]!.calibrationEvidence = [];
    expect(validateBenchWorld(value, INITIAL_COMPONENT_CATALOG).warnings).toContain('simulators.0: worker simulator has no calibration evidence');
  });

  test('requires every required service to be consumed by the real target', () => {
    const value = world();
    value.serviceBindings = [];
    expect(validateBenchWorld(value, INITIAL_COMPONENT_CATALOG).errors).toContain("required service 'slack' is not bound to a compiled provider");
  });
});
