import {
  createHash,
  sign as publicSign,
  verify as publicVerify,
} from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type BenchmarkSubstrate = "hermes" | "paperclip";
export type OutcomeStatus = "success" | "failure" | "timeout";
export type DifferenceClass = "semantic" | "operational" | "economic";

export type MatchedBenchmarkLock = {
  schema: "autonomy.matched-benchmark-lock.v1";
  canonicalOrganizationDigest: string;
  workloadDigest: string;
  environmentDigest: string;
  modelDigest: string;
  toolDigests: Record<string, string>;
  repositoryDigest: string;
  workerHarnessDigest: string;
  sessionPolicyDigest: string;
  promptDigest: string;
  skillDigest: string;
  contextDigest: string;
  rendererDigest: string;
  isolationDigest: string;
  credentialScopeDigest: string;
  seed: number;
  repetitions: number;
  timeoutMs: number;
  providerRevisions: Record<BenchmarkSubstrate, string>;
  matchedFaults: Array<{ id: string; digest: string }>;
};

export type BenchmarkTrial = {
  id: string;
  unitId: string;
  replication: number;
};
export type CellAssignment = {
  pairId: string;
  trial: BenchmarkTrial;
  substrate: BenchmarkSubstrate;
  order: number;
  fault?: { id: string; digest: string };
};
export type ResourceMeasures = {
  wallTimeMs: number;
  cpuMs: number;
  memoryByteMs: number;
  tokens: number;
  computeUnits: number;
  moneyUsd: number;
  humanMinutes: number;
};
export type CellEvidence = {
  pairId: string;
  trialId: string;
  unitId: string;
  substrate: BenchmarkSubstrate;
  lockDigest: string;
  canonicalOrganizationDigest: string;
  providerRevision: string;
  faultDigest?: string;
  status: OutcomeStatus;
  portableScore: number;
  portableOutcomeDigest: string;
  portableTrace: unknown[];
  nativeTrace: unknown[];
  measures: ResourceMeasures;
  failures: Array<{ kind: string; detail: string }>;
  unattributedHumanAssistance: boolean;
  startedAt: string;
  completedAt: string;
};

export interface MatchedCellRunner {
  execute(
    assignment: CellAssignment,
    lock: MatchedBenchmarkLock,
  ): Promise<CellEvidence>;
}
export interface BenchmarkResultSigner {
  signer: string;
  sign(digest: string): string;
  verify(digest: string, signature: string): boolean;
}

export type CrossSubstrateDifference = {
  id: string;
  pairId: string;
  class: DifferenceClass;
  field: string;
  hermes: unknown;
  paperclip: unknown;
};
export type DifferenceTriage = {
  differenceId: string;
  disposition: "explained" | "accepted" | "defect";
  rationale: string;
  owner: string;
  evidence: string[];
};
export type PairedEstimate = {
  metric:
    | keyof Pick<
        ResourceMeasures,
        "wallTimeMs" | "tokens" | "computeUnits" | "moneyUsd" | "humanMinutes"
      >
    | "portableScore";
  pairs: number;
  hermesMean: number;
  paperclipMean: number;
  meanDifference: number;
  sampleVariance: number;
  standardError: number;
  confidenceInterval95: [number, number];
  standardizedEffect: number | null;
  conclusion: "hermes-better" | "paperclip-better" | "inconclusive";
};
export type MatchedBenchmarkResult = {
  schema: "autonomy.matched-benchmark-result.v1";
  lock: MatchedBenchmarkLock;
  lockDigest: string;
  assignments: CellAssignment[];
  evidence: CellEvidence[];
  differences: CrossSubstrateDifference[];
  triage: DifferenceTriage[];
  estimates: PairedEstimate[];
  createdAt: string;
};
export type SignedMatchedResult = {
  result: MatchedBenchmarkResult;
  digest: string;
  signer: string;
  signature: string;
};

export function planMatchedCells(
  lock: MatchedBenchmarkLock,
  unitIds: string[],
): CellAssignment[] {
  validateLock(lock);
  if (
    !unitIds.length ||
    new Set(unitIds).size !== unitIds.length ||
    unitIds.some((id) => !id)
  )
    throw new Error("benchmark units invalid");
  const normalizedUnitIds = [...unitIds].sort();
  const base = normalizedUnitIds.flatMap((unitId) =>
    Array.from({ length: lock.repetitions }, (_, replication) => ({
      id: digest({ unitId, replication, seed: lock.seed }),
      unitId,
      replication,
    })),
  );
  const shuffled = seededPermutation(base, lock.seed),
    assignments: CellAssignment[] = [];
  // Randomize a pre-balanced allocation instead of taking adjacent low bits
  // from the PRNG. The latter is serially correlated and can assign the same
  // provider first in every small-sample pair.
  const firstOrder = seededPermutation(
    shuffled.map((_, index): BenchmarkSubstrate =>
      index % 2 === 0 ? "hermes" : "paperclip",
    ),
    lock.seed ^ 0x6a09e667,
  );
  for (let index = 0; index < shuffled.length; index++) {
    const trial = shuffled[index]!,
      pairId = digest({ trial: trial.id, lock: lockDigest(lock) }),
      hermesFirst = firstOrder[index] === "hermes";
    const fault = lock.matchedFaults.length
      ? lock.matchedFaults[index % lock.matchedFaults.length]
      : undefined;
    assignments.push({
      pairId,
      trial,
      substrate: hermesFirst ? "hermes" : "paperclip",
      order: 0,
      ...(fault ? { fault } : {}),
    });
    assignments.push({
      pairId,
      trial,
      substrate: hermesFirst ? "paperclip" : "hermes",
      order: 1,
      ...(fault ? { fault } : {}),
    });
  }
  return assignments;
}

export async function executeMatchedBenchmark(
  lock: MatchedBenchmarkLock,
  unitIds: string[],
  runners: Record<BenchmarkSubstrate, MatchedCellRunner>,
): Promise<{ assignments: CellAssignment[]; evidence: CellEvidence[] }> {
  const assignments = planMatchedCells(lock, unitIds),
    evidence: CellEvidence[] = [];
  for (const assignment of assignments) {
    const cell = await runners[assignment.substrate].execute(
      structuredClone(assignment),
      structuredClone(lock),
    );
    validateEvidence(cell, assignment, lock);
    evidence.push(structuredClone(cell));
  }
  return { assignments, evidence };
}

export function finalizeMatchedBenchmark(
  lock: MatchedBenchmarkLock,
  assignments: CellAssignment[],
  evidence: CellEvidence[],
  triage: DifferenceTriage[],
  createdAt: string,
  signer: BenchmarkResultSigner,
): SignedMatchedResult {
  if (!Number.isFinite(Date.parse(createdAt)))
    throw new Error("result timestamp invalid");
  const expected = planMatchedCells(
    lock,
    [...new Set(assignments.map((a) => a.trial.unitId))].sort(),
  );
  if (digest(assignments) !== digest(expected))
    throw new Error("assignments differ from locked randomized plan");
  if (evidence.length !== assignments.length)
    throw new Error("failures and timeouts may not be excluded");
  for (const assignment of assignments) {
    const matching = evidence.filter(
      (e) =>
        e.pairId === assignment.pairId && e.substrate === assignment.substrate,
    );
    if (matching.length !== 1)
      throw new Error("each matched cell requires exactly one outcome");
    validateEvidence(matching[0]!, assignment, lock);
  }
  const differences = collectDifferences(evidence),
    byId = new Map(triage.map((t) => [t.differenceId, t]));
  if (
    byId.size !== triage.length ||
    triage.some((t) => !t.owner || !t.rationale || !t.evidence.length) ||
    differences.some((d) => !byId.has(d.id)) ||
    triage.some((t) => !differences.some((d) => d.id === t.differenceId))
  )
    throw new Error(
      "every cross-substrate difference must be triaged exactly once",
    );
  const result: MatchedBenchmarkResult = {
    schema: "autonomy.matched-benchmark-result.v1",
    lock: structuredClone(lock),
    lockDigest: lockDigest(lock),
    assignments: structuredClone(assignments),
    evidence: structuredClone(evidence),
    differences,
    triage: structuredClone(triage),
    estimates: pairedEstimates(evidence),
    createdAt,
  };
  const resultDigest = digest(result),
    signature = signer.sign(resultDigest);
  if (!signer.verify(resultDigest, signature))
    throw new Error("result signing self-check failed");
  return { result, digest: resultDigest, signer: signer.signer, signature };
}

export function verifyMatchedResult(
  bundle: SignedMatchedResult,
  signer: BenchmarkResultSigner,
) {
  const actual = digest(bundle.result);
  if (
    bundle.signer !== signer.signer ||
    bundle.digest !== actual ||
    !signer.verify(actual, bundle.signature)
  )
    throw new Error("matched result signature or replay integrity failure");
  return structuredClone(bundle.result);
}

export function collectDifferences(
  evidence: CellEvidence[],
): CrossSubstrateDifference[] {
  const pairs = groupPairs(evidence),
    out: CrossSubstrateDifference[] = [];
  const add = (
    pairId: string,
    cls: DifferenceClass,
    field: string,
    hermes: unknown,
    paperclip: unknown,
  ) => {
    if (digest(hermes) !== digest(paperclip))
      out.push({
        id: digest({ pairId, cls, field, hermes, paperclip }),
        pairId,
        class: cls,
        field,
        hermes,
        paperclip,
      });
  };
  for (const [pairId, pair] of pairs) {
    const h = pair.hermes!,
      p = pair.paperclip!;
    add(pairId, "semantic", "status", h.status, p.status);
    add(pairId, "semantic", "portableScore", h.portableScore, p.portableScore);
    add(
      pairId,
      "semantic",
      "portableOutcomeDigest",
      h.portableOutcomeDigest,
      p.portableOutcomeDigest,
    );
    add(
      pairId,
      "operational",
      "wallTimeMs",
      h.measures.wallTimeMs,
      p.measures.wallTimeMs,
    );
    add(pairId, "operational", "cpuMs", h.measures.cpuMs, p.measures.cpuMs);
    add(
      pairId,
      "operational",
      "memoryByteMs",
      h.measures.memoryByteMs,
      p.measures.memoryByteMs,
    );
    add(pairId, "operational", "failures", h.failures, p.failures);
    add(pairId, "operational", "nativeTrace", h.nativeTrace, p.nativeTrace);
    add(pairId, "economic", "tokens", h.measures.tokens, p.measures.tokens);
    add(
      pairId,
      "economic",
      "computeUnits",
      h.measures.computeUnits,
      p.measures.computeUnits,
    );
    add(
      pairId,
      "economic",
      "moneyUsd",
      h.measures.moneyUsd,
      p.measures.moneyUsd,
    );
    add(
      pairId,
      "economic",
      "humanMinutes",
      h.measures.humanMinutes,
      p.measures.humanMinutes,
    );
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function pairedEstimates(evidence: CellEvidence[]): PairedEstimate[] {
  const pairs = [...groupPairs(evidence).values()],
    metrics: PairedEstimate["metric"][] = [
      "portableScore",
      "wallTimeMs",
      "tokens",
      "computeUnits",
      "moneyUsd",
      "humanMinutes",
    ];
  return metrics.map((metric) => {
    const values = pairs.map((pair) => ({
      h:
        metric === "portableScore"
          ? pair.hermes!.portableScore
          : pair.hermes!.measures[metric],
      p:
        metric === "portableScore"
          ? pair.paperclip!.portableScore
          : pair.paperclip!.measures[metric],
    }));
    const deltas = values.map((v) => v.p - v.h),
      meanDifference = mean(deltas),
      sampleVariance = variance(deltas, meanDifference),
      standardError =
        deltas.length > 1
          ? Math.sqrt(sampleVariance / deltas.length)
          : Number.POSITIVE_INFINITY,
      half = tCritical95(deltas.length - 1) * standardError;
    const interval: [number, number] = [
      meanDifference - half,
      meanDifference + half,
    ];
    // Lower resource use is better; higher score is better.
    const positiveMeansPaperclip = metric === "portableScore";
    const conclusion =
      interval[0] <= 0 && interval[1] >= 0
        ? "inconclusive"
        : meanDifference > 0 === positiveMeansPaperclip
          ? "paperclip-better"
          : "hermes-better";
    return {
      metric,
      pairs: values.length,
      hermesMean: mean(values.map((v) => v.h)),
      paperclipMean: mean(values.map((v) => v.p)),
      meanDifference,
      sampleVariance,
      standardError,
      confidenceInterval95: interval,
      standardizedEffect:
        sampleVariance > 0 ? meanDifference / Math.sqrt(sampleVariance) : null,
      conclusion,
    };
  });
}

function validateLock(lock: MatchedBenchmarkLock) {
  const required = [
    lock.canonicalOrganizationDigest,
    lock.workloadDigest,
    lock.environmentDigest,
    lock.modelDigest,
    lock.repositoryDigest,
    lock.workerHarnessDigest,
    lock.sessionPolicyDigest,
    lock.promptDigest,
    lock.skillDigest,
    lock.contextDigest,
    lock.rendererDigest,
    lock.isolationDigest,
    lock.credentialScopeDigest,
    lock.providerRevisions.hermes,
    lock.providerRevisions.paperclip,
  ];
  if (
    lock.schema !== "autonomy.matched-benchmark-lock.v1" ||
    required.some((v) => !v) ||
    !Number.isSafeInteger(lock.seed) ||
    !Number.isSafeInteger(lock.repetitions) ||
    lock.repetitions < 2 ||
    lock.timeoutMs < 1 ||
    !Object.keys(lock.toolDigests).length ||
    new Set(lock.matchedFaults.map((f) => f.id)).size !==
      lock.matchedFaults.length ||
    lock.matchedFaults.some((f) => !f.id || !f.digest)
  )
    throw new Error("matched benchmark lock invalid");
}
function validateEvidence(
  cell: CellEvidence,
  assignment: CellAssignment,
  lock: MatchedBenchmarkLock,
) {
  const expectedFault = assignment.fault?.digest;
  if (
    cell.pairId !== assignment.pairId ||
    cell.trialId !== assignment.trial.id ||
    cell.unitId !== assignment.trial.unitId ||
    cell.substrate !== assignment.substrate ||
    cell.lockDigest !== lockDigest(lock) ||
    cell.canonicalOrganizationDigest !== lock.canonicalOrganizationDigest ||
    cell.providerRevision !== lock.providerRevisions[assignment.substrate] ||
    cell.faultDigest !== expectedFault
  )
    throw new Error(
      "cell evidence is not bound to matched assignment and lock",
    );
  const m = cell.measures;
  if (
    !Number.isFinite(cell.portableScore) ||
    !cell.portableOutcomeDigest ||
    !cell.portableTrace.length ||
    !cell.nativeTrace.length ||
    Object.values(m).some((v) => !Number.isFinite(v) || v < 0) ||
    cell.unattributedHumanAssistance ||
    !Number.isFinite(Date.parse(cell.startedAt)) ||
    !Number.isFinite(Date.parse(cell.completedAt)) ||
    Date.parse(cell.completedAt) < Date.parse(cell.startedAt) ||
    (Date.parse(cell.completedAt) - Date.parse(cell.startedAt) >
      lock.timeoutMs &&
      cell.status !== "timeout") ||
    (cell.status !== "success" && !cell.failures.length)
  )
    throw new Error(
      "cell evidence incomplete, unattributed, or internally inconsistent",
    );
}
function groupPairs(evidence: CellEvidence[]) {
  const pairs = new Map<
    string,
    Partial<Record<BenchmarkSubstrate, CellEvidence>>
  >();
  for (const cell of evidence) {
    const pair = pairs.get(cell.pairId) ?? {};
    if (pair[cell.substrate])
      throw new Error("duplicate substrate outcome in pair");
    pair[cell.substrate] = cell;
    pairs.set(cell.pairId, pair);
  }
  if ([...pairs.values()].some((p) => !p.hermes || !p.paperclip))
    throw new Error("incomplete matched pair");
  return pairs as Map<string, Record<BenchmarkSubstrate, CellEvidence>>;
}
function lockDigest(lock: MatchedBenchmarkLock) {
  return digest(lock);
}
function mean(v: number[]) {
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function variance(v: number[], m: number) {
  return v.length > 1
    ? v.reduce((n, x) => n + (x - m) ** 2, 0) / (v.length - 1)
    : 0;
}
function tCritical95(df: number) {
  const table = [
    Number.POSITIVE_INFINITY,
    12.706,
    4.303,
    3.182,
    2.776,
    2.571,
    2.447,
    2.365,
    2.306,
    2.262,
    2.228,
    2.201,
    2.179,
    2.16,
    2.145,
    2.131,
    2.12,
    2.11,
    2.101,
    2.093,
    2.086,
    2.08,
    2.074,
    2.069,
    2.064,
    2.06,
    2.056,
    2.052,
    2.048,
    2.045,
    2.042,
  ];
  return df < table.length ? table[df]! : df < 60 ? 2 : 1.96;
}
function seededBit(seed: number, index: number) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x & 1;
}
function seededPermutation<T>(values: T[], seed: number) {
  const out = [...values];
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((state / 2 ** 32) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
function digest(value: unknown) {
  return createHash("sha256")
    .update(canonicalSemanticJson(value))
    .digest("hex");
}
export function matchedBenchmarkDigest(value: unknown) {
  return digest(value);
}

// V2 is deliberately separate from the descriptive V1 schema: it is a
// preregistered, replayable analysis contract suitable for live evidence.
export const V2_METRICS = [
  "portableScore",
  "wallTimeMs",
  "cpuMs",
  "memoryByteMs",
  "tokens",
  "computeUnits",
  "moneyUsd",
  "humanMinutes",
] as const;
export type V2Metric = (typeof V2_METRICS)[number];
export type V2Measure =
  | {
      status: "observed";
      value: number;
      unit: string;
      provenance: string;
      raw: unknown;
      rawDigest: string;
    }
  | {
      status: "unknown";
      value: null;
      unit: string;
      reason: string;
      provenance: string;
    };
export type V2Design = {
  schema: "autonomy.matched-design.v2";
  seed: number;
  units: string[];
  repetitions: number;
  faults: Array<{ id: string; digest: string }>;
  primaryEndpoint: V2Metric;
  alpha: number;
  multiplicity: "holm" | "bonferroni";
  missingness: "complete-pair";
  failureEstimand: "worst-score-and-observed-resources";
  strata: ["unit", "fault"];
  permutations: "exact-pair-swap";
};
export type V2Assignment = {
  pairId: string;
  trialId: string;
  unitId: string;
  replication: number;
  fault: { id: string; digest: string };
  substrate: BenchmarkSubstrate;
  order: 0 | 1;
};
export type V2Cell = {
  assignment: V2Assignment;
  status: OutcomeStatus;
  measures: Record<V2Metric, V2Measure>;
  providerEvidence: unknown;
  providerEvidenceDigest: string;
  startedAt: string;
  completedAt: string;
};
export type V2Estimate = {
  metric: V2Metric;
  pairs: number;
  meanDifference: number;
  simultaneousInterval: [number, number] | null;
  intervalMethod: "unit-cluster-student-t";
  intervalAssumptions: string;
  randomizationP: number | null;
  adjustedAlpha: number;
  missingness: {
    completePairs: number;
    excludedPairs: number;
    reasons: Record<string, number>;
  };
  conclusion:
    "paperclip-better" | "hermes-better" | "inconclusive" | "insufficient";
  orderSensitivity: {
    hermesFirstMean: number | null;
    paperclipFirstMean: number | null;
    difference: number | null;
  };
  leaveUnitOut: Array<{ unitId: string; meanDifference: number | null }>;
  leaveFaultOut: Array<{ faultId: string; meanDifference: number | null }>;
};
export type V2Result = {
  schema: "autonomy.matched-result.v2";
  design: V2Design;
  designDigest: string;
  assignments: V2Assignment[];
  cells: V2Cell[];
  balance: {
    hermesFirst: number;
    paperclipFirst: number;
    byUnit: Record<string, [number, number]>;
    byFault: Record<string, [number, number]>;
  };
  estimates: V2Estimate[];
  createdAt: string;
};
export type V2Signed = {
  algorithm: "Ed25519";
  signerKeyId: string;
  publicKeyPem: string;
  result: V2Result;
  digest: string;
  signature: string;
};
export type V2ProviderVerifier = (cell: V2Cell) => {
  accepted: true;
  digest: string;
};
export function planMatchedV2(d: V2Design): V2Assignment[] {
  validateDesign(d);
  const out: V2Assignment[] = [];
  for (const [ui, unitId] of [...d.units].sort().entries()) {
    for (let replication = 0; replication < d.repetitions; replication++) {
      const fault = d.faults[(replication + ui) % d.faults.length]!,
        faultOccurrence = Math.floor(replication / d.faults.length),
        trialId = digest({ unitId, replication, seed: d.seed }),
        pairId = digest({ trialId, design: digest(d) }),
        h =
          (faultOccurrence +
            seededBit(
              d.seed,
              ui * d.faults.length + ((replication + ui) % d.faults.length),
            )) %
            2 ===
          0;
      out.push(
        {
          pairId,
          trialId,
          unitId,
          replication,
          fault,
          substrate: h ? "hermes" : "paperclip",
          order: 0,
        },
        {
          pairId,
          trialId,
          unitId,
          replication,
          fault,
          substrate: h ? "paperclip" : "hermes",
          order: 1,
        },
      );
    }
  }
  return out;
}
export function analyzeMatchedV2(
  design: V2Design,
  assignments: V2Assignment[],
  cells: V2Cell[],
  verifyProvider: V2ProviderVerifier,
  createdAt: string,
): V2Result {
  validateDesign(design);
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    digest(assignments) !== digest(planMatchedV2(design)) ||
    cells.length !== assignments.length
  )
    throw Error("V2 plan or timestamp replay failed");
  for (const a of assignments) {
    const xs = cells.filter(
      (c) =>
        c.assignment.pairId === a.pairId &&
        c.assignment.substrate === a.substrate,
    );
    if (xs.length !== 1 || digest(xs[0]!.assignment) !== digest(a))
      throw Error("V2 exact cell coverage failed");
    const c = xs[0]!,
      v = verifyProvider(c);
    if (
      !v.accepted ||
      !/^[a-f0-9]{64}$/.test(c.providerEvidenceDigest) ||
      v.digest !== c.providerEvidenceDigest ||
      digest(c.providerEvidence) !== c.providerEvidenceDigest ||
      !Number.isFinite(Date.parse(c.startedAt)) ||
      Date.parse(c.completedAt) < Date.parse(c.startedAt)
    )
      throw Error("V2 provider evidence replay failed");
    for (const m of V2_METRICS) {
      const x = c.measures[m];
      if (
        !x ||
        !x.provenance ||
        !x.unit ||
        (x.status === "observed" &&
          (!Number.isFinite(x.value) ||
            x.value < 0 ||
            !/^[a-f0-9]{64}$/.test(x.rawDigest) ||
            x.rawDigest !== digest(x.raw))) ||
        (x.status === "unknown" && (!x.reason || x.value !== null))
      )
        throw Error("V2 measure provenance invalid");
    }
    if (
      c.status !== "success" &&
      (c.measures.portableScore.status !== "observed" ||
        c.measures.portableScore.value !== 0)
    )
      throw Error("V2 failure estimand violated");
  }
  const grouped = groupV2(cells),
    raw = V2_METRICS.map((metric) =>
      estimateV2(metric, design, grouped, design.alpha),
    ),
    ordered = [...raw].sort(
      (a, b) => (a.randomizationP ?? 1) - (b.randomizationP ?? 1),
    );
  let holmOpen = true;
  const rejected = new Set<V2Estimate>();
  for (let i = 0; i < ordered.length; i++) {
    ordered[i]!.adjustedAlpha =
      design.multiplicity === "bonferroni"
        ? design.alpha / ordered.length
        : design.alpha / (ordered.length - i);
    const reject =
      holmOpen &&
      ordered[i]!.randomizationP !== null &&
      ordered[i]!.randomizationP! <= ordered[i]!.adjustedAlpha;
    if (reject) rejected.add(ordered[i]!);
    else if (design.multiplicity === "holm") holmOpen = false;
  }
  const balance = balanceV2(assignments),
    primary = raw.find((x) => x.metric === design.primaryEndpoint)!;
  if (!rejected.has(primary))
    for (const x of [...rejected]) if (x !== primary) rejected.delete(x);
  for (const x of raw) {
    x.simultaneousInterval = clusterInterval(
      x.metric,
      grouped,
      x.adjustedAlpha,
    );
    if (x.randomizationP === null || x.simultaneousInterval === null)
      x.conclusion = "insufficient";
    else if (
      !rejected.has(x) ||
      (x.simultaneousInterval[0] <= 0 && x.simultaneousInterval[1] >= 0)
    )
      x.conclusion = "inconclusive";
    else
      x.conclusion =
        x.meanDifference > 0 === (x.metric === "portableScore")
          ? "paperclip-better"
          : "hermes-better";
  }
  return {
    schema: "autonomy.matched-result.v2",
    design: structuredClone(design),
    designDigest: digest(design),
    assignments: structuredClone(assignments),
    cells: structuredClone(cells),
    balance,
    estimates: raw,
    createdAt,
  };
}
export function signMatchedV2(
  result: V2Result,
  privateKeyPem: string,
  publicKeyPem: string,
  signerKeyId: string,
): V2Signed {
  const d = digest(result),
    signature = publicSign(null, Buffer.from(d), privateKeyPem).toString(
      "base64",
    );
  if (
    !publicVerify(
      null,
      Buffer.from(d),
      publicKeyPem,
      Buffer.from(signature, "base64"),
    )
  )
    throw Error("V2 signing self-check failed");
  if (!signerKeyId) throw Error("V2 signer key id required");
  return {
    algorithm: "Ed25519",
    signerKeyId,
    publicKeyPem,
    result: structuredClone(result),
    digest: d,
    signature,
  };
}
export function verifyMatchedV2(
  bundle: V2Signed,
  verifyProvider: V2ProviderVerifier,
  trust: { keyId: string; publicKeyPem: string },
) {
  if (
    bundle.algorithm !== "Ed25519" ||
    bundle.signerKeyId !== trust.keyId ||
    bundle.publicKeyPem !== trust.publicKeyPem ||
    bundle.digest !== digest(bundle.result) ||
    !publicVerify(
      null,
      Buffer.from(bundle.digest),
      bundle.publicKeyPem,
      Buffer.from(bundle.signature, "base64"),
    )
  )
    throw Error("V2 public signature invalid");
  const replay = analyzeMatchedV2(
    bundle.result.design,
    bundle.result.assignments,
    bundle.result.cells,
    verifyProvider,
    bundle.result.createdAt,
  );
  if (digest(replay) !== digest(bundle.result))
    throw Error("V2 semantic replay mismatch");
  return replay;
}
function validateDesign(d: V2Design) {
  if (
    !d ||
    typeof d !== "object" ||
    d.schema !== "autonomy.matched-design.v2" ||
    !Number.isSafeInteger(d.seed) ||
    !Number.isSafeInteger(d.repetitions) ||
    d.repetitions < 2 ||
    !Array.isArray(d.units) ||
    !Array.isArray(d.faults) ||
    !Array.isArray(d.strata) ||
    !d.faults.length ||
    d.repetitions % (2 * d.faults.length) !== 0 ||
    !d.units.length ||
    new Set(d.units).size !== d.units.length ||
    d.units.some((x) => !x) ||
    d.faults.some(
      (x) =>
        !x ||
        typeof x !== "object" ||
        !x.id ||
        !/^sha256:[a-f0-9]{64}$/.test(x.digest),
    ) ||
    new Set(d.faults.map((x) => x.id)).size !== d.faults.length ||
    !V2_METRICS.includes(d.primaryEndpoint) ||
    !(d.alpha > 0 && d.alpha < 1) ||
    (d.multiplicity !== "holm" && d.multiplicity !== "bonferroni") ||
    d.strata.length !== 2 ||
    d.strata[0] !== "unit" ||
    d.strata[1] !== "fault" ||
    d.missingness !== "complete-pair" ||
    d.failureEstimand !== "worst-score-and-observed-resources" ||
    d.permutations !== "exact-pair-swap"
  )
    throw Error("V2 design invalid");
}
function groupV2(cells: V2Cell[]) {
  const m = new Map<string, Record<BenchmarkSubstrate, V2Cell>>();
  for (const c of cells) {
    const x = m.get(c.assignment.pairId) ?? ({} as any);
    if (x[c.assignment.substrate]) throw Error("V2 duplicate pair cell");
    x[c.assignment.substrate] = c;
    m.set(c.assignment.pairId, x);
  }
  if ([...m.values()].some((x) => !x.hermes || !x.paperclip))
    throw Error("V2 incomplete pair");
  return m;
}
function observed(c: V2Cell, m: V2Metric) {
  const x = c.measures[m];
  return x.status === "observed" ? x.value : null;
}
function estimateV2(
  metric: V2Metric,
  d: V2Design,
  pairs: Map<string, Record<BenchmarkSubstrate, V2Cell>>,
  alpha: number,
): V2Estimate {
  const rows = [...pairs.values()]
      .map((p) => ({
        p,
        unit: p.hermes.assignment.unitId,
        fault: p.hermes.assignment.fault.id,
        first:
          p.hermes.assignment.order === 0
            ? "hermes"
            : ("paperclip" as BenchmarkSubstrate),
        h: observed(p.hermes, metric),
        v: observed(p.paperclip, metric),
      }))
      .filter((x) => x.h !== null && x.v !== null),
    ds = rows.map((x) => x.v! - x.h!),
    unitMeans = d.units
      .map((unit) =>
        rows.filter((x) => x.unit === unit).map((x) => x.v! - x.h!),
      )
      .filter((xs) => xs.length)
      .map(mean),
    md = unitMeans.length ? mean(unitMeans) : 0,
    p = ds.length <= 20 && ds.length ? exactPairP(rows, Math.abs(md)) : null,
    avg = (xs: number[]) => (xs.length ? mean(xs) : null),
    hf = rows.filter((x) => x.first === "hermes").map((x) => x.v! - x.h!),
    pf = rows.filter((x) => x.first === "paperclip").map((x) => x.v! - x.h!);
  return {
    metric,
    pairs: ds.length,
    meanDifference: md,
    simultaneousInterval: null,
    intervalMethod: "unit-cluster-student-t",
    intervalAssumptions:
      "independent unit clusters, approximately Student-t cluster-mean sampling distribution, finite cluster variance; equal unit weighting",
    randomizationP: p,
    adjustedAlpha: alpha,
    conclusion: "inconclusive",
    missingness: {
      completePairs: rows.length,
      excludedPairs: pairs.size - rows.length,
      reasons: missingReasons(metric, pairs),
    },
    orderSensitivity: {
      hermesFirstMean: avg(hf),
      paperclipFirstMean: avg(pf),
      difference: hf.length && pf.length ? mean(hf) - mean(pf) : null,
    },
    leaveUnitOut: d.units.map((unitId) => ({
      unitId,
      meanDifference: avg(
        rows.filter((x) => x.unit !== unitId).map((x) => x.v! - x.h!),
      ),
    })),
    leaveFaultOut: d.faults.map((f) => ({
      faultId: f.id,
      meanDifference: avg(
        rows.filter((x) => x.fault !== f.id).map((x) => x.v! - x.h!),
      ),
    })),
  };
}
function exactPairP(
  rows: Array<{ unit: string; h: number | null; v: number | null }>,
  observed: number,
) {
  let extreme = 0,
    total = 2 ** rows.length;
  for (let mask = 0; mask < total; mask++) {
    const byUnit = new Map<string, number[]>();
    rows.forEach((row, i) => {
      const xs = byUnit.get(row.unit) ?? [];
      xs.push((row.v! - row.h!) * ((mask >> i) & 1 ? 1 : -1));
      byUnit.set(row.unit, xs);
    });
    const value = mean([...byUnit.values()].map(mean));
    if (Math.abs(value) >= observed - 1e-12) extreme++;
  }
  return extreme / total;
}

function missingReasons(
  metric: V2Metric,
  pairs: Map<string, Record<BenchmarkSubstrate, V2Cell>>,
) {
  const reasons: Record<string, number> = {};
  for (const pair of pairs.values())
    for (const substrate of ["hermes", "paperclip"] as const) {
      const measure = pair[substrate].measures[metric];
      if (measure.status === "unknown") {
        const key = `${substrate}:${measure.reason}`;
        reasons[key] = (reasons[key] ?? 0) + 1;
      }
    }
  return reasons;
}

function clusterInterval(
  metric: V2Metric,
  pairs: Map<string, Record<BenchmarkSubstrate, V2Cell>>,
  adjustedAlpha: number,
): [number, number] | null {
  const byUnit = new Map<string, number[]>();
  for (const pair of pairs.values()) {
    const h = observed(pair.hermes, metric),
      p = observed(pair.paperclip, metric);
    if (h === null || p === null) continue;
    const unit = pair.hermes.assignment.unitId,
      xs = byUnit.get(unit) ?? [];
    xs.push(p - h);
    byUnit.set(unit, xs);
  }
  const unitMeans = [...byUnit.values()].map(mean);
  if (unitMeans.length < 2 || !(adjustedAlpha > 0)) return null;
  const center = mean(unitMeans),
    variance =
      unitMeans.reduce((sum, x) => sum + (x - center) ** 2, 0) /
      (unitMeans.length - 1),
    halfWidth =
      studentTCritical(1 - adjustedAlpha / 2, unitMeans.length - 1) *
      Math.sqrt(variance / unitMeans.length);
  return [center - halfWidth, center + halfWidth];
}
function studentTCritical(probability: number, df: number) {
  let low = 0,
    high = 1;
  while (studentTCdf(high, df) < probability) high *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, df) < probability) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
function studentTCdf(t: number, df: number) {
  const tail = regularizedBeta(df / (df + t * t), df / 2, 0.5) / 2;
  return t >= 0 ? 1 - tail : tail;
}
function regularizedBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaFraction(x, a, b)) / a
    : 1 - (front * betaFraction(1 - x, b, a)) / b;
}
function betaFraction(x: number, a: number, b: number) {
  let c = 1,
    d = 1 - ((a + b) * x) / (a + 1),
    h: number;
  d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
  h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m,
      first = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2)),
      second = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + first * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + first / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    d = 1 + second * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + second / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return h;
}
function logGamma(z: number): number {
  const c = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return (
      Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
    );
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < c.length; i++) x += c[i]! / (z + i + 1);
  const t = z + c.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}
function balanceV2(a: V2Assignment[]) {
  const first = a.filter((x) => x.order === 0),
    count = (xs: V2Assignment[]): [number, number] => [
      xs.filter((x) => x.substrate === "hermes").length,
      xs.filter((x) => x.substrate === "paperclip").length,
    ],
    all = count(first),
    byUnit = Object.fromEntries(
      [...new Set(first.map((x) => x.unitId))].map((k) => [
        k,
        count(first.filter((x) => x.unitId === k)),
      ]),
    ),
    byFault = Object.fromEntries(
      [...new Set(first.map((x) => x.fault.id))].map((k) => [
        k,
        count(first.filter((x) => x.fault.id === k)),
      ]),
    );
  if (
    Math.abs(all[0] - all[1]) > 1 ||
    Object.values(byUnit).some((x) => Math.abs(x[0] - x[1]) > 1) ||
    Object.values(byFault).some((x) => Math.abs(x[0] - x[1]) > 1)
  )
    throw Error("V2 assignment imbalance");
  return { hermesFirst: all[0], paperclipFirst: all[1], byUnit, byFault };
}
