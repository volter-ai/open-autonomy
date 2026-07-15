import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type RuntimeBindingLock = {
  cloudEventsRevision: "1.0";
  openTelemetryRevision: string;
  semanticConventionsRevision: string;
  workflowDialect: string;
  workflowRevision: string;
  workflowCapabilities: {
    supportedKinds: WorkflowNode["kind"][];
    supportsConditions: boolean;
    supportsTimeouts: boolean;
  };
  policyEngine: string;
  policyBundleDigest: string;
  adapterRulesDigest: string;
};
export type EventEnvelope = {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  subject: string;
  time: string;
  dataDigest: string;
  traceparent?: string;
  bindingDigest: string;
};
export type SpanObservation = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  subject: string;
  operation: string;
  status: "unset" | "ok" | "error";
  startTime: string;
  endTime: string;
  attributesDigest: string;
  semanticConventionsRevision: string;
  openTelemetryRevision: string;
};
export type MetricObservation = {
  name: string;
  subject: string;
  instrument: "counter" | "gauge" | "histogram";
  value: number;
  unit: string;
  observedAt: string;
  attributesDigest: string;
  openTelemetryRevision: string;
  semanticConventionsRevision: string;
};
export type LogObservation = {
  id: string;
  subject: string;
  severity: string;
  bodyDigest: string;
  observedAt: string;
  traceId?: string;
  spanId?: string;
  attributesDigest: string;
  openTelemetryRevision: string;
  semanticConventionsRevision: string;
};
export type DeliveryReceipt = {
  envelopeId: string;
  transport: string;
  deliveryId: string;
  attempt: number;
  receivedAt: string;
};
export type VerifiedWorkEvidence = {
  workId: string;
  attemptId: string;
  artifactDigest: string;
  predicate: string;
  observedAt: string;
  verifier: string;
  algorithm: string;
  statementDigest: string;
  signature: string;
};
export type TraceControlRule = {
  id: string;
  traceOperation: string;
  controlRelation: "causes" | "blocks" | "answers";
  targetOperation: string;
  adapterRulesDigest: string;
  signer: string;
  algorithm: string;
  statementDigest: string;
  signature: string;
};
export type WorkflowNode = {
  id: string;
  kind: "start" | "task" | "choice" | "wait" | "human" | "end";
  next: string[];
  condition?: string;
  timeoutMs?: number;
};
export type WorkflowDisposition = {
  nodeId: string;
  disposition: "preserved" | "approximated" | "rejected";
  targetIds: string[];
  losses: Array<{ code: string; field: string; explanation: string }>;
};
export type PolicyEvaluation = {
  decision: "allow" | "deny" | "undefined" | "error";
  policyBundleDigest: string;
  inputDigest: string;
  decisionDigest: string;
  reason?: string;
  policyEngine: string;
  evaluator: string;
  algorithm: string;
  statementDigest: string;
  signature: string;
};
export type PolicyEnforcementReceipt = {
  effectId: string;
  effectDigest: string;
  evaluationDigest: string;
  policyBundleDigest: string;
  policyEngine: string;
  enforcedAt: string;
  enforcer: string;
  algorithm: string;
  statementDigest: string;
  signature: string;
};
export type RuntimeCheckpointEvidence = {
  digest: string;
  signer: string;
  algorithm: string;
  signature: string;
};
export type ObservabilityPolicyTrust = {
  verifyWorkEvidence(evidence: VerifiedWorkEvidence): boolean;
  verifyTraceControlRule(rule: TraceControlRule): boolean;
  verifyPolicyEnforcement(receipt: PolicyEnforcementReceipt): boolean;
  verifyPolicyEvaluation(evaluation: PolicyEvaluation): boolean;
  verifyCheckpoint(evidence: RuntimeCheckpointEvidence): boolean;
  now(): Date;
};

const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const date = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid timestamp '${value}'`);
  return parsed;
};
export const runtimeBindingDigest = (lock: RuntimeBindingLock) => digest(lock);
export const verifiedWorkStatementDigest = (
  value: Omit<VerifiedWorkEvidence, "statementDigest" | "signature">,
) => digest(value);
export const traceControlStatementDigest = (
  value: Omit<TraceControlRule, "statementDigest" | "signature">,
) => digest(value);
export const policyEnforcementStatementDigest = (
  value: Omit<PolicyEnforcementReceipt, "statementDigest" | "signature">,
) => digest(value);

export class RuntimeObservationPolicyPlane {
  readonly envelopes = new Map<string, EventEnvelope>();
  readonly spans = new Map<string, SpanObservation>();
  readonly metrics = new Map<string, MetricObservation>();
  readonly logs = new Map<string, LogObservation>();
  readonly deliveries = new Map<string, DeliveryReceipt>();
  readonly verifications = new Map<string, VerifiedWorkEvidence>();
  readonly controlRules = new Map<string, TraceControlRule>();
  readonly audit: Array<{
    kind: string;
    subject: string;
    decision: string;
    digest: string;
  }> = [];

  constructor(
    readonly lock: RuntimeBindingLock,
    private readonly trust: ObservabilityPolicyTrust,
  ) {
    for (const [name, value] of Object.entries(lock))
      if (!value) throw new Error(`binding lock '${name}' is empty`);
  }

  ingestEnvelope(envelope: EventEnvelope) {
    if (
      envelope.specversion !== this.lock.cloudEventsRevision ||
      envelope.bindingDigest !== runtimeBindingDigest(this.lock) ||
      !envelope.id ||
      !envelope.source ||
      !envelope.type ||
      !envelope.subject ||
      !envelope.dataDigest.startsWith("sha256:") ||
      (envelope.traceparent !== undefined &&
        !/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(
          envelope.traceparent,
        )) ||
      date(envelope.time) > this.trust.now().getTime() + 60_000
    )
      throw new Error("event envelope is malformed, unpinned, or future-dated");
    const prior = this.envelopes.get(envelope.id);
    if (
      prior &&
      canonicalSemanticJson(prior) !== canonicalSemanticJson(envelope)
    )
      throw new Error("event id equivocation");
    this.envelopes.set(envelope.id, structuredClone(envelope));
  }

  ingestSpan(span: SpanObservation) {
    if (
      span.semanticConventionsRevision !==
        this.lock.semanticConventionsRevision ||
      span.openTelemetryRevision !== this.lock.openTelemetryRevision ||
      !/^[0-9a-f]{32}$/i.test(span.traceId) ||
      !/^[0-9a-f]{16}$/i.test(span.spanId) ||
      (span.parentSpanId !== undefined &&
        !/^[0-9a-f]{16}$/i.test(span.parentSpanId)) ||
      date(span.endTime) < date(span.startTime)
    )
      throw new Error("span is malformed or uses unpinned semantics");
    const key = `${span.traceId}/${span.spanId}`,
      prior = this.spans.get(key);
    if (prior && canonicalSemanticJson(prior) !== canonicalSemanticJson(span))
      throw new Error("span id equivocation");
    this.spans.set(key, structuredClone(span));
  }

  ingestMetric(metric: MetricObservation) {
    if (
      metric.openTelemetryRevision !== this.lock.openTelemetryRevision ||
      metric.semanticConventionsRevision !==
        this.lock.semanticConventionsRevision ||
      !metric.name ||
      !metric.subject ||
      !Number.isFinite(metric.value) ||
      date(metric.observedAt) > this.trust.now().getTime() + 60_000
    )
      throw new Error("metric is malformed or uses unpinned semantics");
    const key = `${metric.subject}/${metric.name}/${metric.observedAt}`,
      prior = this.metrics.get(key);
    if (prior && canonicalSemanticJson(prior) !== canonicalSemanticJson(metric))
      throw new Error("metric identity equivocation");
    this.metrics.set(key, structuredClone(metric));
  }

  ingestLog(log: LogObservation) {
    if (
      log.openTelemetryRevision !== this.lock.openTelemetryRevision ||
      log.semanticConventionsRevision !==
        this.lock.semanticConventionsRevision ||
      !log.id ||
      !log.subject ||
      !log.bodyDigest.startsWith("sha256:") ||
      (log.traceId !== undefined && !/^[0-9a-f]{32}$/i.test(log.traceId)) ||
      (log.spanId !== undefined && !/^[0-9a-f]{16}$/i.test(log.spanId))
    )
      throw new Error("log is malformed or uses unpinned semantics");
    const prior = this.logs.get(log.id);
    if (prior && canonicalSemanticJson(prior) !== canonicalSemanticJson(log))
      throw new Error("log id equivocation");
    this.logs.set(log.id, structuredClone(log));
  }

  recordDelivery(receipt: DeliveryReceipt) {
    if (receipt.attempt < 1 || !this.envelopes.has(receipt.envelopeId))
      throw new Error("delivery does not reference an observed envelope");
    const key = `${receipt.transport}/${receipt.deliveryId}`,
      prior = this.deliveries.get(key);
    if (
      prior &&
      canonicalSemanticJson(prior) !== canonicalSemanticJson(receipt)
    )
      throw new Error("delivery id equivocation");
    this.deliveries.set(key, structuredClone(receipt));
  }

  addControlRule(rule: TraceControlRule) {
    const { statementDigest, signature: _, ...statement } = rule;
    if (
      rule.adapterRulesDigest !== this.lock.adapterRulesDigest ||
      statementDigest !== traceControlStatementDigest(statement) ||
      !this.trust.verifyTraceControlRule(rule) ||
      this.controlRules.has(rule.id)
    )
      throw new Error(
        "control adapter rule is unsigned, unpinned, malformed, or duplicate",
      );
    this.controlRules.set(rule.id, structuredClone(rule));
  }

  deriveControlRelation(parent: SpanObservation, child: SpanObservation) {
    const storedParent = this.spans.get(`${parent.traceId}/${parent.spanId}`),
      storedChild = this.spans.get(`${child.traceId}/${child.spanId}`);
    if (
      !storedParent ||
      !storedChild ||
      canonicalSemanticJson(storedParent) !== canonicalSemanticJson(parent) ||
      canonicalSemanticJson(storedChild) !== canonicalSemanticJson(child)
    )
      return undefined;
    if (
      parent.traceId !== child.traceId ||
      child.parentSpanId !== parent.spanId
    )
      return undefined;
    const rule = [...this.controlRules.values()].find(
      (value) =>
        value.traceOperation === parent.operation &&
        value.targetOperation === child.operation,
    );
    return rule
      ? {
          relation: rule.controlRelation,
          ruleId: rule.id,
          from: parent.subject,
          to: child.subject,
        }
      : undefined;
  }

  verifyWork(evidence: VerifiedWorkEvidence) {
    const { statementDigest, signature: _, ...statement } = evidence;
    if (
      statementDigest !== verifiedWorkStatementDigest(statement) ||
      !this.trust.verifyWorkEvidence(evidence) ||
      date(evidence.observedAt) > this.trust.now().getTime() + 60_000 ||
      this.verifications.has(`${evidence.workId}/${evidence.attemptId}`)
    )
      throw new Error("work evidence is invalid, replayed, or untrusted");
    this.verifications.set(
      `${evidence.workId}/${evidence.attemptId}`,
      structuredClone(evidence),
    );
  }

  completionStatus(workId: string, attemptId: string) {
    const verification = this.verifications.get(`${workId}/${attemptId}`);
    const observations =
      [...this.envelopes.values()].filter((value) => value.subject === workId)
        .length +
      [...this.spans.values()].filter((value) => value.subject === workId)
        .length +
      [...this.metrics.values()].filter((value) => value.subject === workId)
        .length +
      [...this.logs.values()].filter((value) => value.subject === workId)
        .length;
    return verification
      ? {
          complete: true,
          basis: "independent-verification" as const,
          artifactDigest: verification.artifactDigest,
          observations,
        }
      : { complete: false, basis: "observation-only" as const, observations };
  }

  evaluatePolicy(
    input: unknown,
    evaluator: (input: unknown, bundleDigest: string) => PolicyEvaluation,
  ): { decisionAllows: boolean; evaluation: PolicyEvaluation } {
    const inputDigest = digest(input),
      evaluation = evaluator(
        structuredClone(input),
        this.lock.policyBundleDigest,
      );
    if (
      evaluation.policyBundleDigest !== this.lock.policyBundleDigest ||
      evaluation.policyEngine !== this.lock.policyEngine ||
      evaluation.inputDigest !== inputDigest ||
      evaluation.statementDigest !==
        digest({
          decision: evaluation.decision,
          policyBundleDigest: evaluation.policyBundleDigest,
          inputDigest: evaluation.inputDigest,
          reason: evaluation.reason,
          policyEngine: evaluation.policyEngine,
          evaluator: evaluation.evaluator,
          algorithm: evaluation.algorithm,
        }) ||
      evaluation.decisionDigest !== evaluation.statementDigest ||
      !this.trust.verifyPolicyEvaluation(evaluation)
    )
      throw new Error(
        "policy evaluation is unpinned or internally inconsistent",
      );
    const decisionAllows = evaluation.decision === "allow";
    const record = {
      kind: "policy",
      subject: inputDigest,
      decision: evaluation.decision,
      digest: evaluation.decisionDigest,
    };
    this.audit.push(record);
    return { decisionAllows, evaluation: structuredClone(evaluation) };
  }

  enforceEffect(
    effect: { id: string; payload: unknown },
    evaluation: PolicyEvaluation,
    receipt: PolicyEnforcementReceipt,
  ) {
    const effectDigest = digest(effect),
      { statementDigest, signature: _, ...statement } = receipt;
    if (
      evaluation.decision !== "allow" ||
      receipt.effectId !== effect.id ||
      receipt.effectDigest !== effectDigest ||
      receipt.evaluationDigest !== evaluation.decisionDigest ||
      receipt.policyBundleDigest !== this.lock.policyBundleDigest ||
      receipt.policyEngine !== this.lock.policyEngine ||
      statementDigest !== policyEnforcementStatementDigest(statement) ||
      !this.trust.verifyPolicyEnforcement(receipt)
    )
      throw new Error(
        "effect lacks a valid independent policy-enforcement receipt",
      );
    return {
      authorized: true,
      effectId: effect.id,
      receiptDigest: statementDigest,
    };
  }

  lowerWorkflow(
    nodes: WorkflowNode[],
    target: {
      dialect: string;
      revision: string;
      supportedKinds: WorkflowNode["kind"][];
      supportsConditions: boolean;
      supportsTimeouts: boolean;
    },
  ) {
    if (
      target.dialect !== this.lock.workflowDialect ||
      target.revision !== this.lock.workflowRevision ||
      canonicalSemanticJson({
        supportedKinds: [...target.supportedKinds].sort(),
        supportsConditions: target.supportsConditions,
        supportsTimeouts: target.supportsTimeouts,
      }) !==
        canonicalSemanticJson({
          supportedKinds: [
            ...this.lock.workflowCapabilities.supportedKinds,
          ].sort(),
          supportsConditions: this.lock.workflowCapabilities.supportsConditions,
          supportsTimeouts: this.lock.workflowCapabilities.supportsTimeouts,
        })
    )
      throw new Error("workflow target does not match binding lock");
    const ids = new Set(nodes.map((value) => value.id));
    if (
      ids.size !== nodes.length ||
      nodes.some((value) => value.next.some((id) => !ids.has(id)))
    )
      throw new Error("workflow graph is not closed and unique");
    const dispositions: WorkflowDisposition[] = nodes.map((node) => {
      if (!target.supportedKinds.includes(node.kind))
        return {
          nodeId: node.id,
          disposition: "rejected",
          targetIds: [],
          losses: [
            {
              code: "unsupported-kind",
              field: "kind",
              explanation: `${node.kind} is absent from ${target.dialect}`,
            },
          ],
        };
      const losses: WorkflowDisposition["losses"] = [];
      if (node.condition && !target.supportsConditions)
        losses.push({
          code: "condition-erased",
          field: "condition",
          explanation: "target has no condition semantics",
        });
      if (node.timeoutMs !== undefined && !target.supportsTimeouts)
        losses.push({
          code: "timeout-erased",
          field: "timeoutMs",
          explanation: "target has no timeout semantics",
        });
      return {
        nodeId: node.id,
        disposition: losses.length ? "approximated" : "preserved",
        targetIds: [`${target.dialect}:${node.id}`],
        losses,
      };
    });
    if (
      dispositions.length !== nodes.length ||
      new Set(dispositions.map((value) => value.nodeId)).size !== nodes.length
    )
      throw new Error("workflow lowering coverage is not total");
    const rejected = new Set(
      dispositions
        .filter((value) => value.disposition === "rejected")
        .map((value) => value.nodeId),
    );
    for (const node of nodes) {
      const disposition = dispositions.find(
        (value) => value.nodeId === node.id,
      )!;
      for (const id of node.next.filter((value) => rejected.has(value))) {
        if (disposition.disposition !== "rejected")
          disposition.disposition = "approximated";
        disposition.losses.push({
          code: "target-transition-erased",
          field: "next",
          explanation: `transition to rejected node '${id}' is absent from target`,
        });
      }
    }
    const artifact = {
      document: { dsl: target.dialect, revision: target.revision },
      states: nodes.flatMap((node) => {
        const disposition = dispositions.find(
          (value) => value.nodeId === node.id,
        )!;
        if (disposition.disposition === "rejected") return [];
        return [
          {
            id: node.id,
            type: node.kind,
            transition: node.next.filter((id) => !rejected.has(id)),
            ...(node.condition && target.supportsConditions
              ? { condition: node.condition }
              : {}),
            ...(node.timeoutMs !== undefined && target.supportsTimeouts
              ? { timeoutMs: node.timeoutMs }
              : {}),
          },
        ];
      }),
    };
    return {
      bindingDigest: runtimeBindingDigest(this.lock),
      inputDigest: digest(nodes),
      target: { dialect: target.dialect, revision: target.revision },
      dispositions,
      artifact,
      outputDigest: digest(artifact),
    };
  }

  verifyWorkflowLowering(
    nodes: WorkflowNode[],
    result: ReturnType<RuntimeObservationPolicyPlane["lowerWorkflow"]>,
    target: Parameters<RuntimeObservationPolicyPlane["lowerWorkflow"]>[1],
  ) {
    const expected = this.lowerWorkflow(nodes, target);
    const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const ids = new Set(result.artifact.states.map((value) => value.id));
    if (
      result.artifact.states.some((value) =>
        value.transition.some((id) => !ids.has(id)),
      )
    )
      return false;
    return (
      canonicalSemanticJson(plain(expected)) ===
      canonicalSemanticJson(plain(result))
    );
  }

  snapshot(
    sign: (digest: string) => Omit<RuntimeCheckpointEvidence, "digest">,
  ) {
    const state = {
      lock: this.lock,
      envelopes: [...this.envelopes],
      spans: [...this.spans],
      metrics: [...this.metrics],
      logs: [...this.logs],
      deliveries: [...this.deliveries],
      verifications: [...this.verifications],
      controlRules: [...this.controlRules],
      audit: this.audit,
    };
    const checkpointDigest = digest(state);
    return structuredClone({
      ...state,
      checkpoint: { digest: checkpointDigest, ...sign(checkpointDigest) },
    });
  }

  restore(snapshot: ReturnType<RuntimeObservationPolicyPlane["snapshot"]>) {
    const { checkpoint, ...state } = snapshot;
    if (
      checkpoint.digest !== digest(state) ||
      !this.trust.verifyCheckpoint(checkpoint)
    )
      throw new Error("runtime observation checkpoint is invalid or untrusted");
    if (runtimeBindingDigest(snapshot.lock) !== runtimeBindingDigest(this.lock))
      throw new Error("runtime binding lock changed across replay");
    this.envelopes.clear();
    for (const [, value] of snapshot.envelopes) this.ingestEnvelope(value);
    this.spans.clear();
    for (const [, value] of snapshot.spans) this.ingestSpan(value);
    this.metrics.clear();
    for (const [, value] of snapshot.metrics) this.ingestMetric(value);
    this.logs.clear();
    for (const [, value] of snapshot.logs) this.ingestLog(value);
    this.deliveries.clear();
    for (const [, value] of snapshot.deliveries) this.recordDelivery(value);
    this.verifications.clear();
    for (const [, value] of snapshot.verifications) this.verifyWork(value);
    this.controlRules.clear();
    for (const [, value] of snapshot.controlRules) this.addControlRule(value);
    this.audit.length = 0;
    this.audit.push(...snapshot.audit);
  }
}
