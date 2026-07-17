import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  freezeSourceCensusContract,
  type SourceCensusContract,
} from "./organization-universality-census-contract";

type Base = Omit<
  SourceCensusContract,
  "schema" | "id" | "campaignId" | "completion" | "classification" | "invalidation" | "censusCutoff"
>;
type Pass = Omit<SourceCensusContract["completion"]["pass"], "maximumTotalAttempts"> & {
  maximumTotalAttempts: 4;
};
type Classification = Omit<SourceCensusContract["classification"], "samplingFrame"> & {
  samplingFrame: "union-of-unique-node-ids-across-first-two-complete-passes";
};

const aggregation = {
  requiredCompletePasses: 2,
  observationScope: "finite-union-of-results-observed-in-first-two-complete-provider-query-passes",
  eligibility: "stargazers-count-at-least-1000-in-either-complete-pass",
  samplingFrame: "union-of-unique-node-ids-across-first-two-complete-passes",
  frameFreezeTime: "completion-of-second-complete-pass",
  unobservedNodes: "not-observed-eligible-in-either-pass-outside-frame-and-not-claimed",
  merge: "retain-both-pass-observations-ordered-by-pass-then-observed-at",
  canonicalAdoptionValue: "maximum-stargazers-count-across-retained-pass-observations",
  crossPassEquality: "not-required-star-and-leaf-churn-are-observations-not-membership-failures",
} as const;
const windowInvalidation = [
  "unpartitionable-overflow-leaf",
  "four-total-attempts-with-fewer-than-two-complete-passes",
  "second-complete-pass-after-cutoff",
  "accepted-response-at-or-after-cutoff",
  "raw-body-digest-mismatch",
  "node-id-alias",
] as const;
const v1Convergence = {
  consecutivePasses: 2,
  tupleFields: ["node_id", "full_name", "stargazers_count", "fork", "archived"],
  tupleEncoding: "canonical-json-of-lexicographically-node-id-sorted-tuples",
  leafCountEncoding: "canonical-json-map-from-canonical-range-to-count",
  requireIdenticalLeafCounts: true,
  unstableLeaf: "retryable-leaf-total-count-drift",
} as const;
const v1Invalidation = [
  "unpartitionable-overflow-leaf",
  "three-total-pass-attempts-exhausted",
  "no-two-pass-convergence-before-cutoff",
  "accepted-response-at-or-after-cutoff",
  "raw-body-digest-mismatch",
  "node-id-alias",
] as const;

export type SourceCensusWindowContract = Base & {
  schema: "open-autonomy.source-census-window-contract.v2";
  id: string;
  campaignId: string;
  completion: {
    pass: Pass;
    leaf: SourceCensusContract["completion"]["leaf"];
    aggregation: typeof aggregation;
  };
  classification: Classification;
  invalidation: typeof windowInvalidation;
  censusCutoff: string;
};
export type FrozenSourceCensusWindowContract = SourceCensusWindowContract & { digest: `sha256:${string}` };

export type ForcingWindowSupplement = {
  schema: "open-autonomy.forcing-window-supplement.v2";
  id: string;
  campaignId: string;
  populationWeight: 0;
  domainEligibility: "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census";
  outOfDomain: "invalidate-campaign";
  overlap: "any-final-in-domain-node-in-two-pass-sampling-frame-counts-once-as-adoption-weight-1-otherwise-counts-once-as-forcing-weight-0";
  members: Array<{ repository: string; structuralStratum: string; rationale: string }>;
};
export type FrozenForcingWindowSupplement = ForcingWindowSupplement & { digest: `sha256:${string}` };

const exactKeys = (value: object, keys: string[]) =>
  canonicalSemanticJson(Object.keys(value).sort()) === canonicalSemanticJson([...keys].sort());

export function freezeSourceCensusWindowContract(value: SourceCensusWindowContract): FrozenSourceCensusWindowContract {
  if (
    value.schema !== "open-autonomy.source-census-window-contract.v2" ||
    !value.id ||
    !value.campaignId ||
    !Number.isFinite(Date.parse(value.censusCutoff)) ||
    !exactKeys(value, ["schema", "id", "campaignId", "domainPredicate", "adoption", "enumeration", "completion", "classification", "evidence", "invalidation", "censusCutoff"]) ||
    !exactKeys(value.completion, ["pass", "leaf", "aggregation"]) ||
    canonicalSemanticJson(value.completion.aggregation) !== canonicalSemanticJson(aggregation) ||
    value.completion.pass.maximumTotalAttempts !== 4 ||
    value.classification.samplingFrame !== aggregation.samplingFrame ||
    canonicalSemanticJson(value.invalidation) !== canonicalSemanticJson(windowInvalidation)
  ) throw Error("source census window contract invalid");

  const projected = {
    ...structuredClone(value),
    schema: "open-autonomy.source-census-contract.v1",
    completion: {
      pass: { ...value.completion.pass, maximumTotalAttempts: 3 },
      leaf: value.completion.leaf,
      convergence: v1Convergence,
      populationInstant: "completed-at-of-second-converged-pass",
    },
    classification: {
      ...value.classification,
      samplingFrame: "unique-node-ids-in-second-converged-pass",
    },
    invalidation: v1Invalidation,
  } as unknown as SourceCensusContract;
  freezeSourceCensusContract(projected);
  const body = structuredClone(value);
  const digest = `sha256:${createHash("sha256").update(`${value.schema}\0${canonicalSemanticJson(body)}`).digest("hex")}` as const;
  return { ...body, digest };
}

export function verifySourceCensusWindowContract(value: FrozenSourceCensusWindowContract) {
  const { digest, ...body } = value;
  const frozen = freezeSourceCensusWindowContract(body);
  if (digest !== frozen.digest) throw Error("source census window digest mismatch");
  return frozen;
}

export function freezeForcingWindowSupplement(value: ForcingWindowSupplement): FrozenForcingWindowSupplement {
  if (
    value.schema !== "open-autonomy.forcing-window-supplement.v2" ||
    !value.id ||
    !value.campaignId ||
    value.populationWeight !== 0 ||
    value.domainEligibility !== "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census" ||
    value.outOfDomain !== "invalidate-campaign" ||
    value.overlap !== "any-final-in-domain-node-in-two-pass-sampling-frame-counts-once-as-adoption-weight-1-otherwise-counts-once-as-forcing-weight-0" ||
    !exactKeys(value, ["schema", "id", "campaignId", "populationWeight", "domainEligibility", "outOfDomain", "overlap", "members"]) ||
    !value.members.length ||
    new Set(value.members.map((x) => x.repository.toLowerCase())).size !== value.members.length ||
    value.members.some((x) =>
      !exactKeys(x, ["repository", "structuralStratum", "rationale"]) ||
      !/^[-\w.]+\/[-\w.]+$/.test(x.repository) || !x.structuralStratum || !x.rationale
    )
  ) throw Error("forcing window supplement invalid");
  const body = structuredClone(value);
  const digest = `sha256:${createHash("sha256").update(`${value.schema}\0${canonicalSemanticJson(body)}`).digest("hex")}` as const;
  return { ...body, digest };
}

export function verifyForcingWindowSupplement(value: FrozenForcingWindowSupplement) {
  const { digest, ...body } = value;
  const frozen = freezeForcingWindowSupplement(body);
  if (digest !== frozen.digest) throw Error("forcing window digest mismatch");
  return frozen;
}
