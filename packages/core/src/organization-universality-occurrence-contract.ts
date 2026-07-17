import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  freezeSourceCensusIndexObservationContract,
  sourceCensusIndexObservationConstants as inherited,
  type SourceCensusIndexObservationContract,
} from "./organization-universality-index-observation-contract";

type Base = Omit<SourceCensusIndexObservationContract, "schema" | "id" | "campaignId" | "completion" | "invalidation" | "censusCutoff">;
const pass = {
  rootRequest: "replaced-by-query-only-tail-probe",
  tailProbe: "accepted-per-page-100-page-1-stars-gte-thresholds-2000-times-powers-of-two-until-first-zero-total-count",
  tailProbeTermination: "total-count-zero-and-items-length-zero-otherwise-malformed-response-schema",
  rangeRequest: "exactly-one-accepted-per-page-100-page-1-response-per-visited-range",
  maximumTotalAttempts: 4,
  retryableFailures: ["transport-failure", "non-rate-limit-non-200", "malformed-response-schema", "incomplete-results-true", "terminal-item-ineligible-or-created-outside-query"],
  retryTransition: "retain-failed-evidence-discard-pass-and-restart-from-root",
  rateLimitTransition: "on-403-with-valid-x-ratelimit-reset-retry-same-request-until-cutoff-without-consuming-pass-attempt",
  immediateInvalidations: ["unpartitionable-overflow-leaf", "accepted-response-at-or-after-cutoff", "raw-body-digest-mismatch", "normalized-name-mapped-to-distinct-node-ids"],
} as const;
const occurrenceEncoding = {
  schema: "open-autonomy.source-census-terminal-occurrence.v1",
  fields: ["schema", "attemptId", "completePassOrdinal", "requestPosition", "itemPosition", "requestKey", "requestDigest", "responseDigest", "nodeId", "observedAt", "queryStars", "queryCreated", "returned"],
  identity: "zero-based-position-completePassOrdinal-requestPosition-itemPosition-with-node-id-equivalence-quotient",
  ordering: "ascending-completePassOrdinal-then-requestPosition-then-itemPosition",
  serialization: "canonical-json",
  returnedFields: ["repository", "stars", "defaultBranch", "license", "fork", "archived", "createdAt", "description", "topics", "htmlUrl"],
} as const;
const replayAlgebra = {
  version: "u1-terminal-replay-algebra.v1",
  requestSchema: "open-autonomy.source-census-terminal-request.v1",
  passSchema: "open-autonomy.source-census-complete-pass.v1",
  replaySchema: "open-autonomy.source-census-terminal-replay.v1",
  attemptSchema: "open-autonomy.source-census-attempt-history.v1",
  totalOrder: "completePassOrdinal-requestPosition-itemPosition-all-zero-based-ascending",
  acceptedRequestOrder: "ascending-attemptNumber-then-zero-based-requestPosition",
  wholeCustodyOrder: "attempts-by-attemptNumber-passes-by-completePassOrdinal-requests-by-attemptNumber-requestPosition-occurrences-by-completePassOrdinal-requestPosition-itemPosition",
  digestDomains: {
    occurrence: "open-autonomy.u1.occurrence.v1",
    orderedOccurrences: "open-autonomy.u1.ordered-occurrences.v1",
    nodeQuotient: "open-autonomy.u1.node-id-quotient.v1",
    multiplicity: "open-autonomy.u1.multiplicity-summary.v1",
    frame: "open-autonomy.u1.two-pass-frame.v1",
    successfulTranscript: "open-autonomy.u1.successful-transcript.v1",
    attemptHistory: "open-autonomy.u1.attempt-history.v1",
    wholeCustody: "open-autonomy.u1.whole-custody.v1",
    acceptedResponse: "open-autonomy.u1.accepted-response-identity.v1",
  },
  requestKinds: ["tail-probe", "nonterminal-range", "terminal-range"],
  fixedQuery: { fork: true, perPage: 100, page: 1, sort: "stars", order: "desc" },
  custody: { encoding: "base64", sidecar: "exact-captured-sidecar-json-bytes", responseBody: "exact-uncompressed-response-body-bytes" },
  attemptHistoryAuthority: "unauthenticated-non-normative-history-excluded-from-replay-digests",
} as const;
const leaf = {
  maximumResults: 100, acceptedResponse: "same-per-page-100-response-used-for-count-and-members", incompleteResults: "must-be-false",
  completeness: "total-count-at-most-100-and-items-length-equals-total-count",
  occurrenceAccounting: "ordered-terminal-occurrence-count-equals-sum-of-terminal-returned-counts",
  identityQuotient: "all-terminal-occurrences-retained-and-quotiented-exactly-on-github-node-id",
  crossRangeRepetition: "retain-every-occurrence-as-index-drift-evidence-never-add-population-weight",
  containment: "query-membership-is-authoritative-returned-stars-must-only-meet-global-threshold-and-created-at-must-lie-in-created-range-when-present",
  pagination: "forbidden", occurrenceEncoding, replayAlgebra,
} as const;
const baseAggregation = {
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
const aggregation = {
  ...baseAggregation,
  occurrenceRetention: "retain-every-terminal-occurrence-before-node-id-quotient",
  populationUnit: "one-per-github-node-id-regardless-of-occurrence-multiplicity",
  passPresence: "derive-two-boolean-bits-per-node-id-from-occurrences-foreign-keyed-to-the-two-complete-pass-ledger-records",
  occurrenceMergeOrder: "completePassOrdinal-then-zero-based-requestPosition-then-zero-based-itemPosition; observedAt-only-selects-canonical-metadata",
  canonicalProjection: "maximum-returned-stars-and-latest-observation-by-observedAt-completePassOrdinal-requestPosition-itemPosition-with-bytewise-tie-break",
  digests: ["ordered-occurrences", "node-id-quotient", "multiplicity-summary", "two-pass-frame"],
  nonAtomicityClaim: "exhaustive-replay-of-retained-response-bytes-for-preregistered-finite-queries-not-an-authenticated-provider-or-atomic-continuous-github-snapshot",
} as const;
const invalidation = ["unpartitionable-overflow-leaf", "four-total-attempts-with-fewer-than-two-complete-passes", "second-complete-pass-after-cutoff", "accepted-response-at-or-after-cutoff", "raw-body-digest-mismatch", "normalized-name-mapped-to-distinct-node-ids"] as const;

export type SourceCensusOccurrenceContract = Base & { schema: "open-autonomy.source-census-occurrence-contract.v5"; id: string; campaignId: string; completion: { pass: typeof pass; leaf: typeof leaf; aggregation: typeof aggregation }; invalidation: typeof invalidation; censusCutoff: string };
export type FrozenSourceCensusOccurrenceContract = SourceCensusOccurrenceContract & { digest: `sha256:${string}` };
const eq = (a: unknown, b: unknown) => canonicalSemanticJson(a) === canonicalSemanticJson(b);
const exact = (v: object, k: readonly string[]) => eq(Object.keys(v).sort(), [...k].sort());
const digest = (domain: string, value: unknown) => `sha256:${createHash("sha256").update(`${domain}\0${canonicalSemanticJson(value)}`).digest("hex")}` as const;

export function freezeSourceCensusOccurrenceContract(value: SourceCensusOccurrenceContract): FrozenSourceCensusOccurrenceContract {
  if (value.schema !== "open-autonomy.source-census-occurrence-contract.v5" || !value.id || !value.campaignId || !exactUtc(value.censusCutoff) ||
    !exact(value, ["schema", "id", "campaignId", "domainPredicate", "adoption", "enumeration", "completion", "classification", "evidence", "invalidation", "censusCutoff"]) ||
    !exact(value.completion, ["pass", "leaf", "aggregation"]) || !eq(value.completion.pass, pass) || !eq(value.completion.leaf, leaf) || !eq(value.completion.aggregation, aggregation) || !eq(value.invalidation, invalidation) ||
    value.enumeration.starPartition.upperBoundSource !== "first-empty-tail-probe-threshold-minus-one") throw Error("occurrence census contract invalid");
  const projected = { ...structuredClone(value), schema: "open-autonomy.source-census-index-observation-contract.v4", completion: { pass: structuredClone(inherited.pass), leaf: structuredClone(inherited.leaf), aggregation: structuredClone(baseAggregation) }, invalidation: structuredClone(inherited.invalidation) } as unknown as SourceCensusIndexObservationContract;
  freezeSourceCensusIndexObservationContract(projected);
  const body = structuredClone(value);
  return { ...body, digest: digest(value.schema, body) };
}
export function verifySourceCensusOccurrenceContract(value: FrozenSourceCensusOccurrenceContract) { const { digest: claimed, ...body } = value; const frozen = freezeSourceCensusOccurrenceContract(body); if (claimed !== frozen.digest) throw Error("occurrence census contract digest mismatch"); return frozen; }

export type U1ReturnedRepository = { repository: string; stars: number; defaultBranch: string; license: string | null; fork: boolean; archived: boolean; createdAt: string; description: string | null; topics: string[]; htmlUrl: string };
export type U1Occurrence = { schema: typeof occurrenceEncoding.schema; attemptId: string; completePassOrdinal: 1 | 2; requestPosition: number; itemPosition: number; requestKey: string; requestDigest: `sha256:${string}`; responseDigest: `sha256:${string}`; nodeId: string; observedAt: string; queryStars: [number, number]; queryCreated: [string, string] | null; returned: U1ReturnedRepository };
export type U1CaptureSidecar={url:string;startedAt:string;observedAt:string;status:number;headers:Record<string,string>;bodyDigest:`sha256:${string}`};
export type U1AcceptedRequest = { schema: typeof replayAlgebra.requestSchema; kind: "tail-probe"|"nonterminal-range"|"terminal-range"; attemptId: string; attemptNumber:number; completePassOrdinal: 1 | 2 | null; requestPosition: number; parentRequestPosition:number|null; startedAt: string; observedAt: string; requestKey: string; sidecarBase64:string; responseBodyBase64:string; requestDigest: `sha256:${string}`; responseBodyDigest: `sha256:${string}`; sidecarDigest: `sha256:${string}`; acceptedResponseId: string; queryStars: [number,number]; queryCreated: [string,string] | null; fixedQuery: typeof replayAlgebra.fixedQuery; totalCount: number; custody: typeof replayAlgebra.custody };
export type U1CompletePass = { schema: typeof replayAlgebra.passSchema; attemptId: string; attemptNumber:number; completePassOrdinal: 1 | 2; startedAt: string; completedAt: string; requestCount: number; occurrenceCount: number; frameFrozenAt: string | null };
export type U1AttemptHistory={schema:typeof replayAlgebra.attemptSchema;attemptId:string;attemptNumber:number;startedAt:string;endedAt:string;status:"failed"|"complete";failure:string|null};
export type U1TerminalReplay = { schema: typeof replayAlgebra.replaySchema; attempts:U1AttemptHistory[]; passes: U1CompletePass[]; requests: U1AcceptedRequest[]; occurrences: U1Occurrence[] };
declare const validatedReplay: unique symbol;
export type ValidatedU1TerminalReplay = U1TerminalReplay & { readonly [validatedReplay]: true };
const validatedReplays = new WeakSet<object>();
export type U1CanonicalMetadata = U1ReturnedRepository & { nodeId: string; aliases: string[]; latestObservedAt: string; maximumStars: number };
export type U1NodeQuotient = { nodeId: string; aliases: string[]; occurrenceDigests: `sha256:${string}`[] }[];
const sha = /^sha256:[0-9a-f]{64}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const providerUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const integer = (n: unknown) => Number.isSafeInteger(n);
function exactDay(s: string) { return day.test(s) && new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s; }
function exactUtc(s: string) { return utc.test(s) && new Date(s).toISOString() === s; }
function exactProviderUtc(s:string){if(!providerUtc.test(s)||!Number.isFinite(Date.parse(s)))return false;return new Date(s).toISOString().slice(0,19)===s.slice(0,19)}
const compare = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b));
export function normalizeGithubRepositoryName(name: string) { if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]+$/.test(name) || name.endsWith(".")) throw Error("invalid GitHub repository name"); return name.toLowerCase(); }
export function canonicalU1RequestKey(stars: readonly [number, number], created: readonly [string, string] | null) { return `stars:${stars[0]}..${stars[1]}|created:${created ? `${created[0]}..${created[1]}` : "*"}`; }
export function canonicalU1RequestUrl(stars: readonly [number,number], created: readonly [string,string] | null) { const q=`stars:${stars[0]}..${stars[1]} fork:true${created?` created:${created[0]}..${created[1]}`:""}`; return `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=1`; }
export const canonicalU1TailRequestKey=(threshold:number)=>`stars:>=${threshold}|created:*`;
export function canonicalU1TailRequestUrl(threshold:number){const q=`stars:>=${threshold} fork:true`;return`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=1`}
export function validateU1InitialCreationChildren(parent:Pick<U1AcceptedRequest,"queryStars"|"queryCreated"|"requestPosition">,children:readonly Pick<U1AcceptedRequest,"queryStars"|"queryCreated"|"parentRequestPosition">[],passStartedAt:string){if(parent.queryStars[0]!==parent.queryStars[1]||parent.queryCreated!==null)throw Error("not an initial singleton-star overflow");const lo="2007-10-29",hi=passStartedAt.slice(0,10),loMs=Date.parse(`${lo}T00:00:00.000Z`),hiMs=Date.parse(`${hi}T00:00:00.000Z`),mid=new Date(loMs+Math.floor((hiMs-loMs)/172800000)*86400000).toISOString().slice(0,10),next=new Date(Date.parse(`${mid}T00:00:00.000Z`)+86400000).toISOString().slice(0,10),[low,high]=children;if(children.length!==2||!low||!high||low.parentRequestPosition!==parent.requestPosition||high.parentRequestPosition!==parent.requestPosition||!eq(low.queryStars,parent.queryStars)||!eq(high.queryStars,parent.queryStars)||!eq(low.queryCreated,[lo,mid])||!eq(high.queryCreated,[next,hi]))throw Error("initial creation-range midpoint children invalid");return true}
export function canonicalU1AcceptedResponseId(requestDigest:`sha256:${string}`,bodyDigest:`sha256:${string}`,sidecarDigest:`sha256:${string}`,observedAt:string){return digest(replayAlgebra.digestDomains.acceptedResponse,{requestDigest,bodyDigest,sidecarDigest,observedAt});}

function validateOccurrences(c: FrozenSourceCensusOccurrenceContract, input: readonly U1Occurrence[], requirePasses = true): U1Occurrence[] {
  const positions = new Set<string>(), names = new Map<string, string>(), attempts = new Map<number, string>();
  for (const o of input) {
    if (!exact(o, occurrenceEncoding.fields) || o.schema !== occurrenceEncoding.schema || !o.attemptId || (o.completePassOrdinal !== 1 && o.completePassOrdinal !== 2) || !integer(o.requestPosition) || o.requestPosition < 0 || !integer(o.itemPosition) || o.itemPosition < 0 || !sha.test(o.requestDigest) || !sha.test(o.responseDigest) || !o.nodeId || !exactUtc(o.observedAt) || o.observedAt >= c.censusCutoff || !exact(o.returned, occurrenceEncoding.returnedFields)) throw Error("invalid occurrence schema");
    const priorAttempt = attempts.get(o.completePassOrdinal); if (priorAttempt && priorAttempt !== o.attemptId) throw Error("complete pass spans attempts"); attempts.set(o.completePassOrdinal, o.attemptId);
    const p = `${o.completePassOrdinal}/${o.requestPosition}/${o.itemPosition}`; if (positions.has(p)) throw Error("duplicate occurrence position"); positions.add(p);
    const [lo, hi] = o.queryStars; if (!integer(lo) || !integer(hi) || lo > hi || lo < c.adoption.threshold || o.requestKey !== canonicalU1RequestKey(o.queryStars, o.queryCreated)) throw Error("invalid query tuple");
    if (o.queryCreated && (!exactDay(o.queryCreated[0]) || !exactDay(o.queryCreated[1]) || o.queryCreated[0] > o.queryCreated[1])) throw Error("invalid creation-day tuple");
    const r = o.returned; if (!Number.isSafeInteger(r.stars) || r.stars < c.adoption.threshold || !r.defaultBranch || !exactProviderUtc(r.createdAt) || (o.queryCreated && (r.createdAt.slice(0, 10) < o.queryCreated[0] || r.createdAt.slice(0, 10) > o.queryCreated[1])) || typeof r.fork !== "boolean" || typeof r.archived !== "boolean" || (r.license !== null && typeof r.license !== "string") || (r.description !== null && typeof r.description !== "string") || !Array.isArray(r.topics) || r.topics.some(x => typeof x !== "string")) throw Error("invalid returned metadata");
    const normalized = normalizeGithubRepositoryName(r.repository); if (r.htmlUrl !== `https://github.com/${r.repository}`) throw Error("repository URL/name mismatch");
    const prior = names.get(normalized); if (prior && prior !== o.nodeId) throw Error("normalized name reused by distinct node IDs"); names.set(normalized, o.nodeId);
  }
  if (requirePasses && (attempts.size !== 2 || attempts.get(1) === attempts.get(2))) throw Error("exactly two distinct complete-pass attempts required");
  for (const passOrdinal of [1, 2]) {
    const rows = input.filter(o => o.completePassOrdinal === passOrdinal); const requests = [...new Set(rows.map(o => o.requestPosition))].sort((a,b)=>a-b);
    if (requirePasses && requests.some((x,i)=>x!==i)) throw Error("request positions must be zero-based contiguous");
    for (const request of requests) { const items = rows.filter(o=>o.requestPosition===request).map(o=>o.itemPosition).sort((a,b)=>a-b); if (items.length > leaf.maximumResults || items.some((x,i)=>x!==i)) throw Error("item positions must be zero-based contiguous"); const rs=rows.filter(o=>o.requestPosition===request); for (const field of ["attemptId","requestKey","requestDigest","responseDigest","observedAt"] as const) if (rs.some(o=>o[field]!==rs[0]![field])) throw Error("request evidence mismatch"); if (rs.some(o=>!eq(o.queryStars,rs[0]!.queryStars)||!eq(o.queryCreated,rs[0]!.queryCreated))) throw Error("request query mismatch"); }
  }
  return structuredClone(input) as U1Occurrence[];
}
const requestFields=["schema","kind","attemptId","attemptNumber","completePassOrdinal","requestPosition","parentRequestPosition","startedAt","observedAt","requestKey","sidecarBase64","responseBodyBase64","requestDigest","responseBodyDigest","sidecarDigest","acceptedResponseId","queryStars","queryCreated","fixedQuery","totalCount","custody"] as const;
const passFields=["schema","attemptId","attemptNumber","completePassOrdinal","startedAt","completedAt","requestCount","occurrenceCount","frameFrozenAt"] as const;
const attemptFields=["schema","attemptId","attemptNumber","startedAt","endedAt","status","failure"] as const;
const githubItemFields=["node_id","full_name","stargazers_count","default_branch","license","fork","archived","created_at","description","topics","html_url"] as const;
const validGithubItem=(x:any)=>x&&githubItemFields.every(k=>Object.hasOwn(x,k))&&typeof x.node_id==="string"&&x.node_id.length>0&&typeof x.full_name==="string"&&x.full_name.length>0&&integer(x.stargazers_count)&&x.stargazers_count>=0&&typeof x.default_branch==="string"&&x.default_branch.length>0&&(x.license===null||(typeof x.license==="object"&&Object.hasOwn(x.license,"spdx_id")&&(x.license.spdx_id===null||typeof x.license.spdx_id==="string")))&&typeof x.fork==="boolean"&&typeof x.archived==="boolean"&&typeof x.created_at==="string"&&exactProviderUtc(x.created_at)&&(x.description===null||typeof x.description==="string")&&Array.isArray(x.topics)&&x.topics.every((t:any)=>typeof t==="string")&&typeof x.html_url==="string";
const bytes=(s:string)=>{if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error("invalid base64 evidence");return Buffer.from(s,"base64")};
const bytesDigest=(b:Uint8Array)=>`sha256:${createHash("sha256").update(b).digest("hex")}` as const;
const deepFreeze=<T>(v:T):T=>{if(v&&typeof v==="object"&&!Object.isFrozen(v)){for(const x of Object.values(v as object))deepFreeze(x);Object.freeze(v)}return v};
export function validateU1CapturedResponse(sidecarBytes:Uint8Array,bodyBytes:Uint8Array){let sidecar:any,body:any;try{sidecar=JSON.parse(Buffer.from(sidecarBytes).toString("utf8"));body=JSON.parse(Buffer.from(bodyBytes).toString("utf8"))}catch{throw Error("captured response JSON invalid")};if(!exact(sidecar,["url","startedAt","observedAt","status","headers","bodyDigest"])||typeof sidecar.url!=="string"||!exactUtc(sidecar.startedAt)||!exactUtc(sidecar.observedAt)||sidecar.startedAt>sidecar.observedAt||sidecar.status!==200||!sidecar.headers||typeof sidecar.headers!=="object"||Object.values(sidecar.headers).some(x=>typeof x!=="string")||typeof sidecar.headers["content-type"]!=="string"||!sidecar.headers["content-type"].toLowerCase().startsWith("application/json")||sidecar.bodyDigest!==bytesDigest(bodyBytes)||!body||typeof body!=="object"||!["total_count","incomplete_results","items"].every(k=>Object.hasOwn(body,k))||!integer(body.total_count)||body.total_count<0||body.incomplete_results!==false||!Array.isArray(body.items)||body.items.length>100||body.items.some((x:any)=>!validGithubItem(x)))throw Error("captured response invalid");return{sidecar:sidecar as U1CaptureSidecar,body:body as{total_count:number;incomplete_results:false;items:any[];[key:string]:unknown}}}
export function validateU1TerminalReplay(contract: SourceCensusOccurrenceContract | FrozenSourceCensusOccurrenceContract, replay: U1TerminalReplay): ValidatedU1TerminalReplay {
  const c="digest" in contract?verifySourceCensusOccurrenceContract(contract):freezeSourceCensusOccurrenceContract(contract);
  if(!exact(replay,["schema","attempts","passes","requests","occurrences"])||replay.schema!==replayAlgebra.replaySchema||replay.passes.length!==2) throw Error("invalid replay schema");
  const attempts=[...replay.attempts],passes=[...replay.passes],requests=[...replay.requests].sort((a,b)=>a.attemptNumber-b.attemptNumber||a.requestPosition-b.requestPosition);
  if(!attempts.length||attempts.length>pass.maximumTotalAttempts||attempts.some((a,i)=>!exact(a,attemptFields)||a.schema!==replayAlgebra.attemptSchema||a.attemptNumber!==i+1||!a.attemptId||!exactUtc(a.startedAt)||!exactUtc(a.endedAt)||a.startedAt>a.endedAt||(i>0&&attempts[i-1]!.endedAt>a.startedAt)||!(["failed","complete"] as const).includes(a.status)||(a.status==="complete"?a.failure!==null:!pass.retryableFailures.includes(a.failure as never)))||new Set(attempts.map(a=>a.attemptId)).size!==attempts.length)throw Error("invalid attempt history");
  const complete=attempts.filter(a=>a.status==="complete");if(complete.length!==2||attempts.at(-1)!==complete[1])throw Error("exactly two complete attempts with no later attempt required");
  if(passes.some((p,i)=>{const a=complete[i];return !exact(p,passFields)||p.schema!==replayAlgebra.passSchema||p.completePassOrdinal!==i+1||!a||p.attemptId!==a.attemptId||p.attemptNumber!==a.attemptNumber||p.startedAt!==a.startedAt||p.completedAt!==a.endedAt||p.completedAt>=c.censusCutoff||!integer(p.requestCount)||p.requestCount<1||!integer(p.occurrenceCount)||p.occurrenceCount<0||(p.completePassOrdinal===1?p.frameFrozenAt!==null:p.frameFrozenAt!==p.completedAt)})||passes[0]!.completedAt>passes[1]!.startedAt)throw Error("invalid complete-pass ledger");
  const parsed=new Map<U1AcceptedRequest,{total_count:number;incomplete_results:boolean;items:any[]}>();
  for(const r of requests){const a=attempts[r.attemptNumber-1],p=r.completePassOrdinal===null?undefined:passes[r.completePassOrdinal-1],sidecarBytes=bytes(r.sidecarBase64),bodyBytes=bytes(r.responseBodyBase64),capture=validateU1CapturedResponse(sidecarBytes,bodyBytes),expectedUrl=r.kind==="tail-probe"?canonicalU1TailRequestUrl(r.queryStars[0]):canonicalU1RequestUrl(r.queryStars,r.queryCreated),expectedKey=r.kind==="tail-probe"?canonicalU1TailRequestKey(r.queryStars[0]):canonicalU1RequestKey(r.queryStars,r.queryCreated);if(!exact(r,requestFields)||r.schema!==replayAlgebra.requestSchema||!replayAlgebra.requestKinds.includes(r.kind as never)||!a||r.attemptId!==a.attemptId||(a.status==="complete"?(!p||p.attemptId!==a.attemptId):r.completePassOrdinal!==null)||!integer(r.requestPosition)||r.requestPosition<0||r.startedAt!==capture.sidecar.startedAt||r.observedAt!==capture.sidecar.observedAt||r.startedAt<a.startedAt||r.observedAt>a.endedAt||r.observedAt>=c.censusCutoff||bytesDigest(Buffer.from(capture.sidecar.url))!==r.requestDigest||bytesDigest(bodyBytes)!==r.responseBodyDigest||bytesDigest(sidecarBytes)!==r.sidecarDigest||capture.sidecar.url!==expectedUrl||r.acceptedResponseId!==canonicalU1AcceptedResponseId(r.requestDigest,r.responseBodyDigest,r.sidecarDigest,r.observedAt)||!eq(r.fixedQuery,replayAlgebra.fixedQuery)||!eq(r.custody,replayAlgebra.custody)||r.requestKey!==expectedKey||r.totalCount!==capture.body.total_count)throw Error("invalid accepted captured request");const[lo,hi]=r.queryStars;if(!integer(lo)||!integer(hi)||lo>hi||lo<c.adoption.threshold||(r.queryCreated&&(!exactDay(r.queryCreated[0])||!exactDay(r.queryCreated[1])||r.queryCreated[0]>r.queryCreated[1])))throw Error("invalid request query");if(r.kind==="terminal-range"&&(capture.body.total_count>100||capture.body.items.length!==capture.body.total_count))throw Error("invalid terminal response");parsed.set(r,capture.body);}
  for(const r of requests){const response=parsed.get(r)!;if(response.items.length!==Math.min(response.total_count,100)||(r.kind==="nonterminal-range"&&response.total_count<=100))throw Error("request kind/response cardinality mismatch");}
  for(const a of attempts){const rs=requests.filter(r=>r.attemptNumber===a.attemptNumber);if(rs.some((r,i)=>r.requestPosition!==i)||rs.some((r,i)=>i>0&&rs[i-1]!.observedAt>r.startedAt))throw Error("request chronology/order invalid");}
  for(const p of passes){const rs=requests.filter(r=>r.completePassOrdinal===p.completePassOrdinal);if(rs.length!==p.requestCount)throw Error("pass request count mismatch");const tails=rs.filter(r=>r.kind==="tail-probe"),ranges=rs.filter(r=>r.kind!=="tail-probe");if(!tails.length||!ranges.length||rs.slice(0,tails.length).some(r=>r.kind!=="tail-probe")||parsed.get(tails.at(-1)!)!.total_count!==0||parsed.get(tails.at(-1)!)!.items.length!==0)throw Error("tail termination/range coverage invalid");for(let i=0;i<tails.length;i++){if(tails[i]!.parentRequestPosition!==null||tails[i]!.queryCreated!==null||tails[i]!.queryStars[0]!==2000*2**i||tails[i]!.queryStars[1]!==Number.MAX_SAFE_INTEGER||(i<tails.length-1&&parsed.get(tails[i]!)!.total_count===0))throw Error("tail traversal invalid");}const root=ranges[0]!;if(root.parentRequestPosition!==null||root.queryStars[0]!==c.adoption.threshold||root.queryStars[1]!==tails.at(-1)!.queryStars[0]-1)throw Error("range root invalid");const visit=(r:U1AcceptedRequest):U1AcceptedRequest[]=>{if(r.kind==="terminal-range")return[r];const children=ranges.filter(x=>x.parentRequestPosition===r.requestPosition);if(r.queryStars[0]===r.queryStars[1]&&r.queryCreated===null){validateU1InitialCreationChildren(r,children,p.startedAt);return[r,...visit(children[0]!),...visit(children[1]!)]}if(children.length!==2)throw Error("nonterminal split arity invalid");const[low,high]=children;if(!low||!high)throw Error("range split invalid");if(r.queryStars[0]<r.queryStars[1]){const mid=Math.floor((r.queryStars[0]+r.queryStars[1])/2);if(!eq(low.queryStars,[r.queryStars[0],mid])||!eq(high.queryStars,[mid+1,r.queryStars[1]])||!eq(low.queryCreated,r.queryCreated)||!eq(high.queryCreated,r.queryCreated))throw Error("star split invalid")}else{if(!r.queryCreated||r.queryCreated[0]===r.queryCreated[1])throw Error("unpartitionable overflow leaf");const lo=Date.parse(`${r.queryCreated[0]}T00:00:00.000Z`),hi=Date.parse(`${r.queryCreated[1]}T00:00:00.000Z`),mid=new Date(lo+Math.floor((hi-lo)/172800000)*86400000).toISOString().slice(0,10),next=new Date(Date.parse(`${mid}T00:00:00.000Z`)+86400000).toISOString().slice(0,10);if(!eq(low.queryStars,r.queryStars)||!eq(high.queryStars,r.queryStars)||!eq(low.queryCreated,[r.queryCreated[0],mid])||!eq(high.queryCreated,[next,r.queryCreated[1]]))throw Error("creation-day split invalid")}return[r,...visit(low),...visit(high)]};if(!eq(visit(root).map(r=>r.requestPosition),ranges.map(r=>r.requestPosition)))throw Error("depth-first traversal order invalid");}
  const occurrences=validateOccurrences(c,replay.occurrences,false);
  for(const o of occurrences){const r=requests.find(x=>x.completePassOrdinal===o.completePassOrdinal&&x.requestPosition===o.requestPosition);const item=r&&parsed.get(r)?.items[o.itemPosition];if(!r||r.kind!=="terminal-range"||!item||o.attemptId!==r.attemptId||o.requestKey!==r.requestKey||o.requestDigest!==r.requestDigest||o.responseDigest!==r.responseBodyDigest||o.observedAt!==r.observedAt||!eq(o.queryStars,r.queryStars)||!eq(o.queryCreated,r.queryCreated)||item.node_id!==o.nodeId||item.full_name!==o.returned.repository||item.stargazers_count!==o.returned.stars||item.default_branch!==o.returned.defaultBranch||item.fork!==o.returned.fork||item.archived!==o.returned.archived||item.created_at!==o.returned.createdAt||item.description!==o.returned.description||!eq(item.topics,o.returned.topics)||item.html_url!==o.returned.htmlUrl||(item.license?.spdx_id??null)!==o.returned.license)throw Error("occurrence/raw-item foreign key mismatch");}
  for(const r of requests)if(r.kind==="terminal-range"&&occurrences.filter(o=>o.completePassOrdinal===r.completePassOrdinal&&o.requestPosition===r.requestPosition).length!==r.totalCount)throw Error("terminal response count mismatch");
  for(const p of passes)if(occurrences.filter(o=>o.completePassOrdinal===p.completePassOrdinal).length!==p.occurrenceCount)throw Error("pass occurrence count mismatch");
  const result=deepFreeze(structuredClone({schema:replay.schema,attempts,passes,requests,occurrences:ordered(occurrences)})) as ValidatedU1TerminalReplay;validatedReplays.add(result);return result;
}
const ordered = (xs: readonly U1Occurrence[]) => [...xs].sort((a,b)=>a.completePassOrdinal-b.completePassOrdinal || a.requestPosition-b.requestPosition || a.itemPosition-b.itemPosition);
const rows=(replay:ValidatedU1TerminalReplay)=>{if(!validatedReplays.has(replay))throw Error("terminal replay was not issued by validator");return replay.occurrences;};
export const canonicalU1OccurrenceDigest = (replay: ValidatedU1TerminalReplay, position: readonly [1|2,number,number]) => {const o=rows(replay).find(x=>x.completePassOrdinal===position[0]&&x.requestPosition===position[1]&&x.itemPosition===position[2]);if(!o)throw Error("occurrence position absent");return digest(replayAlgebra.digestDomains.occurrence,o);};
export const canonicalU1SuccessfulTranscriptDigest=(replay:ValidatedU1TerminalReplay)=>{rows(replay);const passes=replay.passes.map(({attemptId:_,attemptNumber:__,...p})=>p).sort((a,b)=>a.completePassOrdinal-b.completePassOrdinal),requests=replay.requests.filter(r=>r.completePassOrdinal!==null).map(({attemptId:_,attemptNumber:__,...r})=>r).sort((a,b)=>a.completePassOrdinal!-b.completePassOrdinal!||a.requestPosition-b.requestPosition),occurrences=replay.occurrences.map(({attemptId:_,...o})=>o).sort((a,b)=>a.completePassOrdinal-b.completePassOrdinal||a.requestPosition-b.requestPosition||a.itemPosition-b.itemPosition);return digest(replayAlgebra.digestDomains.successfulTranscript,{schema:replay.schema,passes,requests,occurrences});};
export const canonicalU1AttemptHistoryDigest=(replay:ValidatedU1TerminalReplay)=>{rows(replay);return digest(replayAlgebra.digestDomains.attemptHistory,replay.attempts);};
export const canonicalU1WholeCustodyDigest=(replay:ValidatedU1TerminalReplay)=>{rows(replay);return digest(replayAlgebra.digestDomains.wholeCustody,replay);};
export const orderedU1OccurrencesDigest = (replay: ValidatedU1TerminalReplay) => digest(replayAlgebra.digestDomains.orderedOccurrences, ordered(rows(replay)));
export function canonicalU1NodeQuotient(replay: ValidatedU1TerminalReplay): U1NodeQuotient { const xs=rows(replay),groups = new Map<string,U1Occurrence[]>(); for (const o of xs) groups.set(o.nodeId,[...(groups.get(o.nodeId)??[]),o]); return [...groups].sort(([a],[b])=>compare(a,b)).map(([nodeId,os])=>({nodeId,aliases:[...new Set(os.map(o=>normalizeGithubRepositoryName(o.returned.repository)))].sort(compare),occurrenceDigests:ordered(os).map(o=>digest(replayAlgebra.digestDomains.occurrence,o))})); }
export const canonicalU1NodeQuotientDigest = (replay: ValidatedU1TerminalReplay) => digest(replayAlgebra.digestDomains.nodeQuotient, canonicalU1NodeQuotient(replay));
export function canonicalU1Multiplicity(replay: ValidatedU1TerminalReplay) { const xs=rows(replay);return canonicalU1NodeQuotient(replay).map(q=>{const os=xs.filter(o=>o.nodeId===q.nodeId);return {nodeId:q.nodeId,total:os.length,pass1:os.filter(o=>o.completePassOrdinal===1).length,pass2:os.filter(o=>o.completePassOrdinal===2).length};}); }
export const canonicalU1MultiplicityDigest = (replay: ValidatedU1TerminalReplay) => digest(replayAlgebra.digestDomains.multiplicity, canonicalU1Multiplicity(replay));
export function canonicalU1MetadataProjection(replay: ValidatedU1TerminalReplay): U1CanonicalMetadata[] { const xs=rows(replay);return canonicalU1NodeQuotient(replay).map(q=>{const os=xs.filter(o=>o.nodeId===q.nodeId); const latest=[...os].sort((a,b)=>compare(b.observedAt,a.observedAt)||b.completePassOrdinal-a.completePassOrdinal||b.requestPosition-a.requestPosition||b.itemPosition-a.itemPosition||compare(canonicalSemanticJson(b),canonicalSemanticJson(a)))[0]!; const maximumStars=Math.max(...os.map(o=>o.returned.stars)), repository=normalizeGithubRepositoryName(latest.returned.repository); return {...structuredClone(latest.returned),repository,htmlUrl:`https://github.com/${repository}`,topics:[...latest.returned.topics].sort(compare),stars:maximumStars,nodeId:q.nodeId,aliases:q.aliases,latestObservedAt:latest.observedAt,maximumStars};}); }
export function canonicalU1Frame(replay: ValidatedU1TerminalReplay) { const xs=rows(replay),metadata=new Map(canonicalU1MetadataProjection(replay).map(x=>[x.nodeId,x])); return canonicalU1NodeQuotient(replay).map(q=>({nodeId:q.nodeId,inPass1:xs.some(o=>o.nodeId===q.nodeId&&o.completePassOrdinal===1),inPass2:xs.some(o=>o.nodeId===q.nodeId&&o.completePassOrdinal===2),metadata:metadata.get(q.nodeId)!})); }
export const canonicalU1FrameDigest = (replay: ValidatedU1TerminalReplay) => digest(replayAlgebra.digestDomains.frame, canonicalU1Frame(replay));
export const sourceCensusOccurrenceConstants = { pass, leaf, aggregation, invalidation } as const;
