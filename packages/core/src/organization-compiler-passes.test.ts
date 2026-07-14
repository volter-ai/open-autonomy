import { describe, expect, test } from 'bun:test';
import type { OrganizationIR, SourceRef } from './organization-ir';
import type { OrganizationProfileIR } from './organization-profile';
import {
  createModuleResolutionPass,
  createProfileInstantiationPass,
  organizationNormalizationPass,
} from './organization-compiler-passes';
import { runCompilerPipeline } from './organization-compiler';
import type { LoadedOrganizationModule, ModuleId, OrganizationModuleLoader } from './organization-modules';

const organization = (extra: Partial<OrganizationIR> = {}): OrganizationIR => ({
  schema: 'autonomy.organization.v2', name: 'org',
  behaviors: { work: { kind: 'skill', source: { uri: './work.md' } } },
  actors: { worker: { kind: 'agent', behaviors: ['work'] } }, ...extra,
});
const loaded = (value: OrganizationIR): LoadedOrganizationModule => ({
  moduleId: 'acme/root' as ModuleId, location: 'mem:/root.yml', organization: value,
});

describe('P3 real Organization IR compiler passes', () => {
  test('projects profile instantiation failure to the authored parameter or variant path', async () => {
    const profile: OrganizationProfileIR = {
      schema: 'autonomy.profile.v1', name: 'family',
      parameters: { name: { type: 'string', required: true } },
      template: organization({ name: '${{ params.name }}' }),
    };
    const result = await runCompilerPipeline(profile, 'source', [
      createProfileInstantiationPass({ name: 3 }, 'mem:/profile.yml') as never,
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'OA-PROFILE-PARAMETER-INVALID', source: { location: 'mem:/profile.yml', path: '/parameters/name' },
    }));
  });

  test('emits stable import diagnostics at the authored import path', async () => {
    const loader: OrganizationModuleLoader = { async load(source: SourceRef) { throw new Error(`missing ${source.uri}`); } };
    const root = loaded(organization({ imports: { library: { source: { uri: 'missing' } } } }));
    const result = await runCompilerPipeline(root, 'source', [createModuleResolutionPass(loader) as never]);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: 'OA-MODULE-RESOLUTION-FAILED', phase: 'organization.modules.resolve',
      source: { location: 'mem:/root.yml', path: '/imports/library' },
    })]);
  });

  test('runs resolution and normalization as inspectable real passes', async () => {
    const loader: OrganizationModuleLoader = { async load() { throw new Error('unused'); } };
    const result = await runCompilerPipeline(loaded(organization()), 'source', [
      createModuleResolutionPass(loader) as never,
      organizationNormalizationPass as never,
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.level).toBe('normalized');
    expect((result.output as { schema: string }).schema).toBe('autonomy.normalized-organization.v1');
    expect(result.passes.map((pass) => pass.pass)).toEqual(['organization.modules.resolve', 'organization.normalize']);
    expect(result.passes[1].sourceMap.length).toBeGreaterThan(0);
  });

  test('gives unresolved references a stable code and authored module path', async () => {
    const loader: OrganizationModuleLoader = { async load() { throw new Error('unused'); } };
    const result = await runCompilerPipeline(loaded(organization({
      actors: { worker: { kind: 'agent', behaviors: ['missing'] } },
    })), 'source', [createModuleResolutionPass(loader) as never, organizationNormalizationPass as never]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'OA-NORMALIZE-UNRESOLVED-REFERENCE',
      source: { location: 'mem:/root.yml', path: 'actors.worker.behaviors[0]' },
    }));
  });
});
