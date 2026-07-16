import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canonicalSemanticJson, signableR23Attempt, signableR23Campaign, signableR23Enrollment,
  signableR23Event, signableR23Human, signableR23Invoice, signableR23Normalization,
  signableR23Provider, signableR23Registration, signableR23Work, type R23Campaign,
  type R23Registration,
} from "@open-autonomy/core";

type D = `sha256:${string}`;
export type R23Kind = "normalization" | "enrollments" | "attempts" | "works" | "invoices" | "usage" | "humans" | "events";
const KINDS: R23Kind[] = ["normalization", "enrollments", "attempts", "works", "invoices", "usage", "humans", "events"];
const DIMS = ["tokens", "compute", "money"] as const;
const hash = (x: unknown): D => `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`;
const fingerprint = (pem: string) => createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
const cell = (...xs: string[]) => xs.map(encodeURIComponent).join("/");
const parts = (x: string) => x.split("/").map(decodeURIComponent);
const MANIFEST = { version: 1, order: ["registration", "normalization-and-enrollment", "attempts", "works-and-invoices", "usage-human-events", "summary", "collector-intent", "collection"] };

export type R23Request = { schema: "open-autonomy.bench-r23-acquisition-request.v1"; checkpoint: "R23"; campaignId: string; action: "registration" | "evidence" | "summary" | "collector-intent" | "collection"; kind: R23Kind | null; cellId: string; signerId: string; manifestDigest: D; ordinal: number; descriptorDigest: D | null; prerequisiteDigests: D[]; candidateDigest: D | null };
export type R23Response = { schema: "open-autonomy.bench-r23-acquisition-response.v1"; requestDigest: D; fragmentDigest: D; signerKeyId: string; signedAt: string; signature: string; fragment: unknown };
type Exchange = { request: R23Request; response?: R23Response };
export type R23State = { schema: "open-autonomy.bench-r23-acquisition-state.v1"; checkpoint: "R23"; campaignId: string; createdAt: string; manifestDigest: D; registrationKeyId: string; collectorKeyId: string; privacyKeyId: string; eventKeyId: string; normalizationKeyId: string; providerKeyIds: Record<string, string>; humanKeyIds: Record<string, string>; publicKeys: Record<string, string>; registration?: Exchange; evidence: Record<R23Kind, Record<string, Exchange>>; summary?: Exchange; collectorIntent?: Exchange; collection?: Exchange; assembledBundleDigest: D | null };

function registry(s: Pick<R23State, "registrationKeyId" | "collectorKeyId" | "privacyKeyId" | "eventKeyId" | "normalizationKeyId" | "providerKeyIds" | "humanKeyIds" | "publicKeys">) {
  if (Object.keys(s.providerKeyIds).length < 2 || Object.keys(s.humanKeyIds).length < 2) throw Error("R23 acquisition authority registry incomplete");
  const ids = [s.registrationKeyId, s.collectorKeyId, s.privacyKeyId, s.eventKeyId, s.normalizationKeyId, ...Object.values(s.providerKeyIds), ...Object.values(s.humanKeyIds)];
  if (ids.some((id) => !id || !s.publicKeys[id]) || new Set(ids).size !== ids.length) throw Error("R23 acquisition authority keys aliased or missing");
  let fps: string[]; try { fps = ids.map((id) => fingerprint(s.publicKeys[id]!)); } catch { throw Error("R23 acquisition public key invalid"); }
  if (new Set(fps).size !== fps.length) throw Error("R23 acquisition public keys must be cryptographically distinct");
}
const accepted = (x: Exchange | undefined, name: string) => { if (!x?.response) throw Error(`R23 acquisition ${name} response missing`); return x.response; };
const registration = (s: R23State) => accepted(s.registration, "registration").fragment as R23Registration;
function key(s: R23State, q: R23Request) {
  if (q.action === "registration") return s.registrationKeyId;
  if (q.action === "summary" || q.action === "collector-intent" || q.action === "collection") return s.collectorKeyId;
  if (q.kind === "normalization") return s.normalizationKeyId;
  if (q.kind === "enrollments") return s.privacyKeyId;
  if (q.kind === "works" || q.kind === "events") return s.eventKeyId;
  if (q.kind === "humans") return s.humanKeyIds[q.signerId];
  return s.providerKeyIds[q.signerId];
}
const request = (s: R23State, x: Omit<R23Request, "schema" | "checkpoint" | "campaignId" | "manifestDigest">): R23Request => ({ schema: "open-autonomy.bench-r23-acquisition-request.v1", checkpoint: "R23", campaignId: s.campaignId, manifestDigest: s.manifestDigest, ...x });
function checkRequest(s: R23State, q: R23Request) { if (q.schema !== "open-autonomy.bench-r23-acquisition-request.v1" || q.checkpoint !== "R23" || q.campaignId !== s.campaignId || q.manifestDigest !== s.manifestDigest || !q.signerId || !Number.isSafeInteger(q.ordinal) || q.ordinal < 0 || !key(s, q)) throw Error("R23 acquisition request invalid"); }
function checkResponse(s: R23State, x: Exchange) {
  if (!x.response) return; const r = x.response, kid = key(s, x.request);
  if (r.schema !== "open-autonomy.bench-r23-acquisition-response.v1" || r.requestDigest !== hash(x.request) || r.fragmentDigest !== hash(r.fragment) || r.signerKeyId !== kid || !Number.isFinite(Date.parse(r.signedAt)) || Date.parse(r.signedAt) < Date.parse(s.createdAt)) throw Error("R23 acquisition response binding invalid");
  const body = { schema: r.schema, requestDigest: r.requestDigest, fragmentDigest: r.fragmentDigest, signerKeyId: r.signerKeyId, signedAt: r.signedAt };
  if (!verify(null, Buffer.from(canonicalSemanticJson(body)), s.publicKeys[kid]!, Buffer.from(r.signature, "base64"))) throw Error("R23 acquisition response signature invalid");
}
function live(s: R23State) { if (s.schema !== "open-autonomy.bench-r23-acquisition-state.v1" || s.checkpoint !== "R23" || s.manifestDigest !== hash(MANIFEST) || s.assembledBundleDigest) throw Error("R23 acquisition state is not mutable"); }
function accept(s: R23State, x: Exchange, r: R23Response) { live(s); if (x.response && canonicalSemanticJson(x.response) !== canonicalSemanticJson(r)) throw Error("R23 acquisition equivocation rejected"); checkResponse(s, { request: x.request, response: r }); x.response = r; return hash(r); }

export function createR23State(i: Omit<R23State, "schema" | "checkpoint" | "manifestDigest" | "registration" | "evidence" | "summary" | "collectorIntent" | "collection" | "assembledBundleDigest">): R23State {
  if (!i.campaignId || !Number.isFinite(Date.parse(i.createdAt))) throw Error("R23 acquisition identity invalid"); registry(i);
  return { ...i, schema: "open-autonomy.bench-r23-acquisition-state.v1", checkpoint: "R23", manifestDigest: hash(MANIFEST), evidence: { normalization: {}, enrollments: {}, attempts: {}, works: {}, invoices: {}, usage: {}, humans: {}, events: {} }, assembledBundleDigest: null };
}
export function issueR23Registration(s: R23State) { live(s); const q = request(s, { action: "registration", kind: null, cellId: "registration", signerId: "registration", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [], candidateDigest: null }); s.registration ??= { request: q }; return s.registration.request; }
function validRegistration(s: R23State, r: R23Registration) { if (!r || r.campaignId !== s.campaignId || r.authority?.publicKeyPem !== s.publicKeys[s.registrationKeyId] || canonicalSemanticJson([...r.providerIds].sort()) !== canonicalSemanticJson(Object.keys(s.providerKeyIds).sort()) || canonicalSemanticJson([...r.humanIds].sort()) !== canonicalSemanticJson(Object.keys(s.humanKeyIds).sort()) || !verify(null, Buffer.from(canonicalSemanticJson(signableR23Registration(r))), r.authority.publicKeyPem, Buffer.from(r.authority.signature, "base64"))) throw Error("R23 acquisition registration fragment invalid"); }
export function acceptR23Registration(s: R23State, r: R23Response) { live(s); if (!s.registration) throw Error("R23 acquisition registration request missing"); validRegistration(s, r.fragment as R23Registration); return accept(s, s.registration, r); }

export function expectedR23Cells(s: R23State, r = registration(s)): Record<R23Kind, string[]> { return {
  normalization: ["registry"], enrollments: r.humanIds.map((h) => cell(h)),
  attempts: r.workIds.flatMap((w) => Array.from({ length: r.attemptsPerWork }, (_, a) => cell(w, String(a)))), works: r.workIds.map((w) => cell(w)),
  invoices: r.providerIds.flatMap((p) => DIMS.map((d) => cell(p, d))),
  usage: r.providerIds.flatMap((p) => DIMS.flatMap((d) => r.workIds.flatMap((w) => Array.from({ length: r.attemptsPerWork }, (_, a) => cell(w, String(a), p, d))))),
  humans: r.workIds.flatMap((w) => r.humanIds.flatMap((h) => r.taskIds.map((t) => cell(w, h, t)))), events: r.workIds.flatMap((w) => [cell(w, "interruption"), cell(w, "escalation")]),
}; }
function descriptor(k: R23Kind, id: string) { const p = parts(id); if (k === "normalization") return { registry: true }; if (k === "enrollments") return { humanId: p[0] }; if (k === "attempts") return { workId: p[0], attempt: Number(p[1]) }; if (k === "works") return { workId: p[0] }; if (k === "invoices") return { providerId: p[0], dimension: p[1] }; if (k === "usage") return { workId: p[0], attempt: Number(p[1]), providerId: p[2], dimension: p[3] }; if (k === "humans") return { workId: p[0], humanId: p[1], taskId: p[2] }; return { workId: p[0], kind: p[1] }; }
function responseDigest(s: R23State, k: R23Kind, id: string, label = `${k} ${id}`) { return hash(accepted(s.evidence[k][id], label)); }
function prerequisites(s: R23State, k: R23Kind, d: any) { const reg = hash(accepted(s.registration, "registration")); if (k === "normalization" || k === "enrollments" || k === "attempts") return [reg]; if (k === "works") return [reg, ...Array.from({ length: registration(s).attemptsPerWork }, (_, a) => responseDigest(s, "attempts", cell(d.workId, String(a))))]; if (k === "invoices") return [reg, responseDigest(s, "normalization", "registry"), ...registration(s).workIds.flatMap((w) => Array.from({ length: registration(s).attemptsPerWork }, (_, a) => responseDigest(s, "attempts", cell(w, String(a)))))]; if (k === "usage") return [reg, responseDigest(s, "normalization", "registry"), responseDigest(s, "attempts", cell(d.workId, String(d.attempt))), responseDigest(s, "invoices", cell(d.providerId, d.dimension))]; if (k === "humans") return [reg, responseDigest(s, "enrollments", cell(d.humanId)), responseDigest(s, "works", cell(d.workId))]; return [reg, responseDigest(s, "works", cell(d.workId))]; }
function signer(k: R23Kind, d: any) { if (k === "normalization") return "normalization"; if (k === "enrollments") return "privacy"; if (k === "works" || k === "events") return "event"; if (k === "humans") return d.humanId; return d.providerId; }
export function issueR23Evidence(s: R23State, k: R23Kind, id: string, providerId?: string) { live(s); const cells = expectedR23Cells(s), ordinal = cells[k].indexOf(id); if (ordinal < 0) throw Error("R23 acquisition cell is not registered"); const d: any = descriptor(k, id); if (k === "attempts") { if (!providerId || !s.providerKeyIds[providerId]) throw Error("R23 acquisition registered attempt provider required"); d.providerId = providerId; } const q = request(s, { action: "evidence", kind: k, cellId: id, signerId: signer(k, d), ordinal: ordinal + 1, descriptorDigest: hash(d), prerequisiteDigests: prerequisites(s, k, d), candidateDigest: null }), old = s.evidence[k][id]; if (old && canonicalSemanticJson(old.request) !== canonicalSemanticJson(q)) throw Error("R23 acquisition evidence request drift"); s.evidence[k][id] ??= { request: q }; return s.evidence[k][id]!.request; }
function embedded(body: unknown, pem: string, signature: string) { return verify(null, Buffer.from(canonicalSemanticJson(body)), pem, Buffer.from(signature, "base64")); }
function validEvidence(s: R23State, k: R23Kind, id: string, x: any) { const d = descriptor(k, id); if (!x) throw Error("R23 acquisition evidence fragment invalid"); const pem = s.publicKeys[key(s, s.evidence[k][id]!.request)]!;
  if (k === "normalization") { if (x.signature?.publicKeyPem !== pem || !embedded(signableR23Normalization(x), pem, x.signature.signature)) throw Error("R23 acquisition normalization invalid"); }
  else { for (const [name, value] of Object.entries(d)) if (x[name] !== value) throw Error("R23 acquisition evidence substitution"); const signable = k === "enrollments" ? signableR23Enrollment : k === "attempts" ? signableR23Attempt : k === "works" ? signableR23Work : k === "invoices" ? signableR23Invoice : k === "usage" ? signableR23Provider : k === "humans" ? signableR23Human : signableR23Event; if (x.signature?.publicKeyPem !== pem || !embedded(signable(x), pem, x.signature.signature)) throw Error("R23 acquisition embedded signature invalid"); }
}
export function acceptR23Evidence(s: R23State, k: R23Kind, id: string, r: R23Response) { live(s); const x = s.evidence[k]?.[id]; if (!x) throw Error("R23 acquisition evidence request missing"); validEvidence(s, k, id, r.fragment); return accept(s, x, r); }

function rows<T>(s: R23State, k: R23Kind) { return expectedR23Cells(s)[k].map((id) => accepted(s.evidence[k][id], `${k} ${id}`).fragment as T); }
function allEvidenceDigests(s: R23State) { return KINDS.flatMap((k) => expectedR23Cells(s)[k].map((id) => responseDigest(s, k, id))); }
export function issueR23Summary(s: R23State) { live(s); const q = request(s, { action: "summary", kind: null, cellId: "summary", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: allEvidenceDigests(s), candidateDigest: null }); s.summary ??= { request: q }; return s.summary.request; }
function validSummary(x: any) { if (!x || Object.keys(x).sort().join() !== "autonomousWork,failedAttempts,humanTotalMs,metrics,providerTotals,successfulWork,transfer") throw Error("R23 acquisition summary invalid"); }
export function acceptR23Summary(s: R23State, r: R23Response) { live(s); if (!s.summary) throw Error("R23 acquisition summary request missing"); validSummary(r.fragment); return accept(s, s.summary, r); }
type Intent = Omit<R23Campaign["collector"], "signature">;
export function issueR23CollectorIntent(s: R23State) { live(s); const q = request(s, { action: "collector-intent", kind: null, cellId: "collector-intent", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [hash(accepted(s.summary, "summary"))], candidateDigest: null }); s.collectorIntent ??= { request: q }; return s.collectorIntent.request; }
function validIntent(s: R23State, x: any) { if (!x || Object.keys(x).sort().join() !== "publicKeyPem,signedAt,signerId" || x.publicKeyPem !== s.publicKeys[s.collectorKeyId] || !x.signerId || !Number.isFinite(Date.parse(x.signedAt))) throw Error("R23 acquisition collector intent invalid"); }
export function acceptR23CollectorIntent(s: R23State, r: R23Response) { live(s); if (!s.collectorIntent) throw Error("R23 acquisition collector intent missing"); validIntent(s, r.fragment); return accept(s, s.collectorIntent, r); }
function draft(s: R23State, signature: string): R23Campaign { return { schema: "autonomy.r23-external-campaign.v1", closureClaim: true, registration: registration(s), works: rows(s, "works"), normalizationRegistry: rows(s, "normalization")[0] as any, enrollments: rows(s, "enrollments"), attempts: rows(s, "attempts"), invoices: rows(s, "invoices"), providerUsage: rows(s, "usage"), humanTimings: rows(s, "humans"), events: rows(s, "events"), summary: accepted(s.summary, "summary").fragment as any, collector: { ...(accepted(s.collectorIntent, "collector intent").fragment as Intent), signature } } as R23Campaign; }
export function issueR23Collection(s: R23State) { live(s); const q = request(s, { action: "collection", kind: null, cellId: "collection", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [hash(accepted(s.collectorIntent, "collector intent"))], candidateDigest: hash(signableR23Campaign(draft(s, ""))) }); s.collection ??= { request: q }; return s.collection.request; }
function validCollection(s: R23State, x: any) { if (!x || Object.keys(x).join() !== "campaignSignature" || !embedded(signableR23Campaign(draft(s, x.campaignSignature ?? "")), s.publicKeys[s.collectorKeyId]!, x.campaignSignature ?? "")) throw Error("R23 acquisition campaign signature invalid"); }
export function acceptR23Collection(s: R23State, r: R23Response) { live(s); if (!s.collection) throw Error("R23 acquisition collection missing"); validCollection(s, r.fragment); return accept(s, s.collection, r); }
export function assembleR23(s: R23State) { assertR23State(s); const signature = (accepted(s.collection, "collection").fragment as any).campaignSignature, campaign = draft(s, signature), digest = hash(campaign); if (s.assembledBundleDigest && s.assembledBundleDigest !== digest) throw Error("R23 acquisition assembly drift"); s.assembledBundleDigest = digest; return campaign; }

export function assertR23State(s: R23State) {
  if (s.schema !== "open-autonomy.bench-r23-acquisition-state.v1" || s.checkpoint !== "R23" || !s.campaignId || !Number.isFinite(Date.parse(s.createdAt)) || s.manifestDigest !== hash(MANIFEST)) throw Error("R23 acquisition state invalid"); registry(s);
  if (Object.keys(s.evidence).sort().join() !== [...KINDS].sort().join()) throw Error("R23 acquisition evidence registry invalid");
  const check = (x: Exchange | undefined) => { if (!x) return; checkRequest(s, x.request); checkResponse(s, x); };
  check(s.registration); for (const k of KINDS) Object.values(s.evidence[k]).forEach(check); check(s.summary); check(s.collectorIntent); check(s.collection);
  if (s.registration) {
    const expected = request(s, { action: "registration", kind: null, cellId: "registration", signerId: "registration", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [], candidateDigest: null });
    if (canonicalSemanticJson(expected) !== canonicalSemanticJson(s.registration.request)) throw Error("R23 acquisition registration request drift");
    if (s.registration.response) { validRegistration(s, s.registration.response.fragment as R23Registration); const cells = expectedR23Cells(s); for (const k of KINDS) for (const [id, x] of Object.entries(s.evidence[k])) { const ordinal = cells[k].indexOf(id), d: any = descriptor(k, id); if (k === "attempts") d.providerId = x.request.signerId; if (ordinal < 0 || (k === "attempts" && !s.providerKeyIds[d.providerId])) throw Error("R23 acquisition unregistered stored cell"); const q = request(s, { action: "evidence", kind: k, cellId: id, signerId: signer(k, d), ordinal: ordinal + 1, descriptorDigest: hash(d), prerequisiteDigests: prerequisites(s, k, d), candidateDigest: null }); if (canonicalSemanticJson(q) !== canonicalSemanticJson(x.request)) throw Error("R23 acquisition evidence request drift"); if (x.response) validEvidence(s, k, id, x.response.fragment); } }
    else if (KINDS.some((k) => Object.keys(s.evidence[k]).length)) throw Error("R23 acquisition evidence before registration");
  }
  if (s.summary) { const q = request(s, { action: "summary", kind: null, cellId: "summary", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: allEvidenceDigests(s), candidateDigest: null }); if (canonicalSemanticJson(q) !== canonicalSemanticJson(s.summary.request)) throw Error("R23 acquisition summary request drift"); if (s.summary.response) validSummary(s.summary.response.fragment); }
  if (s.collectorIntent) { const q = request(s, { action: "collector-intent", kind: null, cellId: "collector-intent", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [hash(accepted(s.summary, "summary"))], candidateDigest: null }); if (canonicalSemanticJson(q) !== canonicalSemanticJson(s.collectorIntent.request)) throw Error("R23 acquisition collector intent drift"); if (s.collectorIntent.response) validIntent(s, s.collectorIntent.response.fragment); }
  if (s.collection) { const q = request(s, { action: "collection", kind: null, cellId: "collection", signerId: "collector", ordinal: 0, descriptorDigest: null, prerequisiteDigests: [hash(accepted(s.collectorIntent, "collector intent"))], candidateDigest: hash(signableR23Campaign(draft(s, ""))) }); if (canonicalSemanticJson(q) !== canonicalSemanticJson(s.collection.request)) throw Error("R23 acquisition collection request drift"); if (s.collection.response) validCollection(s, s.collection.response.fragment); }
  if (s.assembledBundleDigest !== null) { const signature = (accepted(s.collection, "collection").fragment as any).campaignSignature; if (s.assembledBundleDigest !== hash(draft(s, signature))) throw Error("R23 acquisition assembled state invalid"); }
  return s;
}
export function saveR23State(path: string, s: R23State) { assertR23State(s); saveR23Json(path, s); }
export function saveR23Json(path: string, value: unknown) { const target = resolve(path), temporary = `${target}.tmp-${process.pid}`; writeFileSync(temporary, `${canonicalSemanticJson(value)}\n`, { flag: "wx", mode: 0o600 }); const file = openSync(temporary, "r"); try { fsyncSync(file); } finally { closeSync(file); } renameSync(temporary, target); const directory = openSync(dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); } }
export function loadR23State(path: string) { return assertR23State(JSON.parse(readFileSync(path, "utf8")) as R23State); }
