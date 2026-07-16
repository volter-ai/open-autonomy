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
