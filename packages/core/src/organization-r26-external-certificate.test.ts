import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  signableR26Approval,
  signableR26Certificate,
  signableR26Evaluation,
  signableR26Manifest,
  verifyR26ExternalCertificate,
  type R26Approval,
  type R26Certificate,
  type R26ExternalTrust,
} from "./organization-r26-external-certificate";
const digest = (v: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}` as const;
const key = () => {
  const k = generateKeyPairSync("ed25519");
  return {
    pub: k.publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: k.privateKey,
  };
};
const manifestKey = key(),
  validatorKey = key(),
  assessmentKey = key(),
  authorities = Object.fromEntries(
    ["governance", "security", "rollout", "budget"].map((x) => [x, key()]),
  );
const now = "2026-07-16T12:00:00Z",
  r25Digest = digest("accepted-r25");
let accepted = true,
  complete = true,
  heldout = true,
  identified = true,
  effectsTrusted = true;
const trust: R26ExternalTrust = {
  acceptedR25: (r) =>
    accepted && r.digest === r25Digest && r.authorityId === "r25-board",
  acceptedBaseline: (d, s) =>
    d === r25Digest && s === digest({ "organization.worker.capacity": 1 }),
  completeCandidateManifest: () => complete,
  identification: (_d, id) =>
    identified && id === "identified-service" ? "identified" : "unknown",
  verifyR25Effect: (d, e) =>
    effectsTrusted &&
    d === r25Digest &&
    e.population === "repository coding tasks" &&
    e.horizon === "30d",
  canonicalPatchOperation: (kind, path) =>
    path === "organization.worker.capacity" && kind === "capacity",
  heldout: () => heldout,
  trustedKey: (role, authority, keyId, pem) =>
    role === "manifest"
      ? authority === "candidate-custodian" &&
        keyId === "manifest-key" &&
        pem === manifestKey.pub
      : role === "validator"
        ? authority === "independent-validator" &&
          keyId === "validator-key" &&
          pem === validatorKey.pub
        : role === "assessment"
          ? authority === "assessment-authority" &&
            keyId === "assessment-key" &&
            pem === assessmentKey.pub
          : authority === `${role}-authority` &&
            keyId === `${role}-key` &&
            pem === authorities[role]!.pub,
};
function approval(
  candidateId: string,
  kind: R26Approval["kind"],
  limit = kind === "rollout" ? 0.1 : kind === "budget" ? 10 : 1,
): R26Approval {
  const body = {
      candidateId,
      kind,
      authorityId: `${kind}-authority`,
      keyId: `${kind}-key`,
      publicKeyPem: authorities[kind]!.pub,
      issuedAt: "2026-07-16T10:00:00Z",
      expiresAt: "2026-07-17T10:00:00Z",
      scope: `candidate:${candidateId}`,
      limit,
    },
    signature = sign(
      null,
      Buffer.from(
        canonicalSemanticJson(signableR26Approval({ ...body, signature: "" })),
      ),
      authorities[kind]!.priv,
    ).toString("base64");
  return { ...body, signature };
}
const effect = (
  claim: "prediction" | "causal",
  quality: number,
  cost: number,
) => [
  {
    metric: "quality",
    population: "repository coding tasks",
    horizon: "30d",
    unit: "fraction",
    estimand:
      claim === "causal" ? "ATE(capacity=2 vs 1)" : "E[quality|capacity=2]",
    direction: "maximize" as const,
    point: quality,
    interval: [quality - 0.01, quality + 0.01] as [number, number],
    r25EvidenceDigest: digest("quality-evidence"),
    provenance:
      claim === "causal"
        ? ("r25-intervention" as const)
        : ("r25-prediction" as const),
  },
  {
    metric: "cost",
    population: "repository coding tasks",
    horizon: "30d",
    unit: "USD/task",
    estimand:
      claim === "causal" ? "ATE cost(capacity=2 vs 1)" : "E[cost|capacity=2]",
    direction: "minimize" as const,
    point: cost,
    interval: [cost - 0.1, cost + 0.1] as [number, number],
    r25EvidenceDigest: digest("cost-evidence"),
    provenance:
      claim === "causal"
        ? ("r25-intervention" as const)
        : ("r25-prediction" as const),
  },
];
function evaluation(
  candidateId: string,
  patch: any,
  quality: number,
  cost: number,
) {
  const result: any = {
    cost,
    authority: { repo: 1 },
    semanticPaths: ["organization.worker.capacity"],
    metrics: {
      quality: {
        point: quality,
        uncertainty: 0.01,
        unit: "fraction",
        r25EvidenceDigest: digest("quality-evidence"),
      },
      cost: {
        point: cost,
        uncertainty: 0.1,
        unit: "USD/task",
        r25EvidenceDigest: digest("cost-evidence"),
      },
    },
    proxy: {
      reportedEscalations: 1,
      latentFailures: 1,
      attributedHumanMinutes: 2,
      actualHumanMinutes: 2,
      metricCoverage: 1,
      distributionShift: 0.1,
    },
    heldout: {
      splitId: "heldout-2026q2",
      trainingDigest: digest("train"),
      testDigest: digest("test"),
      disjoint: true as const,
      frozenAt: "2026-07-16T09:15:00Z",
      evaluatedAt: "2026-07-16T11:30:00Z",
      rows: [
        {
          metric: "quality",
          unit: "fraction",
          predicted: quality,
          lower: quality - 0.1,
          upper: quality + 0.1,
          actual: quality,
        },
        {
          metric: "cost",
          unit: "USD/task",
          predicted: cost,
          lower: cost - 0.2,
          upper: cost + 0.2,
          actual: cost,
        },
      ],
    },
  };
  const baseline = { "organization.worker.capacity": 1 },
    post = {
      "organization.worker.capacity": patch.operations.length
        ? patch.operations.at(-1).to
        : 1,
    },
    e: any = {
      ...result,
      evidence: {
        authorityId: "assessment-authority",
        keyId: "assessment-key",
        publicKeyPem: assessmentKey.pub,
        r25Digest,
        baselineStateDigest: digest(baseline),
        patchDigest: digest(patch),
        resultStateDigest: digest(post),
        resultDigest: digest(result),
        evaluatedAt: result.heldout.evaluatedAt,
        signature: "",
      },
    };
  e.evidence.signature = sign(
    null,
    Buffer.from(canonicalSemanticJson(signableR26Evaluation(candidateId, e))),
    assessmentKey.priv,
  ).toString("base64");
  return e;
}
function certificate(): R26Certificate {
  const baseline: any = {
      id: "baseline",
      patch: {
        schema: "autonomy.organization-patch.v1",
        id: "baseline",
        operations: [],
      },
      claim: "prediction",
      disposition: "baseline",
      identificationId: "prediction-service",
      rationale: "retain accepted R25 baseline",
      assumptions: ["stationary heldout population"],
      risks: ["no improvement"],
      rollbackTrigger: "not applicable: no-op baseline",
      expectedEffects: effect("prediction", 0.5, 5),
    },
    faster: any = {
      id: "faster",
      patch: {
        schema: "autonomy.organization-patch.v1",
        id: "faster",
        operations: [
          {
            kind: "capacity",
            path: "organization.worker.capacity",
            from: 1,
            to: 2,
          },
        ],
      },
      claim: "causal",
      disposition: "actionable",
      identificationId: "identified-service",
      rationale: "increase identified service capacity",
      assumptions: ["queue model remains calibrated"],
      risks: ["idle capacity cost"],
      rollbackTrigger: "quality lower bound below baseline",
      expectedEffects: effect("causal", 0.8, 4),
    },
    candidates = [baseline, faster],
    ids = candidates.map((x) => x.id),
    manifestDigest = digest({ r25Digest, candidateIds: ids, candidates }),
    approvals = ids.flatMap((id) =>
      (["governance", "security", "rollout", "budget"] as const).map((k) =>
        approval(id, k),
      ),
    ),
    c: any = {
      schema: "autonomy.r26-external-certificate.v1",
      r25: {
        artifactId: "R25-HELDOUT-LIVE-CALIBRATION-V3",
        digest: r25Digest,
        acceptedAt: "2026-07-16T09:00:00Z",
        authorityId: "r25-board",
      },
      baseline: {
        candidateId: "baseline",
        stateDigest: digest({ "organization.worker.capacity": 1 }),
        state: { "organization.worker.capacity": 1 },
      },
      manifest: {
        digest: manifestDigest,
        candidateIds: ids,
        authorityId: "candidate-custodian",
        keyId: "manifest-key",
        publicKeyPem: manifestKey.pub,
        signedAt: "2026-07-16T09:30:00Z",
        signature: "",
      },
      candidates,
      objectives: [
        {
          metric: "quality",
          direction: "maximize",
          uncertaintyAversion: 1,
          complexityPenalty: 0.01,
        },
        {
          metric: "cost",
          direction: "minimize",
          uncertaintyAversion: 1,
          complexityPenalty: 0.01,
        },
      ],
      constraints: {
        allowedPaths: ["organization.worker"],
        maximumAuthority: { repo: 1 },
        budget: 10,
        rolloutMaximum: 0.2,
        maximumComplexity: 3,
        minimumMetricCoverage: 0.9,
        maximumProxyGap: 0,
        maximumDistributionShift: 0.2,
        backtestPolicy: {
          quality: { unit: "fraction", maxMae: 0.2, minCoverage: 0.8 },
          cost: { unit: "USD/task", maxMae: 0.2, minCoverage: 0.8 },
        },
      },
      approvals,
      assessments: [
        {
          candidateId: "baseline",
          evaluation: evaluation("baseline", baseline.patch, 0.5, 5),
          feasible: true,
          violations: [],
          adjustedObjectives: { quality: 0.49, cost: 5.1 },
          dominatedBy: ["faster"],
        },
        {
          candidateId: "faster",
          evaluation: evaluation("faster", faster.patch, 0.8, 4),
          feasible: true,
          violations: [],
          adjustedObjectives: { quality: 0.78, cost: 4.109999999999999 },
          dominatedBy: [],
        },
      ],
      paretoFront: ["faster"],
      recommendation: "faster",
      outcome: "recommended",
      rationale:
        "candidate robustly Pareto-dominates every feasible alternative",
      generatedAt: now,
      validator: {
        validatorId: "independent-validator",
        keyId: "validator-key",
        publicKeyPem: validatorKey.pub,
        signedAt: now,
        signature: "",
      },
    };
  c.manifest.signature = sign(
    null,
    Buffer.from(canonicalSemanticJson(signableR26Manifest(c))),
    manifestKey.priv,
  ).toString("base64");
  c.validator.signature = sign(
    null,
    Buffer.from(canonicalSemanticJson(signableR26Certificate(c))),
    validatorKey.priv,
  ).toString("base64");
  return c;
}
function resign(c: R26Certificate) {
  c.manifest.digest = digest({
    r25Digest: c.r25.digest,
    candidateIds: c.candidates.map((x) => x.id),
    candidates: c.candidates,
  });
  c.manifest.candidateIds = c.candidates.map((x) => x.id);
  c.manifest.signature = sign(
    null,
    Buffer.from(canonicalSemanticJson(signableR26Manifest(c))),
    manifestKey.priv,
  ).toString("base64");
  c.validator.signature = sign(
    null,
    Buffer.from(canonicalSemanticJson(signableR26Certificate(c))),
    validatorKey.priv,
  ).toString("base64");
  return c;
}
test("accepts only a complete independently signed R25-bound replayable certificate", () => {
  expect(verifyR26ExternalCertificate(certificate(), trust, now)).toMatchObject(
    {
      status: "valid-complete-certificate",
      candidateCount: 2,
      paretoFront: ["faster"],
      recommendation: "faster",
    },
  );
});
test("rejects forged trust, incomplete manifests, validator collapse, approvals, expiry and heldout provenance", () => {
  const attacks = [
    () => {
      accepted = false;
    },
    () => {
      complete = false;
    },
    () => {
      heldout = false;
    },
  ];
  for (const attack of attacks) {
    const c = certificate();
    attack();
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
    accepted = complete = heldout = true;
  }
  const mutations = [
    (c: any) => (c.validator.signature = "forged"),
    (c: any) => {
      c.validator.validatorId = c.manifest.authorityId;
      c.validator.publicKeyPem = c.manifest.publicKeyPem;
    },
    (c: any) => c.approvals.pop(),
    (c: any) => (c.approvals[0].expiresAt = "2026-07-16T11:00:00Z"),
    (c: any) => (c.approvals[0].signature = "forged"),
    (c: any) => c.manifest.candidateIds.pop(),
  ];
  for (const mutate of mutations) {
    const c: any = certificate();
    mutate(c);
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  }
});
test("replays exact feasibility, violations, objectives, dominance and decision despite valid outer resigning", () => {
  const mutations = [
    (c: any) => {
      c.assessments[1].feasible = false;
      c.assessments[1].violations = [];
    },
    (c: any) => (c.assessments[1].violations = ["invented"]),
    (c: any) => (c.assessments[1].evaluation = null),
    (c: any) => (c.assessments[1].adjustedObjectives.quality = 999),
    (c: any) => (c.assessments[0].dominatedBy = []),
    (c: any) => (c.paretoFront = ["baseline"]),
    (c: any) => (c.recommendation = null),
    (c: any) => (c.outcome = "tradeoff"),
    (c: any) => (c.rationale = "trust me"),
  ];
  for (const mutate of mutations) {
    const c: any = certificate();
    mutate(c);
    resign(c);
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  }
});
test("rejects baseline substitution, invalid patches, unknown causality, empty safety prose and nonfinite or leaking backtests", () => {
  const mutations = [
    (c: any) => (c.baseline.state["organization.worker.capacity"] = 2),
    (c: any) => (c.candidates[1].patch.operations[0].from = 0),
    (c: any) =>
      (c.candidates[1].patch.operations[0].path = "constitution.authority"),
    (c: any) => (c.candidates[1].assumptions = []),
    (c: any) => (c.candidates[1].risks = []),
    (c: any) => (c.candidates[1].rollbackTrigger = ""),
    (c: any) =>
      (c.candidates[1].expectedEffects[0].provenance = "r25-prediction"),
    (c: any) => (c.assessments[1].evaluation.heldout.rows[0].lower = 2),
    (c: any) =>
      (c.assessments[1].evaluation.heldout.trainingDigest =
        c.assessments[1].evaluation.heldout.testDigest),
  ];
  for (const mutate of mutations) {
    const c: any = certificate();
    mutate(c);
    resign(c);
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  }
  const nonfinite: any = certificate();
  nonfinite.assessments[1].evaluation.cost = NaN;
  expect(() => verifyR26ExternalCertificate(nonfinite, trust, now)).toThrow();
  identified = false;
  const c = certificate();
  expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  identified = true;
});
test("rejects prediction promotion, assessment forgery, metric drift, chronology, vacuous bounds and patch conflicts", () => {
  const mutations = [
    (c: any) => {
      c.candidates[1].claim = "prediction";
      c.candidates[1].disposition = "actionable";
    },
    (c: any) => (c.assessments[1].evaluation.evidence.signature = "forged"),
    (c: any) =>
      (c.assessments[1].evaluation.evidence.resultDigest =
        digest("substitute")),
    (c: any) => (c.assessments[1].evaluation.metrics.quality.unit = "percent"),
    (c: any) => c.assessments[1].evaluation.heldout.rows.pop(),
    (c: any) => (c.assessments[1].evaluation.heldout.disjoint = false),
    (c: any) =>
      (c.assessments[1].evaluation.heldout.frozenAt = "2026-07-16T08:00:00Z"),
    (c: any) => (c.assessments[1].evaluation.proxy.metricCoverage = 1.1),
    (c: any) => (c.assessments[1].evaluation.cost = -1),
    (c: any) => (c.constraints.minimumMetricCoverage = 0),
    (c: any) => (c.candidates[1].expectedEffects[0].point = 0.9),
    (c: any) =>
      c.candidates[1].patch.operations.push({
        ...c.candidates[1].patch.operations[0],
        from: 2,
        to: 3,
      }),
  ];
  for (const mutate of mutations) {
    const c: any = certificate();
    mutate(c);
    resign(c);
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  }
});
test("rejects invented enums/effects, extreme proxy bounds, nested misses, result-state substitution and per-metric backtest failure", () => {
  const mutations = [
    (c: any) => (c.candidates[1].claim = "inferred"),
    (c: any) => (c.candidates[1].disposition = "recommended"),
    (c: any) => (c.objectives[0].direction = "sideways"),
    (c: any) => (c.extra = "schema-smuggling"),
    (c: any) => (c.candidates[1].patch.operations[0].kind = "routing"),
    (c: any) => {
      c.candidates[1].patch.operations[0].kind = "component";
      c.candidates[1].patch.operations[0].to = 2;
    },
    (c: any) => (c.assessments[1].evaluation.heldout.rows[0].predicted = 1e300),
    (c: any) => (c.constraints.maximumProxyGap = Number.MAX_SAFE_INTEGER),
    (c: any) =>
      (c.candidates[1].patch.operations[0].path =
        "organization.worker.missing"),
    (c: any) =>
      (c.assessments[1].evaluation.evidence.resultStateDigest =
        digest("other-state")),
    (c: any) =>
      (c.assessments[1].evaluation.heldout.rows.find(
        (r: any) => r.metric === "cost",
      ).actual = 100),
  ];
  for (const mutate of mutations) {
    const c: any = certificate();
    mutate(c);
    resign(c);
    expect(() => verifyR26ExternalCertificate(c, trust, now)).toThrow();
  }
  effectsTrusted = false;
  expect(() =>
    verifyR26ExternalCertificate(certificate(), trust, now),
  ).toThrow();
  effectsTrusted = true;
});
test("allows a sequential same-path transition only when each from matches prior state", () => {
  const c: any = certificate(),
    f = c.candidates[1];
  f.patch.operations.push({ ...f.patch.operations[0], from: 2, to: 3 });
  c.assessments[1].evaluation = evaluation("faster", f.patch, 0.8, 4);
  c.assessments[1].adjustedObjectives = {
    quality: 0.77,
    cost: 4.119999999999999,
  };
  resign(c);
  expect(verifyR26ExternalCertificate(c, trust, now).recommendation).toBe(
    "faster",
  );
  const bad: any = certificate();
  bad.candidates[1].patch.operations.push({
    ...bad.candidates[1].patch.operations[0],
    from: 1,
    to: 3,
  });
  resign(bad);
  expect(() => verifyR26ExternalCertificate(bad, trust, now)).toThrow();
});
test("retains a prediction-only experiment but excludes it from Pareto recommendation", () => {
  const c: any = certificate();
  c.candidates[1].claim = "prediction";
  c.candidates[1].disposition = "experiment-only";
  c.candidates[1].identificationId = "unknown-predictor";
  for (const e of c.candidates[1].expectedEffects)
    e.provenance = "r25-prediction";
  c.assessments[0].dominatedBy = [];
  c.assessments[1].dominatedBy = [];
  c.paretoFront = ["baseline"];
  c.recommendation = null;
  c.outcome = "tradeoff";
  c.rationale =
    "Pareto frontier has no unique dominating intervention; external decision required";
  resign(c);
  expect(verifyR26ExternalCertificate(c, trust, now)).toMatchObject({
    recommendation: null,
    paretoFront: ["baseline"],
  });
  expect(c.assessments[1].feasible).toBe(true);
});
