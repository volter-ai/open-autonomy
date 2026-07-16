import { createHash, createHmac, createPublicKey } from "node:crypto";
import { canonicalSemanticJson } from "@open-autonomy/core";

type D = `sha256:${string}`;
type Role =
  | "registrar"
  | "population"
  | "assignment"
  | "exposure"
  | "outcome"
  | "diagnostics"
  | "analyst"
  | "decision"
  | "rollback-worker"
  | "cleanup";
const h = (x: unknown): D =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`,
  dg = (x: unknown): x is D =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x),
  dt = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
function exact(x: object, keys: string[], name: string) {
  if (Object.keys(x).sort().join("\0") !== [...keys].sort().join("\0"))
    throw Error(`R27 ${name} schema invalid`);
}
export type R27Signed<T> = {
  body: T;
  digest: D;
  role: Role;
  keyId: string;
  signedAt: string;
  signature: string;
};
export type R27Dependency = {
  checkpoint: "R19" | "R21" | "R22" | "R23" | "R24" | "R25" | "R26";
  artifact: unknown;
  artifactDigest: D;
  verifierId: string;
  policyDigest: D;
  verifiedAt: string;
};
export type R27ExternalBundle = {
  schema: "open-autonomy.bench-r27-external-closure.v1";
  closureClaim: true;
  dependencies: R27Dependency[];
  registration: R27Signed<{
    experimentId: string;
    scopeId: string;
    mode:
      | "parallel-canary"
      | "shadow"
      | "replay"
      | "randomized"
      | "switchback"
      | "stepped-wedge";
    populationDigest: D;
    seedCommitment: D;
    unitIds: string[];
    treatmentCount: number;
    maximumTreatedUnits: number;
    safeArm: "control";
    treatmentArm: "treatment";
    treatment: { path: string; operation: string; boundary: "ordinary" };
    metric: {
      id: string;
      unit: string;
      direction: "increase" | "decrease";
      alpha: number;
      minimumEffect: number;
      minimumControl: number;
      minimumTreatment: number;
      randomizationMethod: "exact-enumeration";
      maximumAssignments: number;
    };
    guardrail: {
      metric: string;
      unit: string;
      statistic: "max" | "mean";
      operator: "gt" | "gte" | "lt" | "lte";
      threshold: number;
    };
    missing: {
      maximumFraction: 0;
      worstCaseControl: number;
      worstCaseTreatment: number;
    };
    exclusionReasons: string[];
    analysisCodeDigest: D;
    analysisEnvironmentDigest: D;
    authorizedAt: string;
  }>;
  population: R27Signed<{
    populationDigest: D;
    units: Array<{
      unitId: string;
      independenceKey: string;
      clusterId: string;
      provenanceDigest: D;
    }>;
  }>;
  seedReveal: string;
  assignments: Array<
    R27Signed<{
      experimentId: string;
      unitId: string;
      arm: "control" | "treatment";
      ordinal: number;
      score: D;
      populationDigest: D;
    }>
  >;
  exposures: Array<
    R27Signed<{
      experimentId: string;
      unitId: string;
      assignmentDigest: D;
      arm: "control" | "treatment";
      path: string;
      operation: string;
      requestDigest: D;
      readbackDigest: D;
      exposedAt: string;
    }>
  >;
  outcomes: Array<
    R27Signed<{
      experimentId: string;
      unitId: string;
      assignmentDigest: D;
      exposureDigest: D;
      metric: string;
      unit: string;
      value: number;
      observedAt: string;
      rawArtifact: unknown;
      rawDigest: D;
    }>
  >;
  missing: Array<
    R27Signed<{
      unitId: string;
      metric: string;
      reason: string;
      observedAt: string;
    }>
  >;
  exclusions: Array<
    R27Signed<{
      unitId: string;
      reason: string;
      decidedAt: string;
      evidenceDigest: D;
    }>
  >;
  analysisCode: {
    id: string;
    version: string;
    digest: D;
    environmentDigest: D;
  };
  diagnostics: R27Signed<{
    experimentId: string;
    selection: {
      eligible: number;
      observed: number;
      artifact: unknown;
      artifactDigest: D;
    };
    novelty: { status: "resolved"; artifact: unknown; artifactDigest: D };
    interference: { status: "resolved"; artifact: unknown; artifactDigest: D };
    carryover: { status: "resolved"; artifact: unknown; artifactDigest: D };
  }>;
  analysis: R27Signed<{
    metric: string;
    nControl: number;
    nTreatment: number;
    estimate: number;
    pValue: number;
    exactAssignments: number;
    interval: { low: number; high: number };
    missingFraction: number;
    worstCase: { low: number; high: number };
    diagnosticsDigest: D;
    assignmentDigests: D[];
    exposureDigests: D[];
    outcomeDigests: D[];
    codeDigest: D;
    environmentDigest: D;
  }>;
  decision: R27Signed<{
    state: "promoted" | "rolled-back";
    analysisDigest: D;
    guardrailBreached: boolean;
    reason: string;
    decidedAt: string;
  }>;
  rollback: null | {
    idempotencyKey: string;
    attempts: Array<
      R27Signed<{
        attempt: number;
        decisionDigest: D;
        idempotencyKey: string;
        status: "failed" | "succeeded";
        failureDigest: D | null;
        effectDigest: D | null;
        attemptedAt: string;
      }>
    >;
    effect: R27Signed<{
      decisionDigest: D;
      idempotencyKey: string;
      safeArm: "control";
      affectedUnitIds: string[];
      requestDigest: D;
      readbackArtifact: unknown;
      readbackDigest: D;
      completedAt: string;
    }>;
  };
  cleanup: R27Signed<{
    scopeId: string;
    status: "deleted" | "archived";
    readbackArtifact: unknown;
    readbackDigest: D;
    completedAt: string;
  }>;
  closedAt: string;
};
export type R27Trust = {
  publicKeys: Record<string, string>;
  roleKeys: Record<Role, string>;
  dependencyRegistry: Record<
    R27Dependency["checkpoint"],
    { artifactDigest: D; verifierId: string; policyDigest: D }
  >;
  verifySignature<T>(value: R27Signed<T>): boolean;
  verifyDependency(value: R27Dependency): boolean;
  verifyPopulationUnit(
    value: R27ExternalBundle["population"]["body"]["units"][number],
  ): boolean;
  verifyExposure(value: R27ExternalBundle["exposures"][number]): boolean;
  verifyOutcome(value: R27ExternalBundle["outcomes"][number]): boolean;
  verifyDiagnostics(value: R27ExternalBundle["diagnostics"]): boolean;
  verifyRollbackAttempt(
    value: NonNullable<R27ExternalBundle["rollback"]>["attempts"][number],
  ): boolean;
  verifyRollbackEffect(
    value: NonNullable<R27ExternalBundle["rollback"]>["effect"],
  ): boolean;
  verifyCleanup(value: R27ExternalBundle["cleanup"]): boolean;
  boundaryRegistry: Record<
    string,
    {
      operation: string;
      boundary: "ordinary" | "safety" | "security" | "authority" | "privacy";
    }
  >;
  metricRegistry: Record<string, { unit: string; minimumEffectFloor: number }>;
};
function signed<T>(x: R27Signed<T>, role: Role, trust: R27Trust) {
  exact(
    x,
    ["body", "digest", "role", "keyId", "signedAt", "signature"],
    `${role} signature`,
  );
  if (
    x.role !== role ||
    x.keyId !== trust.roleKeys[role] ||
    !dt(x.signedAt) ||
    x.digest !== h(x.body) ||
    !trust.publicKeys[x.keyId] ||
    !trust.verifySignature(x)
  )
    throw Error(`R27 ${role} signature invalid`);
}
function fp(pem: string) {
  return createHash("sha256")
    .update(createPublicKey(pem).export({ type: "spki", format: "der" }))
    .digest("hex");
}
const compare = (v: number, op: "gt" | "gte" | "lt" | "lte", t: number) =>
  op === "gt" ? v > t : op === "gte" ? v >= t : op === "lt" ? v < t : v <= t;
function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [x, ...rest] = xs;
  return [
    ...combinations(rest, k - 1).map((a) => [x!, ...a]),
    ...combinations(rest, k),
  ];
}
function combinationCount(n: number, k: number) {
  k = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= k; i++) {
    value = (value * (n - k + i)) / i;
    if (!Number.isSafeInteger(value))
      throw Error("R27 randomization space is not safely enumerable");
  }
  return value;
}
function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function analysis(
  values: Array<{
    unitId: string;
    arm: "control" | "treatment";
    value: number;
  }>,
  treatmentCount: number,
  alpha: number,
) {
  const control = values.filter((x) => x.arm === "control").map((x) => x.value),
    treatment = values.filter((x) => x.arm === "treatment").map((x) => x.value),
    estimate = mean(treatment) - mean(control),
    all = values.map((x) => x.value),
    assignments = combinations(
      values.map((_, i) => i),
      treatmentCount,
    ),
    nulls = assignments.map((ids) => {
      const set = new Set(ids),
        t = all.filter((_, i) => set.has(i)),
        c = all.filter((_, i) => !set.has(i));
      return mean(t) - mean(c);
    }),
    pValue =
      nulls.filter((x) => Math.abs(x) >= Math.abs(estimate) - 1e-12).length /
      nulls.length,
    sorted = [...nulls].sort((a, b) => a - b),
    lo = sorted[Math.floor((alpha / 2) * sorted.length)]!,
    hi =
      sorted[
        Math.min(
          sorted.length - 1,
          Math.ceil((1 - alpha / 2) * sorted.length) - 1,
        )
      ]!;
  return {
    estimate,
    pValue,
    exactAssignments: assignments.length,
    interval: { low: estimate - hi, high: estimate - lo },
  };
}
export function verifyR27ExternalClosure(
  b: R27ExternalBundle,
  trust: R27Trust,
) {
  exact(
    b,
    [
      "schema",
      "closureClaim",
      "dependencies",
      "registration",
      "population",
      "seedReveal",
      "assignments",
      "exposures",
      "outcomes",
      "missing",
      "exclusions",
      "analysisCode",
      "diagnostics",
      "analysis",
      "decision",
      "rollback",
      "cleanup",
      "closedAt",
    ],
    "bundle",
  );
  if (
    b.schema !== "open-autonomy.bench-r27-external-closure.v1" ||
    b.closureClaim !== true ||
    !dt(b.closedAt)
  )
    throw Error("R27 envelope invalid");
  const keys = Object.keys(trust.roleKeys) as Role[];
  if (
    keys.length !== 10 ||
    new Set(keys.map((x) => trust.roleKeys[x])).size !== keys.length ||
    new Set(keys.map((x) => fp(trust.publicKeys[trust.roleKeys[x]]!))).size !==
      keys.length
  )
    throw Error("R27 global role/key separation failed");
  signed(b.registration, "registrar", trust);
  signed(b.population, "population", trust);
  signed(b.analysis, "analyst", trust);
  signed(b.diagnostics, "diagnostics", trust);
  signed(b.decision, "decision", trust);
  signed(b.cleanup, "cleanup", trust);
  b.assignments.forEach((x) => signed(x, "assignment", trust));
  b.exposures.forEach((x) => signed(x, "exposure", trust));
  b.outcomes.forEach((x) => signed(x, "outcome", trust));
  b.missing.forEach((x) => signed(x, "outcome", trust));
  b.exclusions.forEach((x) => signed(x, "outcome", trust));
  const checkpoints = [
      "R19",
      "R21",
      "R22",
      "R23",
      "R24",
      "R25",
      "R26",
    ] as const,
    map = new Map(b.dependencies.map((x) => [x.checkpoint, x]));
  if (
    b.dependencies.length !== checkpoints.length ||
    map.size !== checkpoints.length
  )
    throw Error("R27 dependency matrix incomplete");
  for (const id of checkpoints) {
    const x = map.get(id)!,
      r = trust.dependencyRegistry[id];
    if (
      !x ||
      h(x.artifact) !== x.artifactDigest ||
      x.artifactDigest !== r.artifactDigest ||
      x.verifierId !== r.verifierId ||
      x.policyDigest !== r.policyDigest ||
      !dt(x.verifiedAt) ||
      Date.parse(x.verifiedAt) > Date.parse(b.registration.signedAt) ||
      !trust.verifyDependency(x)
    )
      throw Error("R27 dependency invalid");
  }
  const r = b.registration.body;
  if (r.mode !== "parallel-canary")
    throw Error(
      "R27 experiment mode explicitly unsupported for external closure",
    );
  exact(
    r,
    [
      "experimentId",
      "scopeId",
      "mode",
      "populationDigest",
      "seedCommitment",
      "unitIds",
      "treatmentCount",
      "maximumTreatedUnits",
      "safeArm",
      "treatmentArm",
      "treatment",
      "metric",
      "guardrail",
      "missing",
      "exclusionReasons",
      "analysisCodeDigest",
      "analysisEnvironmentDigest",
      "authorizedAt",
    ],
    "registration",
  );
  if (
    !r.experimentId ||
    !dt(r.authorizedAt) ||
    Date.parse(b.registration.signedAt) > Date.parse(r.authorizedAt) ||
    h(b.seedReveal) !== r.seedCommitment ||
    r.populationDigest !== b.population.body.populationDigest ||
    r.populationDigest !== h(b.population.body.units) ||
    new Set(r.unitIds).size !== r.unitIds.length ||
    canonicalSemanticJson([...r.unitIds].sort()) !==
      canonicalSemanticJson(
        b.population.body.units.map((x) => x.unitId).sort(),
      ) ||
    !Number.isSafeInteger(r.treatmentCount) ||
    !Number.isSafeInteger(r.maximumTreatedUnits) ||
    r.treatmentCount < 1 ||
    r.treatmentCount !== r.maximumTreatedUnits ||
    r.treatmentCount >= r.unitIds.length ||
    !Number.isFinite(r.metric.alpha) ||
    !Number.isFinite(r.metric.minimumEffect) ||
    !Number.isSafeInteger(r.metric.minimumControl) ||
    !Number.isSafeInteger(r.metric.minimumTreatment) ||
    !Number.isFinite(r.guardrail.threshold) ||
    !Number.isFinite(r.missing.worstCaseControl) ||
    !Number.isFinite(r.missing.worstCaseTreatment) ||
    r.guardrail.metric !== r.metric.id ||
    r.guardrail.unit !== r.metric.unit ||
    !["increase", "decrease"].includes(r.metric.direction) ||
    !["gt", "gte", "lt", "lte"].includes(r.guardrail.operator) ||
    !["max", "mean"].includes(r.guardrail.statistic) ||
    r.safeArm !== "control" ||
    r.treatmentArm !== "treatment" ||
    r.metric.alpha <= 0 ||
    r.metric.alpha > 0.05 ||
    r.metric.minimumControl < 2 ||
    r.metric.minimumTreatment < 2 ||
    r.missing.maximumFraction !== 0
  )
    throw Error("R27 preregistration invalid");
  exact(r.treatment, ["path", "operation", "boundary"], "treatment");
  exact(
    r.metric,
    [
      "id",
      "unit",
      "direction",
      "alpha",
      "minimumEffect",
      "minimumControl",
      "minimumTreatment",
      "randomizationMethod",
      "maximumAssignments",
    ],
    "metric",
  );
  exact(
    r.guardrail,
    ["metric", "unit", "statistic", "operator", "threshold"],
    "guardrail",
  );
  const assignmentSpace = combinationCount(r.unitIds.length, r.treatmentCount);
  if (
    r.metric.randomizationMethod !== "exact-enumeration" ||
    !Number.isSafeInteger(r.metric.maximumAssignments) ||
    r.metric.maximumAssignments < assignmentSpace ||
    r.metric.maximumAssignments > 100_000
  )
    throw Error("R27 randomization method bound invalid");
  exact(
    r.missing,
    ["maximumFraction", "worstCaseControl", "worstCaseTreatment"],
    "missingness",
  );
  exact(b.population.body, ["populationDigest", "units"], "population");
  b.population.body.units.forEach((x) =>
    exact(
      x,
      ["unitId", "independenceKey", "clusterId", "provenanceDigest"],
      "population unit",
    ),
  );
  const boundary = trust.boundaryRegistry[r.treatment.path],
    metric = trust.metricRegistry[r.metric.id];
  if (
    !boundary ||
    boundary.operation !== r.treatment.operation ||
    boundary.boundary !== "ordinary" ||
    r.treatment.boundary !== boundary.boundary ||
    !metric ||
    metric.unit !== r.metric.unit ||
    r.metric.minimumEffect < metric.minimumEffectFloor
  )
    throw Error("R27 authoritative registry violation");
  if (
    new Set(b.population.body.units.map((x) => x.independenceKey)).size !==
      r.unitIds.length ||
    new Set(b.population.body.units.map((x) => x.clusterId)).size !==
      r.unitIds.length ||
    b.population.body.units.some(
      (x) =>
        !x.unitId || !dg(x.provenanceDigest) || !trust.verifyPopulationUnit(x),
    )
  )
    throw Error("R27 population independence invalid");
  const ranked = b.population.body.units
      .map((x) => ({
        unitId: x.unitId,
        score: h(
          createHmac("sha256", b.seedReveal)
            .update(`${r.experimentId}\0${x.unitId}`)
            .digest("hex"),
        ),
      }))
      .sort((a, c) => a.score.localeCompare(c.score)),
    expected = ranked.map((x, i) => ({
      ...x,
      arm: (i < r.treatmentCount ? "treatment" : "control") as
        "treatment" | "control",
      ordinal: i + 1,
    })),
    assign = new Map(b.assignments.map((x) => [x.body.unitId, x]));
  if (
    b.assignments.length !== r.unitIds.length ||
    assign.size !== r.unitIds.length ||
    expected.some((x) => {
      const a = assign.get(x.unitId);
      return (
        !a ||
        a.body.experimentId !== r.experimentId ||
        a.body.arm !== x.arm ||
        a.body.ordinal !== x.ordinal ||
        a.body.score !== x.score ||
        a.body.populationDigest !== r.populationDigest ||
        Date.parse(a.signedAt) <= Date.parse(b.population.signedAt)
      );
    })
  )
    throw Error("R27 seeded assignment replay failed");
  const exposure = new Map(b.exposures.map((x) => [x.body.unitId, x]));
  if (
    b.exposures.length !== r.unitIds.length ||
    exposure.size !== r.unitIds.length ||
    [...assign].some(([id, a]) => {
      const x = exposure.get(id);
      return (
        !x ||
        x.body.experimentId !== r.experimentId ||
        x.body.assignmentDigest !== a.digest ||
        x.body.arm !== a.body.arm ||
        x.body.path !== r.treatment.path ||
        x.body.operation !== r.treatment.operation ||
        !dt(x.body.exposedAt) ||
        Date.parse(x.signedAt) <= Date.parse(a.signedAt) ||
        Date.parse(x.body.exposedAt) > Date.parse(x.signedAt) ||
        !dg(x.body.requestDigest) ||
        !dg(x.body.readbackDigest) ||
        !trust.verifyExposure(x)
      );
    })
  )
    throw Error("R27 exposure matrix invalid");
  b.assignments.forEach((x) =>
    exact(
      x.body,
      ["experimentId", "unitId", "arm", "ordinal", "score", "populationDigest"],
      "assignment",
    ),
  );
  b.exposures.forEach((x) =>
    exact(
      x.body,
      [
        "experimentId",
        "unitId",
        "assignmentDigest",
        "arm",
        "path",
        "operation",
        "requestDigest",
        "readbackDigest",
        "exposedAt",
      ],
      "exposure",
    ),
  );
  if (
    b.exposures.filter((x) => x.body.arm === "treatment").length >
    r.maximumTreatedUnits
  )
    throw Error("R27 global treatment cap exceeded");
  if (b.missing.length || b.exclusions.length)
    throw Error(
      "R27 complete externally verified outcomes required for closure",
    );
  const outcomes = new Map(b.outcomes.map((x) => [x.body.unitId, x]));
  if (
    b.outcomes.length !== r.unitIds.length ||
    outcomes.size !== r.unitIds.length ||
    [...assign].some(([id, a]) => {
      const o = outcomes.get(id),
        e = exposure.get(id);
      return (
        !o ||
        !e ||
        o.body.experimentId !== r.experimentId ||
        o.body.assignmentDigest !== a.digest ||
        o.body.exposureDigest !== e.digest ||
        o.body.metric !== r.metric.id ||
        o.body.unit !== r.metric.unit ||
        !Number.isFinite(o.body.value) ||
        !dt(o.body.observedAt) ||
        Date.parse(o.signedAt) <= Date.parse(e.signedAt) ||
        Date.parse(o.body.observedAt) > Date.parse(o.signedAt) ||
        h(o.body.rawArtifact) !== o.body.rawDigest ||
        !trust.verifyOutcome(o)
      );
    })
  )
    throw Error("R27 outcome matrix invalid");
  b.outcomes.forEach((x) =>
    exact(
      x.body,
      [
        "experimentId",
        "unitId",
        "assignmentDigest",
        "exposureDigest",
        "metric",
        "unit",
        "value",
        "observedAt",
        "rawArtifact",
        "rawDigest",
      ],
      "outcome",
    ),
  );
  if (
    b.analysisCode.digest !== r.analysisCodeDigest ||
    b.analysisCode.environmentDigest !== r.analysisEnvironmentDigest ||
    !b.analysisCode.id ||
    !b.analysisCode.version
  )
    throw Error("R27 analysis environment invalid");
  const diagnostic = b.diagnostics.body;
  exact(
    diagnostic,
    ["experimentId", "selection", "novelty", "interference", "carryover"],
    "diagnostic evidence",
  );
  for (const key of ["novelty", "interference", "carryover"] as const) {
    const x = diagnostic[key];
    exact(x, ["status", "artifact", "artifactDigest"], `${key} diagnostic`);
    if (x.status !== "resolved" || h(x.artifact) !== x.artifactDigest)
      throw Error("R27 unresolved diagnostic evidence");
  }
  exact(
    diagnostic.selection,
    ["eligible", "observed", "artifact", "artifactDigest"],
    "selection diagnostic",
  );
  if (
    diagnostic.experimentId !== r.experimentId ||
    diagnostic.selection.eligible !== r.unitIds.length ||
    diagnostic.selection.observed !== b.outcomes.length ||
    h(diagnostic.selection.artifact) !== diagnostic.selection.artifactDigest ||
    !trust.verifyDiagnostics(b.diagnostics) ||
    Date.parse(b.diagnostics.signedAt) <=
      Math.max(...b.outcomes.map((x) => Date.parse(x.signedAt)))
  )
    throw Error("R27 diagnostic evidence invalid");
  const rows = [...outcomes].map(([id, o]) => ({
      unitId: id,
      arm: assign.get(id)!.body.arm,
      value: o.body.value,
    })),
    computed = analysis(rows, r.treatmentCount, r.metric.alpha),
    a = b.analysis.body;
  exact(
    a,
    [
      "metric",
      "nControl",
      "nTreatment",
      "estimate",
      "pValue",
      "exactAssignments",
      "interval",
      "missingFraction",
      "worstCase",
      "diagnosticsDigest",
      "assignmentDigests",
      "exposureDigests",
      "outcomeDigests",
      "codeDigest",
      "environmentDigest",
    ],
    "analysis",
  );
  exact(a.interval, ["low", "high"], "analysis interval");
  exact(a.worstCase, ["low", "high"], "worst case");
  if (
    a.metric !== r.metric.id ||
    a.nControl !== rows.filter((x) => x.arm === "control").length ||
    a.nTreatment !== rows.filter((x) => x.arm === "treatment").length ||
    a.nControl < r.metric.minimumControl ||
    a.nTreatment < r.metric.minimumTreatment ||
    a.estimate !== computed.estimate ||
    a.pValue !== computed.pValue ||
    a.exactAssignments !== computed.exactAssignments ||
    canonicalSemanticJson(a.interval) !==
      canonicalSemanticJson(computed.interval) ||
    a.missingFraction !== 0 ||
    a.worstCase.low !== a.estimate ||
    a.worstCase.high !== a.estimate ||
    a.diagnosticsDigest !== b.diagnostics.digest ||
    canonicalSemanticJson(a.assignmentDigests) !==
      canonicalSemanticJson(b.assignments.map((x) => x.digest)) ||
    canonicalSemanticJson(a.exposureDigests) !==
      canonicalSemanticJson(b.exposures.map((x) => x.digest)) ||
    canonicalSemanticJson(a.outcomeDigests) !==
      canonicalSemanticJson(b.outcomes.map((x) => x.digest)) ||
    a.codeDigest !== r.analysisCodeDigest ||
    a.environmentDigest !== r.analysisEnvironmentDigest ||
    Date.parse(b.analysis.signedAt) <= Date.parse(b.diagnostics.signedAt)
  )
    throw Error("R27 causal analysis replay failed");
  const guardrailValues = b.outcomes
    .filter((x) => x.body.metric === r.guardrail.metric)
    .map((x) => x.body.value);
  if (guardrailValues.length !== r.unitIds.length)
    throw Error("R27 guardrail matrix incomplete");
  const statistic =
      r.guardrail.statistic === "max"
        ? Math.max(...guardrailValues)
        : mean(guardrailValues),
    breached = compare(statistic, r.guardrail.operator, r.guardrail.threshold),
    d = b.decision.body;
  exact(
    d,
    ["state", "analysisDigest", "guardrailBreached", "reason", "decidedAt"],
    "decision",
  );
  if (
    d.analysisDigest !== b.analysis.digest ||
    !["promoted", "rolled-back"].includes(d.state) ||
    d.guardrailBreached !== breached ||
    !dt(d.decidedAt) ||
    Date.parse(b.decision.signedAt) <= Date.parse(b.analysis.signedAt) ||
    Date.parse(d.decidedAt) > Date.parse(b.decision.signedAt) ||
    !d.reason
  )
    throw Error("R27 decision invalid");
  if (
    d.state === "promoted" &&
    (breached ||
      a.pValue > r.metric.alpha ||
      (r.metric.direction === "increase"
        ? a.estimate < r.metric.minimumEffect
        : -a.estimate < r.metric.minimumEffect))
  )
    throw Error("R27 unsafe promotion forbidden");
  if (d.state === "rolled-back") {
    const rb = b.rollback;
    if (!rb || !rb.idempotencyKey || !rb.attempts.length)
      throw Error("R27 durable rollback missing");
    rb.attempts.forEach((x) => {
      signed(x, "rollback-worker", trust);
      exact(
        x.body,
        [
          "attempt",
          "decisionDigest",
          "idempotencyKey",
          "status",
          "failureDigest",
          "effectDigest",
          "attemptedAt",
        ],
        "rollback attempt",
      );
      if (
        x.body.decisionDigest !== b.decision.digest ||
        x.body.idempotencyKey !== rb.idempotencyKey ||
        !Number.isSafeInteger(x.body.attempt) ||
        x.body.attempt < 1 ||
        !dt(x.body.attemptedAt) ||
        Date.parse(x.body.attemptedAt) > Date.parse(x.signedAt) ||
        Date.parse(x.signedAt) <= Date.parse(b.decision.signedAt) ||
        !trust.verifyRollbackAttempt(x)
      )
        throw Error("R27 rollback attempt invalid");
    });
    const sorted = [...rb.attempts].sort(
      (x, y) => x.body.attempt - y.body.attempt,
    );
    if (
      new Set(sorted.map((x) => x.body.attempt)).size !== sorted.length ||
      sorted.some((x, i) => x.body.attempt !== i + 1) ||
      sorted.some(
        (x, i) =>
          i > 0 &&
          Date.parse(x.body.attemptedAt) <=
            Date.parse(sorted[i - 1]!.body.attemptedAt),
      ) ||
      sorted.at(-1)!.body.status !== "succeeded" ||
      sorted
        .slice(0, -1)
        .some(
          (x) =>
            x.body.status !== "failed" ||
            !x.body.failureDigest ||
            x.body.effectDigest !== null,
        ) ||
      sorted.at(-1)!.body.failureDigest !== null ||
      sorted.at(-1)!.body.effectDigest !== rb.effect.digest
    )
      throw Error("R27 crash/retry rollback chain invalid");
    signed(rb.effect, "rollback-worker", trust);
    exact(
      rb.effect.body,
      [
        "decisionDigest",
        "idempotencyKey",
        "safeArm",
        "affectedUnitIds",
        "requestDigest",
        "readbackArtifact",
        "readbackDigest",
        "completedAt",
      ],
      "rollback effect",
    );
    if (
      rb.effect.body.decisionDigest !== b.decision.digest ||
      rb.effect.body.idempotencyKey !== rb.idempotencyKey ||
      rb.effect.body.safeArm !== "control" ||
      canonicalSemanticJson(rb.effect.body.affectedUnitIds.sort()) !==
        canonicalSemanticJson(
          b.exposures
            .filter((x) => x.body.arm === "treatment")
            .map((x) => x.body.unitId)
            .sort(),
        ) ||
      h(rb.effect.body.readbackArtifact) !== rb.effect.body.readbackDigest ||
      !dt(rb.effect.body.completedAt) ||
      Date.parse(rb.effect.body.completedAt) > Date.parse(rb.effect.signedAt) ||
      Date.parse(rb.effect.signedAt) <= Date.parse(b.decision.signedAt) ||
      Date.parse(rb.effect.signedAt) >=
        Date.parse(sorted.at(-1)!.body.attemptedAt) ||
      Date.parse(rb.effect.signedAt) >= Date.parse(sorted.at(-1)!.signedAt) ||
      !trust.verifyRollbackEffect(rb.effect)
    )
      throw Error("R27 rollback effect invalid");
  } else if (b.rollback !== null) throw Error("R27 surplus rollback invalid");
  exact(
    b.cleanup.body,
    ["scopeId", "status", "readbackArtifact", "readbackDigest", "completedAt"],
    "cleanup",
  );
  if (
    h(b.cleanup.body.readbackArtifact) !== b.cleanup.body.readbackDigest ||
    !trust.verifyCleanup(b.cleanup) ||
    !dt(b.cleanup.body.completedAt) ||
    Date.parse(b.cleanup.body.completedAt) > Date.parse(b.cleanup.signedAt) ||
    b.cleanup.body.scopeId !== r.scopeId ||
    Date.parse(b.cleanup.signedAt) <=
      (b.rollback
        ? Math.max(
            Date.parse(b.rollback.effect.signedAt),
            ...b.rollback.attempts.map((x) => Date.parse(x.signedAt)),
          )
        : Date.parse(b.decision.signedAt)) ||
    Date.parse(b.closedAt) < Date.parse(b.cleanup.signedAt)
  )
    throw Error("R27 cleanup invalid");
  return {
    closed: true as const,
    state: d.state,
    estimate: a.estimate,
    pValue: a.pValue,
    units: r.unitIds.length,
  };
}
