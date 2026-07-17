import { expect, test } from "bun:test";
import {
  EXPECTED_U3_SYNTHETIC_FIXTURE_DIGEST,
  U3_OBSERVATION_CALCULUS_SCHEMA,
  U3_PREDECESSORS,
  U3_TAXONOMY,
  computeU3ObservationCalculusDigest,
  freezeU3ObservationCalculus,
  verifyFrozenU3ObservationCalculus,
  verifyU3PredecessorGitCustody,
  type U3ObservationCalculus,
} from "./organization-u3-observation-calculus";
const S = (c: string) => `sha256:${c.repeat(64)}` as any,
  sort = <T extends { id: string }>(x: T[]) =>
    x.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const fixture = (): U3ObservationCalculus => {
  const observations: any[] = U3_TAXONOMY.map((taxonomy, i) => ({
    id: `obs-${taxonomy}`,
    taxonomy,
    subjectSort: i % 2 ? "provider" : "component",
    subjectKind: "work",
    providerId: `provider-${i}`,
    componentId: i % 2 ? null : `component-${i}`,
    nativeSchemaId: "event-schema",
    nativeSchemaVersion: "1",
    valueSchemaId: "event-schema",
    valueSchemaVersion: "1",
    sourceProjectionId: "identity",
    unit: "event",
    clock: "monotonic",
    window: "trace",
    dedupKey: `event-key-${i}`,
    completeness: "complete",
    evidencePolicyId: "signed-evidence",
    authenticationPolicyId: "signature",
    missing: "unknown",
    applicability: [
      {
        stratumId: "coding",
        status: "mandatory",
        predicateId: "always",
        evidenceDigest: null,
        reason: null,
      },
    ],
  }));
  observations.push({
    ...structuredClone(observations[0]),
    id: "obs-optional-detail",
    dedupKey: "optional-key",
    applicability: [
      {
        stratumId: "coding",
        status: "optional",
        predicateId: "always",
        evidenceDigest: null,
        reason: null,
      },
    ],
  });
  sort(observations);
  const comparisons = sort(
      observations.map((o) => ({
        id: `comparison-${o.id}`,
        left: {
          observationId: o.id,
          subjectKind: o.subjectKind,
          schemaId: o.valueSchemaId,
          schemaVersion: o.valueSchemaVersion,
        },
        right: {
          observationId: o.id,
          subjectKind: o.subjectKind,
          schemaId: o.valueSchemaId,
          schemaVersion: o.valueSchemaVersion,
        },
        sourceProjectionId: "identity",
        targetProjectionId: "identity",
        direction: "symmetric" as const,
        operator: "equal" as const,
        missing: "unknown" as const,
      })),
    ),
    variances = sort(
      comparisons.map((c) => ({
        id: `variance-${c.id}`,
        comparisonId: c.id,
        operator: "accept-within" as const,
        metric: "exact" as const,
        unit: "event",
        clock: "monotonic" as const,
        window: "trace" as const,
        aggregation: "identity" as const,
        missing: "unknown" as const,
        bound: 0,
        minimumSamples: 2,
      })),
    ),
    mandatory = observations
      .filter((o) => o.id !== "obs-optional-detail")
      .map((o) => o.id),
    all = observations.map((o) => o.id),
    cids = (ids: string[]) => ids.map((id) => `comparison-${id}`).sort(),
    vids = (ids: string[]) =>
      cids(ids)
        .map((id) => `variance-${id}`)
        .sort();
  return {
    schema: U3_OBSERVATION_CALCULUS_SCHEMA,
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    campaignId: "organization-universality-2026-v9",
    predecessors: structuredClone(U3_PREDECESSORS) as any,
    schemas: [
      {
        id: "event-schema",
        version: "1",
        mediaType: "application/json",
        schemaSha256: S("a"),
      },
    ],
    predicates: [
      { id: "always", version: "1", operator: "always", argument: "" },
    ],
    projections: [
      {
        id: "identity",
        version: "1",
        operator: "identity",
        argument: "",
        inputSchemaId: "event-schema",
        inputSchemaVersion: "1",
        outputSchemaId: "event-schema",
        outputSchemaVersion: "1",
      },
    ],
    evidencePolicies: [
      {
        id: "signed-evidence",
        required: true,
        minimum: "verification",
        referenceSchemaId: "event-schema",
        referenceSchemaVersion: "1",
      },
    ],
    authenticationPolicies: [
      {
        id: "signature",
        required: true,
        mechanism: "signature",
        trustRootSha256: S("b"),
      },
    ],
    strata: [{ id: "coding" }],
    observations,
    comparisons,
    variances,
    profiles: [
      {
        id: "base",
        lineageId: "coding-lineage",
        version: "1.0.0",
        stratumId: "coding",
        parentIds: [],
        observationIds: mandatory,
        comparisonIds: cids(mandatory),
        varianceIds: vids(mandatory),
        forbiddenLossObservationIds: mandatory,
        unknownPolicy: "report",
      },
      {
        id: "strict",
        lineageId: "coding-lineage",
        version: "1.1.0",
        stratumId: "coding",
        parentIds: ["base"],
        observationIds: all,
        comparisonIds: cids(all),
        varianceIds: vids(all),
        forbiddenLossObservationIds: all,
        unknownPolicy: "reject",
      },
    ],
    profilePairs: [
      {
        leftProfileId: "base",
        rightProfileId: "strict",
        kind: "right-refines-left",
        reason:
          "strict adds the applicable optional detail and rejects unknown values",
        witnessDigest: S("c"),
      },
    ],
  };
};
test("purely freezes and verifies independently anchored synthetic L1-L9", () => {
  const x = fixture();
  expect(computeU3ObservationCalculusDigest(x)).toBe(
    EXPECTED_U3_SYNTHETIC_FIXTURE_DIGEST,
  );
  const f = freezeU3ObservationCalculus(x);
  expect(verifyFrozenU3ObservationCalculus(f)).toEqual(f);
  expect(Object.isFrozen(f.profilePairs)).toBe(true);
});
test("explicit trusted wrapper verifies predecessor Git custody", () =>
  expect(() => verifyU3PredecessorGitCustody()).not.toThrow());
const attacks: [string, (x: any) => void][] = [
  ["exact false booleans", (x) => (x.empiricalRegistration = 0)],
  ["schema version join", (x) => (x.observations[0].valueSchemaVersion = "2")],
  [
    "typed endpoint subject",
    (x) => (x.comparisons[0].left.subjectKind = "other"),
  ],
  [
    "typed endpoint schema version",
    (x) => (x.comparisons[0].right.schemaVersion = "2"),
  ],
  [
    "projection version join",
    (x) => (x.projections[0].outputSchemaVersion = "2"),
  ],
  [
    "observation unrelated projection",
    (x) => (x.observations[0].sourceProjectionId = "missing"),
  ],
  [
    "comparison unrelated source projection",
    (x) => (x.comparisons[0].sourceProjectionId = "missing"),
  ],
  [
    "invalid variance operator",
    (x) => (x.variances[0].operator = "close-enough"),
  ],
  ["invalid variance metric", (x) => (x.variances[0].metric = "bogus")],
  [
    "equal directional incoherence",
    (x) => (x.comparisons[0].direction = "left-to-right"),
  ],
  [
    "refines symmetric incoherence",
    (x) => (x.comparisons[0].operator = "refines"),
  ],
  [
    "right-to-left topology reversal",
    (x) => {
      x.comparisons[0].operator = "refines";
      x.comparisons[0].direction = "right-to-left";
      x.comparisons[0].right.schemaVersion = "2";
    },
  ],
  ["variance clock mismatch", (x) => (x.variances[0].clock = "wall")],
  ["variance window mismatch", (x) => (x.variances[0].window = "instant")],
  ["variance unit mismatch", (x) => (x.variances[0].unit = "token")],
  ["endpoint clock mismatch", (x) => (x.observations[0].clock = "wall")],
  [
    "incomparable variance weakening",
    (x) => (x.variances[0].aggregation = "mean"),
  ],
  [
    "mandatory observation loss",
    (x) => {
      x.profiles[0].observationIds.shift();
      x.profiles[0].comparisonIds.shift();
      x.profiles[0].varianceIds.shift();
    },
  ],
  [
    "mandatory forbidden-loss removal",
    (x) => x.profiles[0].forbiddenLossObservationIds.shift(),
  ],
  [
    "comparison double coverage",
    (x) => x.profiles[0].comparisonIds.push(x.profiles[0].comparisonIds[0]),
  ],
  ["variance omission", (x) => x.profiles[0].varianceIds.shift()],
  [
    "parent effective loss",
    (x) => {
      const id = x.profiles[0].observationIds[0];
      x.profiles[1].observationIds = x.profiles[1].observationIds.filter(
        (y: string) => y !== id,
      );
      x.profiles[1].comparisonIds = x.profiles[1].comparisonIds.filter(
        (y: string) => y !== `comparison-${id}`,
      );
      x.profiles[1].varianceIds = x.profiles[1].varianceIds.filter(
        (y: string) => y !== `variance-comparison-${id}`,
      );
      x.profiles[1].forbiddenLossObservationIds =
        x.profiles[1].forbiddenLossObservationIds.filter(
          (y: string) => y !== id,
        );
    },
  ],
  [
    "variance parent weakening",
    (x) =>
      (x.variances.find(
        (v: any) => v.comparisonId === x.profiles[0].comparisonIds[0],
      ).bound = 1),
  ],
  ["pair omission", (x) => (x.profilePairs = [])],
  [
    "pair orientation lie",
    (x) => (x.profilePairs[0].kind = "left-refines-right"),
  ],
  [
    "unrelated profiles claim equivalence",
    (x) => (x.profilePairs[0].kind = "equivalent"),
  ],
  [
    "pair noncanonical orientation",
    (x) => {
      x.profilePairs[0].leftProfileId = "strict";
      x.profilePairs[0].rightProfileId = "base";
    },
  ],
  ["pair reason whitespace", (x) => (x.profilePairs[0].reason = " bad")],
  [
    "pair witness invalid",
    (x) => (x.profilePairs[0].witnessDigest = "sha256:00"),
  ],
  [
    "excluded applicability lacks evidence",
    (x) => {
      const a = x.observations[0].applicability[0];
      a.status = "excluded";
      a.reason = "not applicable";
    },
  ],
  [
    "unknown predicate",
    (x) => (x.observations[0].applicability[0].predicateId = "missing"),
  ],
  ["subject sort coherence", (x) => (x.observations[0].providerId = null)],
  [
    "taxonomy old alias",
    (x) => (x.observations[0].taxonomy = "retry-idempotency"),
  ],
  ["missing root profile", (x) => (x.profiles[0].parentIds = ["strict"])],
  ["arbitrary profile version", (x) => (x.profiles[1].version = "latest")],
  ["parent major mismatch", (x) => (x.profiles[1].version = "2.0.0")],
  [
    "parent lineage mismatch",
    (x) => (x.profiles[1].lineageId = "other-lineage"),
  ],
  ["uncovered stratum", (x) => x.strata.push({ id: "unused" })],
  [
    "all-excluded stratum with otherwise valid roots and pairs",
    (x) => {
      for (const o of x.observations)
        o.applicability[0] = {
          stratumId: "coding",
          status: "excluded",
          predicateId: "always",
          evidenceDigest: S("d"),
          reason: "externally evidenced non-applicability",
        };
      for (const p of x.profiles) {
        p.observationIds = [];
        p.comparisonIds = [];
        p.varianceIds = [];
        p.forbiddenLossObservationIds = [];
      }
    },
  ],
  [
    "oversized projection argument",
    (x) => (x.projections[0].argument = "x".repeat(257)),
  ],
  ["unnormalized projection argument", (x) => (x.projections[0].argument = " ")],
  [
    "emoji UTF-8 projection argument bound",
    (x) => (x.projections[0].argument = "😀".repeat(65)),
  ],
  ["oversized reason", (x) => (x.profilePairs[0].reason = "x".repeat(1025))],
  ["cyclic input", (x) => (x.self = x)],
  [
    "raw depth",
    (x) => {
      let q = x;
      for (let i = 0; i < 70; i++) q = q.deep = {};
    },
  ],
];
for (const [n, m] of attacks)
  test(`rejects ${n}`, () => {
    const x: any = fixture();
    m(x);
    expect(() =>
      freezeU3ObservationCalculus(x, { requireFixtureDigest: false }),
    ).toThrow();
  });
test("independent digest rejects consistently redigested semantics", () => {
  const x = fixture();
  x.observations[0].completeness = "best-effort";
  expect(computeU3ObservationCalculusDigest(x)).not.toBe(
    EXPECTED_U3_SYNTHETIC_FIXTURE_DIGEST,
  );
  expect(() => freezeU3ObservationCalculus(x)).toThrow(
    "independent fixture digest",
  );
});
