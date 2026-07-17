import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  freezeCampaignSupersession,
  freezeUniversalityClaim,
  type FrozenUniversalityClaim,
} from "../../packages/core/src/organization-universality-claim";
import { freezeForcingWindowSupplement } from "../../packages/core/src/organization-universality-window-contract";
import { freezeSourceCensusIndexObservationContract } from "../../packages/core/src/organization-universality-index-observation-contract";
const prior = "docs/universality/campaign-v7",
  next = "docs/universality/campaign-v8",
  raw = `${prior}/u1-github-raw`,
  campaignId = "organization-universality-2026-v8",
  censusCutoff = "2026-07-29T23:59:59.999Z";
await mkdir(next, { recursive: true });
if (await Bun.file(`${raw}/.capture-lock/owner.json`).exists())
  throw Error("active predecessor capture");
const list = async () => {
    const a: string[] = [];
    for await (const p of new Bun.Glob("**/*").scan({
      cwd: raw,
      onlyFiles: true,
    }))
      a.push(p);
    return a.sort();
  },
  files = await list(),
  before = new Uint8Array(
    await Bun.file(`${raw}/capture-state.json`).arrayBuffer(),
  ),
  evidence = [];
for (const path of files) {
  const b = new Uint8Array(await Bun.file(`${raw}/${path}`).arrayBuffer());
  evidence.push({
    path,
    digest: `sha256:${createHash("sha256").update(b).digest("hex")}`,
    bytes: b.length,
  });
}
if (
  JSON.stringify(files) !== JSON.stringify(await list()) ||
  !Buffer.from(before).equals(
    Buffer.from(await Bun.file(`${raw}/capture-state.json`).arrayBuffer()),
  )
)
  throw Error("custody changed");
const state = JSON.parse(new TextDecoder().decode(before));
if (
  state.attempts.length !== 4 ||
  state.attempts.some(
    (x: any) =>
      x.status !== "failed" || x.failure !== "range-item-outside-query",
  )
)
  throw Error("v7 exhaustion not final");
await Bun.write(
  `${prior}/u1-invalidation.json`,
  JSON.stringify(
    {
      schema: "open-autonomy.github-census-invalidation.v1",
      campaignId: state.campaignId,
      reason: "four-total-attempts-with-fewer-than-two-complete-passes",
      detail:
        "all attempts observed accepted star-range queries whose returned live star metadata had already changed; v8 separates query-index membership from mutable returned metadata and derives the upper bound only from empty tail queries",
      evidence,
    },
    null,
    2,
  ) + "\n",
);
const old = await Bun.file(`${prior}/source-census-contract.json`).json(),
  { digest: _, ...base } = old,
  contract = freezeSourceCensusIndexObservationContract({
    ...base,
    schema: "open-autonomy.source-census-index-observation-contract.v4",
    id: "oa-source-census-index-observation-2026-v8",
    campaignId,
    enumeration: {
      ...base.enumeration,
      starPartition: {
        ...base.enumeration.starPartition,
        upperBoundSource: "first-empty-tail-probe-threshold-minus-one",
      },
    },
    completion: {
      ...base.completion,
      pass: {
        ...base.completion.pass,
        rootRequest: "replaced-by-query-only-tail-probe",
        tailProbe:
          "accepted-per-page-100-page-1-stars-gte-thresholds-2000-times-powers-of-two-until-first-zero-total-count",
        tailProbeTermination:
          "total-count-zero-and-items-length-zero-otherwise-malformed-response-schema",
        retryableFailures: [
          "transport-failure",
          "non-rate-limit-non-200",
          "malformed-response-schema",
          "incomplete-results-true",
          "cross-range-membership-drift",
          "terminal-item-ineligible-or-created-outside-query",
        ],
      },
      leaf: {
        ...base.completion.leaf,
        containment:
          "returned-stargazers-count-at-least-1000-and-created-at-utc-day-in-creation-range-when-present",
        mutableQualifierSemantics:
          "accepted-query-membership-is-range-observation-returned-stargazers-count-is-metadata-and-must-only-meet-global-threshold",
        observationEncoding: {
          fields: [
            "nodeId",
            "pass",
            "observedAt",
            "queryStars",
            "queryCreated",
            "returned",
          ],
          queryStars: "closed-integer-tuple",
          queryCreated: "null-or-closed-utc-day-tuple",
          returnedFields: [
            "repository",
            "stars",
            "defaultBranch",
            "license",
            "fork",
            "archived",
            "createdAt",
            "description",
            "topics",
            "htmlUrl",
          ],
          serialization: "canonical-json",
          ordering:
            "ascending-node-id-then-pass-then-observed-at-then-query-stars-then-query-created",
        },
      },
    },
    censusCutoff,
  } as any),
  oldForcing = await Bun.file(`${prior}/forcing-supplement.json`).json(),
  forcing = freezeForcingWindowSupplement({
    schema: "open-autonomy.forcing-window-supplement.v2",
    id: "oa-forcing-window-supplement-2026-v8",
    campaignId,
    populationWeight: 0,
    domainEligibility:
      "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census",
    outOfDomain: "invalidate-campaign",
    overlap:
      "any-final-in-domain-node-in-two-pass-sampling-frame-counts-once-as-adoption-weight-1-otherwise-counts-once-as-forcing-weight-0",
    members: oldForcing.members,
  }),
  predecessor = (await Bun.file(
    `${prior}/claim.json`,
  ).json()) as FrozenUniversalityClaim,
  { digest: __, ...claimBody } = predecessor,
  registeredAt = new Date().toISOString(),
  claim = freezeUniversalityClaim({
    ...claimBody,
    campaignId,
    registeredAt,
    sourceSelectionRule: `Operational U1 finite two-pass query-result union defined exactly by ${contract.id} at ${contract.digest}; query-only tail probes bound each pass, terminal query membership is retained separately from mutable returned star metadata, and all-and-only in-domain dispositions form the source population`,
    sourceCensusContractDigest: contract.digest,
    forcingSupplementDigest: forcing.digest,
    sourcePopulationId: "oa-source-population-2026-v8",
    compositionPopulationId: "oa-composition-population-2026-v8",
    censusAt: censusCutoff,
    executionSamplingSeed: "oa-universality-2026-v8-execution-sample",
  }),
  supersession = freezeCampaignSupersession(
    {
      schema: "open-autonomy.campaign-supersession.v1",
      predecessorCampaign: predecessor.campaignId,
      predecessorDigest: predecessor.digest,
      successorCampaign: claim.campaignId,
      successorDigest: claim.digest,
      reason:
        "v7 exhausted four attempts because search-index qualifier membership and returned live star metadata are non-atomic; v8 bounds by empty tail queries and retains query ranges as membership observations",
      predecessorStatus: "invalidated-before-u1-closure",
    },
    predecessor,
    claim,
  );
for (const [name, value] of [
  ["source-census-contract.json", contract],
  ["forcing-supplement.json", forcing],
  ["claim.json", claim],
  ["supersession.json", supersession],
] as const)
  await Bun.write(`${next}/${name}`, JSON.stringify(value, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      registeredAt,
      claimDigest: claim.digest,
      contractDigest: contract.digest,
      forcingDigest: forcing.digest,
      supersessionDigest: supersession.digest,
      evidenceFiles: evidence.length,
    },
    null,
    2,
  ),
);
