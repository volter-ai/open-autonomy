import { createHash, createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { canonicalSemanticJson as C } from "./organization-canonical";
import {
  U3_OBSERVATION_CALCULUS_SCHEMA,
  U3_PREDECESSORS,
  U3_TAXONOMY,
  freezeU3ObservationCalculus,
  type U3ObservationCalculus,
} from "./organization-u3-observation-calculus";
import {
  U4_FACT_TAXONOMY,
  U4_SOURCE_INVENTORY_SCHEMA,
  U4_U3_ANCHORS,
  U4_V9_CHRONOLOGY_ANCHOR,
  computeU4SourceInventoryDigest,
  computeU4SyntheticSourceRegistryDigest,
  computeU4PropositionDigest,
  computeU4ConflictResolutionDigest,
  computeU4NativeSchemaDigest,
  computeU4AdjudicationEvidenceDigest,
  freezeU4SyntheticSourceRegistry,
  freezeU4SourceInventory,
  verifyFrozenU4SourceInventory,
  verifyU4TaxonomyCoherence,
  verifyU4U3GitCustody,
  type U4SourceInventory,
  type U4TrustedVerificationInputs,
} from "./organization-u4-source-inventory";
const H = (x: string | Uint8Array) =>
  ("sha256:" + createHash("sha256").update(x).digest("hex")) as any;
const S = (c: string) => `sha256:${c.repeat(64)}` as any,
  sort = <T extends { id: string }>(x: T[]) =>
    x.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const u3Fixture = (): U3ObservationCalculus => {
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
        mechanism: "mac",
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
const calculus = () =>
  freezeU3ObservationCalculus(u3Fixture(), { requireFixtureDigest: false });
const key = (id: string) => Buffer.from(id.padEnd(32, "!")).subarray(0, 32);
const mac = (id: string, d: string, b: unknown) =>
  createHmac("sha256", key(id))
    .update(d)
    .update("\0")
    .update(C(b))
    .digest("hex");
const authoritySpecs: any[] = [
  ["a-adjudicator", "adjudication-owner", "independent-adjudicator"],
  ["a-behavior", "behavior-owner", "source-behavior-observer"],
  ["a-custody", "custody-owner", "evidence-custodian"],
  ["a-freezer", "freezer-owner", "inventory-freezer"],
  ["a-frontend", "frontend", "frontend"],
  ["a-probe", "probe-owner", "runtime-probe-operator"],
  ["a-schema", "schema-owner", "native-schema-publisher"],
  ["a-semantic", "semantic-owner", "semantic-inventory-authority"],
  ["a-spec", "spec-owner", "official-spec-publisher"],
];
const registry = () => {
  const body: any = {
    schema: "open-autonomy.u4-synthetic-source-registry.v1",
    fixtureKind: "synthetic",
    populationBoundary: "synthetic-fixture-only-external-u1-release-deferred",
    genericRegistryRelease: "deferred-external-validation",
    u1BoundaryStatus: "implementation-complete-external-validation-deferred",
    sources: [
      {
        id: "source",
        sourceSystemId: "synthetic-system",
        nativeVersion: "1",
        sourceOwnerId: "implementer",
        stratumId: "coding",
        profileId: "base",
        taxonomyFloors: U4_FACT_TAXONOMY.map((taxonomy, i) => ({
          taxonomy,
          minimum: i === 0 ? "critical" : "noncritical",
          rationale: "Synthetic " + taxonomy + " floor",
        })),
      },
    ],
  };
  return freezeU4SyntheticSourceRegistry(body);
};
const inventory = (): U4SourceInventory => {
  const authorities = authoritySpecs.map(([id, ownerId, role]) => ({
    id,
    ownerId,
    role,
    trustRootSha256: H(key(id)),
    verificationKeyDigest: H(key(id)),
  }));
  const provenance: any[] = [
    ["p-behavior", "source-behavior", "a-behavior"],
    ["p-probe", "runtime-probe", "a-probe"],
    ["p-schema", "native-schema", "a-schema"],
    ["p-spec", "official-spec", "a-spec"],
  ].map(([id, kind, producerAuthorityId]) => {
    const custodyAuthorityId = "a-custody",
      sourceId = "source",
      nativeSchemaId = kind === "native-schema" ? "native" : null,
      b = Buffer.from(
        kind === "native-schema"
          ? '{\"type\":\"boolean\"}'
          : '{\"claim\":true}',
      ),
      p: any = {
        id,
        sourceId,
        nativeSchemaId,
        kind,
        producerAuthorityId,
        custodyAuthorityId,
        sourceVersion: "1",
        mediaType: "application/json",
        acquiredAt: "2026-07-17T04:00:00.000Z",
        bytesBase64: b.toString("base64"),
        byteLength: b.length,
        sha256: H(b),
      };
    const body = {
      id: p.id,
      sourceId,
      nativeSchemaId,
      kind: p.kind,
      sourceVersion: p.sourceVersion,
      mediaType: p.mediaType,
      acquiredAt: p.acquiredAt,
      sha256: p.sha256,
    };
    p.bodyReceipt = mac(producerAuthorityId, "u4-provenance-body", body);
    p.custodyReceipt = mac(custodyAuthorityId, "u4-provenance-custody", {
      ...body,
      producerAuthorityId,
      bytesBase64: p.bytesBase64,
    });
    return p;
  });
  const domains: any = {
    authority: "authority",
    configuration: "configuration",
    evidence: "evidence",
    extensions: "extension",
    failure: "failure",
    lifecycle: "lifecycle",
    omissions: "context",
    resource: "resource",
    runtime: "runtime",
    "safety-security": "safety-security",
  };
  const defs: any[] = U4_FACT_TAXONOMY.flatMap((t) =>
    t === "prompt-context"
      ? [
          "prompt",
          "skill",
          "context",
          "tool",
          "memory",
          "harness",
          "model",
        ].map((d) => [t, d])
      : [[t, domains[t]]],
  );
  const facts: any[] = defs
    .map(([taxonomy, domain]: any, i: number) => {
      const path = "/" + taxonomy + "/" + domain,
        id = "source." + taxonomy + "." + H(path).slice(7, 23),
        abs = taxonomy === "omissions";
      const f: any = {
        id,
        sourceId: "source",
        taxonomy,
        nativePath: path,
        nativeSchemaId: "native",
        nativeSchemaVersion: "1",
        denotation: "Exact " + taxonomy + " " + domain + " denotation",
        default: abs
          ? { status: "absent", valueJson: null }
          : { status: "present", valueJson: "true" },
        absence: abs ? "unsupported" : null,
        criticality: i === 0 ? "critical" : "noncritical",
        mandatoryObservationIds: ["obs-timing"],
        provenanceIds: ["p-behavior", "p-probe", "p-schema", "p-spec"],
        conflictIds: i === 0 ? ["conflict-critical"] : [],
        semantic: {
          relation:
            taxonomy === "failure"
              ? "fails-with"
              : taxonomy === "lifecycle"
                ? "transitions"
                : taxonomy === "extensions"
                  ? "extends"
                  : taxonomy === "omissions"
                    ? "omits"
                    : "declares",
          from: "source",
          to: taxonomy + ":" + domain,
          domain,
          extensionClass: taxonomy === "extensions" ? "vendor-hook" : null,
          opaqueVersion: taxonomy === "extensions" ? "vendor-v7" : null,
        },
        factReceipt: "",
        criticalityEvidence: {
          rationale: "Synthetic " + taxonomy + " floor",
          authorityId: "a-semantic",
          evidenceProvenanceId: "p-spec",
          receipt: "",
          sourceFloor: i === 0 ? "critical" : "noncritical",
        },
      };
      f.criticalityEvidence.receipt = mac("a-semantic", "u4-criticality", {
        factId: f.id,
        criticality: f.criticality,
        rationale: f.criticalityEvidence.rationale,
        evidenceProvenanceId: "p-spec",
        sourceFloor: f.criticalityEvidence.sourceFloor,
      });
      f.factReceipt = mac("a-semantic", "u4-fact", {
        ...f,
        factReceipt: undefined,
        criticalityEvidence: { ...f.criticalityEvidence, receipt: undefined },
      });
      return f;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const critical = facts.find((f) => f.criticality === "critical"),
    ep = provenance.find((p) => p.id === "p-behavior"),
    leftProposition = C("boolean"),
    rightProposition = C(true),
    conflict: any = {
      id: "conflict-critical",
      factId: critical.id,
      leftProvenanceId: "p-schema",
      leftJsonPointer: "/type",
      rightProvenanceId: "p-spec",
      rightJsonPointer: "/claim",
      leftProposition,
      leftValueDigest: computeU4PropositionDigest(leftProposition),
      rightProposition,
      rightValueDigest: computeU4PropositionDigest(rightProposition),
      status: "adjudicated",
      criticality: "critical",
      adjudicatorAuthorityId: "a-adjudicator",
      resolutionKind: "choose-right",
      resolutionProposition: rightProposition,
      resolutionDigest: computeU4ConflictResolutionDigest(
        "choose-right",
        rightProposition,
      ),
      adjudicationEvidenceProvenanceId: "p-behavior",
      adjudicationEvidenceDigest: null,
      adjudicationReceipt: "",
    };
  const evidenceBody = {
    ...conflict,
    adjudicationEvidenceDigest: undefined,
    adjudicationReceipt: undefined,
    evidenceProvenanceSha256: ep.sha256,
  };
  conflict.adjudicationEvidenceDigest =
    computeU4AdjudicationEvidenceDigest(evidenceBody);
  conflict.adjudicationReceipt = mac("a-adjudicator", "u4-adjudication", {
    ...conflict,
    adjudicationReceipt: undefined,
  });
  const dimensions: any[] = U4_FACT_TAXONOMY.map((t) => ({
    sourceId: "source",
    taxonomy: t,
    status: "represented",
    factIds: facts.filter((f) => f.taxonomy === t).map((f) => f.id),
  })).sort((a, b) =>
    (a.sourceId + "\0" + a.taxonomy).localeCompare(
      b.sourceId + "\0" + b.taxonomy,
    ),
  );
  const calc = calculus(),
    reg = registry(),
    schemaBytes = Buffer.from('{"type":"boolean"}'),
    schemaDigest = computeU4NativeSchemaDigest({ type: "boolean" }),
    schema: any = {
      id: "native",
      version: "1",
      sourceId: "source",
      pathPrefix: "/",
      valueShape: { type: "boolean" },
      schemaBytesBase64: schemaBytes.toString("base64"),
      schemaSha256: H(schemaBytes),
      semanticSchemaDigest: schemaDigest,
      producerAuthorityId: "a-schema",
      custodyAuthorityId: "a-custody",
      producerReceipt: "",
      custodyReceipt: "",
    };
  schema.producerReceipt = mac("a-schema", "u4-native-schema", {
    id: schema.id,
    version: schema.version,
    sourceId: schema.sourceId,
    pathPrefix: schema.pathPrefix,
    schemaSha256: schema.schemaSha256,
    semanticSchemaDigest: schema.semanticSchemaDigest,
  });
  schema.custodyReceipt = mac("a-custody", "u4-native-schema-custody", {
    id: schema.id,
    schemaBytesBase64: schema.schemaBytesBase64,
    schemaSha256: schema.schemaSha256,
    producerAuthorityId: schema.producerAuthorityId,
  });
  const v: any = {
    schema: U4_SOURCE_INVENTORY_SCHEMA,
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    campaignId: "organization-universality-2026-v9",
    u3Anchors: structuredClone(U4_U3_ANCHORS),
    sourceRegistryDigest: reg.digest,
    calculusDigest: calc.digest,
    assurance: {
      level: "synthetic-contract-only",
      externalTruth: "deferred",
      promotionAllowed: false,
    },
    authorities,
    sources: [
      {
        id: "source",
        sourceSystemId: "synthetic-system",
        sourceImplementerOwnerId: "implementer",
        frontendOwnerId: "frontend",
        stratumId: "coding",
        profileId: "base",
        factIds: facts.map((f) => f.id),
      },
    ],
    provenance,
    nativeSchemas: [schema],
    facts,
    conflicts: [conflict],
    chronology: facts
      .map((f) => ({
        id: "chronology-" + f.id,
        factId: f.id,
        observedAt: "2025-12-01T00:00:00.000Z",
        frozenAt: "2025-12-31T00:00:00.000Z",
        postResultMutation: false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    dimensions,
    residualFactIds: [],
    chronologyPolicy: {
      claimDigest: U4_V9_CHRONOLOGY_ANCHOR.claimDigest,
      cutoffAt: U4_V9_CHRONOLOGY_ANCHOR.cutoffAt,
      frontendOutcomeNotBefore: "2026-08-01T00:00:00.000Z",
    },
    freezerAuthorityId: "a-freezer",
    frontendAuthorityId: "a-frontend",
    freezeReceipt: "",
  };
  v.freezeReceipt = mac("a-freezer", "u4-freeze", {
    inventoryDigest: computeU4SourceInventoryDigest({
      ...v,
      freezeReceipt: "",
    }),
    calculusDigest: v.calculusDigest,
    sourceRegistryDigest: v.sourceRegistryDigest,
    frontendOutcomeNotBefore: v.chronologyPolicy.frontendOutcomeNotBefore,
  });
  return v;
};
const trustedFor = (v: any): U4TrustedVerificationInputs => ({
  authorityKeys: authoritySpecs
    .map(([authorityId, ownerId, role]) => ({
      authorityId,
      ownerId,
      role,
      keyBase64: key(authorityId).toString("base64"),
      verificationKeyDigest: H(key(authorityId)),
    }))
    .sort((a, b) => a.authorityId.localeCompare(b.authorityId)),
  chronology: {
    ...v.chronologyPolicy,
    freezerAuthorityId: v.freezerAuthorityId,
    receipt: v.freezeReceipt,
  },
});
const valid = () => {
  const v = inventory();
  return [v, calculus(), registry(), trustedFor(v)] as const;
};
const rejects = (mut: (v: any, t: any) => void, re: RegExp) => {
  const [v, c, r, t] = valid();
  mut(v, t);
  expect(() => freezeU4SourceInventory(v, c, r, t)).toThrow(re);
};
test("freezes authenticated fixture against verified U3 and registry", () => {
  const [v, c, r, t] = valid(),
    f = freezeU4SourceInventory(v, c, r, t),
    replayed = verifyFrozenU4SourceInventory(f, c, r, t);
  expect(replayed).not.toBe(f);
  expect(Object.isFrozen(replayed.facts[0])).toBe(true);
});
test("hard anchors U3 custody", () =>
  expect(() => verifyU4U3GitCustody()).not.toThrow());
test("rejects registry calculus authority and receipt substitutions", () => {
  const [v, c, r, t] = valid(),
    x: any = structuredClone(r);
  x.digest = H("x");
  expect(() => freezeU4SourceInventory(v, c, x, t)).toThrow(/registry/);
  const y: any = structuredClone(c);
  y.digest = H("x");
  expect(() => freezeU4SourceInventory(v, y, r, t)).toThrow(/digest/);
  rejects(
    (v) =>
      (v.authorities.find((a: any) => a.id === "a-spec").ownerId =
        "implementer"),
    /trusted key|independence/,
  );
  rejects((v) => (v.provenance[0].bodyReceipt = "00"), /provenance/);
});
test("rejects chronology conflict and freeze attacks", () => {
  rejects(
    (v) => (v.chronology[0].frozenAt = "2027-02-01T00:00:00.000Z"),
    /chronology/,
  );
  rejects((v) => (v.freezeReceipt = "00"), /chronology|freeze receipt/);
  rejects(
    (v) => (v.conflicts[0].leftValueDigest = v.conflicts[0].rightValueDigest),
    /conflict/,
  );
  rejects((v) => (v.conflicts[0].adjudicationReceipt = "00"), /adjudicator/);
});
test("enforces floors taxonomy native schemas and exact reachability", () => {
  rejects((v) => {
    const f = v.facts.find((x: any) => x.criticality === "critical");
    f.criticality = "noncritical";
  }, /fact|conflict/);
  rejects(
    (v) =>
      (v.facts.find((x: any) => x.taxonomy === "omissions").absence = null),
    /fact|coherence/,
  );
  rejects((v) => {
    const f = v.facts.find((x: any) => x.semantic.domain === "model");
    f.semantic.domain = "prompt";
    f.factReceipt = mac("a-semantic", "u4-fact", {
      ...f,
      factReceipt: undefined,
      criticalityEvidence: { ...f.criticalityEvidence, receipt: undefined },
    });
  }, /subdomain/);
  rejects((v) => (v.nativeSchemas[0].version = "2"), /native schema|join/);
  rejects((v) => (v.facts[0].default.valueJson = '"wrong"'), /shape/);
  rejects((v) => v.dimensions.pop(), /closed world/);
  rejects((v) => {
    const p = { ...v.provenance[0], id: "surplus" },
      body = {
        id: p.id,
        sourceId: p.sourceId,
        nativeSchemaId: p.nativeSchemaId,
        kind: p.kind,
        sourceVersion: p.sourceVersion,
        mediaType: p.mediaType,
        acquiredAt: p.acquiredAt,
        sha256: p.sha256,
      };
    p.bodyReceipt = mac(p.producerAuthorityId, "u4-provenance-body", body);
    p.custodyReceipt = mac(p.custodyAuthorityId, "u4-provenance-custody", {
      ...body,
      producerAuthorityId: p.producerAuthorityId,
      bytesBase64: p.bytesBase64,
    });
    v.provenance.push(p);
  }, /surplus/);
});
test("verifier redigests and resource bounds reject", () => {
  const [v, c, r, t] = valid(),
    f: any = freezeU4SourceInventory(v, c, r, t),
    copy: any = structuredClone(f);
  copy.digest = H("bad");
  expect(() => verifyFrozenU4SourceInventory(copy, c, r, t)).toThrow(/digest/);
  rejects((v) => (v.facts[0].denotation = "x".repeat(1_048_577)), /field|byte/);
});
test("compiled registry anchor rejects a consistently redigested population", () => {
  const [, c, r, t] = valid(),
    x: any = structuredClone(r),
    { digest: _, ...body } = x;
  void _;
  body.sources[0].nativeVersion = "2";
  x.sources = body.sources;
  x.digest = computeU4SyntheticSourceRegistryDigest(body);
  expect(() => freezeU4SourceInventory(inventory(), c, x, t)).toThrow(
    /independent registry fixture|registry/,
  );
});
test("trusted keys reject rekey-resign and producer-custodian role alias", () => {
  rejects((v: any) => {
    const a = v.authorities.find((x: any) => x.id === "a-spec"),
      k = Buffer.alloc(32, 7);
    a.verificationKeyDigest = H(k);
    a.trustRootSha256 = H(k);
    for (const p of v.provenance.filter(
      (x: any) => x.producerAuthorityId === "a-spec",
    )) {
      const body = {
        id: p.id,
        kind: p.kind,
        sourceVersion: p.sourceVersion,
        mediaType: p.mediaType,
        acquiredAt: p.acquiredAt,
        sha256: p.sha256,
      };
      p.bodyReceipt = createHmac("sha256", k)
        .update("u4-provenance-body\0")
        .update(C(body))
        .digest("hex");
    }
  }, /trusted key/);
  rejects((v) => {
    const p = v.provenance[0];
    p.custodyAuthorityId = p.producerAuthorityId;
  }, /provenance/);
});
test("conflict redigest criticality floor schema resign and invalid dates reject", () => {
  rejects((v) => {
    const c = v.conflicts[0];
    c.leftProposition = "rewritten";
    c.leftValueDigest = computeU4PropositionDigest(c.leftProposition);
  }, /adjudicator|conflict join/);
  rejects((v) => {
    const f = v.facts.find((x: any) => x.criticality === "critical");
    f.criticality = "noncritical";
    f.criticalityEvidence.receipt = mac("a-semantic", "u4-criticality", {
      factId: f.id,
      criticality: f.criticality,
      rationale: f.criticalityEvidence.rationale,
      evidenceProvenanceId: f.criticalityEvidence.evidenceProvenanceId,
      sourceFloor: f.criticalityEvidence.sourceFloor,
    });
  }, /fact|receipt/);
  rejects((v) => {
    const s = v.nativeSchemas[0],
      b = Buffer.from('{"type":"string"}');
    s.valueShape = { type: "string" };
    s.schemaBytesBase64 = b.toString("base64");
    s.schemaSha256 = H(b);
    s.semanticSchemaDigest = computeU4NativeSchemaDigest(s.valueShape);
    s.producerReceipt = mac("a-schema", "u4-native-schema", {
      id: s.id,
      version: s.version,
      sourceId: s.sourceId,
      pathPrefix: s.pathPrefix,
      schemaSha256: s.schemaSha256,
      semanticSchemaDigest: s.semanticSchemaDigest,
    });
    s.custodyReceipt = mac("a-custody", "u4-native-schema-custody", {
      id: s.id,
      schemaBytesBase64: s.schemaBytesBase64,
      schemaSha256: s.schemaSha256,
      producerAuthorityId: s.producerAuthorityId,
    });
    const p = v.provenance.find((x: any) => x.kind === "native-schema");
    p.bytesBase64 = b.toString("base64");
    p.byteLength = b.length;
    p.sha256 = H(b);
    const body = {
      id: p.id,
      sourceId: p.sourceId,
      nativeSchemaId: p.nativeSchemaId,
      kind: p.kind,
      sourceVersion: p.sourceVersion,
      mediaType: p.mediaType,
      acquiredAt: p.acquiredAt,
      sha256: p.sha256,
    };
    p.bodyReceipt = mac(p.producerAuthorityId, "u4-provenance-body", body);
    p.custodyReceipt = mac(p.custodyAuthorityId, "u4-provenance-custody", {
      ...body,
      producerAuthorityId: p.producerAuthorityId,
      bytesBase64: p.bytesBase64,
    });
  }, /shape/);
  rejects(
    (v) => (v.provenance[0].acquiredAt = "2026-02-30T00:00:00.000Z"),
    /provenance/,
  );
  rejects(
    (v, t) => (t.chronology.frontendOutcomeNotBefore = "not-a-date"),
    /chronology/,
  );
});
test("taxonomy coherence is per source and catches a second-source context gap", () => {
  const facts: any[] = inventory().facts.flatMap((f) => [
    f,
    { ...structuredClone(f), sourceId: "source-b" },
  ]);
  expect(() =>
    verifyU4TaxonomyCoherence(["source", "source-b"], facts),
  ).not.toThrow();
  const i = facts.findIndex(
    (f) => f.sourceId === "source-b" && f.semantic.domain === "model",
  );
  facts.splice(i, 1);
  expect(() =>
    verifyU4TaxonomyCoherence(["source", "source-b"], facts),
  ).toThrow(/subdomain/);
});
test("source custody owner schema path and extraction topology resist substitution", () => {
  rejects((v) => {
    const p = v.provenance.find((x: any) => x.kind === "source-behavior");
    p.sourceId = "source-b";
    const body = {
      id: p.id,
      sourceId: p.sourceId,
      nativeSchemaId: p.nativeSchemaId,
      kind: p.kind,
      sourceVersion: p.sourceVersion,
      mediaType: p.mediaType,
      acquiredAt: p.acquiredAt,
      sha256: p.sha256,
    };
    p.bodyReceipt = mac(p.producerAuthorityId, "u4-provenance-body", body);
    p.custodyReceipt = mac(p.custodyAuthorityId, "u4-provenance-custody", {
      ...body,
      producerAuthorityId: p.producerAuthorityId,
      bytesBase64: p.bytesBase64,
    });
  }, /provenance join/);
  rejects(
    (v) => (v.sources[0].frontendOwnerId = "wrong-frontend"),
    /source authority owner/,
  );
  rejects((v, t) => {
    const a = v.authorities.find((x: any) => x.id === "a-freezer"),
      k = t.authorityKeys.find((x: any) => x.authorityId === "a-freezer");
    a.ownerId = "implementer";
    k.ownerId = "implementer";
  }, /source independence|source authority/);
  rejects((v) => {
    const s = structuredClone(v.nativeSchemas[0]);
    s.id = "native2";
    s.producerReceipt = mac("a-schema", "u4-native-schema", {
      id: s.id,
      version: s.version,
      sourceId: s.sourceId,
      pathPrefix: s.pathPrefix,
      schemaSha256: s.schemaSha256,
      semanticSchemaDigest: s.semanticSchemaDigest,
    });
    s.custodyReceipt = mac("a-custody", "u4-native-schema-custody", {
      id: s.id,
      schemaBytesBase64: s.schemaBytesBase64,
      schemaSha256: s.schemaSha256,
      producerAuthorityId: s.producerAuthorityId,
    });
    v.nativeSchemas.push(s);
  }, /native schema provenance/);
  rejects((v) => {
    v.nativeSchemas[0].pathPrefix = "/foo";
    v.nativeSchemas[0].producerReceipt = mac("a-schema", "u4-native-schema", {
      id: v.nativeSchemas[0].id,
      version: v.nativeSchemas[0].version,
      sourceId: v.nativeSchemas[0].sourceId,
      pathPrefix: "/foo",
      schemaSha256: v.nativeSchemas[0].schemaSha256,
      semanticSchemaDigest: v.nativeSchemas[0].semanticSchemaDigest,
    });
    v.facts[1].nativePath = "/foobar";
  }, /native schema join|fact identity/);
  rejects((v) => (v.conflicts[0].leftJsonPointer = "/missing"), /extraction/);
  rejects((v) => {
    const c = v.conflicts[0];
    c.adjudicationEvidenceProvenanceId = "unreachable";
    const body = {
      ...c,
      adjudicationEvidenceDigest: undefined,
      adjudicationReceipt: undefined,
      evidenceProvenanceSha256: undefined,
    };
    c.adjudicationEvidenceDigest = computeU4AdjudicationEvidenceDigest(body);
    c.adjudicationReceipt = mac("a-adjudicator", "u4-adjudication", {
      ...c,
      adjudicationReceipt: undefined,
    });
  }, /adjudicator/);
});

import {
  createU4InventoryReplayCertificate,
  verifyU4InventoryReplayCertificate,
  verifyU4ReplaySourceGitCustody,
  verifyU4ReplayImplementationCustody,
  U4_REPLAY_IMPLEMENTATION_CUSTODY_MANIFEST,
  U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST,
  computeU4ReplayImplementationCustodyDigest,
  computeU4FrontendReplayResultDigest,
} from "./organization-u4-inventory-replay-certificate";
import {
  freezeU4ProbeRun,
  freezeU4VerifiedProbeBundle,
  computeU4ProbeMaterialDigest,
  computeU4SyntheticU3TrustAnchorDigest,
} from "./organization-u4-probe-protocol";

import {replayInputs,replayVariant} from "./organization-u4-probe-test-fixture";
const allNoncreditReplayInputs = () => {
  const x = replayInputs(), plan = x.probeBundle.bundle.plan,
    original = x.probeBundle.bundle.executions[0].run,
    { digest: _digest, ...runBody } = structuredClone(original) as any;
  void _digest;
  const malformed = Buffer.from("{");
  runBody.stdoutBase64 = malformed.toString("base64");
  runBody.stdoutSha256 = H(malformed);
  runBody.operatorReceipt = "";
  runBody.custodyReceipt = "";
  const rb = { ...runBody };
  delete rb.operatorReceipt;
  delete rb.custodyReceipt;
  runBody.operatorReceipt = mac("a-probe", "u4-probe-run", rb);
  runBody.custodyReceipt = mac("a-custody", "u4-probe-run-custody", { ...rb, operatorAuthorityId: runBody.operatorAuthorityId, operatorReceipt: runBody.operatorReceipt });
  const run = freezeU4ProbeRun(runBody, plan, x.inventory, x.trusted), materials: any[] = [],
    bundleBody: any = { schema:"open-autonomy.u4-verified-probe-bundle.v1",fixtureKind:"synthetic",denominatorScope:"fixture-local",empiricalRegistration:false,closureClaim:false,inventoryDigest:x.inventory.digest,calculusDigest:x.calculus.digest,u3ContractDigest:x.probeBundle.u3Contract.digest,u3TrustAnchorDigest:computeU4SyntheticU3TrustAnchorDigest(x.probeBundle.u3Contract,{keys:{}}),materialDigests:[],plan,executions:[{invocationId:run.invocationId,disposition:"noncredit",noncreditReason:"malformed-output",run,join:null,u3InputDigest:null,u3ReportDigest:null}] },
    bundle = freezeU4VerifiedProbeBundle(bundleBody,materials,x.inventory,x.calculus,x.probeBundle.u3Contract,x.trusted,x.sourceRegistry);
  x.probeBundle = { bundle, materials, u3Contract:x.probeBundle.u3Contract };
  x.outcome.resultDigest = computeU4FrontendReplayResultDigest(x.inventory.digest,x.calculus.digest,x.sourceRegistry.digest,bundle.digest,bundle.u3ContractDigest,bundle.materialDigests);
  x.outcome.receipt = mac("a-frontend","u4-frontend-outcome",{schema:x.outcome.schema,at:x.outcome.at,authorityId:x.outcome.authorityId,ownerId:x.outcome.ownerId,resultDigest:x.outcome.resultDigest});
  return x;
};
test("I23-I24 creates deterministic deeply frozen replay with exact topology", () => {
  const x = replayInputs(),
    a = createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    ),
    b = createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    );
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
  expect(Object.isFrozen(a.evidenceNodes[0])).toBe(true);
  expect(a.fixtureKind).toBe("synthetic");
  expect(a.closureClaim).toBe(false);
  expect(x.probeBundle.bundle.executions[0].disposition).toBe("credited");
  expect(x.probeBundle.materials).toHaveLength(1);
  const invocation = x.probeBundle.bundle.executions[0].invocationId;
  expect(a.evidenceNodes.map((n) => n.id)).toContain(`execution.${invocation}`);
  expect(a.evidenceNodes.map((n) => n.id)).toContain(`run.${invocation}`);
  expect(a.evidenceNodes.map((n) => n.id)).toContain(`join.${invocation}`);
  expect(a.evidenceNodes.map((n) => n.id)).toContain(`material.${invocation}`);
  expect(a.implementationCustodyDigest).toBe(U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST);
  expect(a.evidenceNodes).toHaveLength(15);
  expect(a.evidenceEdges).toHaveLength(19);
  expect(
    verifyU4InventoryReplayCertificate(
      a,
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    ),
  ).toEqual(a);
});
test("I23-I24 replays an authenticated all-noncredit denominator with terminal topology",()=>{
  const x=allNoncreditReplayInputs(),a=createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome),invocation=x.probeBundle.bundle.executions[0].invocationId;
  expect(x.probeBundle.bundle.executions[0].disposition).toBe("noncredit");
  expect(a.evidenceNodes.map(n=>n.id)).toContain(`terminal.${invocation}`);
  expect(a.evidenceNodes.map(n=>n.id)).not.toContain(`material.${invocation}`);
  expect(()=>verifyU4InventoryReplayCertificate(a,x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome)).not.toThrow();
});
test("I23-I24 replays a mixed credited and noncredit denominator",()=>{const x=replayVariant([{caseId:"case",repetition:0,kind:"credited"},{caseId:"case",repetition:1,kind:"noncredit"}]),a=createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome);expect(x.probeBundle.bundle.executions.map((e:any)=>e.disposition).sort()).toEqual(["credited","noncredit"]);expect(a.evidenceNodes).toHaveLength(18);expect(a.evidenceEdges).toHaveLength(24);expect(a.evidenceNodes.filter(n=>n.id.startsWith("join."))).toHaveLength(1);expect(a.evidenceNodes.filter(n=>n.id.startsWith("terminal."))).toHaveLength(1)});
test("I23-I24 replays exact multi-case and repetition denominators",()=>{const x=replayVariant([{caseId:"case.a",repetition:0,kind:"credited"},{caseId:"case.a",repetition:1,kind:"noncredit"},{caseId:"case.b",repetition:0,kind:"credited"}],true),a=createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome);expect(x.probeBundle.bundle.executions).toHaveLength(3);expect(new Set(x.probeBundle.bundle.executions.map((e:any)=>e.run.caseId))).toEqual(new Set(["case.a","case.b"]));expect(a.evidenceNodes).toHaveLength(22);expect(a.evidenceEdges).toHaveLength(31);expect(a.evidenceNodes.filter(n=>n.id.startsWith("execution."))).toHaveLength(3)});
test("aggregate replay rejects execution omission duplicate run identity and missing credited material",()=>{const x:any=replayVariant([{caseId:"case",repetition:0,kind:"credited"},{caseId:"case",repetition:1,kind:"noncredit"}]),omitted=structuredClone(x.probeBundle);omitted.bundle.executions.pop();expect(()=>createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,omitted,x.outcome)).toThrow(/totality|probe/);const missing=structuredClone(x.probeBundle);missing.materials=[];expect(()=>createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,missing,x.outcome)).toThrow(/material|probe/);const duplicate=structuredClone(x.probeBundle),target=duplicate.bundle.executions.find((e:any)=>e.disposition==="noncredit"),{digest:_,...rb}=target.run;void _;rb.runId=duplicate.bundle.executions.find((e:any)=>e.disposition==="credited").run.runId;rb.operatorReceipt="";rb.custodyReceipt="";const signed={...rb};delete signed.operatorReceipt;delete signed.custodyReceipt;rb.operatorReceipt=mac("a-probe","u4-probe-run",signed);rb.custodyReceipt=mac("a-custody","u4-probe-run-custody",{...signed,operatorAuthorityId:rb.operatorAuthorityId,operatorReceipt:rb.operatorReceipt});target.run=freezeU4ProbeRun(rb,duplicate.bundle.plan,x.inventory,x.trusted);expect(()=>createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,duplicate,x.outcome)).toThrow(/run identity|probe/)});
test("I23 binds committed inventory source bytes", () =>
  expect(() => verifyU4ReplaySourceGitCustody()).not.toThrow());
test("I23 binds the exact committed replay implementation manifest", () => {
  expect(() => verifyU4ReplayImplementationCustody(U4_REPLAY_IMPLEMENTATION_CUSTODY_MANIFEST,U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST)).not.toThrow();
  for (const mutate of [
    (v:any)=>v.implementationCommit="0000000000000000000000000000000000000000",
    (v:any)=>v.files[0].path="packages/core/src/wrong.ts",
    (v:any)=>v.files[0].sha256=H("wrong"),
  ]) {
    const v:any=structuredClone(U4_REPLAY_IMPLEMENTATION_CUSTODY_MANIFEST);mutate(v);const{digest:_,...body}=v;void _;v.digest=computeU4ReplayImplementationCustodyDigest(body);
    expect(()=>verifyU4ReplayImplementationCustody(v,v.digest)).toThrow(/custody/);
  }
  const wrongDigest:any=structuredClone(U4_REPLAY_IMPLEMENTATION_CUSTODY_MANIFEST);wrongDigest.digest=H("wrong");
  expect(()=>verifyU4ReplayImplementationCustody(wrongDigest,U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST)).toThrow(/custody/);
  const surplus:any=structuredClone(U4_REPLAY_IMPLEMENTATION_CUSTODY_MANIFEST);surplus.extra=true;
  expect(()=>verifyU4ReplayImplementationCustody(surplus,U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST)).toThrow(/schema/);
});
test("I23 requires a concrete verified probe bundle without placeholder trust", () => {
  const x = replayInputs();
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      undefined as any,
      x.outcome,
    ),
  ).toThrow(/probe evidence/);
  const forged: any = structuredClone(x.probeBundle);
  forged.bundle.plan.digest = H("forged");
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      forged,
      x.outcome,
    ),
  ).toThrow(/probe/);
  const rebuilt: any = structuredClone(x.probeBundle);
  rebuilt.u3Contract.attackerAuthority = "new-root";
  rebuilt.bundle.u3TrustAnchorDigest = computeU4SyntheticU3TrustAnchorDigest(
    rebuilt.u3Contract,
    { keys: {} },
  );
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      rebuilt,
      x.outcome,
    ),
  ).toThrow(/trust anchor|probe/);
  const keySubstitution: any = structuredClone(x.probeBundle);
  keySubstitution.materials[0].u3Trusted.keys.source = "attacker-source-key";
  keySubstitution.bundle.u3TrustAnchorDigest =
    computeU4SyntheticU3TrustAnchorDigest(
      keySubstitution.u3Contract,
      keySubstitution.materials[0].u3Trusted,
    );
  keySubstitution.bundle.materialDigests = keySubstitution.materials
    .map(computeU4ProbeMaterialDigest)
    .sort();
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      keySubstitution,
      x.outcome,
    ),
  ).toThrow(/trust anchor|probe/);
  const materialSubstitution: any = structuredClone(x.probeBundle);
  materialSubstitution.materials[0].u3Input.source.events[0].payload = false;
  materialSubstitution.bundle.materialDigests = materialSubstitution.materials
    .map(computeU4ProbeMaterialDigest)
    .sort();
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      materialSubstitution,
      x.outcome,
    ),
  ).toThrow(/probe|integrity|authentication|digest/);
});
test("aggregate boundary rejects consistently redigested nominal inventory and calculus", () => {
  const x = replayInputs(),
    { digest: _bundleDigest, ...bundleBody } = structuredClone(
      x.probeBundle.bundle,
    );
  void _bundleDigest;
  const nominalInventory: any = structuredClone(x.inventory);
  nominalInventory.facts[0].denotation = "forged-denotation";
  const { digest: _inventoryDigest, ...inventoryBody } = nominalInventory;
  void _inventoryDigest;
  nominalInventory.digest = computeU4SourceInventoryDigest(inventoryBody);
  expect(() =>
    freezeU4VerifiedProbeBundle(
      bundleBody as any,
      x.probeBundle.materials,
      nominalInventory,
      x.calculus,
      x.probeBundle.u3Contract,
      x.trusted,
      x.sourceRegistry,
    ),
  ).toThrow();
  const { digest: _calculusDigest, ...calculusBody } = structuredClone(
    x.calculus,
  ) as any;
  void _calculusDigest;
  calculusBody.schemas[0].schemaSha256 = H("forged-calculus-schema");
  const nominalCalculus = freezeU3ObservationCalculus(calculusBody, {
    requireFixtureDigest: false,
  });
  expect(() =>
    freezeU4VerifiedProbeBundle(
      bundleBody as any,
      x.probeBundle.materials,
      x.inventory,
      nominalCalculus,
      x.probeBundle.u3Contract,
      x.trusted,
      x.sourceRegistry,
    ),
  ).toThrow();
});
test("I24 frontend outcome is strictly post-freeze and owner-key bound", () => {
  for (const attack of [
    (o: any) => (o.at = "2025-01-01T00:00:00.000Z"),
    (o: any) => (o.at = "invalid"),
    (o: any) => (o.ownerId = "freezer-owner"),
    (o: any) => (o.authorityId = "a-freezer"),
    (o: any) => (o.receipt = "00"),
  ]) {
    const x = replayInputs();
    attack(x.outcome);
    expect(() =>
      createU4InventoryReplayCertificate(
        x.inventory,
        x.calculus,
        x.sourceRegistry,
        x.trusted,
        x.probeBundle,
        x.outcome,
      ),
    ).toThrow(/frontend outcome/);
  }
});
test("frontend outcome is strictly after every authenticated probe execution", () => {
  const x = replayInputs();
  x.outcome.at = x.probeBundle.bundle.executions[0].run.endedAt;
  x.outcome.receipt = mac("a-frontend", "u4-frontend-outcome", {
    schema: x.outcome.schema,
    at: x.outcome.at,
    authorityId: x.outcome.authorityId,
    ownerId: x.outcome.ownerId,
    resultDigest: x.outcome.resultDigest,
  });
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    ),
  ).toThrow(/frontend outcome/);
});
test("frontend outcome cannot fall between executions in a multi-run denominator",()=>{const x:any=replayVariant([{caseId:"case",repetition:0,kind:"credited"},{caseId:"case",repetition:1,kind:"noncredit"}]);const ends=x.probeBundle.bundle.executions.map((e:any)=>e.run.endedAt).sort();x.outcome.at=ends[0];x.outcome.receipt=mac("a-frontend","u4-frontend-outcome",{schema:x.outcome.schema,at:x.outcome.at,authorityId:x.outcome.authorityId,ownerId:x.outcome.ownerId,resultDigest:x.outcome.resultDigest});expect(()=>createU4InventoryReplayCertificate(x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome)).toThrow(/frontend outcome/)});
test("I24 frontend cannot modify or re-sign frozen inventory", () => {
  const x = replayInputs(),
    v: any = structuredClone(x.inventory);
  v.facts[0].denotation = "frontend mutation";
  const { digest: _, ...body } = v;
  void _;
  const freezeBody = {
    inventoryDigest: computeU4SourceInventoryDigest({
      ...body,
      freezeReceipt: "",
    }),
    calculusDigest: v.calculusDigest,
    sourceRegistryDigest: v.sourceRegistryDigest,
    frontendOutcomeNotBefore: v.chronologyPolicy.frontendOutcomeNotBefore,
  };
  body.freezeReceipt = mac("a-frontend", "u4-freeze", freezeBody);
  v.freezeReceipt = body.freezeReceipt;
  v.digest = computeU4SourceInventoryDigest(body);
  expect(() =>
    createU4InventoryReplayCertificate(
      v,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    ),
  ).toThrow(/fact receipt|freeze receipt/);
});
test("frontend cannot authenticate an arbitrary result digest", () => {
  const x = replayInputs();
  x.outcome.resultDigest = H("arbitrary-result");
  x.outcome.receipt = mac("a-frontend", "u4-frontend-outcome", {
    schema: x.outcome.schema,
    at: x.outcome.at,
    authorityId: x.outcome.authorityId,
    ownerId: x.outcome.ownerId,
    resultDigest: x.outcome.resultDigest,
  });
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    ),
  ).toThrow(/frontend outcome/);
});
test("I24 exact evidence topology rejects omission surplus and substitution", () => {
  const x = replayInputs(),
    a: any = createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    );
  const missingCustody:any=structuredClone(a);delete missingCustody.implementationCustodyDigest;
  expect(()=>verifyU4InventoryReplayCertificate(missingCustody,x.inventory,x.calculus,x.sourceRegistry,x.trusted,x.probeBundle,x.outcome)).toThrow(/schema/);
  for (const mutate of [
    (v: any) => v.evidenceNodes.pop(),
    (v: any) => v.evidenceNodes.push({ id: "surplus", digest: H("x") }),
    (v: any) => (v.evidenceEdges[0].to = "frontend-outcome"),
    (v: any) => (v.probeCertificateDigest = H("other")),
    (v: any) => (v.implementationCustodyDigest = H("other")),
  ]) {
    const v = structuredClone(a);
    mutate(v);
    expect(() =>
      verifyU4InventoryReplayCertificate(
        v,
        x.inventory,
        x.calculus,
        x.sourceRegistry,
        x.trusted,
        x.probeBundle,
        x.outcome,
      ),
    ).toThrow(/mismatch/);
  }
}, 20_000);
test("issuance and verification enforce executable Git custody", () => {
  const x = replayInputs(),
    a = createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
    );
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
      { root: "/does-not-exist" },
    ),
  ).toThrow(/custody/);
  expect(() =>
    verifyU4InventoryReplayCertificate(
      a,
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      x.outcome,
      { root: "/does-not-exist" },
    ),
  ).toThrow(/custody/);
});
test("bounded preflight rejects cyclic huge and surplus inputs before canonicalization", () => {
  const x = replayInputs(),
    cycle: any = structuredClone(x.probeBundle);
  cycle.loop = cycle;
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      cycle,
      x.outcome,
    ),
  ).toThrow(/cyclic/);
  const huge: any = structuredClone(x.outcome);
  huge.ownerId = "x".repeat(1_048_577);
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      x.probeBundle,
      huge,
    ),
  ).toThrow(/field|byte/);
  const surplus: any = structuredClone(x.probeBundle);
  surplus.extra = true;
  expect(() =>
    createU4InventoryReplayCertificate(
      x.inventory,
      x.calculus,
      x.sourceRegistry,
      x.trusted,
      surplus,
      x.outcome,
    ),
  ).toThrow(/probe evidence schema/);
});
