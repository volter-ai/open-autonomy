import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { freezeCampaignSupersession, freezeUniversalityClaim, UNIVERSALITY_FLOORS, UNIVERSALITY_METRIC_CONTRACTS, verifyFrozenCampaignSupersession, verifyFrozenUniversalityClaim, verifyHistoricalUniversalityClaimDigest, type FrozenCampaignSupersession, type FrozenUniversalityClaim, type UniversalityClaimRegistration, type UniversalityMetric } from "./organization-universality-claim";

const directions: Record<UniversalityMetric, "at-least" | "at-most" | "exactly"> = {
  diagnosticAccounting:"exactly",canonicalFactWeighted:"at-least",canonicalFactPerSystem:"at-least",
  mandatoryObservationWeighted:"at-least",mandatoryObservationPerSystem:"at-least",twoFamilyPortability:"at-least",
  certifiedCompatibleCompilation:"at-least",nativeExecutedPreservation:"at-least",compatibleCellExecutionSampling:"at-least",
  maxHoldoutDegradation:"at-most",maxSilentLoss:"exactly",maxResultDependentExclusion:"exactly",maxCriticalInventoryConflict:"exactly",
};
const registration = (): UniversalityClaimRegistration => ({ schema:"open-autonomy.universality-claim.v2", campaignId:"universal-2026-v1",
  registeredAt:"2026-07-16T00:00:00Z", domain:"autonomous-software-organizations", sourceSelectionRule:"frozen U1 census rule",
  sourceCensusContractDigest:`sha256:${"a".repeat(64)}`,forcingSupplementDigest:`sha256:${"b".repeat(64)}`,
  compositionSelectionRule:"frozen U2 meaningful-composition rule", sourcePopulationId:"source-population-v1",
  compositionPopulationId:"composition-population-v1",censusAt:"2026-07-16T23:59:59Z",executionSamplingRule:"sha256 rank within every frozen source/backend stratum; take the lowest-ranked cells until at least 30% globally",executionSamplingSeed:"oa-universality-2026-v1",undefinedDenominatorPolicy:"invalidate-campaign",assurancePolicyId:"universality-assurance-v1", metrics:(Object.keys(UNIVERSALITY_FLOORS) as UniversalityMetric[]).map(metric=>({
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
  const artifact=JSON.parse(readFileSync("docs/universality/campaign-v5/claim.json","utf8")) as FrozenUniversalityClaim;
  expect(verifyFrozenUniversalityClaim(artifact)).toEqual(artifact);
  expect(artifact.metrics).toHaveLength(Object.keys(UNIVERSALITY_FLOORS).length);
  expect(artifact.sourceSelectionRule).toContain(artifact.sourceCensusContractDigest);
});
test("U0 preserves and explicitly invalidates both predecessors instead of rewriting history",()=>{
  const v1=JSON.parse(readFileSync("docs/universality/campaign-v1/claim.json","utf8")) as FrozenUniversalityClaim;
  const v2=JSON.parse(readFileSync("docs/universality/campaign-v2/claim.json","utf8")) as FrozenUniversalityClaim;
  const v3=JSON.parse(readFileSync("docs/universality/campaign-v3/claim.json","utf8")) as FrozenUniversalityClaim;
  const v4=JSON.parse(readFileSync("docs/universality/campaign-v4/claim.json","utf8")) as FrozenUniversalityClaim;
  const v5=JSON.parse(readFileSync("docs/universality/campaign-v5/claim.json","utf8")) as FrozenUniversalityClaim;
  const s12=JSON.parse(readFileSync("docs/universality/campaign-v2/supersession.json","utf8")) as FrozenCampaignSupersession;
  const s23=JSON.parse(readFileSync("docs/universality/campaign-v3/supersession.json","utf8")) as FrozenCampaignSupersession;
  const s34=JSON.parse(readFileSync("docs/universality/campaign-v4/supersession.json","utf8")) as FrozenCampaignSupersession;
  const s45=JSON.parse(readFileSync("docs/universality/campaign-v5/supersession.json","utf8")) as FrozenCampaignSupersession;
  expect(verifyHistoricalUniversalityClaimDigest(v1)).toEqual(v1); expect(verifyHistoricalUniversalityClaimDigest(v2)).toEqual(v2); expect(verifyHistoricalUniversalityClaimDigest(v3)).toEqual(v3); expect(verifyHistoricalUniversalityClaimDigest(v4)).toEqual(v4); expect(verifyFrozenUniversalityClaim(v5)).toEqual(v5);
  expect(verifyFrozenCampaignSupersession(s12,v1,v2)).toEqual(s12); expect(verifyFrozenCampaignSupersession(s23,v2,v3)).toEqual(s23); expect(verifyFrozenCampaignSupersession(s34,v3,v4)).toEqual(s34); expect(verifyFrozenCampaignSupersession(s45,v4,v5)).toEqual(s45);
  expect(Date.parse(v5.registeredAt)).toBeLessThan(Date.parse(v5.censusAt));
});
test("U0 rejects impossible thresholds, surplus semantic fields, and vacuity-policy removal",()=>{
  const impossible:any=registration(); impossible.metrics[1].threshold=2; expect(()=>freezeUniversalityClaim(impossible)).toThrow("weakens normative floor");
  const surplus:any=registration(); surplus.metrics[0].alternateDenominator="easy cells"; expect(()=>freezeUniversalityClaim(surplus)).toThrow("schema must be exact");
  const vacuous:any=registration(); delete vacuous.undefinedDenominatorPolicy; expect(()=>freezeUniversalityClaim(vacuous)).toThrow("schema must be exact");
});
test("U0 closure is machine indexed, skeptic accepted, residual-free, and advances only to U1",()=>{
  const closure=JSON.parse(readFileSync("docs/universality/campaign-v5/u0-closure.json","utf8"));
  const claim=JSON.parse(readFileSync("docs/universality/campaign-v5/claim.json","utf8")) as FrozenUniversalityClaim;
  expect(closure).toMatchObject({checkpoint:"U0",status:"complete",assurance:"property-tested",claimDigest:claim.digest,residuals:[],next:"U1"});
  expect(closure.skepticalReview.round1).toContain("rejected"); expect(Object.values(closure.skepticalReview).at(-1)).toContain("accepted");
  expect(closure.falsifiersExercised.length).toBeGreaterThanOrEqual(7); expect(closure.semanticCoverage.length).toBeGreaterThanOrEqual(9);
});
test("U0 verifier rejects reversed chronology and forged or surplus supersession joins",()=>{
  const reversed=registration(); reversed.censusAt="2026-07-15T00:00:00Z"; expect(()=>freezeUniversalityClaim(reversed)).toThrow("identity invalid");
  const oldClaim=JSON.parse(readFileSync("docs/universality/campaign-v4/claim.json","utf8")) as FrozenUniversalityClaim;
  const newClaim=JSON.parse(readFileSync("docs/universality/campaign-v5/claim.json","utf8")) as FrozenUniversalityClaim;
  const value:any=JSON.parse(readFileSync("docs/universality/campaign-v5/supersession.json","utf8")); delete value.digest;
  expect(freezeCampaignSupersession(value,oldClaim,newClaim).predecessorDigest).toBe(oldClaim.digest);
  value.successorCampaign="forged"; expect(()=>freezeCampaignSupersession(value,oldClaim,newClaim)).toThrow("join invalid");
  value.successorCampaign=newClaim.campaignId; value.alternateStatus="complete"; expect(()=>freezeCampaignSupersession(value,oldClaim,newClaim)).toThrow("join invalid");
  delete value.alternateStatus; const forgedOld={...oldClaim,sourceSelectionRule:"forged",digest:oldClaim.digest}; expect(()=>freezeCampaignSupersession(value,forgedOld,newClaim)).toThrow("historical universality claim digest mismatch");
  const forgedNew={...newClaim,sourceSelectionRule:"forged",digest:newClaim.digest}; expect(()=>freezeCampaignSupersession(value,oldClaim,forgedNew)).toThrow("digest mismatch");
});
