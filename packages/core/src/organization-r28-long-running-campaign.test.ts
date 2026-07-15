import { describe, expect, test } from "bun:test";
import { assessR28LongRunningCampaign, R28_PHASES, R28_PRIOR_CHECKPOINTS, type R28LongRunningCampaign } from "./organization-r28-long-running-campaign";

const d=(n=0)=>`sha256:${n.toString(16).padStart(64,"0")}`;
const controls={constitution:d(1),grader:d(2),authorityCeiling:d(3),evidence:d(4),pause:d(5),rollback:d(6)};
function campaign():R28LongRunningCampaign {
  const start=Date.parse("2026-01-01T00:00:00Z");
  const roles={proposer:"p",evaluator:"e",approver:"h",deployer:"d",auditor:"a"};
  const proposal=(id:string,outcome:"accepted"|"rejected"|"rolled-back")=>({
    id,outcome,proposalDigest:d(20),preregisteredEvidenceDigest:d(21),roleIdentities:roles,
    staticChecksDigest:d(22),benchmarkDigest:d(23),decisionDigest:d(24),
    ...(outcome!=="rejected"?{deploymentDigest:d(25),canaryDigest:d(26)}:{}),
    ...(outcome==="accepted"?{promotionDigest:d(27)}:{}),...(outcome==="rolled-back"?{rollbackDigest:d(28)}:{}),
    measuredImprovement:outcome==="accepted"?1:0,safetyRegressions:0,spend:1,operations:1,changedPaths:1,
    protectedControlDigestsAfter:{...controls},
  });
  return {
    schema:"autonomy.r28-long-running-campaign.v1",closureClaim:false,campaignId:"canonical-2026-01",
    preregistration:{digest:d(7),recordedAt:"2025-12-31T00:00:00Z",minimumDurationMs:86_400_000,maximumObservationGapMs:43_200_000,bounds:{proposalCount:3,spend:3,operations:3,changedPaths:3},protectedControlDigests:{...controls}},
    repository:{scope:"canonical-repository",remoteDigest:d(8),baselineHead:d(9),finalHead:d(10)},
    dependencies:R28_PRIOR_CHECKPOINTS.map((checkpoint,i)=>({checkpoint,artifactDigest:d(100+i),status:"verified-closed"})),
    observations:[0,12,24].map((hours,i)=>({sequence:i+1,observedAt:new Date(start+hours*3_600_000).toISOString(),head:d(30+i),processInstanceId:i<2?"process-a":"process-b",auditHeadDigest:d(40+i),collectorReceiptDigest:d(50+i)})),
    proposals:[proposal("a","accepted"),proposal("r","rejected"),proposal("rb","rolled-back")],
    restarts:R28_PHASES.map((phase,i)=>({phase,beforeProcessInstanceId:"process-a",afterProcessInstanceId:"process-b",durableHistoryDigest:d(200+i),collectorReceiptDigest:d(300+i)})),
    attacks:{forgedApprovalRejectedReceipt:d(400),compromisedWorkerRejectedReceipt:d(401)},
    controls:{globalPauseReceipt:d(402),deterministicSafeStateReceipt:d(403)},residuals:[],
  };
}

describe("R28 long-running campaign non-closure verifier",()=>{
  test("reports only readiness for a separate closure review",()=>expect(assessR28LongRunningCampaign(campaign())).toEqual(expect.objectContaining({status:"ready-for-separate-closure-review",errors:[],unwitnessed:[],elapsedMs:86_400_000})));
  test("keeps a complete campaign open while any prior checkpoint is pending",()=>{const c=campaign();c.dependencies[24]={checkpoint:"R24",status:"pending",residual:"R24 producer evidence remains open"};c.residuals.push({id:"r24",obligation:"dependency:R24",reason:"producer evidence remains open"});expect(assessR28LongRunningCampaign(c).status).toBe("campaign-complete-dependencies-pending")});
  test("rejects fixture-like duration, observation gaps, role reuse, control mutation, and fake restarts",()=>{const c=campaign();c.preregistration.minimumDurationMs=1;c.observations[1]!.observedAt="2026-01-02T00:00:01Z";c.proposals[0]!.roleIdentities.evaluator="p";c.proposals[0]!.protectedControlDigestsAfter.grader=d(999);c.restarts[0]!.afterProcessInstanceId=c.restarts[0]!.beforeProcessInstanceId;const a=assessR28LongRunningCampaign(c);expect(a.status).toBe("invalid");expect(a.errors.join("\n")).toContain("at least 24 hours");expect(a.errors.join("\n")).toContain("observation gap");expect(a.errors.join("\n")).toContain("reuses an identity");expect(a.errors.join("\n")).toContain("modified a protected control");expect(a.errors.join("\n")).toContain("reused process identity")});
  test("cannot erase a dependency residual or turn this document into closure",()=>{const c=campaign();c.dependencies[0]={checkpoint:"R0",status:"pending",residual:"open"};(c as unknown as {closureClaim:boolean}).closureClaim=true;const a=assessR28LongRunningCampaign(c);expect(a.status).toBe("invalid");expect(a.errors).toContain("campaign documents cannot claim closure");expect(a.errors).toContain("R0 pending dependency must have exactly one campaign residual")});
  test("rejects unsafe numbers, duplicate identifiers, malformed optional evidence, and duplicate phase records",()=>{const c=campaign();c.preregistration.bounds.spend=Number.MAX_SAFE_INTEGER+1;c.proposals[1]!.id=c.proposals[0]!.id;c.proposals[0]!.deploymentDigest="not-a-digest";c.restarts.push({...c.restarts[0]!});c.attacks.forgedApprovalRejectedReceipt="not-a-digest";const a=assessR28LongRunningCampaign(c);expect(a.status).toBe("invalid");expect(a.errors.join("\n")).toContain("nonnegative safe integer");expect(a.errors.join("\n")).toContain("empty or duplicate");expect(a.errors.join("\n")).toContain("deployment is malformed");expect(a.errors.join("\n")).toContain("exactly one restart");expect(a.errors.join("\n")).toContain("is not a digest")});
  test("requires preregistration before observations and exact residual correspondence",()=>{const c=campaign();c.preregistration.recordedAt=c.observations[0]!.observedAt;c.dependencies[2]={checkpoint:"R2",status:"pending",residual:"open"};c.residuals.push({id:"one",obligation:"dependency:R2",reason:"open"},{id:"two",obligation:"dependency:R2",reason:"duplicate"},{id:"orphan",obligation:"dependency:R9",reason:"not pending"});const a=assessR28LongRunningCampaign(c);expect(a.status).toBe("invalid");expect(a.errors).toContain("preregistration must precede the first observation");expect(a.errors.join("\n")).toContain("exactly one campaign residual");expect(a.errors.join("\n")).toContain("does not exactly represent one pending dependency")});
  test("fails closed on malformed runtime collection shapes",()=>{const c=campaign() as unknown as {proposals:unknown[]};c.proposals=[null];expect(()=>assessR28LongRunningCampaign(c as R28LongRunningCampaign)).not.toThrow();expect(assessR28LongRunningCampaign(c as R28LongRunningCampaign)).toEqual(expect.objectContaining({status:"invalid",errors:expect.arrayContaining(["campaign collection entries must be structured records"])}))});
});
