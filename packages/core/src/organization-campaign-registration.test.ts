import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import v8Claim from "../../../docs/universality/campaign-v8/claim.json";
import v8Contract from "../../../docs/universality/campaign-v8/source-census-contract.json";
import v8Forcing from "../../../docs/universality/campaign-v8/forcing-supplement.json";
import {
  freezeCampaignRegistrationManifest,
  freezePredecessorCensusInvalidation,
  verifyCampaignRegistrationBundle,
} from "./organization-campaign-registration";
import {
  freezeCampaignSupersession,
  freezeUniversalityClaim,
  type FrozenUniversalityClaim,
} from "./organization-universality-claim";
import {
  freezeSourceCensusOccurrenceContract,
  sourceCensusOccurrenceConstants,
  type SourceCensusOccurrenceContract,
} from "./organization-universality-occurrence-contract";
import { freezeForcingWindowSupplement } from "./organization-universality-window-contract";

const digest = `sha256:${"a".repeat(64)}` as const,
  invalidation = () => ({
    schema: "open-autonomy.github-census-invalidation.v2" as const,
    campaignId: "v8",
    registrationCommit: "b".repeat(40),
    captureImplementationCommit: "c".repeat(40),
    sourceCensusContractDigest: digest,
    terminalRule: {
      maximumTotalAttempts: 4 as const,
      requiredCompletePasses: 2 as const,
      outcome: "four-total-attempts-with-fewer-than-two-complete-passes" as const,
      allowedFailures: [
        "cross-range-membership-drift",
        "transport-failure",
      ] as ["cross-range-membership-drift", "transport-failure"],
    },
    gitProvenanceBoundary:
      "git-object-and-byte-equality-verified-locally-at-registration-portable-bundle-verifies-retained-bytes-and-provenance-fields-only" as const,
    reason: "four-total-attempts-with-fewer-than-two-complete-passes",
    detail: "retained evidence",
    attempts: Array.from({ length: 4 }, (_, index) => ({
      attempt: index + 1,
      startedAt: `2026-07-17T0${index + 1}:00:00.000Z`,
      status: "failed" as const,
      failure: "transport-failure",
    })),
    evidence: [{ path: "attempt-01/00001.json.gz", digest, bytes: 2 }],
  });

test("freezes exact predecessor invalidation and rejects attempt laundering", () => {
  expect(freezePredecessorCensusInvalidation(invalidation()).digest).toMatch(
    /^sha256:/,
  );
  for (const mutate of [
    (x: any) => (x.attempts[0].attempt = 2),
    (x: any) => (x.attempts[0].status = "complete"),
    (x: any) => (x.attempts[0].extra = true),
    (x: any) => (x.evidence[0].path = "../escape"),
  ]) {
    const value: any = invalidation();
    mutate(value);
    expect(() => freezePredecessorCensusInvalidation(value)).toThrow();
  }
});

test("freezes registration manifest with sorted exact byte custody", () => {
  const value = {
    schema: "open-autonomy.campaign-registration-manifest.v1" as const,
    campaignId: "v9",
    predecessorCampaignId: "v8",
    predecessorClaimDigest: digest,
    predecessorInvalidationDigest: digest,
    claimDigest: digest,
    censusContractDigest: digest,
    forcingSupplementDigest: digest,
    supersessionDigest: digest,
    files: [{ path: "claim.json", digest, bytes: 2 }],
  };
  expect(freezeCampaignRegistrationManifest(value).digest).toMatch(/^sha256:/);
  expect(() =>
    freezeCampaignRegistrationManifest({
      ...value,
      files: [
        { path: "z.json", digest, bytes: 1 },
        { path: "a.json", digest, bytes: 1 },
      ],
    }),
  ).toThrow();
});

const bytes = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n"),
  file = (path: string, value: Uint8Array) => ({
    path,
    bytes: value.length,
    digest: `sha256:${createHash("sha256").update(value).digest("hex")}` as const,
  });

const bundleFixture = () => {
  const predecessor = v8Claim as unknown as FrozenUniversalityClaim,
    attempts = Array.from({ length: 4 }, (_, index) => ({
      attempt: index + 1,
      startedAt: `2026-07-17T0${index + 1}:00:00.000Z`,
      status: "failed" as const,
      failure: "transport-failure",
    })),
    registrationCommit = "b".repeat(40),
    captureImplementationCommit = "c".repeat(40),
    state = {
      schema: "open-autonomy.github-census-index-observation-state.v4",
      campaignId: predecessor.campaignId,
      registrationCommit,
      captureImplementationCommit,
      sourceCensusContractDigest: predecessor.sourceCensusContractDigest,
      identityOwners: {},
      identityNodes: {},
      attempts,
    },
    rawInvalidation = {
      schema: "open-autonomy.github-census-invalidation.v1",
      campaignId: predecessor.campaignId,
      registrationCommit,
      captureImplementationCommit,
      sourceCensusContractDigest: predecessor.sourceCensusContractDigest,
      reason: "four-total-attempts-with-fewer-than-two-complete-passes",
      attempts,
    },
    predecessorCustody = {
      "capture-state.json": bytes(state),
      "invalidation.json": bytes(rawInvalidation),
    },
    predecessorInvalidation = freezePredecessorCensusInvalidation({
      schema: "open-autonomy.github-census-invalidation.v2",
      campaignId: predecessor.campaignId,
      registrationCommit,
      captureImplementationCommit,
      sourceCensusContractDigest: predecessor.sourceCensusContractDigest,
      terminalRule: {
        maximumTotalAttempts: 4,
        requiredCompletePasses: 2,
        outcome: "four-total-attempts-with-fewer-than-two-complete-passes",
        allowedFailures: [
          "cross-range-membership-drift",
          "transport-failure",
        ],
      },
      gitProvenanceBoundary:
        "git-object-and-byte-equality-verified-locally-at-registration-portable-bundle-verifies-retained-bytes-and-provenance-fields-only",
      reason: rawInvalidation.reason,
      detail: "synthetic custody",
      attempts,
      evidence: Object.entries(predecessorCustody)
        .map(([path, value]) => file(path, value))
        .sort((a, b) => a.path.localeCompare(b.path)),
    }),
    { digest: _, ...baseContract } = v8Contract,
    contract = freezeSourceCensusOccurrenceContract({
      ...baseContract,
      schema: "open-autonomy.source-census-occurrence-contract.v5",
      id: "fixture-v9",
      campaignId: "fixture-v9",
      completion: {
        pass: structuredClone(sourceCensusOccurrenceConstants.pass),
        leaf: structuredClone(sourceCensusOccurrenceConstants.leaf),
        aggregation: structuredClone(sourceCensusOccurrenceConstants.aggregation),
      },
      invalidation: structuredClone(sourceCensusOccurrenceConstants.invalidation),
    } as unknown as SourceCensusOccurrenceContract),
    forcing = freezeForcingWindowSupplement({
      ...(({ digest: __, ...body }) => body)(v8Forcing),
      id: "fixture-v9",
      campaignId: "fixture-v9",
    } as any),
    { digest: ___, ...claimBody } = predecessor,
    claim = freezeUniversalityClaim({
      ...claimBody,
      campaignId: "fixture-v9",
      registeredAt: "2026-07-18T00:00:00.000Z",
      sourceCensusContractDigest: contract.digest,
      forcingSupplementDigest: forcing.digest,
    }),
    supersession = freezeCampaignSupersession(
      {
        schema: "open-autonomy.campaign-supersession.v1",
        predecessorCampaign: predecessor.campaignId,
        predecessorDigest: predecessor.digest,
        successorCampaign: claim.campaignId,
        successorDigest: claim.digest,
        reason: "fixture",
        predecessorStatus: "invalidated-before-u1-closure",
      },
      predecessor,
      claim,
    ),
    bundle = {
      "claim.json": bytes(claim),
      "forcing-supplement.json": bytes(forcing),
      "predecessor-invalidation.json": bytes(predecessorInvalidation),
      "source-census-contract.json": bytes(contract),
      "supersession.json": bytes(supersession),
    },
    manifest = freezeCampaignRegistrationManifest({
      schema: "open-autonomy.campaign-registration-manifest.v1",
      campaignId: claim.campaignId,
      predecessorCampaignId: predecessor.campaignId,
      predecessorClaimDigest: predecessor.digest,
      predecessorInvalidationDigest: predecessorInvalidation.digest,
      claimDigest: claim.digest,
      censusContractDigest: contract.digest,
      forcingSupplementDigest: forcing.digest,
      supersessionDigest: supersession.digest,
      files: Object.entries(bundle)
        .map(([path, value]) => file(path, value))
        .sort((a, b) => a.path.localeCompare(b.path)),
    });
  return { manifest, bundle, predecessor, predecessorCustody };
};

test("replays the exact registration bundle and predecessor custody", () => {
  const fixture = bundleFixture();
  expect(
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      fixture.bundle,
      fixture.predecessor,
      fixture.predecessorCustody,
    ).claim.campaignId,
  ).toBe("fixture-v9");
  const missing = { ...fixture.bundle } as any;
  delete missing["claim.json"];
  expect(() =>
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      missing,
      fixture.predecessor,
      fixture.predecessorCustody,
    ),
  ).toThrow();
  const corrupt = { ...fixture.bundle, "claim.json": fixture.bundle["claim.json"].slice() };
  corrupt["claim.json"][0] ^= 1;
  expect(() =>
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      corrupt,
      fixture.predecessor,
      fixture.predecessorCustody,
    ),
  ).toThrow();
  const custody = {
    ...fixture.predecessorCustody,
    "capture-state.json": fixture.predecessorCustody["capture-state.json"].slice(),
  };
  custody["capture-state.json"][0] ^= 1;
  expect(() =>
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      fixture.bundle,
      fixture.predecessor,
      custody,
    ),
  ).toThrow();
  const wrongManifest = freezeCampaignRegistrationManifest({
    ...(({ digest: _, ...body }) => body)(fixture.manifest),
    forcingSupplementDigest: digest,
  });
  expect(() =>
    verifyCampaignRegistrationBundle(
      wrongManifest,
      fixture.bundle,
      fixture.predecessor,
      fixture.predecessorCustody,
    ),
  ).toThrow();
  const wrongPredecessor = JSON.parse(
    new TextDecoder().decode(fixture.bundle["claim.json"]),
  );
  expect(() =>
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      fixture.bundle,
      wrongPredecessor,
      fixture.predecessorCustody,
    ),
  ).toThrow();
  const omittedCustody = { ...fixture.predecessorCustody } as any;
  delete omittedCustody["invalidation.json"];
  expect(() =>
    verifyCampaignRegistrationBundle(
      fixture.manifest,
      fixture.bundle,
      fixture.predecessor,
      omittedCustody,
    ),
  ).toThrow();
});
