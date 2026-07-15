import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  acceptConformanceResult, certifyIndependentConformanceResult, conformanceImplementationMatrix, runConformanceTck, scoreConformanceMutations, signConformanceResult, validateConformanceResult,
  type BlackBoxConformanceProvider, type ConformanceMutationManifest, type ConformanceTestManifest, type ConformanceTrustEntry,
} from './organization-conformance';

const manifest = JSON.parse(readFileSync('docs/conformance/tck-v1.json', 'utf8')) as ConformanceTestManifest;
const mutationManifest = JSON.parse(readFileSync('docs/conformance/mutations-v1.json', 'utf8')) as ConformanceMutationManifest;
const mandatory = manifest.tests.filter((item) => item.requirement === 'mandatory');
const outputs = new Map(manifest.tests.map((item) => [item.id, item.expected]));
const reference = (override: Partial<BlackBoxConformanceProvider> = {}): BlackBoxConformanceProvider => ({
  id: 'reference-key', implementationVersion: '1.0.0', languageVersion: '2.0.0',
  levels: ['language', 'compiler', 'component', 'adapter', 'substrate', 'event-lifting', 'replay', 'live-runtime'],
  operations: mandatory.map((item) => item.operation),
  async invoke(request) {
    const evidence = manifest.tests.find((item) => item.id === request.test)!.evidence;
    return { correlation: request.correlation, output: structuredClone(outputs.get(request.test)), evidence: Object.fromEntries(evidence.map((name) => [name, `observed:${request.test}:${name}`])) };
  },
  ...override,
});

describe('R3 technology compatibility kit', () => {
  test('reports all levels and all five dispositions without converting absence into pass', async () => {
    const bundle = await runConformanceTck(manifest, reference());
    expect(bundle.summary).toEqual({ passed: 8, failed: 0, unsupported: 2, unobserved: 1, notApplicable: 1 });
    expect(new Set(bundle.results.map((item) => item.level))).toEqual(new Set(['language', 'compiler', 'component', 'adapter', 'substrate', 'event-lifting', 'replay', 'live-runtime']));
    expect(bundle.results.find((item) => item.test === 'optional.audit')?.status).toBe('unsupported');
    expect(bundle.results.find((item) => item.test === 'conditional.pause')?.status).toBe('not-applicable');
    expect(bundle.results.find((item) => item.test === 'unsupported.legacy')?.status).toBe('unsupported');
    expect(bundle.results.find((item) => item.test === 'unobserved.private')?.status).toBe('unobserved');
    expect(bundle.results.find((item) => item.test === 'runtime.health')?.observationClass).toBe('live-observed');
    expect(bundle.results.find((item) => item.test === 'language.parse')?.observationClass).toBe('test-observed');
  });

  test('kills an intentionally defective black-box provider for every mandatory rule', async () => {
    const mutations = mandatory.map((item) => ({ id: `wrong-oracle:${item.id}`, provider: reference({
      id: `mutant-${item.id}`, async invoke(request) { return { correlation: request.correlation, output: { providerClaimsPass: true } }; },
    }) }));
    mutations.push(
      { id: 'omitted-advertised-operation', provider: reference({ operations: mandatory.slice(1).map((item) => item.operation) }) },
      { id: 'swallowed-test-correlation', provider: reference({ async invoke() { return { correlation: 'wrong', output: { accepted: true } }; } }) },
      { id: 'fabricated-provider-oracle', provider: reference({ async invoke(request) { return { correlation: request.correlation, output: { passed: true, expected: outputs.get(request.test) } }; } }) },
      { id: 'missing-expected-evidence', provider: reference({ async invoke(request) { return { correlation: request.correlation, output: structuredClone(outputs.get(request.test)), evidence: {} }; } }) },
    );
    const score = await scoreConformanceMutations(manifest, mutationManifest, mutations);
    expect(score).toEqual({ total: 12, killed: 12, survived: [], score: 1 });
    await expect(scoreConformanceMutations(manifest, mutationManifest, [])).rejects.toThrow('mutation inventory is incomplete');
    const correct = mutationManifest.mutants.map((item) => ({ id: item.id, provider: reference({ id: `correct:${item.id}` }) }));
    expect((await scoreConformanceMutations(manifest, mutationManifest, correct)).survived).toEqual(mutationManifest.mutants.map((item) => item.id));
  });

  test('requires distinct cryptographic observer evidence for independent certification', async () => {
    const implementation = generateKeyPairSync('ed25519');
    const runner = generateKeyPairSync('ed25519');
    const observer = generateKeyPairSync('ed25519');
    const unsigned = await runConformanceTck(manifest, reference());
    const implementationSigned = signConformanceResult(unsigned, 'implementation', 'implementation-key', implementation.privateKey);
    const self = signConformanceResult(implementationSigned, 'runner', 'runner-key', runner.privateKey);
    const baseTrust: Record<string, ConformanceTrustEntry> = {
      'implementation-key': { key: implementation.publicKey, roles: ['implementation'] },
      'runner-key': { key: runner.publicKey, roles: ['runner'] },
    };
    expect(validateConformanceResult(self, baseTrust, manifest)).toEqual([]);
    const relabeled = { ...self, certification: 'independently-observed' as const };
    expect(validateConformanceResult(relabeled, baseTrust, manifest)).toContain('independent certification requires a valid distinct observer signature');
    const aliased = signConformanceResult(self, 'observer', 'observer-alias', implementation.privateKey);
    expect(aliased.certification).toBe('self-attested');
    expect(() => certifyIndependentConformanceResult(aliased, { ...baseTrust, 'observer-alias': { key: implementation.publicKey, roles: ['observer'] } }, manifest)).toThrow('valid distinct observer signature');
    const observed = signConformanceResult(self, 'observer', 'observer-key', observer.privateKey);
    const independentTrust = { ...baseTrust, 'observer-key': { key: observer.publicKey, roles: ['observer' as const] } };
    const independent = certifyIndependentConformanceResult(observed, independentTrust, manifest);
    expect(validateConformanceResult(independent, independentTrust, manifest)).toEqual([]);
    const tampered = structuredClone(independent); tampered.summary.failed = 99;
    expect(validateConformanceResult(tampered, independentTrust, manifest)).toContain('summary differs from case results');
    const omitted = structuredClone(independent); omitted.results.pop();
    expect(validateConformanceResult(omitted, independentTrust, manifest)).toContain('result test inventory is incomplete or duplicated');
  });

  test('builds an implementation matrix without collapsing certification or level status', async () => {
    const implementation = generateKeyPairSync('ed25519'), runner = generateKeyPairSync('ed25519');
    const trust: Record<string, ConformanceTrustEntry> = { implementation: { key: implementation.publicKey, roles: ['implementation'] }, runner: { key: runner.publicKey, roles: ['runner'] } };
    const accepted = async (provider: BlackBoxConformanceProvider) => {
      const raw = await runConformanceTck(manifest, provider);
      return acceptConformanceResult(signConformanceResult(signConformanceResult(raw, 'implementation', 'implementation', implementation.privateKey), 'runner', 'runner', runner.privateKey), trust, manifest);
    };
    const matrix = conformanceImplementationMatrix([await accepted(reference({ id: 'z-provider' })), await accepted(reference({ id: 'a-provider', operations: [] }))]);
    expect(matrix.map((item) => item.provider)).toEqual(['a-provider', 'z-provider']);
    expect(matrix[0]!.levels.language).toBe('fail');
    expect(matrix[1]!.levels.language).toBe('pass');
    expect(matrix.every((item) => item.certification === 'self-attested')).toBe(true);
  });

  test('rejects a provider-signed fabricated all-pass bundle and never admits raw bundles to the matrix', async () => {
    const implementation = generateKeyPairSync('ed25519');
    const raw = await runConformanceTck(manifest, reference());
    for (const result of raw.results) {
      result.status = 'pass'; result.level = 'language'; result.requirement = 'mandatory';
      result.requestDigest = 'sha256:invented'; result.responseDigest = 'sha256:invented'; result.runnerEvidence = { oracleDigest: 'sha256:invented' };
    }
    raw.summary = { passed: raw.results.length, failed: 0, unsupported: 0, unobserved: 0, notApplicable: 0 };
    const forged = signConformanceResult(raw, 'implementation', 'implementation', implementation.privateKey);
    const errors = validateConformanceResult(forged, { implementation: { key: implementation.publicKey, roles: ['implementation'] } }, manifest);
    expect(errors).toContain('result acceptance requires a valid trusted runner signature');
    expect(errors.some((error) => error.includes('changes manifest classification'))).toBe(true);
    expect(() => acceptConformanceResult(forged, { implementation: { key: implementation.publicKey, roles: ['implementation'] } }, manifest)).toThrow('invalid conformance result');
    expect(() => conformanceImplementationMatrix([{ bundle: forged, certification: 'independently-observed' } as never])).toThrow('requires accepted conformance results');
    const unsupported = structuredClone(await runConformanceTck(manifest, reference()));
    for (const result of unsupported.results) { result.status = 'unsupported'; result.observationClass = 'test-observed'; delete result.responseDigest; }
    unsupported.summary = { passed: 0, failed: 0, unsupported: unsupported.results.length, unobserved: 0, notApplicable: 0 };
    const unsupportedClaim = signConformanceResult(unsupported, 'implementation', 'implementation', implementation.privateKey);
    const unsupportedErrors = validateConformanceResult(unsupportedClaim, { implementation: { key: implementation.publicKey, roles: ['implementation'] } }, manifest);
    expect(unsupportedErrors).toContain('result acceptance requires a valid trusted runner signature');
    expect(unsupportedErrors.some((error) => error.includes('status is inconsistent'))).toBe(true);
  });

  test('bounds swallowed invocations and keeps suite compatibility independent from language identity', async () => {
    const bounded = structuredClone(manifest); bounded.maximumTestMs = 5; bounded.tests = [bounded.tests.find((item) => item.id === 'language.parse')!];
    const hanging = await runConformanceTck(bounded, reference({ async invoke() { return new Promise(() => undefined); } }));
    expect(hanging.results[0]?.status).toBe('unobserved');
    expect(hanging.results[0]?.error).toContain('exceeded 5ms');
    await expect(runConformanceTck(manifest, reference({ languageVersion: '3.0.0' }))).rejects.toThrow("outside '>=2.0.0 <3.0.0'");
    const nextSuite = structuredClone(manifest); nextSuite.suiteVersion = '1.1.0';
    expect((await runConformanceTck(nextSuite, reference())).suiteVersion).toBe('1.1.0');
  });

  test('drives a real shell-free black-box process through the reference CLI', () => {
    const execution = Bun.spawnSync([
      'bun', 'bin/organization-conformance-tck.ts', 'docs/conformance/tck-v1.json', 'docs/conformance/reference-advertisement.json',
      '--', 'bun', 'docs/conformance/reference-provider.ts',
    ]);
    expect(execution.exitCode).toBe(0);
    const result = JSON.parse(execution.stdout.toString()) as { summary: { passed: number; failed: number } };
    expect(result.summary.passed).toBe(8);
    expect(result.summary.failed).toBe(0);
    const oversized = Bun.spawnSync([
      'bun', 'bin/organization-conformance-tck.ts', 'docs/conformance/tck-v1.json', 'docs/conformance/reference-advertisement.json',
      '--', 'bun', '-e', "process.stdout.write('x'.repeat(70000))",
    ]);
    expect(oversized.exitCode).toBe(1);
    expect(oversized.stdout.toString()).toContain('provider stdout exceeds 65536 bytes');
  }, 30_000);
});
