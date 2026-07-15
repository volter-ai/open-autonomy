export type MappingDisposition = 'adopt' | 'embed' | 'adapt' | 'invent' | 'reject';
export type InteroperabilityClaim = 'conformant' | 'subset' | 'not-claimed';
export interface MappingConstruct {
  external: string; organization: string; disposition: MappingDisposition; roundTrip: boolean; losses: string[]; rationale: string;
}
export interface EcosystemMappingSpec {
  id: string; standard: string; versionRange: string; direction: 'frontend' | 'backend' | 'bidirectional' | 'observation';
  semanticDomain: string; constructs: MappingConstruct[];
  interoperability: { wire: InteroperabilityClaim; schema: InteroperabilityClaim; behavioral: InteroperabilityClaim; semantic: InteroperabilityClaim };
  unknownExtensions: 'preserve' | 'reject'; trust: 'untrusted-input'; maximumBytes: number;
}
export interface ExternalMappingDocument {
  mapping: string; standard: string; version: string; constructs: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
export interface MappingLoss { construct: string; reason: string; }
export interface MappingResult {
  status: 'mapped' | 'rejected'; values?: Record<string, unknown>; preservedExtensions?: Record<string, unknown>;
  dispositions: Array<{ construct: string; disposition: MappingDisposition }>; losses: MappingLoss[]; errors: string[];
}

const construct = (external: string, organization: string, disposition: MappingDisposition, roundTrip: boolean, losses: string[], rationale: string): MappingConstruct => ({ external, organization, disposition, roundTrip, losses, rationale });
const spec = (id: string, standard: string, versionRange: string, direction: EcosystemMappingSpec['direction'], semanticDomain: string, constructs: MappingConstruct[], interoperability: EcosystemMappingSpec['interoperability'], unknownExtensions: EcosystemMappingSpec['unknownExtensions'] = 'preserve'): EcosystemMappingSpec => ({ id, standard, versionRange, direction, semanticDomain, constructs, interoperability, unknownExtensions, trust: 'untrusted-input', maximumBytes: 1_000_000 });
const subset = { wire: 'not-claimed', schema: 'subset', behavioral: 'not-claimed', semantic: 'subset' } as const;

export const ECOSYSTEM_MAPPINGS: Record<string, EcosystemMappingSpec> = Object.fromEntries([
  spec('oracle-agent-spec', 'Oracle Agent Spec', '25.4.x', 'bidirectional', 'behavior/component descriptions', [
    construct('agent', 'behaviors', 'adapt', false, ['organization roles, durable work, authority, and governance are outside the format'], 'reuse component behavior structure without treating it as an organization'),
    construct('tool', 'tools', 'adopt', true, [], 'tool input/output/effect descriptions coincide on the declared subset'),
  ], subset),
  spec('mcp', 'Model Context Protocol', '2025-06-18', 'bidirectional', 'tool, resource, and prompt wire boundary', [
    construct('tools', 'tools', 'embed', true, [], 'MCP tool schemas embed as tool interfaces'),
    construct('resources', 'memories', 'adapt', false, ['retention, consistency, and organizational scope require Organization IR'], 'resource access is narrower than organizational memory'),
    construct('prompts', 'behaviors.instructions', 'adapt', false, ['instruction precedence and authority are not supplied by MCP'], 'prompt messages contribute instructions but cannot confer authority'),
  ], { wire: 'not-claimed', schema: 'subset', behavioral: 'subset', semantic: 'subset' }),
  spec('a2a', 'Agent2Agent Protocol', '0.3.0', 'bidirectional', 'remote actor discovery and task/message exchange', [
    construct('agentCard', 'actors.implementation', 'adapt', false, ['durable organizational identity is not the remote endpoint'], 'card is one implementation choice'),
    construct('task', 'workTypes/portable work', 'adapt', false, ['organization lifecycle, authority, budgets, and goals may be richer'], 'task observations lift through an explicit state relation'),
    construct('message', 'protocols.messages', 'embed', true, [], 'message parts embed within a declared protocol subset'),
  ], subset),
  spec('cloudevents', 'CloudEvents', '1.0.2', 'observation', 'event envelopes', [
    construct('CloudEvent', 'PortableEventV2.provenance/payload', 'embed', false, ['transport envelope does not establish semantic event type or truth'], 'preserve native envelope before adapter lifting'),
  ], { wire: 'not-claimed', schema: 'subset', behavioral: 'not-claimed', semantic: 'not-claimed' }),
  spec('opentelemetry', 'OpenTelemetry', '1.58.x', 'observation', 'traces, metrics, and logs', [
    construct('Span', 'PortableEventV2.provenance', 'adapt', false, ['trace causality is observational, not organizational authority'], 'trace context supplies provenance and correlation'),
  ], { wire: 'not-claimed', schema: 'subset', behavioral: 'not-claimed', semantic: 'not-claimed' }),
  spec('serverless-workflow', 'CNCF Serverless Workflow', '1.0.0', 'backend', 'durable workflow control', [
    construct('workflow', 'workTypes.lifecycle/control plan', 'adapt', false, ['organizational actors, delegation, goals, and governance remain external'], 'lower finite control while retaining organization semantics above it'),
  ], subset),
  spec('rego-policy', 'Open Policy Agent Rego', '1.x', 'backend', 'policy decision enforcement', [
    construct('policy', 'policies', 'embed', false, ['opaque Rego is not statically analyzable as portable expressions'], 'use as a dialect-bound enforcement implementation'),
  ], { wire: 'not-claimed', schema: 'subset', behavioral: 'subset', semantic: 'not-claimed' }, 'reject'),
  spec('provider-component', 'Open Autonomy Component Manifest', 'autonomy.component.v2', 'bidirectional', 'provider capability, state, trust, and economics', [
    construct('component', 'deployment component', 'invent', true, [], 'no adopted standard spans the required multi-facet provider contract'),
  ], { wire: 'conformant', schema: 'conformant', behavioral: 'subset', semantic: 'subset' }),
].map((item) => [item.id, item]));

export function validateEcosystemMapping(specification: EcosystemMappingSpec): string[] {
  const errors: string[] = [];
  if (!specification.id || !specification.standard || !specification.versionRange || !specification.semanticDomain) errors.push('mapping identity, standard, version range, and semantic domain are required');
  if (!(specification.maximumBytes > 0)) errors.push('maximumBytes must be positive');
  if (!specification.constructs.length) errors.push('supported semantic subset must not be empty');
  const names = new Set<string>();
  for (const item of specification.constructs) {
    if (names.has(item.external)) errors.push(`duplicate external construct '${item.external}'`); names.add(item.external);
    if (!item.external || !item.organization || !item.rationale) errors.push('each construct requires external/organization names and rationale');
    if (item.roundTrip && item.losses.length) errors.push(`${item.external}: round-trip claim cannot declare losses`);
  }
  return errors;
}

export function mapExternalDocument(document: ExternalMappingDocument, specification: EcosystemMappingSpec): MappingResult {
  const errors = validateEcosystemMapping(specification);
  const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
  if (bytes > specification.maximumBytes) errors.push(`document exceeds ${specification.maximumBytes} bytes`);
  if (document.mapping !== specification.id || document.standard !== specification.standard) errors.push('document mapping or standard identity mismatch');
  if (!versionMatches(document.version, specification.versionRange)) errors.push(`unsupported version '${document.version}' for '${specification.versionRange}'`);
  const supported = new Map(specification.constructs.map((item) => [item.external, item]));
  const unknown = Object.keys(document.constructs).filter((name) => !supported.has(name));
  if (unknown.length) errors.push(`unsupported constructs: ${unknown.sort().join(', ')}`);
  if (document.extensions && specification.unknownExtensions === 'reject') errors.push('unknown extensions are rejected by this mapping');
  if (errors.length) return { status: 'rejected', dispositions: [], losses: [], errors };
  const dispositions = Object.keys(document.constructs).sort().map((name) => ({ construct: name, disposition: supported.get(name)!.disposition }));
  const losses = Object.keys(document.constructs).sort().flatMap((name) => supported.get(name)!.losses.map((reason) => ({ construct: name, reason })));
  return { status: 'mapped', values: structuredClone(document.constructs), preservedExtensions: specification.unknownExtensions === 'preserve' ? structuredClone(document.extensions) : undefined, dispositions, losses, errors: [] };
}

export function exportExternalDocument(mapping: EcosystemMappingSpec, version: string, values: Record<string, unknown>, extensions?: Record<string, unknown>): ExternalMappingDocument | undefined {
  if (!versionMatches(version, mapping.versionRange)) return undefined;
  if (Object.keys(values).some((key) => !mapping.constructs.some((item) => item.external === key))) return undefined;
  if (extensions && mapping.unknownExtensions === 'reject') return undefined;
  return { mapping: mapping.id, standard: mapping.standard, version, constructs: structuredClone(values), extensions: mapping.unknownExtensions === 'preserve' ? structuredClone(extensions) : undefined };
}

function versionMatches(version: string, range: string): boolean {
  if (range.endsWith('.x')) return version.startsWith(range.slice(0, -1));
  if (range === '0.x') return version.startsWith('0.');
  return version === range;
}
