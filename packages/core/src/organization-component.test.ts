import { describe, expect, test } from 'bun:test';
import {
  sealComponentManifest, validateAdapterContract, validateComponentComposition, validateComponentManifest,
  type AdapterContract, type ComponentManifestV2,
} from './organization-component';
import {
  DURABLE_WORK_STORE_COMPONENT, HERMES_COMPONENT, INITIAL_COMPONENT_CATALOG, SLACK_CONVERSATION_BRIDGE,
} from './organization-component-catalog';

describe('P6 typed component manifests', () => {
  test('validates the initial multi-facet catalog without silently strengthening unknown claims', () => {
    for (const manifest of Object.values(INITIAL_COMPONENT_CATALOG)) {
      const result = validateComponentManifest(manifest);
      expect(result.errors).toEqual([]);
      expect(Object.values(manifest.facets).every((facet) => manifest.interfaces[facet.interface])).toBe(true);
      expect(manifest.state.every((state) => state.evidence.assurance !== undefined)).toBe(true);
    }
    expect(Object.values(HERMES_COMPONENT.facets).map((facet) => facet.facet)).toEqual(['actor', 'behavior', 'work', 'session', 'execution', 'interaction', 'tool']);
    expect(HERMES_COMPONENT.facets.interaction.evidence.assurance).toBe('unknown');
  });

  test('requires evidence classes, versioned interfaces, health criteria honesty, and volatile price dates', () => {
    const invalid = structuredClone(HERMES_COMPONENT);
    invalid.facets.work.interface = 'missing';
    invalid.cost = [{ value: 1, unit: 'USD', per: 'month', attribution: 'account', uncertainty: 'volatile', evidence: { assurance: 'unknown' } }];
    (invalid.trust[0] as { evidence?: unknown }).evidence = undefined;
    const result = validateComponentManifest(invalid);
    expect(result.errors).toContain("facets.work: unknown interface 'missing'");
    expect(result.errors).toContain('trust.0: evidence disposition is required');
    expect(result.errors).toContain('cost.0: volatile quantity requires effectiveAt');
    expect(result.warnings).toContain('failure: availability has no health criterion');
  });

  test('content seals detect manifest substitution while signatures are not treated as truth', () => {
    const sealed = sealComponentManifest(HERMES_COMPONENT);
    expect(validateComponentManifest(sealed).errors).toEqual([]);
    sealed.version = 'substituted';
    expect(validateComponentManifest(sealed).errors).toContain('manifest digest does not match content');
    expect(validateComponentManifest(HERMES_COMPONENT).warnings.some((warning) => warning.includes('attestation'))).toBe(true);
  });
});

describe('P6 component composition and authority', () => {
  test('permits partial use of a multi-facet component with a single explicit state owner', () => {
    const result = validateComponentComposition({
      instances: { hermes: { manifest: 'hermes-agent' }, slack: { manifest: 'slack' }, worker: { manifest: 'coding-worker-runtime' }, git: { manifest: 'git' } },
      authorities: { work: 'hermes', conversation: 'slack', attempt: 'worker', repository: 'git' },
      adapters: ['slack-conversation-bridge'],
    }, INITIAL_COMPONENT_CATALOG, { 'slack-conversation-bridge': SLACK_CONVERSATION_BRIDGE });
    expect(result.errors).toEqual([]);
  });

  test('rejects overlapping authoritative owners without an explicit coherence protocol', () => {
    const composition = {
      instances: { hermes: { manifest: 'hermes-agent' }, store: { manifest: 'durable-work-store' } },
      authorities: { work: 'hermes' },
    };
    expect(validateComponentComposition(composition, INITIAL_COMPONENT_CATALOG).errors).toContain("state 'work' has overlapping authoritative owners hermes, store without coherence protocol");
    const coherent = validateComponentComposition({ ...composition, coherence: [{ state: 'work', providers: ['hermes', 'store'], protocol: 'single-writer replication' }] }, INITIAL_COMPONENT_CATALOG);
    expect(coherent.errors).toEqual([]);
  });

  test('does not accept a replica or nonexistent state as authority', () => {
    const replica = structuredClone(DURABLE_WORK_STORE_COMPONENT);
    replica.id = 'replica'; replica.state[0].authority = 'replica';
    const catalog = { ...INITIAL_COMPONENT_CATALOG, replica };
    const result = validateComponentComposition({ instances: { replica: { manifest: 'replica' } }, authorities: { work: 'replica', ghost: 'replica' } }, catalog);
    expect(result.errors).toContain("authority declared for unprovided state 'work'");
    expect(result.errors).toContain("authority declared for unprovided state 'ghost'");
  });
});

describe('P6 directional adapter algebra', () => {
  test('validates an explicitly lossy, directional Slack bridge', () => {
    expect(validateAdapterContract(SLACK_CONVERSATION_BRIDGE).errors).toEqual([]);
    expect(SLACK_CONVERSATION_BRIDGE.reversible).toBe(false);
    expect(SLACK_CONVERSATION_BRIDGE.losses.length).toBeGreaterThan(0);
  });

  test('rejects false reversibility, implicit loss, and incomplete enforcement boundaries', () => {
    const falseInverse: AdapterContract = { ...SLACK_CONVERSATION_BRIDGE, id: 'bad', reversible: true, reverseAdapter: undefined };
    expect(validateAdapterContract(falseInverse).errors).toContain('reversible adapter requires a named reverse adapter');
    expect(validateAdapterContract(falseInverse).errors).toContain('adapter with declared semantic losses cannot claim reversible');
    const silentLoss: AdapterContract = { ...SLACK_CONVERSATION_BRIDGE, id: 'silent', losses: [], causality: 'lost' };
    expect(validateAdapterContract(silentLoss).errors).toContain('lossy translation property requires an explicit loss');
    const enforcement: AdapterContract = { ...SLACK_CONVERSATION_BRIDGE, id: 'gate', direction: 'enforcement', enforcement: undefined };
    expect(validateAdapterContract(enforcement).errors).toContain('enforcement adapter must name its principal and trust boundary');
  });

  test('checks declared reverse endpoints instead of assuming lifting inverts lowering', () => {
    const forward: AdapterContract = { ...SLACK_CONVERSATION_BRIDGE, id: 'forward', losses: [], reversible: true, reverseAdapter: 'reverse' };
    const wrongReverse: AdapterContract = { ...forward, id: 'reverse', reversible: false, reverseAdapter: undefined };
    expect(validateAdapterContract(forward, { reverse: wrongReverse }).errors).toContain('reverse adapter endpoints do not invert this adapter');
  });
});
