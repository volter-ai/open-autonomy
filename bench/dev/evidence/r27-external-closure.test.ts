import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalSemanticJson } from "@open-autonomy/core";
import {
  verifyR27ExternalClosure,
  type R27ExternalBundle,
  type R27Signed,
  type R27Trust,
} from "./r27-external-closure";
const h = (x: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const,
  roles = [
    "registrar",
    "population",
    "assignment",
    "exposure",
    "outcome",
    "diagnostics",
    "analyst",
    "decision",
    "rollback-worker",
    "cleanup",
  ] as const;
function fixture() {
  const keys = Object.fromEntries(
      roles.map((role) => {
        const k = generateKeyPairSync("ed25519");
        return [
          role,
          k.publicKey.export({ type: "spki", format: "pem" }).toString(),
        ];
      }),
    ),
    roleKeys = Object.fromEntries(roles.map((x) => [x, x])) as any,
    seal = <T>(
      role: (typeof roles)[number],
      body: T,
      signedAt: string,
    ): R27Signed<T> => ({
      body,
      digest: h(body),
      role,
      keyId: role,
      signedAt,
      signature: "externally-verified",
    }),
    seed = "externally-revealed-seed",
    units = Array.from({ length: 4 }, (_, i) => ({
      unitId: `u${i}`,
      independenceKey: `ind-${i}`,
      clusterId: `cluster-${i}`,
      provenanceDigest: h({ unit: i }),
    })),
    populationBody = { populationDigest: h(units), units },
    population = seal("population", populationBody, "2026-07-15T00:01:00Z"),
    regBody = {
      experimentId: "exp",
      scopeId: "scope",
      mode: "parallel-canary" as const,
      populationDigest: populationBody.populationDigest,
      seedCommitment: h(seed),
      unitIds: units.map((x) => x.unitId),
      treatmentCount: 2,
      maximumTreatedUnits: 2,
      safeArm: "control" as const,
      treatmentArm: "treatment" as const,
      treatment: {
        path: "work.priority",
        operation: "set-critical",
        boundary: "ordinary" as const,
      },
      metric: {
        id: "quality",
        unit: "score",
        direction: "increase" as const,
        alpha: 0.05,
        minimumEffect: 1,
        minimumControl: 2,
        minimumTreatment: 2,
        randomizationMethod: "exact-enumeration" as const,
        maximumAssignments: 100,
      },
      guardrail: {
        metric: "quality",
        unit: "score",
        statistic: "max" as const,
        operator: "gt" as const,
        threshold: -1,
      },
      missing: {
        maximumFraction: 0 as const,
        worstCaseControl: 0,
        worstCaseTreatment: 0,
      },
      exclusionReasons: [],
      analysisCodeDigest: h("analysis-code"),
      analysisEnvironmentDigest: h("analysis-env"),
      authorizedAt: "2026-07-15T00:00:30Z",
    },
    registration = seal("registrar", regBody, "2026-07-15T00:00:00Z"),
    ranked = units
      .map((x) => ({
        unitId: x.unitId,
        score: h(
          createHmac("sha256", seed).update(`exp\0${x.unitId}`).digest("hex"),
        ),
      }))
      .sort((a, b) => a.score.localeCompare(b.score)),
    assignments = ranked.map((x, i) =>
      seal(
        "assignment",
        {
          experimentId: "exp",
          unitId: x.unitId,
          arm: (i < 2 ? "treatment" : "control") as "treatment" | "control",
          ordinal: i + 1,
          score: x.score,
          populationDigest: populationBody.populationDigest,
        },
        "2026-07-15T00:02:00Z",
      ),
    ),
    exposures = assignments.map((a) =>
      seal(
        "exposure",
        {
          experimentId: "exp",
          unitId: a.body.unitId,
          assignmentDigest: a.digest,
          arm: a.body.arm,
          path: "work.priority",
          operation: "set-critical",
          requestDigest: h({ unit: a.body.unitId }),
          readbackDigest: h({ exposed: a.body.unitId }),
          exposedAt: "2026-07-15T00:02:30Z",
        },
        "2026-07-15T00:03:00Z",
      ),
    ),
    outcomes = assignments.map((a, i) => {
      const rawArtifact = {
        unit: a.body.unitId,
        value: a.body.arm === "treatment" ? 10 : 0,
      };
      return seal(
        "outcome",
        {
          experimentId: "exp",
          unitId: a.body.unitId,
          assignmentDigest: a.digest,
          exposureDigest: exposures[i]!.digest,
          metric: "quality",
          unit: "score",
          value: rawArtifact.value,
          observedAt: "2026-07-15T00:04:30Z",
          rawArtifact,
          rawDigest: h(rawArtifact),
        },
        "2026-07-15T00:05:00Z",
      );
    }),
    diagnosticPart = (status: "resolved") => {
      const artifact = { status, source: "external" };
      return { status, artifact, artifactDigest: h(artifact) };
    },
    selectionArtifact = { eligible: 4, observed: 4 },
    diagnostics = seal(
      "diagnostics",
      {
        experimentId: "exp",
        selection: {
          eligible: 4,
          observed: 4,
          artifact: selectionArtifact,
          artifactDigest: h(selectionArtifact),
        },
        novelty: diagnosticPart("resolved"),
        interference: diagnosticPart("resolved"),
        carryover: diagnosticPart("resolved"),
      },
      "2026-07-15T00:05:30Z",
    ),
    analysisBody = {
      metric: "quality",
      nControl: 2,
      nTreatment: 2,
      estimate: 10,
      pValue: 1 / 3,
      exactAssignments: 6,
      interval: { low: 0, high: 20 },
      missingFraction: 0,
      worstCase: { low: 10, high: 10 },
      diagnosticsDigest: diagnostics.digest,
      assignmentDigests: assignments.map((x) => x.digest),
      exposureDigests: exposures.map((x) => x.digest),
      outcomeDigests: outcomes.map((x) => x.digest),
      codeDigest: regBody.analysisCodeDigest,
      environmentDigest: regBody.analysisEnvironmentDigest,
    },
    analysis = seal("analyst", analysisBody, "2026-07-15T00:06:00Z"),
    decision = seal(
      "decision",
      {
        state: "rolled-back" as const,
        analysisDigest: analysis.digest,
        guardrailBreached: true,
        reason: "guardrail",
        decidedAt: "2026-07-15T00:06:30Z",
      },
      "2026-07-15T00:07:00Z",
    ),
    readbackArtifact = { safe: true },
    effect = seal(
      "rollback-worker",
      {
        decisionDigest: decision.digest,
        idempotencyKey: "rollback-exp",
        safeArm: "control" as const,
        affectedUnitIds: assignments
          .filter((x) => x.body.arm === "treatment")
          .map((x) => x.body.unitId),
        requestDigest: h("rollback"),
        readbackArtifact,
        readbackDigest: h(readbackArtifact),
        completedAt: "2026-07-15T00:08:20Z",
      },
      "2026-07-15T00:08:30Z",
    ),
    attempts = [
      seal(
        "rollback-worker",
        {
          attempt: 1,
          decisionDigest: decision.digest,
          idempotencyKey: "rollback-exp",
          status: "failed" as const,
          failureDigest: h("crash"),
          effectDigest: null,
          attemptedAt: "2026-07-15T00:08:00Z",
        },
        "2026-07-15T00:08:00Z",
      ),
      seal(
        "rollback-worker",
        {
          attempt: 2,
          decisionDigest: decision.digest,
          idempotencyKey: "rollback-exp",
          status: "succeeded" as const,
          failureDigest: null,
          effectDigest: effect.digest,
          attemptedAt: "2026-07-15T00:09:00Z",
        },
        "2026-07-15T00:09:30Z",
      ),
    ],
    cleanupArtifact = { archived: true },
    cleanup = seal(
      "cleanup",
      {
        scopeId: "scope",
        status: "archived" as const,
        readbackArtifact: cleanupArtifact,
        readbackDigest: h(cleanupArtifact),
        completedAt: "2026-07-15T00:09:45Z",
      },
      "2026-07-15T00:10:00Z",
    ),
    checkpoints = ["R19", "R21", "R22", "R23", "R24", "R25", "R26"] as const,
    dependencies = checkpoints.map((checkpoint) => {
      const artifact = { checkpoint, closed: true };
      return {
        checkpoint,
        artifact,
        artifactDigest: h(artifact),
        verifierId: `verify-${checkpoint}`,
        policyDigest: h(`policy-${checkpoint}`),
        verifiedAt: "2026-07-14T00:00:00Z",
      };
    }),
    dependencyRegistry = Object.fromEntries(
      dependencies.map((x) => [
        x.checkpoint,
        {
          artifactDigest: x.artifactDigest,
          verifierId: x.verifierId,
          policyDigest: x.policyDigest,
        },
      ]),
    ) as any,
    bundle: R27ExternalBundle = {
      schema: "open-autonomy.bench-r27-external-closure.v1",
      closureClaim: true,
      dependencies,
      registration,
      population,
      seedReveal: seed,
      assignments,
      exposures,
      outcomes,
      missing: [],
      exclusions: [],
      analysisCode: {
        id: "exact-randomization",
        version: "1",
        digest: regBody.analysisCodeDigest,
        environmentDigest: regBody.analysisEnvironmentDigest,
      },
      diagnostics,
      analysis,
      decision,
      rollback: { idempotencyKey: "rollback-exp", attempts, effect },
      cleanup,
      closedAt: "2026-07-15T00:11:00Z",
    },
    trust: R27Trust = {
      publicKeys: keys,
      roleKeys,
      dependencyRegistry,
      verifySignature: () => true,
      verifyDependency: () => true,
      verifyPopulationUnit: () => true,
      verifyExposure: () => true,
      verifyOutcome: () => true,
      verifyDiagnostics: () => true,
      verifyRollbackAttempt: () => true,
      verifyRollbackEffect: () => true,
      verifyCleanup: () => true,
      boundaryRegistry: {
        "work.priority": { operation: "set-critical", boundary: "ordinary" },
      },
      metricRegistry: { quality: { unit: "score", minimumEffectFloor: 1 } },
    };
  return { bundle, trust, seal };
}
describe("R27 external experiment closure", () => {
  test("replays a complete external parallel canary with exact inference and durable retry rollback", () => {
    const { bundle, trust } = fixture();
    expect(verifyR27ExternalClosure(bundle, trust)).toEqual({
      closed: true,
      state: "rolled-back",
      estimate: 10,
      pValue: 1 / 3,
      units: 4,
    });
  });
  test("rejects unsupported experiment modes instead of treating schedules as causal designs", () => {
    const { bundle, trust } = fixture();
    bundle.registration.body.mode = "switchback";
    bundle.registration.digest = h(bundle.registration.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(
      /unsupported/,
    );
  });
  test("rejects a resealed manual assignment inconsistent with committed randomization", () => {
    const { bundle, trust } = fixture();
    bundle.assignments[0]!.body.arm = "control";
    bundle.assignments[0]!.digest = h(bundle.assignments[0]!.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/assignment/);
  });
  test("rejects a resealed analysis inconsistent with raw outcomes", () => {
    const { bundle, trust } = fixture();
    bundle.analysis.body.estimate = 999;
    bundle.analysis.digest = h(bundle.analysis.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/analysis/);
  });
  test("rejects rollback retry equivocation", () => {
    const { bundle, trust } = fixture();
    bundle.rollback!.attempts[1]!.body.idempotencyKey = "different";
    bundle.rollback!.attempts[1]!.digest = h(
      bundle.rollback!.attempts[1]!.body,
    );
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(
      /rollback attempt/,
    );
  });
  test("rejects role aliases even when key IDs differ", () => {
    const { bundle, trust } = fixture();
    trust.publicKeys["population"] = trust.publicKeys["registrar"]!;
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/separation/);
  });
  test("rejects a duplicate dependency checkpoint", () => {
    const { bundle, trust } = fixture();
    bundle.dependencies.push(structuredClone(bundle.dependencies[0]!));
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(
      /dependency matrix/,
    );
  });
  test("rejects duplicate assignments hidden behind array cardinality", () => {
    const { bundle, trust } = fixture();
    bundle.assignments[3] = structuredClone(bundle.assignments[0]!);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/assignment/);
  });
  test("rejects an outcome joined to another experiment", () => {
    const { bundle, trust } = fixture();
    bundle.outcomes[0]!.body.experimentId = "other";
    bundle.outcomes[0]!.digest = h(bundle.outcomes[0]!.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/outcome/);
  });
  test("rejects unresolved signed diagnostic evidence", () => {
    const { bundle, trust } = fixture();
    (bundle.diagnostics.body.novelty.status as string) = "unknown";
    bundle.diagnostics.digest = h(bundle.diagnostics.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/diagnostic/);
  });
  test("rejects an underbounded exact randomization space", () => {
    const { bundle, trust } = fixture();
    bundle.registration.body.metric.maximumAssignments = 5;
    bundle.registration.digest = h(bundle.registration.body);
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(
      /randomization method/,
    );
  });
  test("rejects assignment chronology that does not follow population freeze", () => {
    const { bundle, trust } = fixture();
    bundle.assignments[0]!.signedAt = bundle.population.signedAt;
    expect(() => verifyR27ExternalClosure(bundle, trust)).toThrow(/assignment/);
  });
});
