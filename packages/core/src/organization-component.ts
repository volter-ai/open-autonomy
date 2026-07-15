import { semanticDigest, type SemanticDigest } from './organization-canonical';

export type ClaimAssurance = 'asserted' | 'conformance-tested' | 'live-observed' | 'unknown';
export type AdapterDirection = 'lowering' | 'lifting' | 'bridge' | 'enforcement';
export type FacetKind = 'actor' | 'behavior' | 'activation' | 'work' | 'interaction' | 'tool' | 'session' | 'context' | 'memory' | 'execution' | 'authority' | 'artifact' | 'event' | 'storage';

export interface ManifestEvidence {
  assurance: ClaimAssurance;
  source?: { uri: string; digest?: string };
  observedAt?: string;
  notes?: string;
}

export interface VersionedSchema {
  id: string;
  version: string;
  schema?: Record<string, unknown>;
}

export interface InterfaceContract {
  id: string;
  version: string;
  transport: 'function' | 'cli' | 'http' | 'mcp' | 'a2a' | 'database' | 'filesystem' | 'event' | 'external';
  commands?: Record<string, VersionedSchema>;
  observations?: Record<string, VersionedSchema>;
  authentication?: string;
}

export interface StateFacetContract {
  state: string;
  authority: 'authoritative' | 'replica' | 'cache' | 'none' | 'unknown';
  consistency: 'strong' | 'causal' | 'eventual' | 'session' | 'unknown';
  delivery: 'at-most-once' | 'at-least-once' | 'exactly-once' | 'best-effort' | 'none' | 'unknown';
  ordering: 'total' | 'causal' | 'per-key' | 'none' | 'unknown';
  idempotency: 'enforced' | 'supported' | 'caller' | 'none' | 'unknown';
  recovery: 'automatic' | 'operator' | 'external' | 'none' | 'unknown';
  identity: 'stable' | 'session' | 'ephemeral' | 'external' | 'unknown';
  evidence: ManifestEvidence;
}

export interface FailureContract {
  detection: string[];
  healthCriterion?: string;
  recovery: string[];
  upgrade?: string;
  rollback?: string;
  evidence: ManifestEvidence;
}

export interface TrustContract {
  principal: string;
  zone: string;
  enforcedBy: string;
  credentials?: Array<{ name: string; scope: string; flow: string }>;
  isolation?: string;
  evidence: ManifestEvidence;
}

export interface QuantityContract {
  value?: number;
  unit: string;
  per?: string;
  attribution: string;
  uncertainty: 'exact' | 'bounded' | 'estimated' | 'volatile' | 'unknown';
  effectiveAt?: string;
  evidence: ManifestEvidence;
}

export interface TopologyContract {
  mode: 'embedded' | 'standalone' | 'client-server' | 'peer' | 'external' | 'unknown';
  minimumInstances: number;
  maximumInstances?: number;
  isolation: 'process' | 'container' | 'virtual-machine' | 'host' | 'logical' | 'external' | 'unknown';
  placement?: string[];
  evidence: ManifestEvidence;
}

export interface ManifestSignature {
  algorithm: string;
  keyId: string;
  value: string;
  covers: 'digest';
}

export interface FacetProvision {
  facet: FacetKind;
  operations: string[];
  interface: string;
  properties?: Record<string, unknown>;
  evidence: ManifestEvidence;
}

export interface ComponentManifestV2 {
  schema: 'autonomy.component.v2';
  id: string;
  version: string;
  digest?: SemanticDigest;
  signatures?: ManifestSignature[];
  configuration: VersionedSchema;
  facets: Record<string, FacetProvision>;
  interfaces: Record<string, InterfaceContract>;
  state: StateFacetContract[];
  trust: TrustContract[];
  failure: FailureContract;
  topology: TopologyContract;
  capacity?: QuantityContract[];
  cost?: QuantityContract[];
  requires?: string[];
  conflictsWith?: string[];
  extensions?: Record<string, unknown>;
}

export interface AdapterContract {
  schema: 'autonomy.adapter.v1';
  id: string;
  version: string;
  direction: AdapterDirection;
  from: VersionedSchema;
  to: VersionedSchema;
  interfaceMappings: Array<{ from: string; to: string }>;
  identity: 'preserved' | 'mapped' | 'regenerated' | 'not-applicable';
  causality: 'preserved' | 'mapped' | 'lost' | 'not-applicable';
  retry: 'preserved' | 'translated' | 'lost' | 'not-applicable';
  conflicts: 'preserved' | 'translated' | 'serialized' | 'lost' | 'not-applicable';
  preconditions: string[];
  postconditions: string[];
  losses: string[];
  reversible: boolean;
  reverseAdapter?: string;
  enforcement?: TrustContract;
  evidence: ManifestEvidence;
}

export interface ComponentValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ComponentComposition {
  instances: Record<string, { manifest: string; configuration?: Record<string, unknown> }>;
  authorities: Record<string, string>;
  coherence?: Array<{ state: string; providers: string[]; protocol: string; adapter?: string }>;
  adapters?: string[];
}

export function sealComponentManifest(manifest: ComponentManifestV2): ComponentManifestV2 {
  const unsigned = structuredClone(manifest);
  delete unsigned.digest;
  delete unsigned.signatures;
  return { ...unsigned, digest: semanticDigest(unsigned, 'component-manifest-v2') };
}

export function validateComponentManifest(manifest: ComponentManifestV2): ComponentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (manifest.schema !== 'autonomy.component.v2') errors.push('unsupported component manifest schema');
  if (!manifest.id.trim() || !manifest.version.trim()) errors.push('component id and version are required');
  if (!manifest.configuration.id || !manifest.configuration.version) errors.push('configuration schema must be versioned');
  if (!Number.isInteger(manifest.topology.minimumInstances) || manifest.topology.minimumInstances < 0) errors.push('topology.minimumInstances must be a nonnegative integer');
  if (manifest.topology.maximumInstances !== undefined && manifest.topology.maximumInstances < manifest.topology.minimumInstances) errors.push('topology.maximumInstances is below minimumInstances');
  checkEvidence('topology', manifest.topology.evidence, errors, warnings);
  for (const [id, facet] of Object.entries(manifest.facets)) {
    if (!facet.operations.length) errors.push(`facets.${id}: at least one operation is required`);
    if (!manifest.interfaces[facet.interface]) errors.push(`facets.${id}: unknown interface '${facet.interface}'`);
    checkEvidence(`facets.${id}`, facet.evidence, errors, warnings);
  }
  for (const [id, contract] of Object.entries(manifest.interfaces)) {
    if (id !== contract.id) errors.push(`interfaces.${id}: id must equal catalog key`);
    if (!contract.version) errors.push(`interfaces.${id}: version is required`);
    for (const [name, schema] of Object.entries({ ...contract.commands, ...contract.observations }))
      if (!schema.id || !schema.version) errors.push(`interfaces.${id}.${name}: schema must have id and version`);
  }
  for (const [index, state] of manifest.state.entries()) {
    checkEvidence(`state.${index}`, state.evidence, errors, warnings);
    if (state.evidence.assurance === 'unknown') warnings.push(`state.${index}: semantics remain unknown, never defaulted`);
  }
  for (const [index, trust] of manifest.trust.entries()) {
    if (!trust.principal || !trust.zone || !trust.enforcedBy) errors.push(`trust.${index}: principal, zone, and enforcer are required`);
    checkEvidence(`trust.${index}`, trust.evidence, errors, warnings);
  }
  if (!manifest.failure.healthCriterion) warnings.push('failure: availability has no health criterion');
  checkEvidence('failure', manifest.failure.evidence, errors, warnings);
  for (const [kind, quantities] of [['capacity', manifest.capacity], ['cost', manifest.cost]] as const)
    for (const [index, quantity] of (quantities ?? []).entries()) {
      if (!quantity.unit || !quantity.attribution) errors.push(`${kind}.${index}: unit and attribution are required`);
      if (quantity.uncertainty === 'volatile' && !quantity.effectiveAt) errors.push(`${kind}.${index}: volatile quantity requires effectiveAt`);
      checkEvidence(`${kind}.${index}`, quantity.evidence, errors, warnings);
    }
  if (manifest.digest) {
    const expected = sealComponentManifest(manifest).digest;
    if (JSON.stringify(expected) !== JSON.stringify(manifest.digest)) errors.push('manifest digest does not match content');
  }
  if (manifest.signatures?.length && !manifest.digest) errors.push('manifest signatures require a content digest');
  for (const [index, signature] of (manifest.signatures ?? []).entries())
    if (!signature.algorithm || !signature.keyId || !signature.value || signature.covers !== 'digest') errors.push(`signatures.${index}: complete digest signature metadata is required`);
  return { errors: unique(errors), warnings: unique(warnings) };
}

export function validateAdapterContract(adapter: AdapterContract, registry: Record<string, AdapterContract> = {}): ComponentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!adapter.from.id || !adapter.from.version || !adapter.to.id || !adapter.to.version) errors.push('adapter endpoints must be versioned schemas');
  if (!adapter.interfaceMappings.length) errors.push('adapter must declare at least one interface mapping');
  if (!adapter.preconditions.length || !adapter.postconditions.length) errors.push('adapter preconditions and postconditions are required');
  if (adapter.reversible) {
    if (!adapter.reverseAdapter) errors.push('reversible adapter requires a named reverse adapter');
    const reverse = adapter.reverseAdapter ? registry[adapter.reverseAdapter] : undefined;
    if (reverse && (reverse.from.id !== adapter.to.id || reverse.to.id !== adapter.from.id)) errors.push('reverse adapter endpoints do not invert this adapter');
    if (adapter.losses.length) errors.push('adapter with declared semantic losses cannot claim reversible');
  }
  if (adapter.direction === 'enforcement' && !adapter.enforcement) errors.push('enforcement adapter must name its principal and trust boundary');
  if (adapter.causality === 'lost' || adapter.identity === 'regenerated' || adapter.retry === 'lost' || adapter.conflicts === 'lost')
    if (!adapter.losses.length) errors.push('lossy translation property requires an explicit loss');
  checkEvidence('adapter', adapter.evidence, errors, warnings);
  return { errors: unique(errors), warnings: unique(warnings) };
}

export function validateComponentComposition(
  composition: ComponentComposition,
  manifests: Record<string, ComponentManifestV2>,
  adapters: Record<string, AdapterContract> = {},
): ComponentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const instances = Object.entries(composition.instances);
  for (const [instance, configured] of instances) {
    const manifest = manifests[configured.manifest];
    if (!manifest) { errors.push(`instances.${instance}: unknown manifest '${configured.manifest}'`); continue; }
    const validation = validateComponentManifest(manifest);
    errors.push(...validation.errors.map((error) => `instances.${instance}: ${error}`));
    warnings.push(...validation.warnings.map((warning) => `instances.${instance}: ${warning}`));
    for (const conflict of manifest.conflictsWith ?? [])
      if (instances.some(([, other]) => other.manifest === conflict)) errors.push(`instances.${instance}: manifest conflicts with '${conflict}'`);
    for (const required of manifest.requires ?? [])
      if (!instances.some(([, other]) => other.manifest === required || Object.values(manifests[other.manifest]?.facets ?? {}).some((facet) => facet.facet === required)))
        errors.push(`instances.${instance}: unsatisfied required facet '${required}'`);
  }
  for (const adapter of composition.adapters ?? []) if (!adapters[adapter]) errors.push(`unknown adapter '${adapter}'`);
  const owners = new Map<string, string[]>();
  for (const [instance, configured] of instances) for (const state of manifests[configured.manifest]?.state ?? [])
    if (state.authority === 'authoritative') owners.set(state.state, [...(owners.get(state.state) ?? []), instance]);
  for (const [state, stateOwners] of owners) {
    const declared = composition.authorities[state];
    if (!declared) errors.push(`state '${state}' has no declared authoritative instance`);
    else if (!stateOwners.includes(declared)) errors.push(`state '${state}' authority '${declared}' is not an authoritative provider`);
    if (stateOwners.length > 1) {
      const coherence = composition.coherence?.find((entry) => entry.state === state && stateOwners.every((owner) => entry.providers.includes(owner)));
      if (!coherence) errors.push(`state '${state}' has overlapping authoritative owners ${stateOwners.join(', ')} without coherence protocol`);
      else if (coherence.adapter && !adapters[coherence.adapter]) errors.push(`state '${state}' coherence names unknown adapter '${coherence.adapter}'`);
    }
  }
  for (const state of Object.keys(composition.authorities)) if (!owners.has(state)) errors.push(`authority declared for unprovided state '${state}'`);
  return { errors: unique(errors), warnings: unique(warnings) };
}

function checkEvidence(path: string, evidence: ManifestEvidence, errors: string[], warnings: string[]): void {
  if (!evidence) { errors.push(`${path}: evidence disposition is required`); return; }
  if (evidence.assurance !== 'unknown' && !evidence.source) errors.push(`${path}: ${evidence.assurance} claim requires a source`);
  if (evidence.assurance === 'live-observed' && !evidence.observedAt) errors.push(`${path}: live observation requires observedAt`);
  if (evidence.assurance === 'asserted') warnings.push(`${path}: asserted claim is attestation, not independent proof`);
}
function unique(values: string[]): string[] { return [...new Set(values)]; }
