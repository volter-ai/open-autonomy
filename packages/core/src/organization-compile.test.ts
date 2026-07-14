import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { OrganizationIR } from './organization-ir';
import { lowerOrganizationToV1, type V1LoweringOptions } from './organization-compile';
import { parseOrganizationIr, parseV1LoweringOptions } from './organization-ir-yaml';
import { deriveRequirements, solveDeployment, type DeploymentIR, type SubstrateComponentManifest } from './organization-substrate';

const source: OrganizationIR = {
  schema: 'autonomy.organization.v2',
  name: 'minimal',
  behaviors: { pm: { kind: 'skill', source: { uri: './skills/pm/SKILL.md' } } },
  capabilities: { converse: { resourceKinds: ['work'], actions: ['comment'] } },
  actors: {
    pm: {
      kind: 'agent', behaviors: ['pm'], capabilities: [{ capability: 'converse' }],
      activation: [{ kind: 'schedule', expression: '*/5 * * * *' }],
    },
  },
};

const components: Record<string, SubstrateComponentManifest> = {
  runner: {
    id: 'runner',
    provides: {
      'actors.identity': { realization: 'native' },
      'actors.behavior': { realization: 'native' },
      'actors.activation': { realization: 'native' },
      'authority.capabilities': { realization: 'native' },
    },
  },
};
const deployment: DeploymentIR = {
  schema: 'autonomy.deployment.v1', name: 'minimal-local', providers: { runtime: { component: 'runner' } },
};
const options: V1LoweringOptions = {
  deployment, components, targets: ['local'],
  actors: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/5 * * * *' }] } },
  policy: { box: {} },
};

describe('substrate requirement derivation and compatibility', () => {
  test('derives requirements from semantics actually used by the organization', () => {
    expect(deriveRequirements(source).map((x) => x.feature)).toEqual([
      'actors.activation', 'actors.behavior', 'actors.identity', 'authority.capabilities',
    ]);
  });

  test('composes overlapping providers and requires a binding when ownership is ambiguous', () => {
    const ambiguousComponents = {
      ...components,
      second: { id: 'second', provides: { 'actors.identity': { realization: 'native' as const } } },
    };
    const ambiguous: DeploymentIR = {
      ...deployment,
      providers: { runtime: { component: 'runner' }, other: { component: 'second' } },
    };
    expect(solveDeployment(source, ambiguous, ambiguousComponents).status).toBe('configurable');
    ambiguous.bindings = [{ feature: 'actors.identity', provider: 'runtime' }];
    expect(solveDeployment(source, ambiguous, ambiguousComponents).status).toBe('compatible');
  });

  test('detects structural property incompatibility, not merely missing feature names', () => {
    const constrained: OrganizationIR = {
      ...source,
      compiler: { requirements: { 'actors.identity': { constraints: [{ property: 'persistent', operator: 'eq', value: true }] } } },
    };
    const ephemeral = structuredClone(components);
    ephemeral.runner.provides['actors.identity'].properties = { persistent: false };
    const result = solveDeployment(constrained, deployment, ephemeral);
    expect(result.status).toBe('incompatible');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ feature: 'actors.identity', status: 'incompatible' }));
  });

  test('requires explicit authoritative ownership for state named by the profile', () => {
    const stateful: OrganizationIR = {
      ...source,
      compiler: { requirements: { 'actors.identity': { authoritativeState: 'identities' } } },
    };
    expect(solveDeployment(stateful, deployment, components).status).toBe('configurable');
    expect(solveDeployment(stateful, { ...deployment, authorities: { identities: 'runtime' } }, components).status).toBe('compatible');
  });
});

describe('organization.v2 -> autonomy.ir.v1 lowering', () => {
  test('emits v1 only after the deployment is compatible', () => {
    const result = lowerOrganizationToV1(source, options);
    expect(result.compatibility.status).toBe('compatible');
    expect(result.errors).toEqual([]);
    expect(result.ir?.agents.pm.behavior).toBe('pm');
  });

  test('does not emit a partial target when the deployment or actor projection is incomplete', () => {
    const incompatible = lowerOrganizationToV1(source, { ...options, components: {} });
    expect(incompatible.ir).toBeUndefined();
    expect(incompatible.compatibility.status.startsWith('compatible')).toBe(false);
    const missingActor = lowerOrganizationToV1(source, { ...options, actors: {} });
    expect(missingActor.ir).toBeUndefined();
    expect(missingActor.errors).toContain("actor 'pm' has no v1 projection");
  });

  test('surfaces v1 target validation failures', () => {
    const result = lowerOrganizationToV1(source, {
      ...options,
      actors: { pm: { ...options.actors.pm, capabilities: ['not-a-v1-capability'] } },
    });
    expect(result.ir).toBeUndefined();
    expect(result.errors.some((x) => x.includes('unknown capability'))).toBe(true);
  });

  test('solves and lowers the full Hermes + OA control + Codex + GitHub deployment fixture', () => {
    const definition = parseOrganizationIr(readFileSync('docs/examples/autonomous-coding-org.v2.yml', 'utf8'));
    const configured = parseV1LoweringOptions(readFileSync('docs/examples/autonomous-coding-org.deployment.yml', 'utf8'));
    const result = lowerOrganizationToV1(definition, configured);
    expect(result.compatibility.status).toBe('compatible-with-adapters');
    expect(result.errors).toEqual([]);
    expect(Object.keys(result.ir?.agents ?? {})).toEqual(['manager', 'coder-pool', 'reviewer']);
  });
});
