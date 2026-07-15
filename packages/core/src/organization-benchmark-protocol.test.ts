import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { WorkloadRegistry, benchmarkDigest, compileResults, createRun, openBundle, publicResult, sealBundle, transferReport, type BenchmarkTrust, type BenchmarkUnit, type ExecutionPolicy, type SimulatorContract, type TrialResult, type WorkloadPackage } from "./organization-benchmark-protocol";

const keys = Object.fromEntries(["registry", "environment", "candidate", "grader"].map((id) => [id, generateKeyPairSync("ed25519")]));
const trust: BenchmarkTrust = { sign: (id, digest) => sign(null, Buffer.from(digest), keys[id]!.privateKey).toString("base64"), verify: (id, digest, signature) => !!keys[id] && verify(null, Buffer.from(digest), keys[id]!.publicKey, Buffer.from(signature, "base64")) };
const unit = (id: string, kind: "coding" | "noncoding", partition: "train" | "dev" | "hidden-test", privacy: "public" | "restricted" | "secret" = "public"): BenchmarkUnit => ({ id, kind, partition, population: "repository-maintainers", outcome: "task-success", unit: "proportion", payload: { prompt: `private-${id}` }, answer: { expected: id }, rights: "evaluation-only", privacy, retentionMs: 86_400_000 });
const workload: WorkloadPackage = { schema: "autonomy.benchmark-workload.v1", id: "mixed-org-work", version: "1.0.0", units: [unit("coding-train", "coding", "train"), unit("ops-dev", "noncoding", "dev"), unit("coding-hidden", "coding", "hidden-test", "secret"), unit("ops-hidden", "noncoding", "hidden-test", "restricted")] };
const environment = { schema: "autonomy.benchmark-environment.v1" as const, imageDigest: "sha256:image", toolDigests: { git: "sha256:git" }, dependencyDigest: "sha256:lock", network: "disabled" as const, allowlist: [] };
const policy: ExecutionPolicy = { seed: 42, randomization: "seeded-permutation", replications: 3, maxAttemptsPerUnit: 2, stopping: { kind: "fixed-trials", trials: 6 }, missingData: "score-zero", multiplicity: { comparisons: 2, familywiseAlpha: .05 }, costUnits: ["usd", "tokens", "human-minutes"], contamination: { forbiddenDigests: ["sha256:hidden-answer"], candidateMustAttest: true } };
const simulator: SimulatorContract = { id: "maintainer-sim", version: "2.1.0", role: "repository maintainer answering clarification questions", allowedActions: ["answer"], forbiddenActions: ["edit-grader"], calibrationPopulation: "repository-maintainers", recordsPrivacy: "restricted", recordsRetentionMs: 1000 };

function setup() {
  const workloadBundle = sealBundle(workload, "registry", trust), environmentBundle = sealBundle(environment, "environment", trust);
  const attestation = sealBundle({ candidateAuthority: "candidate", corpusDigests: ["sha256:public-training"], createdAt: "2025-12-31T00:00:00Z" }, "candidate", trust);
  const run = createRun(workloadBundle, environmentBundle, "candidate", "grader", "sha256:external-scorer", policy, "2026-01-01T00:00:00Z", trust, simulator, attestation);
  return { workloadBundle, environmentBundle, run, runBundle: sealBundle(run, "grader", trust) };
}
function result(run: ReturnType<typeof setup>["run"], i: number, patch: Partial<TrialResult> = {}): TrialResult { const trial = run.assignedTrials[i]!; return { trialId: trial.trialId, unitId: trial.unitId, status: "observed", score: i % 2, attemptCount: 1, source: "system", costs: { usd: 1, tokens: 10 }, hiddenLaborMinutes: 0, provenance: [`trace:${i}`], ...patch }; }

describe("R22 immutable workload and hidden-test authority", () => {
  test("registers mixed coding/noncoding packages while hiding test payload and answer", () => {
    const registry = new WorkloadRegistry("registry", trust), bundle = sealBundle(workload, "registry", trust); registry.register(bundle);
    expect(registry.candidateUnits(workload.id, workload.version).map((u) => u.partition)).toEqual(["train", "dev"]);
    expect(registry.publicManifest(workload.id, workload.version).every((u) => !("payload" in u) && !("answer" in u) && !!u.payloadCommitment && !!u.answerCommitment)).toBe(true);
    expect(() => registry.graderUnits(workload.id, workload.version, "candidate")).toThrow("authority denied");
    expect(registry.graderUnits(workload.id, workload.version, "registry")).toHaveLength(4);
  });
  test("rejects tampering, forged signatures, and immutable-version equivocation", () => {
    const registry = new WorkloadRegistry("registry", trust), bundle = sealBundle(workload, "registry", trust); registry.register(bundle);
    const tampered = structuredClone(bundle); tampered.payload.units[0]!.answer = "changed";
    expect(() => openBundle(tampered, "registry", trust)).toThrow("immutability");
    expect(() => registry.register(sealBundle({ ...workload, units: [...workload.units, unit("extra", "coding", "train")] }, "registry", trust))).toThrow("equivocation");
    expect(() => registry.register(sealBundle(workload, "candidate", trust))).toThrow("signature");
  });
  test("requires all partitions and both task classes", () => {
    const registry = new WorkloadRegistry("registry", trust);
    expect(() => registry.register(sealBundle({ ...workload, units: workload.units.filter((u) => u.partition !== "dev") }, "registry", trust))).toThrow("dev partition");
    expect(() => registry.register(sealBundle({ ...workload, units: workload.units.filter((u) => u.kind === "coding") }, "registry", trust))).toThrow("noncoding");
  });
});

describe("R22 preregistration, randomization, and anti-cherry-picking", () => {
  test("requires independent grader and reproducibly assigns repeated hidden trials", () => {
    const a = setup(), b = setup(); expect(a.run.assignedTrials).toEqual(b.run.assignedTrials); expect(a.run.assignedTrials).toHaveLength(6);
    expect(new Set(a.run.assignedTrials.map((t) => t.unitId))).toEqual(new Set(["coding-hidden", "ops-hidden"]));
    expect(() => createRun(a.workloadBundle, a.environmentBundle, "candidate", "candidate", "scorer", policy, "2026-01-01T00:00:00Z", trust)).toThrow("externally authorized");
    expect(() => createRun(sealBundle(workload, "candidate", trust), a.environmentBundle, "candidate", "grader", "scorer", policy, "2026-01-01T00:00:00Z", trust)).toThrow("may not own workload");
    expect(() => createRun(a.workloadBundle, sealBundle(environment, "candidate", trust), "candidate", "grader", "scorer", policy, "2026-01-01T00:00:00Z", trust)).toThrow("may not own workload");
    const contaminated = sealBundle({ candidateAuthority: "candidate", corpusDigests: ["sha256:hidden-answer"], createdAt: "2025-12-31T00:00:00Z" }, "candidate", trust);
    expect(() => createRun(a.workloadBundle, a.environmentBundle, "candidate", "grader", "scorer", policy, "2026-01-01T00:00:00Z", trust, simulator, contaminated)).toThrow("attestation rejected");
  });
  test("failed and missing trials cannot disappear and retries cannot exceed policy", () => {
    const { run, runBundle } = setup(), complete = run.assignedTrials.map((_, i) => result(run, i));
    expect(() => compileResults(runBundle, complete.slice(1), "grader", trust, "2026-01-02T00:00:00Z")).toThrow("all assigned trials");
    expect(() => compileResults(runBundle, complete.map((r, i) => i ? r : { ...r, attemptCount: 3 }), "grader", trust, "2026-01-02T00:00:00Z")).toThrow("preregistered policy");
    const mixed = complete.map((r, i) => i === 0 ? { ...r, status: "failed" as const, score: undefined } : i === 1 ? { ...r, status: "missing" as const, score: undefined } : r);
    const bundle = compileResults(runBundle, mixed, "grader", trust, "2026-01-02T00:00:00Z");
    expect(bundle.summary).toEqual(expect.objectContaining({ assigned: 6, observed: 4, failed: 1, missing: 1, denominator: 6 }));
  });
  test("locks scorer/environment/policy and rejects candidate-signed result authority", () => {
    const { run, runBundle } = setup(), results = run.assignedTrials.map((_, i) => result(run, i));
    expect(() => compileResults({ ...runBundle, signer: "candidate", signature: trust.sign("candidate", runBundle.digest) }, results, "grader", trust, "2026-01-02T00:00:00Z")).toThrow("signature");
    const output = compileResults(runBundle, results, "grader", trust, "2026-01-02T00:00:00Z"); expect(output.scorerDigest).toBe("sha256:external-scorer");
  });
});

describe("R22 variance, cost, privacy, and human-simulator separation", () => {
  test("reports repeated-run sample variance, multiplicity-adjusted CI, all costs and hidden labor", () => {
    const { run, runBundle } = setup(), results = run.assignedTrials.map((_, i) => result(run, i, { hiddenLaborMinutes: i === 0 ? 5 : 0 }));
    const output = compileResults(runBundle, results, "grader", trust, "2026-01-02T00:00:00Z");
    expect(output.summary.sampleVariance).toBeGreaterThan(0); expect(output.summary.confidenceInterval[0]).toBeLessThan(output.summary.mean); expect(output.summary.adjustedAlpha).toBe(.025);
    expect(output.summary.costs).toEqual({ usd: 6, tokens: 60 }); expect(output.summary.hiddenLaborMinutes).toBe(5);
  });
  test("public result contains statuses and aggregate cost but no task content, answers, raw provenance, or private simulator records", () => {
    const { run, runBundle } = setup(), results = run.assignedTrials.map((_, i) => result(run, i));
    const signed = sealBundle(compileResults(runBundle, results, "grader", trust, "2026-01-02T00:00:00Z"), "grader", trust), exposed = publicResult(signed, "grader", trust), json = JSON.stringify(exposed);
    expect(exposed.trialStatuses).toHaveLength(6); expect(exposed.summary.costs).toEqual({ usd: 6, tokens: 60 }); for (const forbidden of ["private-", "expected", "trace:"]) expect(json).not.toContain(forbidden);
    const forged = structuredClone(signed); forged.payload.summary.mean = 1; expect(() => publicResult(forged, "grader", trust)).toThrow("immutability");
  });
  test("never presents simulator observations as humans and leaves transfer unavailable without real humans", () => {
    const { run, runBundle } = setup(), results = run.assignedTrials.map((_, i) => result(run, i, { source: "human-simulator", simulatorId: simulator.id, simulatorVersion: simulator.version, population: simulator.calibrationPopulation }));
    const output = compileResults(runBundle, results, "grader", trust, "2026-01-02T00:00:00Z"), transfer = transferReport(simulator, results);
    expect(output.summary.bySource["human-simulator"].count).toBe(6); expect(output.summary.bySource["real-human"].count).toBe(0);
    expect(transfer).toEqual(expect.objectContaining({ status: "real-human-evidence-unavailable", realHumanCount: 0, absoluteTransferError: null }));
    const measured = transferReport(simulator, [...results, { ...result(run, 0), trialId: "external-human-observation", source: "real-human", population: simulator.calibrationPopulation, score: 1 }]);
    expect(measured.status).toBe("measured"); expect(measured.absoluteTransferError).not.toBeNull();
    const wrongVersion = results.map((r) => ({ ...r, simulatorVersion: "unregistered" })); expect(() => compileResults(runBundle, wrongVersion, "grader", trust, "2026-01-02T00:00:00Z")).toThrow("preregistered contract");
  });
  test("bundle digest changes under contamination-policy or stopping-rule manipulation", () => {
    const { run } = setup();
    expect(benchmarkDigest({ ...run, policy: { ...run.policy, contamination: { ...run.policy.contamination, forbiddenDigests: [] } } })).not.toBe(benchmarkDigest(run));
    expect(benchmarkDigest({ ...run, policy: { ...run.policy, stopping: { kind: "fixed-trials", trials: 1 } } })).not.toBe(benchmarkDigest(run));
  });
});
