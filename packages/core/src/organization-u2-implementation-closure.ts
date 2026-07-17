import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import { U2_EXTERNAL_OBSERVATION_KINDS } from "./organization-u2-population-contract";

const SCHEMA = "open-autonomy.universality-checkpoint-implementation-closure.v1";
const DOMAIN = "open-autonomy.u2-implementation-closure.v1\0";
export const EXPECTED_U2_IMPLEMENTATION_CLOSURE_DIGEST =
  "sha256:9d928ebb5a18c55db1798cb5f6a4af93334f7b5a73e37ac1b05200ed96b02b5b";
const ids = (prefix:string,n:number)=>Array.from({length:n},(_,i)=>`${prefix}${i+1}`);
const exact=(v:unknown,keys:string[],at:string)=>{if(!v||typeof v!=="object"||Array.isArray(v)||JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))throw Error(`U2 closure ${at} schema invalid`);return v as Record<string,unknown>};
const strings=(v:unknown,at:string)=>{if(!Array.isArray(v)||v.some(x=>typeof x!=="string"||x.trim()!==x||!x))throw Error(`U2 closure ${at} invalid`);return v as string[]};
const same=(a:unknown,b:unknown,at:string)=>{if(canonicalSemanticJson(a)!==canonicalSemanticJson(b))throw Error(`U2 closure ${at} invalid`)};

export const U2_IMPLEMENTATION_ANCHORS={
  syntheticPopulationCommit:"5a2b5dbc28536249616d47016174b6ec6776099a",
  syntheticPopulationFileSha256:"sha256:2215899c6c016dcb1e95b87f82b62db0ebc7b73ee3c02652fd0f4e2179dc7677",
  syntheticPopulationCurrentFileSha256:"sha256:32da4a8ef397dff895a5d8d1fb634abb6e8a8f97072e61225f4bd22e179b881f",
  preregistrationContractCommit:"bd8f8356571b7919d1a50e8d144b45ab1b5c771c",
  preregistrationContractFileSha256:"sha256:4a9e0d75718a0e0e42b986a5a4f7940959d66793b1e4c5784150c53f34adf367",
  preregistrationContractCurrentFileSha256:"sha256:4a9e0d75718a0e0e42b986a5a4f7940959d66793b1e4c5784150c53f34adf367",
} as const;
export function digestU2ImplementationClosure(v:Record<string,unknown>){const {digest:_,...body}=v;void _;return `sha256:${createHash("sha256").update(DOMAIN).update(canonicalSemanticJson(body)).digest("hex")}`}
export function verifyU2ImplementationClosure(input:unknown){
  const v=exact(input,["schema","checkpoint","status","scope","claimDigest","implementationAnchors","obligations","externalDeferred","accounting","prohibitedClaims","skepticalReview","downstreamBoundary","nextImplementation","nextExternal","digest"],"root");
  if(v.schema!==SCHEMA||v.checkpoint!=="U2"||v.status!=="implementation-complete-external-validation-deferred")throw Error("U2 closure identity invalid");
  if(typeof v.scope!=="string"||typeof v.claimDigest!=="string"||!/^sha256:[0-9a-f]{64}$/.test(v.claimDigest))throw Error("U2 closure anchors invalid");
  same(exact(v.implementationAnchors,Object.keys(U2_IMPLEMENTATION_ANCHORS),"implementationAnchors"),U2_IMPLEMENTATION_ANCHORS,"implementation anchors");
  if(!Array.isArray(v.obligations)||v.obligations.length!==17)throw Error("U2 closure obligations invalid");
  same(v.obligations.map((x:any)=>x?.id),ids("U2-I",17),"obligation IDs");
  for(const [i,o0] of v.obligations.entries()){const o=exact(o0,["id","claim","evidence"],`obligation ${i}`);if(typeof o.claim!=="string"||o.claim.trim()!==o.claim||o.claim.length<30||!Array.isArray(o.evidence)||!o.evidence.length)throw Error("U2 closure obligation content invalid");for(const e0 of o.evidence){const e=exact(e0,["validator","testFile","testName","clause"],"evidence");strings(Object.values(e),"evidence values");if(!(e.testFile as string).startsWith("packages/core/src/organization-u2-"))throw Error("U2 closure evidence source invalid")}}
  if(!Array.isArray(v.externalDeferred)||v.externalDeferred.length!==12)throw Error("U2 closure external evidence invalid");
  v.externalDeferred.forEach((x,i)=>{const e=exact(x,["id","kind"],"external evidence");same(e,{id:`U2-E${i+1}`,kind:U2_EXTERNAL_OBSERVATION_KINDS[i]},"external evidence")});
  same(exact(v.accounting,["openInternal","dischargedInternal","deferredExternal"],"accounting"),{openInternal:0,dischargedInternal:17,deferredExternal:12},"accounting");
  same(strings(v.prohibitedClaims,"prohibitedClaims"),["a V9 empirical U2 population is registered","U2 semantic closure is complete","UG1 has passed","U3 empirical mandatory strata or denominators are frozen"],"prohibited claims");
  exact(v.skepticalReview,["finding","disposition"],"skepticalReview");strings(Object.values(v.skepticalReview as object),"skepticalReview values");
  const d=exact(v.downstreamBoundary,["allowed","forbidden","releaseCondition","prerequisiteIds"],"downstreamBoundary");
  same(strings(d.allowed,"allowed"),["U3 interface development with explicitly synthetic inputs","U3 fixture development with fixture-local denominators","U3 property tests over synthetic fixtures"],"allowed boundary");
  same(strings(d.forbidden,"forbidden"),["U3 semantic checkpoint closure","registration of empirical mandatory-observation strata","publication or reuse of empirical U3 denominators","claiming UG1 passage"],"forbidden boundary");
  same(d.prerequisiteIds,[...ids("U1-E",4),...ids("U2-E",12)],"prerequisites");
  if(d.releaseCondition!=="a verified external U1 source-population.v3 digest and a separately registered and externally reproduced empirical U2 population digest"||v.nextImplementation!=="U3"||v.nextExternal!=="U1-E1")throw Error("U2 closure downstream boundary invalid");
  if(typeof v.digest!=="string"||v.digest!==EXPECTED_U2_IMPLEMENTATION_CLOSURE_DIGEST||v.digest!==digestU2ImplementationClosure(v))throw Error("U2 closure digest invalid");return v;
}
