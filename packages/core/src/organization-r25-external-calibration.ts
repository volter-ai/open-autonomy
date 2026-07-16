import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  simulateTwin,
  twinDigest,
  type SimulatedArrival,
  type TwinSimulationResult,
  type TwinSpecification,
} from "./organization-twin";

type Digest = `sha256:${string}`;
type Status =
  "structurally-valid" | "externally-uncalibrated" | "calibrated" | "falsified";
type Metric =
  | "throughput"
  | "meanLatencyMs"
  | "cost"
  | "quality"
  | "humanMinutes"
  | "completed"
  | "failed"
  | "blocked";
const metricPolicy: Record<
  Metric,
  { unit: string; maximumMaeCeiling: number }
> = {
  throughput: { unit: "work/s", maximumMaeCeiling: 100 },
  meanLatencyMs: { unit: "ms", maximumMaeCeiling: 60_000 },
  cost: { unit: "usd", maximumMaeCeiling: 1_000 },
  quality: { unit: "ratio", maximumMaeCeiling: 0.2 },
  humanMinutes: { unit: "min", maximumMaeCeiling: 60 },
  completed: { unit: "count", maximumMaeCeiling: 100 },
  failed: { unit: "count", maximumMaeCeiling: 100 },
  blocked: { unit: "count", maximumMaeCeiling: 100 },
};
const metrics: Metric[] = [
  "throughput",
  "meanLatencyMs",
  "cost",
  "quality",
  "humanMinutes",
  "completed",
  "failed",
  "blocked",
];
const hash = (x: unknown): Digest =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`,
  date = (x: unknown) =>
    typeof x === "string" && Number.isFinite(Date.parse(x)),
  digest = (x: unknown): x is Digest =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x),
  exact = (x: object, keys: string[], name: string) => {
    if (Object.keys(x).sort().join("\0") !== [...keys].sort().join("\0"))
      throw Error(`R25 ${name} schema invalid`);
  };

export type R25Signed<T> = {
  body: T;
  digest: Digest;
  keyId: string;
  signedAt: string;
  signature: string;
};
export type R25Source = {
  id: string;
  split: "train" | "held-out";
  observedAt: string;
  artifact: unknown;
  artifactDigest: Digest;
  contaminationGroup: string;
  contaminationDigest: Digest;
  populationId: string | null;
  populationProvenanceDigest: Digest;
};
export type R25Case = {
  id: string;
  sourceId: string;
  workloadId: string;
  providerId: string;
  populationId: string;
  repetition: number;
  independenceKey: string;
  drawDigest: Digest;
  horizonMs: number;
  seed: number;
  arrivals: SimulatedArrival[];
};
export type R25ParameterLedger = {
  path: string;
  value: number;
  source: "observed" | "estimated" | "assumed";
  sourceIds: string[];
  standardError: number | null;
  identifiable: boolean;
  confoundedWith: string[];
  residual: string | null;
};
export type R25Prediction = R25Signed<{
  caseId: string;
  specificationDigest: Digest;
  result: Record<
    Metric,
    {
      point: number;
      interval90: [number, number];
      unit: string;
      method: "leave-one-out-seed-quantile-90";
    }
  >;
  traceDigest: Digest;
}>;
export type R25Outcome = {
  caseId: string;
  observedAt: string;
  result: Record<Metric, number>;
  trace: unknown;
  traceDigest: Digest;
};
export type R25Calibration = {
  schema: "autonomy.r25-external-calibration.v1";
  closureClaim: boolean;
  status: Status;
  dependencies: Record<"R19" | "R23" | "R24", unknown>;
  preregistration: R25Signed<{
    specificationDigest: Digest;
    dependencyDigests: Record<"R19" | "R23" | "R24", Digest>;
    trainSourceIds: string[];
    heldOutSourceIds: string[];
    workloads: string[];
    providers: string[];
    horizonsMs: number[];
    metrics: Array<{
      metric: Metric;
      unit: string;
      minimumCoverage90: number;
      maximumMeanAbsoluteError: number;
    }>;
    minimumPopulations: number;
    repetitionsPerCell: number;
    caseManifestDigest: Digest;
    maximumRecoveryRelativeError: number;
    authorizedBefore: string;
  }>;
  specification: TwinSpecification;
  sources: R25Source[];
  cases: R25Case[];
  parameterLedger: R25ParameterLedger[];
  predictions: R25Prediction[];
  outcomes: R25Outcome[];
  sensitivity: R25Signed<{
    rows: Array<{
      parameterPath: string;
      perturbedValue: number;
      caseId: string;
      replayDigest: Digest;
      changedMetrics: Metric[];
      connected: boolean;
      residual: string | null;
      recovery: null | {
        truthValue: number;
        estimatorId: string;
        estimatorVersion: string;
        dataset: unknown;
        datasetDigest: Digest;
        output: number;
      };
    }>;
    parameterOrder: string[];
    matrix: number[][];
    rank: number;
    equivalenceClasses: string[][];
  }>;
  ablations: Array<{
    nodeId: string;
    caseId: string;
    replayDigest: Digest;
    changedMetrics: Metric[];
    uncertainty90: Record<Metric, [number, number]>;
  }>;
  falsifyingTraces: Array<{
    caseId: string;
    metric: Metric;
    predicted: number;
    observed: number;
    traceDigest: Digest;
  }>;
  disposition: R25Signed<{
    status: Status;
    coverage: number;
    meanAbsoluteError: number;
    falsifyingTraceDigests: Digest[];
  }>;
};
export type R25Trust = {
  dependencyDigests: Record<"R19" | "R23" | "R24", Digest>;
  verifyDependency(
    checkpoint: "R19" | "R23" | "R24",
    artifact: unknown,
  ): boolean;
  verifySignature(
    purpose:
      "preregistration" | "prediction" | "identifiability" | "disposition",
    value: R25Signed<unknown>,
  ): boolean;
  verifyExternalSource(source: R25Source): boolean;
  verifyExternalOutcome(outcome: R25Outcome): boolean;
  verifyPopulation(source: R25Source): boolean;
  verifyCaseSource(caseRecord: R25Case, source: R25Source): boolean;
  replayEstimator(
    evidence: NonNullable<
      R25Calibration["sensitivity"]["body"]["rows"][number]["recovery"]
    >,
  ): number;
  verifyIdentifiabilityEvidence(value: R25Calibration["sensitivity"]): boolean;
};

function signed<T>(
  purpose: Parameters<R25Trust["verifySignature"]>[0],
  x: R25Signed<T>,
  trust: R25Trust,
) {
  exact(
    x,
    ["body", "digest", "keyId", "signedAt", "signature"],
    `${purpose} signature`,
  );
  if (
    x.digest !== hash(x.body) ||
    !x.keyId ||
    !date(x.signedAt) ||
    !x.signature ||
    !trust.verifySignature(purpose, x)
  )
    throw Error(`R25 ${purpose} signature invalid`);
}
function resultOf(r: TwinSimulationResult): Record<Metric, number> {
  return Object.fromEntries(metrics.map((m) => [m, r[m]])) as Record<
    Metric,
    number
  >;
}
function specificationWithValue(
  specification: TwinSpecification,
  path: string,
  value: number,
) {
  const copy = structuredClone(specification) as unknown as Record<
    string,
    unknown
  >;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor = copy;
  for (const part of parts.slice(0, -1))
    cursor = cursor[part] as Record<string, unknown>;
  cursor[parts.at(-1)!] = value;
  return copy as unknown as TwinSpecification;
}
function matrixRank(input: number[][]) {
  const a = input.map((x) => [...x]);
  let rank = 0;
  for (let col = 0; col < (a[0]?.length ?? 0) && rank < a.length; col++) {
    const pivot = a.findIndex(
      (row, i) => i >= rank && Math.abs(row[col]!) > 1e-10,
    );
    if (pivot < 0) continue;
    [a[rank], a[pivot]] = [a[pivot]!, a[rank]!];
    const d = a[rank]![col]!;
    a[rank] = a[rank]!.map((x) => x / d);
    for (let i = 0; i < a.length; i++)
      if (i !== rank) {
        const f = a[i]![col]!;
        a[i] = a[i]!.map((x, j) => x - f * a[rank]![j]!);
      }
    rank++;
  }
  return rank;
}
export function r25TwinParameterValues(spec: TwinSpecification) {
  const rows: Array<[string, number]> = [
    ["budget", spec.budget],
    ...Object.entries(spec.abstractionError).map(
      ([k, v]) => [`abstractionError.${k}`, v] as [string, number],
    ),
  ];
  for (const [i, n] of spec.nodes.entries()) {
    const p = `nodes[${i}]`;
    rows.push(
      [`${p}.capacity`, n.capacity],
      [`${p}.queueLimit`, n.queueLimit],
      [`${p}.retryLimit`, n.retryLimit],
      [`${p}.service.meanMs.value`, n.service.meanMs.value],
      [
        `${p}.service.standardDeviationMs.value`,
        n.service.standardDeviationMs.value,
      ],
      [`${p}.failureProbability.value`, n.failureProbability.value],
      [`${p}.costPerMs.value`, n.costPerMs.value],
      ...n.routes.map(
        (r, j) =>
          [`${p}.routes[${j}].probability`, r.probability] as [string, number],
      ),
    );
  }
  return rows.sort(([a], [b]) => a.localeCompare(b));
}

export function verifyR25ExternalCalibration(
  a: R25Calibration,
  trust: R25Trust,
) {
  exact(
    a,
    [
      "schema",
      "closureClaim",
      "status",
      "dependencies",
      "preregistration",
      "specification",
      "sources",
      "cases",
      "parameterLedger",
      "predictions",
      "outcomes",
      "sensitivity",
      "ablations",
      "falsifyingTraces",
      "disposition",
    ],
    "artifact",
  );
  if (a.schema !== "autonomy.r25-external-calibration.v1")
    throw Error("R25 envelope invalid");
  signed("preregistration", a.preregistration, trust);
  signed("disposition", a.disposition, trust);
  signed("identifiability", a.sensitivity, trust);
  const latestTrain = Math.max(
    ...a.sources
      .filter((x) => x.split === "train")
      .map((x) => Date.parse(x.observedAt)),
  );
  if (
    !trust.verifyIdentifiabilityEvidence(a.sensitivity) ||
    Date.parse(a.sensitivity.signedAt) <= latestTrain ||
    Date.parse(a.sensitivity.signedAt) >= Date.parse(a.preregistration.signedAt)
  )
    throw Error("R25 identifiability was not frozen before preregistration");
  a.predictions.forEach((x) => signed("prediction", x, trust));
  const pre = a.preregistration.body;
  exact(
    pre,
    [
      "specificationDigest",
      "dependencyDigests",
      "trainSourceIds",
      "heldOutSourceIds",
      "workloads",
      "providers",
      "horizonsMs",
      "metrics",
      "minimumPopulations",
      "repetitionsPerCell",
      "caseManifestDigest",
      "maximumRecoveryRelativeError",
      "authorizedBefore",
    ],
    "preregistration",
  );
  if (
    pre.specificationDigest !== `sha256:${twinDigest(a.specification)}` ||
    !date(pre.authorizedBefore) ||
    Date.parse(a.preregistration.signedAt) > Date.parse(pre.authorizedBefore) ||
    !Number.isSafeInteger(pre.minimumPopulations) ||
    pre.minimumPopulations < 2 ||
    !Number.isSafeInteger(pre.repetitionsPerCell) ||
    pre.repetitionsPerCell < 10 ||
    pre.caseManifestDigest !== hash(a.cases) ||
    !Number.isFinite(pre.maximumRecoveryRelativeError) ||
    pre.maximumRecoveryRelativeError <= 0 ||
    pre.maximumRecoveryRelativeError > 0.1 ||
    pre.metrics.length !== metrics.length ||
    new Set(pre.metrics.map((x) => x.metric)).size !== metrics.length ||
    metrics.some((m) => !pre.metrics.some((x) => x.metric === m)) ||
    pre.metrics.some(
      (x) =>
        x.unit !== metricPolicy[x.metric]?.unit ||
        !Number.isFinite(x.minimumCoverage90) ||
        x.minimumCoverage90 < 0.8 ||
        x.minimumCoverage90 > 1 ||
        !Number.isFinite(x.maximumMeanAbsoluteError) ||
        x.maximumMeanAbsoluteError <= 0 ||
        x.maximumMeanAbsoluteError > metricPolicy[x.metric]!.maximumMaeCeiling,
    )
  )
    throw Error("R25 preregistration invalid");
  exact(a.dependencies, ["R19", "R23", "R24"], "dependencies");
  for (const checkpoint of ["R19", "R23", "R24"] as const) {
    const d = hash(a.dependencies[checkpoint]);
    if (
      d !== pre.dependencyDigests[checkpoint] ||
      d !== trust.dependencyDigests[checkpoint] ||
      !trust.verifyDependency(checkpoint, a.dependencies[checkpoint])
    )
      throw Error("R25 dependency invalid");
  }
  const sourceIds = new Set(a.sources.map((x) => x.id));
  if (
    sourceIds.size !== a.sources.length ||
    new Set([...pre.trainSourceIds, ...pre.heldOutSourceIds]).size !==
      a.sources.length ||
    a.sources.some(
      (x) =>
        !x.id ||
        !date(x.observedAt) ||
        hash(x.artifact) !== x.artifactDigest ||
        !digest(x.contaminationDigest) ||
        !x.contaminationGroup ||
        !digest(x.populationProvenanceDigest) ||
        !trust.verifyExternalSource(x),
    ) ||
    pre.trainSourceIds.some(
      (id) =>
        !sourceIds.has(id) ||
        a.sources.find((x) => x.id === id)!.split !== "train",
    ) ||
    pre.heldOutSourceIds.some(
      (id) =>
        !sourceIds.has(id) ||
        a.sources.find((x) => x.id === id)!.split !== "held-out",
    )
  )
    throw Error("R25 immutable split invalid");
  const trainGroups = new Set(
    a.sources
      .filter((x) => x.split === "train")
      .map((x) => x.contaminationGroup),
  );
  if (
    a.sources.some(
      (x) => x.split === "held-out" && trainGroups.has(x.contaminationGroup),
    ) ||
    a.sources.some(
      (x) =>
        x.split === "train" &&
        Date.parse(x.observedAt) >= Date.parse(a.preregistration.signedAt),
    ) ||
    a.sources.some(
      (x) =>
        x.split === "held-out" &&
        Date.parse(x.observedAt) <= Date.parse(a.preregistration.signedAt),
    )
  )
    throw Error("R25 source contamination or chronology invalid");
  const expectedParameters = r25TwinParameterValues(a.specification),
    ledger = new Map(a.parameterLedger.map((x) => [x.path, x]));
  if (
    ledger.size !== a.parameterLedger.length ||
    ledger.size !== expectedParameters.length ||
    expectedParameters.some(([path, value]) => {
      const x = ledger.get(path);
      return (
        !x ||
        x.value !== value ||
        !Number.isFinite(x.value) ||
        !["observed", "estimated", "assumed"].includes(x.source) ||
        x.sourceIds.some((id) => !pre.trainSourceIds.includes(id)) ||
        (x.source !== "assumed" && !x.sourceIds.length) ||
        (x.identifiable
          ? x.standardError === null ||
            !Number.isFinite(x.standardError) ||
            x.standardError < 0 ||
            x.confoundedWith.length > 0
          : !x.residual)
      );
    })
  )
    throw Error("R25 parameter ledger incomplete or invalid");
  const caseMap = new Map(a.cases.map((x) => [x.id, x]));
  if (
    caseMap.size !== a.cases.length ||
    a.cases.some(
      (x) =>
        !pre.heldOutSourceIds.includes(x.sourceId) ||
        !pre.workloads.includes(x.workloadId) ||
        !pre.providers.includes(x.providerId) ||
        !x.populationId ||
        !x.independenceKey ||
        x.drawDigest !==
          hash({
            sourceId: x.sourceId,
            populationId: x.populationId,
            repetition: x.repetition,
            seed: x.seed,
            arrivals: x.arrivals,
          }) ||
        !trust.verifyCaseSource(
          x,
          a.sources.find((s) => s.id === x.sourceId)!,
        ) ||
        !Number.isSafeInteger(x.repetition) ||
        x.repetition < 0 ||
        !pre.horizonsMs.includes(x.horizonMs) ||
        !Number.isSafeInteger(x.seed),
    )
  )
    throw Error("R25 case invalid");
  const grid = pre.workloads.flatMap((w) =>
    pre.providers.flatMap((p) => pre.horizonsMs.map((h) => `${w}\0${p}\0${h}`)),
  );
  for (const key of grid) {
    const rows = a.cases.filter(
        (x) => `${x.workloadId}\0${x.providerId}\0${x.horizonMs}` === key,
      ),
      sources = rows.map((x) => a.sources.find((s) => s.id === x.sourceId)!);
    if (
      new Set(rows.map((x) => x.independenceKey)).size !== rows.length ||
      new Set(rows.map((x) => x.drawDigest)).size !== rows.length ||
      new Set(rows.map((x) => x.seed)).size !== rows.length ||
      new Set(sources.map((x) => x.artifactDigest)).size !== rows.length ||
      new Set(sources.map((x) => x.populationId)).size !==
        pre.minimumPopulations ||
      new Set(sources.map((x) => x.populationProvenanceDigest)).size !==
        pre.minimumPopulations ||
      sources.some((x) => x.populationId === null || !trust.verifyPopulation(x))
    )
      throw Error("R25 pseudoreplication detected");
  }
  if (
    grid.some((k) => {
      const rows = a.cases.filter(
          (x) => `${x.workloadId}\0${x.providerId}\0${x.horizonMs}` === k,
        ),
        populations = new Set(rows.map((x) => x.populationId));
      return (
        populations.size !== pre.minimumPopulations ||
        [...populations].some((population) => {
          const repetitions = rows.filter((x) => x.populationId === population);
          return (
            repetitions.length !== pre.repetitionsPerCell ||
            new Set(repetitions.map((x) => x.repetition)).size !==
              pre.repetitionsPerCell
          );
        })
      );
    }) ||
    a.cases.some(
      (x) => !grid.includes(`${x.workloadId}\0${x.providerId}\0${x.horizonMs}`),
    )
  )
    throw Error("R25 coverage grid incomplete");
  const predictionMap = new Map(a.predictions.map((x) => [x.body.caseId, x])),
    outcomeMap = new Map(a.outcomes.map((x) => [x.caseId, x]));
  if (
    predictionMap.size !== a.cases.length ||
    outcomeMap.size !== a.cases.length
  )
    throw Error("R25 prediction/outcome matrix incomplete");
  const simulations = new Map(
      a.cases.map((c) => [
        c.id,
        simulateTwin(a.specification, c.arrivals, c.horizonMs, c.seed),
      ]),
    ),
    failures: R25Calibration["falsifyingTraces"] = [],
    scores = new Map<
      string,
      { covered: number; error: number; total: number }
    >();
  for (const c of a.cases) {
    const p = predictionMap.get(c.id)!,
      o = outcomeMap.get(c.id)!,
      simulation = simulations.get(c.id)!,
      expected = resultOf(simulation),
      groupResults = a.cases
        .filter(
          (x) =>
            x.id !== c.id &&
            x.workloadId === c.workloadId &&
            x.providerId === c.providerId &&
            x.horizonMs === c.horizonMs,
        )
        .map((x) => resultOf(simulations.get(x.id)!)),
      expectedPrediction = Object.fromEntries(
        metrics.map((m) => {
          const values = groupResults.map((x) => x[m]).sort((a, b) => a - b),
            lo = values[Math.floor((values.length - 1) * 0.05)]!,
            hi = values[Math.ceil((values.length - 1) * 0.95)]!,
            rule = pre.metrics.find((x) => x.metric === m)!;
          return [
            m,
            {
              point: expected[m],
              interval90: [lo, hi],
              unit: rule.unit,
              method: "leave-one-out-seed-quantile-90",
            },
          ];
        }),
      );
    if (
      p.body.specificationDigest !== pre.specificationDigest ||
      canonicalSemanticJson(p.body.result) !==
        canonicalSemanticJson(expectedPrediction) ||
      p.body.traceDigest !== hash(simulation.trace) ||
      Date.parse(p.signedAt) <= Date.parse(a.preregistration.signedAt) ||
      Date.parse(p.signedAt) >= Date.parse(o.observedAt) ||
      Date.parse(p.signedAt) >=
        Date.parse(a.sources.find((x) => x.id === c.sourceId)!.observedAt)
    )
      throw Error("R25 frozen prediction replay invalid");
    if (
      o.caseId !== c.id ||
      !date(o.observedAt) ||
      o.traceDigest !== hash(o.trace) ||
      !trust.verifyExternalOutcome(o)
    )
      throw Error("R25 held-out outcome invalid");
    for (const m of metrics) {
      const scoreKey = `${m}\0${c.workloadId}\0${c.providerId}\0${c.horizonMs}`,
        score = scores.get(scoreKey) ?? { covered: 0, error: 0, total: 0 },
        prediction = p.body.result[m],
        e = Math.abs(prediction.point - o.result[m]);
      score.total++;
      score.error += e;
      scores.set(scoreKey, score);
      if (
        o.result[m] >= prediction.interval90[0] &&
        o.result[m] <= prediction.interval90[1]
      )
        score.covered++;
      else
        failures.push({
          caseId: c.id,
          metric: m,
          predicted: prediction.point,
          observed: o.result[m],
          traceDigest: o.traceDigest,
        });
    }
  }
  const coverage =
      [...scores.values()].reduce((n, x) => n + x.covered, 0) /
      [...scores.values()].reduce((n, x) => n + x.total, 0),
    mae =
      [...scores.values()].reduce((n, x) => n + x.error, 0) /
      [...scores.values()].reduce((n, x) => n + x.total, 0),
    metricPass = grid.every((cell) =>
      metrics.every((m) => {
        const score = scores.get(`${m}\0${cell}`)!,
          rule = pre.metrics.find((x) => x.metric === m)!;
        return (
          !!score &&
          score.total === pre.minimumPopulations * pre.repetitionsPerCell &&
          score.covered / score.total >= rule.minimumCoverage90 &&
          score.error / score.total <= rule.maximumMeanAbsoluteError
        );
      }),
    ),
    identificationReady = a.parameterLedger.every((x) => x.identifiable),
    status: Status =
      failures.length && !metricPass
        ? "falsified"
        : metricPass && identificationReady
          ? "calibrated"
          : "externally-uncalibrated";
  const sensitivity = new Map(
    a.sensitivity.body.rows.map((x) => [x.parameterPath, x]),
  );
  const order = a.sensitivity.body.parameterOrder,
    matrix = a.sensitivity.body.matrix,
    signatures = order.map((_, j) =>
      canonicalSemanticJson(matrix.map((row) => row[j])),
    ),
    classes = order
      .map((path, i) => order.filter((_, j) => signatures[j] === signatures[i]))
      .filter((x) => x.length > 1)
      .filter(
        (x, i, xs) =>
          xs.findIndex(
            (y) => canonicalSemanticJson(y) === canonicalSemanticJson(x),
          ) === i,
      );
  const ledgerClasses = [...ledger.values()]
    .filter((x) => x.confoundedWith.length)
    .map((x) => [x.path, ...x.confoundedWith].sort())
    .filter(
      (x, i, xs) =>
        xs.findIndex(
          (y) => canonicalSemanticJson(y) === canonicalSemanticJson(x),
        ) === i,
    );
  if (
    canonicalSemanticJson(order) !==
      canonicalSemanticJson([...ledger.keys()].sort()) ||
    matrix.length !== order.length ||
    matrix.some(
      (row) =>
        row.length !== order.length || row.some((x) => !Number.isFinite(x)),
    ) ||
    a.sensitivity.body.rank !== matrixRank(matrix) ||
    a.sensitivity.body.rank !==
      order.length - classes.reduce((n, x) => n + x.length - 1, 0) ||
    canonicalSemanticJson(a.sensitivity.body.equivalenceClasses) !==
      canonicalSemanticJson(classes) ||
    canonicalSemanticJson(ledgerClasses) !== canonicalSemanticJson(classes) ||
    classes.some((group) =>
      group.some((path) => ledger.get(path)!.identifiable),
    )
  )
    throw Error("R25 global identifiability matrix invalid");
  if (
    [...ledger.values()].some((x) =>
      x.confoundedWith.some(
        (other) =>
          !ledger.has(other) ||
          !ledger.get(other)!.confoundedWith.includes(x.path),
      ),
    )
  )
    throw Error("R25 confounding graph is not reciprocal");
  if (
    sensitivity.size !== ledger.size ||
    [...ledger.values()].some((x) => {
      const s = sensitivity.get(x.path);
      if (!s || !caseMap.has(s.caseId) || s.perturbedValue === x.value)
        return true;
      const c = caseMap.get(s.caseId)!,
        baseline = resultOf(
          simulateTwin(a.specification, c.arrivals, c.horizonMs, c.seed),
        ),
        perturbed = resultOf(
          simulateTwin(
            specificationWithValue(a.specification, x.path, s.perturbedValue),
            c.arrivals,
            c.horizonMs,
            c.seed,
          ),
        ),
        changed = metrics.filter((m) => baseline[m] !== perturbed[m]);
      const recovered = s.recovery;
      return (
        s.replayDigest !== hash(perturbed) ||
        canonicalSemanticJson(s.changedMetrics) !==
          canonicalSemanticJson(changed) ||
        s.connected !== changed.length > 0 ||
        s.changedMetrics.some((m) => !metrics.includes(m)) ||
        (s.connected
          ? s.residual !== null || s.recovery !== null || !x.identifiable
          : !s.residual ||
            (x.identifiable
              ? !recovered ||
                recovered.datasetDigest !== hash(recovered.dataset) ||
                !recovered.estimatorId ||
                !recovered.estimatorVersion ||
                trust.replayEstimator(recovered) !== recovered.output ||
                Math.abs(recovered.truthValue - x.value) >
                  Math.max(Math.abs(x.value), 1) *
                    pre.maximumRecoveryRelativeError ||
                Math.abs(recovered.output - recovered.truthValue) >
                  Math.max(Math.abs(recovered.truthValue), 1) *
                    pre.maximumRecoveryRelativeError
              : x.confoundedWith.length === 0 || recovered !== null))
      );
    })
  )
    throw Error("R25 sensitivity/identifiability invalid");
  if (a.specification.nodes.length > 1) {
    const byCell = new Map(
      a.ablations.map((x) => [`${x.nodeId}\0${x.caseId}`, x]),
    );
    if (
      byCell.size !== a.ablations.length ||
      byCell.size !== a.specification.nodes.length * a.cases.length
    )
      throw Error("R25 ablation connectivity invalid");
    for (const node of a.specification.nodes) {
      for (const c of a.cases) {
        const row = byCell.get(`${node.id}\0${c.id}`),
          ablated = structuredClone(a.specification);
        if (!row) throw Error("R25 ablation case invalid");
        ablated.nodes = ablated.nodes.filter((x) => x.id !== node.id);
        for (const n of ablated.nodes) {
          n.routes = n.routes.filter((x) => x.destination !== node.id);
          const sum = n.routes.reduce((v, x) => v + x.probability, 0);
          if (n.routes.length && sum > 0)
            n.routes = n.routes.map((x) => ({
              ...x,
              probability: x.probability / sum,
            }));
        }
        const arrivals = c.arrivals.filter((x) => x.node !== node.id),
          baseline = resultOf(
            simulateTwin(a.specification, c.arrivals, c.horizonMs, c.seed),
          ),
          replay = resultOf(
            simulateTwin(ablated, arrivals, c.horizonMs, c.seed),
          ),
          changed = metrics.filter((m) => baseline[m] !== replay[m]),
          peerResults = a.cases
            .filter(
              (x) =>
                x.workloadId === c.workloadId &&
                x.providerId === c.providerId &&
                x.horizonMs === c.horizonMs,
            )
            .map((x) =>
              resultOf(
                simulateTwin(
                  ablated,
                  x.arrivals.filter((arrival) => arrival.node !== node.id),
                  x.horizonMs,
                  x.seed,
                ),
              ),
            ),
          uncertainty90 = Object.fromEntries(
            metrics.map((m) => {
              const values = peerResults.map((x) => x[m]).sort((a, b) => a - b);
              return [
                m,
                [
                  values[Math.floor((values.length - 1) * 0.05)]!,
                  values[Math.ceil((values.length - 1) * 0.95)]!,
                ],
              ];
            }),
          );
        if (
          row.replayDigest !== hash(replay) ||
          canonicalSemanticJson(row.changedMetrics) !==
            canonicalSemanticJson(changed) ||
          canonicalSemanticJson(row.uncertainty90) !==
            canonicalSemanticJson(uncertainty90) ||
          !changed.length
        )
          throw Error("R25 ablation connectivity invalid");
      }
    }
  } else if (a.ablations.length) throw Error("R25 surplus ablation invalid");
  if (
    canonicalSemanticJson(a.falsifyingTraces) !==
      canonicalSemanticJson(failures) ||
    a.disposition.body.status !== status ||
    a.disposition.body.coverage !== coverage ||
    a.disposition.body.meanAbsoluteError !== mae ||
    canonicalSemanticJson(a.disposition.body.falsifyingTraceDigests) !==
      canonicalSemanticJson(failures.map((x) => x.traceDigest)) ||
    Date.parse(a.disposition.signedAt) <
      Math.max(...a.outcomes.map((x) => Date.parse(x.observedAt)))
  )
    throw Error("R25 scoring disposition invalid");
  if (a.status !== status || a.closureClaim !== (status === "calibrated"))
    throw Error("R25 closure status invalid");
  return {
    status,
    closureClaim: a.closureClaim,
    coverage,
    meanAbsoluteError: mae,
    falsifying: failures.length,
  };
}
