import type { AdapterContract, ComponentManifestV2, FacetKind, ManifestEvidence, StateFacetContract } from './organization-component';

const research = (anchor: string): ManifestEvidence => ({
  assurance: 'asserted',
  source: { uri: `research/hermes-openclaw.md#${anchor}`, digest: 'snapshot:2026-07-14' },
  notes: 'Pinned public documentation/source research; assertion is not independent conformance evidence.',
});
const declared = (uri: string): ManifestEvidence => ({ assurance: 'asserted', source: { uri } });
const unknown: ManifestEvidence = { assurance: 'unknown', notes: 'No portable guarantee is claimed.' };
const iface = (id: string, operations: string[], transport: 'cli' | 'http' | 'mcp' | 'database' | 'filesystem' | 'event' | 'external' = 'external') => ({
  id, version: '1', transport,
  commands: Object.fromEntries(operations.map((operation) => [operation, { id: `${id}.command.${operation}`, version: '1' }])),
  observations: { result: { id: `${id}.observation.result`, version: '1' } },
});
const state = (name: string, authority: StateFacetContract['authority'], evidence: ManifestEvidence, overrides: Partial<StateFacetContract> = {}): StateFacetContract => ({
  state: name, authority, consistency: 'unknown', delivery: 'unknown', ordering: 'unknown', idempotency: 'unknown', recovery: 'unknown', identity: 'unknown', evidence, ...overrides,
});
function component(id: string, version: string, facets: Array<[string, FacetKind, string[], string, ManifestEvidence]>, states: StateFacetContract[], evidence: ManifestEvidence): ComponentManifestV2 {
  return {
    schema: 'autonomy.component.v2', id, version,
    configuration: { id: `${id}.configuration`, version: '1', schema: { type: 'object' } },
    facets: Object.fromEntries(facets.map(([key, facet, operations, interfaceId, facetEvidence]) => [key, { facet, operations, interface: interfaceId, evidence: facetEvidence }])),
    interfaces: Object.fromEntries([...new Set(facets.map((entry) => entry[3]))].map((id) => [id, iface(id, facets.filter((entry) => entry[3] === id).flatMap((entry) => entry[2]), id.includes('mcp') ? 'mcp' : id.includes('db') ? 'database' : id.includes('git') ? 'cli' : 'external')])),
    state: states, trust: [{ principal: id, zone: 'component-process', enforcedBy: id, evidence }],
    failure: { detection: [], recovery: [], evidence },
    topology: { mode: 'unknown', minimumInstances: 0, isolation: 'unknown', evidence: unknown },
    capacity: [{ unit: 'concurrent-invocations', attribution: id, uncertainty: 'unknown', evidence: unknown }],
    cost: [{ unit: 'deployment-defined', attribution: id, uncertainty: 'unknown', evidence: unknown }],
  };
}

export const HERMES_COMPONENT = component('hermes-agent', '226e8de', [
  ['actor', 'actor', ['identity', 'run'], 'hermes-worker-lane', research('communication-topology-c')],
  ['work', 'work', ['create', 'claim', 'transition', 'comment'], 'hermes-kanban-db', research('state-transition-semantics')],
  ['session', 'session', ['launch', 'resume'], 'hermes-worker-lane', research('failure-detector-and-recovery')],
  ['execution', 'execution', ['dispatch', 'heartbeat', 'reclaim'], 'hermes-worker-lane', research('delivery-claims-and-execution-multiplicity')],
  ['interaction', 'interaction', ['gateway-message'], 'hermes-gateway', unknown],
  ['tool', 'tool', ['mcp-call'], 'hermes-mcp', research('communication-topology-c')],
], [state('work', 'authoritative', research('state-carrier-and-durability'), { consistency: 'strong', delivery: 'at-least-once', ordering: 'per-key', idempotency: 'supported', recovery: 'automatic', identity: 'stable' })], research('evidence-index'));

export const SLACK_COMPONENT = component('slack', 'external-2026-07', [
  ['interaction', 'interaction', ['receive', 'send', 'thread'], 'slack-api', declared('https://api.slack.com/docs')],
], [state('conversation', 'authoritative', declared('https://api.slack.com/docs'), { consistency: 'unknown', delivery: 'unknown', ordering: 'per-key', identity: 'stable' })], declared('https://api.slack.com/docs'));

export const CODING_WORKER_COMPONENT = component('coding-worker-runtime', 'contract-v1', [
  ['behavior', 'behavior', ['invoke'], 'worker-control', declared('docs/ORGANIZATION-IR.md')],
  ['execution', 'execution', ['launch', 'cancel', 'observe'], 'worker-control', declared('docs/ORGANIZATION-IR.md')],
], [state('attempt', 'authoritative', declared('docs/ORGANIZATION-IR.md'), { consistency: 'session', delivery: 'at-most-once', ordering: 'per-key', recovery: 'external', identity: 'ephemeral' })], declared('docs/ORGANIZATION-IR.md'));

export const GIT_COMPONENT = component('git', '2.x-contract', [
  ['artifact', 'artifact', ['read', 'commit', 'branch'], 'git-cli', declared('https://git-scm.com/docs')],
], [state('repository', 'authoritative', declared('https://git-scm.com/docs'), { consistency: 'strong', delivery: 'none', ordering: 'causal', idempotency: 'caller', recovery: 'operator', identity: 'stable' })], declared('https://git-scm.com/docs'));

export const DURABLE_WORK_STORE_COMPONENT = component('durable-work-store', 'abstract-v1', [
  ['work', 'work', ['create', 'claim', 'transition', 'query'], 'work-db', declared('docs/ORGANIZATION-IR.md')],
  ['event', 'event', ['append', 'read'], 'work-db', declared('docs/ORGANIZATION-IR.md')],
], [state('work', 'authoritative', declared('docs/ORGANIZATION-IR.md'), { consistency: 'strong', delivery: 'at-least-once', ordering: 'per-key', idempotency: 'enforced', recovery: 'automatic', identity: 'stable' })], declared('docs/ORGANIZATION-IR.md'));

export const INITIAL_COMPONENT_CATALOG: Record<string, ComponentManifestV2> = Object.fromEntries([
  HERMES_COMPONENT, SLACK_COMPONENT, CODING_WORKER_COMPONENT, GIT_COMPONENT, DURABLE_WORK_STORE_COMPONENT,
].map((value) => [value.id, value]));

export const SLACK_CONVERSATION_BRIDGE: AdapterContract = {
  schema: 'autonomy.adapter.v1', id: 'slack-conversation-bridge', version: '1', direction: 'bridge',
  from: { id: 'slack.event', version: '1' }, to: { id: 'autonomy.conversation-event', version: '1' },
  interfaceMappings: [{ from: 'slack-api', to: 'portable-conversation' }], identity: 'mapped', causality: 'mapped', retry: 'translated', conflicts: 'serialized',
  preconditions: ['verified Slack event signature', 'stable workspace/channel/thread identity'],
  postconditions: ['portable principal and external reference attached', 'event correlation retained'],
  losses: ['Slack presentation metadata outside the portable conversation schema'], reversible: false,
  evidence: declared('docs/ORGANIZATION-IR.md'),
};
