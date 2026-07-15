import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type TaskKind = "coding" | "noncoding";
export type DatasetPartition = "train" | "dev" | "hidden-test";
export type ObservationSource = "system" | "human-simulator" | "real-human";
export type MissingDataTreatment = "score-zero" | "exclude-with-bound" | "impute-declared";

export type BenchmarkUnit = {
  id: string;
  kind: TaskKind;
  partition: DatasetPartition;
  population: string;
  outcome: string;
  unit: string;
  payload: unknown;
  answer: unknown;
  rights: string;
  privacy: "public" | "restricted" | "secret";
  retentionMs: number;
};

export type PublicUnit = Omit<BenchmarkUnit, "payload" | "answer"> & { payloadCommitment: string; answerCommitment: string };
export type WorkloadPackage = { schema: "autonomy.benchmark-workload.v1"; id: string; version: string; units: BenchmarkUnit[] };
export type EnvironmentLock = { schema: "autonomy.benchmark-environment.v1"; imageDigest: string; toolDigests: Record<string, string>; dependencyDigest: string; network: "disabled" | "allowlisted"; allowlist: string[] };
export type SimulatorContract = { id: string; version: string; role: string; allowedActions: string[]; forbiddenActions: string[]; calibrationPopulation: string; recordsPrivacy: "restricted" | "secret"; recordsRetentionMs: number };
export type ContaminationAttestation = { candidateAuthority: string; corpusDigests: string[]; createdAt: string };
export type ExecutionPolicy = {
  seed: number;
  randomization: "seeded-permutation";
  replications: number;
  maxAttemptsPerUnit: number;
  stopping: { kind: "fixed-trials"; trials: number };
  missingData: MissingDataTreatment;
  imputedScore?: number;
  multiplicity: { comparisons: number; familywiseAlpha: number };
  costUnits: string[];
  contamination: { forbiddenDigests: string[]; candidateMustAttest: boolean };
};

export type SignedBundle<T> = { payload: T; digest: string; signer: string; signature: string };
export interface BenchmarkTrust { sign(signer: string, digest: string): string; verify(signer: string, digest: string, signature: string): boolean }

export type BenchmarkRun = {
  schema: "autonomy.benchmark-run.v1";
  id: string;
  workloadDigest: string;
  environmentDigest: string;
  candidateAuthority: string;
  graderAuthority: string;
  scorerDigest: string;
  contaminationAttestationDigest?: string;
  policy: ExecutionPolicy;
  assignedTrials: Array<{ trialId: string; unitId: string; replication: number }>;
  simulator?: SimulatorContract;
  createdAt: string;
};

export type TrialResult = {
  trialId: string;
  unitId: string;
  status: "observed" | "failed" | "missing";
  score?: number;
  attemptCount: number;
  source: ObservationSource;
  simulatorId?: string;
  simulatorVersion?: string;
  population?: string;
  costs: Record<string, number>;
  hiddenLaborMinutes: number;
  provenance: string[];
};

export type ResultSummary = {
  assigned: number;
  observed: number;
  failed: number;
  missing: number;
  denominator: number;
  mean: number;
  sampleVariance: number;
  confidenceInterval: [number, number];
  adjustedAlpha: number;
  costs: Record<string, number>;
  hiddenLaborMinutes: number;
  bySource: Record<ObservationSource, { count: number; mean: number | null }>;
};
export type BenchmarkResultBundle = { schema: "autonomy.benchmark-result.v1"; runDigest: string; scorerDigest: string; results: TrialResult[]; summary: ResultSummary; completedAt: string };

export type TransferReport = {
  simulatorId: string;
  simulatorVersion: string;
  calibrationPopulation: string;
  simulatorCount: number;
  realHumanCount: number;
  simulatorMean: number | null;
  realHumanMean: number | null;
  absoluteTransferError: number | null;
  status: "measured" | "real-human-evidence-unavailable";
};

export function sealBundle<T>(payload: T, signer: string, trust: BenchmarkTrust): SignedBundle<T> {
  if (!signer) throw new Error("bundle signer required");
  const digest = benchmarkDigest(payload);
  return { payload: structuredClone(payload), digest, signer, signature: trust.sign(signer, digest) };
}

export function openBundle<T>(bundle: SignedBundle<T>, expectedSigner: string, trust: BenchmarkTrust): T {
  const digest = benchmarkDigest(bundle.payload);
  if (bundle.signer !== expectedSigner || bundle.digest !== digest || !trust.verify(bundle.signer, digest, bundle.signature)) throw new Error("benchmark bundle signature or immutability failure");
  return structuredClone(bundle.payload);
}

export class WorkloadRegistry {
  private packages = new Map<string, SignedBundle<WorkloadPackage>>();
  constructor(private registryAuthority: string, private trust: BenchmarkTrust) {}
  register(bundle: SignedBundle<WorkloadPackage>) {
    const workload = openBundle(bundle, this.registryAuthority, this.trust);
    validateWorkload(workload);
    const key = `${workload.id}@${workload.version}`;
    const prior = this.packages.get(key);
    if (prior && prior.digest !== bundle.digest) throw new Error("immutable workload version equivocation");
    this.packages.set(key, structuredClone(bundle));
  }
  publicManifest(id: string, version: string): PublicUnit[] {
    const workload = this.load(id, version);
    return workload.units.map(({ payload, answer, ...unit }) => ({ ...unit, payloadCommitment: benchmarkDigest(payload), answerCommitment: benchmarkDigest(answer) }));
  }
  candidateUnits(id: string, version: string): BenchmarkUnit[] { return this.load(id, version).units.filter((u) => u.partition !== "hidden-test").map(structuredCloneSafe); }
  graderUnits(id: string, version: string, authority: string): BenchmarkUnit[] { if (authority !== this.registryAuthority) throw new Error("hidden workload authority denied"); return this.load(id, version).units.map(structuredCloneSafe); }
  private load(id: string, version: string) { const bundle = this.packages.get(`${id}@${version}`); if (!bundle) throw new Error("workload not registered"); return openBundle(bundle, this.registryAuthority, this.trust); }
}

export function createRun(workload: SignedBundle<WorkloadPackage>, environment: SignedBundle<EnvironmentLock>, candidateAuthority: string, graderAuthority: string, scorerDigest: string, policy: ExecutionPolicy, createdAt: string, trust: BenchmarkTrust, simulator?: SimulatorContract, contaminationAttestation?: SignedBundle<ContaminationAttestation>): BenchmarkRun {
  if (!candidateAuthority || !graderAuthority || candidateAuthority === graderAuthority) throw new Error("grader must be externally authorized");
  if (workload.signer === candidateAuthority || environment.signer === candidateAuthority) throw new Error("candidate may not own workload criteria or environment lock");
  const openedWorkload = openBundle(workload, workload.signer, trust), openedEnvironment = openBundle(environment, environment.signer, trust);
  validateWorkload(openedWorkload); validateEnvironment(openedEnvironment);
  validatePolicy(policy);
  if (!scorerDigest || !Number.isFinite(Date.parse(createdAt))) throw new Error("run preregistration invalid");
  if (simulator) validateSimulator(simulator);
  let contaminationAttestationDigest: string | undefined;
  if (policy.contamination.candidateMustAttest) {
    if (!contaminationAttestation) throw new Error("candidate contamination attestation required");
    const attestation = openBundle(contaminationAttestation, candidateAuthority, trust);
    if (attestation.candidateAuthority !== candidateAuthority || !Number.isFinite(Date.parse(attestation.createdAt)) || attestation.corpusDigests.some((digest) => policy.contamination.forbiddenDigests.includes(digest))) throw new Error("candidate contamination attestation rejected");
    contaminationAttestationDigest = contaminationAttestation.digest;
  }
  const hidden = workload.payload.units.filter((u) => u.partition === "hidden-test").map((u) => u.id);
  if (!hidden.length) throw new Error("hidden test partition required");
  const assignedTrials = seededPermutation(hidden.flatMap((unitId) => Array.from({ length: policy.replications }, (_, replication) => ({ trialId: benchmarkDigest({ unitId, replication, seed: policy.seed }), unitId, replication }))), policy.seed);
  if (policy.stopping.trials !== assignedTrials.length) throw new Error("fixed stopping count must equal assigned trials");
  const body = { workloadDigest: workload.digest, environmentDigest: environment.digest, candidateAuthority, graderAuthority, scorerDigest, contaminationAttestationDigest, policy, assignedTrials, simulator, createdAt };
  return { schema: "autonomy.benchmark-run.v1", id: benchmarkDigest(body), ...body };
}

export function compileResults(runBundle: SignedBundle<BenchmarkRun>, results: TrialResult[], graderAuthority: string, trust: BenchmarkTrust, completedAt: string): BenchmarkResultBundle {
  const run = openBundle(runBundle, graderAuthority, trust);
  if (run.graderAuthority !== graderAuthority || !Number.isFinite(Date.parse(completedAt))) throw new Error("result authority or timestamp invalid");
  const assigned = new Map(run.assignedTrials.map((t) => [t.trialId, t]));
  if (results.length !== assigned.size || new Set(results.map((r) => r.trialId)).size !== results.length) throw new Error("all assigned trials must appear exactly once");
  for (const result of results) {
    const trial = assigned.get(result.trialId);
    if (!trial || trial.unitId !== result.unitId) throw new Error("unassigned or rebound trial result");
    validateTrial(result, run.policy);
    if (result.source === "human-simulator" && (!run.simulator || result.simulatorId !== run.simulator.id || result.simulatorVersion !== run.simulator.version || result.population !== run.simulator.calibrationPopulation)) throw new Error("simulator result does not match preregistered contract");
  }
  const scores = results.map((r) => effectiveScore(r, run.policy)).filter((n): n is number => n !== undefined);
  const mean = average(scores), sampleVariance = variance(scores, mean), adjustedAlpha = run.policy.multiplicity.familywiseAlpha / run.policy.multiplicity.comparisons;
  const critical = scores.length > 1 ? studentCritical(adjustedAlpha, scores.length - 1) : Number.POSITIVE_INFINITY;
  const halfWidth = scores.length > 1 ? critical * Math.sqrt(sampleVariance / scores.length) : Number.POSITIVE_INFINITY;
  const sourceSummary = (source: ObservationSource) => { const selected = results.filter((r) => r.source === source).map((r) => effectiveScore(r, run.policy)).filter((n): n is number => n !== undefined); return { count: selected.length, mean: selected.length ? average(selected) : null }; };
  const summary: ResultSummary = {
    assigned: assigned.size, observed: results.filter((r) => r.status === "observed").length, failed: results.filter((r) => r.status === "failed").length, missing: results.filter((r) => r.status === "missing").length,
    denominator: scores.length, mean, sampleVariance, confidenceInterval: [mean - halfWidth, mean + halfWidth], adjustedAlpha,
    costs: sumCosts(results), hiddenLaborMinutes: results.reduce((n, r) => n + r.hiddenLaborMinutes, 0),
    bySource: { system: sourceSummary("system"), "human-simulator": sourceSummary("human-simulator"), "real-human": sourceSummary("real-human") },
  };
  return { schema: "autonomy.benchmark-result.v1", runDigest: runBundle.digest, scorerDigest: run.scorerDigest, results: results.map(structuredCloneSafe), summary, completedAt };
}

export function transferReport(contract: SimulatorContract, results: TrialResult[]): TransferReport {
  validateSimulator(contract);
  const simulator = results.filter((r) => r.source === "human-simulator" && r.simulatorId === contract.id && r.simulatorVersion === contract.version && r.population === contract.calibrationPopulation && r.status === "observed").map((r) => r.score!);
  const humans = results.filter((r) => r.source === "real-human" && r.population === contract.calibrationPopulation && r.status === "observed").map((r) => r.score!);
  const simulatorMean = simulator.length ? average(simulator) : null, realHumanMean = humans.length ? average(humans) : null;
  return { simulatorId: contract.id, simulatorVersion: contract.version, calibrationPopulation: contract.calibrationPopulation, simulatorCount: simulator.length, realHumanCount: humans.length, simulatorMean, realHumanMean, absoluteTransferError: simulatorMean === null || realHumanMean === null ? null : Math.abs(simulatorMean - realHumanMean), status: humans.length ? "measured" : "real-human-evidence-unavailable" };
}

export function publicResult(bundle: SignedBundle<BenchmarkResultBundle>, graderAuthority: string, trust: BenchmarkTrust): Omit<BenchmarkResultBundle, "results"> & { trialStatuses: Array<{ trialId: string; status: TrialResult["status"]; source: ObservationSource }> } {
  const { results, ...safe } = openBundle(bundle, graderAuthority, trust);
  return { ...structuredClone(safe), trialStatuses: results.map((r) => ({ trialId: r.trialId, status: r.status, source: r.source })) };
}

function validateWorkload(workload: WorkloadPackage) {
  if (workload.schema !== "autonomy.benchmark-workload.v1" || !workload.id || !workload.version || !workload.units.length || new Set(workload.units.map((u) => u.id)).size !== workload.units.length) throw new Error("invalid workload package");
  if (!workload.units.some((u) => u.kind === "coding") || !workload.units.some((u) => u.kind === "noncoding")) throw new Error("coding and noncoding tasks required");
  for (const partition of ["train", "dev", "hidden-test"] as const) if (!workload.units.some((u) => u.partition === partition)) throw new Error(`${partition} partition required`);
  if (workload.units.some((u) => !u.population || !u.outcome || !u.unit || !u.rights || u.retentionMs < 0)) throw new Error("workload unit metadata incomplete");
}
function validatePolicy(p: ExecutionPolicy) { if (!Number.isSafeInteger(p.seed) || p.randomization !== "seeded-permutation" || !Number.isSafeInteger(p.replications) || p.replications < 2 || !Number.isSafeInteger(p.maxAttemptsPerUnit) || p.maxAttemptsPerUnit < 1 || p.stopping.kind !== "fixed-trials" || !Number.isSafeInteger(p.stopping.trials) || p.stopping.trials < 1 || !Number.isSafeInteger(p.multiplicity.comparisons) || p.multiplicity.comparisons < 1 || p.multiplicity.familywiseAlpha <= 0 || p.multiplicity.familywiseAlpha >= 1 || !p.costUnits.length || new Set(p.costUnits).size !== p.costUnits.length || (p.missingData === "impute-declared" && !Number.isFinite(p.imputedScore))) throw new Error("benchmark execution policy invalid"); }
function validateEnvironment(e: EnvironmentLock) { if (e.schema !== "autonomy.benchmark-environment.v1" || !e.imageDigest || !e.dependencyDigest || !Object.keys(e.toolDigests).length || Object.values(e.toolDigests).some((x) => !x) || e.network === "disabled" && e.allowlist.length || e.network === "allowlisted" && !e.allowlist.length || new Set(e.allowlist).size !== e.allowlist.length) throw new Error("benchmark environment lock invalid"); }
function validateSimulator(s: SimulatorContract) { if (!s.id || !s.version || !s.role || !s.calibrationPopulation || !s.allowedActions.length || !s.forbiddenActions.length || s.recordsRetentionMs < 0) throw new Error("simulator contract invalid"); }
function validateTrial(r: TrialResult, p: ExecutionPolicy) {
  if (r.attemptCount < 1 || r.attemptCount > p.maxAttemptsPerUnit || r.hiddenLaborMinutes < 0 || Object.entries(r.costs).some(([unit, n]) => !p.costUnits.includes(unit) || !Number.isFinite(n) || n < 0) || (r.status === "observed" && !Number.isFinite(r.score)) || (r.status !== "observed" && r.score !== undefined)) throw new Error("trial result violates preregistered policy");
  if (r.source === "human-simulator" && (!r.simulatorId || !r.simulatorVersion || !r.population)) throw new Error("simulator result lacks versioned calibration identity");
  if (r.source === "real-human" && !r.population) throw new Error("real-human result lacks population");
}
function effectiveScore(r: TrialResult, p: ExecutionPolicy) { if (r.status === "observed") return r.score!; if (r.status === "failed" || p.missingData === "score-zero") return 0; if (p.missingData === "impute-declared") return p.imputedScore!; return undefined; }
function average(v: number[]) { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
function variance(v: number[], mean: number) { return v.length > 1 ? v.reduce((n, x) => n + (x - mean) ** 2, 0) / (v.length - 1) : 0; }
// Acklam inverse-normal approximation plus a Student-t Cornish-Fisher expansion.
function studentCritical(twoSidedAlpha: number, df: number) { const z = inverseNormal(1 - twoSidedAlpha / 2), z2 = z * z, z3 = z2 * z, z5 = z3 * z2, z7 = z5 * z2; return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3); }
function inverseNormal(p: number) { if (!(p > 0 && p < 1)) throw new Error("normal quantile probability invalid"); const a = [-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924], b = [-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857], c = [-.00778489400243029,-.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878], d = [.00778469570904146,.32246712907004,2.445134137143,3.75440866190742], lo = .02425, hi = 1 - lo; if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1); } if (p > hi) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1); } const q = p - .5, r = q * q; return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1); }
function sumCosts(results: TrialResult[]) { const out: Record<string, number> = {}; for (const result of results) for (const [unit, value] of Object.entries(result.costs)) out[unit] = (out[unit] ?? 0) + value; return out; }
function seededPermutation<T>(values: T[], seed: number) { const out = [...values]; let state = seed >>> 0; const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; } return out; }
function structuredCloneSafe<T>(value: T) { return structuredClone(value); }
export function benchmarkDigest(value: unknown) { return createHash("sha256").update(canonicalSemanticJson(value)).digest("hex"); }
