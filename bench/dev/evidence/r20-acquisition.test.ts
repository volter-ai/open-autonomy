import { afterEach, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalSemanticJson, signableR20Campaign, signableR20Observation, type R20CampaignRegistration, type R20Observation } from "@open-autonomy/core";
import {
  acceptR20Collection, acceptR20CollectorIntent, acceptR20Observation, acceptR20Registration, assembleR20AcquisitionBundle,
  createR20AcquisitionState, issueR20Collection, issueR20CollectorIntent, issueR20Observation, issueR20Registration,
  loadR20AcquisitionState, saveR20AcquisitionState, type R20AcquisitionRequest, type R20AcquisitionResponse, type R20AcquisitionState,
} from "./r20-acquisition";
import { runR20AcquisitionCli } from "./r20-acquisition-cli";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const h = (value: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}` as const,
  pem = (key: ReturnType<typeof generateKeyPairSync>) => key.publicKey.export({ type: "spki", format: "pem" }).toString();
function fixture() {
  const registrar = generateKeyPairSync("ed25519"), collector = generateKeyPairSync("ed25519"), people = [generateKeyPairSync("ed25519"), generateKeyPairSync("ed25519")],
    registrationKeyId = "registrar", collectorKeyId = "collector", participantKeyIds = { alice: "alice-key", bob: "bob-key" },
    publicKeys = { registrar: pem(registrar), collector: pem(collector), "alice-key": pem(people[0]!), "bob-key": pem(people[1]!) },
    state = createR20AcquisitionState({ campaignId: "campaign-20", createdAt: "2026-07-15T08:00:00Z", registrationKeyId, collectorKeyId, participantKeyIds, publicKeys }),
    registration = { campaignId: "campaign-20", trials: [
      { id: "trial-a", kind: "command", caseId: "status", participantId: "alice", participantRole: "authorized", surface: "slack", accessibility: "keyboard", familiarity: "familiar" },
      { id: "trial-b", kind: "attack", caseId: "wrong-user", participantId: "bob", participantRole: "unauthorized", surface: "web", accessibility: "standard", familiarity: "unfamiliar" },
    ], registrationAuthority: { publicKeyPem: pem(registrar) } } as unknown as R20CampaignRegistration;
  const respond = (request: R20AcquisitionRequest, fragment: unknown, key: any, signedAt = "2026-07-15T12:00:00Z"): R20AcquisitionResponse => {
    const signerKeyId = request.authority === "registration" ? registrationKeyId : request.authority === "collector" ? collectorKeyId : participantKeyIds[request.signerId as "alice" | "bob"],
      body = { schema: "open-autonomy.bench-r20-acquisition-response.v1" as const, requestDigest: h(request), fragmentDigest: h(fragment), signerKeyId, signedAt };
    return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), key.privateKey).toString("base64"), fragment };
  };
  const observation = (index: number) => {
    const trial = registration.trials[index]!, key = people[index]!, value: any = { campaignId: registration.campaignId, trialId: trial.id, kind: trial.kind, caseId: trial.caseId,
      participantId: trial.participantId, participantRole: trial.participantRole, surface: trial.surface, accessibility: trial.accessibility, familiarity: trial.familiarity,
      participantSignature: { publicKeyPem: pem(key), signedAt: "2026-07-15T11:00:00Z", signature: "" } };
    value.participantSignature.signature = sign(null, Buffer.from(canonicalSemanticJson(signableR20Observation(value))), key.privateKey).toString("base64"); return value as R20Observation;
  };
  return { state, registration, registrar, collector, people, respond, observation };
}
function register(f: ReturnType<typeof fixture>) { const request = issueR20Registration(f.state); acceptR20Registration(f.state, f.respond(request, f.registration, f.registrar)); }
function observe(f: ReturnType<typeof fixture>, index: number) { const value = f.observation(index), request = issueR20Observation(f.state, value.trialId); acceptR20Observation(f.state, value.trialId, f.respond(request, value, f.people[index]!)); }

describe("R20 participant-bound external acquisition", () => {
  test("freezes registration and allows only its exact trial domain to proceed in parallel", () => {
    const f = fixture(); expect(() => issueR20Observation(f.state, "trial-a")).toThrow(/registration/); register(f);
    expect(() => issueR20Observation(f.state, "invented")).toThrow(/not preregistered/);
    const a = issueR20Observation(f.state, "trial-a"), b = issueR20Observation(f.state, "trial-b");
    expect(a.ordinal).toBe(1); expect(b.ordinal).toBe(2); expect(a.prerequisiteDigests).toEqual(b.prerequisiteDigests);
    acceptR20Observation(f.state, "trial-b", f.respond(b, f.observation(1), f.people[1]!));
    expect(() => issueR20CollectorIntent(f.state)).toThrow(/trial trial-a/);
    acceptR20Observation(f.state, "trial-a", f.respond(a, f.observation(0), f.people[0]!));
    expect(issueR20CollectorIntent(f.state).prerequisiteDigests).toHaveLength(2);
  });

  test("rejects assignment substitution, wrong participant, forgery, and equivocation", () => {
    const f = fixture(); register(f); const request = issueR20Observation(f.state, "trial-a"), value: any = f.observation(0);
    value.caseId = "explain"; expect(() => acceptR20Observation(f.state, "trial-a", f.respond(request, value, f.people[0]!))).toThrow(/fragment/);
    const valid = f.respond(request, f.observation(0), f.people[0]!);
    expect(() => acceptR20Observation(f.state, "trial-a", { ...valid, signerKeyId: "bob-key" })).toThrow(/binding/);
    expect(() => acceptR20Observation(f.state, "trial-a", { ...valid, signature: Buffer.alloc(64).toString("base64") })).toThrow(/signature/);
    acceptR20Observation(f.state, "trial-a", valid);
    expect(() => acceptR20Observation(f.state, "trial-a", f.respond(request, f.observation(0), f.people[0]!, "2026-07-15T12:00:01Z"))).toThrow(/equivocation/);
  });

  test("revalidates pending requests and accepted participant signatures after restart", () => {
    const f = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r20-acquisition-")); dirs.push(dir); const path = join(dir, "state.json");
    register(f); observe(f, 0); issueR20Observation(f.state, "trial-b"); saveR20AcquisitionState(path, f.state);
    const resumed = loadR20AcquisitionState(path); expect(resumed.trials["trial-a"]!.response).toBeDefined(); expect(resumed.trials["trial-b"]!.response).toBeUndefined();
    resumed.trials["trial-b"]!.request.ordinal = 1; expect(() => saveR20AcquisitionState(path, resumed)).toThrow(/request drift/);
  });

  test("collector declares chronology before signing the exact complete campaign", () => {
    const f = fixture(); register(f); observe(f, 0); observe(f, 1);
    let request = issueR20CollectorIntent(f.state), intent = { signerId: "external-collector", publicKeyPem: pem(f.collector), signedAt: "2026-07-15T12:30:00Z" };
    acceptR20CollectorIntent(f.state, f.respond(request, intent, f.collector, intent.signedAt)); request = issueR20Collection(f.state);
    const unsigned = { schema: "autonomy.r20-external-campaign.v1", closureClaim: true, registration: f.registration,
      observations: [f.observation(0), f.observation(1)], collector: { ...intent, signature: "" } } as any,
      campaignSignature = sign(null, Buffer.from(canonicalSemanticJson(signableR20Campaign(unsigned))), f.collector.privateKey).toString("base64");
    expect(request.candidateDigest).toBe(h(signableR20Campaign(unsigned)));
    acceptR20Collection(f.state, f.respond(request, { campaignSignature }, f.collector, intent.signedAt));
    const bundle = assembleR20AcquisitionBundle(f.state); expect(bundle.collector.signature).toBe(campaignSignature); expect(f.state.assembledBundleDigest).toBe(h(bundle));
  });

  test("rejects duplicate cryptographic identities under distinct labels", () => {
    const f = fixture(); f.state.publicKeys["bob-key"] = f.state.publicKeys["alice-key"]!;
    expect(() => createR20AcquisitionState({ campaignId: "x", createdAt: f.state.createdAt, registrationKeyId: f.state.registrationKeyId,
      collectorKeyId: f.state.collectorKeyId, participantKeyIds: f.state.participantKeyIds, publicKeys: f.state.publicKeys })).toThrow(/cryptographically distinct/);
  });

  test("CLI persists registration issuance before exposing the request", async () => {
    const f = fixture(), dir = mkdtempSync(join(tmpdir(), "oa-r20-acquisition-cli-")); dirs.push(dir);
    const statePath = join(dir, "state.json"), registryPath = join(dir, "registry.json"), requestPath = join(dir, "registration.request.json");
    writeFileSync(registryPath, JSON.stringify({ campaignId: f.state.campaignId, createdAt: f.state.createdAt, registrationKeyId: f.state.registrationKeyId,
      collectorKeyId: f.state.collectorKeyId, participantKeyIds: f.state.participantKeyIds, publicKeys: f.state.publicKeys }));
    await runR20AcquisitionCli(["init", "--state", statePath, "--registry", registryPath]);
    await runR20AcquisitionCli(["issue-registration", "--state", statePath, "--out", requestPath]);
    expect(JSON.parse(readFileSync(requestPath, "utf8")).action).toBe("registration");
    expect(loadR20AcquisitionState(statePath).registration?.request.action).toBe("registration");
  });
});
