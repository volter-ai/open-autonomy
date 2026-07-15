import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import ts from 'typescript';
import {
  packageContentDigest, packageDeclarationOrigins, registrySnapshotDigest, resolvedPackageFile, resolveLockedPackages, selectRegistryRecord, sha256,
  type CachedPackage, type OrganizationPackageLock, type PackageCache, type RegistrySnapshot,
} from './organization-package';
import { parseOrganizationPackageLock, parseOrganizationPackageManifest, parseRegistrySnapshot } from './organization-package-yaml';

const bytes = (value: string) => new TextEncoder().encode(value);
const minimalOrganization = (name: string) => ({
  schema: 'autonomy.organization.v2' as const, name,
  behaviors: { work: { kind: 'skill' as const, inline: {} } },
  actors: { worker: { kind: 'agent' as const, behaviors: ['work'] } },
});
function pkg(name: string, version: string, contents: Record<string, string>, dependencies: CachedPackage['manifest']['dependencies'] = {}): CachedPackage {
  const files = Object.entries(contents).map(([path, value]) => ({ path, digest: sha256(bytes(value)), bytes: bytes(value).byteLength }));
  return { manifest: { schema: 'autonomy.package.v1', name, version, root: 'organization.yml', files, dependencies }, files: Object.fromEntries(Object.entries(contents).map(([path, value]) => [path, bytes(value)])) };
}
const cache = (values: CachedPackage[]): PackageCache => {
  const byDigest = new Map(values.map((value) => [packageContentDigest(value), value]));
  return { async get(digest) { return byDigest.get(digest); } };
};

function fixture() {
  const libraryOrganization = JSON.stringify(minimalOrganization('library'));
  const library = pkg('dev.open-autonomy/library', '1.0.0', { 'organization.yml': libraryOrganization });
  const libraryDigest = packageContentDigest(library);
  const root = pkg('dev.open-autonomy/root', '1.0.0', { 'organization.yml': JSON.stringify(minimalOrganization('root')) }, {
    library: { name: library.manifest.name, version: library.manifest.version, digest: libraryDigest },
  });
  const rootDigest = packageContentDigest(root);
  const snapshot: RegistrySnapshot = { schema: 'autonomy.registry-snapshot.v1', registry: 'https://registry.example', sequence: 7, generatedAt: '2026-07-15T00:00:00Z', records: [
    { name: root.manifest.name, version: root.manifest.version, digest: rootDigest, locations: ['https://registry.example', 'https://mirror.example'], publishedAt: '2026-07-01T00:00:00Z' },
    { name: library.manifest.name, version: library.manifest.version, digest: libraryDigest, locations: ['https://registry.example'], publishedAt: '2026-07-01T00:00:00Z', yankedAt: '2026-07-14T00:00:00Z' },
    { name: library.manifest.name, version: '99.0.0', digest: sha256('evil'), locations: ['https://attacker.example'], publishedAt: '2026-07-15T00:00:00Z' },
  ] };
  const lock: OrganizationPackageLock = { schema: 'autonomy.package-lock.v1', root: 'root', registrySnapshot: registrySnapshotDigest(snapshot), packages: {
    root: { name: root.manifest.name, version: root.manifest.version, digest: rootDigest, registry: 'https://registry.example', mirrors: ['https://mirror.example'], dependencies: { library: 'library' } },
    library: { name: library.manifest.name, version: library.manifest.version, digest: libraryDigest, registry: 'https://registry.example', dependencies: {} },
  } };
  return { root, library, snapshot, lock };
}

async function resolveSingleArtifact(value: Record<string, unknown>) {
  const artifact = pkg('dev.open-autonomy/artifact', '1.0.0', { 'artifact.yml': JSON.stringify(value) });
  artifact.manifest.root = 'artifact.yml';
  const digest = packageContentDigest(artifact);
  const snapshot: RegistrySnapshot = {
    schema: 'autonomy.registry-snapshot.v1', registry: 'https://registry.example', sequence: 1,
    generatedAt: '2026-07-15T00:00:00Z', records: [{ name: artifact.manifest.name, version: artifact.manifest.version, digest, locations: ['https://registry.example'], publishedAt: '2026-07-15T00:00:00Z' }],
  };
  const lock: OrganizationPackageLock = {
    schema: 'autonomy.package-lock.v1', root: 'artifact', registrySnapshot: registrySnapshotDigest(snapshot),
    packages: { artifact: { name: artifact.manifest.name, version: artifact.manifest.version, digest, registry: snapshot.registry, dependencies: {} } },
  };
  return resolveLockedPackages(lock, snapshot, cache([artifact]));
}

describe('R2 hermetic organization packages', () => {
  test('publishes byte-stable closed schemas and executable YAML profiles', () => {
    const paths = [
      'packages/core/src/generated/organization-package-v1.schema.json',
      'packages/core/src/generated/organization-package-lock-v1.schema.json',
      'packages/core/src/generated/registry-snapshot-v1.schema.json',
    ];
    const before = paths.map((path) => readFileSync(path, 'utf8'));
    expect(spawnSync('bun', ['run', 'organization-spec:schema']).status).toBe(0);
    expect(paths.map((path) => readFileSync(path, 'utf8'))).toEqual(before);
    expect(parseOrganizationPackageManifest(readFileSync('docs/examples/package/package.v1.yml', 'utf8')).schema).toBe('autonomy.package.v1');
    expect(parseOrganizationPackageLock(readFileSync('docs/examples/package/package-lock.v1.yml', 'utf8')).schema).toBe('autonomy.package-lock.v1');
    expect(parseRegistrySnapshot(readFileSync('docs/examples/package/registry-snapshot.v1.yml', 'utf8')).schema).toBe('autonomy.registry-snapshot.v1');
    expect(() => parseOrganizationPackageManifest(readFileSync('docs/examples/package/package.v1.yml', 'utf8') + '\nunknown: true\n')).toThrow("unknown member 'unknown'");
    expect(() => parseOrganizationPackageManifest(readFileSync('docs/examples/package/package.v1.yml', 'utf8').replace('dev.open-autonomy/example', 'UnscopedName'))).toThrow('must match pattern');
    const index = JSON.parse(readFileSync('packages/core/src/generated/artifact-schema-index.json', 'utf8')) as { artifacts: Array<{ schema: string; filename: string }> };
    expect(index.artifacts).toHaveLength(22);
    const discriminated = new Set<string>();
    for (const path of new Bun.Glob('packages/core/src/*.ts').scanSync('.')) {
      if (path.endsWith('.test.ts')) continue;
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) if (ts.isInterfaceDeclaration(statement) && statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) {
        const schema = statement.members.find((member): member is ts.PropertySignature => ts.isPropertySignature(member) && member.name.getText(source) === 'schema');
        if (schema?.type && (ts.isLiteralTypeNode(schema.type) || ts.isTypeQueryNode(schema.type))) discriminated.add(statement.name.text);
      }
    }
    const roots = new Set((index.artifacts as Array<{ root?: string }>).map((item) => item.root));
    for (const root of discriminated) expect(roots.has(root)).toBe(true);
    expect(roots.has('OAManifest')).toBe(true);
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    for (const artifact of index.artifacts) {
      const schema = JSON.parse(readFileSync(`packages/core/src/generated/${artifact.filename}`, 'utf8'));
      expect(() => ajv.compile(schema)).not.toThrow();
    }
  }, 30_000);
  test('resolves equal locks offline to equal graphs and preserves file-level provenance', async () => {
    const { root, library, snapshot, lock } = fixture();
    const first = await resolveLockedPackages(lock, snapshot, cache([root, library]));
    const second = await resolveLockedPackages(structuredClone(lock), structuredClone(snapshot), cache([library, root]));
    expect(first.errors).toEqual([]);
    expect(first.graph?.digest).toBe(second.graph?.digest);
    expect(first.graph?.packages.library.provenance).toEqual([{ package: 'library', digest: packageContentDigest(library), signerKeys: [], path: 'organization.yml' }]);
    expect(packageDeclarationOrigins(first.graph!.packages.library)).toEqual([
      { declaration: 'behaviors/work', package: 'library', digest: packageContentDigest(library), signerKeys: [], sourcePath: 'organization.yml#/behaviors/work' },
      { declaration: 'actors/worker', package: 'library', digest: packageContentDigest(library), signerKeys: [], sourcePath: 'organization.yml#/actors/worker' },
    ]);
    let fetches = 0;
    const offline = await resolveLockedPackages(lock, snapshot, { async get() { return undefined; } }, { async fetch() { fetches++; throw new Error('network'); } }, undefined, { allowNetwork: false });
    expect(offline.errors[0]).toContain('content cache');
    expect(fetches).toBe(0);
  });

  test('makes package content identity independent of map and file-record insertion order', () => {
    const left = pkg('dev.open-autonomy/order', '1.0.0', { 'organization.yml': 'root', 'skills/a.md': 'a' });
    const right = structuredClone(left);
    right.manifest.files.reverse();
    right.files = { 'skills/a.md': right.files['skills/a.md']!, 'organization.yml': right.files['organization.yml']! };
    expect(packageContentDigest(left)).toBe(packageContentDigest(right));
    const vector = pkg('dev.open-autonomy/vector', '1.0.0', { 'organization.yml': 'name: vector' });
    expect(packageContentDigest(vector)).toBe('sha256:8cdfc757775484faa5fc1fb1078fb0d893d97717da1ff9442ac41e5444eab2f1');
  });

  test('ignores higher-version dependency confusion and permits a yanked package only because it is exactly locked', async () => {
    const { root, library, snapshot, lock } = fixture();
    const result = await resolveLockedPackages(lock, snapshot, cache([root, library]));
    expect(result.errors).toEqual([]);
    expect(result.graph?.packages.library.lock.version).toBe('1.0.0');
    expect(() => selectRegistryRecord(snapshot, library.manifest.name, '1.0.0')).toThrow('was yanked');
    expect(() => selectRegistryRecord(snapshot, library.manifest.name, '99.0.0')).not.toThrow();
  });

  test('rejects mirror substitution, revocation, incomplete locks, unsafe paths, and resource exhaustion', async () => {
    const { root, library, snapshot, lock } = fixture();
    const substituted = structuredClone(root); substituted.files['organization.yml'] = bytes('attacker');
    expect((await resolveLockedPackages(lock, snapshot, cache([substituted, library]))).errors[0]).toContain('failed integrity');

    const revoked = structuredClone(snapshot); revoked.records[0]!.revokedAt = '2026-07-15T01:00:00Z';
    const revokedLock = structuredClone(lock); revokedLock.registrySnapshot = registrySnapshotDigest(revoked);
    expect((await resolveLockedPackages(revokedLock, revoked, cache([root, library]))).errors[0]).toContain('revoked');

    const incomplete = structuredClone(lock); incomplete.packages.root.dependencies = {};
    expect((await resolveLockedPackages(incomplete, snapshot, cache([root, library]))).errors[0]).toContain('dependency lock is incomplete');
    const extra = structuredClone(lock); extra.packages.unused = structuredClone(extra.packages.library);
    expect((await resolveLockedPackages(extra, snapshot, cache([root, library]))).errors[0]).toContain('unreachable packages: unused');

    const unsafe = pkg('dev.open-autonomy/unsafe', '1.0.0', { '../organization.yml': 'bad', 'organization.yml': 'root' });
    const unsafeDigest = packageContentDigest(unsafe);
    const unsafeSnapshot: RegistrySnapshot = { ...snapshot, records: [{ name: unsafe.manifest.name, version: unsafe.manifest.version, digest: unsafeDigest, locations: ['https://registry.example'], publishedAt: '2026-07-01T00:00:00Z' }] };
    const unsafeLock: OrganizationPackageLock = { schema: 'autonomy.package-lock.v1', root: 'unsafe', registrySnapshot: registrySnapshotDigest(unsafeSnapshot), packages: { unsafe: { name: unsafe.manifest.name, version: unsafe.manifest.version, digest: unsafeDigest, registry: 'https://registry.example', dependencies: {} } } };
    expect((await resolveLockedPackages(unsafeLock, unsafeSnapshot, cache([unsafe]))).errors[0]).toContain('must match pattern');
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { maxTotalBytes: 1 })).errors[0]).toContain('exceeds 1 bytes');
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { minimumRegistrySequence: 8 })).errors[0]).toContain('below trusted checkpoint 8');
    const ambiguous = structuredClone(snapshot); ambiguous.records.push({ ...ambiguous.records[1]!, digest: sha256('other') });
    const ambiguousLock = structuredClone(lock); ambiguousLock.registrySnapshot = registrySnapshotDigest(ambiguous);
    expect((await resolveLockedPackages(ambiguousLock, ambiguous, cache([root, library]))).errors[0]).toContain('ambiguous record');
  });

  test('rejects structurally distinct content hidden behind the same projected digest', async () => {
    const { root, library, snapshot, lock } = fixture();
    const malicious = structuredClone(root) as CachedPackage & { manifest: CachedPackage['manifest'] & { ignored?: string } };
    malicious.manifest.ignored = 'this member was formerly omitted from the digest projection';
    expect(packageContentDigest(malicious)).toBe(lock.packages.root.digest);
    const result = await resolveLockedPackages(lock, snapshot, cache([malicious, library]));
    expect(result.errors[0]).toContain("unknown member 'ignored'");
  });

  test('tries approved mirrors in declared order after a corrupt candidate', async () => {
    const { root, library, snapshot, lock } = fixture();
    const corrupt = structuredClone(root) as CachedPackage & { manifest: CachedPackage['manifest'] & { ignored?: string } };
    corrupt.manifest.ignored = 'corrupt';
    const attempted: string[] = [];
    const result = await resolveLockedPackages(lock, snapshot, cache([library]), {
      async fetch(location) { attempted.push(location); return location === lock.packages.root.registry ? corrupt : root; },
    }, undefined, { allowNetwork: true });
    expect(result.errors).toEqual([]);
    expect(attempted).toEqual(['https://registry.example', 'https://mirror.example']);
  });

  test('bounds package metadata and registry cardinality before resolution', async () => {
    const { root, library, snapshot, lock } = fixture();
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { maxLockBytes: 1 })).errors[0]).toContain('package lock exceeds 1 metadata bytes');
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { maxSnapshotBytes: 1 })).errors[0]).toContain('registry snapshot exceeds 1 metadata bytes');
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { maxRegistryRecords: 1 })).errors[0]).toContain('registry snapshot exceeds 1 records');
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, undefined, { maxFilesPerPackage: 0 })).errors[0]).toContain('manifest exceeds 0 files');
  });

  test('validates indexed artifact roots and traces generic fields for profiles, components, and compiler artifacts', async () => {
    const profile = await resolveSingleArtifact({ schema: 'autonomy.profile.v1', name: 'profile', template: minimalOrganization('template') });
    expect(profile.errors).toEqual([]);
    expect(packageDeclarationOrigins(profile.graph!.packages.artifact).some((origin) => origin.sourcePath === 'artifact.yml#/template/name')).toBe(true);

    const component = await resolveSingleArtifact({
      schema: 'autonomy.component.v2', id: 'component', version: '1.0.0', configuration: { id: 'config', version: '1' },
      facets: {}, interfaces: {}, state: [], trust: [],
      failure: { detection: [], recovery: [], evidence: { assurance: 'asserted' } },
      topology: { mode: 'embedded', minimumInstances: 1, isolation: 'process', evidence: { assurance: 'asserted' } },
    });
    expect(component.errors).toEqual([]);
    expect(packageDeclarationOrigins(component.graph!.packages.artifact).some((origin) => origin.sourcePath === 'artifact.yml#/topology/mode')).toBe(true);

    const control = await resolveSingleArtifact({
      schema: 'autonomy.control.v1', organization: 'org', contract: { assumptions: [], guarantees: [], observations: {} }, actors: {}, work: {}, enforcements: [],
    });
    expect(control.errors).toEqual([]);
    expect(packageDeclarationOrigins(control.graph!.packages.artifact).some((origin) => origin.sourcePath === 'artifact.yml#/contract/guarantees')).toBe(true);

    const invalid = await resolveSingleArtifact({ schema: 'autonomy.profile.v1', name: 'missing-template' });
    expect(invalid.errors[0]).toContain('invalid root artifact');
  });

  test('snapshots verified bytes and keeps authoritative provenance immutable after resolution', async () => {
    const { root, library, snapshot, lock } = fixture();
    const result = await resolveLockedPackages(lock, snapshot, cache([root, library]));
    expect(result.errors).toEqual([]);
    const resolved = result.graph!.packages.library;
    const beforeBytes = resolvedPackageFile(resolved, 'organization.yml');
    const beforeOrigins = packageDeclarationOrigins(resolved);
    root.files['organization.yml']?.fill(0);
    library.files['organization.yml']?.fill(0);
    expect(resolvedPackageFile(resolved, 'organization.yml')).toEqual(beforeBytes);
    expect(() => { (resolved.files['organization.yml'] as number[]).fill(0); }).toThrow();
    expect(packageDeclarationOrigins(resolved)).toEqual(beforeOrigins);
    expect(() => { resolved.manifest.root = 'mutated.yml'; }).toThrow();
    expect(() => { resolved.declarationOrigins[0]!.sourcePath = 'mutated'; }).toThrow();
  });

  test('isolates lock, registry, manifest, dependency, and signature state across verifier awaits', async () => {
    const { root, library, snapshot, lock } = fixture();
    root.manifest.signatures = [{ algorithm: 'test', keyId: 'release-key', value: 'valid', covers: 'package-digest' }];
    const originalRoot = root.manifest.root;
    const originalDependency = root.manifest.dependencies!.library!.name;
    const result = await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, {
      async verify(signature) {
        root.manifest.root = 'mutated.yml';
        root.manifest.dependencies!.library!.name = 'dev.attacker/confused';
        root.manifest.signatures![0]!.keyId = 'attacker-key';
        lock.packages.root.dependencies.library = 'mutated-target';
        snapshot.records[0]!.signerKeys = ['attacker-key'];
        signature.keyId = 'mutated-copy';
        await Promise.resolve();
        return true;
      },
    }, { requireSignatures: false });
    expect(result.errors).toEqual([]);
    const resolved = result.graph!.packages.root;
    expect(resolved.manifest.root).toBe(originalRoot);
    expect(resolved.manifest.dependencies!.library!.name).toBe(originalDependency);
    expect(resolved.manifest.signatures![0]!.keyId).toBe('release-key');
    expect(resolved.lock.dependencies.library).toBe('library');
    expect(() => { resolved.manifest.dependencies!.library!.name = 'mutated'; }).toThrow();
    expect(() => { resolved.manifest.signatures![0]!.keyId = 'mutated'; }).toThrow();
  });

  test('snapshots offline and signature policy before cache awaits', async () => {
    const offline = fixture();
    const offlinePolicy = { allowNetwork: false };
    let fetches = 0;
    const offlineResult = await resolveLockedPackages(offline.lock, offline.snapshot, {
      async get() { offlinePolicy.allowNetwork = true; return undefined; },
    }, { async fetch() { fetches++; return offline.root; } }, undefined, offlinePolicy);
    expect(offlineResult.errors[0]).toContain('content cache');
    expect(fetches).toBe(0);

    const signed = fixture();
    const signaturePolicy = { requireSignatures: true };
    const signatureResult = await resolveLockedPackages(signed.lock, signed.snapshot, {
      async get(digest) { signaturePolicy.requireSignatures = false; return cache([signed.root, signed.library]).get(digest); },
    }, undefined, undefined, signaturePolicy);
    expect(signatureResult.errors[0]).toContain('unsigned');
  });

  test('requires cryptographic verification and rejects unpinned or revoked signer identities', async () => {
    const { root, library, snapshot, lock } = fixture();
    root.manifest.signatures = [{ algorithm: 'test', keyId: 'release-key', value: 'valid', covers: 'package-digest' }];
    lock.packages.root.signerKeys = ['release-key'];
    snapshot.records[0]!.signerKeys = ['release-key'];
    lock.registrySnapshot = registrySnapshotDigest(snapshot);
    const verifier = { async verify(signature: { value: string }) { return signature.value === 'valid'; } };
    expect((await resolveLockedPackages(lock, snapshot, cache([root, library]), undefined, verifier)).errors).toEqual([]);
    const revoked = structuredClone(snapshot); revoked.revokedKeys = ['release-key'];
    const revokedLock = structuredClone(lock); revokedLock.registrySnapshot = registrySnapshotDigest(revoked);
    expect((await resolveLockedPackages(revokedLock, revoked, cache([root, library]), undefined, verifier)).errors[0]).toContain("revoked key 'release-key'");
    const unsigned = fixture();
    expect((await resolveLockedPackages(unsigned.lock, unsigned.snapshot, cache([unsigned.root, unsigned.library]), undefined, verifier, { requireSignatures: true })).errors[0]).toContain('unsigned');
  });
});
