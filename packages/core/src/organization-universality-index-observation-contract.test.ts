import { expect, test } from "bun:test";
import v7 from "../../../docs/universality/campaign-v7/source-census-contract.json";
import v8 from "../../../docs/universality/campaign-v8/source-census-contract.json";
import {
  freezeSourceCensusIndexObservationContract,
  type SourceCensusIndexObservationContract,
} from "./organization-universality-index-observation-contract";
const value = (): SourceCensusIndexObservationContract => {
  const { digest, ...base } = v7;
  return {
    ...base,
    schema: "open-autonomy.source-census-index-observation-contract.v4",
    id: "test",
    campaignId: "test",
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
  } as unknown as SourceCensusIndexObservationContract;
};
test("provider query membership and mutable returned stars are explicitly separated", () =>
  expect(
    freezeSourceCensusIndexObservationContract(value()).completion.leaf
      .mutableQualifierSemantics,
  ).toContain("metadata"));
test("generated v8 contract verifies", () =>
  expect(
    String(
      freezeSourceCensusIndexObservationContract(
        (({ digest, ...body }: any) => body)(v8),
      ).digest,
    ),
  ).toBe(v8.digest));
test("index observation semantics reject silent weakening", () => {
  for (const mutate of [
    (x: any) => (x.completion.leaf.containment = "none"),
    (x: any) => (x.completion.leaf.mutableQualifierSemantics = "atomic"),
    (x: any) => x.completion.leaf.observationEncoding.fields.splice(4, 1),
    (x: any) => x.completion.leaf.observationEncoding.returnedFields.pop(),
    (x: any) =>
      (x.enumeration.starPartition.upperBoundSource =
        "root-page-1-maximum-stargazers-count"),
    (x: any) => delete x.completion.pass.tailProbe,
    (x: any) => delete x.completion.pass.tailProbeTermination,
    (x: any) => x.completion.pass.retryableFailures.pop(),
    (x: any) => (x.completion.aggregation.samplingFrame = "intersection"),
    (x: any) => (x.classification.samplingFrame = "second"),
  ]) {
    const x: any = value();
    mutate(x);
    expect(() => freezeSourceCensusIndexObservationContract(x)).toThrow();
  }
});
