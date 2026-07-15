import { createHash } from 'node:crypto';
import { canonicalSemanticJson } from './organization-canonical';
import type { OrganizationCatalogName } from './organization-ir';
import { artifactFieldPointers, parseArtifactRoot, type ParsedArtifactRoot } from './organization-artifact';
import { structuralErrors, validatePackageLock, validatePackageManifest, validateRegistrySnapshot } from './organization-package-structural';

export type PackageDigest = `sha256:${string}`;

export interface PackageFileRecord {
  path: string;
  digest: PackageDigest;
  bytes: number;
  mediaType?: string;
}

export interface PackageDependency {
  name: string;
  version: string;
  digest: PackageDigest;
}

export interface PackageSignature {
  algorithm: string;
  keyId: string;
  value: string;
  covers: 'package-digest';
}

export interface OrganizationPackageManifest {
  schema: 'autonomy.package.v1';
  name: string;
  version: string;
  root: string;
  files: PackageFileRecord[];
  dependencies?: Record<string, PackageDependency>;
  signatures?: PackageSignature[];
  provenance?: { source: string; revision?: string; builder?: string };
}

export interface PackageLockEntry {
  name: string;
  version: string;
  digest: PackageDigest;
  registry: string;
  mirrors?: string[];
  dependencies: Record<string, string>;
  signerKeys?: string[];
}

export interface OrganizationPackageLock {
  schema: 'autonomy.package-lock.v1';
  root: string;
  registrySnapshot: PackageDigest;
  packages: Record<string, PackageLockEntry>;
}

export interface RegistryVersionRecord {
  name: string;
  version: string;
  digest: PackageDigest;
  locations: string[];
  signerKeys?: string[];
  publishedAt: string;
  yankedAt?: string;
  revokedAt?: string;
}

export interface RegistrySnapshot {
  schema: 'autonomy.registry-snapshot.v1';
  registry: string;
  sequence: number;
  generatedAt: string;
  records: RegistryVersionRecord[];
  revokedKeys?: string[];
}

export interface ArtifactSchemaIndexEntry { schema: string; root: string; filename: string; }
export interface ArtifactSchemaIndex {
  schema: 'autonomy.artifact-schema-index.v1';
  artifacts: ArtifactSchemaIndexEntry[];
}

export interface CachedPackage {
  manifest: OrganizationPackageManifest;
  files: Record<string, Uint8Array>;
}

export interface PackageCache {
  get(digest: PackageDigest): Promise<CachedPackage | undefined>;
}

export interface PackageFetcher {
  fetch(location: string, digest: PackageDigest): Promise<CachedPackage>;
}

export interface PackageSignatureVerifier {
  verify(signature: PackageSignature, digest: PackageDigest): Promise<boolean>;
}

export interface LockedResolutionPolicy {
  maxPackages?: number;
  maxDepth?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  requireSignatures?: boolean;
  allowNetwork?: boolean;
  minimumRegistrySequence?: number;
  maxLockBytes?: number;
  maxSnapshotBytes?: number;
  maxManifestBytes?: number;
  maxFilesPerPackage?: number;
  maxDependenciesPerPackage?: number;
  maxSignaturesPerPackage?: number;
  maxRegistryRecords?: number;
  maxLocationsPerRecord?: number;
}

export interface ResolvedPackage {
  key: string;
  lock: PackageLockEntry;
  manifest: OrganizationPackageManifest;
  files: Readonly<Record<string, readonly number[]>>;
  provenance: Array<{ package: string; digest: PackageDigest; signerKeys: string[]; path: string }>;
  declarationOrigins: PackageDeclarationOrigin[];
}

export interface LockedPackageGraph {
  root: string;
  packages: Record<string, ResolvedPackage>;
  digest: PackageDigest;
}

export interface PackageDeclarationOrigin {
  declaration: string;
  package: string;
  digest: PackageDigest;
  signerKeys: string[];
  sourcePath: string;
}

export function sha256(bytes: Uint8Array | string): PackageDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function packageContentDigest(pkg: CachedPackage): PackageDigest {
  const files = [...pkg.manifest.files].sort((a, b) => compareText(a.path, b.path)).map((record) => ({
    path: record.path, digest: record.digest, bytes: record.bytes, mediaType: record.mediaType,
  }));
  return sha256(canonicalSemanticJson({
    schema: pkg.manifest.schema, name: pkg.manifest.name, version: pkg.manifest.version,
    root: pkg.manifest.root, files, dependencies: pkg.manifest.dependencies ?? {}, provenance: pkg.manifest.provenance,
  }));
}

export function registrySnapshotDigest(snapshot: RegistrySnapshot): PackageDigest {
  return sha256(canonicalSemanticJson(snapshot));
}

export function packageDeclarationOrigins(pkg: ResolvedPackage): PackageDeclarationOrigin[] {
  return structuredClone(pkg.declarationOrigins);
}

export function resolvedPackageFile(pkg: ResolvedPackage, path: string): Uint8Array | undefined {
  const bytes = pkg.files[path];
  return bytes ? Uint8Array.from(bytes) : undefined;
}

/** Exact lock creation primitive. Version-range policy is deliberately outside the hermetic resolver. */
export function selectRegistryRecord(snapshot: RegistrySnapshot, name: string, version: string): RegistryVersionRecord {
  const matches = snapshot.records.filter((record) => record.name === name && record.version === version);
  if (matches.length !== 1) throw new Error(matches.length ? `ambiguous registry version '${name}@${version}'` : `missing registry version '${name}@${version}'`);
  const record = matches[0]!;
  if (record.yankedAt) throw new Error(`registry version '${name}@${version}' was yanked at ${record.yankedAt}`);
  if (record.revokedAt) throw new Error(`registry version '${name}@${version}' was revoked at ${record.revokedAt}`);
  return structuredClone(record);
}

export async function resolveLockedPackages(
  lock: OrganizationPackageLock,
  snapshot: RegistrySnapshot,
  cache: PackageCache,
  fetcher?: PackageFetcher,
  verifier?: PackageSignatureVerifier,
  policy: LockedResolutionPolicy = {},
): Promise<{ graph?: LockedPackageGraph; errors: string[] }> {
  policy = structuredClone(policy);
  const errors: string[] = [];
  const maxPackages = policy.maxPackages ?? 256;
  const maxDepth = policy.maxDepth ?? 32;
  const maxTotalBytes = policy.maxTotalBytes ?? 256 * 1024 * 1024;
  const maxFileBytes = policy.maxFileBytes ?? 32 * 1024 * 1024;
  const maxLockBytes = policy.maxLockBytes ?? 8 * 1024 * 1024;
  const maxSnapshotBytes = policy.maxSnapshotBytes ?? 32 * 1024 * 1024;
  const maxManifestBytes = policy.maxManifestBytes ?? 4 * 1024 * 1024;
  const maxFilesPerPackage = policy.maxFilesPerPackage ?? 10_000;
  const maxDependenciesPerPackage = policy.maxDependenciesPerPackage ?? 1_000;
  const maxSignaturesPerPackage = policy.maxSignaturesPerPackage ?? 64;
  const maxRegistryRecords = policy.maxRegistryRecords ?? 100_000;
  const maxLocationsPerRecord = policy.maxLocationsPerRecord ?? 32;
  if (jsonBytes(lock) > maxLockBytes) return { errors: [`package lock exceeds ${maxLockBytes} metadata bytes`] };
  if (jsonBytes(snapshot) > maxSnapshotBytes) return { errors: [`registry snapshot exceeds ${maxSnapshotBytes} metadata bytes`] };
  lock = structuredClone(lock);
  snapshot = structuredClone(snapshot);
  if (!validatePackageLock(lock)) return { errors: [`invalid package lock: ${structuralErrors(validatePackageLock).join('; ')}`] };
  if (!validateRegistrySnapshot(snapshot)) return { errors: [`invalid registry snapshot: ${structuralErrors(validateRegistrySnapshot).join('; ')}`] };
  if (snapshot.records.length > maxRegistryRecords) return { errors: [`registry snapshot exceeds ${maxRegistryRecords} records`] };
  if (snapshot.records.some((record) => record.locations.length > maxLocationsPerRecord)) return { errors: [`registry record exceeds ${maxLocationsPerRecord} locations`] };
  if (lock.schema !== 'autonomy.package-lock.v1') return { errors: ['unsupported package lock schema'] };
  if (registrySnapshotDigest(snapshot) !== lock.registrySnapshot) return { errors: ['registry snapshot digest mismatch'] };
  if (policy.minimumRegistrySequence !== undefined && snapshot.sequence < policy.minimumRegistrySequence)
    return { errors: [`registry snapshot sequence ${snapshot.sequence} is below trusted checkpoint ${policy.minimumRegistrySequence}`] };
  if (!lock.packages[lock.root]) return { errors: [`locked root '${lock.root}' is missing`] };
  if (Object.keys(lock.packages).length > maxPackages) return { errors: [`lock exceeds ${maxPackages} packages`] };
  const records = new Map<string, RegistryVersionRecord>();
  const versions = new Map<string, PackageDigest>();
  for (const record of snapshot.records) {
    const key = `${record.name}@${record.version}:${record.digest}`;
    const version = `${record.name}@${record.version}`;
    if (records.has(key) || (versions.has(version) && versions.get(version) !== record.digest))
      return { errors: [`registry snapshot has ambiguous record '${version}'`] };
    records.set(key, record); versions.set(version, record.digest);
  }
  const resolved: Record<string, ResolvedPackage> = {};
  const visiting = new Set<string>();
  let totalBytes = 0;

  const visit = async (key: string, depth: number): Promise<void> => {
    if (errors.length) return;
    if (depth > maxDepth) { errors.push(`package graph exceeds depth ${maxDepth}`); return; }
    if (resolved[key]) return;
    if (visiting.has(key)) { errors.push(`package dependency cycle at '${key}'`); return; }
    const entry = lock.packages[key];
    if (!entry) { errors.push(`lock references missing package '${key}'`); return; }
    if (Object.keys(entry.dependencies).length > maxDependenciesPerPackage) { errors.push(`locked package '${key}' exceeds ${maxDependenciesPerPackage} dependencies`); return; }
    const record = records.get(`${entry.name}@${entry.version}:${entry.digest}`);
    if (!record) { errors.push(`locked package '${key}' is absent from pinned registry snapshot`); return; }
    if (record.revokedAt) { errors.push(`locked package '${key}' was revoked at ${record.revokedAt}`); return; }
    if (entry.registry !== snapshot.registry) { errors.push(`locked package '${key}' registry differs from pinned snapshot`); return; }
    if (record.locations.every((location) => location !== entry.registry && !(entry.mirrors ?? []).includes(location))) {
      errors.push(`locked package '${key}' has no approved registry or mirror location`); return;
    }
    const cached = await cache.get(entry.digest);
    let pkg = cached ? structuredClone(cached) : undefined;
    const candidateFailures: string[] = [];
    if (pkg) {
      const failure = candidateFailure(pkg, entry, { maxManifestBytes, maxFilesPerPackage, maxDependenciesPerPackage, maxSignaturesPerPackage, maxFileBytes });
      if (failure) { candidateFailures.push(`cache: ${failure}`); pkg = undefined; }
    }
    if (!pkg && policy.allowNetwork && fetcher) {
      const locations = [entry.registry, ...(entry.mirrors ?? [])].filter((location) => record.locations.includes(location));
      for (const location of locations) {
        try {
          const candidate = structuredClone(await fetcher.fetch(location, entry.digest));
          const failure = candidateFailure(candidate, entry, { maxManifestBytes, maxFilesPerPackage, maxDependenciesPerPackage, maxSignaturesPerPackage, maxFileBytes });
          if (failure) { candidateFailures.push(`${location}: ${failure}`); continue; }
          pkg = candidate; break;
        } catch (error) { candidateFailures.push(`${location}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    if (!pkg) { errors.push(`locked package '${key}' is unavailable${candidateFailures.length ? ` (${candidateFailures.join(' | ')})` : ' in the content cache'}`); return; }
    if (pkg.manifest.name !== entry.name || pkg.manifest.version !== entry.version) {
      errors.push(`locked package '${key}' manifest identity mismatch`); return;
    }
    if (packageContentDigest(pkg) !== entry.digest) { errors.push(`locked package '${key}' content digest mismatch`); return; }
    const declared = new Map(pkg.manifest.files.map((file) => [file.path, file]));
    if (declared.size !== pkg.manifest.files.length) { errors.push(`locked package '${key}' has duplicate file paths`); return; }
    if (!declared.has(pkg.manifest.root)) { errors.push(`locked package '${key}' root is not a declared file`); return; }
    for (const [path, file] of Object.entries(pkg.files)) {
      const declaration = declared.get(path);
      if (!declaration) { errors.push(`locked package '${key}' contains undeclared file '${path}'`); return; }
      if (!safePackagePath(path)) { errors.push(`locked package '${key}' has unsafe path '${path}'`); return; }
      if (file.byteLength !== declaration.bytes || sha256(file) !== declaration.digest) {
        errors.push(`locked package '${key}' file '${path}' failed integrity`); return;
      }
      if (file.byteLength > maxFileBytes) { errors.push(`locked package '${key}' file '${path}' exceeds ${maxFileBytes} bytes`); return; }
      totalBytes += file.byteLength;
      if (totalBytes > maxTotalBytes) { errors.push(`package graph exceeds ${maxTotalBytes} bytes`); return; }
    }
    if (Object.keys(pkg.files).length !== declared.size) { errors.push(`locked package '${key}' is missing declared files`); return; }
    const verifiedFiles = Object.fromEntries(Object.entries(pkg.files).map(([path, bytes]) => [path, bytes.slice()]));
    let rootArtifact: ParsedArtifactRoot;
    try {
      rootArtifact = parseArtifactRoot(new TextDecoder('utf-8', { fatal: true }).decode(verifiedFiles[pkg.manifest.root]!));
    } catch (error) {
      errors.push(`locked package '${key}' has invalid root artifact: ${error instanceof Error ? error.message : String(error)}`); return;
    }
    const signatures = pkg.manifest.signatures ?? [];
    if ((policy.requireSignatures || entry.signerKeys?.length || record.signerKeys?.length) && !signatures.length) {
      errors.push(`locked package '${key}' is unsigned`); return;
    }
    for (const signature of signatures) {
      if (snapshot.revokedKeys?.includes(signature.keyId)) { errors.push(`locked package '${key}' uses revoked key '${signature.keyId}'`); return; }
      if (record.signerKeys?.length && !record.signerKeys.includes(signature.keyId)) { errors.push(`locked package '${key}' signer is absent from registry record`); return; }
      if (entry.signerKeys?.length && !entry.signerKeys.includes(signature.keyId)) { errors.push(`locked package '${key}' uses unpinned signer '${signature.keyId}'`); return; }
      if (!verifier || !(await verifier.verify(structuredClone(signature), entry.digest))) { errors.push(`locked package '${key}' has invalid signature '${signature.keyId}'`); return; }
    }
    for (const [alias, target] of Object.entries(entry.dependencies)) {
      const dependency = lock.packages[target];
      const authored = pkg.manifest.dependencies?.[alias];
      if (!dependency || !authored || authored.name !== dependency.name || authored.version !== dependency.version || authored.digest !== dependency.digest) {
        errors.push(`locked package '${key}' dependency '${alias}' does not match its exact authored identity`); return;
      }
    }
    if (Object.keys(pkg.manifest.dependencies ?? {}).length !== Object.keys(entry.dependencies).length) {
      errors.push(`locked package '${key}' dependency lock is incomplete`); return;
    }
    visiting.add(key);
    for (const target of Object.values(entry.dependencies).sort()) await visit(target, depth + 1);
    visiting.delete(key);
    const signerKeys = signatures.map((item) => item.keyId);
    const resolvedPackage: ResolvedPackage = {
      key, lock: structuredClone(entry), manifest: structuredClone(pkg.manifest), files: {},
      provenance: pkg.manifest.files.map((file) => ({ package: key, digest: entry.digest, signerKeys, path: file.path })),
      declarationOrigins: declarationOrigins(rootArtifact, key, entry.digest, signerKeys, pkg.manifest.root),
    };
    resolvedPackage.files = Object.freeze(Object.fromEntries(Object.entries(verifiedFiles).map(([path, bytes]) => [path, Object.freeze([...bytes])]))) as Readonly<Record<string, readonly number[]>>;
    resolved[key] = freezeResolvedPackage(resolvedPackage);
  };
  await visit(lock.root, 0);
  if (errors.length) return { errors };
  const unreachable = Object.keys(lock.packages).filter((key) => !resolved[key]).sort();
  if (unreachable.length) return { errors: [`lock contains unreachable packages: ${unreachable.join(', ')}`] };
  const projection = Object.fromEntries(Object.entries(resolved).sort(([a], [b]) => compareText(a, b)).map(([key, pkg]) => [key, pkg.lock.digest]));
  return { graph: Object.freeze({ root: lock.root, packages: Object.freeze(resolved), digest: sha256(canonicalSemanticJson({ root: lock.root, packages: projection })) }), errors: [] };
}

function declarationOrigins(artifact: ParsedArtifactRoot, key: string, digest: PackageDigest, signerKeys: string[], root: string): PackageDeclarationOrigin[] {
  if (artifact.schema === 'autonomy.organization.v2') {
    const catalogs: OrganizationCatalogName[] = ['types', 'behaviors', 'tools', 'memories', 'capabilities', 'actors', 'units', 'relations', 'goals', 'workTypes', 'initialWork', 'protocols', 'policies', 'budgets', 'decisions', 'artifacts'];
    return catalogs.flatMap((catalog) => Object.keys((artifact.value[catalog] as Record<string, unknown> | undefined) ?? {}).sort(compareText).map((id) => ({
      declaration: `${catalog}/${id}`, package: key, digest, signerKeys: [...signerKeys], sourcePath: `${root}#/${catalog}/${id}`,
    })));
  }
  return artifactFieldPointers(artifact.value).map((pointer) => ({
    declaration: `${artifact.schema}${pointer}`, package: key, digest, signerKeys: [...signerKeys], sourcePath: `${root}#${pointer}`,
  }));
}

function freezeResolvedPackage(pkg: ResolvedPackage): ResolvedPackage {
  deepFreeze(pkg.lock); deepFreeze(pkg.manifest); deepFreeze(pkg.provenance); deepFreeze(pkg.declarationOrigins);
  return Object.freeze(pkg);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safePackagePath(path: string): boolean {
  return Boolean(path) && !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function candidateFailure(
  pkg: CachedPackage,
  entry: PackageLockEntry,
  limits: {
    maxManifestBytes: number;
    maxFilesPerPackage: number;
    maxDependenciesPerPackage: number;
    maxSignaturesPerPackage: number;
    maxFileBytes: number;
  },
): string | undefined {
  if (jsonBytes(pkg.manifest) > limits.maxManifestBytes) return `manifest exceeds ${limits.maxManifestBytes} metadata bytes`;
  if (!validatePackageManifest(pkg.manifest)) return `invalid manifest: ${structuralErrors(validatePackageManifest).join('; ')}`;
  if (pkg.manifest.files.length > limits.maxFilesPerPackage) return `manifest exceeds ${limits.maxFilesPerPackage} files`;
  if (Object.keys(pkg.manifest.dependencies ?? {}).length > limits.maxDependenciesPerPackage)
    return `manifest exceeds ${limits.maxDependenciesPerPackage} dependencies`;
  if ((pkg.manifest.signatures ?? []).length > limits.maxSignaturesPerPackage)
    return `manifest exceeds ${limits.maxSignaturesPerPackage} signatures`;
  if (pkg.manifest.files.some((file) => file.bytes > limits.maxFileBytes)) return `manifest declares a file exceeding ${limits.maxFileBytes} bytes`;
  if (pkg.manifest.name !== entry.name || pkg.manifest.version !== entry.version) return 'manifest identity mismatch';
  if (packageContentDigest(pkg) !== entry.digest) return 'content digest mismatch';
  return undefined;
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
