import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  CanaryController,
  ExperimentRun,
  requiredTwoArmSample,
  signRegistration,
  verifyRegistration,
  type ExperimentTrust,
  type Analysis,
  type ExperimentProvenance,
  type RegistrationBody,
  type SignedOutcome,
} from "./organization-experiment";

const hash = (v: unknown) =>
    createHash("sha256").update(canonicalSemanticJson(v)).digest("hex"),
  provenance = (id: string): ExperimentProvenance => ({
    source: id,
    evidenceUri: `evidence://${id}`,
    observedAt: "2026-07-15T12:00:00Z",
    digest: `sha256:${id}`,
  }),
  revoked = new Set<string>(),
  trust: ExperimentTrust = {
    signRegistration: (d) => `reg:${d}`,
    verifyRegistration: (d, s) => s === `reg:${d}`,
    verifyOutcome: (d, s, w) => s === `out:${w}:${d}`,
    signDecision: (d) => `decision:${d}`,
    verifyDecision: (d, s) => s === `decision:${d}`,
    workerTrusted: (w) => !revoked.has(w),
  },
  seed = "concealed-randomization-seed";
function body(overrides: Partial<RegistrationBody> = {}): RegistrationBody {
  const alpha = 0.05,
    power = 0.8,
    effect = 0.7,
    sd = 1;
  return {
    schema: "autonomy.experiment-registration.v1",
    id: "exp",
    version: 1,
    mode: "randomized",
    hypothesis: "treatment changes the primary outcome",
    arms: ["control", "treatment"],
    treatmentChanges: [{ path: "routing.worker", boundary: "ordinary" }],
    metrics: [
      {
        id: "quality",
        unit: "score",
        direction: "increase",
        primary: true,
        alpha,
        provenance: provenance("metric"),
      },
    ],
    guardrails: [
      {
        metric: "error-rate",
        operator: "gt",
        threshold: 0.1,
        action: "rollback",
        provenance: provenance("guardrail"),
      },
    ],
    eligibility: {
      population: "synthetic units",
      immutableRule: "registered IDs only",
      eligibleUnitIds: Array.from({ length: 80 }, (_, i) => `u${i}`),
    },
    assignment: {
      unit: "work-item",
      stratumByUnit: Object.fromEntries(
        Array.from({ length: 80 }, (_, i) => [`u${i}`, "all"]),
      ),
      allocation: [1, 1],
      seedCommitment: hash(seed),
    },
    causal: {
      estimand: "intention-to-treat",
      interference: "none",
      carryover: "not applicable",
      novelty: "stable warmup excluded by preregistration",
      selection: "complete eligible registry",
      identificationAssumptions: [
        "consistency",
        "positivity",
        "random assignment",
      ],
    },
    power: {
      alpha,
      targetPower: power,
      minimumDetectableEffect: effect,
      assumedStandardDeviation: sd,
      requiredSampleSize: requiredTwoArmSample(alpha, power, effect, sd),
    },
    stopping: { kind: "fixed", sampleSize: 40 },
    exclusions: ["invalid signed telemetry before exposure"],
    missingOutcomes: { policy: "fail", maximumFraction: 0 },
    rollback: { maximumTreatedUnits: 20, safeArm: "control" },
    codeDigest: "sha256:analysis-v1",
    createdAt: "2026-07-15T12:00:00Z",
    provenance: [provenance("protocol")],
    ...overrides,
  };
}
function signedOutcome(
  run: ExperimentRun,
  unitId: string,
  value: number,
  id = `o-${unitId}`,
  workerId = "worker",
): SignedOutcome {
  const assignment = run.assignment(unitId)!;
  const unsigned = {
      schema: "autonomy.experiment-outcome.v1" as const,
      id,
      experimentId: "exp",
      unitId,
      assignmentDigest: assignment.digest,
      workerId,
      metric: "quality",
      value,
      at: "2026-07-15T12:01:00Z",
      provenance: provenance(id),
    },
    digest = hash(unsigned);
  return { ...unsigned, signature: `out:${workerId}:${digest}` };
}
function rng(seedValue: number) {
  let x = seedValue >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
function normal(random: () => number) {
  const a = Math.max(random(), 1e-12),
    b = random();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
function study(effect: number, trial: number) {
  const registration = signRegistration(
      { ...body(), id: `exp-${trial}` },
      trust,
    ),
    run = new ExperimentRun(registration, trust, seed),
    random = rng(1000 + trial);
  for (let i = 0; i < 40; i++) {
    const unit = `u${i}`,
      assignment = run.enroll(unit),
      value = normal(random) + (assignment.arm === "treatment" ? effect : 0),
      unsigned = {
        schema: "autonomy.experiment-outcome.v1" as const,
        id: `o${i}`,
        experimentId: registration.id,
        unitId: unit,
        assignmentDigest: assignment.digest,
        workerId: "worker",
        metric: "quality",
        value,
        at: "2026-07-15T12:01:00Z",
        provenance: provenance(`o${i}`),
      },
      digest = hash(unsigned);
    run.record({ ...unsigned, signature: `out:worker:${digest}` });
  }
  return run.analyze("quality", 40);
}

describe("R27 safe experimentation", () => {
  test("authenticates immutable preregistration and forbids unsafe or unidentified designs", () => {
    const registration = signRegistration(body(), trust);
    verifyRegistration(registration, trust);
    expect(() =>
      verifyRegistration({ ...registration, hypothesis: "post hoc" }, trust),
    ).toThrow(/authentication/);
    expect(() =>
      signRegistration(
        body({
          treatmentChanges: [{ path: "authority", boundary: "authority" }],
        }),
        trust,
      ),
    ).toThrow(/forbidden boundary/);
    expect(() =>
      signRegistration(
        body({
          assignment: { ...body().assignment, unit: "person" },
          causal: { ...body().causal, interference: "team spillover" },
        }),
        trust,
      ),
    ).toThrow(/cluster/);
  });
  test("conceals deterministic assignment until eligible enrollment and rejects forged, revoked, replay-equivocated, or post-hoc outcomes", () => {
    revoked.clear();
    const run = new ExperimentRun(signRegistration(body(), trust), trust, seed);
    expect(() => run.enroll("outsider")).toThrow(/ineligible/);
    for (let i = 0; i < 40; i++) run.enroll(`u${i}`);
    const good = signedOutcome(run, "u0", 1);
    run.record(good);
    run.record(good);
    expect(run.outcomeCount()).toBe(1);
    expect(() => run.record(signedOutcome(run,"u0",1,"second-u0"))).toThrow("double count");
    expect(() =>
      run.record({ ...good, id: "forged", signature: "forged" }),
    ).toThrow(/authentication/);
    const equivocated = signedOutcome(run, "u0", 2);
    expect(() => run.record(equivocated)).toThrow(/equivocation/);
    revoked.add("bad");
    expect(() =>
      run.record(signedOutcome(run, "u1", 1, "bad-out", "bad")),
    ).toThrow(/authentication/);
    expect(() => run.analyze("post-hoc", 40)).toThrow(/post-hoc/);
    expect(() => run.analyze("quality", 20)).toThrow(/stopping/);
  });
  test("synthetic null false-positive rate and known-effect interval coverage meet preregistered tolerances", () => {
    let falsePositives = 0,
      covered = 0;
    const trials = 160,
      effect = 0.7;
    for (let i = 0; i < trials; i++) {
      if (study(0, i).significant) falsePositives++;
      const analysis = study(effect, 10_000 + i);
      if (
        analysis.interval95.low <= effect &&
        analysis.interval95.high >= effect
      )
        covered++;
    }
    const falsePositiveRate = falsePositives / trials,
      coverage = covered / trials;
    expect(falsePositiveRate).toBeLessThanOrEqual(0.1);
    expect(coverage).toBeGreaterThanOrEqual(0.88);
  });
  test("automatically rolls back canary guardrail breaches and replays signed decision artifacts", () => {
    const registration = signRegistration(
        body({
          mode: "canary",
          rollback: { maximumTreatedUnits: 3, safeArm: "control" },
        }),
        trust,
      ),
      canary = new CanaryController(
        registration,
        trust,
        () => "2026-07-15T12:02:00Z",
      );
    canary.start();
    canary.expose("u1", "treatment");
    canary.observeGuardrail("error-rate", 0.2);
    expect(canary.replay()).toBe("rolled-back");
    expect(canary.history().map((x) => x.state)).toEqual([
      "registered",
      "running",
      "rolled-back",
    ]);
    const forged = canary.history();
    forged[1]!.reason = "rewritten";
    expect(() => {
      const c = new CanaryController(
        registration,
        trust,
        () => "2026-07-15T12:02:00Z",
      );
      (c as any).artifacts = forged;
      c.replay();
    }).toThrow(/authentication/);
  });
  test("canary promotion requires authenticated beneficial analysis and observed guardrails", () => { const registration = signRegistration(body({ mode: "canary", rollback: { maximumTreatedUnits: 20, safeArm: "control" } }),trust), make = (estimate:number, significant=true):Analysis => { const analysisBody = { experimentId: registration.id, metric: "quality", nControl: 20, nTreatment: 20, estimate, standardError: .1, interval95: { low: estimate-.2, high: estimate+.2 }, pValue: .001, alpha: .05, significant, estimand: registration.causal.estimand, assumptions: [...registration.causal.identificationAssumptions], provenance: [provenance("analysis")], registrationDigest: registration.digest, outcomeDigests: ["sha256:outcomes"], diagnostics:{missingFraction:0,noveltyDifference:null,carryoverTransitions:0,selectionCoverage:1,interferenceCells:0},boundaryZ:1.96 }, digest = hash(analysisBody); return { ...analysisBody, digest, signature: `decision:${digest}` }; }, missing = new CanaryController(registration,trust,()=>"2026-07-15T12:02:00Z"); missing.start(); expect(() => missing.promote(make(1))).toThrow("promotion evidence"); const harmful = new CanaryController(registration,trust,()=>"2026-07-15T12:02:00Z"); harmful.start(); harmful.observeGuardrail("error-rate",0); expect(() => harmful.promote(make(-1))).toThrow("promotion evidence"); const forged = make(1); forged.signature="forged"; expect(() => harmful.promote(forged)).toThrow("promotion evidence"); const valid = new CanaryController(registration,trust,()=>"2026-07-15T12:02:00Z"); valid.start(); valid.observeGuardrail("error-rate",0); valid.promote(make(1)); expect(valid.replay()).toBe("promoted"); });
  test("fixed stopping cannot cherry-pick from surplus signed outcomes", () => { const run = new ExperimentRun(signRegistration(body(),trust),trust,seed); for(let i=0;i<41;i++){run.enroll(`u${i}`);run.record(signedOutcome(run,`u${i}`,i));} expect(()=>run.analyze("quality",40)).toThrow("complete outcome set"); });
  test("executes distinct shadow, replay, canary, switchback and stepped-wedge schedules",()=>{for(const mode of ["shadow","replay","canary","switchback","stepped-wedge"] as const){const run=new ExperimentRun(signRegistration(body({mode,causal:{...body().causal,carryover:mode==="switchback"||mode==="stepped-wedge"?"one period":"not applicable"}}),trust),trust,seed),schedule=Array.from({length:80},(_,i)=>{run.enroll(`u${i}`);return run.designSchedule(`u${i}`)!});if(mode==="shadow"||mode==="replay")expect(schedule.every((x)=>!x.effectAllowed)).toBe(true);if(mode==="canary")expect(schedule.filter((x)=>x.arm==="treatment").length).toBe(20);if(mode==="switchback")expect(new Set(schedule.map((x)=>x.arm)).size).toBe(2);if(mode==="stepped-wedge")expect(schedule.some((x)=>x.arm==="treatment")).toBe(true);}});
  test("bounded missing outcomes are explicit and sequential boundary is design-specific",()=>{const missingRun=new ExperimentRun(signRegistration(body({missingOutcomes:{policy:"exclude-with-bound",maximumFraction:.1}}),trust),trust,seed);for(let i=0;i<38;i++){missingRun.enroll(`u${i}`);missingRun.record(signedOutcome(missingRun,`u${i}`,i));}expect(missingRun.analyze("quality",40).diagnostics.missingFraction).toBe(.05);const sequential=new ExperimentRun(signRegistration(body({stopping:{kind:"group-sequential",maximumSampleSize:40,looks:[{sampleSize:38,alpha:.01},{sampleSize:40,alpha:.05}]}}),trust),trust,seed);for(let i=0;i<38;i++){sequential.enroll(`u${i}`);sequential.record(signedOutcome(sequential,`u${i}`,i));}const analysis=sequential.analyze("quality",38);expect(analysis.boundaryZ).toBeGreaterThan(1.96);expect(analysis.diagnostics.selectionCoverage).toBe(38/80);});
});
