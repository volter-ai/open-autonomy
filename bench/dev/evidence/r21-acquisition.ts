import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canonicalSemanticJson, signableR21Campaign, signableR21Operator,
  type R21BillingEvidence, type R21Campaign, type R21FaultEvidence, type R21LifecycleEvidence,
  type R21OperatorEvidence, type R21Registration, type R21ServiceEvidence,
} from "@open-autonomy/core";

type Digest = `sha256:${string}`;
export type R21Category = "services" | "faults" | "lifecycle" | "billing" | "operators";
const CATEGORIES: R21Category[] = ["services", "faults", "lifecycle", "billing", "operators"];
const digest = (value: unknown): Digest => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const exact = (value: object, keys: string[], name: string) => { if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`R21 acquisition ${name} schema invalid`); };
const fp = (pem: string) => createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
const MANIFEST = { version: 1, categories: CATEGORIES, sequence: ["registration", "parallel-exact-cells", "collector-intent", "collection"] };
type Row = R21ServiceEvidence | R21FaultEvidence | R21LifecycleEvidence | R21BillingEvidence | R21OperatorEvidence;

export type R21Request = { schema: "open-autonomy.bench-r21-acquisition-request.v1"; checkpoint: "R21"; campaignId: string;
  action: "registration" | "evidence" | "collector-intent" | "collection"; category: R21Category | null; cellId: string; signerId: string;
  manifestDigest: Digest; ordinal: number; descriptorDigest: Digest | null; prerequisiteDigests: Digest[]; candidateDigest: Digest | null };
export type R21Response = { schema: "open-autonomy.bench-r21-acquisition-response.v1"; requestDigest: Digest; fragmentDigest: Digest;
  signerKeyId: string; signedAt: string; signature: string; fragment: unknown };
type Exchange = { request: R21Request; response?: R21Response };
export type R21State = { schema: "open-autonomy.bench-r21-acquisition-state.v1"; checkpoint: "R21"; campaignId: string; createdAt: string;
  manifestDigest: Digest; registrationKeyId: string; collectorKeyId: string; telemetryKeyId: string; faultKeyId: string; lifecycleKeyId: string;
  custodianKeyId: string; billingKeyIds: Record<string, string>; billingAssignments: Record<string, string>; operatorKeyIds: Record<string, string>;
  publicKeys: Record<string, string>; registration?: Exchange; evidence: Record<R21Category, Record<string, Exchange>>;
  collectorIntent?: Exchange; collection?: Exchange; assembledBundleDigest: Digest | null };

function registry(s: Pick<R21State,"registrationKeyId"|"collectorKeyId"|"telemetryKeyId"|"faultKeyId"|"lifecycleKeyId"|"custodianKeyId"|"billingKeyIds"|"billingAssignments"|"operatorKeyIds"|"publicKeys">) {
  const ids = [s.registrationKeyId,s.collectorKeyId,s.telemetryKeyId,s.faultKeyId,s.lifecycleKeyId,s.custodianKeyId,...Object.values(s.billingKeyIds),...Object.values(s.operatorKeyIds)];
  if (!Object.keys(s.billingKeyIds).length || !Object.keys(s.operatorKeyIds).length || ids.some((id)=>!id||!s.publicKeys[id]) || new Set(ids).size!==ids.length)
    throw Error("R21 acquisition authority registry incomplete or aliased");
  let fingerprints:string[]; try { fingerprints=ids.map((id)=>fp(s.publicKeys[id]!)); } catch { throw Error("R21 acquisition public key invalid"); }
  if(new Set(fingerprints).size!==fingerprints.length)throw Error("R21 acquisition public keys must be cryptographically distinct");
  if(Object.values(s.billingAssignments).some((authority)=>!s.billingKeyIds[authority]))throw Error("R21 acquisition billing assignment authority missing");
}
function req(s:R21State,x:Omit<R21Request,"schema"|"checkpoint"|"campaignId"|"manifestDigest">):R21Request{return{schema:"open-autonomy.bench-r21-acquisition-request.v1",checkpoint:"R21",campaignId:s.campaignId,manifestDigest:s.manifestDigest,...x}}
function registration(s:R21State){return accepted(s.registration,"registration").fragment as R21Registration}
const cellId=(...parts:Array<string|number>)=>parts.map(x=>encodeURIComponent(String(x))).join("/");
const cellParts=(id:string)=>id.split("/").map(x=>decodeURIComponent(x));
function serviceId(x:{service:string;region:string;phase:string;concurrency:number}){return cellId(x.service,x.region,x.phase,x.concurrency)}
function faultId(x:{fault:string;region:string}){return cellId(x.fault,x.region)}
function lifecycleId(x:{operation:string;service:string}){return cellId(x.operation,x.service)}
export function expectedR21Cells(s:R21State,r=registration(s)):Record<R21Category,string[]>{
  const services=r.services.flatMap(service=>r.regions.flatMap(region=>[...r.rampConcurrency.map(concurrency=>serviceId({service,region,phase:"ramp",concurrency})),serviceId({service,region,phase:"soak",concurrency:r.rampConcurrency.at(-1)!})]));
  return{services,faults:r.faults.flatMap(fault=>r.regions.map(region=>faultId({fault,region}))),lifecycle:r.lifecycle.flatMap(operation=>r.services.map(service=>lifecycleId({operation,service}))),
    billing:r.services.map(x=>cellId(x)),operators:Object.keys(s.operatorKeyIds).sort().map(x=>cellId(x))};
}
function signer(s:R21State,category:R21Category|null,cellId:string){if(category===null)return cellId==="registration"?s.registrationKeyId:s.collectorKeyId;
  if(category==="services")return s.telemetryKeyId;if(category==="faults")return s.faultKeyId;if(category==="lifecycle")return s.lifecycleKeyId;
  if(category==="billing")return s.billingKeyIds[s.billingAssignments[cellParts(cellId)[0]!]!]!;return s.custodianKeyId}
function validateRequest(s:R21State,x:R21Request){exact(x,["schema","checkpoint","campaignId","action","category","cellId","signerId","manifestDigest","ordinal","descriptorDigest","prerequisiteDigests","candidateDigest"],"request");
  if(x.schema!=="open-autonomy.bench-r21-acquisition-request.v1"||x.checkpoint!=="R21"||x.campaignId!==s.campaignId||x.manifestDigest!==s.manifestDigest||!x.signerId||
    !Number.isSafeInteger(x.ordinal)||x.ordinal<0||!x.prerequisiteDigests.every(v=>/^sha256:[a-f0-9]{64}$/.test(v))||(x.descriptorDigest!==null&&!/^sha256:[a-f0-9]{64}$/.test(x.descriptorDigest))||
    (x.candidateDigest!==null&&!/^sha256:[a-f0-9]{64}$/.test(x.candidateDigest))||!signer(s,x.category,x.cellId))throw Error("R21 acquisition request invalid")}
function validateResponse(s:R21State,e:Exchange){const x=e.response;if(!x)return;exact(x,["schema","requestDigest","fragmentDigest","signerKeyId","signedAt","signature","fragment"],"response");const keyId=signer(s,e.request.category,e.request.cellId);
  if(x.schema!=="open-autonomy.bench-r21-acquisition-response.v1"||x.requestDigest!==digest(e.request)||x.fragmentDigest!==digest(x.fragment)||x.signerKeyId!==keyId||!Number.isFinite(Date.parse(x.signedAt))||Date.parse(x.signedAt)<Date.parse(s.createdAt))throw Error("R21 acquisition response binding invalid");
  const body={schema:x.schema,requestDigest:x.requestDigest,fragmentDigest:x.fragmentDigest,signerKeyId:x.signerKeyId,signedAt:x.signedAt};if(!verify(null,Buffer.from(canonicalSemanticJson(body)),s.publicKeys[keyId]!,Buffer.from(x.signature,"base64")))throw Error("R21 acquisition response signature invalid")}
function accept(s:R21State,e:Exchange,x:R21Response){if(s.assembledBundleDigest)throw Error("R21 acquisition already assembled");if(e.response&&canonicalSemanticJson(e.response)!==canonicalSemanticJson(x))throw Error("R21 acquisition equivocation rejected");validateResponse(s,{request:e.request,response:x});e.response=x;return digest(x)}
const accepted=(e:Exchange|undefined,n:string)=>{if(!e?.response)throw Error(`R21 acquisition ${n} response missing`);return e.response};

export function createR21State(input:Omit<R21State,"schema"|"checkpoint"|"manifestDigest"|"registration"|"evidence"|"collectorIntent"|"collection"|"assembledBundleDigest">):R21State{
  if(!input.campaignId||!Number.isFinite(Date.parse(input.createdAt)))throw Error("R21 acquisition identity invalid");registry(input);
  return{...input,schema:"open-autonomy.bench-r21-acquisition-state.v1",checkpoint:"R21",manifestDigest:digest(MANIFEST),evidence:{services:{},faults:{},lifecycle:{},billing:{},operators:{}},assembledBundleDigest:null}}
export function issueR21Registration(s:R21State){assertR21State(s);const expected=req(s,{action:"registration",category:null,cellId:"registration",signerId:"registration-authority",ordinal:0,descriptorDigest:null,prerequisiteDigests:[],candidateDigest:null});s.registration??={request:expected};return s.registration.request}
function validateRegistration(s:R21State,r:R21Registration){if(!r||r.campaignId!==s.campaignId||r.registrationAuthority?.publicKeyPem!==s.publicKeys[s.registrationKeyId])throw Error("R21 acquisition registration fragment invalid");
  if(canonicalSemanticJson(Object.keys(s.billingAssignments).sort())!==canonicalSemanticJson([...r.services].sort())||new Set(Object.values(s.billingAssignments)).size<r.minimumDistinctBillingAuthorities||Object.keys(s.operatorKeyIds).length<r.minimumUnfamiliarOperators)throw Error("R21 acquisition external assignment registry incomplete")}
export function acceptR21Registration(s:R21State,x:R21Response){assertR21State(s);if(!s.registration)throw Error("R21 acquisition registration request missing");validateRegistration(s,x.fragment as R21Registration);return accept(s,s.registration,x)}
function descriptor(s:R21State,c:R21Category,id:string,r=registration(s)):unknown{if(c==="services"){const [service,region,phase,n]=cellParts(id);return{service,region,phase,concurrency:Number(n)}}if(c==="faults"){const[fault,region]=cellParts(id);return{fault,region}}
  if(c==="lifecycle"){const[operation,service]=cellParts(id);return{operation,service}}if(c==="billing"){const service=cellParts(id)[0]!;return{service,authority:s.billingAssignments[service]}}return{operatorId:cellParts(id)[0]}}
export function issueR21Evidence(s:R21State,c:R21Category,id:string){assertR21State(s);const rr=accepted(s.registration,"registration"),cells=expectedR21Cells(s),ordinal=cells[c].indexOf(id);if(ordinal<0)throw Error("R21 acquisition cell is not preregistered");
  const d:any=descriptor(s,c,id),expected=req(s,{action:"evidence",category:c,cellId:id,signerId:c==="billing"?d.authority:c==="operators"?d.operatorId:`${c}-authority`,ordinal:ordinal+1,descriptorDigest:digest(d),prerequisiteDigests:[digest(rr)],candidateDigest:null}),existing=s.evidence[c][id];
  if(existing&&canonicalSemanticJson(existing.request)!==canonicalSemanticJson(expected))throw Error("R21 acquisition evidence request drift");s.evidence[c][id]??={request:expected};return s.evidence[c][id]!.request}
function validateRow(s:R21State,c:R21Category,id:string,row:any){const r=registration(s),d:any=descriptor(s,c,id);if(!row||row.campaignId!==s.campaignId||row.topologyDigest!==undefined&&row.topologyDigest!==r.topologyDigest)throw Error("R21 acquisition evidence fragment invalid");
  if(c==="services"&&(row.service!==d.service||row.region!==d.region||row.phase!==d.phase||row.concurrency!==d.concurrency)||c==="faults"&&(row.fault!==d.fault||row.region!==d.region)||
    c==="lifecycle"&&(row.operation!==d.operation||row.service!==d.service)||c==="billing"&&(row.service!==d.service||row.authority!==d.authority)||c==="operators"&&row.operatorId!==d.operatorId)throw Error("R21 acquisition evidence cell substitution");
  if(c==="operators"){const op=row as R21OperatorEvidence,operatorPem=s.publicKeys[s.operatorKeyIds[id]!]!,custodianPem=s.publicKeys[s.custodianKeyId]!;
    if(op.operatorSignature?.publicKeyPem!==operatorPem||op.custodianSignature?.publicKeyPem!==custodianPem||!verify(null,Buffer.from(canonicalSemanticJson(signableR21Operator(op,"operatorSignature"))),operatorPem,Buffer.from(op.operatorSignature?.signature??"","base64"))||
      !verify(null,Buffer.from(canonicalSemanticJson(signableR21Operator(op,"custodianSignature"))),custodianPem,Buffer.from(op.custodianSignature?.signature??"","base64")))throw Error("R21 acquisition operator signatures invalid")}}
export function acceptR21Evidence(s:R21State,c:R21Category,id:string,x:R21Response){assertR21State(s);const e=s.evidence[c]?.[id];if(!e)throw Error("R21 acquisition evidence request missing");validateRow(s,c,id,x.fragment);return accept(s,e,x)}
function rows(s:R21State,c:R21Category){return expectedR21Cells(s)[c].map(id=>accepted(s.evidence[c][id],`${c} ${id}`).fragment as Row)}
type CollectorIntent=Omit<R21Campaign["collector"],"signature">;
export function issueR21CollectorIntent(s:R21State){assertR21State(s);const all=CATEGORIES.flatMap(c=>rows(s,c)),expected=req(s,{action:"collector-intent",category:null,cellId:"collector-intent",signerId:"collector",ordinal:0,descriptorDigest:null,prerequisiteDigests:all.map((_,i)=>{const flat=CATEGORIES.flatMap(c=>expectedR21Cells(s)[c].map(id=>s.evidence[c][id]!));return digest(flat[i]!.response!)}),candidateDigest:null});s.collectorIntent??={request:expected};return s.collectorIntent.request}
function validateIntent(s:R21State,x:CollectorIntent){if(!x||Object.keys(x).sort().join()!=="publicKeyPem,signedAt,signerId"||x.publicKeyPem!==s.publicKeys[s.collectorKeyId]||!x.signerId||!Number.isFinite(Date.parse(x.signedAt)))throw Error("R21 acquisition collector intent invalid")}
export function acceptR21CollectorIntent(s:R21State,x:R21Response){assertR21State(s);if(!s.collectorIntent)throw Error("R21 acquisition collector intent request missing");validateIntent(s,x.fragment as CollectorIntent);return accept(s,s.collectorIntent,x)}
function draft(s:R21State,signature:string):R21Campaign{return{schema:"autonomy.r21-external-campaign.v1",closureClaim:true,registration:registration(s),services:rows(s,"services") as R21ServiceEvidence[],faults:rows(s,"faults") as R21FaultEvidence[],lifecycle:rows(s,"lifecycle") as R21LifecycleEvidence[],billing:rows(s,"billing") as R21BillingEvidence[],operators:rows(s,"operators") as R21OperatorEvidence[],collector:{...(accepted(s.collectorIntent,"collector intent").fragment as CollectorIntent),signature}}}
export function issueR21Collection(s:R21State){assertR21State(s);const expected=req(s,{action:"collection",category:null,cellId:"collection",signerId:"collector",ordinal:0,descriptorDigest:null,prerequisiteDigests:[digest(accepted(s.collectorIntent,"collector intent"))],candidateDigest:digest(signableR21Campaign(draft(s,"")))});s.collection??={request:expected};return s.collection.request}
function validateCollection(s:R21State,x:any){const c=draft(s,x?.campaignSignature??""),pem=s.publicKeys[s.collectorKeyId]!;if(!x||Object.keys(x).join()!=="campaignSignature"||!verify(null,Buffer.from(canonicalSemanticJson(signableR21Campaign(c))),pem,Buffer.from(x.campaignSignature??"","base64")))throw Error("R21 acquisition campaign signature invalid")}
export function acceptR21Collection(s:R21State,x:R21Response){assertR21State(s);if(!s.collection)throw Error("R21 acquisition collection request missing");validateCollection(s,x.fragment);return accept(s,s.collection,x)}
export function assembleR21(s:R21State){assertR21State(s);const signature=(accepted(s.collection,"collection").fragment as any).campaignSignature,c=draft(s,signature),d=digest(c);if(s.assembledBundleDigest&&s.assembledBundleDigest!==d)throw Error("R21 acquisition assembly drift");s.assembledBundleDigest=d;return c}

export function assertR21State(s:R21State){exact(s,["schema","checkpoint","campaignId","createdAt","manifestDigest","registrationKeyId","collectorKeyId","telemetryKeyId","faultKeyId","lifecycleKeyId","custodianKeyId","billingKeyIds","billingAssignments","operatorKeyIds","publicKeys","registration","evidence","collectorIntent","collection","assembledBundleDigest"].filter(x=>x in s),"state");
  if(s.schema!=="open-autonomy.bench-r21-acquisition-state.v1"||s.checkpoint!=="R21"||!s.campaignId||!Number.isFinite(Date.parse(s.createdAt))||s.manifestDigest!==digest(MANIFEST))throw Error("R21 acquisition state invalid");registry(s);if(Object.keys(s.evidence).sort().join()!==[...CATEGORIES].sort().join())throw Error("R21 acquisition category registry invalid");
  const check=(e:Exchange|undefined)=>{if(!e)return;validateRequest(s,e.request);validateResponse(s,e)};check(s.registration);for(const c of CATEGORIES)Object.values(s.evidence[c]).forEach(check);check(s.collectorIntent);check(s.collection);
  if(s.registration){const er=req(s,{action:"registration",category:null,cellId:"registration",signerId:"registration-authority",ordinal:0,descriptorDigest:null,prerequisiteDigests:[],candidateDigest:null});if(canonicalSemanticJson(s.registration.request)!==canonicalSemanticJson(er))throw Error("R21 acquisition registration request drift");
    if(s.registration.response){validateRegistration(s,s.registration.response.fragment as R21Registration);const cells=expectedR21Cells(s);for(const c of CATEGORIES)for(const[id,e]of Object.entries(s.evidence[c])){const ordinal=cells[c].indexOf(id),d:any=descriptor(s,c,id);if(ordinal<0)throw Error("R21 acquisition unregistered stored cell");const expected=req(s,{action:"evidence",category:c,cellId:id,signerId:c==="billing"?d.authority:c==="operators"?d.operatorId:`${c}-authority`,ordinal:ordinal+1,descriptorDigest:digest(d),prerequisiteDigests:[digest(s.registration.response)],candidateDigest:null});if(canonicalSemanticJson(e.request)!==canonicalSemanticJson(expected))throw Error("R21 acquisition evidence request drift");if(e.response)validateRow(s,c,id,e.response.fragment)}}else if(CATEGORIES.some(c=>Object.keys(s.evidence[c]).length))throw Error("R21 acquisition evidence before registration")}
  if(s.collectorIntent){const all=CATEGORIES.flatMap(c=>rows(s,c)),flat=CATEGORIES.flatMap(c=>expectedR21Cells(s)[c].map(id=>s.evidence[c][id]!)),expected=req(s,{action:"collector-intent",category:null,cellId:"collector-intent",signerId:"collector",ordinal:0,descriptorDigest:null,prerequisiteDigests:all.map((_,i)=>digest(flat[i]!.response!)),candidateDigest:null});if(canonicalSemanticJson(s.collectorIntent.request)!==canonicalSemanticJson(expected))throw Error("R21 acquisition collector intent drift");if(s.collectorIntent.response)validateIntent(s,s.collectorIntent.response.fragment as CollectorIntent)}
  if(s.collection){const expected=req(s,{action:"collection",category:null,cellId:"collection",signerId:"collector",ordinal:0,descriptorDigest:null,prerequisiteDigests:[digest(accepted(s.collectorIntent,"collector intent"))],candidateDigest:digest(signableR21Campaign(draft(s,"")))});if(canonicalSemanticJson(s.collection.request)!==canonicalSemanticJson(expected))throw Error("R21 acquisition collection request drift");if(s.collection.response)validateCollection(s,s.collection.response.fragment)}
  if(s.assembledBundleDigest!==null){const sig=(accepted(s.collection,"collection").fragment as any).campaignSignature;if(s.assembledBundleDigest!==digest(draft(s,sig)))throw Error("R21 acquisition assembled state invalid")}return s}
export function saveR21State(path:string,s:R21State){assertR21State(s);saveR21Json(path,s)}
export function saveR21Json(path:string,value:unknown){const target=resolve(path),temp=`${target}.tmp-${process.pid}`;writeFileSync(temp,`${canonicalSemanticJson(value)}\n`,{flag:"wx",mode:0o600});const fd=openSync(temp,"r");try{fsyncSync(fd)}finally{closeSync(fd)}renameSync(temp,target);const dir=openSync(dirname(target),"r");try{fsyncSync(dir)}finally{closeSync(dir)}}
export function loadR21State(path:string){return assertR21State(JSON.parse(readFileSync(path,"utf8")) as R21State)}
