import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  freezeCampaignSupersession,
  freezeUniversalityClaim,
  type FrozenUniversalityClaim,
} from "../../packages/core/src/organization-universality-claim";
import { freezeForcingWindowSupplement } from "../../packages/core/src/organization-universality-window-contract";
import { freezeSourceCensusSingleResponseContract } from "../../packages/core/src/organization-universality-single-response-contract";

const prior = "docs/universality/campaign-v6",
  next = "docs/universality/campaign-v7",
  campaignId = "organization-universality-2026-v7",
  censusCutoff = "2026-07-26T23:59:59.999Z",
  raw = `${prior}/u1-github-raw`;
await mkdir(next, { recursive: true });
if (await Bun.file(`${raw}/.capture-lock/owner.json`).exists())
  throw Error(
    "cannot register successor while predecessor capture lock exists",
  );
const listFiles = async () => {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("**/*").scan({
    cwd: raw,
    onlyFiles: true,
  }))
    paths.push(path);
  return paths.sort();
};
const files = await listFiles(),
  stateBytesBefore = new Uint8Array(
    await Bun.file(`${raw}/capture-state.json`).arrayBuffer(),
  );
const evidence = [];
for (const path of files) {
  const bytes = new Uint8Array(await Bun.file(`${raw}/${path}`).arrayBuffer());
  evidence.push({
    path,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    bytes: bytes.length,
  });
}
const filesAfter = await listFiles(),
  stateBytesAfter = new Uint8Array(
    await Bun.file(`${raw}/capture-state.json`).arrayBuffer(),
  );
if (
  JSON.stringify(files) !== JSON.stringify(filesAfter) ||
  !Buffer.from(stateBytesBefore).equals(Buffer.from(stateBytesAfter))
)
  throw Error("predecessor custody changed while successor was registering");
const state = await Bun.file(`${raw}/capture-state.json`).json();
if (
  state.attempts.length !== 4 ||
  state.attempts.some(
    (x: any) => x.status !== "failed" || x.failure !== "leaf-total-count-drift",
  )
)
  throw Error("v6 exhaustion not final");
await Bun.write(
  `${prior}/u1-invalidation.json`,
  JSON.stringify(
    {
      schema: "open-autonomy.github-census-invalidation.v1",
      campaignId: state.campaignId,
      reason: "four-total-attempts-with-fewer-than-two-complete-passes",
      detail:
        "all four attempts encountered count-versus-offset-page membership drift; all evidence is retained and v7 replaces paginated leaves with complete single-response leaves",
      evidence,
    },
    null,
    2,
  ) + "\n",
);
const oldContract = await Bun.file(
    `${prior}/source-census-contract.json`,
  ).json(),
  { digest: _oldContractDigest, ...oldContractBody } = oldContract,
  contract = freezeSourceCensusSingleResponseContract({
    ...oldContractBody,
    schema: "open-autonomy.source-census-single-response-contract.v3",
    id: "oa-source-census-single-response-2026-v7",
    campaignId,
    completion: {
      pass: {
        rootRequest: "per-page-100-page-1-before-partitioning",
        rangeRequest:
          "exactly-one-accepted-per-page-100-page-1-response-per-visited-range",
        maximumTotalAttempts: 4,
        retryableFailures: [
          "transport-failure",
          "non-rate-limit-non-200",
          "malformed-response-schema",
          "incomplete-results-true",
          "cross-range-membership-drift",
          "range-item-outside-query",
        ],
        retryTransition:
          "retain-failed-evidence-discard-pass-and-restart-from-root",
        rateLimitTransition:
          "on-403-with-valid-x-ratelimit-reset-retry-same-request-until-cutoff-without-consuming-pass-attempt",
        immediateInvalidations: [
          "unpartitionable-overflow-leaf",
          "accepted-response-at-or-after-cutoff",
          "raw-body-digest-mismatch",
          "node-id-alias",
        ],
      },
      leaf: {
        maximumResults: 100,
        acceptedResponse:
          "same-per-page-100-response-used-for-count-and-members",
        incompleteResults: "must-be-false",
        completeness:
          "total-count-at-most-100-and-items-length-equals-total-count",
        globalMembership:
          "distinct-node-id-count-across-all-terminal-responses-equals-sum-of-terminal-total-counts",
        containment:
          "every-item-stars-in-closed-star-range-and-created-at-utc-day-in-creation-range-when-present",
        pagination: "forbidden",
      },
      aggregation: oldContract.completion.aggregation,
    },
    evidence: {
      ...oldContract.evidence,
      acceptedResponse: {
        ...oldContract.evidence.acceptedResponse,
        requiredItemFields: [
          "node_id",
          "full_name",
          "stargazers_count",
          "fork",
          "archived",
          "default_branch",
          "created_at",
        ],
        createdAt: "valid-utc-instant-with-yyyy-mm-dd-prefix",
      },
    },
    censusCutoff,
  } as any);
const oldForcing = await Bun.file(`${prior}/forcing-supplement.json`).json(),
  forcing = freezeForcingWindowSupplement({
    schema: "open-autonomy.forcing-window-supplement.v2",
    id: "oa-forcing-window-supplement-2026-v7",
    campaignId,
    populationWeight: 0,
    domainEligibility:
      "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census",
    outOfDomain: "invalidate-campaign",
    overlap:
      "any-final-in-domain-node-in-two-pass-sampling-frame-counts-once-as-adoption-weight-1-otherwise-counts-once-as-forcing-weight-0",
    members: oldForcing.members,
  });
const predecessor = (await Bun.file(
    `${prior}/claim.json`,
  ).json()) as FrozenUniversalityClaim,
  { digest: _, ...claimBody } = predecessor,
  registeredAt = new Date().toISOString(),
  claim = freezeUniversalityClaim({
    ...claimBody,
    campaignId,
    registeredAt,
    sourceSelectionRule: `Operational U1 finite two-pass result-union census defined exactly by ${contract.id} at ${contract.digest}; each terminal query range is captured completely in one accepted response, the union of repositories observed eligible in either complete pass is the frame, and all-and-only in-domain dispositions form the source population`,
    sourceCensusContractDigest: contract.digest,
    forcingSupplementDigest: forcing.digest,
    sourcePopulationId: "oa-source-population-2026-v7",
    compositionPopulationId: "oa-composition-population-2026-v7",
    censusAt: censusCutoff,
    executionSamplingSeed: "oa-universality-2026-v7-execution-sample",
  }),
  supersession = freezeCampaignSupersession(
    {
      schema: "open-autonomy.campaign-supersession.v1",
      predecessorCampaign: predecessor.campaignId,
      predecessorDigest: predecessor.digest,
      successorCampaign: claim.campaignId,
      successorDigest: claim.digest,
      reason:
        "v6 exhausted four attempts because mutable offset pagination repeatedly changed leaf membership; v7 makes every terminal leaf a complete single accepted response while preserving the finite two-pass result union",
      predecessorStatus: "invalidated-before-u1-closure",
    },
    predecessor,
    claim,
  );
await Bun.write(
  `${next}/source-census-contract.json`,
  JSON.stringify(contract, null, 2) + "\n",
);
await Bun.write(
  `${next}/forcing-supplement.json`,
  JSON.stringify(forcing, null, 2) + "\n",
);
await Bun.write(`${next}/claim.json`, JSON.stringify(claim, null, 2) + "\n");
await Bun.write(
  `${next}/supersession.json`,
  JSON.stringify(supersession, null, 2) + "\n",
);
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
