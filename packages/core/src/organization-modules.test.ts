import { describe, expect, test } from 'bun:test';
import type { OrganizationIR, SourceRef } from './organization-ir';
import {
  qualifyDeclaration,
  resolveOrganizationReferences,
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

const loaded = (moduleId: string, location: string, value: OrganizationIR, digest?: string, bytes?: number): LoadedOrganizationModule => ({
  moduleId: moduleId as ModuleId, location, organization: value, digest, bytes,
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

  test('checks an authored expected logical identity instead of trusting the loader', async () => {
    const library = loaded('acme/other', 'mem:/library.yml', organization('library'));
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', {
      imports: { library: { source: { uri: 'library' }, module: 'acme/library' } },
    }));
    const result = await resolveOrganizationModules(root, memoryLoader({ library }));
    expect(result.errors).toContain("module 'acme/root' import 'library': logical module identity mismatch: expected 'acme/library', got 'acme/other'");
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
    const byteBounded = await resolveOrganizationModules(
      loaded('acme/root', 'mem:/root.yml', organization('root', { imports: { child: { source: { uri: 'child' } } } }), undefined, 50),
      memoryLoader({ child }), { maxTotalBytes: 60 },
    );
    expect(byteBounded.errors).toContain('module graph exceeds 60 bytes');
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

  test('satisfies identity, associativity, and order independence for disjoint import signatures', async () => {
    const modules = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
      const key = `m${index}`;
      return [key, loaded(`acme/${key}`, `mem:/${key}.yml`, organization(key), `sha256:${key}`)];
    }));
    const loader = memoryLoader(modules);
    const imports = Object.fromEntries(Object.keys(modules).map((key) => [key, { source: { uri: key } }]));
    const resolve = async (parts: Array<Record<string, { source: { uri: string } }>>) =>
      resolveOrganizationModules(loaded('acme/root', 'mem:/root.yml', organization('root', { imports: Object.assign({}, ...parts) })), loader);
    const empty = await resolve([]);
    const emptyExplicit = await resolve([{}]);
    expect(empty).toEqual(emptyExplicit);
    for (let splitA = 0; splitA <= 12; splitA += 3) {
      const keys = Object.keys(imports);
      const a = Object.fromEntries(keys.slice(0, splitA).map((key) => [key, imports[key]]));
      const b = Object.fromEntries(keys.slice(splitA, 8).map((key) => [key, imports[key]]));
      const c = Object.fromEntries(keys.slice(8).map((key) => [key, imports[key]]));
      const left = await resolve([Object.assign({}, a, b), c]);
      const right = await resolve([a, Object.assign({}, b, c)]);
      const permuted = await resolve([c, a, b]);
      expect(left).toEqual(right);
      expect(left).toEqual(permuted);
    }
  });

  test('rejects one canonical identity loaded from unverifiably different locations', async () => {
    const first = loaded('acme/shared', 'mem:/one.yml', organization('shared'));
    const second = loaded('acme/shared', 'mem:/two.yml', organization('shared'));
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', { imports: {
      first: { source: { uri: 'one' } }, second: { source: { uri: 'two' } },
    } }));
    const result = await resolveOrganizationModules(root, memoryLoader({ one: first, two: second }));
    expect(result.errors).toContain("module 'acme/shared': multiple locations require one matching digest");
  });

  test('rejects non-ASCII/confusable canonical ids and namespaces', async () => {
    const child = loaded('acme/child', 'mem:/child.yml', organization('child'));
    const badNamespace = loaded('acme/root', 'mem:/root.yml', organization('root', {
      imports: { child: { source: { uri: 'child' }, namespace: 'téam' } },
    }));
    expect((await resolveOrganizationModules(badNamespace, memoryLoader({ child }))).errors)
      .toContain("module 'acme/root' import 'child': invalid namespace 'téam'");
    const badId = loaded('acme/teаm', 'mem:/bad.yml', organization('bad')); // contains Cyrillic а
    expect((await resolveOrganizationModules(badId, memoryLoader({}))).errors)
      .toContain("module 'acme/teаm': invalid canonical module id");
  });

  test('closes and sort-checks local and namespaced references without flattening modules', async () => {
    const library = loaded('acme/lib', 'mem:/lib.yml', organization('lib', {
      types: { request: { schema: { type: 'object' } } },
      tools: { edit: { protocol: 'mcp' } },
      behaviors: { work: { kind: 'skill', source: { uri: './work.md' }, inputs: { request: 'request' }, tools: ['edit'] } },
    }));
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', {
      imports: { lib: { source: { uri: 'lib' } } },
      actors: { worker: { kind: 'agent', behaviors: ['lib/work'] } },
    }));
    const resolved = await resolveOrganizationModules(root, memoryLoader({ lib: library }));
    const references = resolveOrganizationReferences(resolved.graph!);
    expect(references.errors).toEqual([]);
    expect(references.references).toContainEqual(expect.objectContaining({
      module: root.moduleId, path: 'actors.worker.behaviors[0]', target: qualifyDeclaration(library.moduleId, 'behaviors', 'work'),
      source: { location: 'mem:/root.yml', path: 'actors.worker.behaviors[0]' },
      declaration: { module: library.moduleId, location: 'mem:/lib.yml', path: 'behaviors/work' },
    }));
    expect(references.references).toContainEqual(expect.objectContaining({
      module: library.moduleId, path: 'behaviors.work.inputs.request', target: qualifyDeclaration(library.moduleId, 'types', 'request'),
    }));
  });

  test('enforces named-symbol visibility and validates selected declarations eagerly', async () => {
    const library = loaded('acme/lib', 'mem:/lib.yml', organization('lib', {
      behaviors: {
        visible: { kind: 'skill', source: { uri: './visible.md' } },
        hidden: { kind: 'skill', source: { uri: './hidden.md' } },
      },
      actors: { worker: { kind: 'agent', behaviors: ['visible'] } },
    }));
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', {
      imports: { lib: { source: { uri: 'lib' }, symbols: { behaviors: ['visible'] } } },
      actors: { worker: { kind: 'agent', behaviors: ['lib/hidden'] } },
    }));
    const graph = (await resolveOrganizationModules(root, memoryLoader({ lib: library }))).graph!;
    expect(resolveOrganizationReferences(graph).errors).toContain(
      "module 'acme/root' actors.worker.behaviors[0]: unresolved behaviors reference 'lib/hidden'",
    );

    root.organization.imports!.lib.symbols = { behaviors: ['missing'] };
    const invalid = await resolveOrganizationModules(root, memoryLoader({ lib: library }));
    expect(invalid.errors).toContain("module 'acme/root' import 'lib': symbols.behaviors: missing declaration 'missing'");
  });

  test('applies explicit URI-scheme and digest policy before invoking the loader', async () => {
    let calls = 0;
    const loader: OrganizationModuleLoader = { async load() { calls++; throw new Error('must not load'); } };
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', { imports: {
      forbidden: { source: { uri: 'https://example.invalid/a.yml' } },
      unpinned: { source: { uri: 'oci:example/org:latest' } },
    } }));
    const result = await resolveOrganizationModules(root, loader, {
      allowedSchemes: ['oci'], requireDigestForSchemes: ['oci'],
    });
    expect(calls).toBe(0);
    expect(result.errors).toEqual([
      "module 'acme/root' import 'forbidden': URI scheme 'https' is not allowed",
      "module 'acme/root' import 'unpinned': scheme 'oci' requires a digest",
    ]);
  });

  test('rejects missing, wrong-sort, ambiguous union-sort, and namespace-shadowed references', async () => {
    const child = loaded('acme/child', 'mem:/child.yml', organization('child'));
    const root = loaded('acme/root', 'mem:/root.yml', organization('root', {
      imports: { team: { source: { uri: 'child' } } },
      behaviors: { work: { kind: 'skill', source: { uri: './work.md' }, tools: ['missing'] } },
      actors: {
        worker: { kind: 'agent', behaviors: ['work'], reportsTo: ['both'] },
        both: { kind: 'agent', behaviors: ['work'] },
        'team/local': { kind: 'agent', behaviors: ['work'] },
      },
      units: { both: { kind: 'team' } },
    }));
    const resolved = await resolveOrganizationModules(root, memoryLoader({ child }));
    const references = resolveOrganizationReferences(resolved.graph!);
    expect(references.errors).toContain("module 'acme/root' behaviors.work.tools[0]: unresolved tools reference 'missing'");
    expect(references.errors).toContain("module 'acme/root' actors.worker.reportsTo[0]: ambiguous reference 'both' matches actors, units");
    expect(references.errors).toContain("module 'acme/root' actors.team/local: local id is ambiguous with namespace 'team'");
  });
});
