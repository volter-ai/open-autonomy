import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import claimJson from "../../../docs/universality/campaign-v9/claim.json";
import {
  freezeU2PopulationContract,
  verifyFrozenU2PopulationContract,
  U2_PREREGISTERED_POLICIES,
  type U2PopulationContract,
  type U2PopulationContractTrustedInputs,
  validateU2AuthorityGrammar,
  preflightU2Resources,
  U2ResourceLimitError,
  validateU2ExternalObservationInputs,
  U2_EXTERNAL_OBSERVATION_KINDS,
} from "./organization-u2-population-contract";
import { freezeUniversalityClaim } from "./organization-universality-claim";
const claim = claimJson as any,
  claimBytes = readFileSync(
    new URL(
      "../../../docs/universality/campaign-v9/claim.json",
      import.meta.url,
    ),
  ),
  boundaryBytes = readFileSync(
    new URL(
      "../../../docs/universality/campaign-v9/u1-implementation-closure.json",
      import.meta.url,
    ),
  ),
  H = (x: Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as const,
  trusted: U2PopulationContractTrustedInputs = {
    claim,
    claimFileBytes: claimBytes,
    u1ImplementationBoundaryFileBytes: boundaryBytes,
  };
function fixture(): U2PopulationContract {
  return {
    schema: "open-autonomy.u2-population-contract.v1",
    id: "u2-v9-preregistration",
    campaignId: claim.campaignId,
    compositionPopulationId: claim.compositionPopulationId,
    compositionSelectionRule: claim.compositionSelectionRule,
    status: "preregistered-contract-only",
    empiricalPopulationRegistered: false,
    u2ClosureClaimed: false,
    boundary: {
      claimDigest: claim.digest,
      claimFileDigest: H(claimBytes),
      u1ImplementationBoundaryFileDigest: H(boundaryBytes),
    },
    policies: structuredClone(U2_PREREGISTERED_POLICIES),
  };
}
test("freezes general V9 U2 preregistration without empirical discharge", () => {
  const f = freezeU2PopulationContract(fixture(), trusted);
  expect(verifyFrozenU2PopulationContract(f, trusted)).toEqual(f);
  expect(f.policies.identityEvidence.externalObservationPolicy).toContain(
    "not-discharge",
  );
  expect(f.policies.identityEvidence.externalObservations).toEqual(
    U2_EXTERNAL_OBSERVATION_KINDS,
  );
});
const attacks: [string, (x: any, t: any) => void][] = [
  ["cross campaign", (x) => (x.campaignId = "other")],
  [
    "composition population substitution",
    (x) => (x.compositionPopulationId = "other"),
  ],
  [
    "claim digest substitution",
    (x) => (x.boundary.claimDigest = "sha256:" + "0".repeat(64)),
  ],
  ["claim file substitution", (x, t) => (t.claimFileBytes = Buffer.from("{}"))],
  [
    "U1 boundary substitution",
    (x, t) => (t.u1ImplementationBoundaryFileBytes = Buffer.from("{}")),
  ],
  [
    "weakened family floor",
    (x) => (x.policies.floors.minimumDistinctStructuralFamilies = 4),
  ],
  [
    "weakened owner floor",
    (x) =>
      (x.policies.floors.minimumCompositionsWithThreeExternallyEstablishedIndependentOwners = 1),
  ],
  [
    "result dependent exclusion",
    (x) => (x.policies.opportunityAlgebra.resultDependentExclusion = "allowed"),
  ],
  [
    "ambiguous exclusion precedence",
    (x) => (x.policies.opportunityAlgebra.exclusionPrecedence = []),
  ],
  [
    "local independence discharge",
    (x) =>
      (x.policies.identityEvidence.externalObservations[3] = "local-discharge"),
  ],
  [
    "alias ambiguity",
    (x) => (x.policies.structuralFamilies.aliasIdentity = "product-name"),
  ],
  ["empirical claim", (x) => (x.empiricalPopulationRegistered = true)],
  ["closure claim", (x) => (x.u2ClosureClaimed = true)],
  [
    "ambiguous authority",
    (x) =>
      (x.policies.authorityOwnership.exclusiveAuthority = "multiple-allowed"),
  ],
  [
    "assurance promotion",
    (x) => (x.policies.assurance.promotion = "automatic"),
  ],
  [
    "unbounded opportunity resource",
    (x) =>
      (x.policies.resources.maximumGeneratedOpportunities =
        Number.MAX_SAFE_INTEGER),
  ],
  [
    "retroactive policy mutation",
    (x) => (x.policies.antiRetroactivity.policyChange = "same-campaign"),
  ],
];
for (const [name, mutate] of attacks)
  test(`rejects ${name}`, () => {
    const x = fixture(),
      t = { ...trusted };
    mutate(x, t);
    expect(() => freezeU2PopulationContract(x, t)).toThrow();
  });
test("rejects a consistently substituted alternate valid claim", () => {
  const { digest: _, ...body } = structuredClone(claim);
  void _;
  const alternate = freezeUniversalityClaim({
      ...body,
      campaignId: "alternate-campaign",
      compositionPopulationId: "alternate-population",
    }),
    x = fixture(),
    bytes = Buffer.from(JSON.stringify(alternate)),
    t = { ...trusted, claim: alternate, claimFileBytes: bytes };
  x.campaignId = alternate.campaignId;
  x.compositionPopulationId = alternate.compositionPopulationId;
  x.boundary.claimDigest = alternate.digest;
  x.boundary.claimFileDigest = H(bytes);
  expect(() => freezeU2PopulationContract(x, t)).toThrow();
});
test("rejects consistent U1 boundary byte and declared-digest substitution", () => {
  const raw = JSON.parse(boundaryBytes.toString("utf8"));
  raw.scope = "substituted";
  const bytes = Buffer.from(JSON.stringify(raw)),
    x = fixture(),
    t = { ...trusted, u1ImplementationBoundaryFileBytes: bytes };
  x.boundary.u1ImplementationBoundaryFileDigest = H(bytes);
  expect(() => freezeU2PopulationContract(x, t)).toThrow();
});
test("executes exclusive and replicated authority grammar", () => {
  const S = ("sha256:" + "a".repeat(64)) as any,
    providers = new Map([
      ["p1", { ownerId: "o1" }],
      ["p2", { ownerId: "o2" }],
    ]),
    states: any[] = [
      {
        stateClassId: "events",
        mode: "replicated",
        authoritativeProviderId: "p1",
        ownerId: "o1",
        evidenceRef: S,
        arbitration: { protocolId: "leader", version: "1", evidenceRef: S },
      },
    ],
    ads: any[] = [
      {
        componentId: "c1",
        stateClassId: "events",
        providerId: "p1",
        ownerId: "o1",
        role: "authoritative",
        evidenceRef: S,
      },
      {
        componentId: "c2",
        stateClassId: "events",
        providerId: "p2",
        ownerId: "o2",
        role: "replica",
        evidenceRef: S,
      },
    ];
  const components = new Map([
    ["c1", { providerId: "p1" }],
    ["c2", { providerId: "p2" }],
  ]);
  const requirements: any[] = [
    {
      stateClassId: "events",
      mode: "replicated",
      requiredComponentIds: ["c1", "c2"],
    },
  ];
  expect(
    validateU2AuthorityGrammar(
      states,
      ads,
      providers,
      components,
      requirements,
    ),
  ).toBe(true);
  for (const mutate of [
    (x: any) => (x[0].arbitration = null),
    (x: any) => (x[0].authoritativeProviderId = "p2"),
    (_: any, y: any) => y.push({ ...y[0], componentId: "c3" }),
    (x: any) => x.push({ ...x[0] }),
    (x: any) => (x[0].mode = "unknown"),
    (_: any, y: any) => (y[0].role = "unknown"),
    (_: any, y: any) => (y[1].providerId = "p1"),
    (x: any) => (x[0].arbitration.extra = true),
    (x: any) => (x[0].arbitration.version = " 1"),
    (_: any, y: any) => (y[0].componentId = "missing"),
    (_: any, y: any) => (y[0].providerId = "p2"),
    (x: any) => (x[0].evidenceRef = "bad"),
  ]) {
    const s = structuredClone(states),
      a = structuredClone(ads);
    mutate(s, a);
    expect(() =>
      validateU2AuthorityGrammar(s, a, providers, components, requirements),
    ).toThrow();
  }
  expect(() =>
    validateU2AuthorityGrammar([], [], providers, components, []),
  ).toThrow();
  expect(() =>
    validateU2AuthorityGrammar([], [], providers, components, requirements),
  ).toThrow();
  expect(() =>
    validateU2AuthorityGrammar(
      states,
      ads.slice(0, 1),
      providers,
      components,
      requirements,
    ),
  ).toThrow();
  for (const mutate of [
    (r: any) => (r[0].mode = "exclusive"),
    (r: any) => (r[0].requiredComponentIds = ["c1"]),
    (r: any) => r.push({ ...r[0] }),
  ]) {
    const r = structuredClone(requirements);
    mutate(r);
    expect(() =>
      validateU2AuthorityGrammar(states, ads, providers, components, r),
    ).toThrow();
  }
});
test("preflights combinatorial and byte resources before materialization", () => {
  const A = (
    components: unknown[] = [],
    nested: unknown[] = [],
    payload = "",
    registries: any = {
      owners: [],
      providers: [],
      implementations: [],
      services: [],
      interfaces: [],
    },
  ) => ({ registries, components, nested, payload });
  const projection = preflightU2Resources(
    A(Array.from({ length: 182 }, () => ({}))),
  );
  expect(projection.generatedOpportunityCount).toBe(988260);
  expect(projection.componentCount).toBe(182);
  for (const x of [
    A(Array.from({ length: 183 }, () => ({}))),
    A(
      [],
      Array.from({ length: 100001 }, () => ({})),
    ),
    A([{ componentId: "x".repeat(257) }]),
    A([], [], "", {
      owners: [{ id: "x".repeat(257) }],
      providers: [],
      implementations: [],
      services: [],
      interfaces: [],
    }),
    A([{ version: "v".repeat(257) }]),
    A([{ facets: [{ operations: ["o".repeat(257)] }] }]),
    A([{ forcingFeatures: [{ witness: { operation: "o".repeat(257) } }] }]),
    A([], [], "x".repeat(67108865)),
    A([], [], "", {
      owners: Array.from({ length: 10001 }, () => ({})),
      providers: [],
      implementations: [],
      services: [],
      interfaces: [],
    }),
  ])
    expect(() => preflightU2Resources(x)).toThrow(U2ResourceLimitError);
});
test("validates exact future external observation inputs without discharging them", () => {
  const S = ("sha256:" + "b".repeat(64)) as any,
    row: any = {
      observationId: "obs1",
      kind: "authority-ownership-truth",
      subjectKind: "state-class",
      subjectId: "state1",
      authorityId: "reviewer1",
      provenanceDigest: S,
      observedAt: "2026-01-01T00:00:00.000Z",
      version: "1",
      assurance: "verified",
      decision: "confirmed",
      reason: "synthetic test",
      signatureDigest: S,
      custodyDigest: S,
    };
  const snapshot = {
    subjects: { "state-class": new Set(["state1"]) },
    authorities: new Set(["reviewer1"]),
  } as any;
  expect(validateU2ExternalObservationInputs([row], snapshot)).toEqual([row]);
  for (const mutate of [
    (x: any) => (x.kind = "unknown"),
    (x: any) => (x.signatureDigest = "bad"),
    (x: any) => (x.reason = " "),
    (x: any) => (x.reason = " padded "),
    (x: any) => (x.version = " 1"),
    (x: any) => (x.subjectKind = "component"),
    (x: any) => (x.subjectId = "unknown"),
    (x: any) => (x.authorityId = "unknown"),
  ]) {
    const x = structuredClone(row);
    mutate(x);
    expect(() => validateU2ExternalObservationInputs([x], snapshot)).toThrow();
  }
  const second = {
      ...row,
      observationId: "obs2",
      kind: "arbitration-validity",
      subjectKind: "arbitration",
      subjectId: "arb1",
    },
    snap: any = {
      subjects: { ...snapshot.subjects, arbitration: new Set(["arb1"]) },
      authorities: snapshot.authorities,
    };
  expect(() =>
    validateU2ExternalObservationInputs([row, second], snap),
  ).toThrow("order");
});
