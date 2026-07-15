import { describe, expect, test } from "bun:test";
import {
  AUTONOMY_METRICS,
  measureAutonomy,
  validateLedger,
  type AccountingLedger,
  type Provenance,
} from "./organization-autonomy-accounting";

const provenance = (source: string): Provenance => ({
  source,
  observedAt: "2026-07-15T00:10:00Z",
  evidenceUri: `evidence://${source}`,
  digest: `sha256:${source}`,
});
const ledger = (): AccountingLedger => ({
  schema: "autonomy.accounting.v1",
  reportingCurrency: "USD",
  horizon: { start: "2026-07-15T00:00:00Z", end: "2026-07-15T00:10:00Z" },
  work: [
    {
      id: "w1",
      createdAt: "2026-07-15T00:00:00Z",
      startedAt: "2026-07-15T00:01:00Z",
      terminalAt: "2026-07-15T00:03:00Z",
      outcome: "success",
      valueMicrounits: 100,
      untrackedWork: false,
      provenance: provenance("w1"),
    },
    {
      id: "w2",
      createdAt: "2026-07-15T00:00:00Z",
      startedAt: "2026-07-15T00:02:00Z",
      terminalAt: "2026-07-15T00:08:00Z",
      outcome: "success",
      valueMicrounits: 200,
      untrackedWork: false,
      provenance: provenance("w2"),
    },
    {
      id: "w3",
      createdAt: "2026-07-15T00:01:00Z",
      terminalAt: "2026-07-15T00:09:00Z",
      outcome: "failure",
      untrackedWork: false,
      provenance: provenance("w3"),
    },
    {
      id: "w4",
      createdAt: "2026-07-15T00:05:00Z",
      outcome: "censored",
      untrackedWork: true,
      provenance: provenance("w4"),
    },
  ],
  attempts: [
    {
      id: "a1",
      workId: "w1",
      ordinal: 1,
      provider: "p1",
      outcome: "success",
      provenance: provenance("a1"),
    },
    {
      id: "a2",
      workId: "w2",
      ordinal: 1,
      provider: "p2",
      outcome: "failure",
      provenance: provenance("a2"),
    },
    {
      id: "a3",
      workId: "w2",
      ordinal: 2,
      provider: "p2",
      outcome: "success",
      retryOf: "a2",
      provenance: provenance("a3"),
    },
  ],
  usage: [
    {
      id: "u1",
      providerChargeId: "charge-1",
      attemptId: "a1",
      provider: "p1",
      providerVersion: "v1",
      inputTokens: 10,
      outputTokens: 5,
      computeMilliseconds: 100,
      moneyMicros: 200,
      currency: "USD",
      externalService: true,
      fullyAttributed: true,
      provenance: provenance("u1"),
    },
    {
      id: "u2",
      providerChargeId: "charge-2",
      attemptId: "a2",
      provider: "p2",
      providerVersion: "v1",
      inputTokens: 4,
      outputTokens: 1,
      computeMilliseconds: 50,
      moneyMicros: 80,
      currency: "USD",
      externalService: true,
      fullyAttributed: true,
      provenance: provenance("u2"),
    },
    {
      id: "u3",
      providerChargeId: "charge-3",
      attemptId: "a3",
      provider: "p2",
      providerVersion: "v1",
      inputTokens: 5,
      externalService: true,
      fullyAttributed: true,
      provenance: provenance("u3"),
    },
  ],
  waits: [
    {
      id: "wait1",
      workId: "w2",
      start: "2026-07-15T00:03:00Z",
      end: "2026-07-15T00:05:00Z",
      provenance: provenance("wait1"),
    },
    {
      id: "wait2",
      workId: "w4",
      start: "2026-07-15T00:09:00Z",
      provenance: provenance("wait2"),
    },
  ],
  defects: [
    { id: "d1", workId: "w2", confirmed: true, provenance: provenance("d1") },
    { id: "d2", workId: "w3", provenance: provenance("d2") },
  ],
  interruptions: [
    {
      id: "i1",
      workId: "w2",
      personId: "person",
      provenance: provenance("i1"),
    },
    { id: "i2", workId: "w2", provenance: provenance("i2") },
  ],
  escalations: [
    {
      id: "e1",
      workId: "w2",
      disposition: "escalated",
      provenance: provenance("e1"),
    },
    { id: "e2", workId: "w3", provenance: provenance("e2") },
  ],
  humans: [
    {
      id: "h1",
      workId: "w2",
      personId: "person",
      start: "2026-07-15T00:04:00Z",
      end: "2026-07-15T00:06:00Z",
      observation: "real",
      provenance: provenance("h1"),
    },
    {
      id: "h2",
      workId: "w2",
      personId: "person",
      start: "2026-07-15T00:05:00Z",
      end: "2026-07-15T00:07:00Z",
      observation: "real",
      provenance: provenance("h2"),
    },
    {
      id: "hs",
      workId: "w1",
      personId: "sim",
      start: "2026-07-15T00:01:00Z",
      end: "2026-07-15T00:02:00Z",
      observation: "simulated",
      calibrationId: "cal",
      provenance: provenance("hs"),
    },
  ],
  calibrations: [
    {
      id: "cal",
      simulatorVersion: "sim-v1",
      population: "operators",
      realMinutes: [1, 2, 3, 4],
      simulatedMinutes: [2, 2, 4, 4],
      provenance: provenance("cal"),
    },
  ],
  tokenNormalization: [
    {
      provider: "p1",
      version: "v1",
      numerator: 1,
      denominator: 1,
      provenance: provenance("n1"),
    },
    {
      provider: "p2",
      version: "v1",
      numerator: 2,
      denominator: 1,
      provenance: provenance("n2"),
    },
  ],
});

describe("R23 autonomy accounting", () => {
  test("declares every named estimand with complete measurement semantics", () => {
    expect(Object.keys(AUTONOMY_METRICS)).toHaveLength(17);
    for (const metric of Object.values(AUTONOMY_METRICS))
      expect(metric).toMatchObject({
        eventBasis: expect.any(String),
        unit: expect.any(String),
        estimand: expect.any(String),
        horizon: "closed-interval",
        attribution: expect.any(String),
        censoring: expect.any(String),
        uncertainty: expect.any(String),
      });
  });
  test("recovers synthetic ground truth without retry, provider, or overlapping-human double counting", () => {
    const report = measureAutonomy(ledger()),
      m = report.metrics;
    expect(m.throughput.estimate).toBe(2);
    expect(m.rework.estimate).toBe(1);
    expect(m.tokens).toMatchObject({
      estimate: 35_000_000,
      breakdown: { p1: 15_000_000, p2: 20_000_000 },
    });
    expect(m.compute.estimate).toBe(150);
    expect(m.money.estimate).toBe(280);
    expect(m["human-minutes"]).toMatchObject({
      estimate: 3,
      breakdown: { real: 3, simulated: 1 },
    });
    expect(m["autonomy-ratio"]).toMatchObject({
      numerator: 1,
      denominator: 2,
      estimate: 0.5,
    });
    expect(m["value-delivery"].estimate).toBe(300);
    expect(m["first-pass-yield"]).toMatchObject({
      numerator: 1,
      denominator: 2,
    });
    expect(m.reliability).toMatchObject({ numerator: 2, denominator: 3 });
    expect(m["lead-time"].censored).toBe(1);
    expect(m.defects.missing).toBe(1);
    expect(m["interruption-burden"].missing).toBe(1);
    expect(m.tokens.missing).toBe(1);
    expect(m["first-pass-yield"].interval).toMatchObject({
      level: 0.95,
      method: "wilson-95",
    });
    expect(report.calibration[0]).toMatchObject({
      realMeanMinutes: 2.5,
      simulatedMeanMinutes: 3,
      transferErrorMinutes: 0.5,
    });
  });
  test("off-ledger or unattributed external work cannot improve autonomy", () => {
    const base = ledger(),
      moved = ledger();
    moved.work[0]!.untrackedWork = true;
    moved.usage[0]!.fullyAttributed = false;
    expect(
      measureAutonomy(moved).metrics["autonomy-ratio"].estimate,
    ).toBeLessThan(measureAutonomy(base).metrics["autonomy-ratio"].estimate);
  });
  test("rejects duplicate charges, retry double counting, missing normalization, and uncalibrated simulations", () => {
    const duplicate = ledger();
    duplicate.usage.push(structuredClone(duplicate.usage[0]!));
    expect(() => validateLedger(duplicate)).toThrow(/usage duplicate/);
    const renamedCharge = ledger();
    renamedCharge.usage.push({
      ...structuredClone(renamedCharge.usage[0]!),
      id: "renamed",
    });
    expect(() => validateLedger(renamedCharge)).toThrow(
      /provider charge duplicate/,
    );
    const retry = ledger();
    retry.attempts[2]!.ordinal = 1;
    expect(() => validateLedger(retry)).toThrow(/retry lineage|ordinal double/);
    const provider = ledger();
    provider.tokenNormalization.pop();
    expect(() => validateLedger(provider)).toThrow(/normalization missing/);
    const simulated = ledger();
    simulated.humans[2]!.calibrationId = "absent";
    expect(() => validateLedger(simulated)).toThrow(/uncalibrated/);
  });
  test("unions overlapping waits and excludes work with no horizon exposure", () => {
    const value = ledger();
    value.waits.push({
      id: "wait-overlap",
      workId: "w2",
      start: "2026-07-15T00:04:00Z",
      end: "2026-07-15T00:06:00Z",
      provenance: provenance("wait-overlap"),
    });
    const before = measureAutonomy(value).metrics;
    expect(before["wait-time"].estimate).toBe(60_000);
    value.work.push({
      id: "future",
      createdAt: "2026-07-16T00:00:00Z",
      terminalAt: "2026-07-16T00:01:00Z",
      outcome: "failure",
      untrackedWork: false,
      provenance: provenance("future"),
    });
    const after = measureAutonomy(value).metrics;
    expect(after["wait-time"].estimate).toBe(before["wait-time"].estimate);
    expect(after.escalation.denominator).toBe(before.escalation.denominator);
    expect(after["first-pass-yield"].missing).toBe(before["first-pass-yield"].missing);
  });
  test("rejects impossible human chronology and non-adjacent or cyclic retry lineage", () => {
    const human = ledger();
    human.humans[0]!.start = "2026-07-14T23:59:00Z";
    expect(() => validateLedger(human)).toThrow(/human attribution/);

    const afterTerminal = ledger();
    afterTerminal.humans[0]!.end = "2026-07-15T00:09:00Z";
    expect(() => validateLedger(afterTerminal)).toThrow(/human attribution/);

    const forward = ledger();
    forward.attempts[1]!.retryOf = "a3";
    expect(() => validateLedger(forward)).toThrow(/retry lineage/);

    const skipped = ledger();
    skipped.attempts[2]!.ordinal = 3;
    expect(() => validateLedger(skipped)).toThrow(/retry lineage/);
  });
  test("all 17 metrics are invariant to fully attributed records for work outside the horizon", () => { const base = ledger(), extended = ledger(), p = provenance("future"); extended.work.push({ id: "future", createdAt: "2026-07-16T00:00:00Z", terminalAt: "2026-07-16T00:01:00Z", outcome: "success", valueMicrounits: 999, untrackedWork: false, provenance: p }); extended.attempts.push({ id: "future-a1", workId: "future", ordinal: 1, provider: "p1", outcome: "success", provenance: p }); extended.usage.push({ id: "future-u", providerChargeId: "future-charge", attemptId: "future-a1", provider: "p1", providerVersion: "v1", inputTokens: 999, outputTokens: 999, computeMilliseconds: 999, moneyMicros: 999, currency: "USD", externalService: true, fullyAttributed: true, provenance: p }); extended.defects.push({ id: "future-d", workId: "future", confirmed: true, provenance: p }); extended.interruptions.push({ id: "future-i", workId: "future", personId: "future-person", provenance: p }); extended.escalations.push({ id: "future-e", workId: "future", disposition: "escalated", provenance: p }); expect(Object.fromEntries(Object.entries(measureAutonomy(extended).metrics).map(([name, value]) => [name, { estimate: value.estimate, numerator: value.numerator, denominator: value.denominator, included: value.included, missing: value.missing, censored: value.censored }]))).toEqual(Object.fromEntries(Object.entries(measureAutonomy(base).metrics).map(([name, value]) => [name, { estimate: value.estimate, numerator: value.numerator, denominator: value.denominator, included: value.included, missing: value.missing, censored: value.censored }]))); });
  test("internal usage attribution does not lower autonomy, but external hidden service work does", () => { const internal = ledger(), external = ledger(); internal.usage[0]!.externalService = false; internal.usage[0]!.fullyAttributed = false; external.usage[0]!.fullyAttributed = false; expect(measureAutonomy(internal).metrics["autonomy-ratio"].estimate).toBe(measureAutonomy(ledger()).metrics["autonomy-ratio"].estimate); expect(measureAutonomy(external).metrics["autonomy-ratio"].estimate).toBeLessThan(measureAutonomy(ledger()).metrics["autonomy-ratio"].estimate); });
  test("rejects inconsistent terminal outcomes and ambiguous calibration identities", () => { const outcome = ledger(); delete outcome.work[0]!.outcome; expect(() => validateLedger(outcome)).toThrow("terminal outcome"); const duplicate = ledger(); duplicate.calibrations.push(structuredClone(duplicate.calibrations[0]!)); expect(() => validateLedger(duplicate)).toThrow("calibration duplicate"); const population = ledger(); population.calibrations[0]!.population = ""; expect(() => validateLedger(population)).toThrow("calibration pairs"); });
  test("does not fabricate precision from one observation and requires immutable provenance digests", () => { const value = ledger(), report = measureAutonomy(value); expect(report.metrics["lead-time"].interval.method).toBe("student-t-95"); const single = ledger(); single.work = single.work.filter((w) => w.id === "w1"); single.attempts = single.attempts.filter((a) => a.workId === "w1"); single.usage = single.usage.filter((u) => u.attemptId === "a1"); single.waits = []; single.defects = []; single.interruptions = []; single.escalations = []; single.humans = []; expect(measureAutonomy(single).metrics["lead-time"].interval).toEqual(expect.objectContaining({ low: Number.NEGATIVE_INFINITY, high: Number.POSITIVE_INFINITY })); const mutable = ledger(); delete mutable.work[0]!.provenance.digest; expect(() => validateLedger(mutable)).toThrow("provenance invalid"); });
});
