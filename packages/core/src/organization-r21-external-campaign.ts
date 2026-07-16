import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import { RUNTIME_SERVICES, type RuntimeService } from "./organization-runtime-reliability";

type Digest = `sha256:${string}`;
const FAULTS = ["process", "storage", "dependency", "network", "control-plane", "region"] as const;
const LIFECYCLE = ["upgrade", "downgrade", "schema-migration", "credential-rotation", "drain", "decommission", "restore"] as const;
type Signature = { signerId: string; publicKeyPem: string; signedAt: string; signature: string };
type Slo = { service: RuntimeService; minimumSamples: number; availabilityTarget: number; p95TargetMs: number;
  maximumErrorBudgetBurn: number; maximumCostPerRequest: number };
export type R21Registration = { schema: "autonomy.r21-external-registration.v1"; campaignId: string;
  dependencies: Record<"R15" | "R16" | "R17" | "R18" | "R19" | "R20", Digest>;
  topologyDigest: Digest; regions: string[]; services: RuntimeService[]; faults: Array<(typeof FAULTS)[number]>;
  lifecycle: Array<(typeof LIFECYCLE)[number]>; slos: Slo[]; rampConcurrency: number[]; soakDurationMs: number;
  rpoTargetMs: number; rtoTargetMs: number; minimumDistinctBillingAuthorities: 2;
  minimumUnfamiliarOperators: 1; startsAt: string; endsAt: string; registrationAuthority: Signature };
export type R21ServiceEvidence = { schema: "autonomy.r21-service-observation.v1"; campaignId: string;
  service: RuntimeService; region: string; phase: "ramp" | "soak"; concurrency: number;
  topologyDigest: Digest; workloadDigest: Digest; endpointDigest: Digest; telemetryArtifactDigest: Digest; samples: number; successes: number;
  p95Ms: number; errorBudgetBurn: number; totalCost: number; currency: string; usageUnit: string;
  startedAt: string; completedAt: string; observedAt: string };
export type R21FaultEvidence = { schema: "autonomy.r21-fault-observation.v1"; campaignId: string;
  fault: (typeof FAULTS)[number]; topologyDigest: Digest; targetDigest: Digest; injectionArtifactDigest: Digest; recoveryArtifactDigest: Digest; recoveryCutDigest: Digest;
  region: string; beforeStateDigest: Digest; afterStateDigest: Digest; faultAt: string; recoveryPointAt: string;
  lastAcknowledgedSequence: number; recoveredSequence: number;
  distinctProcessOrRegion: boolean; rpoMs: number; rtoMs: number; revokedPreserved: boolean;
  acknowledgedEffectsPreserved: boolean; startedAt: string; recoveredAt: string };
export type R21LifecycleEvidence = { schema: "autonomy.r21-lifecycle-observation.v1"; campaignId: string;
  operation: (typeof LIFECYCLE)[number]; service: RuntimeService; topologyDigest: Digest; beforeDigest: Digest; afterDigest: Digest;
  auditDigest: Digest; completedAt: string };
export type R21BillingEvidence = { schema: "autonomy.r21-billing-observation.v1"; campaignId: string;
  service: RuntimeService; authority: string; provider: string; currency: string; unit: string;
  usage: number; amount: number; invoiceArtifactDigest: Digest; observedAt: string };
export type R21OperatorEvidence = { schema: "autonomy.r21-operator-observation.v1"; campaignId: string;
  operatorId: string; unfamiliarityAttestationDigest: Digest; alertDigest: Digest; diagnosisDigest: Digest;
  runbookDigest: Digest; recoveryDigest: Digest; startedAt: string; completedAt: string; outcome: "recovered";
  operatorSignature: Signature; custodianSignature: Signature };
export type R21Campaign = { schema: "autonomy.r21-external-campaign.v1"; closureClaim: true;
  registration: R21Registration; services: R21ServiceEvidence[]; faults: R21FaultEvidence[];
  lifecycle: R21LifecycleEvidence[]; billing: R21BillingEvidence[]; operators: R21OperatorEvidence[];
  collector: Signature };
export type R21Trust = { dependencyEvidence: R21Registration["dependencies"];
  policy: Pick<R21Registration,"regions"|"slos"|"rampConcurrency"|"soakDurationMs"|"rpoTargetMs"|"rtoTargetMs"|"minimumDistinctBillingAuthorities"|"minimumUnfamiliarOperators"> & {
    topologyDigest: Digest; workloadDigests: Record<string,Digest>; billing: { currency: string; usageUnit: string; accountingMethod: "sum-authenticated-service-observations"; authorities: Record<string,string> } };
  registrationKeys: string[]; collectorKeys: string[]; custodianKeys: string[]; operatorKeys: Record<string, string>;
  billingAuthorityKeys: Record<string, string>;
  verifyTelemetry(x: R21ServiceEvidence): boolean; verifyFault(x: R21FaultEvidence): boolean;
  verifyLifecycle(x: R21LifecycleEvidence): boolean; verifyBilling(x: R21BillingEvidence): boolean };

const digest = (x: unknown): Digest => `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`;
const isDigest = (x: unknown): x is Digest => typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const date = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
const fingerprint = (pem: string) => { try { return createHash("sha256").update(createPublicKey(pem)
  .export({ type: "spki", format: "der" })).digest("hex"); } catch { return "invalid"; } };
function exact(x: unknown, keys: string[], label: string) { if (!x || typeof x !== "object" || Array.isArray(x) ||
  Object.keys(x).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`${label} schema invalid`); }
function signable<T extends object>(domain: string, x: T, key: keyof T) { const body: any = structuredClone(x);
  body[key] = { ...body[key], signature: "" }; return { domain, body }; }
function signature(body: unknown, s: Signature, label: string) { exact(s,["signerId","publicKeyPem","signedAt","signature"],`${label} signature`);
  if (!s.signerId || !date(s.signedAt)) throw Error(`${label} signer invalid`); let ok=false;
  try { ok=createPublicKey(s.publicKeyPem).asymmetricKeyType==="ed25519" && verify(null,Buffer.from(canonicalSemanticJson(body)),s.publicKeyPem,Buffer.from(s.signature,"base64")); } catch {}
  if (!ok) throw Error(`${label} signature invalid`); }
export const signableR21Registration = (x:R21Registration) => signable("open-autonomy/r21/registration/v1",x,"registrationAuthority");
export const signableR21Operator = (x:R21OperatorEvidence, key:"operatorSignature"|"custodianSignature") =>
  { const body:any=structuredClone(x); body.operatorSignature.signature=""; body.custodianSignature.signature="";
    return {domain:`open-autonomy/r21/operator/${key}/v1`,body}; };
export const signableR21Campaign = (x:R21Campaign) => signable("open-autonomy/r21/collector/v1",x,"collector");

export function verifyR21ExternalCampaign(c:R21Campaign,t:R21Trust){
  exact(c,["schema","closureClaim","registration","services","faults","lifecycle","billing","operators","collector"],"campaign");
  if(c.schema!=="autonomy.r21-external-campaign.v1"||c.closureClaim!==true)throw Error("R21 campaign invalid");
  const r=c.registration; exact(r,["schema","campaignId","dependencies","topologyDigest","regions","services","faults","lifecycle","slos","rampConcurrency","soakDurationMs","rpoTargetMs","rtoTargetMs","minimumDistinctBillingAuthorities","minimumUnfamiliarOperators","startsAt","endsAt","registrationAuthority"],"registration");
  if(r.schema!=="autonomy.r21-external-registration.v1"||!r.campaignId||!isDigest(r.topologyDigest)||
    canonicalSemanticJson(r.services)!==canonicalSemanticJson(RUNTIME_SERVICES)||canonicalSemanticJson(r.faults)!==canonicalSemanticJson(FAULTS)||
    canonicalSemanticJson(r.lifecycle)!==canonicalSemanticJson(LIFECYCLE)||r.regions.length<2||new Set(r.regions).size!==r.regions.length||
    r.slos.length!==RUNTIME_SERVICES.length||new Set(r.slos.map(x=>x.service)).size!==RUNTIME_SERVICES.length||
    r.slos.some(x=>!Number.isSafeInteger(x.minimumSamples)||x.minimumSamples<1||x.availabilityTarget<=0||x.availabilityTarget>1||x.p95TargetMs<0||x.maximumErrorBudgetBurn<0||x.maximumCostPerRequest<0)||
    r.rampConcurrency.length<3||r.rampConcurrency.some((x,i)=>!Number.isSafeInteger(x)||x<1||(i>0&&x<=r.rampConcurrency[i-1]!))||
    !Number.isSafeInteger(r.soakDurationMs)||r.soakDurationMs<=0||r.rpoTargetMs<0||r.rtoTargetMs<0||
    r.minimumDistinctBillingAuthorities<2||r.minimumUnfamiliarOperators<1||!date(r.startsAt)||!date(r.endsAt)||Date.parse(r.startsAt)>=Date.parse(r.endsAt))throw Error("R21 registration invalid");
  if(Object.keys(r.dependencies).sort().join("\0")!=="R15\0R16\0R17\0R18\0R19\0R20"||!Object.values(r.dependencies).every(isDigest)||canonicalSemanticJson(r.dependencies)!==canonicalSemanticJson(t.dependencyEvidence))throw Error("R21 dependency evidence invalid");
  const submittedPolicy={regions:r.regions,slos:r.slos,rampConcurrency:r.rampConcurrency,soakDurationMs:r.soakDurationMs,rpoTargetMs:r.rpoTargetMs,rtoTargetMs:r.rtoTargetMs,minimumDistinctBillingAuthorities:r.minimumDistinctBillingAuthorities,minimumUnfamiliarOperators:r.minimumUnfamiliarOperators};
  const trustedBase={regions:t.policy.regions,slos:t.policy.slos,rampConcurrency:t.policy.rampConcurrency,soakDurationMs:t.policy.soakDurationMs,rpoTargetMs:t.policy.rpoTargetMs,rtoTargetMs:t.policy.rtoTargetMs,minimumDistinctBillingAuthorities:t.policy.minimumDistinctBillingAuthorities,minimumUnfamiliarOperators:t.policy.minimumUnfamiliarOperators};
  if(canonicalSemanticJson(submittedPolicy)!==canonicalSemanticJson(trustedBase)||r.topologyDigest!==t.policy.topologyDigest||!t.policy.billing.currency||!t.policy.billing.usageUnit||t.policy.billing.accountingMethod!=="sum-authenticated-service-observations")throw Error("R21 normative policy mismatch");
  signature(signableR21Registration(r),r.registrationAuthority,"registration");
  if(!t.registrationKeys.map(fingerprint).includes(fingerprint(r.registrationAuthority.publicKeyPem))||Date.parse(r.registrationAuthority.signedAt)>Date.parse(r.startsAt))throw Error("R21 registration trust invalid");
  for(const s of c.services){exact(s,["schema","campaignId","service","region","phase","concurrency","topologyDigest","workloadDigest","endpointDigest","telemetryArtifactDigest","samples","successes","p95Ms","errorBudgetBurn","totalCost","currency","usageUnit","startedAt","completedAt","observedAt"],"service evidence");const slo=r.slos.find(x=>x.service===s.service),duration=Date.parse(s.completedAt)-Date.parse(s.startedAt),workloadKey=`${s.phase}:${s.concurrency}`;
    if(s.schema!=="autonomy.r21-service-observation.v1"||s.campaignId!==r.campaignId||!slo||!r.regions.includes(s.region)||s.topologyDigest!==t.policy.topologyDigest||s.workloadDigest!==t.policy.workloadDigests[workloadKey]||s.currency!==t.policy.billing.currency||s.usageUnit!==t.policy.billing.usageUnit||![s.workloadDigest,s.endpointDigest,s.telemetryArtifactDigest].every(isDigest)||!t.verifyTelemetry(s)||!Number.isSafeInteger(s.samples)||s.samples<slo.minimumSamples||!Number.isSafeInteger(s.successes)||s.successes<0||s.successes>s.samples||s.successes/s.samples<slo.availabilityTarget||s.p95Ms<0||s.p95Ms>slo.p95TargetMs||s.errorBudgetBurn<0||s.errorBudgetBurn>slo.maximumErrorBudgetBurn||s.totalCost<0||s.totalCost/s.samples>slo.maximumCostPerRequest||!date(s.startedAt)||!date(s.completedAt)||!date(s.observedAt)||Date.parse(s.startedAt)<Date.parse(r.startsAt)||Date.parse(s.observedAt)>Date.parse(r.endsAt)||Date.parse(s.completedAt)>Date.parse(s.observedAt)||(s.phase==="ramp"?!r.rampConcurrency.includes(s.concurrency):s.concurrency!==r.rampConcurrency.at(-1)||duration<r.soakDurationMs))throw Error("R21 service SLO evidence invalid");}
  const expectedServiceCells=RUNTIME_SERVICES.flatMap(service=>r.regions.flatMap(region=>[...r.rampConcurrency.map(concurrency=>`${service}:${region}:ramp:${concurrency}`),`${service}:${region}:soak:${r.rampConcurrency.at(-1)}`])),serviceCells=c.services.map(s=>`${s.service}:${s.region}:${s.phase}:${s.concurrency}`);
  if(serviceCells.length!==expectedServiceCells.length||new Set(serviceCells).size!==serviceCells.length||canonicalSemanticJson([...serviceCells].sort())!==canonicalSemanticJson([...expectedServiceCells].sort()))throw Error("R21 service matrix incomplete");
  for(const f of c.faults){exact(f,["schema","campaignId","fault","topologyDigest","targetDigest","injectionArtifactDigest","recoveryArtifactDigest","recoveryCutDigest","region","beforeStateDigest","afterStateDigest","faultAt","recoveryPointAt","lastAcknowledgedSequence","recoveredSequence","distinctProcessOrRegion","rpoMs","rtoMs","revokedPreserved","acknowledgedEffectsPreserved","startedAt","recoveredAt"],"fault evidence");const derivedRto=Date.parse(f.recoveredAt)-Date.parse(f.startedAt),derivedRpo=Date.parse(f.faultAt)-Date.parse(f.recoveryPointAt);
    if(f.schema!=="autonomy.r21-fault-observation.v1"||f.campaignId!==r.campaignId||!r.regions.includes(f.region)||f.topologyDigest!==t.policy.topologyDigest||![f.targetDigest,f.injectionArtifactDigest,f.recoveryArtifactDigest,f.recoveryCutDigest,f.beforeStateDigest,f.afterStateDigest].every(isDigest)||!t.verifyFault(f)||!f.distinctProcessOrRegion||f.rpoMs!==derivedRpo||f.rtoMs!==derivedRto||f.rpoMs<0||f.rpoMs>r.rpoTargetMs||f.rtoMs<0||f.rtoMs>r.rtoTargetMs||!Number.isSafeInteger(f.lastAcknowledgedSequence)||!Number.isSafeInteger(f.recoveredSequence)||f.recoveredSequence<f.lastAcknowledgedSequence||!f.revokedPreserved||!f.acknowledgedEffectsPreserved||!date(f.startedAt)||!date(f.recoveredAt)||!date(f.faultAt)||!date(f.recoveryPointAt)||Date.parse(f.startedAt)<Date.parse(r.startsAt)||Date.parse(f.recoveryPointAt)<Date.parse(r.startsAt)||Date.parse(f.startedAt)>Date.parse(f.recoveryPointAt)||Date.parse(f.recoveryPointAt)>Date.parse(f.faultAt)||Date.parse(f.faultAt)>Date.parse(f.recoveredAt)||Date.parse(f.recoveredAt)>Date.parse(r.endsAt))throw Error("R21 fault evidence invalid");}
  const expectedFaultCells=FAULTS.flatMap(f=>r.regions.map(region=>`${f}:${region}`)),faultCells=c.faults.map(f=>`${f.fault}:${f.region}`);if(faultCells.length!==expectedFaultCells.length||new Set(faultCells).size!==faultCells.length||canonicalSemanticJson([...faultCells].sort())!==canonicalSemanticJson([...expectedFaultCells].sort()))throw Error("R21 fault matrix incomplete");
  for(const x of c.lifecycle){exact(x,["schema","campaignId","operation","service","topologyDigest","beforeDigest","afterDigest","auditDigest","completedAt"],"lifecycle evidence");if(x.schema!=="autonomy.r21-lifecycle-observation.v1"||x.campaignId!==r.campaignId||x.topologyDigest!==t.policy.topologyDigest||![x.beforeDigest,x.afterDigest,x.auditDigest].every(isDigest)||x.beforeDigest===x.afterDigest||!t.verifyLifecycle(x)||!date(x.completedAt)||Date.parse(x.completedAt)<Date.parse(r.startsAt)||Date.parse(x.completedAt)>Date.parse(r.endsAt))throw Error("R21 lifecycle evidence invalid");}
  const expectedLifecycle=LIFECYCLE.flatMap(operation=>RUNTIME_SERVICES.map(service=>`${operation}:${service}`)),lifecycleCells=c.lifecycle.map(x=>`${x.operation}:${x.service}`);if(lifecycleCells.length!==expectedLifecycle.length||new Set(lifecycleCells).size!==lifecycleCells.length||canonicalSemanticJson([...lifecycleCells].sort())!==canonicalSemanticJson([...expectedLifecycle].sort()))throw Error("R21 lifecycle matrix incomplete");
  for(const b of c.billing){exact(b,["schema","campaignId","service","authority","provider","currency","unit","usage","amount","invoiceArtifactDigest","observedAt"],"billing evidence");if(b.schema!=="autonomy.r21-billing-observation.v1"||b.campaignId!==r.campaignId||t.policy.billing.authorities[b.authority]!==b.provider||b.currency!==t.policy.billing.currency||b.unit!==t.policy.billing.usageUnit||b.usage<0||b.amount<0||!isDigest(b.invoiceArtifactDigest)||!t.verifyBilling(b)||!date(b.observedAt)||Date.parse(b.observedAt)<Date.parse(r.startsAt)||Date.parse(b.observedAt)>Date.parse(r.endsAt))throw Error("R21 billing evidence invalid");}
  const billingKeyIds=new Set(c.billing.map(x=>fingerprint(t.billingAuthorityKeys[x.authority]??"")));if(c.billing.length!==RUNTIME_SERVICES.length||new Set(c.billing.map(x=>x.service)).size!==RUNTIME_SERVICES.length||billingKeyIds.has("invalid")||billingKeyIds.size<r.minimumDistinctBillingAuthorities||new Set(c.billing.map(x=>x.provider)).size<r.minimumDistinctBillingAuthorities||RUNTIME_SERVICES.some(service=>{const rows=c.services.filter(s=>s.service===service),bill=c.billing.find(b=>b.service===service);return !bill||bill.amount!==rows.reduce((n,x)=>n+x.totalCost,0)||bill.usage!==rows.reduce((n,x)=>n+x.samples,0)}))throw Error("R21 billing matrix incomplete");
  for(const o of c.operators){exact(o,["schema","campaignId","operatorId","unfamiliarityAttestationDigest","alertDigest","diagnosisDigest","runbookDigest","recoveryDigest","startedAt","completedAt","outcome","operatorSignature","custodianSignature"],"operator evidence");if(o.schema!=="autonomy.r21-operator-observation.v1"||o.campaignId!==r.campaignId||![o.unfamiliarityAttestationDigest,o.alertDigest,o.diagnosisDigest,o.runbookDigest,o.recoveryDigest].every(isDigest)||o.outcome!=="recovered"||!date(o.startedAt)||!date(o.completedAt)||Date.parse(o.startedAt)<Date.parse(r.startsAt)||Date.parse(o.completedAt)>Date.parse(r.endsAt)||Date.parse(o.startedAt)>Date.parse(o.completedAt))throw Error("R21 operator evidence invalid");signature(signableR21Operator(o,"operatorSignature"),o.operatorSignature,"operator");signature(signableR21Operator(o,"custodianSignature"),o.custodianSignature,"custodian");if(fingerprint(t.operatorKeys[o.operatorId]??"")!==fingerprint(o.operatorSignature.publicKeyPem)||!t.custodianKeys.map(fingerprint).includes(fingerprint(o.custodianSignature.publicKeyPem))||Date.parse(o.operatorSignature.signedAt)<Date.parse(o.completedAt)||Date.parse(o.custodianSignature.signedAt)<Date.parse(o.operatorSignature.signedAt)||Date.parse(o.custodianSignature.signedAt)>Date.parse(r.endsAt))throw Error("R21 operator trust invalid");}
  if(new Set(c.operators.map(x=>x.operatorId)).size<r.minimumUnfamiliarOperators)throw Error("R21 operator matrix incomplete");
  signature(signableR21Campaign(c),c.collector,"collector");const latest=Math.max(...c.services.map(x=>Date.parse(x.observedAt)),...c.faults.map(x=>Date.parse(x.recoveredAt)),...c.lifecycle.map(x=>Date.parse(x.completedAt)),...c.billing.map(x=>Date.parse(x.observedAt)),...c.operators.map(x=>Date.parse(x.custodianSignature.signedAt)));if(!t.collectorKeys.map(fingerprint).includes(fingerprint(c.collector.publicKeyPem))||fingerprint(c.collector.publicKeyPem)===fingerprint(r.registrationAuthority.publicKeyPem)||Date.parse(c.collector.signedAt)<latest||Date.parse(c.collector.signedAt)>Date.parse(r.endsAt))throw Error("R21 collector trust/time invalid");
  const allKeys=[r.registrationAuthority.publicKeyPem,c.collector.publicKeyPem,...Object.values(t.operatorKeys),...t.custodianKeys,...Object.values(t.billingAuthorityKeys)].map(fingerprint);if(new Set(allKeys).size!==allKeys.length)throw Error("R21 authority keys are not distinct");
  return{status:"R21-external-evidence-verified" as const,closureClaim:true as const,campaignId:r.campaignId,bundleDigest:digest(c)};
}
