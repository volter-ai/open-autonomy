import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyFrozenU3ObservationCalculus,
  type FrozenU3ObservationCalculus,
} from "./organization-u3-observation-calculus";
import {
  U3_EVALUATOR_SCHEMA,
  evaluateU3ObservationTrace,
  verifyU3EvaluationReport,
  type U3EvaluationReport,
  type U3EvaluationStatus,
  type U3TraceEvaluationContract,
  type U3TraceEvaluationInput,
  type U3TrustedKeys,
} from "./organization-u3-observation-evaluator";

export const U3_PRESERVATION_CERTIFICATE_SCHEMA =
  "open-autonomy.u3-preservation-certificate.v1" as const;
export const U3_COMPOSED_CERTIFICATE_SCHEMA =
  "open-autonomy.u3-composed-preservation-certificate.v1" as const;
export const U3_CERTIFICATE_IMPLEMENTATION_VERSION = "1.0.0" as const;
export const U3_CERTIFICATE_EVALUATOR_ANCHOR = {
  commit: "743e563b3bc63005763d8a66c95e7a7e6faa6a48",
  path: "packages/core/src/organization-u3-observation-evaluator.ts",
  sha256:
    "sha256:ee98925853f4fc49b056152cc1bbb5123539234c52bb59421198be7a31a0e86d",
} as const;

type Sha = `sha256:${string}`;
type ToolBinding = { id: string; version: string; digest: Sha };
export type U3CertificateDomain = {
  assumptionId: string;
  observationId: string;
  predicateId: "declared-observation-domain";
  promptContextDomain: string;
  providerLocalDomain: string;
  probeDomain: string;
  modelDomain: string;
  harnessDomain: string;
  erasedDimensionIds: string[];
  domainDigest: Sha;
};
type Result = U3EvaluationReport["results"][number];
type CertifiedResult = Result & {
  operator: "equal" | "refines" | "abstracts";
  direction: "left-to-right" | "right-to-left" | "symmetric";
  leftEndpoint: { observationId: string; subjectKind: string; schemaId: string; schemaVersion: string };
  rightEndpoint: { observationId: string; subjectKind: string; schemaId: string; schemaVersion: string };
  variance: { metric: "exact" | "absolute" | "relative"; unit: string; clock: "none" | "monotonic" | "wall"; window: "instant" | "interval" | "trace"; aggregation: "identity" | "maximum" | "mean"; direction: "left-to-right" | "right-to-left" | "symmetric"; bound: number };
};
type InterfaceProjection = {
  schema: "open-autonomy.u3-semantic-interface-projection.v1";
  retainedDimensions: string[];
  erasedDimensions: string[];
  requiredAssumptionIds: string[];
  digest: Sha;
};
export type U3ProvenGuarantee = {
  assumptionId: string;
  observationId: string;
  predicateId: "declared-observation-domain";
  domainDigest: Sha;
  relation: "preserved/equivalent" | "preserved/refinement" | "preserved/abstraction";
  policy: "equivalence-only" | "allow-refinement" | "allow-abstraction";
  resultWitnessDigest: Sha;
};

export type U3PreservationCertificate = {
  schema: typeof U3_PRESERVATION_CERTIFICATE_SCHEMA;
  version: typeof U3_CERTIFICATE_IMPLEMENTATION_VERSION;
  fixtureKind: "synthetic";
  assurance: "synthetic-only";
  empiricalClaim: false;
  closureClaim: false;
  campaignId: "organization-universality-2026-v9";
  generatedAt: string;
  bindings: {
    calculusSchema: string;
    calculusDigest: Sha;
    campaignVersion: "v9";
    campaignClaimDigest: Sha;
    evaluationContractSchema: typeof U3_EVALUATOR_SCHEMA;
    evaluationContractDigest: Sha;
    profileId: string;
    profileVersion: string;
    stratumId: string;
    inputSchema: "open-autonomy.u3-trace-evaluation-input.v2";
    inputDigest: Sha;
    sourceTraceSchema: "open-autonomy.u3-trace.v2";
    sourceTraceVersion: "2.0.0";
    sourceTraceDigest: Sha;
    sourceArtifactDigest: Sha;
    sourceInterfaceProjection: InterfaceProjection;
    liftedTraceSchema: "open-autonomy.u3-trace.v2";
    liftedTraceVersion: "2.0.0";
    liftedTraceDigest: Sha;
    liftedArtifactDigest: Sha;
    liftedInterfaceProjection: InterfaceProjection;
    reportSchema: "open-autonomy.u3-observation-report.v2";
    reportDigest: Sha;
    evaluator: typeof U3_CERTIFICATE_EVALUATOR_ANCHOR;
    certificateVersion: typeof U3_CERTIFICATE_IMPLEMENTATION_VERSION;
    adapters: ToolBinding[];
    compilers: ToolBinding[];
    runtimes: ToolBinding[];
    trustPolicyDigest: Sha;
  };
  assumptions: U3CertificateDomain[];
  typedLosses: U3TraceEvaluationInput["losses"];
  results: CertifiedResult[];
  replay: {
    input: U3TraceEvaluationInput;
    report: U3EvaluationReport;
  };
  digest: Sha;
};

export type U3ComposedPreservationCertificate = {
  schema: typeof U3_COMPOSED_CERTIFICATE_SCHEMA;
  version: typeof U3_CERTIFICATE_IMPLEMENTATION_VERSION;
  fixtureKind: "synthetic";
  assurance: "synthetic-only";
  empiricalClaim: false;
  closureClaim: false;
  campaignId: "organization-universality-2026-v9";
  generatedAt: string;
  leftCertificateDigest: Sha;
  rightCertificateDigest: Sha;
  semanticInterface: {
    leftTraceDigest: Sha;
    leftTraceSchema: "open-autonomy.u3-trace.v2";
    leftTraceVersion: "2.0.0";
    rightTraceDigest: Sha;
    rightTraceSchema: "open-autonomy.u3-trace.v2";
    rightTraceVersion: "2.0.0";
    artifactDigest: Sha;
    projection: InterfaceProjection;
  };
  assumptions: U3CertificateDomain[];
  guarantees: U3ProvenGuarantee[];
  typedLosses: U3TraceEvaluationInput["losses"];
  results: Array<{
    observationId: string;
    leftStatus: U3EvaluationStatus;
    rightStatus: U3EvaluationStatus;
    status: U3EvaluationStatus;
    leftEndpoint: CertifiedResult["leftEndpoint"];
    rightEndpoint: CertifiedResult["rightEndpoint"];
    operator: "equal" | "refines" | "abstracts" | null;
    direction: "left-to-right" | "right-to-left" | "symmetric" | null;
    lossIds: string[];
    witnessDigests: Sha[];
    quotientDigest: Sha | null;
    varianceBound: CertifiedResult["variance"] | null;
    witnessDigest: Sha;
  }>;
  digest: Sha;
};

const C = canonicalSemanticJson,
  H = (x: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  sha = (x: unknown): x is Sha =>
    typeof x === "string" && /^sha256:[0-9a-f]{64}$/.test(x),
  id = (x: unknown): x is string =>
    typeof x === "string" &&
    x.length <= 256 &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  exact = (x: unknown, keys: string[], label: string) => {
    if (!x || typeof x !== "object" || Array.isArray(x) ||
      C(Object.keys(x).sort()) !== C([...keys].sort()))
      throw Error(`${label} schema invalid`);
    return x as any;
  },
  orderedIds = (xs: unknown, label: string) => {
    if (!Array.isArray(xs) || xs.some((x) => !id(x)) ||
      new Set(xs).size !== xs.length || C(xs) !== C([...xs].sort()))
      throw Error(`${label} order invalid`);
  },
  bodyWithout = (x: any, key: string) =>
    Object.fromEntries(Object.entries(x).filter(([k]) => k !== key));

function preflight(value: unknown) {
  let nodes = 0, bytes = 0;
  const active = new Set<object>(), stack: Array<[unknown, number, boolean]> = [[value, 0, true]];
  while (stack.length) {
    const [x, depth, enter] = stack.pop()!;
    if (!enter) { active.delete(x as object); continue; }
    if (depth > 64 || ++nodes > 50000) throw Error("certificate resource bound");
    if (typeof x === "string") { bytes += Buffer.byteLength(x); if (Buffer.byteLength(x) > 8192) throw Error("certificate field bound"); continue; }
    if (!x || typeof x !== "object") continue;
    if (active.has(x as object)) throw Error("certificate cyclic input");
    active.add(x as object); stack.push([x, depth, false]);
    const values = Array.isArray(x) ? x : Object.values(x);
    if (values.length > 8192) throw Error("certificate collection bound");
    for (const child of values) stack.push([child, depth + 1, true]);
  }
  if (bytes > 8_388_608) throw Error("certificate byte bound");
}
function freeze<T>(value: T): T {
  const copy = structuredClone(value), stack: unknown[] = [copy];
  while (stack.length) { const x = stack.pop(); if (x && typeof x === "object" && !Object.isFrozen(x)) { stack.push(...Object.values(x)); Object.freeze(x); } }
  return copy;
}
function traceArtifactDigest(trace: any): Sha {
  return H(C({
    schema: trace.schema, version: trace.version, window: trace.window,
    closure: trace.closure, completeness: trace.completeness, gapCodes: trace.gapCodes,
    events: trace.events.map((event: any) => ({
      observationId: event.observationId, sampleId: event.sampleId,
      correlationId: event.correlationId, subject: event.subject,
      schemaId: event.schemaId, schemaVersion: event.schemaVersion,
      adapterId: event.adapterId, adapterVersion: event.adapterVersion, adapterDigest: event.adapterDigest,
      compilerId: event.compilerId, compilerVersion: event.compilerVersion, compilerDigest: event.compilerDigest,
      runtimeId: event.runtimeId, runtimeVersion: event.runtimeVersion, runtimeDigest: event.runtimeDigest,
      payload: event.payload,
    })),
  }));
}
const RETAINED_DIMENSIONS = ["adapter", "compiler", "completeness", "correlation", "payload", "runtime", "schema", "subject", "window"];
const ERASED_DIMENSIONS = ["authentication", "causal-order", "custody", "epistemic", "evidence", "provenance", "run-identity", "side", "time", "trace-identity"];
function interfaceProjection(assumptions: U3CertificateDomain[]): InterfaceProjection {
  const body = { schema: "open-autonomy.u3-semantic-interface-projection.v1" as const,
    retainedDimensions: [...RETAINED_DIMENSIONS], erasedDimensions: [...ERASED_DIMENSIONS],
    requiredAssumptionIds: assumptions.map((x) => x.assumptionId).sort() };
  return { ...body, digest: H(`open-autonomy.u3-semantic-interface-projection.v1\0${C(body)}`) };
}
function trustDigest(contract: U3TraceEvaluationContract, trusted: U3TrustedKeys): Sha {
  return H(C(contract.authorities.map((a) => ({
    id: a.id, role: a.role, trustRootDigest: a.trustRootDigest,
    verificationKeyDigest: a.verificationKeyDigest,
    suppliedKeyDigest: H(trusted.keys[a.id] ?? ""),
  }))));
}
function verifyDomains(domains: U3CertificateDomain[], calculus: FrozenU3ObservationCalculus, profileId: string) {
  const profile = calculus.profiles.find((p) => p.id === profileId)!;
  if (!Array.isArray(domains) || C(domains.map((x) => x.observationId)) !== C(profile.observationIds))
    throw Error("assumption observation coverage invalid");
  for (const d of domains) {
    exact(d, ["assumptionId", "observationId", "predicateId", "promptContextDomain", "providerLocalDomain", "probeDomain", "modelDomain", "harnessDomain", "erasedDimensionIds", "domainDigest"], "assumption");
    const { domainDigest, ...domainBody } = d;
    if (![d.assumptionId, d.observationId, d.promptContextDomain, d.providerLocalDomain, d.probeDomain, d.modelDomain, d.harnessDomain].every(id) ||
      d.predicateId !== "declared-observation-domain" || C(d.erasedDimensionIds) !== C(ERASED_DIMENSIONS) || domainDigest !== H(C(domainBody)))
      throw Error("assumption domain invalid");
  }
}
function toolsExact(actual: ToolBinding[], expected: ToolBinding[], label: string) {
  if (C(actual) !== C(expected)) throw Error(`${label} binding invalid`);
  for (const x of actual) { exact(x, ["id", "version", "digest"], label); if (!id(x.id) || !id(x.version) || !sha(x.digest)) throw Error(`${label} invalid`); }
}

export function verifyU3CertificateGitCustody(root = process.cwd()) {
  const a = U3_CERTIFICATE_EVALUATOR_ANCHOR,
    rev = spawnSync("git", ["rev-parse", "--verify", `${a.commit}^{commit}`], { cwd: root, encoding: "utf8" }),
    historical = spawnSync("git", ["show", `${a.commit}:${a.path}`], { cwd: root });
  if (rev.status || rev.stdout.trim() !== a.commit || historical.status ||
    H(historical.stdout) !== a.sha256 || H(readFileSync(`${root}/${a.path}`)) !== a.sha256)
    throw Error("certificate evaluator custody invalid");
}

export function createU3PreservationCertificate(args: {
  calculus: FrozenU3ObservationCalculus;
  contract: U3TraceEvaluationContract;
  input: U3TraceEvaluationInput;
  trusted: U3TrustedKeys;
  report: U3EvaluationReport;
  assumptions: U3CertificateDomain[];
  generatedAt: string;
}): U3PreservationCertificate {
  preflight(args);
  verifyFrozenU3ObservationCalculus(args.calculus, { requireFixtureDigest: false });
  verifyU3EvaluationReport(args.report, args.calculus, args.contract, args.input, args.trusted);
  const replay = evaluateU3ObservationTrace(args.calculus, args.contract, args.input, args.trusted);
  if (C(replay) !== C(args.report)) throw Error("certificate report replay mismatch");
  verifyDomains(args.assumptions, args.calculus, args.input.profileId);
  const profile = args.calculus.profiles.find((p) => p.id === args.input.profileId)!;
  const projection = interfaceProjection(args.assumptions);
  if (!Number.isFinite(Date.parse(args.generatedAt)) || new Date(args.generatedAt).toISOString() !== args.generatedAt)
    throw Error("certificate generatedAt invalid");
  const body = {
    schema: U3_PRESERVATION_CERTIFICATE_SCHEMA, version: U3_CERTIFICATE_IMPLEMENTATION_VERSION,
    fixtureKind: "synthetic" as const, assurance: "synthetic-only" as const,
    empiricalClaim: false as const, closureClaim: false as const,
    campaignId: "organization-universality-2026-v9" as const, generatedAt: args.generatedAt,
    bindings: {
      calculusSchema: args.calculus.schema, calculusDigest: args.calculus.digest,
      campaignVersion: "v9" as const,
      campaignClaimDigest: args.calculus.predecessors.find((x) => x.id === "claim")!.sha256,
      evaluationContractSchema: args.contract.schema, evaluationContractDigest: args.contract.digest,
      profileId: profile.id, profileVersion: profile.version, stratumId: profile.stratumId,
      inputSchema: args.input.schema, inputDigest: H(C(args.input)),
      sourceTraceSchema: args.input.source.schema, sourceTraceVersion: args.input.source.version,
      sourceTraceDigest: args.report.sourceTraceDigest, sourceArtifactDigest: traceArtifactDigest(args.input.source),
      sourceInterfaceProjection: projection,
      liftedTraceSchema: args.input.lifted.schema, liftedTraceVersion: args.input.lifted.version,
      liftedTraceDigest: args.report.liftedTraceDigest, liftedArtifactDigest: traceArtifactDigest(args.input.lifted),
      liftedInterfaceProjection: projection,
      reportSchema: args.report.schema, reportDigest: args.report.digest,
      evaluator: U3_CERTIFICATE_EVALUATOR_ANCHOR, certificateVersion: U3_CERTIFICATE_IMPLEMENTATION_VERSION,
      adapters: structuredClone(args.contract.adapters), compilers: structuredClone(args.contract.compilers), runtimes: structuredClone(args.contract.runtimes),
      trustPolicyDigest: trustDigest(args.contract, args.trusted),
    },
    assumptions: structuredClone(args.assumptions), typedLosses: structuredClone(args.input.losses),
    results: args.report.results.map((result) => {
      const comparison = args.calculus.comparisons.find((x) => x.id === result.comparisonId)!, variance = args.calculus.variances.find((x) => x.id === result.varianceId)!;
      return { ...structuredClone(result), operator: comparison.operator, direction: comparison.direction,
        leftEndpoint: { observationId: comparison.left.observationId, subjectKind: comparison.left.subjectKind, schemaId: comparison.left.schemaId, schemaVersion: comparison.left.schemaVersion },
        rightEndpoint: { observationId: comparison.right.observationId, subjectKind: comparison.right.subjectKind, schemaId: comparison.right.schemaId, schemaVersion: comparison.right.schemaVersion },
        variance: { metric: variance.metric, unit: variance.unit, clock: variance.clock, window: variance.window, aggregation: variance.aggregation, direction: comparison.direction, bound: variance.bound } };
    }), replay: { input: structuredClone(args.input), report: structuredClone(args.report) },
  };
  return freeze({ ...body, digest: H(`${U3_PRESERVATION_CERTIFICATE_SCHEMA}\0${C(body)}`) });
}

export function verifyU3PreservationCertificate(
  certificate: U3PreservationCertificate,
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  trusted: U3TrustedKeys,
) {
  preflight(certificate);
  exact(certificate, ["schema", "version", "fixtureKind", "assurance", "empiricalClaim", "closureClaim", "campaignId", "generatedAt", "bindings", "assumptions", "typedLosses", "results", "replay", "digest"], "certificate");
  if (certificate.schema !== U3_PRESERVATION_CERTIFICATE_SCHEMA || certificate.version !== U3_CERTIFICATE_IMPLEMENTATION_VERSION ||
    certificate.fixtureKind !== "synthetic" || certificate.assurance !== "synthetic-only" || certificate.empiricalClaim !== false || certificate.closureClaim !== false ||
    certificate.campaignId !== "organization-universality-2026-v9" || !sha(certificate.digest)) throw Error("certificate boundary invalid");
  exact(certificate.bindings, ["calculusSchema", "calculusDigest", "campaignVersion", "campaignClaimDigest", "evaluationContractSchema", "evaluationContractDigest", "profileId", "profileVersion", "stratumId", "inputSchema", "inputDigest", "sourceTraceSchema", "sourceTraceVersion", "sourceTraceDigest", "sourceArtifactDigest", "sourceInterfaceProjection", "liftedTraceSchema", "liftedTraceVersion", "liftedTraceDigest", "liftedArtifactDigest", "liftedInterfaceProjection", "reportSchema", "reportDigest", "evaluator", "certificateVersion", "adapters", "compilers", "runtimes", "trustPolicyDigest"], "certificate bindings");
  exact(certificate.bindings.evaluator, ["commit", "path", "sha256"], "evaluator anchor");
  exact(certificate.replay, ["input", "report"], "certificate replay");
  const recreated = createU3PreservationCertificate({ calculus, contract, input: certificate.replay.input, trusted, report: certificate.replay.report, assumptions: certificate.assumptions, generatedAt: certificate.generatedAt });
  toolsExact(certificate.bindings.adapters, contract.adapters, "adapter");
  toolsExact(certificate.bindings.compilers, contract.compilers, "compiler");
  toolsExact(certificate.bindings.runtimes, contract.runtimes, "runtime");
  if (C(recreated) !== C(certificate)) throw Error("certificate replay mismatch");
  return freeze(certificate);
}

const BAD: U3EvaluationStatus[] = ["violated", "incompatible", "unknown"];
function composeVariance(a: CertifiedResult, b: CertifiedResult, sameQuotient: boolean): CertifiedResult["variance"] | null {
  if (a.status !== "permitted-variance" && b.status !== "permitted-variance") return null;
  const active = [a, b].filter((x) => x.status === "permitted-variance");
  if ([a, b].some((x) => !["permitted-variance", "preserved/equivalent"].includes(x.status))) throw Error("unsupported variance composition");
  if (a.operator !== b.operator ||
    (a.operator === "refines" && a.direction !== b.direction) ||
    (a.operator === "abstracts" && (!sameQuotient || a.direction !== b.direction)))
    throw Error("variance relation composition invalid");
  if (active.length === 1) return structuredClone(active[0].variance);
  const [x, y] = active.map((r) => r.variance);
  if (x.metric !== y.metric || x.unit !== y.unit || x.clock !== y.clock || x.window !== y.window || x.aggregation !== y.aggregation || x.direction !== y.direction) throw Error("variance policy composition invalid");
  const bound = x.metric === "exact" ? 0 : x.metric === "absolute" ? x.bound + y.bound : (1 + x.bound) * (1 + y.bound) - 1;
  if (!Number.isFinite(bound)) throw Error("variance bound composition invalid");
  return { ...x, bound };
}
function composedStatus(a: CertifiedResult, b: CertifiedResult, sameQuotient: boolean): U3EvaluationStatus {
  if (C(a.rightEndpoint) !== C(b.leftEndpoint)) throw Error("composition endpoint alignment invalid");
  for (const status of BAD) if (a.status === status || b.status === status) return status;
  if (a.status === "permitted-typed-loss" || b.status === "permitted-typed-loss") return "permitted-typed-loss";
  if (a.status === "permitted-variance" || b.status === "permitted-variance") { composeVariance(a, b, sameQuotient); return "permitted-variance"; }
  if (a.status === "preserved/equivalent") return b.status;
  if (b.status === "preserved/equivalent") return a.status;
  if (a.status === "preserved/refinement" && b.status === "preserved/refinement" && a.direction === b.direction) return "preserved/refinement";
  if (a.status === "preserved/abstraction" && b.status === "preserved/abstraction" && a.direction === b.direction && sameQuotient) return "preserved/abstraction";
  throw Error("unsupported relation composition");
}

export function composeU3PreservationCertificates(args: {
  left: U3PreservationCertificate;
  right: U3PreservationCertificate;
  leftCalculus: FrozenU3ObservationCalculus;
  leftContract: U3TraceEvaluationContract;
  leftTrusted: U3TrustedKeys;
  rightCalculus: FrozenU3ObservationCalculus;
  rightContract: U3TraceEvaluationContract;
  rightTrusted: U3TrustedKeys;
  guarantees: U3ProvenGuarantee[];
  generatedAt: string;
}): U3ComposedPreservationCertificate {
  preflight(args);
  verifyU3PreservationCertificate(args.left, args.leftCalculus, args.leftContract, args.leftTrusted);
  verifyU3PreservationCertificate(args.right, args.rightCalculus, args.rightContract, args.rightTrusted);
  if (!Array.isArray(args.guarantees) || C(args.guarantees.map((x) => x.observationId)) !== C(args.guarantees.map((x) => x.observationId).sort()) || new Set(args.guarantees.map((x) => x.observationId)).size !== args.guarantees.length)
    throw Error("composition guarantee order invalid");
  const rightAssumptions = new Map(args.right.assumptions.map((x) => [x.assumptionId, x])), leftAssumptions = new Map(args.left.assumptions.map((x) => [x.assumptionId, x])), leftResults = new Map(args.left.results.map((x) => [x.observationId, x]));
  for (const guarantee of args.guarantees) {
    exact(guarantee, ["assumptionId", "observationId", "predicateId", "domainDigest", "relation", "policy", "resultWitnessDigest"], "composition guarantee");
    const assumption = rightAssumptions.get(guarantee.assumptionId), leftAssumption = leftAssumptions.get(guarantee.assumptionId), result = leftResults.get(guarantee.observationId);
    if (!assumption || !leftAssumption || C(assumption) !== C(leftAssumption) || assumption.domainDigest !== leftAssumption.domainDigest || !result || assumption.observationId !== guarantee.observationId || assumption.predicateId !== guarantee.predicateId || assumption.domainDigest !== guarantee.domainDigest ||
      guarantee.resultWitnessDigest !== result.witnessDigest || guarantee.relation !== result.status || !["preserved/equivalent", "preserved/refinement", "preserved/abstraction"].includes(result.status) || !["equivalence-only", "allow-refinement", "allow-abstraction"].includes(guarantee.policy) ||
      (guarantee.policy === "equivalence-only" && result.status !== "preserved/equivalent") ||
      (guarantee.policy === "allow-refinement" && !["preserved/equivalent", "preserved/refinement"].includes(result.status)) ||
      (guarantee.policy === "allow-abstraction" && !["preserved/equivalent", "preserved/abstraction"].includes(result.status)))
      throw Error("composition guarantee discharge invalid");
  }
  if (args.left.bindings.liftedTraceSchema !== args.right.bindings.sourceTraceSchema ||
    args.left.bindings.liftedTraceVersion !== args.right.bindings.sourceTraceVersion ||
    args.left.bindings.liftedArtifactDigest !== args.right.bindings.sourceArtifactDigest ||
    C(args.left.bindings.liftedInterfaceProjection) !== C(args.right.bindings.sourceInterfaceProjection))
    throw Error("composition intermediate alignment invalid");
  if (!Number.isFinite(Date.parse(args.generatedAt)) || new Date(args.generatedAt).toISOString() !== args.generatedAt) throw Error("composition generatedAt invalid");
  const discharged = new Set(args.guarantees.map((x) => x.assumptionId)), assumptions = [...args.left.assumptions, ...args.right.assumptions.filter((x) => !discharged.has(x.assumptionId))];
  const keyed = new Map<string, U3CertificateDomain>();
  for (const a of assumptions) { const old = keyed.get(a.assumptionId); if (old && C(old) !== C(a)) throw Error("composition assumption conflict"); keyed.set(a.assumptionId, a); }
  const accepted = new Set([...keyed.keys(), ...discharged]);
  if (args.left.bindings.liftedInterfaceProjection.requiredAssumptionIds.some((x) => !accepted.has(x))) throw Error("interface erasure assumption invalid");
  const endpointKey = (x: CertifiedResult["leftEndpoint"]) => C(x),
    rightResults = new Map<string, CertifiedResult>();
  for (const result of args.right.results) {
    const key = endpointKey(result.leftEndpoint);
    if (rightResults.has(key)) throw Error("composition intermediate endpoint uniqueness invalid");
    rightResults.set(key, result);
  }
  const leftIntermediateKeys = args.left.results.map((x) => endpointKey(x.rightEndpoint)).sort(), rightIntermediateKeys = args.right.results.map((x) => endpointKey(x.leftEndpoint)).sort();
  if (new Set(leftIntermediateKeys).size !== leftIntermediateKeys.length || C(leftIntermediateKeys) !== C(rightIntermediateKeys))
    throw Error("composition intermediate endpoint coverage invalid");
  const results = args.left.results.map((l) => {
    const r = rightResults.get(endpointKey(l.rightEndpoint))!,
      lq = args.leftContract.quotients.find((q) => q.comparisonId === l.comparisonId),
      rq = args.rightContract.quotients.find((q) => q.comparisonId === r.comparisonId),
      lqDigest = lq ? H(C({ operator: lq.operator, argument: lq.argument })) : null,
      rqDigest = rq ? H(C({ operator: rq.operator, argument: rq.argument })) : null,
      quotientDigest = lqDigest !== null && lqDigest === rqDigest ? lqDigest : null,
      status = composedStatus(l, r, quotientDigest !== null),
      varianceBound = composeVariance(l, r, quotientDigest !== null),
      relational = status.startsWith("preserved/") || status === "permitted-variance",
      operator = !relational ? null : status === "preserved/equivalent" ? "equal" as const : status === "preserved/refinement" ? "refines" as const : status === "preserved/abstraction" ? "abstracts" as const : l.operator,
      direction = !relational ? null : status === "preserved/equivalent" ? "symmetric" as const : status === "permitted-variance" ? varianceBound!.direction : (l.status === "preserved/equivalent" ? r.direction : l.direction),
      leftEndpoint = structuredClone(l.leftEndpoint), rightEndpoint = structuredClone(r.rightEndpoint),
      lossIds = [...new Set([...l.lossIds, ...r.lossIds])].sort(),
      witnessDigests = [l.witnessDigest, r.witnessDigest].sort(),
      witnessDigest = H(C({ observationId: l.observationId, leftStatus: l.status, rightStatus: r.status, status, leftEndpoint, rightEndpoint, operator, direction, lossIds, witnessDigests, quotientDigest, varianceBound }));
    if ((l.lossIds.length || r.lossIds.length) && (!lossIds.length || status !== "permitted-typed-loss")) throw Error("composition loss erasure invalid");
    return { observationId: l.observationId, leftStatus: l.status, rightStatus: r.status, status, leftEndpoint, rightEndpoint, operator, direction, lossIds, witnessDigests, quotientDigest, varianceBound, witnessDigest };
  });
  const typedLosses = [...args.left.typedLosses, ...args.right.typedLosses].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(typedLosses.map((x) => x.id)).size !== typedLosses.length) throw Error("composition typed loss identity invalid");
  const body = {
    schema: U3_COMPOSED_CERTIFICATE_SCHEMA, version: U3_CERTIFICATE_IMPLEMENTATION_VERSION,
    fixtureKind: "synthetic" as const, assurance: "synthetic-only" as const, empiricalClaim: false as const, closureClaim: false as const,
    campaignId: "organization-universality-2026-v9" as const, generatedAt: args.generatedAt,
    leftCertificateDigest: args.left.digest, rightCertificateDigest: args.right.digest,
    semanticInterface: { leftTraceDigest: args.left.bindings.liftedTraceDigest, leftTraceSchema: args.left.bindings.liftedTraceSchema, leftTraceVersion: args.left.bindings.liftedTraceVersion, rightTraceDigest: args.right.bindings.sourceTraceDigest, rightTraceSchema: args.right.bindings.sourceTraceSchema, rightTraceVersion: args.right.bindings.sourceTraceVersion, artifactDigest: args.left.bindings.liftedArtifactDigest, projection: args.left.bindings.liftedInterfaceProjection },
    assumptions: [...keyed.values()].sort((a, b) => a.observationId.localeCompare(b.observationId)), guarantees: structuredClone(args.guarantees), typedLosses: structuredClone(typedLosses), results,
  };
  return freeze({ ...body, digest: H(`${U3_COMPOSED_CERTIFICATE_SCHEMA}\0${C(body)}`) });
}

export function verifyU3ComposedPreservationCertificate(
  composed: U3ComposedPreservationCertificate,
  args: Omit<Parameters<typeof composeU3PreservationCertificates>[0], "generatedAt">,
) {
  preflight(composed);
  exact(composed, ["schema", "version", "fixtureKind", "assurance", "empiricalClaim", "closureClaim", "campaignId", "generatedAt", "leftCertificateDigest", "rightCertificateDigest", "semanticInterface", "assumptions", "guarantees", "typedLosses", "results", "digest"], "composed certificate");
  const replay = composeU3PreservationCertificates({ ...args, generatedAt: composed.generatedAt });
  if (C(replay) !== C(composed)) throw Error("composed certificate replay mismatch");
  return freeze(composed);
}
