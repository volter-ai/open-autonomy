import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyFrozenUniversalityClaim,
  type FrozenUniversalityClaim,
} from "./organization-universality-claim";
export const U2_POPULATION_CONTRACT_SCHEMA =
  "open-autonomy.u2-population-contract.v1" as const;
type Sha = `sha256:${string}`;
export const U2_V9_ANCHORS = {
  campaignId: "organization-universality-2026-v9",
  claimDigest:
    "sha256:753adcf34a43908d729b739bd62975cb38508a1a0c4963da6d6bf4c8cf8ae46c",
  claimFileDigest:
    "sha256:b8da679f4242e5a10dba70eb365041bc54e284751fcd879736dad37e3feec18a",
  u1ImplementationBoundaryFileDigest:
    "sha256:b997ec1b7ac848c96c9296cc598500586924f93dbce2110f86472af4775271f5",
  compositionPopulationId: "oa-composition-population-2026-v9",
} as const;
export const U2_EXTERNAL_OBSERVATION_KINDS = [
  "real-identity",
  "authority-ownership-truth",
  "arbitration-validity",
  "implementation-independence",
  "advertisement-meaningfulness-truth",
  "forcing-feature-truth",
  "artifact-custody",
  "holdout-timing",
  "population-registration",
  "adjudicator-separation",
  "resource-bound-reproduction",
  "external-reproduction",
] as const;
const CLAIM_RULE =
  "U2 corpus: preregistered meaningful version-pinned component compositions spanning every named facet family, multi-provider cells, forcing features, and one frozen holdout family; arbitrary combinations excluded only by the frozen rule";
export const U2_PREREGISTERED_POLICIES = {
  opportunityAlgebra: {
    generator: "all-lexicographically-ordered-three-component-subsets",
    opportunityId: "utf8-byte-length-prefixed-canonical-component-id-tuple",
    partition: "every-generated-opportunity-exactly-once",
    compatibility:
      "all-requiresInterfaces-satisfied-and-no-symmetric-conflictsWith",
    exclusionCodes: ["component-conflict", "missing-required-interface"],
    exclusionPrecedence: ["component-conflict", "missing-required-interface"],
    resultDependentExclusion: "forbidden",
  },
  normalization: {
    identifier:
      "lowercase-ascii-alphanumeric-with-internal-dot-underscore-hyphen;nonempty;trimmed",
    version: "nonempty-trimmed-exact-string",
    operation: "normalized-identifier",
    setOrder: "ascending-utf8-byte-order-no-duplicates",
    registryOrder: "ascending-utf8-primary-id",
    compositionReferences: "ascending-component-id-without-verifier-sorting",
    canonicalizer: "canonicalSemanticJson-pinned-by-U2-contract-module-version",
    digestRuntime: "node-crypto-sha256-domain-null-canonical-utf8",
  },
  identityEvidence: {
    registries: [
      "owner",
      "provider",
      "implementation",
      "remote-service",
      "interface",
      "component",
    ],
    exactSchema: true,
    surplusRecords: "forbidden",
    providerGlobalJoin: "provider-has-one-owner-and-one-implementation",
    remoteServiceJoin:
      "nullable-service-id-and-version-exact-owner-provider-join",
    externalObservations: U2_EXTERNAL_OBSERVATION_KINDS,
    externalObservationPolicy:
      "shape-and-registry-validation-only-not-discharge",
  },
  authorityOwnership: {
    exclusiveAuthority: "exactly-one-authoritative-provider-per-state-class",
    replicatedFacet:
      "explicit-arbitration-protocol-and-authoritative-owner-required",
    unresolvedDualAuthority: "incompatible",
    replicatedOwnerDiversity:
      "not-required;provider-diversity-required;owner-diversity-reported-separately",
  },
  assurance: {
    classes: ["reported", "assumed", "observed", "verified"],
    promotion: "forbidden-without-new-evidence",
    aggregation: "report-separately-without-promotion",
  },
  structuralFamilies: {
    aliasIdentity: "same-implementation-id-counts-once",
    independenceDecision:
      "external-implementation-independence-observation-required",
    configurationsOfOneImplementation: "not-independent",
    holdout: "exactly-one-structural-family-all-and-only-holdout",
    minimumDistinctFamilies: 5,
    minimumExternallyEstablishedIndependentFamilies: 5,
  },
  forcingFeatures: {
    registry: "exact-ordered-feature-id-and-semantic-requirement",
    witness: "component-id+facet-family+operation+interface-id",
    operationJoin: "witness-operation-must-be-provided-by-facet-and-interface",
    compositionConservation: "exact-union-of-selected-component-features",
  },
  weights: {
    compositionWeight: "positive-safe-integer",
    aggregation:
      "sum-frozen-weights-over-frozen-meaningful-opportunity-denominator",
    normalization: "none",
    postResultChange: "forbidden",
  },
  resources: {
    maximumComponents: 182,
    maximumRecordsPerRegistry: 10000,
    maximumIdentifierUtf8Bytes: 256,
    maximumVersionUtf8Bytes: 256,
    maximumOperationUtf8Bytes: 256,
    maximumNestedRecords: 100000,
    maximumArtifactBytes: 67108864,
    maximumGeneratedOpportunities: 1000000,
  },
  antiRetroactivity: {
    policyChange: "requires-new-campaign-and-composition-population-ids",
    populationMutationAfterResults: "forbidden",
    holdoutTiming: "external-observation-required",
  },
  floors: {
    facetFamilies: 10,
    minimumMultiProviderCompositions: 1,
    minimumCompositionsWithThreeExternallyEstablishedIndependentOwners: 2,
    minimumDistinctStructuralFamilies: 5,
    minimumExternallyEstablishedIndependentStructuralFamilies: 5,
  },
} as const;
export type U2PopulationContract = {
  schema: typeof U2_POPULATION_CONTRACT_SCHEMA;
  id: string;
  campaignId: string;
  compositionPopulationId: string;
  compositionSelectionRule: typeof CLAIM_RULE;
  status: "preregistered-contract-only";
  empiricalPopulationRegistered: false;
  u2ClosureClaimed: false;
  boundary: {
    claimDigest: Sha;
    claimFileDigest: Sha;
    u1ImplementationBoundaryFileDigest: Sha;
  };
  policies: typeof U2_PREREGISTERED_POLICIES;
};
export type FrozenU2PopulationContract = U2PopulationContract & { digest: Sha };
export type U2PopulationContractTrustedInputs = {
  claim: FrozenUniversalityClaim;
  claimFileBytes: Uint8Array;
  u1ImplementationBoundaryFileBytes: Uint8Array;
};
const canon = (x: unknown) => canonicalSemanticJson(x),
  sha = (x: Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  digest = (x: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${U2_POPULATION_CONTRACT_SCHEMA}\0${canon(x)}`)
      .digest("hex")}` as Sha,
  keys = (x: object, k: string[], l: string) => {
    if (canon(Object.keys(x).sort()) !== canon([...k].sort()))
      throw Error(`${l} schema must be exact`);
  },
  id = (x: string) => /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  freeze = <T>(x: T): T => {
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      Object.values(x as object).forEach(freeze);
      Object.freeze(x);
    }
    return x;
  };
export function freezeU2PopulationContract(
  v: U2PopulationContract,
  trusted: U2PopulationContractTrustedInputs,
): FrozenU2PopulationContract {
  keys(
    v,
    [
      "schema",
      "id",
      "campaignId",
      "compositionPopulationId",
      "compositionSelectionRule",
      "status",
      "empiricalPopulationRegistered",
      "u2ClosureClaimed",
      "boundary",
      "policies",
    ],
    "U2 contract",
  );
  keys(
    v.boundary,
    ["claimDigest", "claimFileDigest", "u1ImplementationBoundaryFileDigest"],
    "U2 boundary",
  );
  const claim = verifyFrozenUniversalityClaim(trusted.claim),
    claimFileDigest = sha(trusted.claimFileBytes),
    u1Digest = sha(trusted.u1ImplementationBoundaryFileBytes);
  let rawClaim: any, rawBoundary: any;
  try {
    rawClaim = JSON.parse(Buffer.from(trusted.claimFileBytes).toString("utf8"));
    rawBoundary = JSON.parse(
      Buffer.from(trusted.u1ImplementationBoundaryFileBytes).toString("utf8"),
    );
  } catch {
    throw Error("U2 trusted boundary JSON invalid");
  }
  keys(
    rawBoundary,
    [
      "schema",
      "checkpoint",
      "status",
      "scope",
      "claimDigest",
      "sourceCensusContractDigest",
      "forcingSupplementDigest",
      "obligations",
      "externalDeferred",
      "accounting",
      "prohibitedClaims",
      "skepticalReview",
      "downstreamBoundary",
      "nextImplementation",
      "nextExternal",
    ],
    "U1 implementation boundary",
  );
  keys(
    rawBoundary.downstreamBoundary,
    ["allowed", "forbidden", "releaseCondition", "prerequisiteIds"],
    "U1 downstream boundary",
  );
  if (
    v.schema !== U2_POPULATION_CONTRACT_SCHEMA ||
    !id(v.id) ||
    v.status !== "preregistered-contract-only" ||
    v.empiricalPopulationRegistered ||
    v.u2ClosureClaimed ||
    v.campaignId !== claim.campaignId ||
    v.compositionPopulationId !== claim.compositionPopulationId ||
    v.compositionSelectionRule !== CLAIM_RULE ||
    claim.compositionSelectionRule !== CLAIM_RULE ||
    v.boundary.claimDigest !== claim.digest ||
    v.boundary.claimFileDigest !== claimFileDigest ||
    v.boundary.u1ImplementationBoundaryFileDigest !== u1Digest ||
    rawClaim.digest !== claim.digest ||
    rawClaim.campaignId !== claim.campaignId ||
    rawBoundary.schema !==
      "open-autonomy.universality-checkpoint-implementation-closure.v1" ||
    rawBoundary.status !==
      "implementation-complete-external-validation-deferred" ||
    rawBoundary.claimDigest !== claim.digest ||
    rawBoundary.nextImplementation !== "U2"
  )
    throw Error("U2 campaign/boundary join invalid");
  if (
    v.campaignId !== U2_V9_ANCHORS.campaignId ||
    claim.digest !== U2_V9_ANCHORS.claimDigest ||
    claimFileDigest !== U2_V9_ANCHORS.claimFileDigest ||
    u1Digest !== U2_V9_ANCHORS.u1ImplementationBoundaryFileDigest ||
    v.compositionPopulationId !== U2_V9_ANCHORS.compositionPopulationId ||
    canon(rawClaim) !== canon(claim) ||
    canon(rawBoundary.downstreamBoundary?.prerequisiteIds) !==
      canon(["U1-E1", "U1-E2", "U1-E3", "U1-E4"]) ||
    canon(rawBoundary.externalDeferred?.map((x: any) => x.id)) !==
      canon(["U1-E1", "U1-E2", "U1-E3", "U1-E4"]) ||
    rawBoundary.nextExternal !== "U1-E1" ||
    canon(rawBoundary.accounting) !==
      canon({ openInternal: 0, dischargedInternal: 17, deferredExternal: 4 }) ||
    canon(rawBoundary.prohibitedClaims) !==
      canon([
        "v9 empirical source population is complete",
        "U1 semantic population gate is externally validated",
        "universality denominators are frozen from live v9 results",
      ]) ||
    !Array.isArray(rawBoundary.obligations) ||
    canon(rawBoundary.obligations.map((x: any) => x.id)) !==
      canon(Array.from({ length: 17 }, (_, i) => `U1-I${i + 1}`))
  )
    throw Error("U2 independently compiled V9 anchor invalid");
  if (canon(v.policies) !== canon(U2_PREREGISTERED_POLICIES))
    throw Error("U2 policies weakened or ambiguous");
  const body = structuredClone(v);
  return freeze({ ...body, digest: digest(body) });
}
export function verifyFrozenU2PopulationContract(
  v: FrozenU2PopulationContract,
  trusted: U2PopulationContractTrustedInputs,
) {
  keys(
    v,
    [
      "schema",
      "id",
      "campaignId",
      "compositionPopulationId",
      "compositionSelectionRule",
      "status",
      "empiricalPopulationRegistered",
      "u2ClosureClaimed",
      "boundary",
      "policies",
      "digest",
    ],
    "frozen U2 contract",
  );
  const { digest: seen, ...body } = v,
    f = freezeU2PopulationContract(body, trusted);
  if (seen !== f.digest) throw Error("U2 contract digest mismatch");
  return f;
}

export type U2AuthorityState = {
  stateClassId: string;
  mode: "exclusive" | "replicated";
  authoritativeProviderId: string;
  ownerId: string;
  evidenceRef: Sha;
  arbitration: null | { protocolId: string; version: string; evidenceRef: Sha };
};
export type U2AuthorityAdvertisement = {
  componentId: string;
  stateClassId: string;
  providerId: string;
  ownerId: string;
  role: "authoritative" | "replica";
  evidenceRef: Sha;
};
export type U2AuthorityRequirement = {
  stateClassId: string;
  mode: "exclusive" | "replicated";
  requiredComponentIds: string[];
};
export function validateU2AuthorityGrammar(
  states: U2AuthorityState[],
  ads: U2AuthorityAdvertisement[],
  providers: Map<string, { ownerId: string }>,
  components: Map<string, { providerId: string }>,
  requirements: U2AuthorityRequirement[],
) {
  const order = (xs: string[]) => canon(xs) === canon([...xs].sort());
  if (
    !requirements.length ||
    new Set(requirements.map((x) => x.stateClassId)).size !==
      requirements.length ||
    canon(requirements.map((x) => x.stateClassId)) !==
      canon([...requirements.map((x) => x.stateClassId)].sort()) ||
    canon(requirements.map((x) => x.stateClassId)) !==
      canon(states.map((x) => x.stateClassId))
  )
    throw Error("U2 authority requirement totality invalid");
  for (const r of requirements) {
    keys(
      r,
      ["stateClassId", "mode", "requiredComponentIds"],
      "authority requirement",
    );
    if (
      !id(r.stateClassId) ||
      !(r.mode === "exclusive" || r.mode === "replicated") ||
      !r.requiredComponentIds.length ||
      canon(r.requiredComponentIds) !==
        canon([...r.requiredComponentIds].sort()) ||
      new Set(r.requiredComponentIds).size !== r.requiredComponentIds.length ||
      r.requiredComponentIds.some((x) => !components.has(x)) ||
      (r.mode === "exclusive"
        ? r.requiredComponentIds.length !== 1
        : r.requiredComponentIds.length < 2)
    )
      throw Error("U2 authority requirement invalid");
  }
  if (
    new Set(states.map((x) => x.stateClassId)).size !== states.length ||
    new Set(
      ads.map((x) => `${x.stateClassId}\0${x.providerId}\0${x.componentId}`),
    ).size !== ads.length ||
    !order(states.map((x) => x.stateClassId)) ||
    !order(
      ads.map((x) => `${x.stateClassId}\0${x.providerId}\0${x.componentId}`),
    )
  )
    throw Error("U2 authority order invalid");
  for (const s of states) {
    keys(
      s,
      [
        "stateClassId",
        "mode",
        "authoritativeProviderId",
        "ownerId",
        "evidenceRef",
        "arbitration",
      ],
      "authority state",
    );
    const p = providers.get(s.authoritativeProviderId),
      rows = ads.filter((x) => x.stateClassId === s.stateClassId),
      auth = rows.filter((x) => x.role === "authoritative"),
      requirement = requirements.find(
        (x) => x.stateClassId === s.stateClassId,
      )!;
    if (
      !id(s.stateClassId) ||
      !(s.mode === "exclusive" || s.mode === "replicated") ||
      !id(s.authoritativeProviderId) ||
      !id(s.ownerId) ||
      !p ||
      p.ownerId !== s.ownerId ||
      auth.length !== 1 ||
      auth[0]!.providerId !== s.authoritativeProviderId ||
      auth[0]!.ownerId !== s.ownerId ||
      !/^sha256:[a-f0-9]{64}$/.test(s.evidenceRef)
    )
      throw Error("U2 authority ownership invalid");
    if (
      s.mode !== requirement.mode ||
      canon(rows.map((x) => x.componentId).sort()) !==
        canon(requirement.requiredComponentIds) ||
      rows.some(
        (x) => x.componentId !== auth[0]!.componentId && x.role !== "replica",
      )
    )
      throw Error("U2 authority requirement coverage invalid");
    if (s.arbitration) {
      keys(
        s.arbitration,
        ["protocolId", "version", "evidenceRef"],
        "authority arbitration",
      );
      if (s.arbitration.version !== s.arbitration.version.trim())
        throw Error("U2 arbitration version invalid");
    }
    if (
      s.mode === "exclusive"
        ? s.arbitration !== null || rows.length !== 1
        : s.arbitration === null ||
          new Set(rows.map((x) => x.providerId)).size < 2 ||
          !id(s.arbitration.protocolId) ||
          !s.arbitration.version.trim() ||
          !/^sha256:[a-f0-9]{64}$/.test(s.arbitration.evidenceRef)
    )
      throw Error("U2 authority cardinality/arbitration invalid");
  }
  for (const a of ads) {
    keys(
      a,
      [
        "componentId",
        "stateClassId",
        "providerId",
        "ownerId",
        "role",
        "evidenceRef",
      ],
      "authority advertisement",
    );
    if (
      !id(a.componentId) ||
      !id(a.stateClassId) ||
      !id(a.providerId) ||
      !id(a.ownerId) ||
      !(a.role === "authoritative" || a.role === "replica") ||
      components.get(a.componentId)?.providerId !== a.providerId ||
      providers.get(a.providerId)?.ownerId !== a.ownerId ||
      !states.some((x) => x.stateClassId === a.stateClassId) ||
      !/^sha256:[a-f0-9]{64}$/.test(a.evidenceRef)
    )
      throw Error("U2 authority advertisement invalid");
  }
  return true;
}
export class U2ResourceLimitError extends Error {
  constructor(
    readonly code:
      | "component-count"
      | "opportunity-count"
      | "registry-count"
      | "nested-count"
      | "identifier-bytes"
      | "version-bytes"
      | "operation-bytes"
      | "artifact-bytes",
  ) {
    super(`U2 resource preflight rejected: ${code}`);
  }
}
export type U2ResourceArtifact = {
  registries: {
    owners: unknown[];
    providers: unknown[];
    implementations: unknown[];
    services: unknown[];
    interfaces: unknown[];
  };
  components: unknown[];
  nested: unknown[];
  payload: string;
};
export function preflightU2Resources(x: U2ResourceArtifact) {
  keys(
    x,
    ["registries", "components", "nested", "payload"],
    "resource artifact",
  );
  keys(
    x.registries,
    ["owners", "providers", "implementations", "services", "interfaces"],
    "resource registries",
  );
  const registryCounts = Object.values(x.registries).map((a) => a.length),
    componentCount = x.components.length;
  if (componentCount > U2_PREREGISTERED_POLICIES.resources.maximumComponents)
    throw new U2ResourceLimitError("component-count");
  const opportunities =
    componentCount < 3
      ? 0
      : (componentCount * (componentCount - 1) * (componentCount - 2)) / 6;
  if (!Number.isSafeInteger(opportunities) || opportunities > 1_000_000)
    throw new U2ResourceLimitError("opportunity-count");
  if (
    registryCounts.some(
      (n) => n > U2_PREREGISTERED_POLICIES.resources.maximumRecordsPerRegistry,
    )
  )
    throw new U2ResourceLimitError("registry-count");
  let nestedRecordCount = 0;
  const ids: string[] = [],
    versions: string[] = [],
    operations: string[] = [];
  const walk = (v: unknown, key = "") => {
    if (v && typeof v === "object") {
      nestedRecordCount++;
      if (Array.isArray(v)) v.forEach((y) => walk(y, key));
      else
        for (const [k, y] of Object.entries(v)) {
        if (typeof y === "string") {
          if (k === "id" || /Id$/.test(k)) ids.push(y);
          if (k === "version") versions.push(y);
          if (k === "operation") operations.push(y);
        }
          if (k === "operations" && Array.isArray(y))
            operations.push(
              ...(y.filter((z) => typeof z === "string") as string[]),
            );
          walk(y, k);
        }
    }
  };
  walk(x);
  if (
    nestedRecordCount > U2_PREREGISTERED_POLICIES.resources.maximumNestedRecords
  )
    throw new U2ResourceLimitError("nested-count");
  if (
    ids.some(
      (s) =>
        Buffer.byteLength(s, "utf8") >
          U2_PREREGISTERED_POLICIES.resources.maximumIdentifierUtf8Bytes ||
        !s.length,
    )
  )
    throw new U2ResourceLimitError("identifier-bytes");
  if (
    versions.some(
      (s) =>
        !s.trim() ||
        Buffer.byteLength(s, "utf8") >
          U2_PREREGISTERED_POLICIES.resources.maximumVersionUtf8Bytes,
    )
  )
    throw new U2ResourceLimitError("version-bytes");
  if (
    operations.some(
      (s) =>
        !s.trim() ||
        Buffer.byteLength(s, "utf8") >
          U2_PREREGISTERED_POLICIES.resources.maximumOperationUtf8Bytes,
    )
  )
    throw new U2ResourceLimitError("operation-bytes");
  const artifactByteLength = Buffer.byteLength(canon(x), "utf8");
  if (
    artifactByteLength >
    U2_PREREGISTERED_POLICIES.resources.maximumArtifactBytes
  )
    throw new U2ResourceLimitError("artifact-bytes");
  return {
    generatedOpportunityCount: opportunities,
    registryCounts,
    componentCount,
    nestedRecordCount,
    artifactByteLength,
  };
}
export type U2ExternalObservation = {
  observationId: string;
  kind: (typeof U2_EXTERNAL_OBSERVATION_KINDS)[number];
  subjectKind:
    | "owner"
    | "provider"
    | "implementation"
    | "service"
    | "interface"
    | "component"
    | "state-class"
    | "arbitration"
    | "opportunity"
    | "forcing-feature"
    | "evidence"
    | "structural-family"
    | "population"
    | "authority"
    | "artifact"
    | "campaign";
  subjectId: string;
  authorityId: string;
  provenanceDigest: Sha;
  observedAt: string;
  version: string;
  assurance: "observed" | "verified";
  decision: "confirmed" | "rejected";
  reason: string;
  signatureDigest: Sha;
  custodyDigest: Sha;
};
export function validateU2ExternalObservationShapeAndRegistry(
  xs: U2ExternalObservation[],
  snapshot: {
    subjects: Partial<
      Record<U2ExternalObservation["subjectKind"], Set<string>>
    >;
    authorities: Set<string>;
  },
) {
  const sorted = [...xs].sort((a, b) =>
    Buffer.from(
      `${a.kind}\0${a.subjectKind}\0${a.subjectId}\0${a.observationId}`,
    ).compare(
      Buffer.from(
        `${b.kind}\0${b.subjectKind}\0${b.subjectId}\0${b.observationId}`,
      ),
    ),
  );
  if (
    canon(xs) !== canon(sorted) ||
    new Set(xs.map((x) => x.observationId)).size !== xs.length
  )
    throw Error("external observation order/identity invalid");
  for (const x of xs) {
    keys(
      x,
      [
        "observationId",
        "kind",
        "subjectKind",
        "subjectId",
        "authorityId",
        "provenanceDigest",
        "observedAt",
        "version",
        "assurance",
        "decision",
        "reason",
        "signatureDigest",
        "custodyDigest",
      ],
      "external observation",
    );
    const allowed: Record<
      U2ExternalObservation["kind"],
      U2ExternalObservation["subjectKind"][]
    > = {
      "real-identity": [
        "owner",
        "provider",
        "implementation",
        "service",
        "interface",
        "component",
      ],
      "authority-ownership-truth": ["state-class"],
      "arbitration-validity": ["arbitration"],
      "implementation-independence": ["implementation"],
      "advertisement-meaningfulness-truth": ["component", "opportunity"],
      "forcing-feature-truth": ["forcing-feature"],
      "artifact-custody": ["evidence", "artifact"],
      "holdout-timing": ["structural-family"],
      "population-registration": ["population"],
      "adjudicator-separation": ["authority"],
      "resource-bound-reproduction": ["artifact"],
      "external-reproduction": ["campaign"],
    };
    if (
      !id(x.observationId) ||
      !U2_EXTERNAL_OBSERVATION_KINDS.includes(x.kind) ||
      !id(x.subjectId) ||
      !id(x.authorityId) ||
      !allowed[x.kind]?.includes(x.subjectKind) ||
      !snapshot.subjects[x.subjectKind]?.has(x.subjectId) ||
      !snapshot.authorities.has(x.authorityId) ||
      ![x.provenanceDigest, x.signatureDigest, x.custodyDigest].every((d) =>
        /^sha256:[a-f0-9]{64}$/.test(d),
      ) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x.observedAt) ||
      new Date(x.observedAt).toISOString() !== x.observedAt ||
      !x.version.trim() ||
      x.version !== x.version.trim() ||
      !x.reason.trim() ||
      x.reason !== x.reason.trim() ||
      !(x.assurance === "observed" || x.assurance === "verified") ||
      !(x.decision === "confirmed" || x.decision === "rejected")
    )
      throw Error("external observation invalid");
  }
  return structuredClone(xs);
}
/** Shape and registry validation only; never discharges an external obligation. */
export const validateU2ExternalObservationInputs =
  validateU2ExternalObservationShapeAndRegistry;
