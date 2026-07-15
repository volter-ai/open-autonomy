import { describe, expect, test } from 'bun:test';
import {
  ECOSYSTEM_MAPPINGS, exportExternalDocument, mapExternalDocument, validateEcosystemMapping,
  type ExternalMappingDocument,
} from './organization-ecosystem';

describe('P13 versioned ecosystem mappings', () => {
  test('defines every required mapping with a semantic subset, dispositions, versions, trust, and layered claims', () => {
    expect(Object.keys(ECOSYSTEM_MAPPINGS).sort()).toEqual(['a2a', 'cloudevents', 'mcp', 'opentelemetry', 'oracle-agent-spec', 'provider-component', 'rego-policy', 'serverless-workflow']);
    for (const mapping of Object.values(ECOSYSTEM_MAPPINGS)) {
      expect(validateEcosystemMapping(mapping)).toEqual([]);
      expect(mapping.trust).toBe('untrusted-input');
      expect(mapping.constructs.every((item) => item.rationale.length > 0)).toBe(true);
      expect(Object.keys(mapping.interoperability).sort()).toEqual(['behavioral', 'schema', 'semantic', 'wire']);
    }
  });

  test('round-trips the declared MCP tool subset and preserves unknown extensions byte-for-value', () => {
    const mapping = ECOSYSTEM_MAPPINGS.mcp!;
    const extensions = { 'vendor/future': { nested: [1, 'two', true] } };
    const values = { tools: [{ name: 'read', inputSchema: { type: 'object' } }] };
    const exported = exportExternalDocument(mapping, '2025-06-18', values, extensions)!;
    const imported = mapExternalDocument(exported, mapping);
    expect(imported).toMatchObject({ status: 'mapped', values, preservedExtensions: extensions, losses: [] });
    expect(exported.extensions).toEqual(extensions);
  });

  test('reports exact losses rather than claiming round trip for narrower formats', () => {
    const mapping = ECOSYSTEM_MAPPINGS.a2a!;
    const document: ExternalMappingDocument = { mapping: 'a2a', standard: 'Agent2Agent Protocol', version: '0.3.0', constructs: { task: { id: 't1', state: 'working' }, agentCard: { url: 'https://agent.invalid' } } };
    const result = mapExternalDocument(document, mapping);
    expect(result.status).toBe('mapped');
    expect(result.losses.map((item) => item.construct)).toEqual(['agentCard', 'task']);
    expect(mapping.interoperability.wire).toBe('not-claimed');
    expect(mapping.interoperability.semantic).toBe('subset');
  });

  test('fails closed on unsupported versions, constructs, identity, size, and rejected extensions', () => {
    const base: ExternalMappingDocument = { mapping: 'mcp', standard: 'Model Context Protocol', version: '2025-06-18', constructs: { tools: [] } };
    expect(mapExternalDocument({ ...base, version: '2099-01-01' }, ECOSYSTEM_MAPPINGS.mcp!).status).toBe('rejected');
    expect(mapExternalDocument({ ...base, constructs: { secretAdminCommand: true } }, ECOSYSTEM_MAPPINGS.mcp!).errors[0]).toContain('unsupported constructs');
    expect(mapExternalDocument({ ...base, standard: 'lookalike' }, ECOSYSTEM_MAPPINGS.mcp!).status).toBe('rejected');
    const tiny = { ...ECOSYSTEM_MAPPINGS.mcp!, maximumBytes: 10 };
    expect(mapExternalDocument(base, tiny).errors.some((error) => error.includes('exceeds'))).toBe(true);
    const policy: ExternalMappingDocument = { mapping: 'rego-policy', standard: 'Open Policy Agent Rego', version: '1.2', constructs: { policy: 'allow=true' }, extensions: { unsafe: true } };
    expect(mapExternalDocument(policy, ECOSYSTEM_MAPPINGS['rego-policy']!).errors).toContain('unknown extensions are rejected by this mapping');
  });

  test('rejects internally dishonest round-trip and loss declarations', () => {
    const invalid = structuredClone(ECOSYSTEM_MAPPINGS.mcp!);
    invalid.constructs[0]!.losses = ['silently lost'];
    expect(validateEcosystemMapping(invalid)).toContain('tools: round-trip claim cannot declare losses');
  });
});
