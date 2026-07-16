import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonicalSemanticJson } from "@open-autonomy/core";
import { signableR28Campaign, type R28ExternalCampaign } from "./r28-external-campaign";

type Digest = `sha256:${string}`;
export type R28AcquisitionRole = "registration-authority" | "heartbeat-collector" | "crash-injector" |
  "proposal-custodian" | "audit-custodian" | "finalizer" | "validator";
export type R28Stream = "heartbeats" | "crashes" | "proposals" | "audit";
const STREAMS = ["heartbeats", "crashes", "proposals", "audit"] as const;
const STREAM_ROLE: Record<R28Stream, R28AcquisitionRole> = {
  heartbeats: "heartbeat-collector", crashes: "crash-injector", proposals: "proposal-custodian", audit: "audit-custodian",
};
const ROLES: R28AcquisitionRole[] = ["registration-authority", "heartbeat-collector", "crash-injector", "proposal-custodian", "audit-custodian", "finalizer", "validator"];
const digest = (value: unknown): Digest => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const exact = (value: object, keys: string[], name: string) => {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`R28 acquisition ${name} schema invalid`);
};
const MANIFEST = {
  version: 1, streams: STREAMS.map((stream) => ({ stream, role: STREAM_ROLE[stream], appendOnly: true, externallySealed: true })),
  sequence: ["registration", "stream-appends", "stream-seals", "completion", "validator-intent", "validation"],
};

export type R28Registration = Pick<R28ExternalCampaign, "dependencies" | "bounds" | "protectedControls" | "roleGrants"> & {
  repositoryBaseline: Pick<R28ExternalCampaign["repository"], "remoteDigest" | "baselineHead">;
};
export type R28Completion = Pick<R28ExternalCampaign, "repository" | "attacks" | "pause" | "residuals" | "generatedAt">;
export type R28ValidatorIntent = Omit<R28ExternalCampaign["validator"], "signature">;
export type R28AcquisitionRequest = {
  schema: "open-autonomy.bench-r28-acquisition-request.v1";
  checkpoint: "R28";
  campaignId: string;
  action: "registration" | "append" | "seal" | "completion" | "validator-intent" | "validation";
  subject: "registration" | R28Stream | "completion" | "validator-intent" | "validation";
  role: R28AcquisitionRole;
  manifestDigest: Digest;
  ordinal: number;
  prerequisiteDigests: Digest[];
  candidateDigest: Digest | null;
};
export type R28AcquisitionResponse = {
  schema: "open-autonomy.bench-r28-acquisition-response.v1";
  requestDigest: Digest;
  fragmentDigest: Digest;
  signerKeyId: string;
  signedAt: string;
  signature: string;
  fragment: unknown;
};
type Exchange = { request: R28AcquisitionRequest; response?: R28AcquisitionResponse };
export type R28AcquisitionState = {
  schema: "open-autonomy.bench-r28-acquisition-state.v1";
  checkpoint: "R28";
  campaignId: string;
  createdAt: string;
  manifestDigest: Digest;
  roleKeys: Record<R28AcquisitionRole, string>;
  publicKeys: Record<string, string>;
  registration?: Exchange;
  streams: Record<R28Stream, { entries: Exchange[]; seal?: Exchange }>;
  completion?: Exchange;
  validatorIntent?: Exchange;
  validation?: Exchange;
  assembledBundleDigest: Digest | null;
};

function registry(roleKeys: Record<R28AcquisitionRole, string>, publicKeys: Record<string, string>) {
  if (Object.keys(roleKeys).sort().join("\0") !== [...ROLES].sort().join("\0")) throw Error("R28 acquisition role registry incomplete");
  const ids = Object.values(roleKeys);
  if (new Set(ids).size !== ids.length || ids.some((id) => !publicKeys[id])) throw Error("R28 acquisition role keys must be distinct and registered");
  let fps: string[];
  try { fps = ids.map((id) => createHash("sha256").update(createPublicKey(publicKeys[id]!).export({ type: "spki", format: "der" })).digest("hex")); }
  catch { throw Error("R28 acquisition public key invalid"); }
  if (new Set(fps).size !== fps.length) throw Error("R28 acquisition public keys must be cryptographically distinct");
}
function request(state: R28AcquisitionState, input: Omit<R28AcquisitionRequest, "schema" | "checkpoint" | "campaignId" | "manifestDigest">): R28AcquisitionRequest {
  return { schema: "open-autonomy.bench-r28-acquisition-request.v1", checkpoint: "R28", campaignId: state.campaignId,
    manifestDigest: state.manifestDigest, ...input };
}
function validateRequest(state: R28AcquisitionState, value: R28AcquisitionRequest) {
  exact(value, ["schema", "checkpoint", "campaignId", "action", "subject", "role", "manifestDigest", "ordinal", "prerequisiteDigests", "candidateDigest"], "request");
  if (value.schema !== "open-autonomy.bench-r28-acquisition-request.v1" || value.checkpoint !== "R28" || value.campaignId !== state.campaignId ||
      value.manifestDigest !== state.manifestDigest || !Number.isSafeInteger(value.ordinal) || value.ordinal < 0 ||
      !value.prerequisiteDigests.every((x) => /^sha256:[a-f0-9]{64}$/.test(x)) ||
      (value.candidateDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(value.candidateDigest))) throw Error("R28 acquisition request invalid");
}
function validateResponse(state: R28AcquisitionState, exchange: Exchange, role: R28AcquisitionRole) {
  const value = exchange.response;
  if (!value) return;
  exact(value, ["schema", "requestDigest", "fragmentDigest", "signerKeyId", "signedAt", "signature", "fragment"], "response");
  const keyId = state.roleKeys[role];
  if (value.schema !== "open-autonomy.bench-r28-acquisition-response.v1" || value.requestDigest !== digest(exchange.request) ||
      value.fragmentDigest !== digest(value.fragment) || value.signerKeyId !== keyId || !Number.isFinite(Date.parse(value.signedAt)) ||
      Date.parse(value.signedAt) < Date.parse(state.createdAt)) throw Error("R28 acquisition response binding invalid");
  const body = { schema: value.schema, requestDigest: value.requestDigest, fragmentDigest: value.fragmentDigest, signerKeyId: value.signerKeyId, signedAt: value.signedAt };
  let signature: Buffer;
  try { signature = Buffer.from(value.signature, "base64"); } catch { throw Error("R28 acquisition response signature invalid"); }
  if (!signature.length || !verify(null, Buffer.from(canonicalSemanticJson(body)), state.publicKeys[keyId]!, signature)) throw Error("R28 acquisition response signature invalid");
}
function accept(state: R28AcquisitionState, exchange: Exchange, role: R28AcquisitionRole, response: R28AcquisitionResponse) {
  if (state.assembledBundleDigest) throw Error("R28 acquisition already assembled");
  if (exchange.response && canonicalSemanticJson(exchange.response) !== canonicalSemanticJson(response)) throw Error("R28 acquisition equivocation rejected");
  const candidate = { request: exchange.request, response };
  validateResponse(state, candidate, role);
  exchange.response = response;
  return digest(response);
}
const accepted = (exchange: Exchange | undefined, name: string) => {
  if (!exchange?.response) throw Error(`R28 acquisition ${name} response missing`);
  return exchange.response;
};
function validateRegistrationFragment(fragment: R28Registration) {
  if (!fragment || Object.keys(fragment).sort().join() !== "bounds,dependencies,protectedControls,repositoryBaseline,roleGrants")
    throw Error("R28 acquisition registration fragment invalid");
  exact(fragment.repositoryBaseline, ["remoteDigest", "baselineHead"], "repository baseline");
}
function validateCompletionFragment(fragment: R28Completion, registration: R28Registration) {
  if (!fragment || Object.keys(fragment).sort().join() !== "attacks,generatedAt,pause,repository,residuals" ||
      !Array.isArray(fragment.residuals) || fragment.residuals.length || !Number.isFinite(Date.parse(fragment.generatedAt)) ||
      fragment.repository?.remoteDigest !== registration.repositoryBaseline.remoteDigest ||
      fragment.repository?.baselineHead !== registration.repositoryBaseline.baselineHead)
    throw Error("R28 acquisition completion fragment invalid");
}
function validateIntentFragment(state: R28AcquisitionState, intent: R28ValidatorIntent) {
  const keyId = state.roleKeys.validator;
  if (!intent || intent.keyId !== keyId || intent.publicKeyPem !== state.publicKeys[keyId] || !intent.identity || !Number.isFinite(Date.parse(intent.signedAt)) ||
      intent.signedAt !== (accepted(state.completion, "completion").fragment as R28Completion).generatedAt ||
      Object.keys(intent).sort().join() !== "identity,keyId,publicKeyPem,signedAt") throw Error("R28 acquisition validator intent invalid");
}
function validateCampaignSignature(state: R28AcquisitionState, fragment: any) {
  const campaign = draft(state, fragment?.campaignSignature ?? ""), pem = campaign.validator.publicKeyPem;
  if (!fragment || Object.keys(fragment).join() !== "campaignSignature" || typeof fragment.campaignSignature !== "string" ||
      !verify(null, Buffer.from(canonicalSemanticJson(signableR28Campaign(campaign))), pem, Buffer.from(fragment.campaignSignature, "base64")))
    throw Error("R28 acquisition campaign signature invalid");
}

export function createR28AcquisitionState(input: { campaignId: string; createdAt: string; roleKeys: Record<R28AcquisitionRole, string>; publicKeys: Record<string, string> }): R28AcquisitionState {
  if (!input.campaignId || !Number.isFinite(Date.parse(input.createdAt))) throw Error("R28 acquisition identity invalid");
  registry(input.roleKeys, input.publicKeys);
  return { schema: "open-autonomy.bench-r28-acquisition-state.v1", checkpoint: "R28", campaignId: input.campaignId, createdAt: input.createdAt,
    manifestDigest: digest(MANIFEST), roleKeys: { ...input.roleKeys }, publicKeys: { ...input.publicKeys },
    streams: { heartbeats: { entries: [] }, crashes: { entries: [] }, proposals: { entries: [] }, audit: { entries: [] } }, assembledBundleDigest: null };
}
export function issueR28Registration(state: R28AcquisitionState) {
  assertR28AcquisitionState(state);
  const expected = request(state, { action: "registration", subject: "registration", role: "registration-authority", ordinal: 0, prerequisiteDigests: [], candidateDigest: null });
  if (state.registration && canonicalSemanticJson(state.registration.request) !== canonicalSemanticJson(expected)) throw Error("R28 acquisition registration drift");
  state.registration ??= { request: expected };
  return state.registration.request;
}
export function acceptR28Registration(state: R28AcquisitionState, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  if (!state.registration) throw Error("R28 acquisition registration request missing");
  validateRegistrationFragment(response.fragment as R28Registration);
  return accept(state, state.registration, "registration-authority", response);
}
export function issueR28Append(state: R28AcquisitionState, stream: R28Stream) {
  assertR28AcquisitionState(state); const registration = accepted(state.registration, "registration");
  const target = state.streams[stream]; if (!target || target.seal) throw Error("R28 acquisition stream invalid or sealed");
  const previous = target.entries.at(-1), ordinal = target.entries.length + 1;
  if (previous && !previous.response) return previous.request;
  const expected = request(state, { action: "append", subject: stream, role: STREAM_ROLE[stream], ordinal,
    prerequisiteDigests: [digest(previous?.response ?? registration)], candidateDigest: null });
  target.entries.push({ request: expected }); return expected;
}
export function acceptR28Append(state: R28AcquisitionState, stream: R28Stream, ordinal: number, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  const target = state.streams[stream]; if (!target || ordinal !== target.entries.length) throw Error("R28 acquisition append ordinal invalid");
  return accept(state, target.entries[ordinal - 1]!, STREAM_ROLE[stream], response);
}
export function issueR28Seal(state: R28AcquisitionState, stream: R28Stream) {
  assertR28AcquisitionState(state); const target = state.streams[stream];
  if (!target?.entries.length || target.entries.some((x) => !x.response)) throw Error("R28 acquisition stream is empty or pending");
  const expected = request(state, { action: "seal", subject: stream, role: STREAM_ROLE[stream], ordinal: target.entries.length,
    prerequisiteDigests: [digest(target.entries.at(-1)!.response!)], candidateDigest: null });
  if (target.seal && canonicalSemanticJson(target.seal.request) !== canonicalSemanticJson(expected)) throw Error("R28 acquisition seal drift");
  target.seal ??= { request: expected }; return target.seal.request;
}
export function acceptR28Seal(state: R28AcquisitionState, stream: R28Stream, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  const target = state.streams[stream]; if (!target?.seal) throw Error("R28 acquisition seal request missing");
  const fragment = response.fragment as any;
  if (!fragment || fragment.count !== target.entries.length || fragment.headResponseDigest !== digest(target.entries.at(-1)!.response!) ||
      Object.keys(fragment).sort().join() !== "count,headResponseDigest") throw Error("R28 acquisition seal summary invalid");
  return accept(state, target.seal, STREAM_ROLE[stream], response);
}
function sealedDigests(state: R28AcquisitionState) { return STREAMS.map((stream) => digest(accepted(state.streams[stream].seal, `${stream} seal`))); }
export function issueR28Completion(state: R28AcquisitionState) {
  assertR28AcquisitionState(state); const expected = request(state, { action: "completion", subject: "completion", role: "finalizer", ordinal: 0,
    prerequisiteDigests: [digest(accepted(state.registration, "registration")), ...sealedDigests(state)], candidateDigest: null });
  if (state.completion && canonicalSemanticJson(state.completion.request) !== canonicalSemanticJson(expected)) throw Error("R28 acquisition completion drift");
  state.completion ??= { request: expected }; return state.completion.request;
}
export function acceptR28Completion(state: R28AcquisitionState, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  if (!state.completion) throw Error("R28 acquisition completion request missing");
  validateCompletionFragment(response.fragment as R28Completion, accepted(state.registration, "registration").fragment as R28Registration);
  return accept(state, state.completion, "finalizer", response);
}
export function issueR28ValidatorIntent(state: R28AcquisitionState) {
  assertR28AcquisitionState(state); const expected = request(state, { action: "validator-intent", subject: "validator-intent", role: "validator", ordinal: 0,
    prerequisiteDigests: [digest(accepted(state.completion, "completion"))], candidateDigest: null });
  state.validatorIntent ??= { request: expected }; return state.validatorIntent.request;
}
export function acceptR28ValidatorIntent(state: R28AcquisitionState, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  if (!state.validatorIntent) throw Error("R28 acquisition validator intent request missing");
  validateIntentFragment(state, response.fragment as R28ValidatorIntent);
  return accept(state, state.validatorIntent, "validator", response);
}
function draft(state: R28AcquisitionState, signature: string): R28ExternalCampaign {
  const registration = accepted(state.registration, "registration").fragment as R28Registration,
    completion = accepted(state.completion, "completion").fragment as R28Completion,
    intent = accepted(state.validatorIntent, "validator intent").fragment as R28ValidatorIntent;
  return { schema: "open-autonomy.bench-r28-external-campaign.v1", closureClaim: false, campaignId: state.campaignId,
    generatedAt: completion.generatedAt, dependencies: registration.dependencies, repository: completion.repository, bounds: registration.bounds,
    protectedControls: registration.protectedControls, roleGrants: registration.roleGrants,
    heartbeats: state.streams.heartbeats.entries.map((x) => x.response!.fragment) as any,
    crashes: state.streams.crashes.entries.map((x) => x.response!.fragment) as any,
    proposals: state.streams.proposals.entries.map((x) => x.response!.fragment) as any,
    attacks: completion.attacks, pause: completion.pause,
    audit: state.streams.audit.entries.map((x) => x.response!.fragment) as any,
    residuals: completion.residuals, validator: { ...intent, signature } };
}
export function issueR28Validation(state: R28AcquisitionState) {
  assertR28AcquisitionState(state); const candidateDigest = digest(signableR28Campaign(draft(state, ""))), expected = request(state,
    { action: "validation", subject: "validation", role: "validator", ordinal: 0,
      prerequisiteDigests: [digest(accepted(state.validatorIntent, "validator intent"))], candidateDigest });
  state.validation ??= { request: expected }; return state.validation.request;
}
export function acceptR28Validation(state: R28AcquisitionState, response: R28AcquisitionResponse) {
  assertR28AcquisitionState(state);
  if (!state.validation) throw Error("R28 acquisition validation request missing");
  validateCampaignSignature(state, response.fragment);
  return accept(state, state.validation, "validator", response);
}
export function assembleR28AcquisitionCampaign(state: R28AcquisitionState) {
  assertR28AcquisitionState(state); const signature = (accepted(state.validation, "validation").fragment as any).campaignSignature,
    campaign = draft(state, signature), campaignDigest = digest(campaign);
  if (state.assembledBundleDigest && state.assembledBundleDigest !== campaignDigest) throw Error("R28 acquisition assembly drift");
  state.assembledBundleDigest = campaignDigest; return campaign;
}

export function assertR28AcquisitionState(state: R28AcquisitionState) {
  exact(state, ["schema", "checkpoint", "campaignId", "createdAt", "manifestDigest", "roleKeys", "publicKeys", "registration", "streams", "completion", "validatorIntent", "validation", "assembledBundleDigest"].filter((x) => x in state), "state");
  if (state.schema !== "open-autonomy.bench-r28-acquisition-state.v1" || state.checkpoint !== "R28" || !state.campaignId ||
      !Number.isFinite(Date.parse(state.createdAt)) || state.manifestDigest !== digest(MANIFEST)) throw Error("R28 acquisition state invalid");
  registry(state.roleKeys, state.publicKeys);
  if (Object.keys(state.streams).sort().join() !== [...STREAMS].sort().join()) throw Error("R28 acquisition stream registry invalid");
  const check = (exchange: Exchange | undefined, role: R28AcquisitionRole) => { if (!exchange) return; validateRequest(state, exchange.request); validateResponse(state, exchange, role); };
  check(state.registration, "registration-authority");
  for (const stream of STREAMS) { state.streams[stream].entries.forEach((x) => check(x, STREAM_ROLE[stream])); check(state.streams[stream].seal, STREAM_ROLE[stream]); }
  check(state.completion, "finalizer"); check(state.validatorIntent, "validator"); check(state.validation, "validator");
  const same = (actual: R28AcquisitionRequest, expected: R28AcquisitionRequest, name: string) => {
    if (canonicalSemanticJson(actual) !== canonicalSemanticJson(expected)) throw Error(`R28 acquisition ${name} request drift`);
  };
  if (state.registration) same(state.registration.request, request(state, { action: "registration", subject: "registration", role: "registration-authority", ordinal: 0, prerequisiteDigests: [], candidateDigest: null }), "registration");
  for (const stream of STREAMS) {
    const target = state.streams[stream], registration = state.registration?.response;
    if (target.entries.length && !registration) throw Error("R28 acquisition append without registration");
    target.entries.forEach((exchange, index) => {
      const previous = index ? target.entries[index - 1]!.response : registration;
      if (!previous) throw Error("R28 acquisition append predecessor missing");
      same(exchange.request, request(state, { action: "append", subject: stream, role: STREAM_ROLE[stream], ordinal: index + 1,
        prerequisiteDigests: [digest(previous)], candidateDigest: null }), `${stream} append`);
    });
    if (target.seal) {
      const last = target.entries.at(-1)?.response;
      if (!last || target.entries.some((x) => !x.response)) throw Error("R28 acquisition seal before complete stream");
      same(target.seal.request, request(state, { action: "seal", subject: stream, role: STREAM_ROLE[stream], ordinal: target.entries.length,
        prerequisiteDigests: [digest(last)], candidateDigest: null }), `${stream} seal`);
      if (target.seal.response) {
        const summary = target.seal.response.fragment as any;
        if (!summary || summary.count !== target.entries.length || summary.headResponseDigest !== digest(last)) throw Error("R28 acquisition stored seal summary invalid");
      }
    }
  }
  if (state.completion) same(state.completion.request, request(state, { action: "completion", subject: "completion", role: "finalizer", ordinal: 0,
    prerequisiteDigests: [digest(accepted(state.registration, "registration")), ...sealedDigests(state)], candidateDigest: null }), "completion");
  if (state.validatorIntent) same(state.validatorIntent.request, request(state, { action: "validator-intent", subject: "validator-intent", role: "validator", ordinal: 0,
    prerequisiteDigests: [digest(accepted(state.completion, "completion"))], candidateDigest: null }), "validator intent");
  if (state.validation) same(state.validation.request, request(state, { action: "validation", subject: "validation", role: "validator", ordinal: 0,
    prerequisiteDigests: [digest(accepted(state.validatorIntent, "validator intent"))], candidateDigest: digest(signableR28Campaign(draft(state, ""))) }), "validation");
  if (state.registration?.response) validateRegistrationFragment(state.registration.response.fragment as R28Registration);
  if (state.completion?.response) validateCompletionFragment(state.completion.response.fragment as R28Completion, accepted(state.registration, "registration").fragment as R28Registration);
  if (state.validatorIntent?.response) validateIntentFragment(state, state.validatorIntent.response.fragment as R28ValidatorIntent);
  if (state.validation?.response) validateCampaignSignature(state, state.validation.response.fragment);
  if (state.assembledBundleDigest !== null) {
    const signature = (accepted(state.validation, "validation").fragment as any).campaignSignature;
    if (state.assembledBundleDigest !== digest(draft(state, signature))) throw Error("R28 acquisition assembled state invalid");
  }
  return state;
}
export function saveR28AcquisitionState(path: string, state: R28AcquisitionState) {
  assertR28AcquisitionState(state); saveR28AcquisitionJson(path, state);
}
export function saveR28AcquisitionJson(path: string, value: unknown) {
  const target = resolve(path), temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, `${canonicalSemanticJson(value)}\n`, { flag: "wx", mode: 0o600 }); const fd = openSync(temp, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, target); const dir = openSync(dirname(target), "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
export function loadR28AcquisitionState(path: string) { return assertR28AcquisitionState(JSON.parse(readFileSync(path, "utf8")) as R28AcquisitionState); }
