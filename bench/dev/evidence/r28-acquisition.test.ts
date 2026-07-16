import { afterEach, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalSemanticJson } from "@open-autonomy/core";
import { signableR28Campaign, type R28ExternalCampaign } from "./r28-external-campaign";
import {
  acceptR28Append, acceptR28Completion, acceptR28Registration, acceptR28Seal, acceptR28Validation,
  acceptR28ValidatorIntent, assembleR28AcquisitionCampaign, createR28AcquisitionState, issueR28Append,
  issueR28Completion, issueR28Registration, issueR28Seal, issueR28Validation, issueR28ValidatorIntent,
  loadR28AcquisitionState, saveR28AcquisitionState, type R28AcquisitionResponse, type R28AcquisitionRole,
  type R28AcquisitionState, type R28Completion, type R28Registration, type R28Stream,
} from "./r28-acquisition";
import { runR28AcquisitionCli } from "./r28-acquisition-cli";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const hash = (value: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}` as const;
const roles: R28AcquisitionRole[] = ["registration-authority", "heartbeat-collector", "crash-injector", "proposal-custodian", "audit-custodian", "finalizer", "validator"];
function fixture() {
  const roleKeys = {} as Record<R28AcquisitionRole, string>, publicKeys: Record<string, string> = {}, privateKeys: Record<string, any> = {};
  for (const role of roles) { const id = `external-${role}`, pair = generateKeyPairSync("ed25519"); roleKeys[role] = id;
    publicKeys[id] = pair.publicKey.export({ type: "spki", format: "pem" }).toString(); privateKeys[id] = pair.privateKey; }
  return { state: createR28AcquisitionState({ campaignId: "external-campaign-28", createdAt: "2026-01-01T00:00:00Z", roleKeys, publicKeys }), privateKeys };
}
function response(state: R28AcquisitionState, request: any, fragment: unknown, privateKeys: Record<string, any>, signedAt = "2026-04-02T00:00:00Z"): R28AcquisitionResponse {
  const signerKeyId = state.roleKeys[request.role as R28AcquisitionRole], body = { schema: "open-autonomy.bench-r28-acquisition-response.v1" as const,
    requestDigest: hash(request), fragmentDigest: hash(fragment), signerKeyId, signedAt };
  return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), privateKeys[signerKeyId]).toString("base64"), fragment };
}
const registration = (): R28Registration => ({
  dependencies: [], bounds: { digest: hash("bounds"), proposalCount: 3, spend: 10, operations: 10, changedPaths: 3, maximumObservationGapMs: 86400000 },
  protectedControls: { constitution: hash("c"), grader: hash("g"), authorityCeiling: hash("a"), evidence: hash("e"), pause: hash("p"), rollback: hash("r") },
  roleGrants: [], repositoryBaseline: { remoteDigest: hash("remote"), baselineHead: hash("base") },
});
const completion = (): R28Completion => ({ repository: { remoteDigest: hash("remote"), baselineHead: hash("base"), finalHead: hash("final"), cleanTreeDigest: hash("clean") },
  attacks: { forgedApproval: { inputDigest: hash("fi"), rejectionDigest: hash("fr"), authority: "attack", signature: "s" },
    compromisedWorker: { inputDigest: hash("ci"), rejectionDigest: hash("cr"), authority: "attack", signature: "s" } },
  pause: { requestDigest: hash("pause-request"), safeStateDigest: hash("safe"), rollbackEffects: [], authority: "pause", signature: "s" },
  residuals: [], generatedAt: "2026-04-02T00:00:00Z" });
function register(state: R28AcquisitionState, privateKeys: Record<string, any>) {
  const request = issueR28Registration(state); acceptR28Registration(state, response(state, request, registration(), privateKeys));
}
function append(state: R28AcquisitionState, stream: R28Stream, fragment: unknown, privateKeys: Record<string, any>) {
  const request = issueR28Append(state, stream); acceptR28Append(state, stream, request.ordinal, response(state, request, fragment, privateKeys));
}
function seal(state: R28AcquisitionState, stream: R28Stream, privateKeys: Record<string, any>) {
  const request = issueR28Seal(state, stream), entries = state.streams[stream].entries;
  acceptR28Seal(state, stream, response(state, request, { count: entries.length, headResponseDigest: hash(entries.at(-1)!.response!) }, privateKeys));
}

describe("R28 long-running external campaign acquisition", () => {
  test("chains append requests, rejects gaps, and makes an external seal final", () => {
    const { state, privateKeys } = fixture();
    expect(() => issueR28Append(state, "heartbeats")).toThrow(/registration/);
    register(state, privateKeys);
    const first = issueR28Append(state, "heartbeats");
    expect(issueR28Append(state, "heartbeats")).toEqual(first);
    expect(() => acceptR28Append(state, "heartbeats", 2, response(state, first, {}, privateKeys))).toThrow(/ordinal/);
    acceptR28Append(state, "heartbeats", 1, response(state, first, { sequence: 1 }, privateKeys));
    const second = issueR28Append(state, "heartbeats");
    expect(second.prerequisiteDigests).toEqual([hash(state.streams.heartbeats.entries[0]!.response!)]);
    acceptR28Append(state, "heartbeats", 2, response(state, second, { sequence: 2 }, privateKeys));
    const request = issueR28Seal(state, "heartbeats");
    expect(() => acceptR28Seal(state, "heartbeats", response(state, request, { count: 1, headResponseDigest: hash("wrong") }, privateKeys))).toThrow(/summary/);
    seal(state, "heartbeats", privateKeys);
    expect(() => issueR28Append(state, "heartbeats")).toThrow(/sealed/);
  });

  test("rejects fragment substitution, authority substitution, forgery, and stream equivocation", () => {
    const { state, privateKeys } = fixture(); register(state, privateKeys);
    const request = issueR28Append(state, "crashes"), valid = response(state, request, { phase: "observation" }, privateKeys);
    expect(() => acceptR28Append(state, "crashes", 1, { ...valid, fragment: {} })).toThrow(/binding/);
    expect(() => acceptR28Append(state, "crashes", 1, { ...valid, signerKeyId: state.roleKeys.finalizer })).toThrow(/binding/);
    expect(() => acceptR28Append(state, "crashes", 1, { ...valid, signature: Buffer.alloc(64).toString("base64") })).toThrow(/signature/);
    acceptR28Append(state, "crashes", 1, valid);
    expect(() => acceptR28Append(state, "crashes", 1, response(state, request, { phase: "measurement" }, privateKeys))).toThrow(/equivocation/);
  });

  test("durably resumes a 91-day append stream without changing its hash chain", () => {
    const { state, privateKeys } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r28-acquisition-")); dirs.push(dir); const path = join(dir, "state.json");
    register(state, privateKeys);
    for (let day = 0; day <= 90; day++) append(state, "heartbeats", { sequence: day + 1, observedAt: new Date(Date.UTC(2026, 0, 1 + day)).toISOString() }, privateKeys);
    saveR28AcquisitionState(path, state); const resumed = loadR28AcquisitionState(path);
    expect(resumed.streams.heartbeats.entries).toHaveLength(91);
    expect(issueR28Seal(resumed, "heartbeats").prerequisiteDigests).toEqual([hash(resumed.streams.heartbeats.entries.at(-1)!.response!)]);
  });

  test("rejects pending-request and sealed-stream tampering during recovery", () => {
    const { state, privateKeys } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r28-acquisition-tamper-")); dirs.push(dir); const path = join(dir, "state.json");
    register(state, privateKeys); issueR28Append(state, "audit");
    state.streams.audit.entries[0]!.request.ordinal = 2;
    expect(() => saveR28AcquisitionState(path, state)).toThrow(/request drift/);
    state.streams.audit.entries[0]!.request.ordinal = 1;
    acceptR28Append(state, "audit", 1, response(state, state.streams.audit.entries[0]!.request, { sequence: 1 }, privateKeys));
    seal(state, "audit", privateKeys); (state.streams.audit.seal!.response!.fragment as any).count = 2;
    expect(() => saveR28AcquisitionState(path, state)).toThrow(/binding|summary/);
  });

  test("binds finalization to every sealed stream and validator to the exact campaign", () => {
    const { state, privateKeys } = fixture(); register(state, privateKeys);
    for (const stream of ["heartbeats", "crashes", "proposals", "audit"] as const) { append(state, stream, { stream, item: 1 }, privateKeys); seal(state, stream, privateKeys); }
    const completionRequest = issueR28Completion(state);
    const wrong = completion(); wrong.repository.baselineHead = hash("substitution");
    expect(() => acceptR28Completion(state, response(state, completionRequest, wrong, privateKeys))).toThrow(/fragment/);
    acceptR28Completion(state, response(state, completionRequest, completion(), privateKeys));
    const intentRequest = issueR28ValidatorIntent(state), keyId = state.roleKeys.validator;
    const intent = { identity: "independent-validator", keyId, publicKeyPem: state.publicKeys[keyId]!, signedAt: completion().generatedAt };
    acceptR28ValidatorIntent(state, response(state, intentRequest, intent, privateKeys));
    const validationRequest = issueR28Validation(state);
    const candidate = { schema: "open-autonomy.bench-r28-external-campaign.v1", closureClaim: false, campaignId: state.campaignId,
      generatedAt: completion().generatedAt, dependencies: registration().dependencies, repository: completion().repository, bounds: registration().bounds,
      protectedControls: registration().protectedControls, roleGrants: registration().roleGrants,
      heartbeats: [{ stream: "heartbeats", item: 1 }], crashes: [{ stream: "crashes", item: 1 }], proposals: [{ stream: "proposals", item: 1 }],
      attacks: completion().attacks, pause: completion().pause, audit: [{ stream: "audit", item: 1 }], residuals: [], validator: { ...intent, signature: "" } } as unknown as R28ExternalCampaign;
    expect(validationRequest.candidateDigest).toBe(hash(signableR28Campaign(candidate)));
    const campaignSignature = sign(null, Buffer.from(canonicalSemanticJson(signableR28Campaign(candidate))), privateKeys[keyId]).toString("base64");
    const validationResponse = response(state, validationRequest, { campaignSignature }, privateKeys);
    acceptR28Validation(state, validationResponse);
    const assembled = assembleR28AcquisitionCampaign(state);
    expect(assembled.validator.signature).toBe(campaignSignature);
    expect(state.assembledBundleDigest).toBe(hash(assembled));
    const substituted = structuredClone(state); (substituted.streams.audit.entries[0]!.response!.fragment as any).item = 2;
    expect(() => saveR28AcquisitionState("unused", substituted)).toThrow(/binding/);
  });

  test("requires distinct cryptographic identities for every custody role", () => {
    const { state } = fixture(), first = state.roleKeys[roles[0]!]!, second = state.roleKeys[roles[1]!]!;
    state.publicKeys[second] = state.publicKeys[first]!;
    expect(() => createR28AcquisitionState({ campaignId: "x", createdAt: state.createdAt, roleKeys: state.roleKeys, publicKeys: state.publicKeys })).toThrow(/cryptographically distinct/);
  });

  test("CLI durably records an issued request before exposing it", async () => {
    const { state } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r28-acquisition-cli-")); dirs.push(dir);
    const statePath = join(dir, "state.json"), registryPath = join(dir, "registry.json"), requestPath = join(dir, "registration.request.json");
    writeFileSync(registryPath, JSON.stringify({ campaignId: state.campaignId, createdAt: state.createdAt, roleKeys: state.roleKeys, publicKeys: state.publicKeys }));
    await runR28AcquisitionCli(["init", "--state", statePath, "--registry", registryPath]);
    await runR28AcquisitionCli(["issue-registration", "--state", statePath, "--out", requestPath]);
    expect(JSON.parse(readFileSync(requestPath, "utf8")).action).toBe("registration");
    expect(await runR28AcquisitionCli(["status", "--state", statePath])).toEqual(expect.objectContaining({ campaignId: state.campaignId, registration: false }));
    expect(loadR28AcquisitionState(statePath).registration?.request.action).toBe("registration");
  });
});
