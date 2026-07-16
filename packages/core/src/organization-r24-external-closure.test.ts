import { describe, expect, test } from "bun:test";
import { V2_METRICS } from "./organization-matched-benchmark";
import {
  validateR24CompleteStudyPredicate,
  validateR24PreregistrationBody,
  verifyR24ExternalClosure,
  type R24ExternalCampaign,
  type R24ExternalClosureTrust,
} from "./organization-r24-external-closure";
const impossible = {
  schema: "autonomy.r24-v5-matched-bundle.v1",
  artifact: {
    schema: "autonomy.r24-v5-live-acceptance.v1",
    plan: { design: {}, assignments: [] },
    cells: [],
  },
  portableEvidence: [],
  accountingEvidence: [],
  analysis: {},
  analyzedAt: "2026-07-16T00:00:00Z",
  digest: "sha256:" + "0".repeat(64),
} as any;
const trust = {
  verifyClosureSignature: () => true,
  verifyDependency: () => true,
  graderPublicKeys: {},
  accountingPublicKeys: {},
} as unknown as R24ExternalClosureTrust;
function fake(): R24ExternalCampaign {
  const body: any = {
    schema: "autonomy.r24-external-closure.v2",
    closureClaim: true,
    bundle: impossible,
    bundleDigest: impossible.digest,
    preregistration: {
      body: {},
      digest: "sha256:" + "0".repeat(64),
      keyId: "p",
      signature: "x",
    },
    equivalence: [],
    triage: [],
    dependencies: [],
    generatedAt: "2026-07-16T00:00:00Z",
  };
  return {
    ...body,
    signerKeyId: "c",
    digest: "sha256:" + "0".repeat(64),
    signature: "x",
  };
}
describe("R24 external closure consumes production matched evidence", () => {
  test("rejects an impossible self-consistent-looking fake V5 bundle before closure predicates", () =>
    expect(() => verifyR24ExternalClosure(fake(), trust)).toThrow());
  test("rejects a bundle reference that is not byte-identical to the embedded production bundle", () => {
    const c = fake();
    c.bundleDigest = "sha256:" + "1".repeat(64);
    expect(() => verifyR24ExternalClosure(c, trust)).toThrow();
  });
  test("does not expose a parallel cell, observation, score, or iid interval input", () => {
    const c = fake() as any;
    expect(c.cells).toBeUndefined();
    expect(c.observations).toBeUndefined();
    expect(c.interval95).toBeUndefined();
  });
});

describe("R24 preregistration schema", () => {
  const valid = () => ({
    planDigest: `sha256:${"1".repeat(64)}`,
    designDigest: "design",
    authorizedBefore: "2026-07-15T00:00:00Z",
    minimumIndependentUnits: 2,
    minimumRepetitions: 2,
    minimumFaultStrata: 2,
    requiredMetrics: [...V2_METRICS],
    requireCompletePairs: true,
    requireOrderSensitivity: true,
    requireLeaveUnitOut: true,
    requireLeaveFaultOut: true,
  });

  test("accepts the exact preregistration schema", () => {
    expect(() => validateR24PreregistrationBody(valid())).not.toThrow();
  });

  test("rejects a JSON-realizable string mutation of a signed minimum", () => {
    const mutated = JSON.parse(JSON.stringify(valid()));
    mutated.minimumIndependentUnits = "2";
    expect(() => validateR24PreregistrationBody(mutated)).toThrow();
  });

  test("rejects surplus fields from the signed body", () => {
    expect(() =>
      validateR24PreregistrationBody({ ...valid(), acceptanceNote: "ignore" }),
    ).toThrow();
  });
});

describe("R24 complete-study predicate", () => {
  test("accepts a satisfiable complete unit-level study", () => {
    const assignments = ["u0", "u1"].flatMap((unitId) =>
      [0, 1].flatMap((replication) =>
        ["hermes", "paperclip"].map((substrate) => ({
          unitId,
          replication,
          substrate,
          fault: { id: replication === 0 ? "f0" : "f1" },
        })),
      ),
    );
    const analysis: any = {
      design: { primaryEndpoint: "portableScore" },
      assignments,
      cells: assignments.map(() => ({})),
      estimates: V2_METRICS.map((metric) => ({
        metric,
        conclusion: "inconclusive",
        simultaneousInterval: [-1, 1],
        missingness: { excludedPairs: 0, completePairs: 4, reasons: {} },
        orderSensitivity: {
          hermesFirstMean: 0,
          paperclipFirstMean: 0,
          difference: 0,
        },
        leaveUnitOut: ["u0", "u1"].map((unitId) => ({
          unitId,
          meanDifference: 0,
        })),
        leaveFaultOut: ["f0", "f1"].map((faultId) => ({
          faultId,
          meanDifference: 0,
        })),
      })),
    };

    expect(
      validateR24CompleteStudyPredicate(analysis, {
        independentUnits: 2,
        repetitions: 2,
        faultStrata: 2,
      }).conclusion,
    ).toBe("inconclusive");
  });
});
