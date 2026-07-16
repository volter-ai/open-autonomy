import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export const UNIVERSALITY_FLOORS = {
  diagnosticAccounting: 1,
  canonicalFactWeighted: 0.9,
  canonicalFactPerSystem: 0.7,
  mandatoryObservationWeighted: 0.95,
  mandatoryObservationPerSystem: 0.8,
  twoFamilyPortability: 0.9,
  certifiedCompatibleCompilation: 0.95,
  nativeExecutedPreservation: 0.95,
  compatibleCellExecutionSampling: 0.3,
  maxHoldoutDegradation: 0.1,
  maxSilentLoss: 0,
  maxResultDependentExclusion: 0,
  maxCriticalInventoryConflict: 0,
} as const;

export type UniversalityMetric = keyof typeof UNIVERSALITY_FLOORS;
export type MetricDirection = "at-least" | "at-most" | "exactly";
export type UniversalityMetricContract = {
  metric: UniversalityMetric;
  direction: MetricDirection;
  threshold: number;
  numerator: string;
  denominator: string;
  weight: string;
  population: "source-systems" | "substrate-compositions" | "compilation-cells" | "executed-cells";
  assurance: "static" | "conformance" | "native-executed" | "independently-reproduced";
};
export type UniversalityClaimRegistration = {
  schema: "open-autonomy.universality-claim.v2";
  campaignId: string;
  registeredAt: string;
  domain: "autonomous-software-organizations";
  sourceSelectionRule: string;
  sourceCensusContractDigest: `sha256:${string}`;
  forcingSupplementDigest: `sha256:${string}`;
  compositionSelectionRule: string;
  sourcePopulationId: string;
  compositionPopulationId: string;
  censusAt: string;
  executionSamplingRule: string;
  executionSamplingSeed: string;
  undefinedDenominatorPolicy: "invalidate-campaign";
  assurancePolicyId: string;
  metrics: UniversalityMetricContract[];
};
export type FrozenUniversalityClaim = UniversalityClaimRegistration & { digest: `sha256:${string}` };
export type CampaignSupersession = {
  schema: "open-autonomy.campaign-supersession.v1";
  predecessorCampaign: string;
  predecessorDigest: `sha256:${string}`;
  successorCampaign: string;
  successorDigest: `sha256:${string}`;
  reason: string;
  predecessorStatus: "invalidated-before-u1-closure";
};
export type FrozenCampaignSupersession = CampaignSupersession & { digest: `sha256:${string}` };

const directions: Record<UniversalityMetric, MetricDirection> = {
  diagnosticAccounting: "exactly", canonicalFactWeighted: "at-least", canonicalFactPerSystem: "at-least",
  mandatoryObservationWeighted: "at-least", mandatoryObservationPerSystem: "at-least", twoFamilyPortability: "at-least",
  certifiedCompatibleCompilation: "at-least", nativeExecutedPreservation: "at-least",
  compatibleCellExecutionSampling: "at-least", maxHoldoutDegradation: "at-most", maxSilentLoss: "exactly",
  maxResultDependentExclusion: "exactly", maxCriticalInventoryConflict: "exactly",
};

export const UNIVERSALITY_METRIC_CONTRACTS: Readonly<Record<UniversalityMetric, Omit<UniversalityMetricContract, "metric" | "threshold">>> = {
  diagnosticAccounting: { direction:"exactly", numerator:"number of preregistered compilation cells with exactly one terminal result", denominator:"number of preregistered compilation cells", weight:"one per cell", population:"compilation-cells", assurance:"static" },
  canonicalFactWeighted: { direction:"at-least", numerator:"sum of preregistered source-fact weights for preserved, derived, or lowered canonical dispositions", denominator:"sum of preregistered source-fact weights", weight:"frozen source-inventory fact weight", population:"source-systems", assurance:"conformance" },
  canonicalFactPerSystem: { direction:"at-least", numerator:"within-system sum of source-fact weights for preserved, derived, or lowered canonical dispositions", denominator:"within-system sum of preregistered source-fact weights", weight:"frozen source-inventory fact weight; minimum over systems", population:"source-systems", assurance:"conformance" },
  mandatoryObservationWeighted: { direction:"at-least", numerator:"sum of preregistered mandatory-observation weights preserved by source encodings", denominator:"sum of preregistered mandatory-observation weights", weight:"frozen source-inventory observation weight", population:"source-systems", assurance:"conformance" },
  mandatoryObservationPerSystem: { direction:"at-least", numerator:"within-system sum of preserved mandatory-observation weights", denominator:"within-system sum of preregistered mandatory-observation weights", weight:"frozen source-inventory observation weight; minimum over systems", population:"source-systems", assurance:"conformance" },
  twoFamilyPortability: { direction:"at-least", numerator:"source systems with certified compilation to at least two independently implemented compatible backend families", denominator:"preregistered source systems having at least two independently adjudicated compatible backend families", weight:"frozen source-system population weight", population:"source-systems", assurance:"conformance" },
  certifiedCompatibleCompilation: { direction:"at-least", numerator:"independently adjudicated compatible cells producing a preservation certificate or profile-permitted typed-loss certificate", denominator:"all independently adjudicated compatible cells", weight:"frozen compilation-cell weight", population:"compilation-cells", assurance:"conformance" },
  nativeExecutedPreservation: { direction:"at-least", numerator:"executed cells whose lifted native observations satisfy the frozen equivalence relation with no unexplained violation", denominator:"all executed compatible cells", weight:"frozen executed-cell weight", population:"executed-cells", assurance:"native-executed" },
  compatibleCellExecutionSampling: { direction:"at-least", numerator:"independently adjudicated compatible cells selected and completed for native execution", denominator:"all independently adjudicated compatible cells", weight:"one per compatible cell, subject to every source/backend stratum being sampled", population:"compilation-cells", assurance:"native-executed" },
  maxHoldoutDegradation: { direction:"at-most", numerator:"development-corpus headline score minus frozen-core holdout headline score", denominator:"one percentage-point scale for the same frozen headline metric", weight:"maximum degradation over headline metrics", population:"source-systems", assurance:"conformance" },
  maxSilentLoss: { direction:"exactly", numerator:"facts or mandatory observations absent from output without a typed disposition", denominator:"all facts and mandatory observations presented to a frontend or compiler", weight:"one per silent loss", population:"compilation-cells", assurance:"conformance" },
  maxResultDependentExclusion: { direction:"exactly", numerator:"population members or cells excluded after any result-dependent inspection", denominator:"all frozen population members and cells", weight:"one per exclusion", population:"compilation-cells", assurance:"independently-reproduced" },
  maxCriticalInventoryConflict: { direction:"exactly", numerator:"critical source-inventory conflicts unresolved at publication", denominator:"all critical source-inventory conflicts", weight:"one per unresolved critical conflict", population:"source-systems", assurance:"independently-reproduced" },
};

export function freezeUniversalityClaim(value: UniversalityClaimRegistration): FrozenUniversalityClaim {
  const exactKeys = (actual: object, expected: readonly string[], label: string) => {
    const keys = Object.keys(actual).sort(), wanted = [...expected].sort();
    if (JSON.stringify(keys) !== JSON.stringify(wanted)) throw Error(`${label} schema must be exact`);
  };
  exactKeys(value, ["schema","campaignId","registeredAt","domain","sourceSelectionRule","sourceCensusContractDigest","forcingSupplementDigest","compositionSelectionRule",
    "sourcePopulationId","compositionPopulationId","censusAt","executionSamplingRule","executionSamplingSeed",
    "undefinedDenominatorPolicy","assurancePolicyId","metrics"], "universality claim");
  if (value.schema !== "open-autonomy.universality-claim.v2" || !value.campaignId ||
      !Number.isFinite(Date.parse(value.registeredAt)) || value.domain !== "autonomous-software-organizations" ||
      !value.sourceSelectionRule || !/^sha256:[a-f0-9]{64}$/.test(value.sourceCensusContractDigest) || !/^sha256:[a-f0-9]{64}$/.test(value.forcingSupplementDigest) || !value.compositionSelectionRule || !value.sourcePopulationId ||
      !value.compositionPopulationId || !Number.isFinite(Date.parse(value.censusAt)) || Date.parse(value.registeredAt) >= Date.parse(value.censusAt) || !value.executionSamplingRule ||
      !value.executionSamplingSeed || value.undefinedDenominatorPolicy !== "invalidate-campaign" || !value.assurancePolicyId)
    throw Error("universality claim identity invalid");
  const expected = Object.keys(UNIVERSALITY_FLOORS) as UniversalityMetric[];
  if (value.metrics.length !== expected.length || new Set(value.metrics.map((metric) => metric.metric)).size !== expected.length)
    throw Error("universality claim metric domain must be total and unique");
  for (const name of expected) {
    const metric = value.metrics.find((candidate) => candidate.metric === name)!;
    exactKeys(metric, ["metric","direction","threshold","numerator","denominator","weight","population","assurance"], `universality metric ${name}`);
    const floor = UNIVERSALITY_FLOORS[name], direction = directions[name], contract = UNIVERSALITY_METRIC_CONTRACTS[name];
    if (metric.direction !== direction || !metric.numerator || !metric.denominator || !metric.weight ||
        !["source-systems", "substrate-compositions", "compilation-cells", "executed-cells"].includes(metric.population) ||
        !["static", "conformance", "native-executed", "independently-reproduced"].includes(metric.assurance))
      throw Error(`universality metric ${name} contract invalid`);
    for (const field of ["numerator", "denominator", "weight", "population", "assurance"] as const)
      if (metric[field] !== contract[field]) throw Error(`universality metric ${name} changes frozen ${field}`);
    if (metric.threshold < 0 || metric.threshold > 1 || (direction === "at-least" && metric.threshold < floor) || (direction === "at-most" && metric.threshold > floor) ||
        (direction === "exactly" && metric.threshold !== floor) || !Number.isFinite(metric.threshold))
      throw Error(`universality metric ${name} weakens normative floor`);
  }
  const body = structuredClone(value), digest = `sha256:${createHash("sha256").update(canonicalSemanticJson(body)).digest("hex")}` as const;
  return { ...body, digest };
}

export function verifyFrozenUniversalityClaim(value: FrozenUniversalityClaim) {
  const { digest, ...body } = value;
  const frozen = freezeUniversalityClaim(body);
  if (frozen.digest !== digest) throw Error("universality claim digest mismatch");
  return frozen;
}

/** Authenticate historical claim bytes even when a later verifier intentionally rejects an old campaign invariant. */
export function verifyHistoricalUniversalityClaimDigest(value: FrozenUniversalityClaim) {
  const {digest,...body}=value;
  const expected=`sha256:${createHash("sha256").update(canonicalSemanticJson(body)).digest("hex")}`;
  if (digest!==expected) throw Error("historical universality claim digest mismatch");
  return value;
}

export function freezeCampaignSupersession(value: CampaignSupersession, predecessor: FrozenUniversalityClaim, successor: FrozenUniversalityClaim): FrozenCampaignSupersession {
  verifyHistoricalUniversalityClaimDigest(predecessor);
  if(successor.schema==="open-autonomy.universality-claim.v2")verifyFrozenUniversalityClaim(successor);else verifyHistoricalUniversalityClaimDigest(successor);
  const keys=Object.keys(value).sort(), expected=["schema","predecessorCampaign","predecessorDigest","successorCampaign","successorDigest","reason","predecessorStatus"].sort();
  if (JSON.stringify(keys)!==JSON.stringify(expected) || value.schema!=="open-autonomy.campaign-supersession.v1" ||
      value.predecessorCampaign!==predecessor.campaignId || value.predecessorDigest!==predecessor.digest ||
      value.successorCampaign!==successor.campaignId || value.successorDigest!==successor.digest ||
      value.predecessorCampaign===value.successorCampaign || value.predecessorDigest===value.successorDigest || !value.reason.trim() ||
      value.predecessorStatus!=="invalidated-before-u1-closure" || Date.parse(successor.registeredAt)>=Date.parse(successor.censusAt))
    throw Error("campaign supersession join invalid");
  const body=structuredClone(value), digest=`sha256:${createHash("sha256").update(`open-autonomy.campaign-supersession.v1\0${canonicalSemanticJson(body)}`).digest("hex")}` as const;
  return {...body,digest};
}

export function verifyFrozenCampaignSupersession(value: FrozenCampaignSupersession, predecessor: FrozenUniversalityClaim, successor: FrozenUniversalityClaim) {
  const {digest,...body}=value, frozen=freezeCampaignSupersession(body,predecessor,successor);
  if (digest!==frozen.digest) throw Error("campaign supersession digest mismatch");
  return frozen;
}
