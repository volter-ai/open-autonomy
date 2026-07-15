import { describe, expect, test } from "bun:test";
import { createHmac, generateKeyPairSync, sign as edSign } from "node:crypto";
import {
  analyzeMatchedV2,
  collectDifferences,
  executeMatchedBenchmark,
  finalizeMatchedBenchmark,
  matchedBenchmarkDigest,
  pairedEstimates,
  planMatchedCells,
  planMatchedV2,
  signMatchedV2,
  verifyMatchedV2,
  V2_METRICS,
  verifyMatchedResult,
  type BenchmarkResultSigner,
  type BenchmarkSubstrate,
  type CellAssignment,
  type CellEvidence,
  type MatchedBenchmarkLock,
  type MatchedCellRunner,
  type V2Design,
  type V2Cell,
} from "./organization-matched-benchmark";

const lock: MatchedBenchmarkLock = {
  schema: "autonomy.matched-benchmark-lock.v1",
  canonicalOrganizationDigest: "sha256:organization",
  workloadDigest: "sha256:workload",
  environmentDigest: "sha256:environment",
  modelDigest: "sha256:model",
  toolDigests: { git: "sha256:git" },
  repositoryDigest: "sha256:repo",
  workerHarnessDigest: "sha256:harness",
  sessionPolicyDigest: "sha256:session",
  promptDigest: "sha256:prompt",
  skillDigest: "sha256:skills",
  contextDigest: "sha256:context",
  rendererDigest: "sha256:renderer",
  isolationDigest: "sha256:isolation",
  credentialScopeDigest: "sha256:credentials",
  seed: 73,
  repetitions: 3,
  timeoutMs: 10_000,
  providerRevisions: { hermes: "hermes@abc", paperclip: "paperclip@def" },
  matchedFaults: [{ id: "dependency-loss", digest: "sha256:fault" }],
};
const signer: BenchmarkResultSigner = {
  signer: "external-grader",
  sign: (d) => createHmac("sha256", "test-grader-key").update(d).digest("hex"),
  verify(d, s) {
    return this.sign(d) === s;
  },
};

function evidence(
  a: CellAssignment,
  patch: Partial<CellEvidence> = {},
): CellEvidence {
  const delta = a.substrate === "hermes" ? 0 : 1;
  return {
    pairId: a.pairId,
    trialId: a.trial.id,
    unitId: a.trial.unitId,
    substrate: a.substrate,
    lockDigest: matchedBenchmarkDigest(lock),
    canonicalOrganizationDigest: lock.canonicalOrganizationDigest,
    providerRevision: lock.providerRevisions[a.substrate],
    faultDigest: a.fault?.digest,
    status: "success",
    portableScore: 0.8 + delta * 0.01,
    portableOutcomeDigest: `outcome-${delta}`,
    portableTrace: [{ portable: true, trial: a.trial.id }],
    nativeTrace: [{ substrate: a.substrate }],
    measures: {
      wallTimeMs: 100 + delta * 10,
      cpuMs: 50 + delta,
      memoryByteMs: 1000 + delta,
      tokens: 20 + delta,
      computeUnits: 2 + delta,
      moneyUsd: 0.1 + delta * 0.01,
      humanMinutes: 0,
    },
    failures: [],
    unattributedHumanAssistance: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.100Z",
    ...patch,
  };
}
class FakeRunner implements MatchedCellRunner {
  constructor(
    private mutate: (a: CellAssignment, e: CellEvidence) => CellEvidence = (
      _a,
      e,
    ) => e,
  ) {}
  async execute(a: CellAssignment) {
    return this.mutate(a, evidence(a));
  }
}

describe("R24 locked matched-cell planning and execution", () => {
  test("randomizes order reproducibly while assigning identical trials and matched faults", () => {
    const a = planMatchedCells(lock, ["coding", "noncoding"]),
      b = planMatchedCells(lock, ["coding", "noncoding"]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    for (const pairId of new Set(a.map((x) => x.pairId))) {
      const pair = a.filter((x) => x.pairId === pairId);
      expect(new Set(pair.map((x) => x.substrate))).toEqual(
        new Set(["hermes", "paperclip"]),
      );
      expect(new Set(pair.map((x) => x.trial.id)).size).toBe(1);
      expect(new Set(pair.map((x) => x.fault?.digest)).size).toBe(1);
    }
    expect(
      new Set(a.filter((x) => x.order === 0).map((x) => x.substrate)),
    ).toEqual(new Set(["hermes", "paperclip"]));
  });
  test("collects complete raw portable/native traces, revisions and resource evidence", async () => {
    const run = await executeMatchedBenchmark(lock, ["coding"], {
      hermes: new FakeRunner(),
      paperclip: new FakeRunner(),
    });
    expect(run.evidence).toHaveLength(6);
    expect(
      run.evidence.every(
        (e) =>
          e.portableTrace.length && e.nativeTrace.length && e.providerRevision,
      ),
    ).toBe(true);
  });
  test("finalizes a valid multi-unit randomized plan regardless of caller unit order", async () => {
    const run = await executeMatchedBenchmark(lock, ["noncoding", "coding"], {
        hermes: new FakeRunner(),
        paperclip: new FakeRunner(),
      }),
      differences = collectDifferences(run.evidence),
      triage = differences.map((d) => ({
        differenceId: d.id,
        disposition: "explained" as const,
        rationale: "synthetic matched residual",
        owner: "reviewer",
        evidence: ["synthetic:trace"],
      }));
    expect(() =>
      finalizeMatchedBenchmark(
        lock,
        run.assignments,
        run.evidence,
        triage,
        "2026-01-02T00:00:00Z",
        signer,
      ),
    ).not.toThrow();
  });
  test("rejects easier tasks, lock drift, provider specialization, unmatched fault and hidden manual help", async () => {
    const bad = async (
      mutate: (a: CellAssignment, e: CellEvidence) => CellEvidence,
    ) =>
      executeMatchedBenchmark(lock, ["coding"], {
        hermes: new FakeRunner(),
        paperclip: new FakeRunner(mutate),
      });
    await expect(
      bad((_a, e) => ({ ...e, unitId: "easier-task" })),
    ).rejects.toThrow("not bound");
    await expect(
      bad((_a, e) => ({ ...e, lockDigest: "different" })),
    ).rejects.toThrow("not bound");
    await expect(
      bad((_a, e) => ({
        ...e,
        canonicalOrganizationDigest: "provider-specialized",
      })),
    ).rejects.toThrow("not bound");
    await expect(
      bad((_a, e) => ({ ...e, faultDigest: "easier-fault" })),
    ).rejects.toThrow("not bound");
    await expect(
      bad((_a, e) => ({ ...e, unattributedHumanAssistance: true })),
    ).rejects.toThrow("unattributed");
  });
});

describe("replayable preregistered matched benchmark V2", () => {
  const design: V2Design = {
    schema: "autonomy.matched-design.v2",
    seed: 73,
    units: ["a", "b"],
    repetitions: 2,
    faults: [{ id: "none", digest: `sha256:${"f".repeat(64)}` }],
    primaryEndpoint: "portableScore",
    alpha: 0.05,
    multiplicity: "holm",
    missingness: "complete-pair",
    failureEstimand: "worst-score-and-observed-resources",
    strata: ["unit", "fault"],
    permutations: "exact-pair-swap",
  };
  const cells = (selectedDesign: V2Design = design) =>
      planMatchedV2(selectedDesign).map((a): V2Cell => {
        const providerEvidence = { run: a.pairId, substrate: a.substrate },
          providerEvidenceDigest = matchedBenchmarkDigest(providerEvidence),
          measures: any = {};
        for (const m of V2_METRICS)
          measures[m] = {
            status: "observed",
            value:
              m === "portableScore"
                ? a.substrate === "paperclip"
                  ? 0.9
                  : 0.8
                : 1,
            unit: m,
            provenance: "native meter",
            raw: {
              meter: m,
              value:
                m === "portableScore"
                  ? a.substrate === "paperclip"
                    ? 0.9
                    : 0.8
                  : 1,
            },
            rawDigest: matchedBenchmarkDigest({
              meter: m,
              value:
                m === "portableScore"
                  ? a.substrate === "paperclip"
                    ? 0.9
                    : 0.8
                  : 1,
            }),
          };
        return {
          assignment: a,
          status: "success",
          measures,
          providerEvidence,
          providerEvidenceDigest,
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:00:01Z",
        };
      }),
    pv = (c: V2Cell) => ({
      accepted: true as const,
      digest: matchedBenchmarkDigest(c.providerEvidence),
    });
  test("replays blocked plan, exact randomization inference, sensitivities and public signature", () => {
    const a = planMatchedV2(design),
      r = analyzeMatchedV2(design, a, cells(), pv, "2026-01-02T00:00:00Z"),
      { privateKey, publicKey } = generateKeyPairSync("ed25519"),
      priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      pub = publicKey.export({ type: "spki", format: "pem" }).toString(),
      trust = { keyId: "grader-key-1", publicKeyPem: pub },
      b = signMatchedV2(r, priv, pub, trust.keyId);
    expect(r.estimates).toHaveLength(V2_METRICS.length);
    expect(r.estimates[0]!.randomizationP).not.toBeNull();
    expect(verifyMatchedV2(b, pv, trust)).toEqual(r);
    const invalid = structuredClone(b);
    invalid.result.estimates[0]!.meanDifference = 999;
    invalid.digest = matchedBenchmarkDigest(invalid.result);
    invalid.signature = edSign(
      null,
      Buffer.from(invalid.digest),
      privateKey,
    ).toString("base64");
    expect(() => verifyMatchedV2(invalid, pv, trust)).toThrow(
      "semantic replay",
    );
    const attacker = generateKeyPairSync("ed25519"),
      attackerPrivate = attacker.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      attackerPublic = attacker.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      selfSigned = signMatchedV2(
        r,
        attackerPrivate,
        attackerPublic,
        "attacker-key",
      );
    expect(() => verifyMatchedV2(selfSigned, pv, trust)).toThrow(
      "public signature",
    );
  });
  test("keeps unknown distinct from zero and excludes incomplete pairs per preregistration", () => {
    const cs = cells(),
      missingSubstrate = cs[0]!.assignment.substrate;
    cs[0]!.measures.moneyUsd = {
      status: "unknown",
      value: null,
      unit: "USD",
      reason: "no billing meter",
      provenance: "provider unavailable",
    };
    const r = analyzeMatchedV2(
        design,
        planMatchedV2(design),
        cs,
        pv,
        "2026-01-02T00:00:00Z",
      ),
      money = r.estimates.find((x) => x.metric === "moneyUsd")!;
    expect(money.pairs).toBe(3);
    expect(money.meanDifference).toBe(0);
    expect(money.missingness).toEqual({
      completePairs: 3,
      excludedPairs: 1,
      reasons: { [`${missingSubstrate}:no billing meter`]: 1 },
    });
  });
  test("counterbalances every unit and fault across seeds", () => {
    const balanced: V2Design = {
      ...design,
      units: ["a", "b", "c"],
      repetitions: 4,
      faults: [
        { id: "network", digest: `sha256:${"a".repeat(64)}` },
        { id: "storage", digest: `sha256:${"b".repeat(64)}` },
      ],
    };
    for (let seed = 0; seed < 128; seed++) {
      const first = planMatchedV2({ ...balanced, seed }).filter(
        (x) => x.order === 0,
      );
      for (const key of balanced.units) {
        const xs = first.filter((x) => x.unitId === key),
          h = xs.filter((x) => x.substrate === "hermes").length;
        expect(h).toBe(xs.length / 2);
      }
      for (const fault of balanced.faults) {
        const xs = first.filter((x) => x.fault.id === fault.id),
          h = xs.filter((x) => x.substrate === "hermes").length;
        expect(h).toBe(xs.length / 2);
      }
    }
  });
  test("rejects altered raw evidence even when the reported value is unchanged", () => {
    const cs = cells();
    const score = cs[0]!.measures.portableScore;
    if (score.status !== "observed") throw Error("test fixture invalid");
    score.raw = { changed: true };
    expect(() =>
      analyzeMatchedV2(
        design,
        planMatchedV2(design),
        cs,
        pv,
        "2026-01-02T00:00:00Z",
      ),
    ).toThrow("measure provenance");
  });
  test("does not rank secondary endpoints when the primary gate is closed", () => {
    const powered = { ...design, repetitions: 8 },
      cs = cells(powered);
    for (const cell of cs) {
      const score = cell.measures.portableScore,
        wall = cell.measures.wallTimeMs;
      if (score.status !== "observed" || wall.status !== "observed")
        throw Error("test fixture invalid");
      score.value = 0.8;
      score.raw = { meter: "portableScore", value: 0.8 };
      score.rawDigest = matchedBenchmarkDigest(score.raw);
      wall.value = cell.assignment.substrate === "paperclip" ? 2 : 1;
      wall.raw = { meter: "wallTimeMs", value: wall.value };
      wall.rawDigest = matchedBenchmarkDigest(wall.raw);
    }
    const result = analyzeMatchedV2(
        powered,
        planMatchedV2(powered),
        cs,
        pv,
        "2026-01-02T00:00:00Z",
      ),
      wall = result.estimates.find((x) => x.metric === "wallTimeMs")!;
    expect(wall.randomizationP).toBeLessThan(wall.adjustedAlpha);
    expect(wall.simultaneousInterval).toEqual([1, 1]);
    expect(wall.conclusion).toBe("inconclusive");
  });
  test("uses one consistent equal-unit estimand under unequal missingness", () => {
    const cs = cells();
    for (const cell of cs) {
      const wall = cell.measures.wallTimeMs;
      if (wall.status !== "observed") throw Error("test fixture invalid");
      wall.value =
        cell.assignment.unitId === "a" &&
        cell.assignment.substrate === "paperclip"
          ? 11
          : 1;
      wall.raw = { meter: "wallTimeMs", value: wall.value };
      wall.rawDigest = matchedBenchmarkDigest(wall.raw);
    }
    const excluded = cs.find((x) => x.assignment.unitId === "a")!;
    excluded.measures.wallTimeMs = {
      status: "unknown",
      value: null,
      unit: "ms",
      reason: "meter unavailable",
      provenance: "provider readback",
    };
    const wall = analyzeMatchedV2(
      design,
      planMatchedV2(design),
      cs,
      pv,
      "2026-01-02T00:00:00Z",
    ).estimates.find((x) => x.metric === "wallTimeMs")!;
    expect(wall.meanDifference).toBe(5);
    expect(wall.simultaneousInterval).not.toBeNull();
    expect(
      (wall.simultaneousInterval![0] + wall.simultaneousInterval![1]) / 2,
    ).toBeCloseTo(5);
    expect(wall.intervalMethod).toBe("unit-cluster-student-t");
  });
  test("rejects malformed runtime design shapes, policies, strata and digests", () => {
    for (const bad of [
      { ...design, units: null },
      { ...design, faults: null },
      { ...design, faults: [null] },
      { ...design, multiplicity: "none" },
      { ...design, strata: ["fault", "unit"] },
      { ...design, faults: [{ id: "none", digest: "not-a-digest" }] },
    ])
      expect(() => planMatchedV2(bad as never)).toThrow("design invalid");
  });
});

describe("R24 complete outcomes, triage and replay bundle", () => {
  test("keeps failures/timeouts and requires every observed difference to be triaged", async () => {
    const runners: Record<BenchmarkSubstrate, MatchedCellRunner> = {
      hermes: new FakeRunner(),
      paperclip: new FakeRunner((a, e) =>
        a.trial.replication === 0
          ? {
              ...e,
              status: "timeout",
              portableScore: 0,
              failures: [
                { kind: "timeout", detail: "matched injected dependency loss" },
              ],
              completedAt: "2026-01-01T00:00:11.000Z",
            }
          : e,
      ),
    };
    const run = await executeMatchedBenchmark(lock, ["coding"], runners),
      differences = collectDifferences(run.evidence);
    expect(run.evidence.filter((e) => e.status === "timeout")).toHaveLength(1);
    expect(() =>
      finalizeMatchedBenchmark(
        lock,
        run.assignments,
        run.evidence,
        [],
        "2026-01-02T00:00:00Z",
        signer,
      ),
    ).toThrow("triaged");
    const triage = differences.map((d) => ({
      differenceId: d.id,
      disposition: "explained" as const,
      rationale: "measured substrate residual under matched input",
      owner: "benchmark-reviewer",
      evidence: [`trace:${d.pairId}`],
    }));
    const bundle = finalizeMatchedBenchmark(
      lock,
      run.assignments,
      run.evidence,
      triage,
      "2026-01-02T00:00:00Z",
      signer,
    );
    expect(bundle.result.evidence).toHaveLength(6);
    expect(bundle.result.differences).toHaveLength(triage.length);
    expect(verifyMatchedResult(bundle, signer).lockDigest).toBe(
      matchedBenchmarkDigest(lock),
    );
    const tampered = structuredClone(bundle);
    tampered.result.evidence.pop();
    expect(() => verifyMatchedResult(tampered, signer)).toThrow(
      "replay integrity",
    );
  });
  test("refuses incomplete outcome sets and changed randomized assignments", async () => {
    const run = await executeMatchedBenchmark(lock, ["coding"], {
      hermes: new FakeRunner(),
      paperclip: new FakeRunner(),
    });
    expect(() =>
      finalizeMatchedBenchmark(
        lock,
        run.assignments,
        run.evidence.slice(1),
        [],
        "2026-01-02T00:00:00Z",
        signer,
      ),
    ).toThrow("excluded");
    const changed = structuredClone(run.assignments);
    changed.reverse();
    expect(() =>
      finalizeMatchedBenchmark(
        lock,
        changed,
        run.evidence,
        [],
        "2026-01-02T00:00:00Z",
        signer,
      ),
    ).toThrow("randomized plan");
  });
});

describe("R24 paired statistical reporting", () => {
  test("reports effect sizes/error bars and avoids a ranking when uncertainty overlaps zero", () => {
    const assignments = planMatchedCells(lock, ["coding"]),
      cells = assignments.map((a) =>
        evidence(a, {
          portableScore:
            a.trial.replication === 0
              ? a.substrate === "hermes"
                ? 0.8
                : 0.9
              : a.trial.replication === 1
                ? a.substrate === "hermes"
                  ? 0.9
                  : 0.8
                : 0.85,
        }),
      );
    const score = pairedEstimates(cells).find(
      (e) => e.metric === "portableScore",
    )!;
    expect(score.pairs).toBe(3);
    expect(score.sampleVariance).toBeGreaterThan(0);
    expect(score.confidenceInterval95[0]).toBeLessThanOrEqual(0);
    expect(score.confidenceInterval95[1]).toBeGreaterThanOrEqual(0);
    expect(score.conclusion).toBe("inconclusive");
  });
  test("does not present a single repetition as stable evidence", () => {
    expect(() =>
      planMatchedCells({ ...lock, repetitions: 1 }, ["coding"]),
    ).toThrow("lock invalid");
  });
  test("counterbalances first-provider allocation for every seed", () => {
    for (let seed = 0; seed < 128; seed++) {
      const a = planMatchedCells({ ...lock, seed }, ["coding"]),
        first = a.filter((x) => x.order === 0),
        h = first.filter((x) => x.substrate === "hermes").length;
      expect(Math.abs(h - (first.length - h))).toBeLessThanOrEqual(1);
    }
  });
});
