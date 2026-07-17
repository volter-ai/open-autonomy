import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  freezeSourceCensusWindowContract,
  type SourceCensusWindowContract,
} from "./organization-universality-window-contract";

type Base = Omit<
  SourceCensusWindowContract,
  | "schema"
  | "id"
  | "campaignId"
  | "completion"
  | "evidence"
  | "invalidation"
  | "censusCutoff"
>;
const pass = {
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
    "every-item-stars-in-closed-star-range-and-created-at-utc-day-in-creation-range-when-present",
  pagination: "forbidden",
} as const;
const evidence = {
  retain: [
    "exact-response-body-bytes",
    "response-headers",
    "request-url",
    "observed-at",
  ],
  bodyDigest: "sha256-exact-response-body-bytes",
  acceptedResponse: {
    httpStatus: 200,
    contentTypePrefix: "application/json",
    json: "object-with-nonnegative-integer-total_count-boolean-incomplete_results-and-items-array",
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
  primaryIdentity: "github-node-id",
  secondaryIdentity: "case-insensitive-full-name-must-not-alias",
} as const;
const invalidation = [
  "unpartitionable-overflow-leaf",
  "four-total-attempts-with-fewer-than-two-complete-passes",
  "second-complete-pass-after-cutoff",
  "accepted-response-at-or-after-cutoff",
  "raw-body-digest-mismatch",
  "node-id-alias",
] as const;
const aggregation = {
  requiredCompletePasses: 2,
  observationScope:
    "finite-union-of-results-observed-in-first-two-complete-provider-query-passes",
  eligibility: "stargazers-count-at-least-1000-in-either-complete-pass",
  samplingFrame: "union-of-unique-node-ids-across-first-two-complete-passes",
  frameFreezeTime: "completion-of-second-complete-pass",
  unobservedNodes:
    "not-observed-eligible-in-either-pass-outside-frame-and-not-claimed",
  merge: "retain-both-pass-observations-ordered-by-pass-then-observed-at",
  canonicalAdoptionValue:
    "maximum-stargazers-count-across-retained-pass-observations",
  crossPassEquality:
    "not-required-star-and-leaf-churn-are-observations-not-membership-failures",
} as const;

export type SourceCensusSingleResponseContract = Base & {
  schema: "open-autonomy.source-census-single-response-contract.v3";
  id: string;
  campaignId: string;
  completion: {
    pass: typeof pass;
    leaf: typeof leaf;
    aggregation: typeof aggregation;
  };
  evidence: typeof evidence;
  invalidation: typeof invalidation;
  censusCutoff: string;
};
export type FrozenSourceCensusSingleResponseContract =
  SourceCensusSingleResponseContract & { digest: `sha256:${string}` };

const exact = (value: object, keys: string[]) =>
  canonicalSemanticJson(Object.keys(value).sort()) ===
  canonicalSemanticJson([...keys].sort());
export function freezeSourceCensusSingleResponseContract(
  value: SourceCensusSingleResponseContract,
): FrozenSourceCensusSingleResponseContract {
  if (
    value.schema !==
      "open-autonomy.source-census-single-response-contract.v3" ||
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
    canonicalSemanticJson(value.completion.pass) !==
      canonicalSemanticJson(pass) ||
    canonicalSemanticJson(value.completion.leaf) !==
      canonicalSemanticJson(leaf) ||
    canonicalSemanticJson(value.completion.aggregation) !==
      canonicalSemanticJson(aggregation) ||
    canonicalSemanticJson(value.evidence) !== canonicalSemanticJson(evidence) ||
    canonicalSemanticJson(value.invalidation) !==
      canonicalSemanticJson(invalidation)
  )
    throw Error("single-response census contract invalid");
  const projected = {
    ...structuredClone(value),
    schema: "open-autonomy.source-census-window-contract.v2",
    completion: {
      pass: {
        rootRequest: "per-page-1-page-1-before-partitioning",
        leafCountRequest: "per-page-1-page-1",
        leafPageRequests: "pages-1-through-ceiling-total-over-100",
        maximumTotalAttempts: 4,
        retryableFailures: [
          "transport-failure",
          "non-rate-limit-non-200",
          "malformed-response-schema",
          "incomplete-results-true",
          "leaf-total-count-drift",
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
        maximumResults: 1000,
        incompleteResults: "must-be-false",
        totalCount: "equal-on-count-response-and-every-page",
        pageCoverage: "one-through-ceiling-total-count-over-page-size",
      },
      aggregation,
    },
    evidence: {
      ...structuredClone(value.evidence),
      acceptedResponse: {
        ...structuredClone(value.evidence.acceptedResponse),
        requiredItemFields: [
          "node_id",
          "full_name",
          "stargazers_count",
          "fork",
          "archived",
          "default_branch",
        ],
      },
    },
  } as unknown as SourceCensusWindowContract;
  delete (projected.evidence.acceptedResponse as any).createdAt;
  freezeSourceCensusWindowContract(projected);
  const body = structuredClone(value),
    digest = `sha256:${createHash("sha256")
      .update(`${value.schema}\0${canonicalSemanticJson(body)}`)
      .digest("hex")}` as const;
  return { ...body, digest };
}
export function verifySourceCensusSingleResponseContract(
  value: FrozenSourceCensusSingleResponseContract,
) {
  const { digest, ...body } = value,
    frozen = freezeSourceCensusSingleResponseContract(body);
  if (digest !== frozen.digest)
    throw Error("single-response census contract digest mismatch");
  return frozen;
}
