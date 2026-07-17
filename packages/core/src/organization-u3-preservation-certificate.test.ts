import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { canonicalSemanticJson as C } from "./organization-canonical";
import { U3_OBSERVATION_CALCULUS_SCHEMA, U3_PREDECESSORS, U3_TAXONOMY, freezeU3ObservationCalculus, type U3ObservationCalculus } from "./organization-u3-observation-calculus";
import { U3_EVALUATOR_SCHEMA, evaluateU3ObservationTrace, freezeU3TraceEvaluationContract, integrityU3Event, signU3Record } from "./organization-u3-observation-evaluator";
import { U3_PRESERVATION_CERTIFICATE_SCHEMA, composeU3PreservationCertificates, createU3PreservationCertificate, verifyU3CertificateGitCustody, verifyU3ComposedPreservationCertificate, verifyU3PreservationCertificate } from "./organization-u3-preservation-certificate";

type Any = any;
const H = (x: string | Uint8Array) => `sha256:${createHash("sha256").update(x).digest("hex")}` as const,
  S = (x: string) => `sha256:${x.repeat(64)}` as const,
  K = { source: "source-secret", lifted: "lifted-secret", evidence: "evidence-secret", provenance: "provenance-secret", custody: "custody-secret" },
  sort = <T extends { id: string }>(xs: T[]) => xs.sort((a, b) => a.id.localeCompare(b.id));

function calculus(operator: "equal" | "refines" | "abstracts" = "equal", direction: "left-to-right" | "right-to-left" = "left-to-right", metric: "exact" | "absolute" | "relative" = "exact", bound = 0, shiftRight = false, optionalLast = false) {
  const observations: Any[] = sort(U3_TAXONOMY.map((taxonomy, i) => ({
    id: `obs-${taxonomy}`, taxonomy, subjectSort: "provider", subjectKind: "worker", providerId: `provider-${i}`, componentId: null,
    nativeSchemaId: "event-schema", nativeSchemaVersion: "1", valueSchemaId: "value-schema", valueSchemaVersion: "1", sourceProjectionId: "value",
    unit: "event", clock: "monotonic", window: "trace", dedupKey: `sample-${i}`, completeness: "complete", evidencePolicyId: "verified", authenticationPolicyId: "mac", missing: "unknown",
    applicability: [{ stratumId: "coding", status: "mandatory", predicateId: "always", evidenceDigest: null, reason: null }],
  })));
  const comparisons = sort(observations.map((o, i) => { const target = shiftRight ? observations[(i + 1) % observations.length] : o; return ({ id: `comparison-${o.id}`,
    left: { observationId: o.id, subjectKind: "worker", schemaId: "value-schema", schemaVersion: "1" }, right: { observationId: target.id, subjectKind: "worker", schemaId: "value-schema", schemaVersion: "1" },
    sourceProjectionId: "identity-value", targetProjectionId: "identity-value", direction: i === 0 && operator !== "equal" ? direction : "symmetric", operator: i === 0 ? operator : "equal", missing: "unknown" }); }));
  const variances = sort(comparisons.map((c, i) => ({ id: `variance-${c.id}`, comparisonId: c.id, operator: "accept-within", metric: i === 0 ? metric : "exact", unit: "event", clock: "monotonic", window: "trace", aggregation: "identity", missing: "unknown", bound: i === 0 ? bound : 0, minimumSamples: 1 })));
  if (optionalLast) observations.at(-1)!.applicability[0].status = "optional";
  const body: U3ObservationCalculus = {
    schema: U3_OBSERVATION_CALCULUS_SCHEMA, fixtureKind: "synthetic", denominatorScope: "fixture-local", empiricalRegistration: false, closureClaim: false, campaignId: "organization-universality-2026-v9",
    predecessors: structuredClone(U3_PREDECESSORS) as Any,
    schemas: [{ id: "event-schema", version: "1", mediaType: "application/json", schemaSha256: S("a") }, { id: "value-schema", version: "1", mediaType: "application/json", schemaSha256: S("9") }],
    predicates: [{ id: "always", version: "1", operator: "always", argument: "" }],
    projections: [{ id: "identity-value", version: "1", operator: "identity", argument: "", inputSchemaId: "value-schema", inputSchemaVersion: "1", outputSchemaId: "value-schema", outputSchemaVersion: "1" }, { id: "value", version: "1", operator: "field", argument: "value", inputSchemaId: "event-schema", inputSchemaVersion: "1", outputSchemaId: "value-schema", outputSchemaVersion: "1" }],
    evidencePolicies: [{ id: "verified", required: true, minimum: "verification", referenceSchemaId: "event-schema", referenceSchemaVersion: "1" }], authenticationPolicies: [{ id: "mac", required: true, mechanism: "mac", trustRootSha256: S("b") }], strata: [{ id: "coding" }], observations, comparisons: comparisons as Any, variances: variances as Any,
    profiles: [{ id: "base", lineageId: "coding", version: "1.0.0", stratumId: "coding", parentIds: [], observationIds: observations.map((x) => x.id), comparisonIds: comparisons.map((x) => x.id), varianceIds: variances.map((x) => x.id), forbiddenLossObservationIds: observations.filter((x) => !optionalLast || x !== observations.at(-1)).map((x) => x.id), unknownPolicy: "report" }], profilePairs: [],
  };
  return freezeU3ObservationCalculus(body, { requireFixtureDigest: false });
}
function fixture(operator: "equal" | "refines" | "abstracts" = "equal", direction: "left-to-right" | "right-to-left" = "left-to-right", metric: "exact" | "absolute" | "relative" = "exact", bound = 0, values: [number, number] = [10, 10], shiftRight = false, optionalLast = false) {
  const calc = calculus(operator, direction, metric, bound, shiftRight, optionalLast), shape = { id: "event-shape", schemaId: "event-schema", schemaVersion: "1", schemaDigest: S("a"), type: "object" as const, required: ["value"], properties: [{ name: "value", type: "number" as const }] }, valueShape = { id: "value-shape", schemaId: "value-schema", schemaVersion: "1", schemaDigest: S("9"), type: "number" as const, required: [], properties: [] };
  const ctr = freezeU3TraceEvaluationContract({ schema: U3_EVALUATOR_SCHEMA, fixtureKind: "synthetic", calculusDigest: calc.digest,
    shapes: sort([{ ...shape, semanticDigest: H(C(shape)) }, { ...valueShape, semanticDigest: H(C(valueShape)) }]), adapters: [{ id: "adapter", version: "1", digest: S("c") }], compilers: [{ id: "compiler", version: "1", digest: S("d") }], runtimes: [{ id: "runtime", version: "1", digest: S("e") }],
    authorities: sort([{ id: "custody", role: "custodian" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.custody) }, { id: "evidence", role: "evidence-producer" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.evidence) }, { id: "lifted", role: "trace-producer" as const, trustRootDigest: S("b"), verificationKeyDigest: H(K.lifted) }, { id: "provenance", role: "provenance-producer" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.provenance) }, { id: "source", role: "trace-producer" as const, trustRootDigest: S("b"), verificationKeyDigest: H(K.source) }]),
    quotients: calc.comparisons.filter((x) => x.operator === "abstracts").map((x) => ({ id: `quotient-${x.id}`, comparisonId: x.id, operator: "json-pointer" as const, argument: "" })) });
  const evidence: Any[] = [], provenance: Any[] = [];
  const makeTrace = (side: "source" | "lifted", authorityId: "source" | "lifted", selected: number) => {
    const events: Any[] = [];
    for (const observation of calc.observations) {
      const suffix = `${side}-${observation.id}`, provenanceId = `provenance-${suffix}`, evidenceId = `evidence-${suffix}`,
        p0 = { id: provenanceId, producerAuthorityId: "provenance", custodyAuthorityId: "custody", artifactDigest: H(`artifact-${suffix}`) }, producerReceipt = signU3Record(K.provenance, p0), p1 = { ...p0, producerReceipt };
      provenance.push({ ...p1, custodyReceipt: signU3Record(K.custody, p1) });
      const e0: Any = { id: `event-${suffix}`, sampleId: "sample-0", observationId: observation.id, runId: "run", traceId: `trace-${side}`, side, subject: { sort: "provider", providerId: observation.providerId, componentId: null }, schemaId: "event-schema", schemaVersion: "1", timestamp: null, logicalOrder: events.length + 1, causalParentIds: [], correlationId: "correlation-0", epistemic: "verification", provenanceId, evidenceId, adapterId: "adapter", adapterVersion: "1", adapterDigest: S("c"), compilerId: "compiler", compilerVersion: "1", compilerDigest: S("d"), runtimeId: "runtime", runtimeVersion: "1", runtimeDigest: S("e"), payload: { value: observation.id === calc.observations[0].id ? selected : 10 } }, integrityDigest = integrityU3Event(e0), authentication = { authorityId, receipt: signU3Record(K[authorityId], { ...e0, integrityDigest }) }, event = { ...e0, integrityDigest, authentication };
      events.push(event);
      const ev0: Any = { id: evidenceId, eventId: event.id, payloadDigest: H(C(event.payload)), runId: "run", subjectDigest: H(C(event.subject)), provenanceDigest: p0.artifactDigest, custodyDigest: H(C({ custodyAuthorityId: "custody" })), authorityId: "evidence", custodyAuthorityId: "custody" }, receipt = signU3Record(K.evidence, ev0), ev1 = { ...ev0, receipt };
      evidence.push({ ...ev1, custodyReceipt: signU3Record(K.custody, ev1) });
    }
    const t0: Any = { schema: "open-autonomy.u3-trace.v2", version: "2.0.0", traceId: `trace-${side}`, side, runId: "run", producerAuthorityId: authorityId, start: null, end: null, logicalStart: 0, logicalEnd: events.length + 1, window: "trace", closure: "closed", completeness: "complete", gapCodes: [], events, closureCustodianAuthorityId: "custody" }, producerReceipt = signU3Record(K[authorityId], t0), t1 = { ...t0, producerReceipt };
    return { ...t1, closureReceipt: signU3Record(K.custody, t1) };
  };
  const input: Any = { schema: "open-autonomy.u3-trace-evaluation-input.v2", fixtureKind: "synthetic", calculusDigest: calc.digest, contractDigest: ctr.digest, profileId: "base", runId: "run", source: makeTrace("source", "source", values[0]), lifted: makeTrace("lifted", "lifted", values[1]), evidence, provenance, losses: [] };
  sort(evidence); sort(provenance);
  const trusted = { keys: K }, report = evaluateU3ObservationTrace(calc, ctr, input, trusted), assumptions = calc.profiles[0].observationIds.map((observationId) => {
    const body = { assumptionId: `assumption-${observationId}`, observationId, predicateId: "declared-observation-domain" as const, promptDomain: `prompt-${observationId}`, contextDomain: `context-${observationId}`, providerLocalDomain: `provider-${observationId}`, probeDomain: "probe-synthetic", modelDomain: "model-synthetic", harnessDomain: "harness-synthetic", erasedDimensionIds: ["authentication", "causal-order", "custody", "epistemic", "evidence", "provenance", "run-identity", "side", "time", "trace-identity"] };
    return { ...body, domainDigest: H(C(body)) };
  });
  return { calc, ctr, input, trusted, report, assumptions };
}
function certificate(operator: "equal" | "refines" | "abstracts" = "equal", direction: "left-to-right" | "right-to-left" = "left-to-right", metric: "exact" | "absolute" | "relative" = "exact", bound = 0, values: [number, number] = [10, 10], shiftRight = false) { const f = fixture(operator, direction, metric, bound, values, shiftRight); return { ...f, cert: createU3PreservationCertificate({ calculus: f.calc, contract: f.ctr, input: f.input, trusted: f.trusted, report: f.report, assumptions: f.assumptions, generatedAt: "2026-07-17T00:00:00.000Z" }) }; }
function resignCertificateTrace(trace: Any) { const key = trace.side as "source" | "lifted", bare = (({ producerReceipt: _p, closureReceipt: _c, ...x }) => x)(trace), producerReceipt = signU3Record(K[key], bare), withProducer = { ...bare, producerReceipt }; Object.assign(trace, withProducer, { closureReceipt: signU3Record(K.custody, withProducer) }); }
function removeCertificateObservation(f: ReturnType<typeof fixture>, side: "source" | "lifted", observationId: string) {
  const trace = f.input[side], removed = trace.events.filter((x: Any) => x.observationId === observationId), evidenceIds = new Set(removed.map((x: Any) => x.evidenceId)), provenanceIds = new Set(removed.map((x: Any) => x.provenanceId));
  trace.events = trace.events.filter((x: Any) => x.observationId !== observationId); f.input.evidence = f.input.evidence.filter((x: Any) => !evidenceIds.has(x.id)); f.input.provenance = f.input.provenance.filter((x: Any) => !provenanceIds.has(x.id)); resignCertificateTrace(trace);
}
function makeCertificateObservationIncompatible(f: ReturnType<typeof fixture>, side: "source" | "lifted", observationId: string) {
  const trace = f.input[side], event = trace.events.find((x: Any) => x.observationId === observationId)!; event.payload.value = "not-a-number";
  event.integrityDigest = integrityU3Event((({ integrityDigest: _i, authentication: _a, ...x }) => x)(event)); event.authentication.receipt = signU3Record(K[side], (({ authentication: _a, ...x }) => x)(event));
  const evidence = f.input.evidence.find((x: Any) => x.id === event.evidenceId)!, bare = (({ receipt: _r, custodyReceipt: _c, ...x }) => x)(evidence); bare.payloadDigest = H(C(event.payload)); const receipt = signU3Record(K.evidence, bare), withProducer = { ...bare, receipt }; Object.assign(evidence, withProducer, { custodyReceipt: signU3Record(K.custody, withProducer) }); resignCertificateTrace(trace);
}
function issueCertificate(f: ReturnType<typeof fixture>) { f.report = evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted); return createU3PreservationCertificate({ calculus: f.calc, contract: f.ctr, input: f.input, trusted: f.trusted, report: f.report, assumptions: f.assumptions, generatedAt: "2026-07-17T00:00:00.000Z" }); }
function typedLossCertificate(stage: string) {
  const f = fixture("equal", "left-to-right", "exact", 0, [10, 10], false, true), observation = f.calc.observations.at(-1)!, oid = observation.id;
  removeCertificateObservation(f, "source", oid); removeCertificateObservation(f, "lifted", oid);
  const provenanceBare: Any = { id: `provenance-loss-${stage}`, producerAuthorityId: "provenance", custodyAuthorityId: "custody", artifactDigest: H(`loss-artifact-${stage}`) }, producerReceipt = signU3Record(K.provenance, provenanceBare), provenanceWithProducer = { ...provenanceBare, producerReceipt };
  f.input.provenance.push({ ...provenanceWithProducer, custodyReceipt: signU3Record(K.custody, provenanceWithProducer) });
  const subject = { sort: observation.subjectSort, providerId: observation.providerId, componentId: observation.componentId }, lossBare: Any = { id: `loss-${stage}`, schema: "open-autonomy.u3-typed-loss.v1", runId: "run", observationId: oid, code: "adapter-unavailable", evidenceId: `evidence-loss-${stage}`, provenanceId: provenanceBare.id, subject, authorityId: "evidence" }, evidenceBare: Any = { id: lossBare.evidenceId, eventId: `loss-${oid}`, payloadDigest: H(C(lossBare)), runId: "run", subjectDigest: H(C(subject)), provenanceDigest: provenanceBare.artifactDigest, custodyDigest: H(C({ custodyAuthorityId: "custody" })), authorityId: "evidence", custodyAuthorityId: "custody" }, receipt = signU3Record(K.evidence, evidenceBare), evidenceWithProducer = { ...evidenceBare, receipt };
  f.input.evidence.push({ ...evidenceWithProducer, custodyReceipt: signU3Record(K.custody, evidenceWithProducer) }); f.input.losses = [{ ...lossBare, receipt: signU3Record(K.evidence, lossBare) }]; sort(f.input.evidence); sort(f.input.provenance);
  return Object.assign(f, { cert: issueCertificate(f) });
}

test("creates an exact replay certificate with an independently anchored fixture", () => {
  const f = certificate();
  expect(f.cert.schema).toBe(U3_PRESERVATION_CERTIFICATE_SCHEMA);
  expect(f.cert.empiricalClaim).toBe(false); expect(f.cert.closureClaim).toBe(false); expect(f.cert.assurance).toBe("synthetic-only");
  expect(f.cert.assumptions.map((x) => x.observationId)).toEqual(f.calc.profiles[0].observationIds);
  expect(verifyU3PreservationCertificate(f.cert, f.calc, f.ctr, f.trusted)).toEqual(f.cert);
  expect(() => verifyU3CertificateGitCustody()).not.toThrow();
  expect(f.cert.digest).toBe("sha256:e3c534682e85093a02532dbae4d178c8549637829dfe4632fb9652cb7ba0ab8f");
});

test("rejects substitution, re-digest, version skew, surplus, trust, and bounded-resource attacks", () => {
  const attacks: Array<(f: ReturnType<typeof certificate>) => void> = [
    (f) => { f.cert.bindings.calculusDigest = S("1"); },
    (f) => { f.cert.bindings.reportDigest = S("2"); },
    (f) => { f.cert.bindings.adapters[0].version = "2"; },
    (f) => { (f.cert.replay.input.source as Any).version = "3.0.0"; },
    (f) => { f.cert.results[0].status = "unknown"; },
    (f) => { (f.cert as Any).surplus = true; },
  ];
  for (const attack of attacks) { const f = certificate(); f.cert = structuredClone(f.cert); attack(f); expect(() => verifyU3PreservationCertificate(f.cert, f.calc, f.ctr, f.trusted)).toThrow(); }
  const redigested = certificate(); redigested.cert = structuredClone(redigested.cert); redigested.cert.results[0].status = "unknown"; redigested.cert.digest = H(`${U3_PRESERVATION_CERTIFICATE_SCHEMA}\0${C((({ digest: _d, ...x }) => x)(redigested.cert))}`); expect(() => verifyU3PreservationCertificate(redigested.cert, redigested.calc, redigested.ctr, redigested.trusted)).toThrow();
  const trust = certificate(); trust.trusted = structuredClone(trust.trusted); trust.trusted.keys.source = "substituted"; expect(() => verifyU3PreservationCertificate(trust.cert, trust.calc, trust.ctr, trust.trusted)).toThrow();
  const cyclic = certificate(); cyclic.cert = structuredClone(cyclic.cert); (cyclic.cert as Any).self = cyclic.cert; expect(() => verifyU3PreservationCertificate(cyclic.cert, cyclic.calc, cyclic.ctr, cyclic.trusted)).toThrow("cyclic");
  const wide = certificate(); wide.cert = structuredClone(wide.cert); (wide.cert as Any).results = Array.from({ length: 9000 }, () => ({})); expect(() => verifyU3PreservationCertificate(wide.cert, wide.calc, wide.ctr, wide.trusted)).toThrow("collection bound");
});
test("binds prompt context provider probe model and harness domains without generalization", () => {
  const base = certificate(), fields = ["promptDomain", "contextDomain", "providerLocalDomain", "probeDomain", "modelDomain", "harnessDomain"] as const;
  for (const field of fields) {
    const assumptions = structuredClone(base.assumptions), original = assumptions[0];
    original[field] = `${original[field]}-alternate`;
    const { domainDigest: _old, ...body } = original; original.domainDigest = H(C(body));
    const scoped = createU3PreservationCertificate({ calculus: base.calc, contract: base.ctr, input: base.input, trusted: base.trusted, report: base.report, assumptions, generatedAt: "2026-07-17T00:00:00.000Z" });
    expect(scoped.digest).not.toBe(base.cert.digest);
    expect(scoped.assumptions[0][field]).toBe(original[field]);
    expect(verifyU3PreservationCertificate(scoped, base.calc, base.ctr, base.trusted)).toEqual(scoped);
    const substituted = structuredClone(base.cert); substituted.assumptions = assumptions;
    expect(() => verifyU3PreservationCertificate(substituted, base.calc, base.ctr, base.trusted)).toThrow();
  }
});

test("composition is deterministic, aligns the intermediate artifact, and conserves relations", () => {
  const a = certificate(), b = certificate(), args = { left: a.cert, right: b.cert, leftCalculus: a.calc, leftContract: a.ctr, leftTrusted: a.trusted, rightCalculus: b.calc, rightContract: b.ctr, rightTrusted: b.trusted, guarantees: [], generatedAt: "2026-07-17T01:00:00.000Z" }, composed = composeU3PreservationCertificates(args);
  expect(composed.results.every((x) => x.status === "preserved/equivalent")).toBe(true);
  expect(composed.semanticInterface.artifactDigest).toBe(a.cert.bindings.liftedArtifactDigest);
  expect(composed.results[0].leftEndpoint).toEqual(a.cert.results[0].leftEndpoint);
  expect(composed.results[0].rightEndpoint).toEqual(b.cert.results[0].rightEndpoint);
  expect(verifyU3ComposedPreservationCertificate(composed, args)).toEqual(composed);
  expect(composeU3PreservationCertificates(args)).toEqual(composed);
  const refineA = certificate("refines"), refineB = certificate("refines"), refinement = composeU3PreservationCertificates({ ...args, left: refineA.cert, right: refineB.cert, leftCalculus: refineA.calc, leftContract: refineA.ctr, leftTrusted: refineA.trusted, rightCalculus: refineB.calc, rightContract: refineB.ctr, rightTrusted: refineB.trusted });
  expect(refinement.results.some((x) => x.status === "preserved/refinement")).toBe(true);
  const reverseA = certificate("refines", "right-to-left"), reverseB = certificate("refines", "right-to-left"), reverse = composeU3PreservationCertificates({ ...args, left: reverseA.cert, right: reverseB.cert, leftCalculus: reverseA.calc, leftContract: reverseA.ctr, leftTrusted: reverseA.trusted, rightCalculus: reverseB.calc, rightContract: reverseB.ctr, rightTrusted: reverseB.trusted });
  expect(reverse.results[0].direction).toBe("right-to-left"); expect(refinement.results[0].direction).toBe("left-to-right"); expect(reverse.results[0].witnessDigest).not.toBe(refinement.results[0].witnessDigest);
  const assumption = b.cert.assumptions[0], result = a.cert.results.find((x) => x.observationId === assumption.observationId)!, guarantee = { assumptionId: assumption.assumptionId, observationId: assumption.observationId, predicateId: assumption.predicateId, domainDigest: assumption.domainDigest, relation: "preserved/equivalent" as const, policy: "equivalence-only" as const, resultWitnessDigest: result.witnessDigest };
  const discharged = composeU3PreservationCertificates({ ...args, guarantees: [guarantee] });
  expect(discharged.guarantees).toEqual([guarantee]);
  expect(discharged.assumptions.some((x) => x.assumptionId === guarantee.assumptionId)).toBe(true); // the left-stage premise remains; only the right-stage duplicate is discharged
  const shiftedLeft = certificate("equal", "left-to-right", "exact", 0, [10, 10], true), shiftedRight = certificate("equal", "left-to-right", "exact", 0, [10, 10], true), shifted = composeU3PreservationCertificates({ ...args, left: shiftedLeft.cert, right: shiftedRight.cert, leftCalculus: shiftedLeft.calc, leftContract: shiftedLeft.ctr, leftTrusted: shiftedLeft.trusted, rightCalculus: shiftedRight.calc, rightContract: shiftedRight.ctr, rightTrusted: shiftedRight.trusted });
  const first = shifted.results[0], expectedMiddle = shiftedLeft.cert.results[0].rightEndpoint, expectedRightRow = shiftedRight.cert.results.find((x) => C(x.leftEndpoint) === C(expectedMiddle))!;
  expect(first.leftEndpoint).toEqual(shiftedLeft.cert.results[0].leftEndpoint); expect(first.rightEndpoint).toEqual(expectedRightRow.rightEndpoint);
  const identityRight = certificate(), typedPairing = composeU3PreservationCertificates({ ...args, left: shiftedLeft.cert, right: identityRight.cert, leftCalculus: shiftedLeft.calc, leftContract: shiftedLeft.ctr, leftTrusted: shiftedLeft.trusted, rightCalculus: identityRight.calc, rightContract: identityRight.ctr, rightTrusted: identityRight.trusted });
  expect(typedPairing.results[0].rightEndpoint.observationId).toBe(shiftedLeft.cert.results[0].rightEndpoint.observationId); expect(typedPairing.results[0].rightEndpoint.observationId).not.toBe(typedPairing.results[0].leftEndpoint.observationId);
});

test("variance composition uses typed absolute and relative bound algebra", () => {
  const absoluteLeft = certificate("equal", "left-to-right", "absolute", 0.2, [10, 10.1]), absoluteRight = certificate("equal", "left-to-right", "absolute", 0.3, [10.1, 10.2]);
  const compose = (left: ReturnType<typeof certificate>, right: ReturnType<typeof certificate>) => composeU3PreservationCertificates({ left: left.cert, right: right.cert, leftCalculus: left.calc, leftContract: left.ctr, leftTrusted: left.trusted, rightCalculus: right.calc, rightContract: right.ctr, rightTrusted: right.trusted, guarantees: [], generatedAt: "2026-07-17T02:00:00.000Z" });
  expect(compose(absoluteLeft, absoluteRight).results.find((x) => x.status === "permitted-variance")!.varianceBound!.bound).toBeCloseTo(0.5);
  const relativeLeft = certificate("equal", "left-to-right", "relative", 0.1, [10, 11]), relativeRight = certificate("equal", "left-to-right", "relative", 0.2, [11, 12]);
  expect(compose(relativeLeft, relativeRight).results.find((x) => x.status === "permitted-variance")!.varianceBound!.bound).toBeCloseTo(0.32);
  const directionalLeft = certificate("refines", "left-to-right", "absolute", 0.2, [10, 10.1]), directionalRight = certificate("refines", "right-to-left", "absolute", 0.2, [10.1, 10.2]);
  expect(() => compose(directionalLeft, directionalRight)).toThrow("variance relation composition invalid");
  const abstractRight = certificate("abstracts", "left-to-right", "absolute", 0.2, [10.1, 10.2]);
  expect(() => compose(directionalLeft, abstractRight)).toThrow("variance relation composition invalid");
});

test("composition rejects artifact substitution, unsupported relation mixing, quotient mismatch, and assumption conflict", () => {
  const eq = certificate(), ref = certificate("refines"), abs = certificate("abstracts"), base = { left: ref.cert, right: abs.cert, leftCalculus: ref.calc, leftContract: ref.ctr, leftTrusted: ref.trusted, rightCalculus: abs.calc, rightContract: abs.ctr, rightTrusted: abs.trusted, guarantees: [], generatedAt: "2026-07-17T01:00:00.000Z" };
  expect(() => composeU3PreservationCertificates(base)).toThrow("unsupported relation composition");
  const substituted = certificate(); substituted.cert = structuredClone(substituted.cert); substituted.cert.bindings.sourceArtifactDigest = S("7"); expect(() => composeU3PreservationCertificates({ ...base, left: eq.cert, right: substituted.cert, leftCalculus: eq.calc, leftContract: eq.ctr, leftTrusted: eq.trusted, rightCalculus: substituted.calc, rightContract: substituted.ctr, rightTrusted: substituted.trusted })).toThrow();
  const conflict = certificate(); conflict.cert = structuredClone(conflict.cert); conflict.cert.assumptions[0].modelDomain = "different-model"; conflict.cert.digest = H(`${U3_PRESERVATION_CERTIFICATE_SCHEMA}\0${C((({ digest: _d, ...x }) => x)(conflict.cert))}`); expect(() => composeU3PreservationCertificates({ ...base, left: eq.cert, right: conflict.cert, leftCalculus: eq.calc, leftContract: eq.ctr, leftTrusted: eq.trusted, rightCalculus: conflict.calc, rightContract: conflict.ctr, rightTrusted: conflict.trusted })).toThrow();
  const opposite = certificate("refines", "right-to-left"); expect(() => composeU3PreservationCertificates({ ...base, left: ref.cert, right: opposite.cert, rightCalculus: opposite.calc, rightContract: opposite.ctr, rightTrusted: opposite.trusted })).toThrow("unsupported relation composition");
  const assumption = eq.cert.assumptions[0], result = eq.cert.results.find((x) => x.observationId === assumption.observationId)!, badGuarantee = { assumptionId: assumption.assumptionId, observationId: assumption.observationId, predicateId: assumption.predicateId, domainDigest: S("8"), relation: "preserved/equivalent" as const, policy: "equivalence-only" as const, resultWitnessDigest: result.witnessDigest };
  expect(() => composeU3PreservationCertificates({ ...base, left: eq.cert, right: eq.cert, leftCalculus: eq.calc, leftContract: eq.ctr, leftTrusted: eq.trusted, rightCalculus: eq.calc, rightContract: eq.ctr, rightTrusted: eq.trusted, guarantees: [badGuarantee] })).toThrow("guarantee discharge");
  const modelB = certificate(); modelB.assumptions = structuredClone(modelB.assumptions); modelB.assumptions[0].modelDomain = "model-b"; const { domainDigest: _oldDomain, ...domainBody } = modelB.assumptions[0]; modelB.assumptions[0].domainDigest = H(C(domainBody)); modelB.cert = createU3PreservationCertificate({ calculus: modelB.calc, contract: modelB.ctr, input: modelB.input, trusted: modelB.trusted, report: modelB.report, assumptions: modelB.assumptions, generatedAt: "2026-07-17T00:00:00.000Z" });
  const modelBGuarantee = { ...badGuarantee, domainDigest: modelB.assumptions[0].domainDigest };
  expect(() => composeU3PreservationCertificates({ ...base, left: eq.cert, right: modelB.cert, leftCalculus: eq.calc, leftContract: eq.ctr, leftTrusted: eq.trusted, rightCalculus: modelB.calc, rightContract: modelB.ctr, rightTrusted: modelB.trusted, guarantees: [modelBGuarantee] })).toThrow("guarantee discharge");
  for (const dimension of ["evidence", "causal-order"]) {
    const altered = certificate(); altered.cert = structuredClone(altered.cert); altered.cert.bindings.sourceInterfaceProjection.erasedDimensions = altered.cert.bindings.sourceInterfaceProjection.erasedDimensions.filter((x) => x !== dimension);
    expect(() => composeU3PreservationCertificates({ ...base, left: eq.cert, right: altered.cert, leftCalculus: eq.calc, leftContract: eq.ctr, leftTrusted: eq.trusted, rightCalculus: altered.calc, rightContract: altered.ctr, rightTrusted: altered.trusted })).toThrow();
  }
});
test("composition conserves violated unknown assumptions and outer witnesses", () => {
  const compose = (left: ReturnType<typeof fixture> & { cert: ReturnType<typeof issueCertificate> }, right: ReturnType<typeof fixture> & { cert: ReturnType<typeof issueCertificate> }) => composeU3PreservationCertificates({ left: left.cert, right: right.cert, leftCalculus: left.calc, leftContract: left.ctr, leftTrusted: left.trusted, rightCalculus: right.calc, rightContract: right.ctr, rightTrusted: right.trusted, guarantees: [], generatedAt: "2026-07-17T03:00:00.000Z" });
  const violatedLeft = certificate("equal", "left-to-right", "exact", 0, [10, 12]), violatedRight = certificate("equal", "left-to-right", "exact", 0, [12, 14]), violated = compose(violatedLeft, violatedRight);
  expect(violated.results.some((x) => x.status === "violated")).toBe(true); expect(violated.assumptions).toEqual(violatedLeft.cert.assumptions); expect(violated.results[0].leftEndpoint).toEqual(violatedLeft.cert.results[0].leftEndpoint); expect(violated.results[0].rightEndpoint).toEqual(violatedRight.cert.results[0].rightEndpoint);
  const unknownLeft = fixture(), unknownRight = fixture(), oid = unknownLeft.calc.observations[0].id;
  removeCertificateObservation(unknownLeft, "lifted", oid); removeCertificateObservation(unknownRight, "source", oid);
  const left = Object.assign(unknownLeft, { cert: issueCertificate(unknownLeft) }), right = Object.assign(unknownRight, { cert: issueCertificate(unknownRight) }), unknown = compose(left, right), row = unknown.results.find((x) => x.observationId === oid)!;
  expect(row.status).toBe("unknown"); expect(row.operator).toBeNull(); expect(row.direction).toBeNull(); expect(row.witnessDigests).toHaveLength(2); expect(unknown.assumptions).toEqual(left.cert.assumptions);
  const incompatibleLeft = fixture(), incompatibleRight = fixture(); makeCertificateObservationIncompatible(incompatibleLeft, "lifted", oid); makeCertificateObservationIncompatible(incompatibleRight, "source", oid);
  const incompatibleL = Object.assign(incompatibleLeft, { cert: issueCertificate(incompatibleLeft) }), incompatibleR = Object.assign(incompatibleRight, { cert: issueCertificate(incompatibleRight) }), incompatible = compose(incompatibleL, incompatibleR), incompatibleRow = incompatible.results.find((x) => x.observationId === oid)!;
  expect(incompatibleRow.status).toBe("incompatible"); expect(incompatibleRow.operator).toBeNull(); expect(incompatibleRow.direction).toBeNull();
  const lossLeft = typedLossCertificate("left"), lossRight = typedLossCertificate("right"), losses = compose(lossLeft, lossRight), lossRow = losses.results.find((x) => x.status === "permitted-typed-loss")!;
  expect(lossRow.lossIds).toEqual(["loss-left", "loss-right"]); expect(losses.typedLosses.map((x) => x.id)).toEqual(["loss-left", "loss-right"]); expect(lossRow.operator).toBeNull(); expect(lossRow.witnessDigest).not.toBe(lossLeft.cert.results.find((x) => x.status === "permitted-typed-loss")!.witnessDigest);
});
