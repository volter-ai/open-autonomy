import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { canonicalSemanticJson } from './organization-canonical';
import { deriveAtomicObligations } from './organization-solver';
import type { OrganizationIR } from './organization-ir';
import {
  bindLiveDeploymentInstance,
  buildDeploymentBundle,
  promoteDeploymentBundle,
  signDeploymentBundle,
  verifyDeploymentBundle,
  verifyLiveDeploymentInstance,
  type DeploymentBundleInput,
  type DeploymentBundleSigner,
  type DeploymentBundleTrustPolicy,
} from './organization-deployment-bundle';

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
const sha1 = (value: string | Uint8Array): string =>
  createHash('sha1').update(value).digest('hex');

const signer = (id = 'release@example.test', key = 'release-key'): DeploymentBundleSigner => ({
  id,
  algorithm: 'sha256-test-v1',
  sign: (digest) => sha256(`${key}:${digest}`),
});

const trust = (key = 'release-key'): DeploymentBundleTrustPolicy => ({
  requiredSigners: ['release@example.test'],
  trustedSigners: {
    'release@example.test': {
      algorithms: ['sha256-test-v1'],
      verify: (digest, signature) => signature === sha256(`${key}:${digest}`),
    },
  },
  rejectUnknownArtifacts: true,
  rejectSecrets: true,
});

const input = (): DeploymentBundleInput => { const canonicalOrganization:OrganizationIR = {
    schema: 'autonomy.organization.v2',
    name:'acme',behaviors:{build:{kind:'skill',inline:{procedure:'build safely'}}},actors:{builder:{kind:'agent',behaviors:['build']}},
  }, lock:DeploymentBundleInput['lock'] = {
    schema: 'autonomy.module-lock.v1',
    modules: [{ uri: 'pkg:example/acme@1.0.0', digest: `sha256:${sha256('module')}` }],
  }, evidence={assurance:'conformance-tested' as const,source:{uri:'test:manifest'},observedAt:'2026-07-14T00:00:00Z'},manifestContent = {schema:'autonomy.component.v2' as const,id:'worker.hermes',version:'1.2.3',configuration:{id:'worker.config',version:'1'},facets:{actor:{facet:'actor',operations:['run','identity'],interface:'api',evidence},behavior:{facet:'behavior',operations:['invoke'],interface:'api',evidence}},interfaces:{api:{id:'api',version:'1',transport:'function' as const}},state:[],trust:[{principal:'worker',zone:'runtime',enforcedBy:'process',evidence}],failure:{detection:['probe'],healthCriterion:'ready',recovery:['restart'],upgrade:'replace',rollback:'restore',evidence},topology:{mode:'standalone' as const,minimumInstances:1,maximumInstances:1,isolation:'process' as const,placement:['runtime'],evidence}}, policyContent={id:'tenant-boundary',enforce:'tenant-boundary'},compilerContent={id:'open-autonomy-core',version:'0.8.0',binary:'open-autonomy-core-0.8.0'}, nativeBytes = new TextEncoder().encode('{"role":"builder"}'); const organizationDigest=`sha256:${sha256(canonicalSemanticJson(canonicalOrganization))}` as const,compilerDigest=`sha256:${sha256(canonicalSemanticJson(compilerContent))}` as const,requiredObligations=deriveAtomicObligations(canonicalOrganization as any).map(x=>x.id); return ({
  schema: 'autonomy.deployment-bundle-input.v1',
  canonicalOrganization,
  organizationDigest,
  lock,
  compiler: {
    id: 'open-autonomy-core',
    version: '0.8.0',
    digest: compilerDigest,content:compilerContent,
    options: { target: 'hermes' },
  },
  requiredObligations,
  selectedManifests: [{
    id: 'worker.hermes', version: '1.2.3', digest: `sha256:${sha256(canonicalSemanticJson(manifestContent))}`, content: manifestContent,
  }],
  loweringCertificates: [{
    id: 'lowering/hermes', target: 'hermes',
    inputDigest: organizationDigest,
    outputDigest: `sha256:${sha256(nativeBytes)}`,
    sourceObligations: requiredObligations,
  }],
  nativeArtifacts: [{
    path: 'targets/hermes/worker.json', mediaType: 'application/json',
    bytes: nativeBytes,
  }],
  policies: [{ id: 'tenant-boundary', digest: `sha256:${sha256(canonicalSemanticJson(policyContent))}`, content:policyContent }],
  secretReferences: [{ id: 'github-token', provider: 'vault', locator: 'kv/acme/github' }],
  migrations: [{
    id: 'state-v1-v2', from: '1', to: '2', artifactPath: 'targets/hermes/worker.json',
    healthGate: 'worker-ready', rollback: 'restore-state-v1',
  }],
  healthProbes: [{ id: 'worker-ready', kind: 'command', target: 'worker', timeoutMs: 5_000, success: { exitCode: 0 } }],
  rollbackPlan: {
    id: 'restore-state-v1', triggerObservations: ['worker-unhealthy'],
    steps: [{ operation: 'restore', artifact: 'targets/hermes/worker.json' }],
  },
  expectedObservations: [
    { id: 'worker-healthy', subject: 'worker', predicate: 'health', equals: 'ready', withinMs: 30_000 },
    { id: 'worker-unhealthy', subject: 'worker', predicate: 'health', equals: 'failed', withinMs: 30_000 },
  ],
  sbom: {
    spdxVersion:'SPDX-2.3',SPDXID:'SPDXRef-DOCUMENT',dataLicense:'CC0-1.0',name:'acme-deployment',documentNamespace:'https://open-autonomy.example/spdx/acme',creationInfo:{created:'2026-07-15T00:00:00Z',creators:['Tool: open-autonomy-core-0.8.0']},
    packages: [{ name: 'hermes-worker', versionInfo: '1.2.3',downloadLocation:'NOASSERTION',SPDXID:'SPDXRef-Package-hermes-worker',checksums:[{algorithm:'SHA256',checksumValue:sha256(nativeBytes)}],packageVerificationCode:{packageVerificationCodeValue:sha1(sha1(nativeBytes))} }],
    files:[{fileName:'targets/hermes/worker.json',SPDXID:'SPDXRef-File-worker',checksums:[{algorithm:'SHA256',checksumValue:sha256(nativeBytes)}]}],
    relationships:[{spdxElementId:'SPDXRef-Package-hermes-worker',relationshipType:'CONTAINS',relatedSpdxElement:'SPDXRef-File-worker'}],
  },
  provenance: {
    _type:'https://in-toto.io/Statement/v1',subject:[{name:'targets/hermes/worker.json',digest:{sha256:sha256(nativeBytes)}}],predicateType: 'https://slsa.dev/provenance/v1',
    predicate:{buildDefinition:{buildType:'https://open-autonomy.example/build-types/deployment-bundle/v1',externalParameters:{organizationDigest,lockDigest:`sha256:${sha256(canonicalSemanticJson(lock))}`,compilerDigest},resolvedDependencies:[{uri:'pkg:example/acme@1.0.0',digest:{sha256:sha256('module')}},{uri:'component:worker.hermes@1.2.3',digest:{sha256:sha256(canonicalSemanticJson(manifestContent))}},{uri:'policy:tenant-boundary',digest:{sha256:sha256(canonicalSemanticJson(policyContent))}},{uri:'compiler:open-autonomy-core@0.8.0',digest:{sha256:compilerDigest.slice(7)}}]},runDetails:{builder:{id:'https://open-autonomy.example/builders/core'},metadata:{invocationId:'build-acme-1',startedOn:'2026-07-15T00:00:00Z',finishedOn:'2026-07-15T00:01:00Z'}}},
  },
}); };

const signed = () => signDeploymentBundle(buildDeploymentBundle(input()), signer());

describe('R8-ALG-1: reproducible, content-addressed deployment bundles', () => {
  test('equal locked inputs produce byte-identical bundles and digests despite object insertion order', () => {
    const a = input();
    const b = structuredClone(a);
    b.compiler.options = { target: 'hermes' };
    b.provenance.predicate.buildDefinition.resolvedDependencies.reverse();
    a.sbom.creationInfo.creators.push('Organization: Acme');
    b.sbom.creationInfo.creators.push('Organization: Acme');
    b.sbom.creationInfo.creators.reverse();
    const first = buildDeploymentBundle(a);
    const second = buildDeploymentBundle(b);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toBe(`sha256:${sha256(first.bytes)}`);
    expect(buildDeploymentBundle(a)).toEqual(first);
  });

  test('canonicalizes same-name SPDX packages by identity', () => {
    const a = input();
    const secondBytes = new TextEncoder().encode('{"role":"observer"}');
    a.nativeArtifacts.push({path:'targets/hermes/observer.json',mediaType:'application/json',bytes:secondBytes});
    a.sbom.files.push({fileName:'targets/hermes/observer.json',SPDXID:'SPDXRef-File-observer',checksums:[{algorithm:'SHA256',checksumValue:sha256(secondBytes)}]});
    a.sbom.packages.push({name:'hermes-worker',versionInfo:'2.0.0',downloadLocation:'NOASSERTION',SPDXID:'SPDXRef-Package-observer',checksums:[{algorithm:'SHA256',checksumValue:sha256(secondBytes)}],packageVerificationCode:{packageVerificationCodeValue:sha1(sha1(secondBytes))}});
    a.sbom.relationships.push({spdxElementId:'SPDXRef-Package-observer',relationshipType:'CONTAINS',relatedSpdxElement:'SPDXRef-File-observer'});
    a.provenance.subject.push({name:'targets/hermes/observer.json',digest:{sha256:sha256(secondBytes)}});
    const b=structuredClone(a);b.sbom.packages.reverse();
    expect(buildDeploymentBundle(a)).toEqual(buildDeploymentBundle(b));
  });

  test('any semantic or native-artifact byte change changes the immutable address', () => {
    const baseline = buildDeploymentBundle(input());
    const semantic = input(); (semantic.canonicalOrganization as any).behaviors.build.inline.procedure = 'build quickly'; semantic.organizationDigest = `sha256:${sha256(canonicalSemanticJson(semantic.canonicalOrganization))}`;semantic.provenance.predicate.buildDefinition.externalParameters.organizationDigest=semantic.organizationDigest;semantic.loweringCertificates[0]!.inputDigest=semantic.organizationDigest;
    const native = input(); native.nativeArtifacts[0]!.bytes[0] ^= 1; const nativeHash=sha256(native.nativeArtifacts[0]!.bytes),nativeDigest=`sha256:${nativeHash}` as const;native.sbom.packages[0]!.checksums[0]!.checksumValue=nativeHash;native.sbom.packages[0]!.packageVerificationCode.packageVerificationCodeValue=sha1(sha1(native.nativeArtifacts[0]!.bytes));native.sbom.files[0]!.checksums[0]!.checksumValue=nativeHash;native.provenance.subject[0]!.digest.sha256=nativeHash; native.loweringCertificates[0]!.outputDigest=nativeDigest;
    expect(buildDeploymentBundle(semantic).digest).not.toBe(baseline.digest);
    expect(buildDeploymentBundle(native).digest).not.toBe(baseline.digest);
    const ordered=input();ordered.rollbackPlan.steps.push({operation:'resume',artifact:'targets/hermes/worker.json'});const reversed=structuredClone(ordered);reversed.rollbackPlan.steps.reverse();expect(buildDeploymentBundle(reversed).digest).not.toBe(buildDeploymentBundle(ordered).digest);
  });

  test('emits the exact required inventory with artifact digests bound into the address', () => {
    const bundle = buildDeploymentBundle(input());
    expect(bundle.manifest.inventory.map((entry) => entry.kind).sort()).toEqual([
      'canonical-input', 'health-probe', 'lock', 'lowering-certificate', 'migration',
      'native-artifact', 'policy', 'provenance', 'rollback-plan', 'sbom',
      'secret-reference', 'selected-manifest', 'expected-observation',
    ].sort());
    for (const item of bundle.manifest.inventory) {
      expect(item.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(item.path.startsWith('/') || item.path.includes('..')).toBe(false);
    }
  });
});

describe('R8-SEC-1: supply-chain verification', () => {
  test('accepts a complete signed bundle under an explicit trust policy', () => {
    expect(verifyDeploymentBundle(signed(), trust())).toEqual({ valid: true, errors: [] });
  });

  test('rejects payload, native artifact, digest, signature, signer, and trust-root substitution', () => {
    const mutations = [
      (value: ReturnType<typeof signed>) => { value.bundle.bytes[0] ^= 1; },
      (value: ReturnType<typeof signed>) => { value.bundle.manifest.inventory.find((x) => x.kind === 'native-artifact')!.digest = `sha256:${'0'.repeat(64)}`; },
      (value: ReturnType<typeof signed>) => { value.bundle.digest = `sha256:${'1'.repeat(64)}`; },
      (value: ReturnType<typeof signed>) => { value.signatures[0]!.signature = 'forged'; },
      (value: ReturnType<typeof signed>) => { value.signatures[0]!.signer = 'attacker@example.test'; },
    ];
    for (const mutate of mutations) {
      const value = signed(); mutate(value);
      expect(verifyDeploymentBundle(value, trust()).valid).toBe(false);
    }
    expect(verifyDeploymentBundle(signed(), trust('attacker-key')).valid).toBe(false);
  });

  test('fails closed for unsigned bundles, missing required signers, and untrusted algorithms', () => {
    const value = signed(); value.signatures = [];
    expect(verifyDeploymentBundle(value, trust()).valid).toBe(false);
    const other = signDeploymentBundle(buildDeploymentBundle(input()), signer('other@example.test'));
    expect(verifyDeploymentBundle(other, trust()).valid).toBe(false);
    const algorithm = signed(); algorithm.signatures[0]!.algorithm = 'none';
    expect(verifyDeploymentBundle(algorithm, trust()).valid).toBe(false);
  });

  test('prohibits secret values in every serializable bundle field while retaining opaque references', () => {
    const locations: Array<(candidate: DeploymentBundleInput) => void> = [
      (x) => { (x.compiler.options as Record<string, unknown>).token = 'ghp_abcdefghijklmnopqrstuvwxyz123456'; },
      (x) => { x.nativeArtifacts[0]!.bytes = new TextEncoder().encode('AWS_SECRET_ACCESS_KEY=abc123secretsecretsecret'); },
      (x) => { x.secretReferences[0]!.locator = 'https://user:password@example.test/token'; },
      (x) => { x.policies[0]!.id = '-----BEGIN PRIVATE KEY-----'; },
    ];
    for (const inject of locations) {
      const candidate = input(); inject(candidate);
      expect(() => buildDeploymentBundle(candidate)).toThrow(/secret|credential|private key/i);
    }
    expect(new TextDecoder().decode(buildDeploymentBundle(input()).bytes)).not.toContain('release-key');
  });

  test('requires a complete SPDX SBOM and SLSA provenance that bind all native artifacts and inputs', () => {
    const noRelationship = input(); noRelationship.sbom.relationships = [];
    expect(() => buildDeploymentBundle(noRelationship)).toThrow(/SBOM|SPDX|artifact/i);
    const noMaterial = input(); noMaterial.provenance.predicate.buildDefinition.resolvedDependencies = [];
    expect(() => buildDeploymentBundle(noMaterial)).toThrow(/provenance|material/i);
    const wrongInvocation = input(); wrongInvocation.provenance.predicate.buildDefinition.externalParameters.compilerDigest = `sha256:${'0'.repeat(64)}`;
    expect(() => buildDeploymentBundle(wrongInvocation)).toThrow(/provenance|compiler|SLSA/i);
    for(const mutate of [
      (x:DeploymentBundleInput)=>{x.sbom.creationInfo.created='July 1, 2025';},
      (x:DeploymentBundleInput)=>{x.provenance.predicate.runDetails.metadata.startedOn='1/1/2025';},
      (x:DeploymentBundleInput)=>{x.sbom.documentNamespace='https://';},
      (x:DeploymentBundleInput)=>{x.sbom.packages[0]!.downloadLocation='http://';},
      (x:DeploymentBundleInput)=>{x.sbom.creationInfo.creators=['Tool:x'];},
    ]){const malformed=input();mutate(malformed);expect(()=>buildDeploymentBundle(malformed)).toThrow(/SPDX|SLSA|metadata|package/i);}
  });

  test('rejects internal digest, manifest-content, path, collision, extension, and secret-key attacks', () => {
    const wrongOrganization=input();wrongOrganization.organizationDigest=`sha256:${'0'.repeat(64)}`;expect(()=>buildDeploymentBundle(wrongOrganization)).toThrow(/organization digest/i);
    const wrongLock=input();wrongLock.provenance.predicate.buildDefinition.externalParameters.lockDigest=`sha256:${'0'.repeat(64)}`;expect(()=>buildDeploymentBundle(wrongLock)).toThrow(/lock digest/i);
    const wrongManifest=input();wrongManifest.selectedManifests[0]!.content={substituted:true};expect(()=>buildDeploymentBundle(wrongManifest)).toThrow(/manifest.*(?:digest|identity)/i);
    const unsafe=input();unsafe.nativeArtifacts[0]!.path='../escape';expect(()=>buildDeploymentBundle(unsafe)).toThrow(/unsafe path|SPDX/i);
    const duplicate=input();duplicate.policies.push(structuredClone(duplicate.policies[0]!));expect(()=>buildDeploymentBundle(duplicate)).toThrow(/duplicate policy/i);
    const extension=input();(extension as unknown as Record<string,unknown>).ambientArtifact={path:'hidden'};expect(()=>buildDeploymentBundle(extension)).toThrow(/unknown fields/i);
    const accessToken=input();(accessToken.compiler.options as Record<string,unknown>).accessToken='sensitive-credential-value';expect(()=>buildDeploymentBundle(accessToken)).toThrow(/secret|credential/i);
    const collision=input(),collisionContent={id:'tenant?boundary',enforce:'tenant-boundary'},collisionDigest=`sha256:${sha256(canonicalSemanticJson(collisionContent))}` as const;collision.policies.push({id:'tenant?boundary',digest:collisionDigest,content:collisionContent});collision.provenance.predicate.buildDefinition.resolvedDependencies.push({uri:'policy:tenant?boundary',digest:{sha256:collisionDigest.slice(7)}});const paths=buildDeploymentBundle(collision).manifest.inventory.map(x=>x.path);expect(new Set(paths).size).toBe(paths.length);
    const drive=input();drive.nativeArtifacts[0]!.path='C:\\payload';expect(()=>buildDeploymentBundle(drive)).toThrow(/unsafe path|SPDX/i);
    const nested=input();(nested.migrations[0] as unknown as Record<string,unknown>).command='disable-auth';expect(()=>buildDeploymentBundle(nested)).toThrow(/unknown fields/i);
  });
});

describe('R8-OPS-1: promotion and executable operational contracts', () => {
  test('promotes the same verified semantics across environments without invoking a compiler', () => {
    const envelope = signed();
    let compilationCalls = 0;
    const staging = promoteDeploymentBundle(envelope, trust(), {
      environment: 'staging', bindings: { 'secret:github-token': 'vault://staging/github' },
      signers:[signer()], onSemanticCompilation: () => { compilationCalls += 1; },
    });
    const production = promoteDeploymentBundle(envelope, trust(), {
      environment: 'production', bindings: { 'secret:github-token': 'vault://production/github' },
      signers:[signer()], onSemanticCompilation: () => { compilationCalls += 1; },
    });
    expect(compilationCalls).toBe(0);
    expect(staging.bundleDigest).toBe(envelope.bundle.digest);
    expect(production.bundleDigest).toBe(envelope.bundle.digest);
    expect(staging.semanticDigest).toBe(production.semanticDigest);
    expect(staging.bindingsDigest).not.toBe(production.bindingsDigest);
  });

  test('refuses promotion unless health, migration, expected observation, and rollback references close', () => {
    const broken: Array<(x: DeploymentBundleInput) => void> = [
      (x) => { x.healthProbes = []; },
      (x) => { x.migrations[0]!.healthGate = 'missing'; },
      (x) => { x.migrations[0]!.rollback = 'missing'; },
      (x) => { x.rollbackPlan.triggerObservations = ['missing']; },
      (x) => { x.expectedObservations = []; },
    ];
    for (const mutate of broken) {
      const candidate = input(); mutate(candidate);
      expect(() => buildDeploymentBundle(candidate)).toThrow();
    }
  });

  test('fails promotion before binding when signature verification or secret-reference coverage fails', () => {
    const forged = signed(); forged.signatures[0]!.signature = 'forged';
    expect(() => promoteDeploymentBundle(forged, trust(), { environment: 'prod', bindings: { 'secret:github-token': 'vault://prod/github' },signers:[signer()] })).toThrow(/verify|signature/i);
    expect(() => promoteDeploymentBundle(signed(), trust(), { environment: 'prod', bindings: {},signers:[signer()] })).toThrow(/github-token|binding/i);
    expect(() => promoteDeploymentBundle(signed(), trust(), { environment: 'prod', bindings: {'secret:github-token':'vault://prod/github','disable-auth':'true'},signers:[signer()] })).toThrow(/undeclared semantic keys/i);
  });
});

describe('R8-PROV-1: immutable live-instance provenance', () => {
  test('binds a running instance to exact bundle, organization, compiler, and selected component inputs', () => {
    const envelope = signed();
    const release = promoteDeploymentBundle(envelope, trust(), {
      environment: 'production', bindings: { 'secret:github-token': 'vault://production/github' },signers:[signer()],
    });
    const instance = bindLiveDeploymentInstance(release, envelope, trust(), {
      instanceId: 'worker-01', tenant: 'acme', observedAt: '2026-07-15T12:00:00Z',signers:[signer()],
    });
    expect(instance.bundleDigest).toBe(envelope.bundle.digest);
    expect(instance.organizationDigest).toBe(input().organizationDigest);
    expect(instance.compilerDigest).toBe(input().compiler.digest);
    expect(instance.componentDigests).toEqual([input().selectedManifests[0]!.digest]);
    expect(verifyLiveDeploymentInstance(instance, release, envelope, trust())).toEqual({ valid: true, errors: [] });
  });

  test('rejects an instance attestation with substituted identity, environment, or any provenance edge', () => {
    const envelope = signed();
    const release = promoteDeploymentBundle(envelope, trust(), {
      environment: 'production', bindings: { 'secret:github-token': 'vault://production/github' },signers:[signer()],
    });
    const original = bindLiveDeploymentInstance(release, envelope, trust(), {
      instanceId: 'worker-01', tenant: 'acme', observedAt: '2026-07-15T12:00:00Z',signers:[signer()],
    });
    for (const field of ['bundleDigest', 'organizationDigest', 'compilerDigest', 'releaseDigest', 'environment'] as const) {
      const forged = structuredClone(original);
      (forged as unknown as Record<string, unknown>)[field] = field === 'environment' ? 'staging' : `sha256:${'0'.repeat(64)}`;
      expect(verifyLiveDeploymentInstance(forged, release, envelope, trust()).valid).toBe(false);
    }
    const forged = structuredClone(original); forged.componentDigests = [`sha256:${'0'.repeat(64)}`];
    expect(verifyLiveDeploymentInstance(forged, release, envelope, trust()).valid).toBe(false);
    const forgedRelease=structuredClone(release);forgedRelease.environment='attacker';forgedRelease.bundleDigest=`sha256:${'0'.repeat(64)}`;forgedRelease.semanticDigest=`sha256:${'1'.repeat(64)}`;forgedRelease.releaseDigest=`sha256:${'2'.repeat(64)}`;expect(()=>bindLiveDeploymentInstance(forgedRelease,envelope,trust(),{instanceId:'worker-01',tenant:'acme',observedAt:'2026-07-15T12:00:00Z',signers:[signer()]})).toThrow(/release verification/i);
    const forgedSignature=structuredClone(original);forgedSignature.signatures[0]!.signature='forged';expect(verifyLiveDeploymentInstance(forgedSignature,release,envelope,trust()).valid).toBe(false);const forgedReleaseSignature=structuredClone(release);forgedReleaseSignature.signatures[0]!.signature='forged';expect(verifyLiveDeploymentInstance(original,forgedReleaseSignature,envelope,trust()).valid).toBe(false);
    const extraSignature=structuredClone(original);extraSignature.signatures.push({signer:'attacker',algorithm:'none',signature:'forged'});expect(verifyLiveDeploymentInstance(extraSignature,release,envelope,trust()).valid).toBe(false);
  });
});
