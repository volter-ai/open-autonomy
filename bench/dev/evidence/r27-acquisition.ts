import { renameSync, writeFileSync, openSync, closeSync, fsyncSync, readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
import { dirname, resolve } from "node:path";
import { canonicalSemanticJson } from "@open-autonomy/core";
import type { R27ExternalBundle } from "./r27-external-closure";

type Digest = `sha256:${string}`;
export type R27AcquisitionRole =
  | "dependency-custodian" | "registrar" | "population" | "assignment"
  | "exposure" | "outcome" | "diagnostics" | "analyst" | "decision"
  | "rollback-worker" | "cleanup";

export const R27_ACQUISITION_STAGES = [
  { id: "dependencies", role: "dependency-custodian", after: [] },
  { id: "registration", role: "registrar", after: ["dependencies"] },
  { id: "population", role: "population", after: ["registration"] },
  { id: "seedReveal", role: "assignment", after: ["population"] },
  { id: "assignments", role: "assignment", after: ["seedReveal"] },
  { id: "exposures", role: "exposure", after: ["assignments"] },
  { id: "outcomes", role: "outcome", after: ["exposures"] },
  { id: "missing", role: "outcome", after: ["outcomes"] },
  { id: "exclusions", role: "outcome", after: ["missing"] },
  { id: "analysisCode", role: "analyst", after: ["registration"] },
  { id: "diagnostics", role: "diagnostics", after: ["outcomes", "exclusions"] },
  { id: "analysis", role: "analyst", after: ["diagnostics", "analysisCode"] },
  { id: "decision", role: "decision", after: ["analysis"] },
  { id: "rollback", role: "rollback-worker", after: ["decision"] },
  { id: "cleanup", role: "cleanup", after: ["rollback"] },
  { id: "closedAt", role: "cleanup", after: ["cleanup"] },
] as const satisfies readonly { id: keyof R27ExternalBundle; role: R27AcquisitionRole; after: readonly (keyof R27ExternalBundle)[] }[];

export type R27Stage = typeof R27_ACQUISITION_STAGES[number]["id"];
export type R27AcquisitionRequest = {
  schema: "open-autonomy.bench-r27-acquisition-request.v1";
  checkpoint: "R27";
  campaignId: string;
  stage: R27Stage;
  role: R27AcquisitionRole;
  manifestDigest: Digest;
  prerequisites: Array<{ stage: R27Stage; responseDigest: Digest }>;
};
export type R27AcquisitionResponse = {
  schema: "open-autonomy.bench-r27-acquisition-response.v1";
  requestDigest: Digest;
  fragmentDigest: Digest;
  signerKeyId: string;
  signedAt: string;
  signature: string;
  fragment: unknown;
};
export type R27AcquisitionState = {
  schema: "open-autonomy.bench-r27-acquisition-state.v1";
  checkpoint: "R27";
  campaignId: string;
  createdAt: string;
  manifestDigest: Digest;
  roleKeys: Record<R27AcquisitionRole, string>;
  publicKeys: Record<string, string>;
  requests: Partial<Record<R27Stage, R27AcquisitionRequest>>;
  responses: Partial<Record<R27Stage, R27AcquisitionResponse>>;
  assembledBundleDigest: Digest | null;
};

const digest = (value: unknown): Digest =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const manifest = R27_ACQUISITION_STAGES.map(({ id, role, after }) => ({ id, role, after: [...after] }));
const exact = (value: object, keys: string[], name: string) => {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`R27 acquisition ${name} schema invalid`);
};
const stageDefinition = (stage: R27Stage) => {
  const found = R27_ACQUISITION_STAGES.find((x) => x.id === stage);
  if (!found) throw Error("R27 acquisition stage invalid");
  return found;
};
function validateRegistry(roleKeys: Record<R27AcquisitionRole, string>, publicKeys: Record<string, string>) {
  const requiredRoles = [...new Set(R27_ACQUISITION_STAGES.map((x) => x.role))];
  if (Object.keys(roleKeys).sort().join("\0") !== requiredRoles.sort().join("\0")) throw Error("R27 acquisition role registry incomplete");
  const ids = Object.values(roleKeys);
  if (new Set(ids).size !== ids.length || ids.some((id) => !publicKeys[id])) throw Error("R27 acquisition role keys must be distinct and registered");
  let fingerprints: string[];
  try { fingerprints = ids.map((id) => createHash("sha256").update(createPublicKey(publicKeys[id]!).export({ type: "spki", format: "der" })).digest("hex")); }
  catch { throw Error("R27 acquisition public key invalid"); }
  if (new Set(fingerprints).size !== fingerprints.length) throw Error("R27 acquisition public keys must be cryptographically distinct");
}
function validateResponseBinding(state: R27AcquisitionState, stage: R27Stage, response: R27AcquisitionResponse) {
  const request = state.requests[stage];
  if (!request) throw Error("R27 acquisition request was not issued");
  exact(response, ["schema", "requestDigest", "fragmentDigest", "signerKeyId", "signedAt", "signature", "fragment"], "response");
  const role = stageDefinition(stage).role, keyId = state.roleKeys[role];
  if (response.schema !== "open-autonomy.bench-r27-acquisition-response.v1" || response.requestDigest !== digest(request) ||
      response.fragmentDigest !== digest(response.fragment) || response.signerKeyId !== keyId || !Number.isFinite(Date.parse(response.signedAt)) ||
      Date.parse(response.signedAt) < Date.parse(state.createdAt)) throw Error("R27 acquisition response binding invalid");
  const signedBody = { schema: response.schema, requestDigest: response.requestDigest, fragmentDigest: response.fragmentDigest,
    signerKeyId: response.signerKeyId, signedAt: response.signedAt };
  let signature: Buffer;
  try { signature = Buffer.from(response.signature, "base64"); } catch { throw Error("R27 acquisition response signature invalid"); }
  if (!signature.length || !verify(null, Buffer.from(canonicalSemanticJson(signedBody)), state.publicKeys[keyId]!, signature))
    throw Error("R27 acquisition response signature invalid");
}

export function createR27AcquisitionState(input: {
  campaignId: string; createdAt: string; roleKeys: Record<R27AcquisitionRole, string>; publicKeys: Record<string, string>;
}): R27AcquisitionState {
  if (!input.campaignId || !Number.isFinite(Date.parse(input.createdAt))) throw Error("R27 acquisition identity invalid");
  validateRegistry(input.roleKeys, input.publicKeys);
  return { schema: "open-autonomy.bench-r27-acquisition-state.v1", checkpoint: "R27", campaignId: input.campaignId,
    createdAt: input.createdAt, manifestDigest: digest(manifest), roleKeys: { ...input.roleKeys }, publicKeys: { ...input.publicKeys },
    requests: {}, responses: {}, assembledBundleDigest: null };
}

export function issueR27AcquisitionRequest(state: R27AcquisitionState, stage: R27Stage): R27AcquisitionRequest {
  assertR27AcquisitionState(state);
  if (state.assembledBundleDigest) throw Error("R27 acquisition already assembled");
  const definition = stageDefinition(stage), existing = state.requests[stage];
  const prerequisites = definition.after.map((prior) => {
    const accepted = state.responses[prior];
    if (!accepted) throw Error(`R27 acquisition prerequisite ${prior} missing`);
    return { stage: prior, responseDigest: digest(accepted) };
  });
  const request: R27AcquisitionRequest = { schema: "open-autonomy.bench-r27-acquisition-request.v1", checkpoint: "R27",
    campaignId: state.campaignId, stage, role: definition.role, manifestDigest: state.manifestDigest, prerequisites };
  if (existing && canonicalSemanticJson(existing) !== canonicalSemanticJson(request)) throw Error("R27 acquisition request prerequisite drift");
  state.requests[stage] = request;
  return request;
}

export function acceptR27AcquisitionResponse(state: R27AcquisitionState, stage: R27Stage, response: R27AcquisitionResponse) {
  assertR27AcquisitionState(state);
  if (state.assembledBundleDigest) throw Error("R27 acquisition already assembled");
  validateResponseBinding(state, stage, response);
  const existing = state.responses[stage];
  if (existing && canonicalSemanticJson(existing) !== canonicalSemanticJson(response)) throw Error("R27 acquisition equivocation rejected");
  state.responses[stage] = response;
  return digest(response);
}

export function assembleR27AcquisitionBundle(state: R27AcquisitionState): R27ExternalBundle {
  assertR27AcquisitionState(state);
  const bundle = acquisitionBundle(state);
  const bundleDigest = digest(bundle);
  if (state.assembledBundleDigest && state.assembledBundleDigest !== bundleDigest) throw Error("R27 acquisition assembly drift");
  state.assembledBundleDigest = bundleDigest;
  return bundle;
}
function acquisitionBundle(state: R27AcquisitionState): R27ExternalBundle {
  const fragments = Object.fromEntries(R27_ACQUISITION_STAGES.map(({ id }) => {
    const response = state.responses[id];
    if (!response) throw Error(`R27 acquisition response ${id} missing`);
    return [id, response.fragment];
  })) as unknown as Omit<R27ExternalBundle, "schema" | "closureClaim">;
  return { schema: "open-autonomy.bench-r27-external-closure.v1", closureClaim: true, ...fragments } as R27ExternalBundle;
}

export function assertR27AcquisitionState(state: R27AcquisitionState) {
  exact(state, ["schema", "checkpoint", "campaignId", "createdAt", "manifestDigest", "roleKeys", "publicKeys", "requests", "responses", "assembledBundleDigest"], "state");
  if (state.schema !== "open-autonomy.bench-r27-acquisition-state.v1" || state.checkpoint !== "R27" || !state.campaignId ||
      !Number.isFinite(Date.parse(state.createdAt)) || state.manifestDigest !== digest(manifest)) throw Error("R27 acquisition state invalid");
  validateRegistry(state.roleKeys, state.publicKeys);
  for (const stage of Object.keys(state.requests) as R27Stage[]) {
    if (!R27_ACQUISITION_STAGES.some((x) => x.id === stage)) throw Error("R27 acquisition unknown request stage");
    const request = state.requests[stage]!, definition = stageDefinition(stage);
    exact(request, ["schema", "checkpoint", "campaignId", "stage", "role", "manifestDigest", "prerequisites"], "request");
    const prerequisites = definition.after.map((prior) => {
      const response = state.responses[prior];
      if (!response) throw Error(`R27 acquisition prerequisite ${prior} missing`);
      return { stage: prior, responseDigest: digest(response) };
    });
    if (request.schema !== "open-autonomy.bench-r27-acquisition-request.v1" || request.checkpoint !== "R27" || request.stage !== stage ||
        request.role !== definition.role || request.campaignId !== state.campaignId || request.manifestDigest !== state.manifestDigest ||
        canonicalSemanticJson(request.prerequisites) !== canonicalSemanticJson(prerequisites)) throw Error("R27 acquisition stored request invalid");
  }
  for (const stage of Object.keys(state.responses) as R27Stage[]) {
    if (!R27_ACQUISITION_STAGES.some((x) => x.id === stage)) throw Error("R27 acquisition unknown response stage");
    validateResponseBinding(state, stage, state.responses[stage]!);
  }
  if (state.assembledBundleDigest !== null && state.assembledBundleDigest !== digest(acquisitionBundle(state)))
    throw Error("R27 acquisition assembled state invalid");
  return state;
}

export function loadR27AcquisitionState(path: string): R27AcquisitionState {
  return assertR27AcquisitionState(JSON.parse(readFileSync(path, "utf8")));
}

/** Atomic replace plus file and parent-directory fsync: accepted evidence survives a successful return. */
export function saveR27AcquisitionState(path: string, state: R27AcquisitionState) {
  assertR27AcquisitionState(state);
  saveR27AcquisitionJson(path, state);
}

export function saveR27AcquisitionJson(path: string, value: unknown) {
  const target = resolve(path), temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${canonicalSemanticJson(value)}\n`, { mode: 0o600, flag: "wx" });
  const file = openSync(temporary, "r");
  try { fsyncSync(file); } finally { closeSync(file); }
  renameSync(temporary, target);
  const directory = openSync(dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
