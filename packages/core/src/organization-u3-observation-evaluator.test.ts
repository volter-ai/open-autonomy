import { createHash, createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { canonicalSemanticJson as C } from "./organization-canonical";
import {
  U3_OBSERVATION_CALCULUS_SCHEMA,
  U3_PREDECESSORS,
  U3_TAXONOMY,
  freezeU3ObservationCalculus,
  type U3ObservationCalculus,
} from "./organization-u3-observation-calculus";
import {
  U3_EVALUATOR_SCHEMA,
  evaluateU3ObservationTrace,
  freezeU3TraceEvaluationContract,
  integrityU3Event,
  signU3Record,
  verifyU3EvaluationReport,
  verifyU3EvaluatorCalculusGitCustody,
} from "./organization-u3-observation-evaluator";

type Any = any;
const H = (value: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(value).digest("hex")}` as const,
  S = (c: string) => `sha256:${c.repeat(64)}` as const,
  K = {
    source: "source-secret",
    lifted: "lifted-secret",
    evidence: "evidence-secret",
    provenance: "provenance-secret",
    custody: "custody-secret",
  },
  sort = <T extends { id: string }>(values: T[]) =>
    values.sort((a, b) => a.id.localeCompare(b.id));

function calculus(operator: "equal" | "refines" | "abstracts" = "equal", direction: "symmetric" | "left-to-right" | "right-to-left" = operator === "equal" ? "symmetric" : "left-to-right", metric: "exact" | "absolute" | "relative" = "exact", aggregation: "identity" | "maximum" | "mean" = "identity", binaryRight = false) {
  const observations: Any[] = U3_TAXONOMY.map((taxonomy, index) => ({
    id: `obs-${taxonomy}`, taxonomy, subjectSort: "provider", subjectKind: "worker",
    providerId: `provider-${index}`, componentId: null, nativeSchemaId: "event-schema",
    nativeSchemaVersion: "1", valueSchemaId: "value-schema", valueSchemaVersion: "1",
    sourceProjectionId: "value", unit: "event", clock: "monotonic", window: "trace",
    dedupKey: `sample-${index}`, completeness: "complete", evidencePolicyId: "verified",
    authenticationPolicyId: "mac", missing: "unknown",
    applicability: [{ stratumId: "coding", status: "mandatory", predicateId: "always", evidenceDigest: null, reason: null }],
  }));
  observations.push({ ...structuredClone(observations[0]), id: "obs-optional", dedupKey: "sample-optional", applicability: [{ stratumId: "coding", status: "optional", predicateId: "always", evidenceDigest: null, reason: null }] });
  sort(observations);
  const comparisons = sort(observations.map((o, index) => ({
    id: `comparison-${o.id}`,
    left: { observationId: o.id, subjectKind: o.subjectKind, schemaId: o.valueSchemaId, schemaVersion: o.valueSchemaVersion },
    right: { observationId: index === 0 && binaryRight ? observations[1].id : o.id, subjectKind: index === 0 && binaryRight ? observations[1].subjectKind : o.subjectKind, schemaId: o.valueSchemaId, schemaVersion: o.valueSchemaVersion },
    sourceProjectionId: "identity-value", targetProjectionId: "identity-value",
    direction: index === 0 ? direction : "symmetric", operator: index === 0 ? operator : "equal", missing: "unknown",
  })));
  const variances = sort(comparisons.map((c, index) => ({
    id: `variance-${c.id}`, comparisonId: c.id, operator: "accept-within", metric: index === 0 ? metric : "exact",
    unit: "event", clock: "monotonic", window: "trace", aggregation: index === 0 ? aggregation : "identity",
    missing: "unknown", bound: index === 0 && metric !== "exact" ? 0.2 : 0, minimumSamples: 2,
  })));
  const ids = observations.map((o) => o.id), mandatory = ids.filter((x) => x !== "obs-optional");
  const body: U3ObservationCalculus = {
    schema: U3_OBSERVATION_CALCULUS_SCHEMA, fixtureKind: "synthetic", denominatorScope: "fixture-local",
    empiricalRegistration: false, closureClaim: false, campaignId: "organization-universality-2026-v9",
    predecessors: structuredClone(U3_PREDECESSORS) as Any,
    schemas: [{ id: "event-schema", version: "1", mediaType: "application/json", schemaSha256: S("a") }, { id: "value-schema", version: "1", mediaType: "application/json", schemaSha256: S("9") }],
    predicates: [{ id: "always", version: "1", operator: "always", argument: "" }],
    projections: [{ id: "identity-value", version: "1", operator: "identity", argument: "", inputSchemaId: "value-schema", inputSchemaVersion: "1", outputSchemaId: "value-schema", outputSchemaVersion: "1" }, { id: "value", version: "1", operator: "field", argument: "value", inputSchemaId: "event-schema", inputSchemaVersion: "1", outputSchemaId: "value-schema", outputSchemaVersion: "1" }],
    evidencePolicies: [{ id: "verified", required: true, minimum: "verification", referenceSchemaId: "event-schema", referenceSchemaVersion: "1" }],
    authenticationPolicies: [{ id: "mac", required: true, mechanism: "mac", trustRootSha256: S("b") }],
    strata: [{ id: "coding" }], observations, comparisons: comparisons as Any, variances: variances as Any,
    profiles: [{ id: "base", lineageId: "coding", version: "1.0.0", stratumId: "coding", parentIds: [], observationIds: ids, comparisonIds: comparisons.map((c) => c.id), varianceIds: variances.map((v) => v.id), forbiddenLossObservationIds: mandatory, unknownPolicy: "report" }],
    profilePairs: [],
  };
  return freezeU3ObservationCalculus(body, { requireFixtureDigest: false });
}

function mixedClockCalculus() {
  const frozen = calculus(), { digest: _digest, ...body } = structuredClone(frozen) as Any;
  const oid = body.observations[0].id, comparisonId = body.comparisons.find((c: Any) => c.left.observationId === oid).id;
  body.observations[0].clock = "wall";
  body.variances.find((v: Any) => v.comparisonId === comparisonId).clock = "wall";
  return freezeU3ObservationCalculus(body, { requireFixtureDigest: false });
}
function noneClockCalculus() {
  const frozen = calculus(), { digest: _digest, ...body } = structuredClone(frozen) as Any;
  for (const observation of body.observations.slice(0, 2)) {
    observation.clock = "none";
    const comparison = body.comparisons.find((c: Any) => c.left.observationId === observation.id);
    body.variances.find((v: Any) => v.comparisonId === comparison.id).clock = "none";
  }
  return freezeU3ObservationCalculus(body, { requireFixtureDigest: false });
}

const shapeBody = { id: "event-shape", schemaId: "event-schema", schemaVersion: "1", schemaDigest: S("a"), type: "object" as const, required: ["value"], properties: [{ name: "value", type: "number" as const }] },
  valueShapeBody = { id: "value-shape", schemaId: "value-schema", schemaVersion: "1", schemaDigest: S("9"), type: "number" as const, required: [], properties: [] };
function contract(calc: ReturnType<typeof calculus>) {
  return freezeU3TraceEvaluationContract({
    schema: U3_EVALUATOR_SCHEMA, fixtureKind: "synthetic", calculusDigest: calc.digest,
    shapes: sort([{ ...shapeBody, semanticDigest: H(C(shapeBody)) }, { ...valueShapeBody, semanticDigest: H(C(valueShapeBody)) }]),
    adapters: [{ id: "adapter", version: "1", digest: S("c") }], compilers: [{ id: "compiler", version: "1", digest: S("d") }], runtimes: [{ id: "runtime", version: "1", digest: S("e") }],
    authorities: sort([
      { id: "custody", role: "custodian" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.custody) },
      { id: "evidence", role: "evidence-producer" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.evidence) },
      { id: "lifted", role: "trace-producer" as const, trustRootDigest: S("b"), verificationKeyDigest: H(K.lifted) },
      { id: "provenance", role: "provenance-producer" as const, trustRootDigest: S("f"), verificationKeyDigest: H(K.provenance) },
      { id: "source", role: "trace-producer" as const, trustRootDigest: S("b"), verificationKeyDigest: H(K.source) },
    ]),
    quotients: calc.comparisons.filter((c) => c.operator === "abstracts").map((c) => ({ id: `quotient-${c.id}`, comparisonId: c.id, operator: "json-pointer" as const, argument: "" })),
  });
}

function signedFixture(calc = calculus(), values: [number, number] = [10, 10]) {
  const ctr = contract(calc), provenance: Any[] = [], evidence: Any[] = [];
  const makeTrace = (side: "source" | "lifted", authorityId: "source" | "lifted", selected: number) => {
    const events: Any[] = [], hasWall = calc.observations.some((o) => o.clock === "wall"), hasLogical = calc.observations.some((o) => o.clock !== "wall");
    for (const observation of calc.observations) for (let n = 0; n < 2; n++) {
      const suffix = `${side}-${observation.id}-${n}`, provenanceId = `provenance-${suffix}`, evidenceId = `evidence-${suffix}`;
      const p0 = { id: provenanceId, producerAuthorityId: "provenance", custodyAuthorityId: "custody", artifactDigest: H(`artifact-${suffix}`) };
      const producerReceipt = signU3Record(K.provenance, p0), p1 = { ...p0, producerReceipt }, custodyReceipt = signU3Record(K.custody, p1);
      provenance.push({ ...p1, custodyReceipt });
      const event0: Any = { id: `event-${suffix}`, sampleId: `sample-${n}`, observationId: observation.id, runId: "run", traceId: `trace-${side}`, side,
        subject: { sort: observation.subjectSort, providerId: observation.providerId, componentId: observation.componentId }, schemaId: observation.nativeSchemaId, schemaVersion: observation.nativeSchemaVersion,
        timestamp: observation.clock === "wall" ? new Date(Date.UTC(2026, 0, 1, 0, 0, events.length + 1)).toISOString() : null,
        logicalOrder: observation.clock === "wall" ? null : events.length + 1, causalParentIds: [], correlationId: `correlation-${n}`, epistemic: "verification", provenanceId, evidenceId,
        adapterId: "adapter", adapterVersion: "1", adapterDigest: S("c"), compilerId: "compiler", compilerVersion: "1", compilerDigest: S("d"), runtimeId: "runtime", runtimeVersion: "1", runtimeDigest: S("e"),
        payload: { value: observation.id === calc.observations[0].id ? selected : 1 } };
      const integrityDigest = integrityU3Event(event0), authentication = { authorityId, receipt: signU3Record(K[authorityId], { ...event0, integrityDigest }) };
      const event = { ...event0, integrityDigest, authentication }; events.push(event);
      const ev0: Any = { id: evidenceId, eventId: event.id, payloadDigest: H(C(event.payload)), runId: "run", subjectDigest: H(C(event.subject)), provenanceDigest: p0.artifactDigest,
        custodyDigest: "" as Any, authorityId: "evidence", custodyAuthorityId: "custody" };
      const producerBody = { ...ev0, custodyDigest: H(C({ custodyAuthorityId: ev0.custodyAuthorityId })) };
      const receipt = signU3Record(K.evidence, producerBody), custodyBody = { ...producerBody, receipt }, evidenceCustodyReceipt = signU3Record(K.custody, custodyBody);
      evidence.push({ ...custodyBody, custodyReceipt: evidenceCustodyReceipt });
    }
    const trace0: Any = { schema: "open-autonomy.u3-trace.v2", version: "2.0.0", traceId: `trace-${side}`, side, runId: "run", producerAuthorityId: authorityId,
      start: hasWall ? new Date(Date.UTC(2026, 0, 1)).toISOString() : null, end: hasWall ? new Date(Date.UTC(2026, 0, 2)).toISOString() : null,
      logicalStart: hasLogical ? 0 : null, logicalEnd: hasLogical ? events.length + 1 : null, window: "trace", closure: "closed", completeness: "complete", gapCodes: [], events,
      closureCustodianAuthorityId: "custody" };
    const producerReceipt = signU3Record(K[authorityId], trace0), trace1 = { ...trace0, producerReceipt }, closureReceipt = signU3Record(K.custody, trace1);
    return { ...trace1, closureReceipt };
  };
  const input: Any = { schema: "open-autonomy.u3-trace-evaluation-input.v2", fixtureKind: "synthetic", calculusDigest: calc.digest, contractDigest: ctr.digest, profileId: "base", runId: "run",
    source: makeTrace("source", "source", values[0]), lifted: makeTrace("lifted", "lifted", values[1]), evidence, provenance, losses: [] };
  sort(evidence); sort(provenance);
  return { calc, ctr, input, trusted: { keys: K } };
}

function resignTrace(trace: Any) {
  const authority = trace.producerAuthorityId as "source" | "lifted", noReceipts = (({ producerReceipt: _p, closureReceipt: _c, ...x }) => x)(trace);
  const producerReceipt = signU3Record(K[authority], noReceipts), withProducer = { ...noReceipts, producerReceipt };
  Object.assign(trace, withProducer, { closureReceipt: signU3Record(K.custody, withProducer) });
}
function resignEvidence(e: Any) {
  const bare = (({ receipt: _r, custodyReceipt: _c, ...x }) => x)(e), receipt = signU3Record(K.evidence, bare), withProducer = { ...bare, receipt };
  Object.assign(e, withProducer, { custodyReceipt: signU3Record(K.custody, withProducer) });
}
function resignEvent(f: ReturnType<typeof signedFixture>, event: Any, { subject = false, payload = false } = {}) {
  const authority = event.side as "source" | "lifted";
  event.integrityDigest = integrityU3Event((({ integrityDigest: _i, authentication: _a, ...x }) => x)(event));
  event.authentication.receipt = signU3Record(K[authority], (({ authentication: _a, ...x }) => x)(event));
  const evidence = f.input.evidence.find((e: Any) => e.id === event.evidenceId)!;
  if (subject) evidence.subjectDigest = H(C(event.subject));
  if (payload) evidence.payloadDigest = H(C(event.payload));
  resignEvidence(evidence); resignTrace(event.side === "source" ? f.input.source : f.input.lifted);
}
function removeEvents(f: ReturnType<typeof signedFixture>, predicate: (e: Any) => boolean) {
  const removed = [...f.input.source.events, ...f.input.lifted.events].filter(predicate), evidenceIds = new Set(removed.map((e) => e.evidenceId)), provenanceIds = new Set(removed.map((e) => e.provenanceId));
  f.input.source.events = f.input.source.events.filter((e: Any) => !predicate(e));
  f.input.lifted.events = f.input.lifted.events.filter((e: Any) => !predicate(e));
  f.input.evidence = f.input.evidence.filter((e: Any) => !evidenceIds.has(e.id));
  f.input.provenance = f.input.provenance.filter((p: Any) => !provenanceIds.has(p.id));
  resignTrace(f.input.source); resignTrace(f.input.lifted);
}
function lossFixture() {
  const loss = signedFixture(), optionalId = "obs-optional"; removeEvents(loss, (e) => e.observationId === optionalId);
  const optional = loss.calc.observations.find((o) => o.id === optionalId)!, subject = { sort: optional.subjectSort, providerId: optional.providerId, componentId: optional.componentId };
  const provenanceBare: Any = { id: "provenance-loss", producerAuthorityId: "provenance", custodyAuthorityId: "custody", artifactDigest: H("loss-provenance") }, producerReceipt = signU3Record(K.provenance, provenanceBare), provenanceWithProducer = { ...provenanceBare, producerReceipt };
  loss.input.provenance.push({ ...provenanceWithProducer, custodyReceipt: signU3Record(K.custody, provenanceWithProducer) }); sort(loss.input.provenance);
  const lossBare: Any = { id: "loss-optional", schema: "open-autonomy.u3-typed-loss.v1", runId: "run", observationId: optionalId, code: "adapter-unavailable", evidenceId: "evidence-loss", provenanceId: "provenance-loss", subject, authorityId: "evidence" };
  const lossEvidenceBare: Any = { id: "evidence-loss", eventId: `loss-${optionalId}`, payloadDigest: H(C(lossBare)), runId: "run", subjectDigest: H(C(subject)), provenanceDigest: provenanceBare.artifactDigest, custodyDigest: H(C({ custodyAuthorityId: "custody" })), authorityId: "evidence", custodyAuthorityId: "custody" };
  const receipt = signU3Record(K.evidence, lossEvidenceBare), lossEvidence = { ...lossEvidenceBare, receipt, custodyReceipt: signU3Record(K.custody, { ...lossEvidenceBare, receipt }) }; loss.input.evidence.push(lossEvidence); sort(loss.input.evidence);
  loss.input.losses = [{ ...lossBare, receipt: signU3Record(K.evidence, lossBare) }];
  return loss;
}

test("freezes bounded semantic shape registry and verifies calculus Git custody", () => {
  const f = signedFixture();
  expect(Object.isFrozen(f.ctr)).toBe(true);
  expect(() => verifyU3EvaluatorCalculusGitCustody()).not.toThrow();
  const bad: Any = structuredClone(shapeBody); bad.semanticDigest = S("0");
  expect(() => freezeU3TraceEvaluationContract({ ...(f.ctr as Any), shapes: [bad], digest: undefined })).toThrow();
});
test("rejects typed-loss observation overlap and mandatory-observation loss", () => {
  const overlap = signedFixture(), loss = lossFixture();
  overlap.input.losses = structuredClone(loss.input.losses);
  overlap.input.evidence.push(...structuredClone(loss.input.evidence.filter((e: Any) => e.id === "evidence-loss")));
  overlap.input.provenance.push(...structuredClone(loss.input.provenance.filter((p: Any) => p.id === "provenance-loss")));
  sort(overlap.input.evidence); sort(overlap.input.provenance);
  expect(() => evaluateU3ObservationTrace(overlap.calc, overlap.ctr, overlap.input, overlap.trusted)).toThrow("loss/observation exclusivity invalid");

  const mandatory = lossFixture(), { digest: _digest, ...body } = structuredClone(mandatory.calc) as Any;
  body.observations.find((o: Any) => o.id === "obs-optional").applicability[0].status = "mandatory";
  body.profiles[0].forbiddenLossObservationIds.push("obs-optional"); body.profiles[0].forbiddenLossObservationIds.sort();
  mandatory.calc = freezeU3ObservationCalculus(body, { requireFixtureDigest: false }); mandatory.ctr = contract(mandatory.calc);
  mandatory.input.calculusDigest = mandatory.calc.digest; mandatory.input.contractDigest = mandatory.ctr.digest;
  expect(() => evaluateU3ObservationTrace(mandatory.calc, mandatory.ctr, mandatory.input, mandatory.trusted)).toThrow("typed loss invalid");
});
test("isolates evaluator cycle depth field and aggregate work bounds", () => {
  const cyclic = signedFixture(); cyclic.input.self = cyclic.input; expect(() => evaluateU3ObservationTrace(cyclic.calc, cyclic.ctr, cyclic.input, cyclic.trusted)).toThrow("cyclic");
  const deep = signedFixture(); let cursor: Any = deep.input; for (let i = 0; i < 55; i++) cursor = cursor.deep = {}; expect(() => evaluateU3ObservationTrace(deep.calc, deep.ctr, deep.input, deep.trusted)).toThrow("work bound");
  const field = signedFixture(); field.input.runId = "x".repeat(5000); expect(() => evaluateU3ObservationTrace(field.calc, field.ctr, field.input, field.trusted)).toThrow("field bound");
  const wide = signedFixture(); wide.input.losses = Array.from({ length: 5000 }, (_, i) => ({ i })); expect(() => evaluateU3ObservationTrace(wide.calc, wide.ctr, wide.input, wide.trusted)).toThrow("collection bound");
});

test("E2E emits equivalent, refinement, abstraction, variance, violation, unknown, incompatible, and typed-loss terminals", () => {
  const cases: Array<[string, ReturnType<typeof signedFixture>, string]> = [
    ["preserved/equivalent", signedFixture(calculus(), [10, 10]), "equal"],
    ["preserved/refinement", signedFixture(calculus("refines", "left-to-right"), [10, 10]), "refines"],
    ["preserved/abstraction", signedFixture(calculus("abstracts", "left-to-right"), [10, 10]), "abstracts"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "absolute", "maximum"), [10, 10.1]), "absolute-maximum"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "absolute", "identity"), [10, 10.1]), "absolute-identity"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "absolute", "mean"), [10, 10.1]), "absolute-mean"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "relative", "identity"), [10, 11]), "relative-identity"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "relative", "maximum"), [10, 11]), "relative-maximum"],
    ["permitted-variance", signedFixture(calculus("equal", "symmetric", "relative", "mean"), [10, 11]), "relative-mean"],
    ["violated", signedFixture(calculus(), [10, 12]), "relation-failed"],
  ];
  for (const [status, f, code] of cases) {
    const report = evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted), result = report.results[0];
    expect([result.status, result.code]).toEqual([status, code]);
    expect(verifyU3EvaluationReport(report, f.calc, f.ctr, f.input, f.trusted)).toEqual(report);
    expect(Object.isFrozen(report.results)).toBe(true);
  }
  const binary = signedFixture(calculus("refines", "right-to-left", "exact", "identity", true), [10, 10]);
  removeEvents(binary, (event) => event.side === "lifted" && event.observationId === binary.calc.observations[0].id);
  const binaryReport = evaluateU3ObservationTrace(binary.calc, binary.ctr, binary.input, binary.trusted);
  expect(binaryReport.results[0].status).toBe("violated");
  expect(verifyU3EvaluationReport(binaryReport, binary.calc, binary.ctr, binary.input, binary.trusted)).toEqual(binaryReport);
  const surplusBinary = signedFixture(calculus("refines", "right-to-left", "exact", "identity", true), [10, 10]);
  expect(() => evaluateU3ObservationTrace(surplusBinary.calc, surplusBinary.ctr, surplusBinary.input, surplusBinary.trusted)).toThrow("unconsumed input inventory invalid");
  const unknown = signedFixture(); removeEvents(unknown, (e) => e.side === "lifted" && e.observationId === unknown.calc.observations[0].id);
  expect(evaluateU3ObservationTrace(unknown.calc, unknown.ctr, unknown.input, unknown.trusted).results[0].status).toBe("unknown");
  const incompatible = signedFixture(), event = incompatible.input.source.events.find((e: Any) => e.observationId === incompatible.calc.observations[0].id)!;
  event.payload.value = "bad"; event.integrityDigest = integrityU3Event((({ integrityDigest: _i, authentication: _a, ...x }) => x)(event)); event.authentication.receipt = signU3Record(K.source, (({ authentication: _a, ...x }) => x)(event));
  const eventEvidence = incompatible.input.evidence.find((e: Any) => e.id === event.evidenceId)!; eventEvidence.payloadDigest = H(C(event.payload)); resignEvidence(eventEvidence); resignTrace(incompatible.input.source);
  expect(evaluateU3ObservationTrace(incompatible.calc, incompatible.ctr, incompatible.input, incompatible.trusted).results[0].status).toBe("incompatible");
  const loss = lossFixture(), optionalId = "obs-optional";
  expect(evaluateU3ObservationTrace(loss.calc, loss.ctr, loss.input, loss.trusted).results.find((r) => r.observationId === optionalId)!.status).toBe("permitted-typed-loss");
});

test("rejects version, integrity, trust, causal, correlation, surplus custody, cycle, depth, and work attacks", () => {
  const attacks: Array<(f: ReturnType<typeof signedFixture>) => void> = [
    (f) => { f.input.source.version = "3.0.0"; },
    (f) => { f.input.source.events[0].payload.value = 9; },
    (f) => { f.trusted.keys.source = "wrong"; },
    (f) => { f.input.source.events[0].causalParentIds = [f.input.lifted.events[0].id]; },
    (f) => { f.input.lifted.events[0].correlationId = "unmatched"; },
    (f) => { f.input.provenance.push({ ...f.input.provenance[0], id: "surplus" }); },
  ];
  for (const attack of attacks) { const f = signedFixture(); attack(f); expect(() => evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)).toThrow(); }
  const cyclic = signedFixture(); cyclic.input.self = cyclic.input; expect(() => evaluateU3ObservationTrace(cyclic.calc, cyclic.ctr, cyclic.input, cyclic.trusted)).toThrow("cyclic");
  let deep: Any = signedFixture().input; for (let i = 0; i < 55; i++) deep = { x: deep }; expect(() => evaluateU3ObservationTrace(calculus(), contract(calculus()), deep, { keys: K })).toThrow("work bound");
  const wide = signedFixture(); wide.input.losses = Array.from({ length: 5000 }, (_, i) => ({ i })); expect(() => evaluateU3ObservationTrace(wide.calc, wide.ctr, wide.input, wide.trusted)).toThrow("collection bound");
});

test("mixed wall/monotonic envelopes evaluate and policy attacks reach their authenticated checks", () => {
  const mixed = signedFixture(mixedClockCalculus());
  expect(evaluateU3ObservationTrace(mixed.calc, mixed.ctr, mixed.input, mixed.trusted).counts["preserved/equivalent"]).toBe(mixed.calc.observations.length);
  const crossClock = signedFixture(mixedClockCalculus()), wallParent = crossClock.input.source.events.find((e: Any) => e.timestamp !== null), monotonicChild = crossClock.input.source.events.find((e: Any) => e.logicalOrder !== null);
  monotonicChild.causalParentIds = [wallParent.id]; resignEvent(crossClock, monotonicChild);
  expect(() => evaluateU3ObservationTrace(crossClock.calc, crossClock.ctr, crossClock.input, crossClock.trusted)).toThrow("causal order invalid");
  const noneClock = signedFixture(noneClockCalculus()), noneParent = noneClock.input.source.events[0], noneChild = noneClock.input.source.events.find((e: Any) => e.observationId === noneClock.calc.observations[1].id)!;
  noneClock.input.source.start = new Date(Date.UTC(2026, 0, 1)).toISOString(); noneClock.input.source.end = new Date(Date.UTC(2026, 0, 2)).toISOString();
  noneChild.logicalOrder = null; noneChild.timestamp = new Date(Date.UTC(2026, 0, 1, 1)).toISOString(); noneChild.causalParentIds = [noneParent.id]; resignEvent(noneClock, noneChild);
  expect(() => evaluateU3ObservationTrace(noneClock.calc, noneClock.ctr, noneClock.input, noneClock.trusted)).toThrow("causal order invalid");
  const authenticatedAttacks: Array<(f: ReturnType<typeof signedFixture>, e: Any) => void> = [
    (f, e) => { e.epistemic = "attestation"; resignEvent(f, e); },
    (f, e) => { e.subject.providerId = "forged-provider"; resignEvent(f, e, { subject: true }); },
    (f, e) => { e.schemaVersion = "2"; resignEvent(f, e); },
    (f, e) => { e.adapterVersion = "2"; resignEvent(f, e); },
    (f, e) => { e.adapterDigest = S("8"); resignEvent(f, e); },
  ];
  for (const attack of authenticatedAttacks) {
    const f = signedFixture(), event = f.input.source.events[0]; attack(f, event);
    expect(() => evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)).toThrow();
  }
  for (const mutate of [
    (f: Any, e: Any) => { e.sampleId = f.input.source.events[1].sampleId; resignEvent(f, e); },
    (f: Any, e: Any) => { e.correlationId = "unmatched-authenticated"; resignEvent(f, e); },
    (f: Any) => { f.input.source.closure = "open"; resignTrace(f.input.source); },
    (f: Any) => { f.input.source.window = "interval"; resignTrace(f.input.source); },
  ]) { const f = signedFixture(), event = f.input.source.events[0]; mutate(f, event); expect(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted).results[0].status).toBe("unknown"); }
  const badCompleteness = signedFixture(); badCompleteness.input.source.completeness = "gapped"; badCompleteness.input.source.gapCodes = []; resignTrace(badCompleteness.input.source);
  expect(() => evaluateU3ObservationTrace(badCompleteness.calc, badCompleteness.ctr, badCompleteness.input, badCompleteness.trusted)).toThrow("trace closure invalid");
  const base = calculus(), { digest: _digest, ...body } = structuredClone(base) as Any; body.variances[0].minimumSamples = 3;
  const minimum = signedFixture(freezeU3ObservationCalculus(body, { requireFixtureDigest: false }));
  expect(evaluateU3ObservationTrace(minimum.calc, minimum.ctr, minimum.input, minimum.trusted).results[0].code).toBe("sample-boundary");
  const authRoot = signedFixture(), { digest: _contractDigest, ...contractBody } = structuredClone(authRoot.ctr) as Any;
  contractBody.authorities.find((a: Any) => a.id === "source").trustRootDigest = S("7"); authRoot.ctr = freezeU3TraceEvaluationContract(contractBody); authRoot.input.contractDigest = authRoot.ctr.digest;
  expect(() => evaluateU3ObservationTrace(authRoot.calc, authRoot.ctr, authRoot.input, authRoot.trusted)).toThrow("event authentication invalid");
});

test("rejects forged loss custody, malformed quotients, and consistently re-digested report topology/accounting", () => {
  const forgedLoss = lossFixture(); forgedLoss.input.losses[0].subject.providerId = "forged";
  const lossBare = (({ receipt: _r, ...x }) => x)(forgedLoss.input.losses[0]); forgedLoss.input.losses[0].receipt = signU3Record(K.evidence, lossBare);
  expect(() => evaluateU3ObservationTrace(forgedLoss.calc, forgedLoss.ctr, forgedLoss.input, forgedLoss.trusted)).toThrow("typed loss");
  const abstract = calculus("abstracts"), goodContract = contract(abstract), { digest: _digest, ...contractBody } = structuredClone(goodContract) as Any;
  contractBody.quotients[0].argument = "/bad~2escape";
  expect(() => freezeU3TraceEvaluationContract(contractBody)).toThrow("quotient invalid");
  const badQuotientFixture = signedFixture(abstract), { digest: _qDigest, ...badQuotientBody } = structuredClone(badQuotientFixture.ctr) as Any;
  badQuotientBody.quotients[0].argument = "/missing"; badQuotientFixture.ctr = freezeU3TraceEvaluationContract(badQuotientBody); badQuotientFixture.input.contractDigest = badQuotientFixture.ctr.digest;
  expect(evaluateU3ObservationTrace(badQuotientFixture.calc, badQuotientFixture.ctr, badQuotientFixture.input, badQuotientFixture.trusted).results[0].code).toBe("quotient-output-incompatible");
  const f = signedFixture(), report: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted));
  report.results[0].comparisonId = report.results[1].comparisonId;
  report.results[0].witnessDigest = H(C({ oid: report.results[0].observationId, cid: report.results[0].comparisonId, vid: report.results[0].varianceId, status: report.results[0].status, code: report.results[0].code, sourceEventIds: report.results[0].sourceEventIds, liftedEventIds: report.results[0].liftedEventIds, evidenceIds: report.results[0].evidenceIds, provenanceIds: report.results[0].provenanceIds, lossIds: report.results[0].lossIds }));
  const { digest: _old, ...body } = report; report.digest = H(`open-autonomy.u3-observation-report.v2\0${C(body)}`);
  expect(() => verifyU3EvaluationReport(report, f.calc, f.ctr, f.input, f.trusted)).toThrow("report result invalid");
  const accounting: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)); accounting.counts["preserved/equivalent"]++;
  const { digest: _d, ...accountingBody } = accounting; accounting.digest = H(`open-autonomy.u3-observation-report.v2\0${C(accountingBody)}`);
  expect(() => verifyU3EvaluationReport(accounting, f.calc, f.ctr, f.input, f.trusted)).toThrow("report counts invalid");
  const terminal: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)); terminal.results[0].counterexampleDigest = S("4");
  const { digest: _terminalDigest, ...terminalBody } = terminal; terminal.digest = H(`open-autonomy.u3-observation-report.v2\0${C(terminalBody)}`);
  expect(() => verifyU3EvaluationReport(terminal, f.calc, f.ctr, f.input, f.trusted)).toThrow("report terminal invariant invalid");
  const swapped: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted));
  [swapped.results[0].sourceEventIds, swapped.results[1].sourceEventIds] = [swapped.results[1].sourceEventIds, swapped.results[0].sourceEventIds];
  [swapped.results[0].evidenceIds, swapped.results[1].evidenceIds] = [swapped.results[1].evidenceIds, swapped.results[0].evidenceIds];
  for (const result of swapped.results.slice(0, 2)) result.witnessDigest = H(C({ oid: result.observationId, cid: result.comparisonId, vid: result.varianceId, status: result.status, code: result.code, sourceEventIds: result.sourceEventIds, liftedEventIds: result.liftedEventIds, evidenceIds: result.evidenceIds, provenanceIds: result.provenanceIds, lossIds: result.lossIds }));
  const { digest: _swapDigest, ...swapBody } = swapped; swapped.digest = H(`open-autonomy.u3-observation-report.v2\0${C(swapBody)}`);
  expect(() => verifyU3EvaluationReport(swapped, f.calc, f.ctr, f.input, f.trusted)).toThrow("report endpoint witness topology invalid");
  const redigest = (forgery: Any) => {
    for (const result of forgery.results) result.witnessDigest = H(C({ oid: result.observationId, cid: result.comparisonId, vid: result.varianceId, status: result.status, code: result.code, sourceEventIds: result.sourceEventIds, liftedEventIds: result.liftedEventIds, evidenceIds: result.evidenceIds, provenanceIds: result.provenanceIds, lossIds: result.lossIds }));
    const { digest: _digest, ...body } = forgery; forgery.digest = H(`open-autonomy.u3-observation-report.v2\0${C(body)}`);
    return forgery;
  };
  const unknownId: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)); unknownId.results[0].sourceEventIds.push("event-unknown"); unknownId.results[0].sourceEventIds.sort();
  expect(() => verifyU3EvaluationReport(redigest(unknownId), f.calc, f.ctr, f.input, f.trusted)).toThrow("report endpoint witness topology invalid");
  const unreferenced: Any = structuredClone(evaluateU3ObservationTrace(f.calc, f.ctr, f.input, f.trusted)); unreferenced.results[0].evidenceIds.pop();
  expect(() => verifyU3EvaluationReport(redigest(unreferenced), f.calc, f.ctr, f.input, f.trusted)).toThrow("report endpoint witness topology invalid");
  const { digest: _authorityDigest, ...authorityBody } = structuredClone(f.ctr) as Any;
  authorityBody.authorities.find((a: Any) => a.id === "lifted").verificationKeyDigest = authorityBody.authorities.find((a: Any) => a.id === "source").verificationKeyDigest;
  expect(() => freezeU3TraceEvaluationContract(authorityBody)).toThrow("authority verification key alias invalid");
});
