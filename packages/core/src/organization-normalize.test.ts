import { describe, expect, test } from 'bun:test';
import type { OrganizationIR, SourceRef } from './organization-ir';
import {
  resolveOrganizationModules,
  type LoadedOrganizationModule,
  type ModuleId,
  type OrganizationModuleLoader,
} from './organization-modules';
import { normalizeOrganization } from './organization-normalize';

const loaded = (id: string, location: string, organization: OrganizationIR): LoadedOrganizationModule => ({
  moduleId: id as ModuleId, location, organization,
});
const loader = (entries: Record<string, LoadedOrganizationModule>): OrganizationModuleLoader => ({
  async load(source: SourceRef) {
    const value = entries[source.uri];
    if (!value) throw new Error(`missing ${source.uri}`);
    return structuredClone(value);
  },
});
const org = (name: string, extra: Partial<OrganizationIR> = {}): OrganizationIR => ({
  schema: 'autonomy.organization.v2', name,
  behaviors: { work: { kind: 'skill', source: { uri: './work.md' } } },
  actors: { worker: { kind: 'agent', behaviors: ['work'] } },
  ...extra,
});

describe('P2 normalized organization form', () => {
  test('eliminates imports, qualifies references, elaborates defaults, and retains source relations', async () => {
    const library = loaded('acme/lib', 'mem:/lib.yml', org('lib', {
      behaviors: { 'code.v1/primary': { kind: 'skill', source: { uri: './code.md' } } },
      actors: { worker: { kind: 'agent', behaviors: ['code.v1/primary'] } },
    }));
    const root = loaded('acme/root', 'mem:/root.yml', org('root', {
      imports: { library: { source: { uri: 'lib' }, namespace: 'eng' } },
      actors: { worker: { kind: 'agent', behaviors: ['eng/code.v1/primary'] } },
    }));
    const graph = (await resolveOrganizationModules(root, loader({ lib: library }))).graph!;
    const result = normalizeOrganization(graph);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.modules['acme/root'].imports).toBeUndefined();
    expect(result.normalized?.modules['acme/root'].actors.worker.behaviors)
      .toEqual(['acme/lib#behaviors/code.v1/primary']);
    expect(result.normalized?.modules['acme/root'].actors.worker).toMatchObject({
      memberOf: [], reportsTo: [], capabilities: [], constraints: [], activation: [], implementation: [],
    });
    expect(result.normalized?.sourceMap).toContainEqual(expect.objectContaining({
      output: '/modules/acme~1root/actors/worker/behaviors/0',
      sources: [
        { location: 'mem:/root.yml', path: 'actors.worker.behaviors[0]' },
        { location: 'mem:/lib.yml', path: 'behaviors/code.v1/primary' },
      ],
    }));
  });

  test('is idempotent and alpha-equivalent under import alias renaming', async () => {
    const library = loaded('acme/lib', 'mem:/lib.yml', org('lib'));
    const make = async (alias: string) => {
      const root = loaded('acme/root', 'mem:/root.yml', org('root', {
        imports: { dependency: { source: { uri: 'lib' }, namespace: alias } },
        actors: { worker: { kind: 'agent', behaviors: [`${alias}/work`] } },
      }));
      return normalizeOrganization((await resolveOrganizationModules(root, loader({ lib: library }))).graph!).normalized!;
    };
    const short = await make('lib');
    const renamed = await make('engineering');
    expect(short.digest).toEqual(renamed.digest);
    expect(short.modules).toEqual(renamed.modules);
    expect(normalizeOrganization(short)).toEqual({ normalized: short, errors: [] });
  });

  test('excludes annotation documentation/provenance from digest but retains semantic labels and opaque content', async () => {
    const make = async (changes: Partial<OrganizationIR>) => normalizeOrganization((await resolveOrganizationModules(
      loaded('acme/root', 'mem:/root.yml', org('root', changes)), loader({}),
    )).graph!).normalized!;
    const base = await make({ labels: { risk: 'high' }, documentation: 'first', provenance: [{ uri: 'mem:/one' }] });
    const prose = await make({ labels: { risk: 'high' }, documentation: 'second', provenance: [{ uri: 'mem:/two' }] });
    const label = await make({ labels: { risk: 'low' }, documentation: 'first' });
    const opaque = await make({
      labels: { risk: 'high' },
      behaviors: { work: { kind: 'external', inline: { documentation: 'semantically opaque and retained' } } },
    });
    expect(base.digest).toEqual(prose.digest);
    expect(base.digest.value).not.toBe(label.digest.value);
    expect(base.digest.value).not.toBe(opaque.digest.value);
  });

  test('returns no partial normal form for an unresolved reference', async () => {
    const root = loaded('acme/root', 'mem:/root.yml', org('root', {
      actors: { worker: { kind: 'agent', behaviors: ['missing'] } },
    }));
    const result = normalizeOrganization((await resolveOrganizationModules(root, loader({}))).graph!);
    expect(result.normalized).toBeUndefined();
    expect(result.errors).toContain("module 'acme/root' actors.worker.behaviors[0]: unresolved behaviors reference 'missing'");
  });

  test('changes digest for a locked corpus of semantic policy, authority, and instruction mutations', async () => {
    const base: Partial<OrganizationIR> = {
      behaviors: { work: { kind: 'prompt', instructions: { fragments: [{ role: 'constraint', text: 'Never merge.' }] } } },
      capabilities: { code: { resourceKinds: ['repository'], actions: ['read'] } },
      actors: { worker: { kind: 'agent', behaviors: ['work'], capabilities: [{ capability: 'code' }] } },
      policies: { safety: { kind: 'prohibition', rule: 'no-merge', enforcement: 'runtime' } },
    };
    const digest = async (extra: Partial<OrganizationIR>) => normalizeOrganization((await resolveOrganizationModules(
      loaded('acme/root', 'mem:/root.yml', org('root', { ...base, ...extra })), loader({}),
    )).graph!).normalized!.digest.value;
    const original = await digest({});
    expect(await digest({ policies: { safety: { kind: 'prohibition', rule: 'allow-merge', enforcement: 'runtime' } } })).not.toBe(original);
    expect(await digest({ capabilities: { code: { resourceKinds: ['repository'], actions: ['write'] } } })).not.toBe(original);
    expect(await digest({ behaviors: { work: { kind: 'prompt', instructions: { fragments: [{ role: 'constraint', text: 'Merge freely.' }] } } } })).not.toBe(original);
  });
});
