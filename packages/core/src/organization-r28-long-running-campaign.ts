/**
 * A fail-closed progress verifier for R28 repository dogfood.
 *
 * This module deliberately cannot produce an R28 closure artifact.  It only
 * checks externally collected campaign observations and reports which formal
 * obligations remain unwitnessed.  Unit-test fixtures therefore cannot be
 * confused with long-running evidence.
 */

export const R28_PRIOR_CHECKPOINTS = Array.from({ length: 28 }, (_, i) => `R${i}`);
export const R28_PHASES = [
  "observation", "twin-update", "proposal", "static-formal-checks",
  "independent-benchmark", "human-approval", "signed-deployment", "canary",
  "monitoring", "promotion-or-rollback", "durable-decision-memory",
] as const;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const DAY_MS = 86_400_000;

export type R28LongRunningCampaign = {
  schema: "autonomy.r28-long-running-campaign.v1";
  /** Must remain false: formal closure is performed by a separate gate. */
  closureClaim: false;
  campaignId: string;
  preregistration: {
    digest: string;
    recordedAt: string;
    minimumDurationMs: number;
    maximumObservationGapMs: number;
    bounds: { proposalCount: number; spend: number; operations: number; changedPaths: number };
    protectedControlDigests: Record<"constitution"|"grader"|"authorityCeiling"|"evidence"|"pause"|"rollback", string>;
  };
  repository: {
    scope: "canonical-repository";
    remoteDigest: string;
    baselineHead: string;
    finalHead: string;
  };
  dependencies: Array<{ checkpoint: string; artifactDigest?: string; status: "verified-closed"|"pending"; residual?: string }>;
  observations: Array<{
    sequence: number; observedAt: string; head: string; processInstanceId: string;
    auditHeadDigest: string; collectorReceiptDigest: string;
  }>;
  proposals: Array<{
    id: string; outcome: "accepted"|"rejected"|"rolled-back";
    proposalDigest: string; preregisteredEvidenceDigest: string;
    roleIdentities: { proposer: string; evaluator: string; approver: string; deployer: string; auditor: string };
    staticChecksDigest: string; benchmarkDigest: string; decisionDigest: string;
    deploymentDigest?: string; canaryDigest?: string; promotionDigest?: string; rollbackDigest?: string;
    measuredImprovement: number; safetyRegressions: number;
    spend: number; operations: number; changedPaths: number;
    protectedControlDigestsAfter: R28LongRunningCampaign["preregistration"]["protectedControlDigests"];
  }>;
  restarts: Array<{ phase: typeof R28_PHASES[number]; beforeProcessInstanceId: string; afterProcessInstanceId: string; durableHistoryDigest: string; collectorReceiptDigest: string }>;
  attacks: { forgedApprovalRejectedReceipt?: string; compromisedWorkerRejectedReceipt?: string };
  controls: { globalPauseReceipt?: string; deterministicSafeStateReceipt?: string };
  residuals: Array<{ id: string; obligation: string; reason: string }>;
};

export type R28CampaignAssessment = {
  status: "invalid"|"in-progress"|"campaign-complete-dependencies-pending"|"ready-for-separate-closure-review";
  errors: string[];
  unwitnessed: string[];
  elapsedMs: number;
};

const time = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const natural = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const digestFields = (value: Record<string, string>, prefix: string, errors: string[]) => {
  for (const [key, digest] of Object.entries(value)) if (!SHA256.test(digest)) errors.push(`${prefix}.${key} is not a sha256 digest`);
};

export function assessR28LongRunningCampaign(c: R28LongRunningCampaign): R28CampaignAssessment {
  const errors: string[] = [], unwitnessed: string[] = [];
  if (c.schema !== "autonomy.r28-long-running-campaign.v1") errors.push("unsupported schema");
  if (c.closureClaim !== false) errors.push("campaign documents cannot claim closure");
  if (!nonempty(c.campaignId)) errors.push("campaignId must be nonempty");
  if (c.repository.scope !== "canonical-repository") errors.push("repository scope is not canonical");
  for (const [key, value] of Object.entries({ remoteDigest:c.repository.remoteDigest, baselineHead:c.repository.baselineHead, finalHead:c.repository.finalHead, preregistration:c.preregistration.digest }))
    if (!SHA256.test(value)) errors.push(`${key} is not a sha256 digest`);
  const preregisteredAt=time(c.preregistration.recordedAt);
  if (preregisteredAt === undefined) errors.push("preregistration.recordedAt is invalid");
  if (!natural(c.preregistration.minimumDurationMs) || c.preregistration.minimumDurationMs < DAY_MS) errors.push("minimumDurationMs must be a safe integer operationalizing long-running as at least 24 hours");
  if (!natural(c.preregistration.maximumObservationGapMs) || !(c.preregistration.maximumObservationGapMs > 0 && c.preregistration.maximumObservationGapMs <= c.preregistration.minimumDurationMs)) errors.push("invalid maximumObservationGapMs");
  for (const [key,value] of Object.entries(c.preregistration.bounds)) if (!natural(value)) errors.push(`bounds.${key} must be a nonnegative safe integer`);
  digestFields(c.preregistration.protectedControlDigests, "protectedControlDigests", errors);

  if (!Array.isArray(c.dependencies) || !Array.isArray(c.observations) || !Array.isArray(c.proposals) || !Array.isArray(c.restarts) || !Array.isArray(c.residuals)) return {status:"invalid",errors:[...errors,"campaign collections must be arrays"],unwitnessed,elapsedMs:0};
  const records=(xs:unknown[])=>xs.every(x=>x!==null&&typeof x==="object"&&!Array.isArray(x));
  if (![c.dependencies,c.observations,c.proposals,c.restarts,c.residuals].every(records) || c.proposals.some(p=>!p.roleIdentities||!p.protectedControlDigestsAfter)) return {status:"invalid",errors:[...errors,"campaign collection entries must be structured records"],unwitnessed,elapsedMs:0};
  const expected = new Set(R28_PRIOR_CHECKPOINTS), seen = new Set<string>();
  for (const d of c.dependencies) {
    if (d.status!=="pending"&&d.status!=="verified-closed") errors.push(`${d.checkpoint} has invalid dependency status`);
    if (!expected.has(d.checkpoint) || seen.has(d.checkpoint)) errors.push(`unexpected or duplicate dependency ${d.checkpoint}`);
    seen.add(d.checkpoint);
    if (d.status === "verified-closed" && !d.artifactDigest) errors.push(`${d.checkpoint} has no closure artifact digest`);
    if (d.artifactDigest && !SHA256.test(d.artifactDigest)) errors.push(`${d.checkpoint} artifact digest is malformed`);
    if (d.status === "pending" && !d.residual) errors.push(`${d.checkpoint} pending status lost its residual`);
  }
  for (const d of expected) if (!seen.has(d)) errors.push(`missing dependency ${d}`);

  let previous = -Infinity, elapsedMs = 0;
  const processIds = new Set<string>();
  c.observations.forEach((o, i) => {
    const at=time(o.observedAt);
    if(!natural(o.sequence)) errors.push(`observation ${i} sequence is not a nonnegative safe integer`);
    if (o.sequence !== i + 1) errors.push(`observation ${i} is out of sequence`);
    if (at === undefined || at <= previous) errors.push(`observation ${i} timestamp is not strictly increasing`);
    if (i && at !== undefined && at - previous > c.preregistration.maximumObservationGapMs) errors.push(`observation gap after ${i} exceeds preregistration`);
    if (![o.head,o.auditHeadDigest,o.collectorReceiptDigest].every(v=>SHA256.test(v))) errors.push(`observation ${i} has malformed evidence digest`);
    if (!o.processInstanceId) errors.push(`observation ${i} lacks process identity`);
    processIds.add(o.processInstanceId); if (at !== undefined) previous=at;
  });
  const firstObserved=c.observations.length?time(c.observations[0]!.observedAt):undefined;
  if (preregisteredAt !== undefined && firstObserved !== undefined && preregisteredAt >= firstObserved) errors.push("preregistration must precede the first observation");
  if (c.observations.length >= 2) elapsedMs = time(c.observations.at(-1)!.observedAt)! - time(c.observations[0]!.observedAt)!;
  if (elapsedMs < c.preregistration.minimumDurationMs) unwitnessed.push("long-running-duration");
  if (processIds.size < 2) unwitnessed.push("cross-process-continuity");

  const proposalIds=new Set<string>();
  const outcomes = new Set(c.proposals.map(p=>p.outcome));
  for (const outcome of ["accepted","rejected","rolled-back"] as const) if (!outcomes.has(outcome)) unwitnessed.push(`${outcome}-proposal`);
  let spend=0, operations=0, changedPaths=0;
  for (const p of c.proposals) {
    if(!(["accepted","rejected","rolled-back"] as unknown[]).includes(p.outcome)) errors.push(`${p.id} has invalid outcome`);
    if (!nonempty(p.id) || proposalIds.has(p.id)) errors.push(`proposal id is empty or duplicate: ${p.id}`); else proposalIds.add(p.id);
    const roles=Object.values(p.roleIdentities);
    if (roles.some(role=>!nonempty(role))) errors.push(`${p.id} has an empty role identity`);
    if (new Set(roles).size !== roles.length) errors.push(`${p.id} reuses an identity across separated roles`);
    for (const [key,value] of Object.entries({proposal:p.proposalDigest,evidence:p.preregisteredEvidenceDigest,checks:p.staticChecksDigest,benchmark:p.benchmarkDigest,decision:p.decisionDigest})) if(!SHA256.test(value)) errors.push(`${p.id}.${key} is malformed`);
    for (const [key,value] of Object.entries({deployment:p.deploymentDigest,canary:p.canaryDigest,promotion:p.promotionDigest,rollback:p.rollbackDigest})) if(value !== undefined && !SHA256.test(value)) errors.push(`${p.id}.${key} is malformed`);
    if (p.outcome === "accepted" && (!p.deploymentDigest || !p.canaryDigest || !p.promotionDigest)) errors.push(`${p.id} accepted without deploy, canary, and promotion evidence`);
    if (p.outcome === "rolled-back" && (!p.deploymentDigest || !p.canaryDigest || !p.rollbackDigest)) errors.push(`${p.id} rollback lacks deploy, canary, or rollback evidence`);
    if (!Number.isFinite(p.measuredImprovement) || !natural(p.safetyRegressions)) errors.push(`${p.id} measurement fields are invalid`);
    if (p.outcome === "accepted" && (p.measuredImprovement <= 0 || p.safetyRegressions !== 0)) errors.push(`${p.id} accepted without improvement and zero safety regression`);
    type ControlKey=keyof typeof c.preregistration.protectedControlDigests;
    if (Object.keys(c.preregistration.protectedControlDigests).some(key=>p.protectedControlDigestsAfter[key as ControlKey] !== c.preregistration.protectedControlDigests[key as ControlKey])) errors.push(`${p.id} modified a protected control`);
    for (const [key,value] of Object.entries({spend:p.spend,operations:p.operations,changedPaths:p.changedPaths})) if(!natural(value)) errors.push(`${p.id}.${key} must be a nonnegative safe integer`);
    spend+=p.spend; operations+=p.operations; changedPaths+=p.changedPaths;
  }
  if (c.proposals.length > c.preregistration.bounds.proposalCount) errors.push("proposal-count bound exceeded");
  if (spend > c.preregistration.bounds.spend) errors.push("spend bound exceeded");
  if (operations > c.preregistration.bounds.operations) errors.push("operations bound exceeded");
  if (changedPaths > c.preregistration.bounds.changedPaths) errors.push("cumulative-change bound exceeded");

  const restartCounts=new Map<string,number>();
  for(const r of c.restarts) restartCounts.set(r.phase,(restartCounts.get(r.phase)??0)+1);
  for (const phase of R28_PHASES) { const count=restartCounts.get(phase)??0; if (!count) unwitnessed.push(`restart:${phase}`); else if(count!==1) errors.push(`${phase} must have exactly one restart record`); }
  for(const phase of restartCounts.keys()) if(!(R28_PHASES as readonly string[]).includes(phase)) errors.push(`unknown restart phase ${phase}`);
  for (const r of c.restarts) {
    if (!nonempty(r.beforeProcessInstanceId) || !nonempty(r.afterProcessInstanceId)) errors.push(`${r.phase} restart has an empty process identity`);
    if (r.beforeProcessInstanceId === r.afterProcessInstanceId) errors.push(`${r.phase} restart reused process identity`);
    if (!processIds.has(r.beforeProcessInstanceId) || !processIds.has(r.afterProcessInstanceId)) errors.push(`${r.phase} restart identities are not present in campaign observations`);
    if (!SHA256.test(r.durableHistoryDigest) || !SHA256.test(r.collectorReceiptDigest)) errors.push(`${r.phase} restart lacks durable external evidence`);
  }
  for(const [key,value] of Object.entries(c.attacks)) if(value !== undefined && !SHA256.test(value)) errors.push(`attacks.${key} is not a digest`);
  for(const [key,value] of Object.entries(c.controls)) if(value !== undefined && !SHA256.test(value)) errors.push(`controls.${key} is not a digest`);
  if (!c.attacks.forgedApprovalRejectedReceipt) unwitnessed.push("forged-approval-drill");
  if (!c.attacks.compromisedWorkerRejectedReceipt) unwitnessed.push("compromised-worker-drill");
  if (!c.controls.globalPauseReceipt) unwitnessed.push("global-pause");
  if (!c.controls.deterministicSafeStateReceipt) unwitnessed.push("deterministic-safe-state");

  const pending=c.dependencies.filter(d=>d.status==="pending");
  const residualIds=new Set<string>(), residualObligations=new Map<string,number>();
  for(const r of c.residuals){
    if(!nonempty(r.id)||residualIds.has(r.id)) errors.push(`residual id is empty or duplicate: ${r.id}`); else residualIds.add(r.id);
    if(!nonempty(r.obligation)||!nonempty(r.reason)) errors.push(`${r.id} residual fields must be nonempty`);
    residualObligations.set(r.obligation,(residualObligations.get(r.obligation)??0)+1);
  }
  for (const d of pending) if (residualObligations.get(`dependency:${d.checkpoint}`)!==1) errors.push(`${d.checkpoint} pending dependency must have exactly one campaign residual`);
  for(const [obligation,count] of residualObligations) if(obligation.startsWith("dependency:")){const checkpoint=obligation.slice(11);if(!pending.some(d=>d.checkpoint===checkpoint)||count!==1) errors.push(`${obligation} does not exactly represent one pending dependency`)}
  if (errors.length) return {status:"invalid",errors,unwitnessed,elapsedMs};
  if (unwitnessed.length) return {status:"in-progress",errors,unwitnessed,elapsedMs};
  if (pending.length) return {status:"campaign-complete-dependencies-pending",errors,unwitnessed,elapsedMs};
  return {status:"ready-for-separate-closure-review",errors,unwitnessed,elapsedMs};
}
