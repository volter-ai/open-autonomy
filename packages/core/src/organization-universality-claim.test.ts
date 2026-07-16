import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { freezeUniversalityClaim, UNIVERSALITY_FLOORS, UNIVERSALITY_METRIC_CONTRACTS, verifyFrozenUniversalityClaim, type FrozenUniversalityClaim, type UniversalityClaimRegistration, type UniversalityMetric } from "./organization-universality-claim";

const directions: Record<UniversalityMetric, "at-least" | "at-most" | "exactly"> = {
  diagnosticAccounting:"exactly",canonicalFactWeighted:"at-least",canonicalFactPerSystem:"at-least",
  mandatoryObservationWeighted:"at-least",mandatoryObservationPerSystem:"at-least",twoFamilyPortability:"at-least",
  certifiedCompatibleCompilation:"at-least",nativeExecutedPreservation:"at-least",compatibleCellExecutionSampling:"at-least",
  maxHoldoutDegradation:"at-most",maxSilentLoss:"exactly",maxResultDependentExclusion:"exactly",maxCriticalInventoryConflict:"exactly",
};
const registration = (): UniversalityClaimRegistration => ({ schema:"open-autonomy.universality-claim.v1", campaignId:"universal-2026-v1",
  registeredAt:"2026-07-16T00:00:00Z", domain:"autonomous-software-organizations", sourceSelectionRule:"frozen U1 census rule",
  compositionSelectionRule:"frozen U2 meaningful-composition rule", sourcePopulationId:"source-population-v1",
  compositionPopulationId:"composition-population-v1",censusAt:"2026-07-16T00:00:00Z",executionSamplingRule:"sha256 rank within every frozen source/backend stratum; take the lowest-ranked cells until at least 30% globally",executionSamplingSeed:"oa-universality-2026-v1",undefinedDenominatorPolicy:"invalidate-campaign",assurancePolicyId:"universality-assurance-v1", metrics:(Object.keys(UNIVERSALITY_FLOORS) as UniversalityMetric[]).map(metric=>({
    metric,threshold:UNIVERSALITY_FLOORS[metric],...UNIVERSALITY_METRIC_CONTRACTS[metric],
  })) });

test("U0 freezes a total content-addressed claim at or above every normative floor",()=>{
  const frozen=freezeUniversalityClaim(registration()); expect(verifyFrozenUniversalityClaim(frozen)).toEqual(frozen);
  expect(freezeUniversalityClaim(registration()).digest).toBe(frozen.digest);
});
test("U0 rejects omission, duplication, weakened floors, direction gaming, and digest mutation",()=>{
  const mutations=[
    (x:any)=>x.metrics.pop(), (x:any)=>x.metrics.push({...x.metrics[0]}),
    (x:any)=>x.metrics.find((m:any)=>m.metric==="canonicalFactWeighted").threshold=.89,
    (x:any)=>x.metrics.find((m:any)=>m.metric==="maxHoldoutDegradation").threshold=.11,
    (x:any)=>x.metrics.find((m:any)=>m.metric==="maxSilentLoss").threshold=1,
    (x:any)=>x.metrics.find((m:any)=>m.metric==="canonicalFactWeighted").direction="at-most",
  ];
  for(const mutate of mutations){const value:any=registration();mutate(value);expect(()=>freezeUniversalityClaim(value)).toThrow();}
  const frozen=freezeUniversalityClaim(registration());expect(()=>verifyFrozenUniversalityClaim({...frozen,campaignId:"substituted"})).toThrow("digest mismatch");
});
test("U0 rejects semantic denominator, weighting, population, and assurance substitution",()=>{
  for(const field of ["numerator","denominator","weight","population","assurance"] as const){
    const value:any=registration(); value.metrics[0][field]="attacker substitution"; expect(()=>freezeUniversalityClaim(value)).toThrow();
  }
});
test("U0 committed campaign artifact is an authentic frozen registration",()=>{
  const artifact=JSON.parse(readFileSync("docs/universality/campaign-v1/claim.json","utf8")) as FrozenUniversalityClaim;
  expect(verifyFrozenUniversalityClaim(artifact)).toEqual(artifact);
  expect(artifact.metrics).toHaveLength(Object.keys(UNIVERSALITY_FLOORS).length);
});
test("U0 rejects impossible thresholds, surplus semantic fields, and vacuity-policy removal",()=>{
  const impossible:any=registration(); impossible.metrics[1].threshold=2; expect(()=>freezeUniversalityClaim(impossible)).toThrow("weakens normative floor");
  const surplus:any=registration(); surplus.metrics[0].alternateDenominator="easy cells"; expect(()=>freezeUniversalityClaim(surplus)).toThrow("schema must be exact");
  const vacuous:any=registration(); delete vacuous.undefinedDenominatorPolicy; expect(()=>freezeUniversalityClaim(vacuous)).toThrow("schema must be exact");
});
test("U0 closure is machine indexed, skeptic accepted, residual-free, and advances only to U1",()=>{
  const closure=JSON.parse(readFileSync("docs/universality/campaign-v1/u0-closure.json","utf8"));
  const claim=JSON.parse(readFileSync("docs/universality/campaign-v1/claim.json","utf8")) as FrozenUniversalityClaim;
  expect(closure).toMatchObject({checkpoint:"U0",status:"complete",assurance:"property-tested",claimDigest:claim.digest,residuals:[],next:"U1"});
  expect(closure.skepticalReview.round1).toContain("rejected"); expect(closure.skepticalReview.round2).toContain("accepted");
  expect(closure.falsifiersExercised.length).toBeGreaterThanOrEqual(7); expect(closure.semanticCoverage.length).toBeGreaterThanOrEqual(9);
});
