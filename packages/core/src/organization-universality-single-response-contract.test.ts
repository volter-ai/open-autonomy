import { expect, test } from "bun:test";
import {
  freezeSourceCensusSingleResponseContract,
  type SourceCensusSingleResponseContract,
} from "./organization-universality-single-response-contract";
import v6 from "../../../docs/universality/campaign-v6/source-census-contract.json";
import v7 from "../../../docs/universality/campaign-v7/source-census-contract.json";

const registration = (): SourceCensusSingleResponseContract => {
  const { digest: _, ...base } = v6;
  return {
    ...base,
    schema: "open-autonomy.source-census-single-response-contract.v3",
    id: "test",
    campaignId: "test",
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
      aggregation: base.completion.aggregation,
    },
    evidence: {
      ...base.evidence,
      acceptedResponse: {
        ...base.evidence.acceptedResponse,
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
    invalidation: base.invalidation,
  } as unknown as SourceCensusSingleResponseContract;
};
test("single-response leaves freeze without cross-request drift", () =>
  expect(
    freezeSourceCensusSingleResponseContract(registration()).completion.leaf
      .pagination,
  ).toBe("forbidden"));
test("committed v7 contract verifies", () =>
  expect(
    String(
      freezeSourceCensusSingleResponseContract(
        (({ digest, ...body }: any) => body)(v7),
      ).digest,
    ),
  ).toBe(v7.digest));
test("single-response contract rejects every observed regression class", () => {
  for (const mutate of [
    (x: any) => (x.completion.leaf.pagination = "allowed"),
    (x: any) => (x.completion.leaf.surplus = true),
    (x: any) => (x.completion.leaf.completeness = "best-effort"),
    (x: any) => (x.completion.leaf.globalMembership = "duplicates-allowed"),
    (x: any) => (x.completion.leaf.containment = "unchecked"),
    (x: any) => (x.completion.pass.rootRequest = "per-page-1"),
    (x: any) => (x.completion.pass.rangeRequest = "paginate"),
    (x: any) => x.completion.pass.retryableFailures.pop(),
    (x: any) => (x.completion.pass.retryTransition = "continue"),
    (x: any) => (x.completion.aggregation.samplingFrame = "intersection"),
    (x: any) => (x.classification.samplingFrame = "second-pass"),
    (x: any) => x.evidence.acceptedResponse.requiredItemFields.pop(),
    (x: any) => (x.evidence.acceptedResponse.createdAt = "unchecked"),
    (x: any) => x.invalidation.pop(),
    (x: any) => (x.enumeration.rootQuery = "agent stars:>=1000"),
  ]) {
    const x: any = registration();
    mutate(x);
    expect(() => freezeSourceCensusSingleResponseContract(x)).toThrow();
  }
});
