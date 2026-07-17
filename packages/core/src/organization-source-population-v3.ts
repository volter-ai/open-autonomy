import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  deterministicU1Batches,
  verifyU1ClassificationContract,
  verifyU1IdentityJoin,
  verifyU1RawModelCustody,
  type FrozenU1ClassificationContract,
  type U1IdentityJoin,
} from "./organization-u1-classification-contract";
import {
  canonicalU1AttemptHistoryDigest,
  canonicalU1Frame,
  canonicalU1FrameDigest,
  canonicalU1MetadataProjection,
  canonicalU1MultiplicityDigest,
  canonicalU1NodeQuotientDigest,
  canonicalU1SuccessfulTranscriptDigest,
  canonicalU1WholeCustodyDigest,
  validateU1TerminalReplay,
  verifySourceCensusOccurrenceContract,
  type FrozenSourceCensusOccurrenceContract,
  type U1TerminalReplay,
} from "./organization-universality-occurrence-contract";
import type {
  V2Candidate,
  V2Classification,
  V2Evidence,
  V2ForcingMember,
  V2Review,
} from "./organization-source-population-v2";
import {
  verifyFrozenUniversalityClaim,
  type FrozenUniversalityClaim,
} from "./organization-universality-claim";
import {
  verifyForcingSupplement,
  type FrozenForcingSupplement,
} from "./organization-universality-census-contract";

export const SOURCE_POPULATION_V3_SCHEMA =
  "open-autonomy.source-population.v3" as const;
type Sha = `sha256:${string}`;
type Corpus = "development" | "frozen-holdout" | "long-tail-audit";
type Role = "primary" | "independent" | "third";
export type V3Evidence =
  | Exclude<
      V2Evidence,
      | { role: "github-response" }
      | { role: "repository-evidence" }
      | { role: "review-request" }
      | { role: "review-response" }
    >
  | {
      digest: Sha;
      bodyDigest: Sha;
      bytes: number;
      mediaType: string;
      role: "repository-evidence";
      nodeId: string;
      repository: string;
      commit: string;
      path: string;
      kind: "readme" | "license" | "manifest" | "documentation" | "source";
      acquiredAt: string;
      observedAt: string;
    }
  | {
      digest: Sha;
      bytes: number;
      mediaType: string;
      role: "review-request";
      runId: string;
      reviewer: string;
      authority: Role;
      provider: string;
      model: string;
      modelRevision: string;
      promptDigest: Sha;
      toolPolicyDigest: Sha;
      inputDigest: Sha;
      startedAt: string;
      blindTo: Role[];
      batchIndex: number;
      attempt: number;
      phaseDigest: Sha | null;
    }
  | {
      digest: Sha;
      bytes: number;
      mediaType: string;
      role: "review-response";
      runId: string;
      reviewer: string;
      authority: Role;
      inputDigest: Sha;
      requestDigest: Sha;
      completedAt: string;
    };
export type V3ForcingIdentityMapping = {
  schema: "open-autonomy.u1-forcing-identity-mapping.v1";
  sourceDigest: Sha;
  authorityId: string;
  authenticationDigest: Sha;
  pairs: Array<{ repository: string; nodeId: string }>;
  digest: Sha;
};
export type V3EntityKind =
  "SourceSystem" | "SourceOrganization" | "NativePlatform" | "BehaviorHarness";
export type V3PrimaryDescriptor = {
  entityKind: V3EntityKind;
  structuralStratum: string;
  sourceOrganization: string | null;
  nativePlatform: string | null;
  behaviorHarness: string | null;
};
export type V3Review = V2Review & { descriptor?: V3PrimaryDescriptor };
export type V3Classification = Omit<
  V2Classification,
  "primary" | "independent" | "third"
> & {
  commitEvidence: Sha;
  primary: V3Review;
  independent?: V3Review;
  third?: V3Review;
};
export type V3Candidate = V2Candidate &
  V3PrimaryDescriptor & { license: string | null };
export type V3BatchAttempt = {
  role: "primary" | "independent" | "adjudicator";
  batchIndex: number;
  attempt: number;
  runId: string;
  batchInputDigest: Sha;
  requestDigest: Sha;
  responseDigest: Sha;
  status: "failed" | "success";
  failure: { code: string; message: string } | null;
};
export type SourcePopulationV3 = {
  schema: typeof SOURCE_POPULATION_V3_SCHEMA;
  id: string;
  campaignId: string;
  censusCutoff: string;
  domainPredicate: "runtime-autonomously-executes-software-work-or-coordinates-two-or-more-agent-roles-sessions-or-work-items-toward-software-work";
  githubStarThreshold: 1000;
  reviewRankDomain: "open-autonomy.u1.out-domain-review.v1";
  corpusAssignmentRule: "sha256-lowercase-repository-first-byte:0-50=frozen-holdout,51-76=long-tail-audit,77-255=development;forcing=long-tail-audit";
  inputJoins: {
    censusContractDigest: Sha;
    forcingSupplementDigest: Sha;
    classificationContractDigest: Sha;
    successfulTranscriptDigest: Sha;
    attemptHistoryDigest: Sha;
    wholeCustodyDigest: Sha;
    nodeQuotientDigest: Sha;
    multiplicityDigest: Sha;
    samplingFrameDigest: Sha;
  };
  samplingFrame: ReturnType<typeof canonicalU1Frame>;
  forcing: V2ForcingMember[];
  batchAttempts: V3BatchAttempt[];
  classifications: V3Classification[];
  candidates: V3Candidate[];
  evidence: V3Evidence[];
};
export type FrozenSourcePopulationV3 = SourcePopulationV3 & { digest: Sha };
export type TrustedSourcePopulationV3Inputs = {
  claim: FrozenUniversalityClaim;
  forcingSupplement: FrozenForcingSupplement;
  censusContract: FrozenSourceCensusOccurrenceContract;
  replay: U1TerminalReplay;
  classificationContract: FrozenU1ClassificationContract;
  frameIdentityJoin: U1IdentityJoin;
  forcingIdentityMapping: V3ForcingIdentityMapping;
  rawBytes: Record<string, string>;
};
const canon = (x: unknown) => canonicalSemanticJson(x),
  hash = (domain: string, x: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${domain}\0${canon(x)}`)
      .digest("hex")}` as Sha,
  sha = (b: Uint8Array) =>
    `sha256:${createHash("sha256").update(b).digest("hex")}` as Sha,
  validSha = (x: string) => /^sha256:[a-f0-9]{64}$/.test(x),
  validRepo = (x: string) =>
    /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]+$/.test(x) &&
    !x.endsWith("."),
  time = (x: string) => {
    const n = Date.parse(x);
    if (!Number.isFinite(n)) throw Error("timestamp invalid");
    return n;
  },
  keys = (x: object, k: string[], label: string) => {
    if (canon(Object.keys(x).sort()) !== canon([...k].sort()))
      throw Error(`${label} schema must be exact`);
  },
  optional = (x: object, r: string[], o: string[], label: string) => {
    const a = Object.keys(x);
    if (
      r.some((k) => !a.includes(k)) ||
      a.some((k) => !r.includes(k) && !o.includes(k))
    )
      throw Error(`${label} schema must be exact`);
  };
const utf8 = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b)),
  rank = (id: string, d: string) =>
    createHash("sha256")
      .update(Buffer.concat([Buffer.from(`${d}\0`), Buffer.from(id)]))
      .digest("hex"),
  corpus = (r: string, f: boolean): Corpus => {
    if (f) return "long-tail-audit";
    const b = createHash("sha256").update(r.toLowerCase()).digest()[0]!;
    return b <= 50
      ? "frozen-holdout"
      : b <= 76
        ? "long-tail-audit"
        : "development";
  };
export function validateV3PrimaryDescriptor(d: V3PrimaryDescriptor) {
  keys(
    d,
    [
      "entityKind",
      "structuralStratum",
      "sourceOrganization",
      "nativePlatform",
      "behaviorHarness",
    ],
    "primary descriptor",
  );
  const kinds = [
      "SourceSystem",
      "SourceOrganization",
      "NativePlatform",
      "BehaviorHarness",
    ],
    id = (x: unknown) =>
      typeof x === "string" && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
    slots = {
      SourceSystem: [null, null, null],
      SourceOrganization: [d.sourceOrganization, null, null],
      NativePlatform: [null, d.nativePlatform, null],
      BehaviorHarness: [null, null, d.behaviorHarness],
    }[d.entityKind] as unknown[] | undefined,
    relevant =
      d.entityKind === "SourceOrganization"
        ? d.sourceOrganization
        : d.entityKind === "NativePlatform"
          ? d.nativePlatform
          : d.entityKind === "BehaviorHarness"
            ? d.behaviorHarness
            : null;
  if (
    !kinds.includes(d.entityKind) ||
    typeof d.structuralStratum !== "string" ||
    !d.structuralStratum.trim() ||
    d.structuralStratum !== d.structuralStratum.trim() ||
    !slots ||
    canon([d.sourceOrganization, d.nativePlatform, d.behaviorHarness]) !==
      canon(slots) ||
    slots.some((x) => x !== null && !id(x)) ||
    (d.entityKind !== "SourceSystem" && !id(relevant))
  )
    throw Error("primary descriptor invalid");
  return structuredClone(d);
}
export const canonicalV3CandidateLicense = (
  metadata: { license: string | null } | undefined,
) => metadata?.license ?? null;
export const canonicalV3RepositoryEvidenceRecordDigest = (
  e: Omit<
    Extract<V3Evidence, { role: "repository-evidence" }>,
    "digest" | "bytes" | "mediaType" | "role"
  >,
) =>
  hash("open-autonomy.u1.repository-evidence-record.v3", {
    nodeId: e.nodeId,
    repository: e.repository,
    commit: e.commit,
    path: e.path,
    kind: e.kind,
    observedAt: e.observedAt,
    acquiredAt: e.acquiredAt,
    bodyDigest: e.bodyDigest,
  });
export const canonicalV3RepositoryCorpusDigest = (evidence: V3Evidence[]) =>
  hash(
    "open-autonomy.u1.repository-evidence.v1",
    evidence
      .filter(
        (e): e is Extract<V3Evidence, { role: "repository-evidence" }> =>
          e.role === "repository-evidence",
      )
      .map((e) => ({
        digest: e.digest,
        nodeId: e.nodeId,
        repository: e.repository,
        commit: e.commit,
        path: e.path,
        kind: e.kind,
        bodyDigest: e.bodyDigest,
        acquiredAt: e.acquiredAt,
        observedAt: e.observedAt,
      }))
      .sort((a, b) => a.digest.localeCompare(b.digest)),
  );
export function validateV3NodeEvidence(input: {
  nodeId: string;
  repository: string;
  commitEvidence: Extract<V3Evidence, { role: "commit-resolution" }>;
  repositoryEvidence: Array<
    Extract<V3Evidence, { role: "repository-evidence" }>
  >;
  rawBytes: Record<string, string>;
  frameFreeze: string;
  censusCutoff: string;
}) {
  const {
      nodeId,
      repository,
      commitEvidence: commit,
      repositoryEvidence: docs,
      rawBytes,
      frameFreeze,
      censusCutoff,
    } = input,
    commitRaw = Buffer.from(rawBytes[commit.digest] ?? "", "base64");
  let parsed: any;
  try {
    parsed = JSON.parse(commitRaw.toString("utf8"));
  } catch {
    throw Error("commit resolution raw JSON invalid");
  }
  keys(
    parsed,
    ["schema", "nodeId", "repository", "ref", "commit", "observedAt"],
    "commit resolution raw",
  );
  if (
    sha(commitRaw) !== commit.digest ||
    canon(parsed) !==
      canon({
        schema: "open-autonomy.u1-commit-resolution.v1",
        nodeId: commit.nodeId,
        repository: commit.repository,
        ref: commit.ref,
        commit: commit.commit,
        observedAt: commit.observedAt,
      }) ||
    commit.nodeId !== nodeId ||
    commit.repository.toLowerCase() !== repository.toLowerCase() ||
    !exactUtcV3(frameFreeze) ||
    !exactUtcV3(censusCutoff) ||
    time(commit.observedAt) < time(frameFreeze) ||
    time(commit.observedAt) > time(censusCutoff)
  )
    throw Error("commit resolution custody invalid");
  for (const doc of docs) {
    const raw = Buffer.from(rawBytes[doc.bodyDigest] ?? "", "base64"),
      segments = doc.path.split("/");
    if (
      sha(raw) !== doc.bodyDigest ||
      raw.length !== doc.bytes ||
      doc.digest !== canonicalV3RepositoryEvidenceRecordDigest(doc) ||
      doc.nodeId !== nodeId ||
      doc.repository.toLowerCase() !== repository.toLowerCase() ||
      doc.commit !== commit.commit ||
      !doc.path ||
      doc.path.startsWith("/") ||
      doc.path.includes("\\") ||
      segments.includes("..") ||
      segments.includes("") ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(doc.path) ||
      !(
        ["readme", "license", "manifest", "documentation", "source"] as string[]
      ).includes(doc.kind) ||
      (doc.kind === "source" && /\.(?:exe|dll|bin)$/i.test(doc.path)) ||
      time(doc.observedAt) < time(commit.observedAt) ||
      time(doc.acquiredAt) < time(doc.observedAt) ||
      time(doc.acquiredAt) > time(censusCutoff)
    )
      throw Error("repository evidence custody invalid");
  }
  return { commit: structuredClone(commit), documents: structuredClone(docs) };
}
const exactUtcV3 = (x: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) &&
  new Date(x).toISOString() === x;
export function freezeV3ForcingIdentityMapping(
  classification: FrozenU1ClassificationContract,
  supplement: FrozenForcingSupplement,
  input: Omit<V3ForcingIdentityMapping, "digest">,
): V3ForcingIdentityMapping {
  const c = verifyU1ClassificationContract(classification),
    s = verifyForcingSupplement(supplement);
  keys(
    input,
    ["schema", "sourceDigest", "authorityId", "authenticationDigest", "pairs"],
    "forcing identity mapping",
  );
  const ordered = [...input.pairs].sort(
    (a, b) => utf8(a.repository, b.repository) || utf8(a.nodeId, b.nodeId),
  );
  if (
    input.schema !== "open-autonomy.u1-forcing-identity-mapping.v1" ||
    input.sourceDigest !== s.digest ||
    input.authorityId !== c.identities.authorityId ||
    input.authenticationDigest !== c.identities.authenticationPolicyDigest ||
    input.pairs.length !== s.members.length ||
    canon(input.pairs) !== canon(ordered) ||
    new Set(input.pairs.map((x) => x.repository)).size !== input.pairs.length ||
    new Set(input.pairs.map((x) => x.nodeId)).size !== input.pairs.length
  )
    throw Error("forcing identity mapping invalid");
  for (const p of input.pairs) {
    keys(p, ["repository", "nodeId"], "forcing identity pair");
    if (
      !validRepo(p.repository) ||
      p.repository !== p.repository.toLowerCase() ||
      !p.nodeId
    )
      throw Error("forcing identity pair invalid");
  }
  const body = structuredClone(input);
  return { ...body, digest: hash(input.schema, body) };
}
export function verifyV3ForcingIdentityMapping(
  classification: FrozenU1ClassificationContract,
  supplement: FrozenForcingSupplement,
  input: V3ForcingIdentityMapping,
) {
  const { digest, ...body } = input,
    f = freezeV3ForcingIdentityMapping(classification, supplement, body);
  if (digest !== f.digest)
    throw Error("forcing identity mapping digest mismatch");
  return f;
}

export function freezeSourcePopulationV3(
  v: SourcePopulationV3,
  trusted: TrustedSourcePopulationV3Inputs,
): FrozenSourcePopulationV3 {
  const claim = verifyFrozenUniversalityClaim(trusted.claim),
    supplement = verifyForcingSupplement(trusted.forcingSupplement),
    census = verifySourceCensusOccurrenceContract(trusted.censusContract),
    classification = verifyU1ClassificationContract(
      trusted.classificationContract,
    ),
    replay = validateU1TerminalReplay(census, trusted.replay),
    frameRows = canonicalU1Frame(replay),
    metadata = canonicalU1MetadataProjection(replay),
    frame = new Map(frameRows.map((x) => [x.nodeId, x.metadata.repository]));
  keys(
    v,
    [
      "schema",
      "id",
      "campaignId",
      "censusCutoff",
      "domainPredicate",
      "githubStarThreshold",
      "reviewRankDomain",
      "corpusAssignmentRule",
      "inputJoins",
      "samplingFrame",
      "forcing",
      "batchAttempts",
      "classifications",
      "candidates",
      "evidence",
    ],
    "population",
  );
  keys(
    v.inputJoins,
    [
      "censusContractDigest",
      "forcingSupplementDigest",
      "classificationContractDigest",
      "successfulTranscriptDigest",
      "attemptHistoryDigest",
      "wholeCustodyDigest",
      "nodeQuotientDigest",
      "multiplicityDigest",
      "samplingFrameDigest",
    ],
    "joins",
  );
  const expectedJoins = {
    censusContractDigest: census.digest,
    forcingSupplementDigest: classification.inputJoins.forcingSupplementDigest,
    classificationContractDigest: classification.digest,
    successfulTranscriptDigest: canonicalU1SuccessfulTranscriptDigest(replay),
    attemptHistoryDigest: canonicalU1AttemptHistoryDigest(replay),
    wholeCustodyDigest: canonicalU1WholeCustodyDigest(replay),
    nodeQuotientDigest: canonicalU1NodeQuotientDigest(replay),
    multiplicityDigest: canonicalU1MultiplicityDigest(replay),
    samplingFrameDigest: canonicalU1FrameDigest(replay),
  };
  if (
    v.schema !== SOURCE_POPULATION_V3_SCHEMA ||
    !v.id ||
    v.id !== claim.sourcePopulationId ||
    v.campaignId !== census.campaignId ||
    v.censusCutoff !== census.censusCutoff ||
    v.domainPredicate !== classification.domainPredicate ||
    v.githubStarThreshold !== census.adoption.threshold ||
    v.reviewRankDomain !== classification.review.outDomainRankDomain ||
    v.corpusAssignmentRule !==
      "sha256-lowercase-repository-first-byte:0-50=frozen-holdout,51-76=long-tail-audit,77-255=development;forcing=long-tail-audit" ||
    canon(v.inputJoins) !== canon(expectedJoins) ||
    canon(v.samplingFrame) !== canon(frameRows)
  )
    throw Error("population/replay join invalid");
  if (
    claim.campaignId !== census.campaignId ||
    supplement.campaignId !== census.campaignId ||
    claim.sourceCensusContractDigest !== census.digest ||
    claim.forcingSupplementDigest !== supplement.digest ||
    classification.campaignId !== census.campaignId ||
    classification.inputJoins.censusContractDigest !== census.digest ||
    classification.inputJoins.forcingSupplementDigest !== supplement.digest ||
    classification.inputJoins.samplingFrameDigest !==
      canonicalU1FrameDigest(replay)
  )
    throw Error("classification contract cross-join mismatch");
  const frameJoin = verifyU1IdentityJoin(
      classification,
      trusted.frameIdentityJoin,
    ),
    mapping = verifyV3ForcingIdentityMapping(
      classification,
      supplement,
      trusted.forcingIdentityMapping,
    );
  if (
    frameJoin.kind !== "sampling-frame" ||
    canon(frameJoin.nodeIds) !== canon([...frame.keys()].sort(utf8))
  )
    throw Error("authenticated identity mismatch");
  const pairByRepository = new Map(
      mapping.pairs.map((x) => [x.repository.toLowerCase(), x.nodeId]),
    ),
    derivedForcing = supplement.members.map((m) => ({
      nodeId: pairByRepository.get(m.repository.toLowerCase()) ?? "",
      repository: m.repository,
      structuralStratum: m.structuralStratum,
      rationale: m.rationale,
    }));
  if (
    derivedForcing.some((x) => !x.nodeId) ||
    pairByRepository.size !== supplement.members.length ||
    canon(v.forcing) !== canon(derivedForcing)
  )
    throw Error("registered forcing mismatch");
  const byRepository = new Map(
      metadata.flatMap((x) => x.aliases.map((a) => [a, x.nodeId] as const)),
    ),
    forcing = new Map<string, V2ForcingMember>();
  for (const f of v.forcing) {
    keys(
      f,
      ["nodeId", "repository", "structuralStratum", "rationale"],
      "forcing",
    );
    const mapped = byRepository.get(f.repository.toLowerCase());
    if (
      !f.nodeId ||
      !validRepo(f.repository) ||
      !f.structuralStratum ||
      !f.rationale ||
      forcing.has(f.nodeId) ||
      (mapped !== undefined && mapped !== f.nodeId) ||
      (frame.has(f.nodeId) &&
        frame.get(f.nodeId)!.toLowerCase() !== f.repository.toLowerCase())
    )
      throw Error("forcing identity invalid");
    forcing.set(f.nodeId, f);
  }
  const inventory = new Map<Sha, V3Evidence>();
  for (const e of v.evidence) {
    const roleKeys = {
      "repository-evidence": [
        "digest",
        "bodyDigest",
        "bytes",
        "mediaType",
        "role",
        "nodeId",
        "repository",
        "commit",
        "path",
        "kind",
        "acquiredAt",
        "observedAt",
      ],
      "review-request": [
        "digest",
        "bytes",
        "mediaType",
        "role",
        "runId",
        "reviewer",
        "authority",
        "provider",
        "model",
        "modelRevision",
        "promptDigest",
        "toolPolicyDigest",
        "inputDigest",
        "startedAt",
        "blindTo",
        "batchIndex",
        "attempt",
        "phaseDigest",
      ],
      "review-response": [
        "digest",
        "bytes",
        "mediaType",
        "role",
        "runId",
        "reviewer",
        "authority",
        "inputDigest",
        "requestDigest",
        "completedAt",
      ],
      "commit-resolution": [
        "digest",
        "bytes",
        "mediaType",
        "role",
        "nodeId",
        "repository",
        "ref",
        "commit",
        "observedAt",
      ],
    }[e.role];
    keys(e, roleKeys, "evidence");
    const blobDigest =
        e.role === "repository-evidence" ? e.bodyDigest : e.digest,
      raw = Buffer.from(trusted.rawBytes[blobDigest] ?? "", "base64");
    if (
      !validSha(e.digest) ||
      !validSha(blobDigest) ||
      !Number.isSafeInteger(e.bytes) ||
      e.bytes < 0 ||
      !e.mediaType ||
      inventory.has(e.digest) ||
      raw.length !== e.bytes ||
      sha(raw) !== blobDigest ||
      (e.role === "repository-evidence" &&
        e.digest !==
          hash("open-autonomy.u1.repository-evidence-record.v3", {
            nodeId: e.nodeId,
            repository: e.repository,
            commit: e.commit,
            path: e.path,
            kind: e.kind,
            observedAt: e.observedAt,
            acquiredAt: e.acquiredAt,
            bodyDigest: e.bodyDigest,
          }))
    )
      throw Error("evidence bytes/digest mismatch");
    inventory.set(e.digest, e);
  }
  const expectedBlobs = new Set(
    v.evidence.map((e) =>
      e.role === "repository-evidence" ? e.bodyDigest : e.digest,
    ),
  );
  if (
    canon([...Object.keys(trusted.rawBytes)].sort()) !==
    canon([...expectedBlobs].sort())
  )
    throw Error("trusted byte corpus mismatch");
  const used = new Set<Sha>(),
    get = <T extends V3Evidence["role"]>(d: Sha, r: T) => {
      const e = inventory.get(d);
      if (!e || e.role !== r) throw Error("evidence role/reference invalid");
      used.add(d);
      return e as Extract<V3Evidence, { role: T }>;
    };
  if (
    canonicalV3RepositoryCorpusDigest(v.evidence) !==
    classification.inputJoins.repositoryEvidenceDigest
  )
    throw Error("repository evidence corpus join mismatch");
  const classes = new Map<string, V3Classification>();
  for (const c of v.classifications) {
    optional(
      c,
      [
        "nodeId",
        "repository",
        "membership",
        "primary",
        "finalDecision",
        "commitEvidence",
      ],
      ["independent", "third"],
      "classification",
    );
    const repository = frame.get(c.nodeId) ?? forcing.get(c.nodeId)?.repository,
      membership = frame.has(c.nodeId)
        ? "frame"
        : forcing.has(c.nodeId)
          ? "forcing"
          : undefined;
    if (
      !repository ||
      classes.has(c.nodeId) ||
      repository.toLowerCase() !== c.repository.toLowerCase() ||
      c.membership !== membership
    )
      throw Error("classification identity invalid");
    classes.set(c.nodeId, c);
  }
  const expectedIds = new Set([...frame.keys(), ...forcing.keys()]);
  if (
    classes.size !== expectedIds.size ||
    [...expectedIds].some((x) => !classes.has(x))
  )
    throw Error("classification not total");
  const selected = new Set<string>();
  for (const ids of [
    [...frame.keys()],
    [...forcing.keys()].filter((x) => !frame.has(x)),
  ]) {
    const inside = ids.filter(
        (x) => classes.get(x)!.primary.decision === "in-domain",
      ),
      outside = ids
        .filter((x) => classes.get(x)!.primary.decision === "out-of-domain")
        .sort(
          (a, b) =>
            rank(a, v.reviewRankDomain).localeCompare(
              rank(b, v.reviewRankDomain),
            ) || utf8(a, b),
        );
    inside.forEach((x) => selected.add(x));
    outside
      .slice(
        0,
        Math.ceil(
          outside.length / classification.review.outDomainReviewDivisor,
        ),
      )
      .forEach((x) => selected.add(x));
  }
  const frameFreeze = Math.max(
      ...replay.passes.map((x) => time(x.completedAt)),
    ),
    rawJson = (d: Sha, label: string) => {
      let x: unknown;
      try {
        x = JSON.parse(
          Buffer.from(trusted.rawBytes[d]!, "base64").toString("utf8"),
        );
      } catch {
        throw Error(`${label} raw JSON invalid`);
      }
      if (!x || typeof x !== "object" || Array.isArray(x))
        throw Error(`${label} raw JSON invalid`);
      return x as Record<string, any>;
    },
    ledgerByBatch = new Map<string, V3BatchAttempt[]>(),
    runIds = new Set<string>();
  for (const a of v.batchAttempts) {
    keys(
      a,
      [
        "role",
        "batchIndex",
        "attempt",
        "runId",
        "batchInputDigest",
        "requestDigest",
        "responseDigest",
        "status",
        "failure",
      ],
      "batch attempt",
    );
    if (
      !["primary", "independent", "adjudicator"].includes(a.role) ||
      !Number.isSafeInteger(a.batchIndex) ||
      a.batchIndex < 0 ||
      !Number.isSafeInteger(a.attempt) ||
      a.attempt < 1 ||
      a.attempt > classification.batching.maximumAttemptsPerBatch ||
      !a.runId ||
      runIds.has(a.runId) ||
      !validSha(a.batchInputDigest)
    )
      throw Error("batch attempt invalid");
    runIds.add(a.runId);
    const key = `${a.role}:${a.batchIndex}`;
    ledgerByBatch.set(key, [...(ledgerByBatch.get(key) ?? []), a]);
  }
  for (const attempts of ledgerByBatch.values()) {
    attempts.sort((a, b) => a.attempt - b.attempt);
    const first = attempts[0]!;
    if (
      attempts.some(
        (a, i) =>
          a.attempt !== i + 1 ||
          a.batchInputDigest !== first.batchInputDigest ||
          a.status !== (i === attempts.length - 1 ? "success" : "failed") ||
          (a.status === "success") !== (a.failure === null),
      )
    )
      throw Error("batch retry ledger invalid");
    let stableMembers: string | undefined,
      stablePhase: string | undefined,
      previousCompleted: number | undefined;
    for (const a of attempts) {
      const req = get(a.requestDigest, "review-request"),
        res = get(a.responseDigest, "review-response"),
        rawReq = rawJson(req.digest, "review request ledger");
      const started = time(req.startedAt),
        completed = time(res.completedAt);
      if (
        completed < started ||
        completed > time(v.censusCutoff) ||
        (previousCompleted !== undefined && started <= previousCompleted) ||
        rawReq.phaseDigest !== req.phaseDigest
      )
        throw Error("batch attempt chronology or phase invalid");
      previousCompleted = completed;
      if (
        req.runId !== a.runId ||
        res.runId !== a.runId ||
        req.batchIndex !== a.batchIndex ||
        req.attempt !== a.attempt ||
        req.inputDigest !== a.batchInputDigest ||
        res.inputDigest !== a.batchInputDigest ||
        res.requestDigest !== req.digest ||
        rawReq.runId !== a.runId ||
        rawReq.role !== a.role ||
        rawReq.batchIndex !== a.batchIndex ||
        rawReq.attempt !== a.attempt ||
        rawReq.inputDigest !== a.batchInputDigest ||
        !Array.isArray(rawReq.members)
      )
        throw Error("batch ledger custody mismatch");
      keys(
        rawReq,
        [
          "schema",
          "runId",
          "role",
          "authorityId",
          "provider",
          "model",
          "modelRevision",
          "promptDigest",
          "toolPolicyDigest",
          "inputDigest",
          "blindTo",
          "batchIndex",
          "attempt",
          "phaseDigest",
          "members",
        ],
        "raw review request ledger",
      );
      const policy = classification.reviewers.find((x) => x.role === a.role);
      if (
        rawReq.schema !== "open-autonomy.u1-review-request.v1" ||
        !policy ||
        rawReq.authorityId !== policy.authorityId ||
        rawReq.provider !== policy.provider ||
        rawReq.model !== policy.model ||
        rawReq.modelRevision !== policy.modelRevision ||
        rawReq.promptDigest !== policy.promptDigest ||
        rawReq.toolPolicyDigest !== policy.toolPolicyDigest ||
        canon(rawReq.blindTo) !==
          canon(a.role === "independent" ? ["primary"] : []) ||
        req.reviewer !== policy.authorityId ||
        res.reviewer !== policy.authorityId ||
        req.authority !== (a.role === "adjudicator" ? "third" : a.role) ||
        res.authority !== req.authority
      )
        throw Error("batch ledger policy mismatch");
      const encoded = canon(rawReq.members),
        encodedPhase = canon(rawReq.phaseDigest);
      if (
        (stableMembers !== undefined &&
          (stableMembers !== encoded || stablePhase !== encodedPhase)) ||
        a.batchInputDigest !==
          hash("open-autonomy.u1.review-batch-input.v3", {
            role: a.role,
            batchIndex: a.batchIndex,
            members: rawReq.members,
          })
      )
        throw Error("batch retry input drift");
      stableMembers = encoded;
      stablePhase = encodedPhase;
      if (a.status === "failed") {
        if (!a.failure || !a.failure.code || !a.failure.message)
          throw Error("typed batch failure invalid");
        keys(a.failure, ["code", "message"], "batch failure");
        const raw = rawJson(res.digest, "failed review response");
        keys(
          raw,
          ["schema", "runId", "requestDigest", "inputDigest", "error"],
          "failed review response",
        );
        if (
          canon(raw) !==
          canon({
            schema: "open-autonomy.u1-review-failure.v1",
            runId: a.runId,
            requestDigest: a.requestDigest,
            inputDigest: a.batchInputDigest,
            error: a.failure,
          })
        )
          throw Error("failed review custody mismatch");
      }
    }
  }
  const terminals = v.batchAttempts.filter((x) => x.status === "success"),
    primaryCompleted = terminals
      .filter((x) => x.role === "primary")
      .map((x) => time(get(x.responseDigest, "review-response").completedAt)),
    independentStarted = terminals
      .filter((x) => x.role === "independent")
      .map((x) => time(get(x.requestDigest, "review-request").startedAt)),
    primaryPhaseDigest = hash("open-autonomy.u1.primary-phase.v3", {
      responses: terminals
        .filter((x) => x.role === "primary")
        .sort((a, b) => a.batchIndex - b.batchIndex)
        .map((x) => ({
          batchIndex: x.batchIndex,
          responseDigest: x.responseDigest,
        })),
      selectedNodeIds: [...selected].sort(utf8),
    });
  if (
    primaryCompleted.length &&
    independentStarted.length &&
    Math.max(...primaryCompleted) >= Math.min(...independentStarted)
  )
    throw Error("review phase chronology invalid");
  for (const a of v.batchAttempts) {
    const req = get(a.requestDigest, "review-request"),
      rawReq = rawJson(req.digest, "attempt prerequisite request"),
      members = rawReq.members as Array<{ nodeId: string; inputDigest: Sha }>;
    for (const member of members) {
      const c = classes.get(member.nodeId);
      if (!c) throw Error("batch member outside classification");
      const commit = get(c.commitEvidence, "commit-resolution"),
        r =
          a.role === "primary"
            ? c.primary
            : a.role === "independent"
              ? c.independent
              : c.third;
      if (!r) throw Error("batch member role review missing");
      for (const d of r.repositoryEvidence) {
        const doc = get(d, "repository-evidence");
        if (
          time(commit.observedAt) < frameFreeze ||
          time(doc.observedAt) < time(commit.observedAt) ||
          time(doc.acquiredAt) < time(doc.observedAt) ||
          time(req.startedAt) <= time(doc.acquiredAt)
        )
          throw Error("batch attempt repository prerequisite invalid");
      }
    }
    if (a.role === "primary") {
      if (req.phaseDigest !== null)
        throw Error("primary phase binding invalid");
    } else if (a.role === "independent") {
      if (
        !primaryCompleted.length ||
        time(req.startedAt) <= Math.max(...primaryCompleted) ||
        req.phaseDigest !== primaryPhaseDigest
      )
        throw Error("independent attempt phase invalid");
    } else {
      const conflicts = members.map((m) => {
          const c = classes.get(m.nodeId)!;
          if (
            !c.independent ||
            !c.third ||
            c.primary.decision === c.independent.decision
          )
            throw Error("adjudication member is not a conflict");
          return {
            nodeId: c.nodeId,
            primaryResponseDigest: c.primary.responseDigest,
            independentResponseDigest: c.independent.responseDigest,
          };
        }),
        phase = hash("open-autonomy.u1.conflict-phase.v3", conflicts),
        completed = conflicts.flatMap((x) => [
          time(get(x.primaryResponseDigest, "review-response").completedAt),
          time(get(x.independentResponseDigest, "review-response").completedAt),
        ]);
      if (
        req.phaseDigest !== phase ||
        time(req.startedAt) <= Math.max(...completed)
      )
        throw Error("adjudication attempt phase invalid");
    }
  }
  const expectedLedgerKeys = [
    ...(["primary", "independent", "adjudicator"] as const),
  ]
    .flatMap((role) =>
      deterministicU1Batches(
        classification,
        role,
        role === "primary"
          ? [...classes.keys()]
          : role === "independent"
            ? [...selected]
            : [...classes.values()].filter((x) => x.third).map((x) => x.nodeId),
      ).map((_, i) => role + ":" + i),
    )
    .sort();
  if (canon([...ledgerByBatch.keys()].sort()) !== canon(expectedLedgerKeys))
    throw Error("batch ledger coverage invalid");
  const review = (r: V3Review, role: Role, c: V3Classification) => {
    keys(
      r,
      [
        "reviewer",
        "authority",
        "decision",
        "reason",
        "inputDigest",
        "requestDigest",
        "responseDigest",
        "repositoryEvidence",
        ...(role === "primary" ? ["descriptor"] : []),
      ],
      "review",
    );
    if (role === "primary") validateV3PrimaryDescriptor(r.descriptor!);
    const contractRole = role === "third" ? "adjudicator" : role,
      policy = classification.reviewers.find((x) => x.role === contractRole);
    if (
      !policy ||
      r.reviewer !== policy.authorityId ||
      r.authority !== role ||
      !r.reason ||
      !r.repositoryEvidence.length ||
      !(r.decision === "in-domain" || r.decision === "out-of-domain")
    )
      throw Error("review/model policy invalid");
    const input = {
      nodeId: c.nodeId,
      repository: c.repository,
      membership: c.membership,
      domainPredicate: v.domainPredicate,
      repositoryEvidence: r.repositoryEvidence,
    };
    if (r.inputDigest !== hash("open-autonomy.u1.review-input.v2", input))
      throw Error("review input digest mismatch");
    validateV3NodeEvidence({
      nodeId: c.nodeId,
      repository: c.repository,
      commitEvidence: get(c.commitEvidence, "commit-resolution"),
      repositoryEvidence: r.repositoryEvidence.map((d) =>
        get(d, "repository-evidence"),
      ),
      rawBytes: trusted.rawBytes,
      frameFreeze: replay.passes[1]!.completedAt,
      censusCutoff: v.censusCutoff,
    });
    const req = get(r.requestDigest, "review-request"),
      res = get(r.responseDigest, "review-response"),
      commit = get(c.commitEvidence, "commit-resolution"),
      rawCommit = rawJson(commit.digest, "commit resolution");
    keys(
      rawCommit,
      ["schema", "nodeId", "repository", "ref", "commit", "observedAt"],
      "raw commit resolution",
    );
    if (
      canon(rawCommit) !==
        canon({
          schema: "open-autonomy.u1-commit-resolution.v1",
          nodeId: commit.nodeId,
          repository: commit.repository,
          ref: commit.ref,
          commit: commit.commit,
          observedAt: commit.observedAt,
        }) ||
      commit.nodeId !== c.nodeId ||
      commit.repository.toLowerCase() !== c.repository.toLowerCase()
    )
      throw Error("commit resolution payload mismatch");
    for (const d of r.repositoryEvidence) {
      const e = get(d, "repository-evidence"),
        segments = e.path.split("/");
      if (
        e.nodeId !== c.nodeId ||
        e.repository.toLowerCase() !== c.repository.toLowerCase() ||
        e.commit !== commit.commit ||
        !/^[a-f0-9]{40}$/.test(e.commit) ||
        !e.path ||
        e.path.startsWith("/") ||
        e.path.includes("\\") ||
        segments.includes("..") ||
        segments.includes("") ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/.test(e.path) ||
        !classification.evidence.acceptedKinds.includes(e.kind) ||
        (e.kind === "source" && /\.(?:exe|dll|bin)$/i.test(e.path)) ||
        time(commit.observedAt) < frameFreeze ||
        time(e.observedAt) < time(commit.observedAt) ||
        time(e.acquiredAt) < time(e.observedAt) ||
        time(req.startedAt) <= time(e.acquiredAt)
      )
        throw Error("repository evidence not pinned");
    }
    const peers = [...classes.values()]
        .map((x) => ({
          classification: x,
          review: (x as any)[role] as V3Review | undefined,
        }))
        .filter((x) => x.review?.requestDigest === r.requestDigest)
        .sort((a, b) => utf8(a.classification.nodeId, b.classification.nodeId)),
      members = peers.map((x) => ({
        nodeId: x.classification.nodeId,
        inputDigest: x.review!.inputDigest,
      })),
      roleIds =
        role === "primary"
          ? [...classes.keys()]
          : role === "independent"
            ? [...selected]
            : [...classes.values()].filter((x) => x.third).map((x) => x.nodeId),
      batches = deterministicU1Batches(classification, contractRole, roleIds),
      expectedBatch = batches[req.batchIndex],
      batchInputDigest = hash("open-autonomy.u1.review-batch-input.v3", {
        role: contractRole,
        batchIndex: req.batchIndex,
        members,
      }),
      decisions = peers.map((x) => ({
        nodeId: x.classification.nodeId,
        decision: x.review!.decision,
        reason: x.review!.reason,
        ...(role === "primary"
          ? { descriptor: x.classification.primary.descriptor }
          : {}),
      })),
      conflicts = peers.map((x) => ({
        nodeId: x.classification.nodeId,
        primaryResponseDigest: x.classification.primary.responseDigest,
        independentResponseDigest: x.classification.independent!.responseDigest,
      })),
      phaseDigest =
        role === "primary"
          ? null
          : role === "independent"
            ? primaryPhaseDigest
            : hash("open-autonomy.u1.conflict-phase.v3", conflicts),
      ledger = ledgerByBatch.get(`${contractRole}:${req.batchIndex}`),
      terminal = ledger?.at(-1);
    if (
      !terminal ||
      terminal.requestDigest !== req.digest ||
      terminal.responseDigest !== res.digest ||
      req.phaseDigest !== phaseDigest ||
      !expectedBatch ||
      canon(expectedBatch) !== canon(members.map((x) => x.nodeId)) ||
      req.inputDigest !== batchInputDigest ||
      res.inputDigest !== batchInputDigest
    )
      throw Error("review batch invalid");
    const rawReq = rawJson(req.digest, "review request"),
      rawRes = rawJson(res.digest, "review response");
    keys(
      rawReq,
      [
        "schema",
        "runId",
        "role",
        "authorityId",
        "provider",
        "model",
        "modelRevision",
        "promptDigest",
        "toolPolicyDigest",
        "inputDigest",
        "blindTo",
        "batchIndex",
        "attempt",
        "phaseDigest",
        "members",
      ],
      "raw review request",
    );
    keys(
      rawRes,
      ["schema", "runId", "requestDigest", "inputDigest", "decisions"],
      "raw review response",
    );
    const expectedReq = {
        schema: "open-autonomy.u1-review-request.v1",
        runId: req.runId,
        role: contractRole,
        authorityId: req.reviewer,
        provider: req.provider,
        model: req.model,
        modelRevision: req.modelRevision,
        promptDigest: req.promptDigest,
        toolPolicyDigest: req.toolPolicyDigest,
        inputDigest: req.inputDigest,
        blindTo: req.blindTo,
        batchIndex: req.batchIndex,
        attempt: req.attempt,
        phaseDigest: req.phaseDigest,
        members,
      },
      expectedRes = {
        schema: "open-autonomy.u1-review-response.v1",
        runId: res.runId,
        requestDigest: req.digest,
        inputDigest: res.inputDigest,
        decisions,
      };
    if (
      canon(rawReq) !== canon(expectedReq) ||
      canon(rawRes) !== canon(expectedRes)
    )
      throw Error("raw review payload mismatch");
    verifyU1RawModelCustody(
      {
        runId: req.runId,
        role: contractRole,
        authorityId: req.reviewer,
        provider: req.provider,
        model: req.model,
        modelRevision: req.modelRevision,
        promptDigest: req.promptDigest,
        toolPolicyDigest: req.toolPolicyDigest,
        inputDigest: req.inputDigest,
        rawRequest: {
          digest: req.digest,
          byteLength: req.bytes,
          evidenceUri: `evidence:${req.digest}`,
        },
        rawResponse: {
          digest: res.digest,
          byteLength: res.bytes,
          evidenceUri: `evidence:${res.digest}`,
        },
        startedAt: req.startedAt,
        completedAt: res.completedAt,
      },
      classification,
      batchInputDigest,
    );
    if (
      role === "third" &&
      peers.some(
        (x) =>
          time(req.startedAt) <=
          Math.max(
            time(
              get(x.classification.primary.responseDigest, "review-response")
                .completedAt,
            ),
            time(
              get(
                x.classification.independent!.responseDigest,
                "review-response",
              ).completedAt,
            ),
          ),
      )
    )
      throw Error("adjudication phase chronology invalid");
    if (
      req.runId !== res.runId ||
      req.reviewer !== res.reviewer ||
      req.authority !== res.authority ||
      res.inputDigest !== batchInputDigest ||
      res.requestDigest !== req.digest ||
      time(res.completedAt) < time(req.startedAt) ||
      time(res.completedAt) > time(v.censusCutoff) ||
      canon(req.blindTo) !== canon(role === "independent" ? ["primary"] : [])
    )
      throw Error("raw model custody invalid");
  };
  for (const c of classes.values()) {
    review(c.primary, "primary", c);
    if (selected.has(c.nodeId) !== !!c.independent)
      throw Error("independent selection invalid");
    if (c.independent) {
      review(c.independent, "independent", c);
      const conflict = c.independent.decision !== c.primary.decision;
      if (conflict !== !!c.third)
        throw Error("third conflict protocol invalid");
      if (c.third) {
        review(c.third, "third", c);
        if (
          new Set([
            c.primary.reviewer,
            c.independent.reviewer,
            c.third.reviewer,
          ]).size !== 3 ||
          c.finalDecision !== c.third.decision
        )
          throw Error("adjudication invalid");
      } else if (c.finalDecision !== c.primary.decision)
        throw Error("final decision invalid");
    } else if (c.third || c.finalDecision !== c.primary.decision)
      throw Error("final decision invalid");
  }
  for (const id of forcing.keys())
    if (classes.get(id)!.finalDecision === "out-of-domain")
      throw Error("forcing out-of-domain invalidates population");
  const expected = new Map<
    string,
    { repository: string; source: "adoption" | "forcing" }
  >();
  for (const [id, repository] of frame)
    if (classes.get(id)!.finalDecision === "in-domain")
      expected.set(id, { repository, source: "adoption" });
  for (const [id, x] of forcing)
    if (!frame.has(id))
      expected.set(id, { repository: x.repository, source: "forcing" });
  if (v.candidates.length !== expected.size)
    throw Error("candidate inclusion not exact");
  const seen = new Set<string>();
  for (const c of v.candidates) {
    keys(
      c,
      [
        "nodeId",
        "repository",
        "source",
        "populationWeight",
        "corpus",
        "commit",
        "commitRef",
        "commitEvidence",
        "entityKind",
        "structuralStratum",
        "sourceOrganization",
        "nativePlatform",
        "behaviorHarness",
        "license",
      ],
      "candidate",
    );
    const x = expected.get(c.nodeId),
      ce = get(c.commitEvidence, "commit-resolution"),
      primaryDescriptor = classes.get(c.nodeId)!.primary.descriptor!,
      forcingRow = forcing.get(c.nodeId),
      frameMetadata = metadata.find((m) => m.nodeId === c.nodeId);
    validateV3PrimaryDescriptor({
      entityKind: c.entityKind,
      structuralStratum: c.structuralStratum,
      sourceOrganization: c.sourceOrganization,
      nativePlatform: c.nativePlatform,
      behaviorHarness: c.behaviorHarness,
    });
    if (
      !x ||
      seen.has(c.nodeId) ||
      x.repository.toLowerCase() !== c.repository.toLowerCase() ||
      x.source !== c.source ||
      c.populationWeight !== (c.source === "forcing" ? 0 : 1) ||
      c.corpus !== corpus(c.repository, c.source === "forcing") ||
      !/^[a-f0-9]{40}$/.test(c.commit) ||
      !c.commitRef ||
      ce.nodeId !== c.nodeId ||
      ce.repository.toLowerCase() !== c.repository.toLowerCase() ||
      ce.commit !== c.commit ||
      ce.ref !== c.commitRef ||
      classes.get(c.nodeId)!.commitEvidence !== c.commitEvidence ||
      canon({
        entityKind: c.entityKind,
        structuralStratum: c.structuralStratum,
        sourceOrganization: c.sourceOrganization,
        nativePlatform: c.nativePlatform,
        behaviorHarness: c.behaviorHarness,
      }) !== canon(primaryDescriptor) ||
      (forcingRow !== undefined &&
        c.structuralStratum !== forcingRow.structuralStratum) ||
      c.license !== canonicalV3CandidateLicense(frameMetadata) ||
      time(ce.observedAt) > time(v.censusCutoff)
    )
      throw Error("candidate/commit join invalid");
    for (const r of [
      classes.get(c.nodeId)!.primary,
      classes.get(c.nodeId)!.independent,
      classes.get(c.nodeId)!.third,
    ].filter(Boolean) as V3Review[])
      for (const d of r.repositoryEvidence)
        if (get(d, "repository-evidence").commit !== c.commit)
          throw Error("commit not joined to classification input");
    seen.add(c.nodeId);
  }
  if (used.size !== inventory.size) throw Error("surplus evidence inventory");
  const body = structuredClone(v);
  return { ...body, digest: hash(v.schema, body) };
}
export function verifyFrozenSourcePopulationV3(
  v: FrozenSourcePopulationV3,
  trusted: TrustedSourcePopulationV3Inputs,
) {
  optional(
    v,
    [
      "schema",
      "id",
      "campaignId",
      "censusCutoff",
      "domainPredicate",
      "githubStarThreshold",
      "reviewRankDomain",
      "corpusAssignmentRule",
      "inputJoins",
      "samplingFrame",
      "forcing",
      "batchAttempts",
      "classifications",
      "candidates",
      "evidence",
      "digest",
    ],
    [],
    "frozen population",
  );
  const { digest, ...body } = v,
    f = freezeSourcePopulationV3(body, trusted);
  if (digest !== f.digest) throw Error("source population v3 digest mismatch");
  return f;
}
