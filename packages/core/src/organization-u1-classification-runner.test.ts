import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import v8 from "../../../docs/universality/campaign-v8/source-census-contract.json";
import v8Claim from "../../../docs/universality/campaign-v8/claim.json";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  freezeU1ClassificationContract,
  freezeU1IdentityJoin,
} from "./organization-u1-classification-contract";
import {
  canonicalV3RepositoryCorpusDigest,
  freezeSourcePopulationV3,
  freezeV3ForcingIdentityMapping,
  type SourcePopulationV3,
  type TrustedSourcePopulationV3Inputs,
} from "./organization-source-population-v3";
import { freezeForcingSupplement } from "./organization-universality-census-contract";
import { freezeUniversalityClaim } from "./organization-universality-claim";
import {
  canonicalU1AcceptedResponseId,
  canonicalU1AttemptHistoryDigest,
  canonicalU1Frame,
  canonicalU1FrameDigest,
  canonicalU1MultiplicityDigest,
  canonicalU1NodeQuotientDigest,
  canonicalU1RequestKey,
  canonicalU1RequestUrl,
  canonicalU1SuccessfulTranscriptDigest,
  canonicalU1TailRequestKey,
  canonicalU1TailRequestUrl,
  canonicalU1WholeCustodyDigest,
  freezeSourceCensusOccurrenceContract,
  sourceCensusOccurrenceConstants,
  validateU1TerminalReplay,
  type SourceCensusOccurrenceContract,
  type U1AcceptedRequest,
  type U1Occurrence,
  type U1TerminalReplay,
} from "./organization-universality-occurrence-contract";
import {
  runU1Classification,
  U1ClassificationRunInvalidation,
  type ClassificationRunnerInput,
  type ClassificationRunnerProvider,
} from "./organization-u1-classification-runner";

const H = (x: string | Buffer) =>
  `sha256:${createHash("sha256").update(x).digest("hex")}` as const;
const D = (d: string, x: unknown) =>
  `sha256:${createHash("sha256")
    .update(`${d}\0${canonicalSemanticJson(x)}`)
    .digest("hex")}` as const;
const P =
  "runtime-autonomously-executes-software-work-or-coordinates-two-or-more-agent-roles-sessions-or-work-items-toward-software-work";
const C = (r: string) => {
  const b = createHash("sha256").update(r.toLowerCase()).digest()[0]!;
  return b <= 50
    ? ("frozen-holdout" as const)
    : b <= 76
      ? ("long-tail-audit" as const)
      : ("development" as const);
};
const O = (
  req: any,
  nodeId: string,
  decision: "in-domain" | "out-of-domain",
  reason: string,
  stratum = nodeId === "f" ? "tail" : "core",
) => ({
  nodeId,
  decision,
  reason,
  ...(req.role === "primary"
    ? {
        descriptor: {
          entityKind: "SourceSystem" as const,
          structuralStratum: stratum,
          sourceOrganization: null,
          nativePlatform: null,
          behaviorHarness: null,
        },
      }
    : {}),
});
const item = {
  node_id: "a",
  full_name: "x/a",
  stargazers_count: 1200,
  default_branch: "main",
  license: null,
  fork: false,
  archived: false,
  created_at: "2025-02-01T00:00:00.000Z",
  description: null,
  topics: ["agent"],
  html_url: "https://github.com/x/a",
};
function request(
  pass: 1 | 2,
  pos: number,
  kind: U1AcceptedRequest["kind"],
): U1AcceptedRequest {
  const range: [number, number] =
      kind === "tail-probe" ? [2000, Number.MAX_SAFE_INTEGER] : [1000, 1999],
    at = `2025-06-0${pass}T00:0${pos}:00.000Z`,
    url =
      kind === "tail-probe"
        ? canonicalU1TailRequestUrl(range[0])
        : canonicalU1RequestUrl(range, null),
    items = kind === "terminal-range" ? [item] : [],
    body = Buffer.from(
      JSON.stringify({
        total_count: items.length,
        incomplete_results: false,
        items,
      }),
    ),
    bd = H(body),
    side = Buffer.from(
      JSON.stringify({
        url,
        startedAt: at,
        observedAt: at,
        status: 200,
        headers: { "content-type": "application/json" },
        bodyDigest: bd,
      }),
    ),
    rd = H(Buffer.from(url)),
    sd = H(side);
  return {
    schema: "open-autonomy.source-census-terminal-request.v1",
    kind,
    attemptId: `a${pass}`,
    attemptNumber: pass,
    completePassOrdinal: pass,
    requestPosition: pos,
    parentRequestPosition: null,
    startedAt: at,
    observedAt: at,
    requestKey:
      kind === "tail-probe"
        ? canonicalU1TailRequestKey(range[0])
        : canonicalU1RequestKey(range, null),
    sidecarBase64: side.toString("base64"),
    responseBodyBase64: body.toString("base64"),
    requestDigest: rd,
    responseBodyDigest: bd,
    sidecarDigest: sd,
    acceptedResponseId: canonicalU1AcceptedResponseId(rd, bd, sd, at),
    queryStars: range,
    queryCreated: null,
    fixedQuery: {
      fork: true,
      perPage: 100,
      page: 1,
      sort: "stars",
      order: "desc",
    },
    totalCount: items.length,
    custody: {
      encoding: "base64",
      sidecar: "exact-captured-sidecar-json-bytes",
      responseBody: "exact-uncompressed-response-body-bytes",
    },
  };
}
function replay(): U1TerminalReplay {
  const requests = [
      request(1, 0, "tail-probe"),
      request(1, 1, "terminal-range"),
      request(2, 0, "tail-probe"),
      request(2, 1, "terminal-range"),
    ],
    occurrences: U1Occurrence[] = [1, 2].map((p: any) => {
      const r = requests.find(
        (x) => x.completePassOrdinal === p && x.requestPosition === 1,
      )!;
      return {
        schema: "open-autonomy.source-census-terminal-occurrence.v1",
        attemptId: `a${p}`,
        completePassOrdinal: p,
        requestPosition: 1,
        itemPosition: 0,
        requestKey: r.requestKey,
        requestDigest: r.requestDigest,
        responseDigest: r.responseBodyDigest,
        nodeId: "a",
        observedAt: r.observedAt,
        queryStars: [1000, 1999],
        queryCreated: null,
        returned: {
          repository: "x/a",
          stars: 1200,
          defaultBranch: "main",
          license: null,
          fork: false,
          archived: false,
          createdAt: "2025-02-01T00:00:00.000Z",
          description: null,
          topics: ["agent"],
          htmlUrl: "https://github.com/x/a",
        },
      };
    });
  return {
    schema: "open-autonomy.source-census-terminal-replay.v1",
    attempts: [1, 2].map((p: any) => ({
      schema: "open-autonomy.source-census-attempt-history.v1",
      attemptId: `a${p}`,
      attemptNumber: p,
      startedAt: `2025-06-0${p}T00:00:00.000Z`,
      endedAt: `2025-06-0${p}T01:00:00.000Z`,
      status: "complete",
      failure: null,
    })),
    passes: [1, 2].map((p: any) => ({
      schema: "open-autonomy.source-census-complete-pass.v1",
      attemptId: `a${p}`,
      attemptNumber: p,
      completePassOrdinal: p,
      startedAt: `2025-06-0${p}T00:00:00.000Z`,
      completedAt: `2025-06-0${p}T01:00:00.000Z`,
      requestCount: 2,
      occurrenceCount: 1,
      frameFrozenAt: p === 2 ? "2025-06-02T01:00:00.000Z" : null,
    })),
    requests,
    occurrences,
  };
}
function fixture(provider?: ClassificationRunnerProvider) {
  const { digest: _, ...censusBody } = structuredClone(v8),
    census = freezeSourceCensusOccurrenceContract({
      ...censusBody,
      schema: "open-autonomy.source-census-occurrence-contract.v5",
      id: "c",
      campaignId: "c",
      completion: structuredClone({
        pass: sourceCensusOccurrenceConstants.pass,
        leaf: sourceCensusOccurrenceConstants.leaf,
        aggregation: sourceCensusOccurrenceConstants.aggregation,
      }),
      invalidation: structuredClone(
        sourceCensusOccurrenceConstants.invalidation,
      ),
    } as unknown as SourceCensusOccurrenceContract),
    rawReplay = replay(),
    validated = validateU1TerminalReplay(census, rawReplay),
    supplement = freezeForcingSupplement({
      schema: "open-autonomy.forcing-supplement.v1",
      id: "f",
      campaignId: "c",
      populationWeight: 0,
      domainEligibility:
        "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census",
      outOfDomain: "invalidate-campaign",
      adoptionOverlap:
        "if-final-in-domain-and-at-least-1000-stars-at-population-instant-count-once-as-adoption-weight-1-otherwise-count-once-as-forcing-weight-0",
      members: [
        { repository: "x/f", structuralStratum: "tail", rationale: "r" },
      ],
    });
  const nodes = ["a", "f"].map((id) => {
    const repository = `x/${id}`,
      commit = id.repeat(40),
      observedAt = "2025-06-02T01:00:00.000Z",
      commitRaw = Buffer.from(
        JSON.stringify({
          schema: "open-autonomy.u1-commit-resolution.v1",
          nodeId: id,
          repository,
          ref: "refs/heads/main",
          commit,
          observedAt,
        }),
      ),
      commitDigest = H(commitRaw),
      docRaw = Buffer.from("shared-doc"),
      bodyDigest = H(docRaw),
      docDigest = D("open-autonomy.u1.repository-evidence-record.v3", {
        nodeId: id,
        repository,
        commit,
        path: "README.md",
        kind: "readme",
        observedAt: "2025-06-02T02:00:00.000Z",
        acquiredAt: "2025-06-02T03:00:00.000Z",
        bodyDigest,
      });
    return {
      nodeId: id,
      repository,
      membership: id === "f" ? ("forcing" as const) : ("frame" as const),
      commitEvidence: {
        digest: commitDigest,
        bytes: commitRaw.length,
        mediaType: "application/json",
        role: "commit-resolution" as const,
        nodeId: id,
        repository,
        ref: "refs/heads/main",
        commit,
        observedAt,
      },
      repositoryEvidence: [
        {
          digest: docDigest,
          bodyDigest,
          bytes: docRaw.length,
          mediaType: "text/plain",
          role: "repository-evidence" as const,
          nodeId: id,
          repository,
          commit,
          path: "README.md",
          kind: "readme" as const,
          observedAt: "2025-06-02T02:00:00.000Z",
          acquiredAt: "2025-06-02T03:00:00.000Z",
        },
      ],
      rawBytes: {
        [commitDigest]: commitRaw.toString("base64"),
        [bodyDigest]: docRaw.toString("base64"),
      },
    };
  });
  const contract = freezeU1ClassificationContract({
      schema: "open-autonomy.u1-classification-contract.v1",
      id: "c",
      campaignId: "c",
      domainPredicate: P,
      inputJoins: {
        censusContractDigest: census.digest,
        forcingSupplementDigest: supplement.digest,
        samplingFrameDigest: canonicalU1FrameDigest(validated),
        repositoryEvidenceDigest: canonicalV3RepositoryCorpusDigest(
          nodes.flatMap((n) => n.repositoryEvidence),
        ),
      },
      identities: {
        authorityId: "identity",
        authenticationPolicyDigest: H("auth"),
      },
      reviewers: [
        {
          role: "primary",
          authorityId: "p",
          provider: "p",
          model: "m",
          modelRevision: "1",
          promptDigest: H("pp"),
          toolPolicyDigest: H("pt"),
        },
        {
          role: "independent",
          authorityId: "i",
          provider: "i",
          model: "m",
          modelRevision: "1",
          promptDigest: H("ip"),
          toolPolicyDigest: H("it"),
        },
        {
          role: "adjudicator",
          authorityId: "t",
          provider: "t",
          model: "m",
          modelRevision: "1",
          promptDigest: H("tp"),
          toolPolicyDigest: H("tt"),
        },
      ],
      custody: {
        exactRawRequestBytesRequired: true,
        exactRawResponseBytesRequired: true,
        digestAlgorithm: "sha256",
        blindIndependentReview: true,
        distinctAuthorities: true,
      },
      batching: {
        primaryBatchSize: 2,
        independentBatchSize: 2,
        adjudicationBatchSize: 1,
        order: "ascending-utf8-node-id",
        maximumAttemptsPerBatch: 2,
        retry: "same-input-digest-same-members-restart-batch",
      },
      evidence: {
        commitPinned: true,
        acceptedKinds: [
          "readme",
          "license",
          "manifest",
          "documentation",
          "source",
        ],
        requireAtLeastOnePrimaryRepositoryDocument: true,
        movingBranchUrlsForbidden: true,
        exactBodyDigestRequired: true,
      },
      review: {
        primaryCoverage: "every-sampling-frame-member",
        primaryInDomainReview: "all",
        outDomainRankDomain: "open-autonomy.u1.out-domain-review.v1",
        outDomainReviewDivisor: 100,
        outDomainReviewCardinality: "ceil-count-over-divisor",
        order: "ascending-unsigned-digest-bytes-then-ascending-utf8-node-id",
        withoutReplacement: true,
      },
      conflicts: {
        queue: "every-primary-independent-disagreement",
        adjudication: "distinct-third-authority-required",
      },
      forcing: {
        protocol: "same-primary-independent-and-adjudication-protocol",
        populationWeight: 0,
        outOfDomain: "invalidate-campaign",
        overlapIdentity: "github-node-id",
      },
      postResultExclusion: "forbidden",
    }),
    mapping = freezeV3ForcingIdentityMapping(contract, supplement, {
      schema: "open-autonomy.u1-forcing-identity-mapping.v1",
      sourceDigest: supplement.digest,
      authorityId: "identity",
      authenticationDigest: H("auth"),
      pairs: [{ repository: "x/f", nodeId: "f" }],
    }),
    { digest: claimDigest, ...claimBody } = structuredClone(v8Claim);
  void claimDigest;
  const claim = freezeUniversalityClaim({
    ...claimBody,
    campaignId: "c",
    sourceCensusContractDigest: census.digest,
    forcingSupplementDigest: supplement.digest,
    sourcePopulationId: "c",
  } as any);
  let tick = 0;
  const at = () => new Date(Date.UTC(2025, 5, 3, 0, tick++)).toISOString(),
    defaultProvider: ClassificationRunnerProvider = async (req) => ({
      outcomes: req.members.map((m) =>
        O(
          req,
          m.nodeId,
          req.role === "independent" && m.nodeId === "a"
            ? "out-of-domain"
            : "in-domain",
          `${req.role}-${m.nodeId}`,
        ),
      ),
    });
  return {
    contract,
    forcingSupplement: supplement,
    claim,
    censusContract: census,
    replay: rawReplay,
    forcingIdentityMapping: mapping,
    nodes,
    provider: provider ?? defaultProvider,
    clock: { now: at },
  } satisfies ClassificationRunnerInput;
}

test("runs deterministic phases from frozen replay", async () => {
  const out = await runU1Classification(fixture());
  expect(out.classifications.map((x) => [x.nodeId, x.finalDecision])).toEqual([
    ["a", "in-domain"],
    ["f", "in-domain"],
  ]);
  expect(out.batchAttempts.filter((x) => x.role === "primary")).toHaveLength(1);
  expect(
    out.batchAttempts.filter((x) => x.role === "independent"),
  ).toHaveLength(1);
  expect(
    out.batchAttempts.filter((x) => x.role === "adjudicator"),
  ).toHaveLength(1);
  expect(
    new Set(
      (
        out.evidence.filter(
          (x: any) => x.role === "repository-evidence",
        ) as any[]
      ).map((x) => x.bodyDigest),
    ).size,
  ).toBe(1);
});
test("retains stable retry custody and then succeeds", async () => {
  let first = true;
  const provider: ClassificationRunnerProvider = async (req) => {
    if (first) {
      first = false;
      throw Error("offline");
    }
    return {
      outcomes: req.members.map((x) => O(req, x.nodeId, "in-domain", "ok")),
    };
  };
  const out = await runU1Classification(fixture(provider)),
    xs = out.batchAttempts.filter(
      (x) => x.role === "primary" && x.batchIndex === 0,
    );
  expect(xs.map((x) => x.status)).toEqual(["failed", "success"]);
  expect(xs[0]!.batchInputDigest).toBe(xs[1]!.batchInputDigest);
});
test("malformed outcomes exhaust with typed custody", async () => {
  await expect(
    runU1Classification(fixture(async () => ({ outcomes: [] }))),
  ).rejects.toMatchObject({ custody: { reason: "invalid-provider-outcome" } });
});
test("provider rejection exhausts with raw retry custody", async () => {
  await expect(
    runU1Classification(
      fixture(async () => {
        throw Error("offline");
      }),
    ),
  ).rejects.toMatchObject({
    custody: {
      reason: "batch-attempts-exhausted",
      batchAttempts: [{ attempt: 1 }, { attempt: 2 }],
    },
  });
});
test("forcing out-of-domain is terminal", async () => {
  const provider: ClassificationRunnerProvider = async (req) => ({
    outcomes: req.members.map((x) =>
      O(
        req,
        x.nodeId,
        x.nodeId === "f" ? "out-of-domain" : "in-domain",
        "classified",
      ),
    ),
  });
  await expect(runU1Classification(fixture(provider))).rejects.toMatchObject({
    custody: { reason: "forcing-out-of-domain" },
  });
});
test("forcing overlap remains terminal when its classification membership is frame", async () => {
  const x = fixture(async (req) => ({
      outcomes: req.members.map((m) =>
        O(
          req,
          m.nodeId,
          m.nodeId === "a" ? "out-of-domain" : "in-domain",
          "classified",
          m.nodeId === "a" ? "tail" : "tail",
        ),
      ),
    })),
    supplement = freezeForcingSupplement({
      schema: "open-autonomy.forcing-supplement.v1",
      id: "f",
      campaignId: "c",
      populationWeight: 0,
      domainEligibility:
        "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census",
      outOfDomain: "invalidate-campaign",
      adoptionOverlap:
        "if-final-in-domain-and-at-least-1000-stars-at-population-instant-count-once-as-adoption-weight-1-otherwise-count-once-as-forcing-weight-0",
      members: [
        { repository: "x/a", structuralStratum: "tail", rationale: "overlap" },
        { repository: "x/f", structuralStratum: "tail", rationale: "r" },
      ],
    }),
    { digest: _, ...contractBody } = x.contract;
  void _;
  x.forcingSupplement = supplement;
  x.contract = freezeU1ClassificationContract({
    ...contractBody,
    inputJoins: {
      ...contractBody.inputJoins,
      forcingSupplementDigest: supplement.digest,
    },
  });
  x.forcingIdentityMapping = freezeV3ForcingIdentityMapping(
    x.contract,
    supplement,
    {
      schema: "open-autonomy.u1-forcing-identity-mapping.v1",
      sourceDigest: supplement.digest,
      authorityId: "identity",
      authenticationDigest: H("auth"),
      pairs: [
        { repository: "x/a", nodeId: "a" },
        { repository: "x/f", nodeId: "f" },
      ],
    },
  );
  const { digest: claimDigest, ...claimBody } = x.claim;
  void claimDigest;
  x.claim = freezeUniversalityClaim({
    ...claimBody,
    forcingSupplementDigest: supplement.digest,
  });
  await expect(runU1Classification(x)).rejects.toMatchObject({
    custody: {
      reason: "forcing-out-of-domain",
      completed: expect.arrayContaining([
        expect.objectContaining({ nodeId: "a", decision: "out-of-domain" }),
      ]),
    },
  });
});
test("rejects replay substitution before provider call", async () => {
  let calls = 0;
  const x = fixture(async () => {
    calls++;
    return { outcomes: [] };
  });
  x.replay = structuredClone(x.replay);
  x.replay.occurrences[0]!.nodeId = "substitute";
  await expect(runU1Classification(x)).rejects.toThrow();
  expect(calls).toBe(0);
});
test("rejects repository corpus substitution before provider call", async () => {
  let calls = 0;
  const x = fixture(async () => {
      calls++;
      return { outcomes: [] };
    }),
    body = {
      ...x.contract,
      inputJoins: {
        ...x.contract.inputJoins,
        repositoryEvidenceDigest: H("wrong"),
      },
    };
  delete (body as any).digest;
  x.contract = freezeU1ClassificationContract(body);
  await expect(runU1Classification(x)).rejects.toThrow(
    "repository corpus join",
  );
  expect(calls).toBe(0);
});
test("rejects invalid exact commit JSON and repository path", async () => {
  for (const kind of ["commit", "path"]) {
    let calls = 0;
    const x = fixture(async () => {
        calls++;
        return { outcomes: [] };
      }),
      n = x.nodes[0]!;
    if (kind === "commit")
      n.rawBytes[n.commitEvidence.digest] =
        Buffer.from("{}").toString("base64");
    else (n.repositoryEvidence[0] as any).path = "../README.md";
    await expect(runU1Classification(x)).rejects.toThrow();
    expect(calls).toBe(0);
  }
});
test("rejects invalid primary descriptor kind and missing stratum", async () => {
  for (const descriptor of [
    {
      entityKind: "Unknown",
      structuralStratum: "core",
      sourceOrganization: null,
      nativePlatform: null,
      behaviorHarness: null,
    },
    {
      entityKind: "SourceSystem",
      structuralStratum: "",
      sourceOrganization: null,
      nativePlatform: null,
      behaviorHarness: null,
    },
  ]) {
    let calls = 0;
    const x = fixture(async (req) => {
      calls++;
      return {
        outcomes: req.members.map((m) => ({
          nodeId: m.nodeId,
          decision: "in-domain" as const,
          reason: "classified",
          ...(req.role === "primary" ? { descriptor: descriptor as any } : {}),
        })),
      };
    });
    await expect(runU1Classification(x)).rejects.toBeInstanceOf(
      U1ClassificationRunInvalidation,
    );
    expect(calls).toBe(2);
  }
});
test("unmodified runner output freezes as a trusted V3 population", async () => {
  const input = fixture(),
    out = await runU1Classification(input),
    validated = validateU1TerminalReplay(input.censusContract, input.replay),
    frame = canonicalU1Frame(validated),
    frameJoin = freezeU1IdentityJoin(input.contract, {
      schema: "open-autonomy.u1-identity-join.v1",
      kind: "sampling-frame",
      sourceDigest: input.contract.inputJoins.samplingFrameDigest,
      authorityId: "identity",
      authenticationDigest: H("auth"),
      nodeIds: ["a"],
    }),
    trusted: TrustedSourcePopulationV3Inputs = {
      claim: input.claim,
      forcingSupplement: input.forcingSupplement,
      censusContract: input.censusContract,
      replay: input.replay,
      classificationContract: input.contract,
      frameIdentityJoin: frameJoin,
      forcingIdentityMapping: input.forcingIdentityMapping,
      rawBytes: out.rawBytes,
    },
    node = (id: string) => input.nodes.find((x) => x.nodeId === id)!,
    value: SourcePopulationV3 = {
      schema: "open-autonomy.source-population.v3",
      id: "c",
      campaignId: "c",
      censusCutoff: input.censusContract.censusCutoff,
      domainPredicate: P,
      githubStarThreshold: 1000,
      reviewRankDomain: "open-autonomy.u1.out-domain-review.v1",
      corpusAssignmentRule:
        "sha256-lowercase-repository-first-byte:0-50=frozen-holdout,51-76=long-tail-audit,77-255=development;forcing=long-tail-audit",
      inputJoins: {
        censusContractDigest: input.censusContract.digest,
        forcingSupplementDigest: input.forcingSupplement.digest,
        classificationContractDigest: input.contract.digest,
        successfulTranscriptDigest:
          canonicalU1SuccessfulTranscriptDigest(validated),
        attemptHistoryDigest: canonicalU1AttemptHistoryDigest(validated),
        wholeCustodyDigest: canonicalU1WholeCustodyDigest(validated),
        nodeQuotientDigest: canonicalU1NodeQuotientDigest(validated),
        multiplicityDigest: canonicalU1MultiplicityDigest(validated),
        samplingFrameDigest: canonicalU1FrameDigest(validated),
      },
      samplingFrame: frame,
      forcing: [
        {
          nodeId: "f",
          repository: "x/f",
          structuralStratum: "tail",
          rationale: "r",
        },
      ],
      batchAttempts: out.batchAttempts,
      classifications: out.classifications,
      candidates: [
        {
          nodeId: "a",
          repository: "x/a",
          source: "adoption",
          populationWeight: 1,
          corpus: C("x/a"),
          commit: node("a").commitEvidence.commit,
          commitRef: node("a").commitEvidence.ref,
          commitEvidence: node("a").commitEvidence.digest,
          ...out.classifications.find((x) => x.nodeId === "a")!.primary
            .descriptor!,
          license: null,
        },
        {
          nodeId: "f",
          repository: "x/f",
          source: "forcing",
          populationWeight: 0,
          corpus: "long-tail-audit",
          commit: node("f").commitEvidence.commit,
          commitRef: node("f").commitEvidence.ref,
          commitEvidence: node("f").commitEvidence.digest,
          ...out.classifications.find((x) => x.nodeId === "f")!.primary
            .descriptor!,
          license: null,
        },
      ],
      evidence: out.evidence,
    };
  expect(freezeSourcePopulationV3(value, trusted).classifications).toEqual(
    out.classifications,
  );
});
test("is byte-for-byte deterministic", async () =>
  expect(await runU1Classification(fixture())).toEqual(
    await runU1Classification(fixture()),
  ));
