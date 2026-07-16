import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  simulateTwin,
  twinDigest,
  type TwinSpecification,
} from "./organization-twin";
import {
  r25TwinParameterValues,
  verifyR25ExternalCalibration,
  type R25Calibration,
  type R25Signed,
  type R25Trust,
} from "./organization-r25-external-calibration";

const h = (x: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const;
const seal = <T>(body: T, signedAt: string): R25Signed<T> => ({
  body,
  digest: h(body),
  keyId: "external-authority",
  signedAt,
  signature: "verified-by-test-trust",
});
const metricNames = [
  "throughput",
  "meanLatencyMs",
  "cost",
  "quality",
  "humanMinutes",
  "completed",
  "failed",
  "blocked",
] as const;
const result = (x: ReturnType<typeof simulateTwin>) =>
  Object.fromEntries(metricNames.map((m) => [m, x[m]])) as Record<
    (typeof metricNames)[number],
    number
  >;
function setValue(
  specification: TwinSpecification,
  path: string,
  value: number,
) {
  const copy = structuredClone(specification) as any;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor = copy;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)!] = value;
  return copy as TwinSpecification;
}
function fixture() {
  const parameter = (name: string, value: number) => ({
      name,
      value,
      standardError: 0,
      source: "observed" as const,
      observations: 10,
      identifiable: true,
      confoundedWith: [],
    }),
    specification: TwinSpecification = {
      schema: "autonomy.organization-twin.v1",
      version: "1",
      budget: 100,
      assumptions: ["registered stationary horizon"],
      abstractionError: {
        throughput: 0,
        latencyMs: 0,
        cost: 0,
        quality: 0,
        recoveryMs: 0,
      },
      nodes: [
        {
          id: "worker",
          provider: "provider-a",
          capacity: 1,
          queueLimit: 10,
          retryLimit: 0,
          human: false,
          routes: [],
          service: {
            kind: "deterministic",
            meanMs: parameter("worker.service.meanMs", 10),
            standardDeviationMs: parameter(
              "worker.service.standardDeviationMs",
              0,
            ),
          },
          failureProbability: parameter("worker.failureProbability", 0),
          costPerMs: parameter("worker.costPerMs", 0.01),
        },
      ],
    },
    dependencies = {
      R19: { closed: true, id: "r19" },
      R23: { closed: true, id: "r23" },
      R24: { closed: true, id: "r24" },
    },
    dependencyDigests = {
      R19: h(dependencies.R19),
      R23: h(dependencies.R23),
      R24: h(dependencies.R24),
    },
    arrivals = [
      { id: "work-1", atMs: 0, node: "worker", priority: 1, quality: 0.8 },
    ],
    cases = ["population-a", "population-b"].flatMap((populationId, p) =>
      Array.from({ length: 10 }, (_, repetition) => ({
        id: `held-${p}-${repetition}`,
        sourceId: `source-${p}-${repetition}`,
        workloadId: "workload-a",
        providerId: "provider-a",
        populationId,
        repetition,
        horizonMs: 100,
        seed: 7 + repetition + p * 10,
        independenceKey: `independent-${p}-${repetition}`,
        arrivals: arrivals.map((x) => ({
          ...x,
          id: `${x.id}-${p}-${repetition}`,
        })),
      })).map((x) => ({
        ...x,
        drawDigest: h({
          sourceId: x.sourceId,
          populationId: x.populationId,
          repetition: x.repetition,
          seed: x.seed,
          arrivals: x.arrivals,
        }),
      })),
    ),
    simulation = simulateTwin(specification, arrivals, 100, 7),
    preregistration = seal(
      {
        specificationDigest: `sha256:${twinDigest(specification)}` as const,
        dependencyDigests,
        trainSourceIds: ["train-1"],
        heldOutSourceIds: cases.map((x) => x.sourceId),
        workloads: ["workload-a"],
        providers: ["provider-a"],
        horizonsMs: [100],
        metrics: metricNames.map((metric) => ({
          metric,
          unit: (
            {
              throughput: "work/s",
              meanLatencyMs: "ms",
              cost: "usd",
              quality: "ratio",
              humanMinutes: "min",
              completed: "count",
              failed: "count",
              blocked: "count",
            } as const
          )[metric],
          minimumCoverage90: 0.9,
          maximumMeanAbsoluteError: 0.01,
        })),
        minimumPopulations: 2,
        repetitionsPerCell: 10,
        caseManifestDigest: h(cases),
        maximumRecoveryRelativeError: 0.01,
        authorizedBefore: "2026-07-15T13:00:00Z",
      },
      "2026-07-15T12:00:00Z",
    ),
    heldSources = cases.map((c) => {
      const artifact = { draw: c.id, population: c.populationId };
      return {
        id: c.sourceId,
        split: "held-out" as const,
        observedAt: "2026-07-16T02:00:00Z",
        artifact,
        artifactDigest: h(artifact),
        contaminationGroup: `held-${c.populationId}-${c.repetition}`,
        contaminationDigest: h(`held-${c.populationId}-${c.repetition}`),
        populationId: c.populationId,
        populationProvenanceDigest: h({ population: c.populationId }),
      };
    }),
    trainArtifact = { events: ["training-only"] },
    train = {
      id: "train-1",
      split: "train" as const,
      observedAt: "2026-07-15T01:00:00Z",
      artifact: trainArtifact,
      artifactDigest: h(trainArtifact),
      contaminationGroup: "train-group",
      contaminationDigest: h("train-group"),
      populationId: null,
      populationProvenanceDigest: h("training-population"),
    },
    simulations = new Map(
      cases.map((c) => [
        c.id,
        simulateTwin(specification, c.arrivals, c.horizonMs, c.seed),
      ]),
    ),
    predictions = cases.map((c) => {
      const replay = simulations.get(c.id)!,
        point = result(replay);
      return seal(
        {
          caseId: c.id,
          specificationDigest: `sha256:${twinDigest(specification)}` as const,
          result: Object.fromEntries(
            metricNames.map((metric) => [
              metric,
              {
                point: point[metric],
                interval90: [point[metric], point[metric]],
                unit: (
                  {
                    throughput: "work/s",
                    meanLatencyMs: "ms",
                    cost: "usd",
                    quality: "ratio",
                    humanMinutes: "min",
                    completed: "count",
                    failed: "count",
                    blocked: "count",
                  } as const
                )[metric],
                method: "leave-one-out-seed-quantile-90" as const,
              },
            ]),
          ) as any,
          traceDigest: h(replay.trace),
        },
        "2026-07-16T00:00:00Z",
      );
    }),
    outcomes = cases.map((c) => {
      const replay = simulations.get(c.id)!;
      return {
        caseId: c.id,
        observedAt: "2026-07-16T02:00:00Z",
        result: result(replay),
        trace: replay.trace,
        traceDigest: h(replay.trace),
      };
    }),
    parameterLedger = r25TwinParameterValues(specification).map(
      ([path, value]) => ({
        path,
        value,
        source: "assumed" as const,
        sourceIds: [],
        standardError: 0,
        identifiable: true,
        confoundedWith: [],
        residual: "validated by deterministic sensitivity or recovery",
      }),
    );
  const sensitivityBody = parameterLedger.map((x) => {
    const perturbedValue = x.value + 1,
      perturbed = result(
        simulateTwin(
          setValue(specification, x.path, perturbedValue),
          arrivals,
          100,
          7,
        ),
      ),
      changedMetrics = metricNames.filter(
        (m) => result(simulation)[m] !== perturbed[m],
      );
    return {
      parameterPath: x.path,
      perturbedValue,
      caseId: cases[0]!.id,
      replayDigest: h(perturbed),
      changedMetrics: [...changedMetrics],
      connected: changedMetrics.length > 0,
      residual: changedMetrics.length
        ? null
        : "no observable effect at registered case",
      recovery: changedMetrics.length
        ? null
        : (() => {
            const dataset = {
              parameterPath: x.path,
              truthValue: x.value,
              draws: [x.value],
            };
            return {
              truthValue: x.value,
              estimatorId: "registered-mean",
              estimatorVersion: "1.0.0",
              dataset,
              datasetDigest: h(dataset),
              output: x.value,
            };
          })(),
    };
  });
  const parameterOrder = parameterLedger.map((x) => x.path).sort(),
    matrix = parameterOrder.map((_, i) =>
      parameterOrder.map((_, j) => (i === j ? 1 : 0)),
    );
  const sensitivity = seal(
    {
      rows: sensitivityBody,
      parameterOrder,
      matrix,
      rank: parameterOrder.length,
      equivalenceClasses: [],
    },
    "2026-07-15T11:30:00Z",
  );
  const disposition = seal(
    {
      status: "calibrated" as const,
      coverage: 1,
      meanAbsoluteError: 0,
      falsifyingTraceDigests: [],
    },
    "2026-07-16T03:00:00Z",
  );
  const artifact: R25Calibration = {
    schema: "autonomy.r25-external-calibration.v1",
    closureClaim: true,
    status: "calibrated",
    dependencies,
    preregistration,
    specification,
    sources: [train, ...heldSources],
    cases,
    parameterLedger,
    predictions,
    outcomes,
    sensitivity,
    ablations: [],
    falsifyingTraces: [],
    disposition,
  };
  const trust: R25Trust = {
    dependencyDigests,
    verifyDependency: () => true,
    verifySignature: () => true,
    verifyExternalSource: () => true,
    verifyExternalOutcome: () => true,
    verifyPopulation: () => true,
    verifyCaseSource: (c, s) =>
      c.sourceId === s.id && c.populationId === s.populationId,
    replayEstimator: (e) => {
      const draws = (e.dataset as { draws: number[] }).draws;
      return draws.reduce((n, x) => n + x, 0) / draws.length;
    },
    verifyIdentifiabilityEvidence: () => true,
  };
  return { artifact, trust };
}

describe("R25 external structural calibration", () => {
  test("closes only a replayed, frozen, externally scored calibration", () => {
    const { artifact, trust } = fixture();
    expect(verifyR25ExternalCalibration(artifact, trust)).toEqual(
      expect.objectContaining({
        status: "calibrated",
        closureClaim: true,
        coverage: 1,
        falsifying: 0,
      }),
    );
  });
  test("rejects a resealed analytic prediction that disagrees with simulateTwin", () => {
    const { artifact, trust } = fixture();
    artifact.predictions[0]!.body.result.throughput.point += 1;
    artifact.predictions[0]!.digest = h(artifact.predictions[0]!.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /replay/,
    );
  });
  test("rejects train/held-out contamination", () => {
    const { artifact, trust } = fixture();
    artifact.sources[1]!.contaminationGroup =
      artifact.sources[0]!.contaminationGroup;
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /contamination/,
    );
  });
  test("rejects an incomplete parameter ledger", () => {
    const { artifact, trust } = fixture();
    artifact.parameterLedger.pop();
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /ledger/,
    );
  });
  test("rejects a resealed widened prediction interval", () => {
    const { artifact, trust } = fixture();
    artifact.predictions[0]!.body.result.cost.interval90 = [0, 1_000_000];
    artifact.predictions[0]!.digest = h(artifact.predictions[0]!.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /replay/,
    );
  });
  test("rejects vacuous preregistered coverage", () => {
    const { artifact, trust } = fixture();
    artifact.preregistration.body.metrics[0]!.minimumCoverage90 = 0.1;
    artifact.preregistration.digest = h(artifact.preregistration.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /preregistration/,
    );
  });
  test("rejects predictions signed before preregistration", () => {
    const { artifact, trust } = fixture();
    artifact.predictions[0]!.signedAt = "2026-07-15T11:00:00Z";
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /replay/,
    );
  });
  test("rejects a case mutation outside the signed manifest", () => {
    const { artifact, trust } = fixture();
    artifact.cases[0]!.arrivals[0]!.priority = 99;
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /preregistration/,
    );
  });
  test("rejects a non-normative metric unit", () => {
    const { artifact, trust } = fixture();
    artifact.preregistration.body.metrics[0]!.unit = "requests/day";
    artifact.preregistration.digest = h(artifact.preregistration.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /preregistration/,
    );
  });
  test("rejects an inadequate leave-one-out sample", () => {
    const { artifact, trust } = fixture();
    artifact.preregistration.body.repetitionsPerCell = 3;
    artifact.preregistration.digest = h(artifact.preregistration.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /preregistration/,
    );
  });
  test("rejects repeated independence keys even when the manifest is resealed", () => {
    const { artifact, trust } = fixture();
    artifact.cases[1]!.independenceKey = artifact.cases[0]!.independenceKey;
    artifact.preregistration.body.caseManifestDigest = h(artifact.cases);
    artifact.preregistration.digest = h(artifact.preregistration.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /pseudoreplication/,
    );
  });
  test("rejects a forged synthetic estimator output", () => {
    const { artifact, trust } = fixture();
    const row = artifact.sensitivity.body.rows.find((x) => x.recovery)!;
    row.recovery!.output += 1;
    artifact.sensitivity.digest = h(artifact.sensitivity.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /identifiability/,
    );
  });
  test("rejects an undeclared global sensitivity equivalence", () => {
    const { artifact, trust } = fixture();
    artifact.sensitivity.body.matrix.forEach((row) => (row[1] = row[0]!));
    artifact.sensitivity.digest = h(artifact.sensitivity.body);
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /global identifiability/,
    );
  });
  test("rejects identifiability evidence not strictly after training", () => {
    const { artifact, trust } = fixture();
    artifact.sensitivity.signedAt = "2026-07-15T01:00:00Z";
    expect(() => verifyR25ExternalCalibration(artifact, trust)).toThrow(
      /frozen/,
    );
  });
});
