import { describe, expect, test } from 'bun:test';
import type { OrganizationIR, SourceRef } from './organization-ir';
import {
  qualifyDeclaration,
  resolveOrganizationModules,
  resolveQualifiedReference,
  type LoadedOrganizationModule,
  type ModuleId,
  type OrganizationModuleLoader,
} from './organization-modules';

const organization = (name: string, extra: Partial<OrganizationIR> = {}): OrganizationIR => ({
  schema: 'autonomy.organization.v2', name,
  behaviors: { work: { kind: 'skill', source: { uri: `./${name}.md` } } },
  actors: { worker: { kind: 'agent', behaviors: ['work'] } },
  ...extra,
});

const loaded = (moduleId: string, location: string, value: OrganizationIR, digest?: string): LoadedOrganizationModule => ({
  moduleId: moduleId as ModuleId, location, organization: value, digest,
});

function memoryLoader(entries: Record<string, LoadedOrganizationModule>): OrganizationModuleLoader {
  return {
    async load(source: SourceRef, importer?: LoadedOrganizationModule) {
      const key = source.uri.startsWith('./') && importer
        ? `${importer.location.slice(0, importer.location.lastIndexOf('/') + 1)}${source.uri.slice(2)}`
        : source.uri;
      const result = entries[key];
      if (!result) throw new Error(`not found: ${key}`);
      return structuredClone(result);
    },
  };
}

describe('P1 organization module graph', () => {
  test('resolves namespaced references to alias-independent stable identities', async () => {
    const library = loaded('acme/engineering', 'mem:/lib/engineering.yml', organization('engineering'), 'sha256:eng');
    const makeRoot = (alias: string) => loaded('acme/root', 'mem:/root/main.yml', organization('root', {
      imports: { dependency: { source: { uri: '../lib/engineering.yml', digest: 'sha256:eng' }, namespace: alias } },
    }));
    const loader = memoryLoader({ '../lib/engineering.yml': library });
    // This loader deliberately treats the non-./ URI as already canonical for the fixture.
    const first = await resolveOrganizationModules(makeRoot('eng'), loader);
    const second = await resolveOrganizationModules(makeRoot('engineering'), loader);
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(resolveQualifiedReference(first.graph!, first.graph!.root, 'behaviors', 'eng/work'))
      .toBe(qualifyDeclaration(library.moduleId, 'behaviors', 'work'));
    expect(resolveQualifiedReference(second.graph!, second.graph!.root, 'behaviors', 'engineering/work'))
      .toBe(qualifyDeclaration(library.moduleId, 'behaviors', 'work'));
  });

  test('reports a complete import cycle and returns no partial graph', async () => {
    const a = loaded('acme/a', 'mem:/a.yml', organization('a', { imports: { b: { source: { uri: 'b' } } } }));
    const b = loaded('acme/b', 'mem:/b.yml', organization('b', { imports: { a: { source: { uri: 'a' } } } }));
    const result = await resolveOrganizationModules(a, memoryLoader({ a, b }));
    expect(result.graph).toBeUndefined();
    expect(result.errors).toContain('import cycle: acme/a -> acme/b -> acme/a');
  });

  test('rejects digest substitution, duplicate namespaces, and bounded-graph overflow deterministically', async () => {
    const child = loaded('acme/child', 'mem:/child.yml', organization('child'), 'sha256:actual');
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', { imports: {
      one: { source: { uri: 'child', digest: 'sha256:expected' }, namespace: 'same' },
      two: { source: { uri: 'child' }, namespace: 'same' },
    } }));
    const result = await resolveOrganizationModules(root, memoryLoader({ child }), { maxModules: 1 });
    expect(result.graph).toBeUndefined();
    expect(result.errors).toEqual([
      "module 'acme/root' import 'one': digest mismatch for 'child': expected sha256:expected, got sha256:actual",
      "module 'acme/root': duplicate namespace 'same'",
    ]);
    const bounded = await resolveOrganizationModules(
      loaded('acme/root', 'mem:/root.yml', organization('root', { imports: { child: { source: { uri: 'child' } } } })),
      memoryLoader({ child }), { maxModules: 1 },
    );
    expect(bounded.errors).toContain('module graph exceeds 1 modules');
  });

  test('sorts modules and errors independently of authored import map order', async () => {
    const a = loaded('acme/a', 'mem:/a.yml', organization('a'));
    const z = loaded('acme/z', 'mem:/z.yml', organization('z'));
    const run = async (imports: OrganizationIR['imports']) => resolveOrganizationModules(
      loaded('acme/root', 'mem:/root.yml', organization('root', { imports })), memoryLoader({ a, z }),
    );
    const left = await run({ zed: { source: { uri: 'z' } }, alpha: { source: { uri: 'a' } } });
    const right = await run({ alpha: { source: { uri: 'a' } }, zed: { source: { uri: 'z' } } });
    expect(Object.keys(left.graph?.modules ?? {})).toEqual(['acme/a', 'acme/root', 'acme/z']);
    expect(left).toEqual(right);
  });
});
