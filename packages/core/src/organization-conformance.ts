import { createHash, sign, verify, type KeyObject } from 'node:crypto';
import { canonicalSemanticJson } from './organization-canonical';

export type ConformanceLevel = 'language' | 'compiler' | 'component' | 'adapter' | 'substrate' | 'event-lifting' | 'replay' | 'live-runtime';
export type ConformanceRequirement = 'mandatory' | 'optional' | 'conditional' | 'unsupported' | 'unobserved';
export type ConformanceStatus = 'pass' | 'fail' | 'unsupported' | 'unobserved' | 'not-applicable';

export interface ConformanceTestCase {
  id: string;
  level: ConformanceLevel;
  operation: string;
  requirement: ConformanceRequirement;
  conditionOperation?: string;
  request: unknown;
  expected: unknown;
  evidence: string[];
}

export interface ConformanceTestManifest {
  schema: 'autonomy.conformance-manifest.v1';
  suiteVersion: string;
  languageRange: string;
  maximumResponseBytes: number;
  maximumTestMs: number;
  tests: ConformanceTestCase[];
}

export interface BlackBoxConformanceProvider {
  id: string;
  implementationVersion: string;
  languageVersion: string;
  levels: ConformanceLevel[];
  operations: string[];
  invoke(request: ConformanceInvocation): Promise<ConformanceObservation>;
}

export interface ConformanceInvocation {
  test: string;
  operation: string;
  correlation: string;
  input: unknown;
}

export interface ConformanceObservation {
  correlation: string;
  output: unknown;
  evidence?: Record<string, string>;
}

export interface ConformanceCaseResult {
  test: string;
  level: ConformanceLevel;
  requirement: ConformanceRequirement;
  status: ConformanceStatus;
  observationClass: 'test-observed' | 'live-observed';
  requestDigest: string;
  responseDigest?: string;
  runnerEvidence: Record<string, string>;
  error?: string;
}

export interface ConformanceSignature {
  role: 'implementation' | 'runner' | 'observer';
  keyId: string;
  algorithm: 'ed25519';
  value: string;
}

export interface ConformanceResultBundle {
  schema: 'autonomy.conformance-result.v1';
  suiteVersion: string;
  languageVersion: string;
  provider: string;
  implementationVersion: string;
  levels: ConformanceLevel[];
  operations: string[];
  certification: 'self-attested' | 'independently-observed';
  results: ConformanceCaseResult[];
  summary: { passed: number; failed: number; unsupported: number; unobserved: number; notApplicable: number };
  signatures: ConformanceSignature[];
}

export interface ConformanceMutationScore {
  total: number;
  killed: number;
  survived: string[];
  score: number;
}

export interface ConformanceMutationRule { id: string; test: string; defect: string; }
export interface ConformanceMutationManifest {
  schema: 'autonomy.conformance-mutations.v1';
  suiteVersion: string;
  mutants: ConformanceMutationRule[];
}

export interface ConformanceTrustEntry { key: KeyObject; roles: ConformanceSignature['role'][]; }
const validatedResult: unique symbol = Symbol('validated-conformance-result');
const acceptedResults = new WeakSet<object>();
export type ValidatedConformanceResult = { bundle: ConformanceResultBundle; certification: 'self-attested' | 'independently-observed'; [validatedResult]: true };

export interface ConformanceImplementationMatrixEntry {
  provider: string;
  implementationVersion: string;
  suiteVersion: string;
  certification: 'self-attested' | 'independently-observed';
  levels: Record<ConformanceLevel, ConformanceStatus>;
}

export async function runConformanceTck(manifest: ConformanceTestManifest, provider: BlackBoxConformanceProvider): Promise<ConformanceResultBundle> {
  validateManifest(manifest);
  if (!satisfiesRange(provider.languageVersion, manifest.languageRange)) throw new Error(`provider language version '${provider.languageVersion}' is outside '${manifest.languageRange}'`);
  const results: ConformanceCaseResult[] = [];
  for (const test of [...manifest.tests].sort((a, b) => compareText(a.id, b.id))) {
    const requestDigest = digest(test.request);
    const runnerEvidence: Record<string, string> = { suiteVersion: manifest.suiteVersion, testId: test.id, oracleDigest: digest(test.expected) };
    const levelAdvertised = provider.levels.includes(test.level);
    const operationAdvertised = provider.operations.includes(test.operation);
    const conditionMet = !test.conditionOperation || provider.operations.includes(test.conditionOperation);
    if (test.requirement === 'unsupported') {
      results.push(result(test, operationAdvertised ? 'fail' : 'unsupported', requestDigest, runnerEvidence, operationAdvertised ? 'operation advertised despite unsupported rule' : undefined)); continue;
    }
    if (test.requirement === 'unobserved') {
      results.push(result(test, 'unobserved', requestDigest, runnerEvidence)); continue;
    }
    if (test.requirement === 'conditional' && !conditionMet) {
      results.push(result(test, 'not-applicable', requestDigest, runnerEvidence)); continue;
    }
    if (!levelAdvertised || !operationAdvertised) {
      const status = !levelAdvertised || test.requirement === 'optional' ? 'unsupported' : 'fail';
      results.push(result(test, status, requestDigest, runnerEvidence, status === 'fail' ? 'advertised conformance surface omitted a required operation' : undefined)); continue;
    }
    const correlation = digest({ provider: provider.id, suite: manifest.suiteVersion, test: test.id }).slice(0, 32);
    try {
      const observation = await withTimeout(provider.invoke({ test: test.id, operation: test.operation, correlation, input: structuredClone(test.request) }), manifest.maximumTestMs);
      const responseBytes = new TextEncoder().encode(JSON.stringify(observation)).byteLength;
      if (responseBytes > manifest.maximumResponseBytes) {
        results.push(result(test, 'fail', requestDigest, runnerEvidence, `response exceeds ${manifest.maximumResponseBytes} bytes`)); continue;
      }
      if (observation.correlation !== correlation) {
        results.push(result(test, 'fail', requestDigest, runnerEvidence, 'provider swallowed or substituted the TCK correlation')); continue;
      }
      const responseDigest = digest(observation.output);
      runnerEvidence.correlation = correlation;
      runnerEvidence.responseDigest = responseDigest;
      const missingEvidence = test.evidence.filter((name) => typeof observation.evidence?.[name] !== 'string');
      for (const name of test.evidence) if (observation.evidence?.[name] !== undefined) runnerEvidence[`provider:${name}`] = digest(observation.evidence[name]);
      const passed = responseDigest === runnerEvidence.oracleDigest && !missingEvidence.length;
      const error = responseDigest !== runnerEvidence.oracleDigest ? 'trusted TCK oracle mismatch'
        : missingEvidence.length ? `missing expected evidence: ${missingEvidence.join(', ')}` : undefined;
      results.push({ ...result(test, passed ? 'pass' : 'fail', requestDigest, runnerEvidence, error), responseDigest });
    } catch (error) {
      results.push(result(test, 'unobserved', requestDigest, runnerEvidence, error instanceof Error ? error.message : String(error)));
    }
  }
  return unsignedBundle(manifest, provider, results);
}

export function signConformanceResult(bundle: ConformanceResultBundle, role: ConformanceSignature['role'], keyId: string, privateKey: KeyObject): ConformanceResultBundle {
  const value = sign(null, Buffer.from(bundlePayload(bundle)), privateKey).toString('base64');
  const signatures = [...bundle.signatures.filter((item) => !(item.role === role && item.keyId === keyId)), { role, keyId, algorithm: 'ed25519' as const, value }];
  return { ...structuredClone(bundle), signatures };
}

export function certifyIndependentConformanceResult(bundle: ConformanceResultBundle, trust: Record<string, ConformanceTrustEntry>, manifest: ConformanceTestManifest): ConformanceResultBundle {
  const candidate = { ...structuredClone(bundle), certification: 'independently-observed' as const };
  const errors = validateConformanceResult(candidate, trust, manifest);
  if (errors.length) throw new Error(`cannot certify conformance result: ${errors.join('; ')}`);
  return candidate;
}

export function validateConformanceResult(bundle: ConformanceResultBundle, trust: Record<string, ConformanceTrustEntry>, manifest: ConformanceTestManifest): string[] {
  const errors: string[] = [];
  if (bundle.schema !== 'autonomy.conformance-result.v1') errors.push('unsupported result schema');
  if (bundle.suiteVersion !== manifest.suiteVersion) errors.push('result suite differs from verification manifest');
  const expectedTests = [...manifest.tests.map((test) => test.id)].sort(compareText);
  const observedTests = [...bundle.results.map((result) => result.test)].sort(compareText);
  if (canonicalSemanticJson(expectedTests) !== canonicalSemanticJson(observedTests)) errors.push('result test inventory is incomplete or duplicated');
  if (!satisfiesRange(bundle.languageVersion, manifest.languageRange)) errors.push('result language version is outside manifest range');
  const expectedById = new Map(manifest.tests.map((test) => [test.id, test]));
  for (const result of bundle.results) {
    const test = expectedById.get(result.test); if (!test) continue;
    if (result.level !== test.level || result.requirement !== test.requirement) errors.push(`test '${test.id}' changes manifest classification`);
    const expectedObservation = test.level === 'live-runtime' && (result.status === 'pass' || result.status === 'fail') ? 'live-observed' : 'test-observed';
    if (result.observationClass !== expectedObservation) errors.push(`test '${test.id}' changes observation class`);
    if (result.requestDigest !== digest(test.request)) errors.push(`test '${test.id}' changes request digest`);
    if (result.runnerEvidence.oracleDigest !== digest(test.expected)) errors.push(`test '${test.id}' changes oracle digest`);
    if (result.status === 'pass') {
      if (result.responseDigest !== digest(test.expected)) errors.push(`test '${test.id}' pass differs from oracle`);
      if (result.runnerEvidence.correlation !== digest({ provider: bundle.provider, suite: manifest.suiteVersion, test: test.id }).slice(0, 32)) errors.push(`test '${test.id}' has invalid correlation evidence`);
      for (const evidence of test.evidence) if (!result.runnerEvidence[`provider:${evidence}`]) errors.push(`test '${test.id}' omits required evidence '${evidence}'`);
    }
    const levelAdvertised = bundle.levels.includes(test.level), operationAdvertised = bundle.operations.includes(test.operation);
    const conditionMet = !test.conditionOperation || bundle.operations.includes(test.conditionOperation);
    const allowed: ConformanceStatus[] = test.requirement === 'unsupported' ? [operationAdvertised ? 'fail' : 'unsupported']
      : test.requirement === 'unobserved' ? ['unobserved']
        : test.requirement === 'conditional' && !conditionMet ? ['not-applicable']
          : !levelAdvertised ? ['unsupported']
            : !operationAdvertised ? test.requirement === 'optional' ? ['unsupported'] : ['fail']
              : ['pass', 'fail', 'unobserved'];
    if (!allowed.includes(result.status)) errors.push(`test '${test.id}' status is inconsistent with its advertisement or disposition`);
  }
  const valid = bundle.signatures.filter((signature) => signature.algorithm === 'ed25519' && trust[signature.keyId]?.roles.includes(signature.role)
    && verify(null, Buffer.from(bundlePayload(bundle)), trust[signature.keyId]!.key, Buffer.from(signature.value, 'base64')));
  const implementationFingerprints = new Set(valid.filter((item) => item.role === 'implementation').map((item) => keyFingerprint(trust[item.keyId]!.key)));
  if (!implementationFingerprints.size) errors.push('missing valid implementation signature');
  if (!valid.some((signature) => signature.role === 'runner')) errors.push('result acceptance requires a valid trusted runner signature');
  if (bundle.certification === 'independently-observed' && !valid.some((signature) => signature.role === 'observer' && !implementationFingerprints.has(keyFingerprint(trust[signature.keyId]!.key))))
    errors.push('independent certification requires a valid distinct observer signature');
  const count = (status: ConformanceStatus) => bundle.results.filter((item) => item.status === status).length;
  if (bundle.summary.passed !== count('pass') || bundle.summary.failed !== count('fail') || bundle.summary.unsupported !== count('unsupported')
    || bundle.summary.unobserved !== count('unobserved') || bundle.summary.notApplicable !== count('not-applicable')) errors.push('summary differs from case results');
  return errors;
}

export function acceptConformanceResult(bundle: ConformanceResultBundle, trust: Record<string, ConformanceTrustEntry>, manifest: ConformanceTestManifest): ValidatedConformanceResult {
  const errors = validateConformanceResult(bundle, trust, manifest);
  if (errors.length) throw new Error(`invalid conformance result: ${errors.join('; ')}`);
  const accepted = Object.freeze({ bundle: deepFreeze(structuredClone(bundle)), certification: bundle.certification, [validatedResult]: true }) as ValidatedConformanceResult;
  acceptedResults.add(accepted);
  return accepted;
}

export async function scoreConformanceMutations(
  manifest: ConformanceTestManifest,
  required: ConformanceMutationManifest,
  mutations: Array<{ id: string; provider: BlackBoxConformanceProvider }>,
): Promise<ConformanceMutationScore> {
  if (required.schema !== 'autonomy.conformance-mutations.v1' || required.suiteVersion !== manifest.suiteVersion || !required.mutants.length)
    throw new Error('invalid or empty mutation manifest');
  const expectedIds = [...required.mutants.map((item) => item.id)].sort(compareText);
  const actualIds = [...mutations.map((item) => item.id)].sort(compareText);
  if (new Set(expectedIds).size !== expectedIds.length || canonicalSemanticJson(expectedIds) !== canonicalSemanticJson(actualIds)) throw new Error('mutation inventory is incomplete or duplicated');
  const coveredTests = new Set(required.mutants.map((item) => item.test));
  if (manifest.tests.some((test) => test.requirement === 'mandatory' && !coveredTests.has(test.id))) throw new Error('mutation inventory does not cover every mandatory rule');
  const survived: string[] = [];
  const ruleById = new Map(required.mutants.map((item) => [item.id, item]));
  for (const mutation of mutations) {
    const bundle = await runConformanceTck(manifest, mutation.provider);
    const target = bundle.results.find((item) => item.test === ruleById.get(mutation.id)!.test);
    if (!target || (target.status !== 'fail' && target.status !== 'unobserved')) survived.push(mutation.id);
  }
  const killed = mutations.length - survived.length;
  return { total: mutations.length, killed, survived, score: killed / mutations.length };
}

export function conformanceImplementationMatrix(validated: ValidatedConformanceResult[]): ConformanceImplementationMatrixEntry[] {
  if (validated.some((item) => !acceptedResults.has(item))) throw new Error('implementation matrix requires accepted conformance results');
  return validated.map(({ bundle, certification }) => ({
    provider: bundle.provider, implementationVersion: bundle.implementationVersion, suiteVersion: bundle.suiteVersion,
    certification,
    levels: Object.fromEntries((['language', 'compiler', 'component', 'adapter', 'substrate', 'event-lifting', 'replay', 'live-runtime'] as ConformanceLevel[]).map((level) => {
      const results = bundle.results.filter((item) => item.level === level);
      const status: ConformanceStatus = results.some((item) => item.status === 'fail') ? 'fail'
        : results.some((item) => item.status === 'unobserved') ? 'unobserved'
          : results.some((item) => item.status === 'pass') ? 'pass'
            : results.some((item) => item.status === 'unsupported') ? 'unsupported' : 'not-applicable';
      return [level, status];
    })) as Record<ConformanceLevel, ConformanceStatus>,
  })).sort((a, b) => compareText(a.provider, b.provider));
}

function validateManifest(manifest: ConformanceTestManifest): void {
  if (manifest.schema !== 'autonomy.conformance-manifest.v1') throw new Error('unsupported conformance manifest schema');
  if (!manifest.suiteVersion || !manifest.languageRange || manifest.maximumResponseBytes <= 0 || manifest.maximumTestMs <= 0) throw new Error('invalid conformance manifest metadata');
  if (new Set(manifest.tests.map((test) => test.id)).size !== manifest.tests.length) throw new Error('duplicate conformance test id');
  if (manifest.tests.some((test) => !test.evidence.length)) throw new Error('every conformance test requires expected evidence');
}

function unsignedBundle(manifest: ConformanceTestManifest, provider: BlackBoxConformanceProvider, results: ConformanceCaseResult[]): ConformanceResultBundle {
  const count = (status: ConformanceStatus) => results.filter((item) => item.status === status).length;
  return {
    schema: 'autonomy.conformance-result.v1', suiteVersion: manifest.suiteVersion, languageVersion: provider.languageVersion,
    provider: provider.id, implementationVersion: provider.implementationVersion, levels: [...provider.levels].sort(compareText), operations: [...provider.operations].sort(compareText), certification: 'self-attested', results,
    summary: { passed: count('pass'), failed: count('fail'), unsupported: count('unsupported'), unobserved: count('unobserved'), notApplicable: count('not-applicable') }, signatures: [],
  };
}

function result(test: ConformanceTestCase, status: ConformanceStatus, requestDigest: string, runnerEvidence: Record<string, string>, error?: string): ConformanceCaseResult {
  const observationClass = test.level === 'live-runtime' && (status === 'pass' || status === 'fail') ? 'live-observed' : 'test-observed';
  return { test: test.id, level: test.level, requirement: test.requirement, status, observationClass, requestDigest, runnerEvidence, error };
}

function bundlePayload(bundle: ConformanceResultBundle): string {
  const { signatures: _signatures, certification: _certification, ...payload } = bundle;
  return canonicalSemanticJson(payload);
}
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonicalSemanticJson(value)).digest('hex')}`; }
function keyFingerprint(key: KeyObject): string { return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex'); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`provider invocation exceeded ${milliseconds}ms`)), milliseconds);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function satisfiesRange(version: string, range: string): boolean {
  const actual = semverTuple(version);
  return range.trim().split(/\s+/).every((clause) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(clause);
    if (!match) return false;
    const expected = semverTuple(match[2]!);
    const comparison = actual[0] - expected[0] || actual[1] - expected[1] || actual[2] - expected[2];
    return match[1] === '>=' ? comparison >= 0 : match[1] === '<=' ? comparison <= 0 : match[1] === '>' ? comparison > 0 : match[1] === '<' ? comparison < 0 : comparison === 0;
  });
}
function semverTuple(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`invalid semantic version '${version}'`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
