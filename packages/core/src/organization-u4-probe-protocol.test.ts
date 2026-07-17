import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  freezeU4ProbePlan,
  freezeU4ProbeRun,
  freezeU4SourceBehaviorTraceJoin,
  signU4ProbeRecord,
  assertU4ProbeRunTotality,
  computeU4ProbeInvocationId,
  type U4ProbePlan,
  type U4ProbeRun,
  type U4SourceBehaviorTraceJoin,
} from "./organization-u4-probe-protocol";
import { computeU3SourceTraceDigest } from "./organization-u3-observation-evaluator";

const H = (x: string) =>
  `sha256:${createHash("sha256").update(x).digest("hex")}` as const;
const roles = [
  "official-spec-publisher",
  "native-schema-publisher",
  "runtime-probe-operator",
  "source-behavior-observer",
  "independent-adjudicator",
  "evidence-custodian",
  "semantic-inventory-authority",
  "inventory-freezer",
  "frontend",
] as const;
const keys = Object.fromEntries(
  roles.map((r, i) => [r, Buffer.alloc(32, i + 1).toString("base64")]),
);
const authorities = roles.map((r) => ({
  id: `a.${r}`,
  ownerId: `owner.${r}`,
  role: r,
  trustRootSha256: H(Buffer.from(keys[r], "base64").toString("binary")),
  verificationKeyDigest: H(Buffer.from(keys[r], "base64").toString("binary")),
}));
// Hashing binary through a string differs for high bytes; fixtures use bytes 1..9 and are stable UTF-8 here.
for (const [i, a] of authorities.entries()) {
  const b = Buffer.alloc(32, i + 1);
  a.trustRootSha256 =
    a.verificationKeyDigest = `sha256:${createHash("sha256").update(b).digest("hex")}`;
}
const trusted: any = {
  authorityKeys: authorities.map((a) => ({
    authorityId: a.id,
    ownerId: a.ownerId,
    role: a.role,
    keyBase64: keys[a.role],
    verificationKeyDigest: a.verificationKeyDigest,
  })),
  chronology: {},
};
const inventory: any = {
  digest: H("inventory"),
  authorities,
  sources: [
    {
      id: "source.one",
      sourceSystemId: "system.one",
      sourceImplementerOwnerId: "owner.implementer",
      frontendOwnerId: "owner.frontend",
      stratumId: "stratum.one",
      profileId: "profile.one",
      factIds: ["fact.one"],
    },
  ],
  facts: [
    {
      id: "fact.one",
      sourceId: "source.one",
      mandatoryObservationIds: ["obs.one"],
      provenanceIds: ["p.official", "p.schema", "p.probe", "p.behavior"],
    },
  ],
  provenance: [
    { id: "p.official", kind: "official-spec", sourceVersion: "v1" },
    { id: "p.schema", kind: "native-schema", sourceVersion: "v1" },
    { id: "p.probe", kind: "runtime-probe", sourceVersion: "v1" },
    { id: "p.behavior", kind: "source-behavior", sourceVersion: "v1" },
  ],
};
const calculus: any = {
  digest: H("calculus"),
  projections: [{ id: "value", operator: "field", argument: "value" }],
  observations: [
    {
      id: "obs.one",
      sourceProjectionId: "value",
      window: "instant",
      applicability: [{ stratumId: "stratum.one", status: "mandatory" }],
    },
  ],
  profiles: [
    {
      id: "profile.one",
      stratumId: "stratum.one",
      observationIds: ["obs.one"],
    },
  ],
};
const contract: any = {
  digest: H("contract"),
  adapters: [{ id: "adapter.one", version: "v1", digest: H("adapter") }],
};

function unsigned(): U4ProbePlan {
  return {
    schema: "open-autonomy.u4-probe-protocol.v1",
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    campaignId: "organization-universality-2026-v9",
    inventoryDigest: inventory.digest,
    calculusDigest: calculus.digest,
    u3ContractDigest: contract.digest,
    issuedAt: "2026-07-01T00:00:00.000Z",
    executionNotBefore: "2026-07-02T00:00:00.000Z",
    executionNotAfter: "2026-07-03T00:00:00.000Z",
    plannerAuthorityId: "a.semantic-inventory-authority",
    custodyAuthorityId: "a.evidence-custodian",
    cases: [
      {
        id: "case.one",
        sourceId: "source.one",
        sourceVersion: "v1",
        factIds: ["fact.one"],
        observationIds: ["obs.one"],
        runtimeProbeProvenanceId: "p.probe",
        sourceBehaviorProvenanceId: "p.behavior",
        invocation: {
          adapterId: "adapter.one",
          adapterVersion: "v1",
          adapterDigest: H("adapter"),
          inputSchemaId: "input.one",
          inputSchemaVersion: "v1",
          inputCanonicalJson: '{"x":1}',
        },
        bounds: { timeoutMs: 1000, maxStdoutBytes: 1000, maxStderrBytes: 1000 },
        repetitions: 2,
        expected: {
          allowedTermination: ["exited"],
          stdoutMode: "exactly-one-canonical-json-value",
          traceWindow: "instant",
        },
      },
    ],
    plannerReceipt: "",
    custodyReceipt: "",
  };
}
function signedPlan(mutator?: (p: U4ProbePlan) => void) {
  const p = unsigned();
  mutator?.(p);
  const body = Object.fromEntries(
    Object.entries(p).filter(
      ([k]) => !["plannerReceipt", "custodyReceipt"].includes(k),
    ),
  );
  p.plannerReceipt = signU4ProbeRecord(
    keys["semantic-inventory-authority"],
    "u4-probe-plan",
    body,
  );
  p.custodyReceipt = signU4ProbeRecord(
    keys["evidence-custodian"],
    "u4-probe-plan-custody",
    {
      ...body,
      plannerAuthorityId: p.plannerAuthorityId,
      plannerReceipt: p.plannerReceipt,
    },
  );
  return p;
}
function signedRun(p: any, mutator?: (r: U4ProbeRun) => void) {
  const stdout = Buffer.from('{"value":1}'),
    stderr = Buffer.alloc(0);
  const r: U4ProbeRun = {
    schema: "open-autonomy.u4-probe-run.v1",
    fixtureKind: "synthetic",
    planDigest: p.digest,
    caseId: "case.one",
    invocationId: computeU4ProbeInvocationId(p.digest, "case.one", 0),
    repetition: 0,
    sourceId: "source.one",
    sourceVersion: "v1",
    runId: "run.one",
    startedAt: "2026-07-02T01:00:00.000Z",
    endedAt: "2026-07-02T01:00:01.000Z",
    termination: "exited",
    exitCode: 0,
    signal: null,
    stdoutBase64: stdout.toString("base64"),
    stderrBase64: stderr.toString("base64"),
    stdoutSha256: `sha256:${createHash("sha256").update(stdout).digest("hex")}`,
    stderrSha256: `sha256:${createHash("sha256").update(stderr).digest("hex")}`,
    operatorAuthorityId: "a.runtime-probe-operator",
    custodyAuthorityId: "a.evidence-custodian",
    operatorReceipt: "",
    custodyReceipt: "",
  };
  mutator?.(r);
  const b = Object.fromEntries(
    Object.entries(r).filter(
      ([k]) => !["operatorReceipt", "custodyReceipt"].includes(k),
    ),
  );
  r.operatorReceipt = signU4ProbeRecord(
    keys["runtime-probe-operator"],
    "u4-probe-run",
    b,
  );
  r.custodyReceipt = signU4ProbeRecord(
    keys["evidence-custodian"],
    "u4-probe-run-custody",
    {
      ...b,
      operatorAuthorityId: r.operatorAuthorityId,
      operatorReceipt: r.operatorReceipt,
    },
  );
  return r;
}
function joinFixture(
  p: any,
  r: any,
  payload: any = { value: 1 },
  conflicting = false,
) {
  const event = {
      id: "event.one",
      runId: r.runId,
      correlationId: r.invocationId,
      observationId: "obs.one",
      adapterId: "adapter.one",
      adapterVersion: "v1",
      adapterDigest: H("adapter"),
      payload,
    },
    source = {
      side: "source",
      events: [
        event,
        ...(conflicting
          ? [{ ...event, id: "event.two", payload: { value: 2 } }]
          : []),
      ],
    },
    u3: any = {
      profileId: "profile.one",
      runId: r.runId,
      calculusDigest: calculus.digest,
      contractDigest: contract.digest,
      source,
      evidence: [],
      provenance: [],
    };
  const j: U4SourceBehaviorTraceJoin = {
    schema: "open-autonomy.u4-source-behavior-trace-join.v1",
    fixtureKind: "synthetic",
    semanticProjectionStatus: "verified-u3-source-projection",
    inventoryDigest: inventory.digest,
    calculusDigest: calculus.digest,
    u3ContractDigest: contract.digest,
    planDigest: p.digest,
    probeRunDigest: r.digest,
    caseId: "case.one",
    invocationId: r.invocationId,
    runId: r.runId,
    sourceId: "source.one",
    factIds: ["fact.one"],
    observationIds: ["obs.one"],
    sourceBehaviorProvenanceId: "p.behavior",
    sourceTraceDigest: computeU3SourceTraceDigest(source as any),
    sourceEventIds: ["event.one"],
    sourceEvidenceIds: [],
    sourceProvenanceIds: [],
    observerAuthorityId: "a.source-behavior-observer",
    custodyAuthorityId: "a.evidence-custodian",
    observerReceipt: "",
    custodyReceipt: "",
  };
  const b = Object.fromEntries(
    Object.entries(j).filter(
      ([k]) => !["observerReceipt", "custodyReceipt"].includes(k),
    ),
  );
  j.observerReceipt = signU4ProbeRecord(
    keys["source-behavior-observer"],
    "u4-source-behavior-trace-join",
    b,
  );
  j.custodyReceipt = signU4ProbeRecord(
    keys["evidence-custodian"],
    "u4-source-behavior-trace-join-custody",
    {
      ...b,
      observerAuthorityId: j.observerAuthorityId,
      observerReceipt: j.observerReceipt,
    },
  );
  return { j, u3 };
}

describe("U4 authenticated synthetic probe preregistration", () => {
  test("freezes a preregistered denominator and rejects post-signature mutation", () => {
    const p = freezeU4ProbePlan(
      signedPlan(),
      inventory,
      calculus,
      contract,
      trusted,
    );
    expect(Object.isFrozen(p.cases[0])).toBe(true);
    const changed = structuredClone(signedPlan());
    changed.cases[0].repetitions = 3;
    expect(() =>
      freezeU4ProbePlan(changed, inventory, calculus, contract, trusted),
    ).toThrow("authentication");
  });
  test("rejects mandatory-observation weakening and wrong provenance kind", () => {
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.cases[0].observationIds = [])),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow();
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.cases[0].runtimeProbeProvenanceId = "p.behavior")),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow("provenance");
  });
  test("rejects empty cases, nested surplus fields, and non-finite or fractional bounds", () => {
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.cases = [])),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow("cases empty");
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => ((p.cases[0].bounds as any).surplus = 1)),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow("bounds schema");
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.cases[0].bounds.timeoutMs = 1.5)),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow("nested contract");
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.cases[0].bounds.timeoutMs = Infinity)),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow();
  });
  test("rejects noncanonical chronology and invalid authority separation", () => {
    expect(() =>
      freezeU4ProbePlan(
        signedPlan((p) => (p.executionNotBefore = "2026-07-32T00:00:00.000Z")),
        inventory,
        calculus,
        contract,
        trusted,
      ),
    ).toThrow("boundary");
    const bad = structuredClone(inventory);
    bad.authorities.find(
      (a: any) => a.role === "semantic-inventory-authority",
    ).ownerId = "owner.evidence-custodian";
    const bt = structuredClone(trusted);
    bt.authorityKeys.find(
      (a: any) => a.role === "semantic-inventory-authority",
    ).ownerId = "owner.evidence-custodian";
    expect(() =>
      freezeU4ProbePlan(signedPlan(), bad, calculus, contract, bt),
    ).toThrow("separation");
  });
  test("invocation identity is repetition- and plan-bound", () => {
    const p = freezeU4ProbePlan(
      signedPlan(),
      inventory,
      calculus,
      contract,
      trusted,
    );
    expect(computeU4ProbeInvocationId(p.digest, "case.one", 0)).not.toBe(
      computeU4ProbeInvocationId(p.digest, "case.one", 1),
    );
    expect(computeU4ProbeInvocationId(H("other"), "case.one", 0)).not.toBe(
      computeU4ProbeInvocationId(p.digest, "case.one", 0),
    );
  });
  test("authenticates canonical raw bytes and rejects byte substitution", () => {
    const p = freezeU4ProbePlan(
        signedPlan(),
        inventory,
        calculus,
        contract,
        trusted,
      ),
      r = freezeU4ProbeRun(signedRun(p), p, inventory, trusted);
    expect(Object.isFrozen(r)).toBe(true);
    const changed = structuredClone(signedRun(p));
    changed.stdoutBase64 = Buffer.from('{"value":2}').toString("base64");
    expect(() => freezeU4ProbeRun(changed, p, inventory, trusted)).toThrow(
      "bytes",
    );
  });
  test("rejects incoherent termination and execution chronology", () => {
    const p = freezeU4ProbePlan(
      signedPlan(),
      inventory,
      calculus,
      contract,
      trusted,
    );
    expect(() =>
      freezeU4ProbeRun(
        signedRun(p, (r) => {
          r.exitCode = null;
        }),
        p,
        inventory,
        trusted,
      ),
    ).toThrow("termination");
    expect(() =>
      freezeU4ProbeRun(
        signedRun(p, (r) => {
          r.startedAt = "2026-07-04T00:00:00.000Z";
          r.endedAt = "2026-07-04T00:00:01.000Z";
        }),
        p,
        inventory,
        trusted,
      ),
    ).toThrow("join");
  });
  test("rejects run duration beyond the preregistered timeout without tolerance", () => {
    const p = freezeU4ProbePlan(
      signedPlan(),
      inventory,
      calculus,
      contract,
      trusted,
    );
    expect(() =>
      freezeU4ProbeRun(
        signedRun(p, (r) => (r.endedAt = "2026-07-02T01:00:01.001Z")),
        p,
        inventory,
        trusted,
      ),
    ).toThrow("join");
  });
  test("rejects independently consistent semantic disagreement, forged digest, and arbitrary unsigned agreeing events", () => {
    const p = freezeU4ProbePlan(
        signedPlan(),
        inventory,
        calculus,
        contract,
        trusted,
      ),
      r = freezeU4ProbeRun(signedRun(p), p, inventory, trusted),
      bad = joinFixture(p, r, { value: 2 });
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        bad.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        bad.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow("semantic projection mismatch");
    const forged = joinFixture(p, r);
    forged.j.sourceTraceDigest = H("other");
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        forged.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        forged.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow("source trace digest invalid");
    const unsigned = joinFixture(p, r);
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        unsigned.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        unsigned.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow();
    const crossProfile = joinFixture(p, r);
    crossProfile.u3.profileId = "profile.other";
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        crossProfile.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        crossProfile.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow("trace join invalid");
    const cherryPicked = joinFixture(p, r, { value: 1 }, true);
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        cherryPicked.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        cherryPicked.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow("event totality invalid");
    const surplus = joinFixture(p, r);
    (surplus.j as any).surplus = true;
    expect(() =>
      freezeU4SourceBehaviorTraceJoin(
        surplus.j,
        r,
        p,
        inventory,
        calculus,
        contract,
        surplus.u3,
        { keys: {} },
        trusted,
      ),
    ).toThrow("trace join schema");
  });
  test("rejects missing, duplicate, and surplus repetitions", () => {
    const p = freezeU4ProbePlan(
      signedPlan(),
      inventory,
      calculus,
      contract,
      trusted,
    );
    const mk = (i: number) =>
      ({
        invocationId: computeU4ProbeInvocationId(p.digest, "case.one", i),
      }) as any;
    expect(() => assertU4ProbeRunTotality(p, [mk(0), mk(1)])).not.toThrow();
    expect(() => assertU4ProbeRunTotality(p, [mk(0)])).toThrow("totality");
    expect(() => assertU4ProbeRunTotality(p, [mk(0), mk(0)])).toThrow(
      "totality",
    );
    expect(() => assertU4ProbeRunTotality(p, [mk(0), mk(1), mk(2)])).toThrow(
      "totality",
    );
  });
});
