import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalSemanticJson } from "@open-autonomy/core";
import {
  R28_EXTERNAL_PHASES,
  signableR28Campaign,
  verifyR28ExternalCampaign,
  type R28ExternalCampaign,
  type R28ExternalTrust,
  type R28Proposal,
  type R28RoleGrant,
} from "./r28-external-campaign";
import {
  acceptR28Append, acceptR28Completion, acceptR28Registration, acceptR28Seal, acceptR28Validation, acceptR28ValidatorIntent,
  assembleR28AcquisitionCampaign, createR28AcquisitionState, issueR28Append, issueR28Completion, issueR28Registration,
  issueR28Seal, issueR28Validation, issueR28ValidatorIntent, type R28AcquisitionRequest, type R28AcquisitionRole,
  type R28AcquisitionState, type R28Stream,
} from "./r28-acquisition";
import { verifyExternalCampaign } from "./verify-external-campaign";
const h = (x: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const,
  k = () => {
    const x = generateKeyPairSync("ed25519");
    return {
      pub: x.publicKey.export({ type: "spki", format: "pem" }).toString(),
      priv: x.privateKey,
    };
  },
  keys = Object.fromEntries(
    [
      "proposer",
      "evaluator",
      "approver",
      "deployer",
      "auditor",
      "collector",
      "crash",
      "validator",
    ].map((x) => [x, k()]),
  ),
  sg = (body: unknown, key: string) =>
    sign(
      null,
      Buffer.from(canonicalSemanticJson(body)),
      keys[key]!.priv,
    ).toString("base64"),
  roles = ["proposer", "evaluator", "approver", "deployer", "auditor"] as const,
  start = Date.parse("2026-01-01T00:00:00Z"),
  generated = "2026-04-02T00:00:00Z";
const trust: R28ExternalTrust = {
  dependency: (c, a) => a === `closure-${c}`,
  repository: (r) => r.baselineHead !== r.finalHead,
  roleGrant: (g) => g.authority === "identity-root",
  collector: (_i, b, s) => s === sg(b, "collector"),
  crash: (b, s) => s === sg(b, "crash"),
  accounting: (p) =>
    p.receiptDigest ===
    h({
      spend: p.spend,
      operations: p.operations,
      changedPaths: p.changedPaths,
    }),
  protectedControls: () => true,
  r27Canary: (d, id) => d === h(`r27:${id}`),
  attack: (_k, b, s) => s === sg(b, "auditor"),
  pause: (b, s) => s === sg(b, "auditor"),
  validator: (i, kid, p) =>
    i === "external-validator" &&
    kid === "validator-key" &&
    p === keys.validator!.pub,
};
function grant(role: (typeof roles)[number]): R28RoleGrant {
  const body = {
    role,
    identity: `human-${role}`,
    keyId: `${role}-key`,
    publicKeyPem: keys[role]!.pub,
    issuedAt: "2025-12-01T00:00:00Z",
    expiresAt: "2027-01-01T00:00:00Z",
    revoked: false as const,
    grantDigest: h(role),
    authority: "identity-root",
  };
  return { ...body, signature: sg(body, role) };
}
const stage = (
  stage: R28Proposal["attestations"][number]["stage"],
  role: (typeof roles)[number],
  payloadDigest: ReturnType<typeof h>,
) => {
  const body = {
    stage,
    role,
    identity: `human-${role}`,
    payloadDigest,
    signedAt: "2026-03-01T00:00:00Z",
  };
  return { ...body, signature: sg(body, role) };
};
function proposal(id: string, outcome: R28Proposal["outcome"]): R28Proposal {
  const patch = h(`patch:${id}`),
    pre = h(`pre:${id}`),
    checks = h(`checks:${id}`),
    bench = h(`bench:${id}`),
    decision = h(`decision:${id}`),
    deployment = h(`deploy:${id}`),
    canary = h(`canary:${id}`),
    effectKind: "promote" | "rollback" | undefined =
      outcome === "accepted"
        ? "promote"
        : outcome === "rolled-back"
          ? "rollback"
          : undefined,
    effects = effectKind
      ? [
          {
            id: `effect-${id}`,
            kind: effectKind,
            status: "acknowledged" as const,
            patchDigest: patch,
            receiptDigest: h(`receipt:${id}`),
          },
        ]
      : [],
    accounting = {
      spend: 1,
      operations: 1,
      changedPaths: 1,
      receiptDigest: h({ spend: 1, operations: 1, changedPaths: 1 }),
    };
  return {
    id,
    outcome,
    claim: outcome === "accepted" ? "causal" : "prediction",
    patch: {
      digest: patch,
      resultStateDigest: h(`state:${id}`),
      paths: [`organization.${id}`],
      operations: 1,
    },
    preregistration: {
      digest: pre,
      metric: "quality",
      unit: "fraction",
      population: "repository tasks",
      estimand: "ATE",
      minimumImprovement: 0.1,
      guardrailsDigest: h("guards"),
    },
    checks: {
      digest: checks,
      patchDigest: patch,
      compile: true,
      conform: true,
      formal: true,
      inheritedObligationsDigest: h("obligations"),
    },
    benchmark: {
      digest: bench,
      patchDigest: patch,
      authority: "benchmark-lab",
      passed: outcome !== "rejected",
    },
    ...(outcome !== "rejected"
      ? {
          deployment: {
            digest: deployment,
            patchDigest: patch,
            approvalDigest: pre,
            effectId: `effect-${id}`,
          },
          canary: {
            digest: canary,
            r27Digest: h(`r27:${id}`),
            patchDigest: patch,
          },
        }
      : {}),
    decision: {
      digest: decision,
      preregistrationDigest: pre,
      measuredImprovement: outcome === "accepted" ? 0.2 : 0,
      confidenceInterval: outcome === "accepted" ? [0.15, 0.25] : [-0.1, 0.1],
      safetyRegressions: 0,
      automatic: outcome === "rolled-back",
    },
    effects,
    protectedControlsAfter: Object.fromEntries(
      [
        "constitution",
        "grader",
        "authorityCeiling",
        "evidence",
        "pause",
        "rollback",
      ].map((x) => [x, h(x)]),
    ),
    accounting,
    attestations: [
      stage("proposal", "proposer", patch),
      stage("preregistration", "auditor", pre),
      stage("checks", "evaluator", checks),
      stage("benchmark", "evaluator", bench),
      stage("approval", "approver", pre),
      ...(outcome !== "rejected"
        ? [
            stage("deployment", "deployer", deployment),
            stage("canary", "auditor", canary),
          ]
        : []),
      stage("decision", "evaluator", decision),
    ],
  };
}
function campaign(): R28ExternalCampaign {
  const heartbeats = Array.from({ length: 92 }, (_, i) => {
      const body = {
        sequence: i + 1,
        observedAt: new Date(start + i * 864e5).toISOString(),
        head: h(`head:${i}`),
        collectorId: "external-collector",
        bootId: `boot-${i}`,
        processId: `process-${i}`,
        evidenceDigest: h(`heartbeat:${i}`),
      };
      return { ...body, signature: sg(body, "collector") };
    }),
    crashes = R28_EXTERNAL_PHASES.map((phase, i) => {
      const body = {
        phase,
        beforeBootId: `boot-${i}`,
        afterBootId: `boot-${i + 1}`,
        beforeProcessId: `process-${i}`,
        afterProcessId: `process-${i + 1}`,
        storageGenerationBefore: i,
        storageGenerationAfter: i + 1,
        ...(phase.startsWith("effect-") ? { effectId: "effect-accepted" } : {}),
        receiptDigest: h(`crash:${phase}`),
        authority: "crash-lab",
        keyId: "crash-key",
        publicKeyPem: keys.crash!.pub,
      };
      return { ...body, signature: sg(body, "crash") };
    }),
    proposals = [
      proposal("accepted", "accepted"),
      proposal("rejected", "rejected"),
      proposal("rollback", "rolled-back"),
    ],
    effectIds = proposals.flatMap((p) => p.effects.map((e) => e.id)),
    auditItems = proposals.flatMap((p) => [
      ...[
        ["patch", p.patch.digest],
        ["preregistration", p.preregistration.digest],
        ["checks", p.checks.digest],
        ["benchmark", p.benchmark.digest],
        ...(p.deployment ? [["deployment", p.deployment.digest]] : []),
        ...(p.canary ? [["canary", p.canary.digest]] : []),
        ["decision", p.decision.digest],
      ].map(([event, artifactDigest]) => ({
        proposalId: p.id,
        event,
        artifactDigest,
      })),
      ...p.effects.map((e) => ({
        proposalId: p.id,
        event: "effect-acknowledged",
        artifactDigest: e.receiptDigest,
        effectId: e.id,
      })),
    ]);
  let previous: ReturnType<typeof h> | undefined;
  const audit = auditItems.map((item, i) => {
      const body = {
          sequence: i + 1,
          at: "2026-03-15T00:00:00Z",
          ...item,
          authority: "human-auditor",
          ...(previous ? { previousDigest: previous } : {}),
        },
        digest = h(body),
        signed = { ...body, digest },
        signature = sg(signed, "auditor");
      previous = digest;
      return { ...signed, signature };
    }),
    attack = (kind: string) => {
      const body = {
        inputDigest: h(`${kind}:input`),
        rejectionDigest: h(`${kind}:rejected`),
        authority: "human-auditor",
      };
      return { ...body, signature: sg(body, "auditor") };
    },
    pauseBody = {
      requestDigest: h("pause"),
      safeStateDigest: h("safe"),
      rollbackEffects: ["effect-rollback"],
      authority: "human-auditor",
    },
    c: any = {
      schema: "open-autonomy.bench-r28-external-campaign.v1",
      closureClaim: false,
      campaignId: "canonical-90d",
      generatedAt: generated,
      dependencies: Array.from({ length: 28 }, (_, i) => ({
        checkpoint: `R${i}`,
        artifactId: `closure-R${i}`,
        digest: h(`closure:${i}`),
        registryDigest: h(`registry:${i}`),
      })),
      repository: {
        remoteDigest: h("remote"),
        baselineHead: h("base"),
        finalHead: h("final"),
        cleanTreeDigest: h("clean"),
      },
      bounds: {
        digest: h("bounds"),
        proposalCount: 3,
        spend: 3,
        operations: 3,
        changedPaths: 3,
        maximumObservationGapMs: 864e5,
      },
      protectedControls: Object.fromEntries(
        [
          "constitution",
          "grader",
          "authorityCeiling",
          "evidence",
          "pause",
          "rollback",
        ].map((x) => [x, h(x)]),
      ),
      roleGrants: roles.map(grant),
      heartbeats,
      crashes,
      proposals,
      attacks: {
        forgedApproval: attack("forged"),
        compromisedWorker: attack("worker"),
      },
      pause: { ...pauseBody, signature: sg(pauseBody, "auditor") },
      audit,
      residuals: [],
      validator: {
        identity: "external-validator",
        keyId: "validator-key",
        publicKeyPem: keys.validator!.pub,
        signedAt: generated,
        signature: "",
      },
    };
  c.validator.signature = sg(signableR28Campaign(c), "validator");
  return c;
}
const resign = (c: R28ExternalCampaign) => {
  c.validator.signature = sg(signableR28Campaign(c), "validator");
  return c;
};
test("validates a fully trusted 90-day externally signed campaign", () =>
  expect(
    verifyR28ExternalCampaign(campaign(), trust, "2026-04-02T12:00:00Z"),
  ).toMatchObject({
    status: "valid-complete-external-campaign",
    proposalCount: 3,
  }));
test("accepts the valid campaign through the production timestamp-bound intake", () => {
  const receipt = verifyExternalCampaign("R28", canonicalSemanticJson(campaign()), "export const trust = externallyConfigured;", trust,
    "2026-04-02T12:00:00Z", { attestationDigest: `sha256:${"1".repeat(64)}`, rootFingerprint: `sha256:${"2".repeat(64)}` });
  expect(receipt.result).toMatchObject({ status: "valid-complete-external-campaign" });
  expect(receipt.verifiedAt).toBe("2026-04-02T12:00:00Z");
});
test("reconstructs the exact valid campaign through externally custodied append streams", () => {
  const source = campaign(), acquisitionRoles: R28AcquisitionRole[] = ["registration-authority", "heartbeat-collector", "crash-injector", "proposal-custodian", "audit-custodian", "finalizer", "validator"],
    roleKeys = {} as Record<R28AcquisitionRole, string>, publicKeys: Record<string, string> = {}, privateKeys: Record<string, any> = {};
  for (const role of acquisitionRoles) {
    const id = role === "validator" ? "validator-key" : `custody-${role}`, pair = role === "validator" ? keys.validator! : k();
    roleKeys[role] = id; publicKeys[id] = pair.pub; privateKeys[id] = pair.priv;
  }
  const state = createR28AcquisitionState({ campaignId: source.campaignId, createdAt: "2025-12-01T00:00:00Z", roleKeys, publicKeys });
  const respond = (request: R28AcquisitionRequest, fragment: unknown) => {
    const signerKeyId = state.roleKeys[request.role], body = { schema: "open-autonomy.bench-r28-acquisition-response.v1" as const,
      requestDigest: h(request), fragmentDigest: h(fragment), signerKeyId, signedAt: source.generatedAt };
    return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), privateKeys[signerKeyId]).toString("base64"), fragment };
  };
  const registration = { dependencies: source.dependencies, bounds: source.bounds, protectedControls: source.protectedControls,
    roleGrants: source.roleGrants, repositoryBaseline: { remoteDigest: source.repository.remoteDigest, baselineHead: source.repository.baselineHead } };
  let request = issueR28Registration(state); acceptR28Registration(state, respond(request, registration));
  const streamValues: Record<R28Stream, unknown[]> = { heartbeats: source.heartbeats, crashes: source.crashes, proposals: source.proposals, audit: source.audit };
  for (const stream of Object.keys(streamValues) as R28Stream[]) {
    for (const value of streamValues[stream]) { request = issueR28Append(state, stream); acceptR28Append(state, stream, request.ordinal, respond(request, value)); }
    request = issueR28Seal(state, stream); const entries = state.streams[stream].entries;
    acceptR28Seal(state, stream, respond(request, { count: entries.length, headResponseDigest: h(entries.at(-1)!.response!) }));
  }
  request = issueR28Completion(state); acceptR28Completion(state, respond(request, { repository: source.repository, attacks: source.attacks, pause: source.pause, residuals: source.residuals, generatedAt: source.generatedAt }));
  request = issueR28ValidatorIntent(state); acceptR28ValidatorIntent(state, respond(request, { identity: source.validator.identity, keyId: source.validator.keyId,
    publicKeyPem: source.validator.publicKeyPem, signedAt: source.validator.signedAt }));
  request = issueR28Validation(state); acceptR28Validation(state, respond(request, { campaignSignature: source.validator.signature }));
  const reconstructed = assembleR28AcquisitionCampaign(state);
  expect(canonicalSemanticJson(reconstructed)).toBe(canonicalSemanticJson(source));
  expect(verifyR28ExternalCampaign(reconstructed, trust, "2026-04-02T12:00:00Z")).toMatchObject({ status: "valid-complete-external-campaign" });
});
test("rejects dependency/repository/identity/time/crash and residual fabrication", () => {
  const ms = [
    (c: any) => c.dependencies.pop(),
    (c: any) => (c.repository.finalHead = c.repository.baselineHead),
    (c: any) => (c.roleGrants[1].identity = c.roleGrants[0].identity),
    (c: any) => c.heartbeats.pop(),
    (c: any) =>
      (c.heartbeats[2].evidenceDigest = c.heartbeats[1].evidenceDigest),
    (c: any) => c.crashes.pop(),
    (c: any) => c.residuals.push({ id: "open" }),
  ];
  for (const m of ms) {
    const c: any = campaign();
    m(c);
    resign(c);
    expect(() =>
      verifyR28ExternalCampaign(c, trust, "2026-04-02T12:00:00Z"),
    ).toThrow();
  }
});
test("rejects broken chains, causal inflation, control mutation, accounting, effects and audit equivocation", () => {
  const ms = [
    (c: any) => (c.proposals[0].checks.patchDigest = h("other")),
    (c: any) => (c.proposals[0].decision.confidenceInterval = [-0.1, 0.3]),
    (c: any) => (c.proposals[0].decision.safetyRegressions = 1),
    (c: any) => (c.proposals[0].protectedControlsAfter.grader = h("mutated")),
    (c: any) => (c.proposals[0].accounting.spend = 4),
    (c: any) => (c.proposals[2].effects[0].id = c.proposals[0].effects[0].id),
    (c: any) => (c.audit[0].previousDigest = h("fork")),
    (c: any) => (c.pause.rollbackEffects = ["unknown"]),
    (c: any) => (c.attacks.forgedApproval.signature = "forged"),
    (c: any) => (c.validator.signature = "forged"),
  ];
  for (const m of ms) {
    const c: any = campaign();
    m(c);
    if (c.validator.signature !== "forged") resign(c);
    expect(() =>
      verifyR28ExternalCampaign(c, trust, "2026-04-02T12:00:00Z"),
    ).toThrow();
  }
});
