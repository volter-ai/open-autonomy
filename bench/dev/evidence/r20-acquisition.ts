import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canonicalSemanticJson, signableR20Campaign, signableR20Observation,
  type R20CampaignBundle, type R20CampaignRegistration, type R20Observation,
} from "@open-autonomy/core";

type Digest = `sha256:${string}`;
type Authority = "registration" | "participant" | "collector";
const digest = (value: unknown): Digest => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const exact = (value: object, keys: string[], name: string) => {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`R20 acquisition ${name} schema invalid`);
};
const fingerprint = (pem: string) => createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
const MANIFEST = { version: 1, sequence: ["registration", "parallel-preregistered-trials", "collector-intent", "collection"],
  properties: ["exact-trial-domain", "participant-bound-responses", "complete-before-collection", "exact-campaign-signature"] };

export type R20AcquisitionRequest = {
  schema: "open-autonomy.bench-r20-acquisition-request.v1";
  checkpoint: "R20";
  campaignId: string;
  action: "registration" | "observation" | "collector-intent" | "collection";
  subject: string;
  authority: Authority;
  signerId: string;
  manifestDigest: Digest;
  ordinal: number;
  assignmentDigest: Digest | null;
  prerequisiteDigests: Digest[];
  candidateDigest: Digest | null;
};
export type R20AcquisitionResponse = {
  schema: "open-autonomy.bench-r20-acquisition-response.v1";
  requestDigest: Digest;
  fragmentDigest: Digest;
  signerKeyId: string;
  signedAt: string;
  signature: string;
  fragment: unknown;
};
type Exchange = { request: R20AcquisitionRequest; response?: R20AcquisitionResponse };
export type R20AcquisitionState = {
  schema: "open-autonomy.bench-r20-acquisition-state.v1";
  checkpoint: "R20";
  campaignId: string;
  createdAt: string;
  manifestDigest: Digest;
  registrationKeyId: string;
  collectorKeyId: string;
  participantKeyIds: Record<string, string>;
  publicKeys: Record<string, string>;
  registration?: Exchange;
  trials: Record<string, Exchange>;
  collectorIntent?: Exchange;
  collection?: Exchange;
  assembledBundleDigest: Digest | null;
};

function validateRegistry(input: Pick<R20AcquisitionState, "registrationKeyId" | "collectorKeyId" | "participantKeyIds" | "publicKeys">) {
  if (!input.registrationKeyId || !input.collectorKeyId || !Object.keys(input.participantKeyIds).length) throw Error("R20 acquisition authority registry incomplete");
  const ids = [input.registrationKeyId, input.collectorKeyId, ...Object.values(input.participantKeyIds)];
  if (new Set(ids).size !== ids.length || ids.some((id) => !input.publicKeys[id])) throw Error("R20 acquisition authority keys must be distinct and registered");
  let fps: string[];
  try { fps = ids.map((id) => fingerprint(input.publicKeys[id]!)); } catch { throw Error("R20 acquisition public key invalid"); }
  if (new Set(fps).size !== fps.length) throw Error("R20 acquisition public keys must be cryptographically distinct");
}
function request(state: R20AcquisitionState, input: Omit<R20AcquisitionRequest, "schema" | "checkpoint" | "campaignId" | "manifestDigest">): R20AcquisitionRequest {
  return { schema: "open-autonomy.bench-r20-acquisition-request.v1", checkpoint: "R20", campaignId: state.campaignId, manifestDigest: state.manifestDigest, ...input };
}
function keyFor(state: R20AcquisitionState, value: R20AcquisitionRequest) {
  return value.authority === "registration" ? state.registrationKeyId : value.authority === "collector" ? state.collectorKeyId : state.participantKeyIds[value.signerId];
}
function validateRequest(state: R20AcquisitionState, value: R20AcquisitionRequest) {
  exact(value, ["schema", "checkpoint", "campaignId", "action", "subject", "authority", "signerId", "manifestDigest", "ordinal", "assignmentDigest", "prerequisiteDigests", "candidateDigest"], "request");
  if (value.schema !== "open-autonomy.bench-r20-acquisition-request.v1" || value.checkpoint !== "R20" || value.campaignId !== state.campaignId ||
      value.manifestDigest !== state.manifestDigest || !["registration", "participant", "collector"].includes(value.authority) || !value.signerId ||
      !Number.isSafeInteger(value.ordinal) || value.ordinal < 0 || !value.prerequisiteDigests.every((x) => /^sha256:[a-f0-9]{64}$/.test(x)) ||
      (value.assignmentDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(value.assignmentDigest)) ||
      (value.candidateDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(value.candidateDigest)) || !keyFor(state, value)) throw Error("R20 acquisition request invalid");
}
function validateResponse(state: R20AcquisitionState, exchange: Exchange) {
  const value = exchange.response; if (!value) return;
  exact(value, ["schema", "requestDigest", "fragmentDigest", "signerKeyId", "signedAt", "signature", "fragment"], "response");
  const keyId = keyFor(state, exchange.request);
  if (value.schema !== "open-autonomy.bench-r20-acquisition-response.v1" || value.requestDigest !== digest(exchange.request) || value.fragmentDigest !== digest(value.fragment) ||
      value.signerKeyId !== keyId || !Number.isFinite(Date.parse(value.signedAt)) || Date.parse(value.signedAt) < Date.parse(state.createdAt))
    throw Error("R20 acquisition response binding invalid");
  const body = { schema: value.schema, requestDigest: value.requestDigest, fragmentDigest: value.fragmentDigest, signerKeyId: value.signerKeyId, signedAt: value.signedAt };
  let signature: Buffer; try { signature = Buffer.from(value.signature, "base64"); } catch { throw Error("R20 acquisition response signature invalid"); }
  if (!signature.length || !verify(null, Buffer.from(canonicalSemanticJson(body)), state.publicKeys[keyId]!, signature)) throw Error("R20 acquisition response signature invalid");
}
function accept(state: R20AcquisitionState, exchange: Exchange, response: R20AcquisitionResponse) {
  if (state.assembledBundleDigest) throw Error("R20 acquisition already assembled");
  if (exchange.response && canonicalSemanticJson(exchange.response) !== canonicalSemanticJson(response)) throw Error("R20 acquisition equivocation rejected");
  validateResponse(state, { request: exchange.request, response }); exchange.response = response; return digest(response);
}
const accepted = (exchange: Exchange | undefined, name: string) => { if (!exchange?.response) throw Error(`R20 acquisition ${name} response missing`); return exchange.response; };

export function createR20AcquisitionState(input: { campaignId: string; createdAt: string; registrationKeyId: string; collectorKeyId: string;
  participantKeyIds: Record<string, string>; publicKeys: Record<string, string> }): R20AcquisitionState {
  if (!input.campaignId || !Number.isFinite(Date.parse(input.createdAt))) throw Error("R20 acquisition identity invalid"); validateRegistry(input);
  return { schema: "open-autonomy.bench-r20-acquisition-state.v1", checkpoint: "R20", campaignId: input.campaignId, createdAt: input.createdAt,
    manifestDigest: digest(MANIFEST), registrationKeyId: input.registrationKeyId, collectorKeyId: input.collectorKeyId,
    participantKeyIds: { ...input.participantKeyIds }, publicKeys: { ...input.publicKeys }, trials: {}, assembledBundleDigest: null };
}
export function issueR20Registration(state: R20AcquisitionState) {
  assertR20AcquisitionState(state); const expected = request(state, { action: "registration", subject: "registration", authority: "registration", signerId: "registration-authority",
    ordinal: 0, assignmentDigest: null, prerequisiteDigests: [], candidateDigest: null });
  state.registration ??= { request: expected }; return state.registration.request;
}
function validateRegistration(state: R20AcquisitionState, value: R20CampaignRegistration) {
  if (!value || value.campaignId !== state.campaignId || value.registrationAuthority?.publicKeyPem !== state.publicKeys[state.registrationKeyId])
    throw Error("R20 acquisition registration fragment invalid");
  const participants = [...new Set(value.trials.map((x) => x.participantId))].sort();
  if (canonicalSemanticJson(participants) !== canonicalSemanticJson(Object.keys(state.participantKeyIds).sort())) throw Error("R20 acquisition participant registry mismatch");
}
export function acceptR20Registration(state: R20AcquisitionState, response: R20AcquisitionResponse) {
  assertR20AcquisitionState(state); if (!state.registration) throw Error("R20 acquisition registration request missing");
  validateRegistration(state, response.fragment as R20CampaignRegistration); return accept(state, state.registration, response);
}
export function issueR20Observation(state: R20AcquisitionState, trialId: string) {
  assertR20AcquisitionState(state); const registrationResponse = accepted(state.registration, "registration"), registration = registrationResponse.fragment as R20CampaignRegistration,
    ordinal = registration.trials.findIndex((x) => x.id === trialId), assignment = registration.trials[ordinal];
  if (!assignment) throw Error("R20 acquisition trial is not preregistered");
  const expected = request(state, { action: "observation", subject: trialId, authority: "participant", signerId: assignment.participantId, ordinal: ordinal + 1,
    assignmentDigest: digest(assignment), prerequisiteDigests: [digest(registrationResponse)], candidateDigest: null }), existing = state.trials[trialId];
  if (existing && canonicalSemanticJson(existing.request) !== canonicalSemanticJson(expected)) throw Error("R20 acquisition observation request drift");
  state.trials[trialId] ??= { request: expected }; return state.trials[trialId]!.request;
}
function validateObservation(state: R20AcquisitionState, exchange: Exchange, value: R20Observation) {
  const registration = accepted(state.registration, "registration").fragment as R20CampaignRegistration,
    assignment = registration.trials[exchange.request.ordinal - 1], participantPem = state.publicKeys[state.participantKeyIds[exchange.request.signerId]!]!;
  if (!value || !assignment || value.campaignId !== state.campaignId || value.trialId !== assignment.id || value.participantId !== assignment.participantId ||
      value.kind !== assignment.kind || value.caseId !== assignment.caseId || value.participantRole !== assignment.participantRole || value.surface !== assignment.surface ||
      value.accessibility !== assignment.accessibility || value.familiarity !== assignment.familiarity || value.participantSignature?.publicKeyPem !== participantPem ||
      !verify(null, Buffer.from(canonicalSemanticJson(signableR20Observation(value))), participantPem, Buffer.from(value.participantSignature?.signature ?? "", "base64")))
    throw Error("R20 acquisition observation fragment invalid");
}
export function acceptR20Observation(state: R20AcquisitionState, trialId: string, response: R20AcquisitionResponse) {
  assertR20AcquisitionState(state); const exchange = state.trials[trialId]; if (!exchange) throw Error("R20 acquisition observation request missing");
  validateObservation(state, exchange, response.fragment as R20Observation); return accept(state, exchange, response);
}
function observations(state: R20AcquisitionState) {
  const registration = accepted(state.registration, "registration").fragment as R20CampaignRegistration;
  return registration.trials.map((trial) => accepted(state.trials[trial.id], `trial ${trial.id}`).fragment as R20Observation);
}
export function issueR20CollectorIntent(state: R20AcquisitionState) {
  assertR20AcquisitionState(state); const values = observations(state), expected = request(state, { action: "collector-intent", subject: "collector-intent", authority: "collector",
    signerId: "collector", ordinal: 0, assignmentDigest: null, prerequisiteDigests: values.map((_, i) => digest(accepted(state.trials[(accepted(state.registration, "registration").fragment as R20CampaignRegistration).trials[i]!.id], "trial"))), candidateDigest: null });
  state.collectorIntent ??= { request: expected }; return state.collectorIntent.request;
}
type CollectorIntent = Omit<R20CampaignBundle["collector"], "signature">;
function validateCollectorIntent(state: R20AcquisitionState, value: CollectorIntent) {
  if (!value || Object.keys(value).sort().join() !== "publicKeyPem,signedAt,signerId" || value.publicKeyPem !== state.publicKeys[state.collectorKeyId] ||
      !value.signerId || !Number.isFinite(Date.parse(value.signedAt)) || observations(state).some((x) => Date.parse(value.signedAt) < Date.parse(x.participantSignature.signedAt)))
    throw Error("R20 acquisition collector intent invalid");
}
export function acceptR20CollectorIntent(state: R20AcquisitionState, response: R20AcquisitionResponse) {
  assertR20AcquisitionState(state); if (!state.collectorIntent) throw Error("R20 acquisition collector intent request missing");
  validateCollectorIntent(state, response.fragment as CollectorIntent); return accept(state, state.collectorIntent, response);
}
function draft(state: R20AcquisitionState, signature: string): R20CampaignBundle {
  return { schema: "autonomy.r20-external-campaign.v1", closureClaim: true, registration: accepted(state.registration, "registration").fragment as R20CampaignRegistration,
    observations: observations(state), collector: { ...(accepted(state.collectorIntent, "collector intent").fragment as CollectorIntent), signature } };
}
export function issueR20Collection(state: R20AcquisitionState) {
  assertR20AcquisitionState(state); const expected = request(state, { action: "collection", subject: "collection", authority: "collector", signerId: "collector", ordinal: 0,
    assignmentDigest: null, prerequisiteDigests: [digest(accepted(state.collectorIntent, "collector intent"))], candidateDigest: digest(signableR20Campaign(draft(state, ""))) });
  state.collection ??= { request: expected }; return state.collection.request;
}
function validateCollection(state: R20AcquisitionState, fragment: any) {
  const campaign = draft(state, fragment?.campaignSignature ?? ""), pem = state.publicKeys[state.collectorKeyId]!;
  if (!fragment || Object.keys(fragment).join() !== "campaignSignature" || typeof fragment.campaignSignature !== "string" ||
      !verify(null, Buffer.from(canonicalSemanticJson(signableR20Campaign(campaign))), pem, Buffer.from(fragment.campaignSignature, "base64")))
    throw Error("R20 acquisition campaign signature invalid");
}
export function acceptR20Collection(state: R20AcquisitionState, response: R20AcquisitionResponse) {
  assertR20AcquisitionState(state); if (!state.collection) throw Error("R20 acquisition collection request missing");
  validateCollection(state, response.fragment); return accept(state, state.collection, response);
}
export function assembleR20AcquisitionBundle(state: R20AcquisitionState) {
  assertR20AcquisitionState(state); const signature = (accepted(state.collection, "collection").fragment as any).campaignSignature, bundle = draft(state, signature), bundleDigest = digest(bundle);
  if (state.assembledBundleDigest && state.assembledBundleDigest !== bundleDigest) throw Error("R20 acquisition assembly drift"); state.assembledBundleDigest = bundleDigest; return bundle;
}

export function assertR20AcquisitionState(state: R20AcquisitionState) {
  exact(state, ["schema", "checkpoint", "campaignId", "createdAt", "manifestDigest", "registrationKeyId", "collectorKeyId", "participantKeyIds", "publicKeys", "registration", "trials", "collectorIntent", "collection", "assembledBundleDigest"].filter((x) => x in state), "state");
  if (state.schema !== "open-autonomy.bench-r20-acquisition-state.v1" || state.checkpoint !== "R20" || !state.campaignId || !Number.isFinite(Date.parse(state.createdAt)) || state.manifestDigest !== digest(MANIFEST))
    throw Error("R20 acquisition state invalid"); validateRegistry(state);
  const check = (exchange: Exchange | undefined) => { if (!exchange) return; validateRequest(state, exchange.request); validateResponse(state, exchange); };
  check(state.registration); Object.values(state.trials).forEach(check); check(state.collectorIntent); check(state.collection);
  if (state.registration) {
    const expected = request(state, { action: "registration", subject: "registration", authority: "registration", signerId: "registration-authority", ordinal: 0, assignmentDigest: null, prerequisiteDigests: [], candidateDigest: null });
    if (canonicalSemanticJson(state.registration.request) !== canonicalSemanticJson(expected)) throw Error("R20 acquisition registration request drift");
    if (state.registration.response) {
      validateRegistration(state, state.registration.response.fragment as R20CampaignRegistration); const registration = state.registration.response.fragment as R20CampaignRegistration;
      for (const [trialId, exchange] of Object.entries(state.trials)) {
        const ordinal = registration.trials.findIndex((x) => x.id === trialId), assignment = registration.trials[ordinal];
        if (!assignment) throw Error("R20 acquisition unregistered stored trial");
        const expectedTrial = request(state, { action: "observation", subject: trialId, authority: "participant", signerId: assignment.participantId, ordinal: ordinal + 1,
          assignmentDigest: digest(assignment), prerequisiteDigests: [digest(state.registration.response)], candidateDigest: null });
        if (canonicalSemanticJson(exchange.request) !== canonicalSemanticJson(expectedTrial)) throw Error("R20 acquisition observation request drift");
        if (exchange.response) validateObservation(state, exchange, exchange.response.fragment as R20Observation);
      }
    } else if (Object.keys(state.trials).length) throw Error("R20 acquisition trials before registration");
  }
  if (state.collectorIntent) {
    const values = observations(state), registration = accepted(state.registration, "registration").fragment as R20CampaignRegistration,
      expected = request(state, { action: "collector-intent", subject: "collector-intent", authority: "collector", signerId: "collector", ordinal: 0, assignmentDigest: null,
        prerequisiteDigests: values.map((_, i) => digest(accepted(state.trials[registration.trials[i]!.id], "trial"))), candidateDigest: null });
    if (canonicalSemanticJson(state.collectorIntent.request) !== canonicalSemanticJson(expected)) throw Error("R20 acquisition collector intent request drift");
    if (state.collectorIntent.response) validateCollectorIntent(state, state.collectorIntent.response.fragment as CollectorIntent);
  }
  if (state.collection) {
    const expected = request(state, { action: "collection", subject: "collection", authority: "collector", signerId: "collector", ordinal: 0, assignmentDigest: null,
      prerequisiteDigests: [digest(accepted(state.collectorIntent, "collector intent"))], candidateDigest: digest(signableR20Campaign(draft(state, ""))) });
    if (canonicalSemanticJson(state.collection.request) !== canonicalSemanticJson(expected)) throw Error("R20 acquisition collection request drift");
    if (state.collection.response) validateCollection(state, state.collection.response.fragment);
  }
  if (state.assembledBundleDigest !== null) {
    const signature = (accepted(state.collection, "collection").fragment as any).campaignSignature;
    if (state.assembledBundleDigest !== digest(draft(state, signature))) throw Error("R20 acquisition assembled state invalid");
  }
  return state;
}
export function saveR20AcquisitionState(path: string, state: R20AcquisitionState) {
  assertR20AcquisitionState(state); saveR20AcquisitionJson(path, state);
}
export function saveR20AcquisitionJson(path: string, value: unknown) {
  const target = resolve(path), temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, `${canonicalSemanticJson(value)}\n`, { flag: "wx", mode: 0o600 }); const fd = openSync(temp, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, target); const dir = openSync(dirname(target), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
}
export function loadR20AcquisitionState(path: string) { return assertR20AcquisitionState(JSON.parse(readFileSync(path, "utf8")) as R20AcquisitionState); }
