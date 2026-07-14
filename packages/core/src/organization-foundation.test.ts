import { describe, expect, test } from 'bun:test';
import type { OrganizationIR } from './organization-ir';
import type { OrganizationProfileIR } from './organization-profile';
import { createModuleResolutionPass, createProfileInstantiationPass, organizationNormalizationPass } from './organization-compiler-passes';
import { runCompilerPipeline } from './organization-compiler';
import { canonicalSemanticJson } from './organization-canonical';
import { ArtifactMigrationRegistry } from './organization-migrate';
import type { LoadedOrganizationModule, ModuleId, OrganizationModuleLoader } from './organization-modules';

describe('P1-P4 compiler foundation completion gate', () => {
  const library: LoadedOrganizationModule = {
    moduleId: 'acme/library' as ModuleId, location: 'mem:/library.yml', digest: 'sha256:library',
    organization: {
      schema: 'autonomy.organization.v2', name: 'library',
      behaviors: { code: { kind: 'skill', source: { uri: './code.md' } } },
      actors: { exemplar: { kind: 'agent', behaviors: ['code'] } },
    },
  };
  const loader: OrganizationModuleLoader = { async load() { return structuredClone(library); } };
  const profile: OrganizationProfileIR = {
    schema: 'autonomy.profile.v1', name: 'coding-family',
    parameters: { name: { type: 'string', required: true } },
    template: {
      schema: 'autonomy.organization.v2', name: '${{ params.name }}',
      imports: { library: { source: { uri: 'mem:library', digest: 'sha256:library' }, namespace: 'lib', symbols: { behaviors: ['code'] } } },
      actors: { worker: { kind: 'agent', behaviors: ['lib/code'] } },
    },
  };

  async function compile() {
    const instantiated = await runCompilerPipeline(profile, 'source', [
      createProfileInstantiationPass({ name: 'compiler-org' }, 'mem:/profile.yml') as never,
    ]);
    const root: LoadedOrganizationModule = {
      moduleId: 'acme/root' as ModuleId, location: 'mem:/profile.yml#/template',
      organization: instantiated.output as OrganizationIR,
    };
    const compiled = await runCompilerPipeline(root, 'source', [
      createModuleResolutionPass(loader, { allowedSchemes: ['mem'], requireDigestForSchemes: ['mem'] }) as never,
      organizationNormalizationPass as never,
    ]);
    return { instantiated, compiled };
  }

  test('repeats with byte-identical normal form, digest, diagnostics, and source mappings', async () => {
    const first = await compile(); const second = await compile();
    expect(first.instantiated.diagnostics).toEqual([]);
    expect(first.compiled.diagnostics).toEqual([]);
    expect(canonicalSemanticJson(first.compiled.output)).toBe(canonicalSemanticJson(second.compiled.output));
    expect(first.compiled.passes).toEqual(second.compiled.passes);
  });

  test('projects an invalid profile value to the authored parameter and rejects unsupported versions', async () => {
    const invalid = await runCompilerPipeline(profile, 'source', [
      createProfileInstantiationPass({ name: 42 }, 'mem:/profile.yml') as never,
    ]);
    expect(invalid.diagnostics[0]).toMatchObject({
      code: 'OA-PROFILE-PARAMETER-INVALID', source: { location: 'mem:/profile.yml', path: '/parameters/name' },
    });
    const migrations = new ArtifactMigrationRegistry();
    expect(migrations.migrate('organization', 'autonomy.organization.v2', 'autonomy.organization.v99', {}).errors)
      .toEqual(['OA-MIGRATION-NO-PATH: organization autonomy.organization.v2 -> autonomy.organization.v99']);
    expect(migrations.migrate('organization', 'autonomy.organization.v2', 'autonomy.organization.v2', {}).errors).toEqual([]);
  });
});
