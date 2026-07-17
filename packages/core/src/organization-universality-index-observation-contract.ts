import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  freezeSourceCensusSingleResponseContract,
  type SourceCensusSingleResponseContract,
} from "./organization-universality-single-response-contract";
type Base = Omit<
  SourceCensusSingleResponseContract,
  | "schema"
  | "id"
  | "campaignId"
  | "enumeration"
  | "completion"
  | "invalidation"
  | "censusCutoff"
>;
type Enumeration = Omit<
  SourceCensusSingleResponseContract["enumeration"],
  "starPartition"
> & {
  starPartition: Omit<
    SourceCensusSingleResponseContract["enumeration"]["starPartition"],
    "upperBoundSource"
  > & { upperBoundSource: "first-empty-tail-probe-threshold-minus-one" };
};
const pass = {
  rootRequest: "replaced-by-query-only-tail-probe",
  tailProbe:
    "accepted-per-page-100-page-1-stars-gte-thresholds-2000-times-powers-of-two-until-first-zero-total-count",
  tailProbeTermination:
    "total-count-zero-and-items-length-zero-otherwise-malformed-response-schema",
  rangeRequest:
    "exactly-one-accepted-per-page-100-page-1-response-per-visited-range",
  maximumTotalAttempts: 4,
  retryableFailures: [
    "transport-failure",
    "non-rate-limit-non-200",
    "malformed-response-schema",
    "incomplete-results-true",
    "cross-range-membership-drift",
    "terminal-item-ineligible-or-created-outside-query",
  ],
  retryTransition: "retain-failed-evidence-discard-pass-and-restart-from-root",
  rateLimitTransition:
    "on-403-with-valid-x-ratelimit-reset-retry-same-request-until-cutoff-without-consuming-pass-attempt",
  immediateInvalidations: [
    "unpartitionable-overflow-leaf",
    "accepted-response-at-or-after-cutoff",
    "raw-body-digest-mismatch",
    "node-id-alias",
  ],
} as const;
const leaf = {
  maximumResults: 100,
  acceptedResponse: "same-per-page-100-response-used-for-count-and-members",
  incompleteResults: "must-be-false",
  completeness: "total-count-at-most-100-and-items-length-equals-total-count",
  globalMembership:
    "distinct-node-id-count-across-all-terminal-responses-equals-sum-of-terminal-total-counts",
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
  pagination: "forbidden",
} as const;
const invalidation = [
  "unpartitionable-overflow-leaf",
  "four-total-attempts-with-fewer-than-two-complete-passes",
  "second-complete-pass-after-cutoff",
  "accepted-response-at-or-after-cutoff",
  "raw-body-digest-mismatch",
  "node-id-alias",
] as const;
export type SourceCensusIndexObservationContract = Base & {
  schema: "open-autonomy.source-census-index-observation-contract.v4";
  id: string;
  campaignId: string;
  enumeration: Enumeration;
  completion: {
    pass: typeof pass;
    leaf: typeof leaf;
    aggregation: SourceCensusSingleResponseContract["completion"]["aggregation"];
  };
  invalidation: typeof invalidation;
  censusCutoff: string;
};
export type FrozenSourceCensusIndexObservationContract =
  SourceCensusIndexObservationContract & { digest: `sha256:${string}` };
const eq = (a: unknown, b: unknown) =>
    canonicalSemanticJson(a) === canonicalSemanticJson(b),
  exact = (v: object, k: string[]) => eq(Object.keys(v).sort(), k.sort());
export function freezeSourceCensusIndexObservationContract(
  value: SourceCensusIndexObservationContract,
): FrozenSourceCensusIndexObservationContract {
  if (
    value.schema !==
      "open-autonomy.source-census-index-observation-contract.v4" ||
    !value.id ||
    !value.campaignId ||
    !Number.isFinite(Date.parse(value.censusCutoff)) ||
    !exact(value, [
      "schema",
      "id",
      "campaignId",
      "domainPredicate",
      "adoption",
      "enumeration",
      "completion",
      "classification",
      "evidence",
      "invalidation",
      "censusCutoff",
    ]) ||
    !exact(value.completion, ["pass", "leaf", "aggregation"]) ||
    value.enumeration.starPartition.upperBoundSource !==
      "first-empty-tail-probe-threshold-minus-one" ||
    !eq(value.completion.pass, pass) ||
    !eq(value.completion.leaf, leaf) ||
    !eq(value.invalidation, invalidation)
  )
    throw Error("index-observation census contract invalid");
  const projected = {
    ...structuredClone(value),
    schema: "open-autonomy.source-census-single-response-contract.v3",
    enumeration: {
      ...structuredClone(value.enumeration),
      starPartition: {
        ...structuredClone(value.enumeration.starPartition),
        upperBoundSource: "root-page-1-maximum-stargazers-count",
      },
    },
    completion: {
      ...structuredClone(value.completion),
      pass: {
        ...structuredClone(value.completion.pass),
        rootRequest: "per-page-100-page-1-before-partitioning",
        retryableFailures: [
          "transport-failure",
          "non-rate-limit-non-200",
          "malformed-response-schema",
          "incomplete-results-true",
          "cross-range-membership-drift",
          "range-item-outside-query",
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
    },
    invalidation,
  } as unknown as SourceCensusSingleResponseContract;
  delete (projected.completion.pass as any).tailProbe;
  delete (projected.completion.pass as any).tailProbeTermination;
  freezeSourceCensusSingleResponseContract(projected);
  const body = structuredClone(value),
    digest = `sha256:${createHash("sha256")
      .update(`${value.schema}\0${canonicalSemanticJson(body)}`)
      .digest("hex")}` as const;
  return { ...body, digest };
}
export function verifySourceCensusIndexObservationContract(
  value: FrozenSourceCensusIndexObservationContract,
) {
  const { digest, ...body } = value,
    frozen = freezeSourceCensusIndexObservationContract(body);
  if (digest !== frozen.digest)
    throw Error("index-observation census contract digest mismatch");
  return frozen;
}
export const sourceCensusIndexObservationConstants = {
  pass,
  leaf,
  invalidation,
} as const;
