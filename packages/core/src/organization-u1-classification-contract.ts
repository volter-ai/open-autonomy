import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type U1Decision = "in-domain" | "out-of-domain";
export type U1ReviewerRole = "primary" | "independent" | "adjudicator";
export type Sha256Digest = `sha256:${string}`;
export type U1ModelIdentityPolicy = { role: U1ReviewerRole; authorityId: string; provider: string; model: string; modelRevision: string; promptDigest: Sha256Digest; toolPolicyDigest: Sha256Digest };
export type U1RawByteEvidence = { digest: Sha256Digest; byteLength: number; evidenceUri: string };
export type U1RawModelCustody = {
  runId: string; role: U1ReviewerRole; authorityId: string; provider: string; model: string; modelRevision: string;
  promptDigest: Sha256Digest; toolPolicyDigest: Sha256Digest; inputDigest: Sha256Digest;
  rawRequest: U1RawByteEvidence; rawResponse: U1RawByteEvidence; startedAt: string; completedAt: string;
};
export type U1ClassificationContract = {
  schema: "open-autonomy.u1-classification-contract.v1"; id: string; campaignId: string; domainPredicate: string;
  inputJoins: { censusContractDigest: Sha256Digest; forcingSupplementDigest: Sha256Digest; samplingFrameDigest: Sha256Digest; repositoryEvidenceDigest: Sha256Digest };
  identities: { authorityId: string; authenticationPolicyDigest: Sha256Digest };
  reviewers: [U1ModelIdentityPolicy, U1ModelIdentityPolicy, U1ModelIdentityPolicy];
  custody: { exactRawRequestBytesRequired: true; exactRawResponseBytesRequired: true; digestAlgorithm: "sha256"; blindIndependentReview: true; distinctAuthorities: true };
  batching: { primaryBatchSize: number; independentBatchSize: number; adjudicationBatchSize: number; order: "ascending-utf8-node-id"; maximumAttemptsPerBatch: number; retry: "same-input-digest-same-members-restart-batch" };
  evidence: { commitPinned: true; acceptedKinds: ["readme", "license", "manifest", "documentation", "source"]; requireAtLeastOnePrimaryRepositoryDocument: true; movingBranchUrlsForbidden: true; exactBodyDigestRequired: true };
  review: { primaryCoverage: "every-sampling-frame-member"; primaryInDomainReview: "all"; outDomainRankDomain: "open-autonomy.u1.out-domain-review.v1"; outDomainReviewDivisor: 100; outDomainReviewCardinality: "ceil-count-over-divisor"; order: "ascending-unsigned-digest-bytes-then-ascending-utf8-node-id"; withoutReplacement: true };
  conflicts: { queue: "every-primary-independent-disagreement"; adjudication: "distinct-third-authority-required" };
  forcing: { protocol: "same-primary-independent-and-adjudication-protocol"; populationWeight: 0; outOfDomain: "invalidate-campaign"; overlapIdentity: "github-node-id" };
  postResultExclusion: "forbidden";
};
export type FrozenU1ClassificationContract = U1ClassificationContract & { digest: Sha256Digest };
export type U1PrimaryDecision = { nodeId: string; decision: U1Decision };
export type U1IndependentDecision = { nodeId: string; decision: U1Decision };
export type U1Adjudication = { nodeId: string; decision: U1Decision };
export type U1BatchAttempt = { role: U1ReviewerRole; batchIndex: number; attempt: number; nodeIds: string[]; inputDigest: Sha256Digest };
export type U1IdentityJoin = { schema: "open-autonomy.u1-identity-join.v1"; kind: "sampling-frame"|"forcing-supplement"; sourceDigest: Sha256Digest; authorityId: string; authenticationDigest: Sha256Digest; nodeIds: string[]; digest: Sha256Digest };

const exactKeys = (v: object, keys: string[]) => canonicalSemanticJson(Object.keys(v).sort()) === canonicalSemanticJson([...keys].sort());
const validDigest = (v: unknown): v is Sha256Digest => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const validDecision = (v: unknown): v is U1Decision => v === "in-domain" || v === "out-of-domain";
const utf8 = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b));
const semanticDigest = (domain: string, v: unknown): Sha256Digest => `sha256:${createHash("sha256").update(`${domain}\0${canonicalSemanticJson(v)}`).digest("hex")}`;
const reviewerKeys = ["role", "authorityId", "provider", "model", "modelRevision", "promptDigest", "toolPolicyDigest"];
const expectedKinds = ["readme", "license", "manifest", "documentation", "source"] as const;

export function freezeU1ClassificationContract(v: U1ClassificationContract): FrozenU1ClassificationContract {
  const roles = v.reviewers.map(x => x.role), authorities = v.reviewers.map(x => x.authorityId);
  const reviewerValid = (x: U1ModelIdentityPolicy) => exactKeys(x, reviewerKeys) && !!x.authorityId && !!x.provider && !!x.model && !!x.modelRevision && validDigest(x.promptDigest) && validDigest(x.toolPolicyDigest);
  if (v.schema !== "open-autonomy.u1-classification-contract.v1" || !v.id || !v.campaignId || !v.domainPredicate ||
    !exactKeys(v,["schema","id","campaignId","domainPredicate","inputJoins","identities","reviewers","custody","batching","evidence","review","conflicts","forcing","postResultExclusion"]) ||
    !exactKeys(v.inputJoins,["censusContractDigest","forcingSupplementDigest","samplingFrameDigest","repositoryEvidenceDigest"]) || Object.values(v.inputJoins).some(x=>!validDigest(x)) ||
    !exactKeys(v.identities,["authorityId","authenticationPolicyDigest"]) || !v.identities.authorityId || !validDigest(v.identities.authenticationPolicyDigest) ||
    canonicalSemanticJson(roles)!==canonicalSemanticJson(["primary","independent","adjudicator"]) || new Set(authorities).size!==3 || v.reviewers.some(x=>!reviewerValid(x)) ||
    !exactKeys(v.custody,["exactRawRequestBytesRequired","exactRawResponseBytesRequired","digestAlgorithm","blindIndependentReview","distinctAuthorities"]) || !v.custody.exactRawRequestBytesRequired || !v.custody.exactRawResponseBytesRequired || v.custody.digestAlgorithm!=="sha256" || !v.custody.blindIndependentReview || !v.custody.distinctAuthorities ||
    !exactKeys(v.batching,["primaryBatchSize","independentBatchSize","adjudicationBatchSize","order","maximumAttemptsPerBatch","retry"]) ||
    [v.batching.primaryBatchSize,v.batching.independentBatchSize,v.batching.adjudicationBatchSize,v.batching.maximumAttemptsPerBatch].some(x=>!Number.isSafeInteger(x)||x<1) || v.batching.order!=="ascending-utf8-node-id" || v.batching.retry!=="same-input-digest-same-members-restart-batch" ||
    !exactKeys(v.evidence,["commitPinned","acceptedKinds","requireAtLeastOnePrimaryRepositoryDocument","movingBranchUrlsForbidden","exactBodyDigestRequired"]) || !v.evidence.commitPinned || canonicalSemanticJson(v.evidence.acceptedKinds)!==canonicalSemanticJson(expectedKinds) || !v.evidence.requireAtLeastOnePrimaryRepositoryDocument || !v.evidence.movingBranchUrlsForbidden || !v.evidence.exactBodyDigestRequired ||
    !exactKeys(v.review,["primaryCoverage","primaryInDomainReview","outDomainRankDomain","outDomainReviewDivisor","outDomainReviewCardinality","order","withoutReplacement"]) || v.review.primaryCoverage!=="every-sampling-frame-member" || v.review.primaryInDomainReview!=="all" || v.review.outDomainRankDomain!=="open-autonomy.u1.out-domain-review.v1" || v.review.outDomainReviewDivisor!==100 || v.review.outDomainReviewCardinality!=="ceil-count-over-divisor" || v.review.order!=="ascending-unsigned-digest-bytes-then-ascending-utf8-node-id" || !v.review.withoutReplacement ||
    !exactKeys(v.conflicts,["queue","adjudication"]) || v.conflicts.queue!=="every-primary-independent-disagreement" || v.conflicts.adjudication!=="distinct-third-authority-required" ||
    !exactKeys(v.forcing,["protocol","populationWeight","outOfDomain","overlapIdentity"]) || v.forcing.protocol!=="same-primary-independent-and-adjudication-protocol" || v.forcing.populationWeight!==0 || v.forcing.outOfDomain!=="invalidate-campaign" || v.forcing.overlapIdentity!=="github-node-id" || v.postResultExclusion!=="forbidden") throw Error("U1 classification contract invalid");
  const body=structuredClone(v); return {...body,digest:semanticDigest(v.schema,body)};
}
export function verifyU1ClassificationContract(v: FrozenU1ClassificationContract){const {digest,...body}=v,f=freezeU1ClassificationContract(body);if(digest!==f.digest)throw Error("U1 classification contract digest mismatch");return f;}

export function freezeU1IdentityJoin(contract:FrozenU1ClassificationContract,input:Omit<U1IdentityJoin,"digest">):U1IdentityJoin{
  if(!exactKeys(input,["schema","kind","sourceDigest","authorityId","authenticationDigest","nodeIds"])||input.schema!=="open-autonomy.u1-identity-join.v1"||(input.kind!=="sampling-frame"&&input.kind!=="forcing-supplement")||input.authorityId!==contract.identities.authorityId||input.authenticationDigest!==contract.identities.authenticationPolicyDigest||new Set(input.nodeIds).size!==input.nodeIds.length||input.nodeIds.some(x=>!x)||input.nodeIds.length===0||input.sourceDigest!==(input.kind==="sampling-frame"?contract.inputJoins.samplingFrameDigest:contract.inputJoins.forcingSupplementDigest))throw Error("U1 identity join invalid");
  const body={...structuredClone(input),nodeIds:[...input.nodeIds].sort(utf8)};return{...body,digest:semanticDigest(input.schema,body)};
}
export function verifyU1IdentityJoin(contract:FrozenU1ClassificationContract,input:U1IdentityJoin){const {digest,...body}=input,f=freezeU1IdentityJoin(contract,body);if(digest!==f.digest)throw Error("U1 identity join digest mismatch");return f;}

export function verifyU1RawModelCustody(run: U1RawModelCustody, contract: FrozenU1ClassificationContract, expectedInputDigest: Sha256Digest) {
  const policy=contract.reviewers.find(x=>x.role===run.role);
  const byteEvidence=(x:U1RawByteEvidence)=>exactKeys(x,["digest","byteLength","evidenceUri"])&&validDigest(x.digest)&&Number.isSafeInteger(x.byteLength)&&x.byteLength>=0&&!!x.evidenceUri;
  if(!exactKeys(run,["runId","role","authorityId","provider","model","modelRevision","promptDigest","toolPolicyDigest","inputDigest","rawRequest","rawResponse","startedAt","completedAt"]) || !policy || !run.runId || run.authorityId!==policy.authorityId || run.provider!==policy.provider || run.model!==policy.model || run.modelRevision!==policy.modelRevision || run.promptDigest!==policy.promptDigest || run.toolPolicyDigest!==policy.toolPolicyDigest || run.inputDigest!==expectedInputDigest || !byteEvidence(run.rawRequest) || !byteEvidence(run.rawResponse) || !Number.isFinite(Date.parse(run.startedAt)) || !Number.isFinite(Date.parse(run.completedAt)) || Date.parse(run.completedAt)<Date.parse(run.startedAt)) throw Error("U1 model custody invalid");
  return structuredClone(run);
}

export function rankU1OutDomainNodeIds(contract: FrozenU1ClassificationContract,nodeIds:string[]){if(new Set(nodeIds).size!==nodeIds.length||nodeIds.some(x=>!x))throw Error("out-domain node IDs invalid");return nodeIds.map(nodeId=>({nodeId,digest:createHash("sha256").update(Buffer.concat([Buffer.from(`${contract.review.outDomainRankDomain}\0`),Buffer.from(nodeId)])).digest("hex")})).sort((a,b)=>Buffer.from(a.digest,"hex").compare(Buffer.from(b.digest,"hex"))||utf8(a.nodeId,b.nodeId));}
export function selectU1IndependentReview(contract:FrozenU1ClassificationContract,primary:U1PrimaryDecision[]){validateDecisions(primary,"primary");const inside=primary.filter(x=>x.decision==="in-domain").map(x=>x.nodeId).sort(utf8),outside=primary.filter(x=>x.decision==="out-of-domain").map(x=>x.nodeId);const sampledOut=rankU1OutDomainNodeIds(contract,outside).slice(0,Math.ceil(outside.length/contract.review.outDomainReviewDivisor)).map(x=>x.nodeId);return{inDomain:inside,sampledOut,selected:[...inside,...sampledOut]};}
export function deterministicU1Batches(contract:FrozenU1ClassificationContract,role:U1ReviewerRole,nodeIds:string[]){if(new Set(nodeIds).size!==nodeIds.length||nodeIds.some(x=>!x))throw Error("batch input invalid");const size=role==="primary"?contract.batching.primaryBatchSize:role==="independent"?contract.batching.independentBatchSize:contract.batching.adjudicationBatchSize,sorted=[...nodeIds].sort(utf8);return Array.from({length:Math.ceil(sorted.length/size)},(_,i)=>sorted.slice(i*size,(i+1)*size));}
export function verifyU1BatchRetry(contract:FrozenU1ClassificationContract,previous:U1BatchAttempt,next:U1BatchAttempt){
  const keys=["role","batchIndex","attempt","nodeIds","inputDigest"];
  if(!exactKeys(previous,keys)||!exactKeys(next,keys)||previous.role!==next.role||previous.batchIndex!==next.batchIndex||next.attempt!==previous.attempt+1||next.attempt>contract.batching.maximumAttemptsPerBatch||previous.inputDigest!==next.inputDigest||!validDigest(next.inputDigest)||canonicalSemanticJson(previous.nodeIds)!==canonicalSemanticJson(next.nodeIds)||new Set(next.nodeIds).size!==next.nodeIds.length)throw Error("U1 batch retry invalid");
  return structuredClone(next);
}
function validateDecisions(xs:Array<{nodeId:string;decision:unknown}>,label:string){if(new Set(xs.map(x=>x.nodeId)).size!==xs.length||xs.some(x=>!x.nodeId||!validDecision(x.decision)))throw Error(`${label} decisions invalid`);}
export function deriveU1ConflictQueue(contract:FrozenU1ClassificationContract,primary:U1PrimaryDecision[],independent:U1IndependentDecision[]){void contract;validateDecisions(primary,"primary");validateDecisions(independent,"independent");const p=new Map(primary.map(x=>[x.nodeId,x.decision]));return independent.filter(x=>{const v=p.get(x.nodeId);if(!v)throw Error("independent decision outside primary frame");return v!==x.decision}).map(x=>x.nodeId).sort(utf8);}

export function validateU1Finalization(contract:FrozenU1ClassificationContract,input:{frameIdentity:U1IdentityJoin;primary:U1PrimaryDecision[];independent:U1IndependentDecision[];adjudications:U1Adjudication[];final:Array<{nodeId:string;decision:U1Decision}>;forcingIdentity:U1IdentityJoin;forcingPrimary:U1PrimaryDecision[];forcingIndependent:U1IndependentDecision[];forcingAdjudications:U1Adjudication[];forcingFinal:Array<{nodeId:string;decision:U1Decision}>;excludedAfterResult?:string[]}){
  validateDecisions(input.primary,"primary");validateDecisions(input.independent,"independent");validateDecisions(input.adjudications,"adjudication");validateDecisions(input.final,"final");
  const same=(a:string[],b:string[])=>canonicalSemanticJson([...a].sort(utf8))===canonicalSemanticJson([...b].sort(utf8));
  const frameIdentity=verifyU1IdentityJoin(contract,input.frameIdentity),forcingIdentity=verifyU1IdentityJoin(contract,input.forcingIdentity);
  if(frameIdentity.kind!=="sampling-frame"||forcingIdentity.kind!=="forcing-supplement"||!same(frameIdentity.nodeIds,input.primary.map(x=>x.nodeId))||!same(frameIdentity.nodeIds,input.final.map(x=>x.nodeId)))throw Error("U1 finalization frame invalid");
  const selected=selectU1IndependentReview(contract,input.primary).selected;if(!same(selected,input.independent.map(x=>x.nodeId)))throw Error("U1 finalization review coverage invalid");
  const conflicts=deriveU1ConflictQueue(contract,input.primary,input.independent);if(!same(conflicts,input.adjudications.map(x=>x.nodeId)))throw Error("U1 finalization conflicts invalid");
  const p=new Map(input.primary.map(x=>[x.nodeId,x.decision])),i=new Map(input.independent.map(x=>[x.nodeId,x.decision])),a=new Map(input.adjudications.map(x=>[x.nodeId,x.decision]));
  if(input.final.some(x=>x.decision!==(a.get(x.nodeId)??(i.has(x.nodeId)&&i.get(x.nodeId)===p.get(x.nodeId)?p.get(x.nodeId):p.get(x.nodeId)))))throw Error("U1 final decision provenance invalid");
  validateDecisions(input.forcingPrimary,"forcing primary");validateDecisions(input.forcingIndependent,"forcing independent");validateDecisions(input.forcingAdjudications,"forcing adjudication");validateDecisions(input.forcingFinal,"forcing final");
  const forcingSelected=selectU1IndependentReview(contract,input.forcingPrimary).selected;
  const forcingConflicts=deriveU1ConflictQueue(contract,input.forcingPrimary,input.forcingIndependent);
  if(!same(forcingIdentity.nodeIds,input.forcingPrimary.map(x=>x.nodeId))||!same(forcingSelected,input.forcingIndependent.map(x=>x.nodeId))||!same(forcingIdentity.nodeIds,input.forcingFinal.map(x=>x.nodeId))||!same(forcingConflicts,input.forcingAdjudications.map(x=>x.nodeId))||input.forcingFinal.some(x=>x.decision!=="in-domain")||(input.excludedAfterResult?.length??0)>0)throw Error("U1 forcing or exclusion invalid");
  const fp=new Map(input.forcingPrimary.map(x=>[x.nodeId,x.decision])),fi=new Map(input.forcingIndependent.map(x=>[x.nodeId,x.decision])),fa=new Map(input.forcingAdjudications.map(x=>[x.nodeId,x.decision]));
  if(input.forcingFinal.some(x=>x.decision!==(fa.get(x.nodeId)??(fi.has(x.nodeId)?(fi.get(x.nodeId)===fp.get(x.nodeId)?fp.get(x.nodeId):undefined):fp.get(x.nodeId)))))throw Error("U1 forcing decision provenance invalid");
  const forcingWeights=input.forcingFinal.map(x=>({nodeId:x.nodeId,inFrame:frameIdentity.nodeIds.includes(x.nodeId),populationWeight:frameIdentity.nodeIds.includes(x.nodeId)?1 as const:0 as const}));
  return {conflicts,forcingConflicts,forcingWeights};
}
