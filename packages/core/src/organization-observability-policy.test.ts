import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  RuntimeObservationPolicyPlane,
  policyEnforcementStatementDigest,
  runtimeBindingDigest,
  traceControlStatementDigest,
  verifiedWorkStatementDigest,
  type EventEnvelope,
  type PolicyEvaluation,
  type RuntimeBindingLock,
  type SpanObservation,
} from "./organization-observability-policy";

const keys = generateKeyPairSync("ed25519"),
  now = "2026-07-15T12:00:00Z";
const signature = (value: string) =>
  sign(null, Buffer.from(value), keys.privateKey).toString("base64");
const check = (value: string, signed: string) =>
  verify(
    null,
    Buffer.from(value),
    keys.publicKey,
    Buffer.from(signed, "base64"),
  );
const lock: RuntimeBindingLock = {
  cloudEventsRevision: "1.0",
  openTelemetryRevision: "1.39.0",
  semanticConventionsRevision: "1.29.0",
  workflowDialect: "serverless-workflow",
  workflowRevision: "1.0.0",
  workflowCapabilities: {
    supportedKinds: ["start", "choice", "end"],
    supportsConditions: false,
    supportsTimeouts: false,
  },
  policyEngine: "OPA",
  policyBundleDigest: "sha256:policy-v7",
  adapterRulesDigest: "sha256:rules-v3",
};
const trust = {
  verifyWorkEvidence: (value: { statementDigest: string; signature: string }) =>
    check(value.statementDigest, value.signature),
  verifyTraceControlRule: (value: {
    statementDigest: string;
    signature: string;
  }) => check(value.statementDigest, value.signature),
  verifyPolicyEnforcement: (value: {
    statementDigest: string;
    signature: string;
  }) => check(value.statementDigest, value.signature),
  verifyPolicyEvaluation: (value: {
    statementDigest: string;
    signature: string;
  }) => check(value.statementDigest, value.signature),
  verifyCheckpoint: (value: { digest: string; signature: string }) =>
    check(value.digest, value.signature),
  now: () => new Date(now),
};
const envelope = (changes: Partial<EventEnvelope> = {}): EventEnvelope => ({
  specversion: "1.0",
  id: "event-1",
  source: "urn:worker:1",
  type: "work.reported",
  subject: "work-1",
  time: now,
  dataDigest: "sha256:data",
  traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
  bindingDigest: runtimeBindingDigest(lock),
  ...changes,
});
const span = (changes: Partial<SpanObservation> = {}): SpanObservation => ({
  traceId: "0123456789abcdef0123456789abcdef",
  spanId: "0123456789abcdef",
  subject: "work-1",
  operation: "worker.run",
  status: "ok",
  startTime: "2026-07-15T11:59:00Z",
  endTime: now,
  attributesDigest: "sha256:attrs",
  semanticConventionsRevision: lock.semanticConventionsRevision,
  openTelemetryRevision: lock.openTelemetryRevision,
  ...changes,
});
const policy = (
  decision: PolicyEvaluation["decision"],
  inputDigest: string,
): PolicyEvaluation => {
  const statement = {
    decision,
    policyBundleDigest: lock.policyBundleDigest,
    inputDigest,
    policyEngine: lock.policyEngine,
    evaluator: "opa-sidecar",
    algorithm: "Ed25519",
    ...(decision === "undefined" ? { reason: "no matching rule" } : {}),
  };
  const statementDigest = `sha256:${Bun.SHA256.hash(canonicalSemanticJson(statement), "hex")}`;
  return {
    ...statement,
    statementDigest,
    decisionDigest: statementDigest,
    signature: signature(statementDigest),
  };
};

describe("R14-EPI-1: observation is not verification or authority", () => {
  test("ingests pinned OpenTelemetry traces, metrics, and logs only as observations", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust);
    plane.ingestSpan(span());
    plane.ingestMetric({
      name: "tokens",
      subject: "work-1",
      instrument: "counter",
      value: 12,
      unit: "1",
      observedAt: now,
      attributesDigest: "sha256:m",
      openTelemetryRevision: lock.openTelemetryRevision,
      semanticConventionsRevision: lock.semanticConventionsRevision,
    });
    plane.ingestLog({
      id: "log-1",
      subject: "work-1",
      severity: "INFO",
      bodyDigest: "sha256:body",
      observedAt: now,
      traceId: span().traceId,
      spanId: span().spanId,
      attributesDigest: "sha256:l",
      openTelemetryRevision: lock.openTelemetryRevision,
      semanticConventionsRevision: lock.semanticConventionsRevision,
    });
    expect(plane.completionStatus("work-1", "attempt-1").complete).toBe(false);
    expect(() =>
      plane.ingestMetric({
        name: "bad",
        subject: "work-1",
        instrument: "gauge",
        value: 1,
        unit: "1",
        observedAt: now,
        attributesDigest: "sha256:m",
        openTelemetryRevision: "latest",
        semanticConventionsRevision: lock.semanticConventionsRevision,
      }),
    ).toThrow(/unpinned/i);
  });
  test("does not complete work from a success envelope or OK span", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust);
    plane.ingestEnvelope(envelope());
    plane.ingestSpan(span());
    expect(plane.completionStatus("work-1", "attempt-1")).toEqual({
      complete: false,
      basis: "observation-only",
      observations: 2,
    });
  });
  test("requires independently signed evidence bound to work, attempt, artifact, and predicate", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust),
      statement = {
        workId: "work-1",
        attemptId: "attempt-1",
        artifactDigest: "sha256:artifact",
        predicate: "tests-pass",
        observedAt: now,
        verifier: "independent-ci",
        algorithm: "Ed25519",
      },
      statementDigest = verifiedWorkStatementDigest(statement);
    plane.verifyWork({
      ...statement,
      statementDigest,
      signature: signature(statementDigest),
    });
    expect(plane.completionStatus("work-1", "attempt-1")).toMatchObject({
      complete: true,
      basis: "independent-verification",
      artifactDigest: "sha256:artifact",
    });
    expect(() =>
      plane.verifyWork({
        ...statement,
        attemptId: "attempt-2",
        statementDigest,
        signature: signature(statementDigest),
      }),
    ).toThrow(/invalid|untrusted/i);
  });
});

describe("R14-DIST-1: trace, delivery, and control causality remain distinct", () => {
  test("does not infer control order from trace parentage", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust),
      parent = span(),
      child = span({
        spanId: "1111111111111111",
        parentSpanId: parent.spanId,
        operation: "review.run",
        subject: "review-1",
      });
    plane.ingestSpan(parent);
    plane.ingestSpan(child);
    expect(plane.deriveControlRelation(parent, child)).toBeUndefined();
  });
  test("derives a control relation only through a signed explicit adapter rule", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust),
      parent = span(),
      child = span({
        spanId: "1111111111111111",
        parentSpanId: parent.spanId,
        operation: "review.run",
        subject: "review-1",
      }),
      statement = {
        id: "run-to-review",
        traceOperation: "worker.run",
        controlRelation: "causes" as const,
        targetOperation: "review.run",
        adapterRulesDigest: lock.adapterRulesDigest,
        signer: "control-authority",
        algorithm: "Ed25519",
      },
      statementDigest = traceControlStatementDigest(statement);
    plane.addControlRule({
      ...statement,
      statementDigest,
      signature: signature(statementDigest),
    });
    plane.ingestSpan(parent);
    plane.ingestSpan(child);
    expect(plane.deriveControlRelation(parent, child)).toEqual({
      relation: "causes",
      ruleId: "run-to-review",
      from: "work-1",
      to: "review-1",
    });
    const otherLock = { ...lock, adapterRulesDigest: "sha256:rules-v4" };
    expect(() =>
      new RuntimeObservationPolicyPlane(otherLock, trust).addControlRule({
        ...statement,
        statementDigest,
        signature: signature(statementDigest),
      }),
    ).toThrow(/unpinned/i);
    expect(
      plane.deriveControlRelation(
        {
          ...parent,
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          openTelemetryRevision: "attacker",
        },
        {
          ...child,
          traceId: "a".repeat(32),
          spanId: "c".repeat(16),
          parentSpanId: "b".repeat(16),
          openTelemetryRevision: "attacker",
        },
      ),
    ).toBeUndefined();
  });
  test("deduplicates delivery identity without treating delivery as execution", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust);
    plane.ingestEnvelope(envelope());
    const receipt = {
      envelopeId: "event-1",
      transport: "kafka",
      deliveryId: "offset-9",
      attempt: 1,
      receivedAt: now,
    };
    plane.recordDelivery(receipt);
    plane.recordDelivery(receipt);
    expect(plane.deliveries.size).toBe(1);
    expect(plane.completionStatus("work-1", "attempt-1").complete).toBe(false);
    expect(() => plane.recordDelivery({ ...receipt, attempt: 2 })).toThrow(
      /equivocation/i,
    );
  });
});

describe("R14-REF-1: total workflow lowering and fail-closed policy", () => {
  test("accounts for every workflow node and every erased field with typed loss", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust),
      nodes = [
        { id: "start", kind: "start", next: ["choose"] },
        {
          id: "choose",
          kind: "choice",
          next: ["human"],
          condition: "risk > 3",
        },
        { id: "human", kind: "human", next: ["end"], timeoutMs: 60000 },
        { id: "end", kind: "end", next: [] },
      ] as const,
      target = {
        dialect: lock.workflowDialect,
        revision: lock.workflowRevision,
        supportedKinds: ["start", "choice", "end"] as Array<
          "start" | "task" | "choice" | "wait" | "human" | "end"
        >,
        supportsConditions: false,
        supportsTimeouts: false,
      },
      result = plane.lowerWorkflow(
        nodes.map((value) => ({ ...value, next: [...value.next] })),
        target,
      );
    expect(
      plane.verifyWorkflowLowering(
        nodes.map((value) => ({ ...value, next: [...value.next] })),
        result,
        target,
      ),
    ).toBe(true);
    expect(result.dispositions.map((value) => value.nodeId)).toEqual([
      "start",
      "choose",
      "human",
      "end",
    ]);
    const choice = result.dispositions.find(
      (value) => value.nodeId === "choose",
    )!;
    expect(choice.disposition).toBe("approximated");
    expect(choice.losses.map((value) => value.code)).toEqual([
      "condition-erased",
      "target-transition-erased",
    ]);
    expect(
      result.dispositions.find((value) => value.nodeId === "human"),
    ).toMatchObject({ disposition: "rejected", targetIds: [] });
    expect(result.artifact.states.map((value) => value.id)).toEqual([
      "start",
      "choose",
      "end",
    ]);
    expect(
      result.artifact.states.find((value) => value.id === "choose")?.transition,
    ).toEqual([]);
    expect(
      plane.verifyWorkflowLowering(
        nodes.map((value) => ({ ...value, next: [...value.next] })),
        { ...result, artifact: { ...result.artifact, states: [] } },
        target,
      ),
    ).toBe(false);
  });
  test("treats OPA undefined and errors as deny, never allow", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust),
      input = { actor: "worker", effect: "merge" },
      inputDigest = `sha256:${Bun.SHA256.hash(canonicalSemanticJson(input), "hex")}`;
    const allow = plane.evaluatePolicy(input, () =>
      policy("allow", inputDigest),
    );
    expect(allow.decisionAllows).toBe(true);
    expect(
      plane.evaluatePolicy(input, () => policy("undefined", inputDigest)),
    ).toMatchObject({
      decisionAllows: false,
      evaluation: { decision: "undefined" },
    });
    expect(
      plane.evaluatePolicy(input, () => policy("error", inputDigest))
        .decisionAllows,
    ).toBe(false);
    const effect = { id: "effect-1", payload: { branch: "main" } };
    expect(() =>
      plane.enforceEffect(effect, allow.evaluation, {
        effectId: effect.id,
        effectDigest: "sha256:forged",
        evaluationDigest: allow.evaluation.decisionDigest,
        policyBundleDigest: lock.policyBundleDigest,
        policyEngine: lock.policyEngine,
        enforcedAt: now,
        enforcer: "gateway",
        algorithm: "Ed25519",
        statementDigest: "forged",
        signature: "forged",
      }),
    ).toThrow(/receipt/i);
    const effectDigest = `sha256:${Bun.SHA256.hash(canonicalSemanticJson(effect), "hex")}`,
      statement = {
        effectId: effect.id,
        effectDigest,
        evaluationDigest: allow.evaluation.decisionDigest,
        policyBundleDigest: lock.policyBundleDigest,
        policyEngine: lock.policyEngine,
        enforcedAt: now,
        enforcer: "gateway",
        algorithm: "Ed25519",
      },
      statementDigest = policyEnforcementStatementDigest(statement);
    expect(
      plane.enforceEffect(effect, allow.evaluation, {
        ...statement,
        statementDigest,
        signature: signature(statementDigest),
      }).authorized,
    ).toBe(true);
  });
});

describe("R14-EVO-1: replay meaning is version pinned", () => {
  test("rejects event, span, workflow, policy, and restore revision substitution", () => {
    const plane = new RuntimeObservationPolicyPlane(lock, trust);
    plane.ingestEnvelope(envelope());
    plane.ingestSpan(span());
    const snapshot = plane.snapshot((value) => ({
      signer: "checkpoint",
      algorithm: "Ed25519",
      signature: signature(value),
    }));
    expect(() =>
      plane.ingestEnvelope(
        envelope({ id: "bad", bindingDigest: "sha256:other" }),
      ),
    ).toThrow(/unpinned/i);
    expect(() =>
      plane.ingestSpan(
        span({
          spanId: "2222222222222222",
          semanticConventionsRevision: "latest",
        }),
      ),
    ).toThrow(/unpinned/i);
    expect(() =>
      plane.lowerWorkflow([], {
        dialect: lock.workflowDialect,
        revision: "latest",
        supportedKinds: [],
        supportsConditions: true,
        supportsTimeouts: true,
      }),
    ).toThrow(/binding/i);
    expect(() => plane.lowerWorkflow([], { dialect: lock.workflowDialect, revision: lock.workflowRevision, supportedKinds: ["start", "task", "choice", "wait", "human", "end"], supportsConditions: true, supportsTimeouts: true })).toThrow(/binding/i);
    const upgraded = new RuntimeObservationPolicyPlane(
      { ...lock, semanticConventionsRevision: "1.30.0" },
      trust,
    );
    expect(() => upgraded.restore(snapshot)).toThrow(/binding lock/i);
    const tampered = structuredClone(snapshot);
    tampered.verifications.push([
      "work-1/attempt-forged",
      {
        workId: "work-1",
        attemptId: "attempt-forged",
        artifactDigest: "sha256:attacker",
        predicate: "tests-pass",
        observedAt: now,
        verifier: "attacker",
        algorithm: "none",
        statementDigest: "forged",
        signature: "forged",
      },
    ]);
    expect(() =>
      new RuntimeObservationPolicyPlane(lock, trust).restore(tampered),
    ).toThrow(/checkpoint/i);
  });
});
