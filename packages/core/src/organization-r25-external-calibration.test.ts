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
import { generateKeyPairSync, sign } from "node:crypto";
import { acceptR25Analysis, acceptR25Disposition, acceptR25Evidence, acceptR25Preregistration, acceptR25Sensitivity, acceptR25Specification, assembleR25, createR25State, issueR25Analysis, issueR25Disposition, issueR25Evidence, issueR25Preregistration, issueR25Sensitivity, issueR25Specification, type R25Kind, type R25Request, type R25Response } from "../../../bench/dev/evidence/r25-acquisition";

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
  test("reconstructs the exact frozen calibration through leakage-safe acquisition", () => {
    const { artifact: source, trust } = fixture(), ids = ["R19", "R23", "R24", "model", "train", "case", "identifiability", "preregistration", "prediction", "held", "outcome", "analysis", "disposition"], keys = Object.fromEntries(ids.map((id) => [id, generateKeyPairSync("ed25519")])) as Record<string, ReturnType<typeof generateKeyPairSync>>, publicKeys = Object.fromEntries(ids.map((id) => [id, keys[id]!.publicKey.export({ type: "spki", format: "pem" }).toString()])), trainSourceIds = source.preregistration.body.trainSourceIds, heldSourceIds = source.preregistration.body.heldOutSourceIds, caseIds = source.cases.map((x) => x.id), parameterPaths = source.parameterLedger.map((x) => x.path), state = createR25State({ campaignId: "r25-complete", createdAt: "2026-07-15T00:00:00Z", trainSourceIds, heldSourceIds, caseIds, parameterPaths, dependencyKeyIds: { R19: "R19", R23: "R23", R24: "R24" }, modelKeyId: "model", trainSourceKeyId: "train", caseKeyId: "case", identifiabilityKeyId: "identifiability", preregistrationKeyId: "preregistration", predictionKeyId: "prediction", heldSourceKeyId: "held", outcomeKeyId: "outcome", analysisKeyId: "analysis", dispositionKeyId: "disposition", publicKeys }), responseKey = (q: R25Request) => q.action === "specification" ? "model" : q.action === "sensitivity" ? "identifiability" : q.action === "preregistration" ? "preregistration" : q.action === "analysis" ? "analysis" : q.action === "disposition" ? "disposition" : q.kind === "dependencies" ? q.signerId : q.kind === "train-sources" ? "train" : q.kind === "cases" ? "case" : q.kind === "ledger" ? "model" : q.kind === "held-sources" ? "held" : q.kind === "predictions" ? "prediction" : "outcome", respond = (q: R25Request, fragment: unknown): R25Response => { const signerKeyId = responseKey(q), body = { schema: "open-autonomy.bench-r25-acquisition-response.v1" as const, requestDigest: h(q), fragmentDigest: h(fragment), signerKeyId, signedAt: "2026-07-16T04:00:00Z" }; return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), keys[signerKeyId]!.privateKey).toString("base64"), fragment }; }, acceptCell = (kind: R25Kind, id: string, fragment: unknown) => { const q = issueR25Evidence(state, kind, encodeURIComponent(id)); acceptR25Evidence(state, kind, encodeURIComponent(id), respond(q, fragment)); };
    let q = issueR25Specification(state); acceptR25Specification(state, respond(q, source.specification)); for (const dep of ["R19", "R23", "R24"] as const) acceptCell("dependencies", dep, source.dependencies[dep]); for (const x of source.sources.filter((x) => x.split === "train")) acceptCell("train-sources", x.id, x); for (const x of source.cases) acceptCell("cases", x.id, x); for (const x of source.parameterLedger) acceptCell("ledger", x.path, x);
    q = issueR25Sensitivity(state); acceptR25Sensitivity(state, respond(q, source.sensitivity)); q = issueR25Preregistration(state); acceptR25Preregistration(state, respond(q, source.preregistration)); for (const x of source.predictions) acceptCell("predictions", x.body.caseId, x); for (const x of source.sources.filter((x) => x.split === "held-out")) acceptCell("held-sources", x.id, x); for (const x of source.outcomes) acceptCell("outcomes", x.caseId, x);
    q = issueR25Analysis(state); acceptR25Analysis(state, respond(q, { ablations: source.ablations, falsifyingTraces: source.falsifyingTraces })); q = issueR25Disposition(state); acceptR25Disposition(state, respond(q, source.disposition)); const assembled = assembleR25(state); expect(canonicalSemanticJson(assembled)).toBe(canonicalSemanticJson(source)); expect(verifyR25ExternalCalibration(assembled, trust).closureClaim).toBe(true);
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
