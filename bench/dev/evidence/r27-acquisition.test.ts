import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalSemanticJson } from "@open-autonomy/core";
import {
  R27_ACQUISITION_STAGES, acceptR27AcquisitionResponse, assembleR27AcquisitionBundle,
  createR27AcquisitionState, issueR27AcquisitionRequest, loadR27AcquisitionState,
  saveR27AcquisitionState, type R27AcquisitionResponse, type R27AcquisitionRole,
  type R27AcquisitionState,
} from "./r27-acquisition";
import { runR27AcquisitionCli } from "./r27-acquisition-cli";

const dirs: string[] = [];
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });
const hash = (value: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}` as const;

function fixture() {
  const roleKeys = {} as Record<R27AcquisitionRole, string>, publicKeys: Record<string, string> = {}, privateKeys: Record<string, any> = {};
  for (const role of [...new Set(R27_ACQUISITION_STAGES.map((x) => x.role))]) {
    const id = `external-${role}`, pair = generateKeyPairSync("ed25519");
    roleKeys[role] = id;
    publicKeys[id] = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    privateKeys[id] = pair.privateKey;
  }
  return { state: createR27AcquisitionState({ campaignId: "campaign-external-27", createdAt: "2026-07-16T00:00:00Z", roleKeys, publicKeys }), privateKeys };
}
function response(state: R27AcquisitionState, stage: typeof R27_ACQUISITION_STAGES[number]["id"], fragment: unknown, privateKeys: Record<string, any>, at = "2026-07-16T00:00:01Z"): R27AcquisitionResponse {
  const request = state.requests[stage]!, signerKeyId = state.roleKeys[R27_ACQUISITION_STAGES.find((x) => x.id === stage)!.role];
  const body = { schema: "open-autonomy.bench-r27-acquisition-response.v1" as const, requestDigest: hash(request), fragmentDigest: hash(fragment), signerKeyId, signedAt: at };
  return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), privateKeys[signerKeyId]).toString("base64"), fragment };
}

describe("R27 external evidence acquisition", () => {
  test("issues only causally ready requests and binds every response to its exact request", () => {
    const { state, privateKeys } = fixture();
    expect(() => issueR27AcquisitionRequest(state, "registration")).toThrow(/dependencies missing/);
    issueR27AcquisitionRequest(state, "dependencies");
    const accepted = response(state, "dependencies", [{ checkpoint: "R19" }], privateKeys);
    acceptR27AcquisitionResponse(state, "dependencies", accepted);
    const registration = issueR27AcquisitionRequest(state, "registration");
    expect(registration.prerequisites).toEqual([{ stage: "dependencies", responseDigest: hash(accepted) }]);
    const replay = response(state, "registration", { experimentId: "e" }, privateKeys);
    acceptR27AcquisitionResponse(state, "registration", replay);
    expect(() => acceptR27AcquisitionResponse(state, "registration", response(state, "registration", { experimentId: "different" }, privateKeys))).toThrow(/equivocation/);
  });

  test("rejects substitution, wrong authority, forged signatures, and pre-campaign timestamps", () => {
    const { state, privateKeys } = fixture();
    issueR27AcquisitionRequest(state, "dependencies");
    const valid = response(state, "dependencies", [], privateKeys);
    expect(() => acceptR27AcquisitionResponse(state, "dependencies", { ...valid, fragment: [1] })).toThrow(/binding/);
    const wrong = { ...valid, signerKeyId: state.roleKeys.registrar };
    expect(() => acceptR27AcquisitionResponse(state, "dependencies", wrong)).toThrow(/binding/);
    expect(() => acceptR27AcquisitionResponse(state, "dependencies", { ...valid, signature: Buffer.alloc(64).toString("base64") })).toThrow(/signature/);
    expect(() => acceptR27AcquisitionResponse(state, "dependencies", response(state, "dependencies", [], privateKeys, "2026-07-15T23:59:59Z"))).toThrow(/binding/);
  });

  test("persists accepted custody state atomically and resumes without request drift", () => {
    const { state, privateKeys } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r27-acquisition-")); dirs.push(dir);
    const path = join(dir, "state.json");
    issueR27AcquisitionRequest(state, "dependencies");
    acceptR27AcquisitionResponse(state, "dependencies", response(state, "dependencies", [], privateKeys));
    saveR27AcquisitionState(path, state);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    const resumed = loadR27AcquisitionState(path);
    const first = issueR27AcquisitionRequest(resumed, "registration");
    saveR27AcquisitionState(path, resumed);
    expect(issueR27AcquisitionRequest(loadR27AcquisitionState(path), "registration")).toEqual(first);
  });

  test("rejects tampered persisted responses and false assembly claims on reload", () => {
    const { state, privateKeys } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r27-acquisition-")); dirs.push(dir);
    const path = join(dir, "state.json");
    issueR27AcquisitionRequest(state, "dependencies");
    acceptR27AcquisitionResponse(state, "dependencies", response(state, "dependencies", [], privateKeys));
    state.responses.dependencies!.fragment = ["substituted"];
    expect(() => saveR27AcquisitionState(path, state)).toThrow(/binding/);
    state.responses.dependencies!.fragment = [];
    state.assembledBundleDigest = hash({ false: "claim" });
    expect(() => saveR27AcquisitionState(path, state)).toThrow(/response registration missing/);
  });

  test("assembles exactly once only after all externally signed stages are complete", () => {
    const { state, privateKeys } = fixture();
    for (const definition of R27_ACQUISITION_STAGES) {
      issueR27AcquisitionRequest(state, definition.id);
      const fragment = definition.id === "closedAt" ? "2026-07-16T01:00:00Z" : definition.id === "rollback" ? null : [];
      acceptR27AcquisitionResponse(state, definition.id, response(state, definition.id, fragment, privateKeys));
    }
    const bundle = assembleR27AcquisitionBundle(state);
    expect(bundle.schema).toBe("open-autonomy.bench-r27-external-closure.v1");
    expect(bundle.closureClaim).toBe(true);
    expect(state.assembledBundleDigest).toBe(hash(bundle));
    expect(assembleR27AcquisitionBundle(state)).toEqual(bundle);
    expect(() => issueR27AcquisitionRequest(state, "closedAt")).toThrow(/already assembled/);
  });

  test("refuses duplicate cryptographic identities even under different key ids", () => {
    const { state } = fixture(), roles = Object.keys(state.roleKeys) as R27AcquisitionRole[];
    state.publicKeys[state.roleKeys[roles[1]!]!] = state.publicKeys[state.roleKeys[roles[0]!]!]!;
    expect(() => createR27AcquisitionState({ campaignId: "x", createdAt: state.createdAt, roleKeys: state.roleKeys, publicKeys: state.publicKeys })).toThrow(/cryptographically distinct/);
  });

  test("CLI initializes, durably issues, and reports the external campaign", async () => {
    const { state } = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r27-acquisition-cli-")); dirs.push(dir);
    const statePath = join(dir, "state.json"), registryPath = join(dir, "registry.json"), requestPath = join(dir, "request.json");
    writeFileSync(registryPath, JSON.stringify({ campaignId: state.campaignId, createdAt: state.createdAt, roleKeys: state.roleKeys, publicKeys: state.publicKeys }));
    await runR27AcquisitionCli(["init", "--state", statePath, "--registry", registryPath]);
    await runR27AcquisitionCli(["issue", "--state", statePath, "--stage", "dependencies", "--out", requestPath]);
    expect(JSON.parse(readFileSync(requestPath, "utf8")).stage).toBe("dependencies");
    expect(await runR27AcquisitionCli(["status", "--state", statePath])).toEqual(expect.objectContaining({ campaignId: state.campaignId, issued: ["dependencies"], accepted: [] }));
    await expect(runR27AcquisitionCli(["init", "--state", statePath, "--registry", registryPath])).rejects.toThrow(/already exists/);
  });
});
