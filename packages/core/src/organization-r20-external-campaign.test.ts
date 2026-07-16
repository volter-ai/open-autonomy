import { expect, test } from "bun:test";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  signableR20Campaign, signableR20Observation, signableR20Registration,
  verifyR20ExternalCampaign, type R20CampaignBundle, type R20Observation,
} from "./organization-r20-external-campaign";

const commands = ["status", "explain", "create-work", "question", "answer", "approve", "mutate",
  "pause", "resume", "repair", "rollback", "revoke", "reject-approval", "notification-preference",
  "inspect-evidence", "interpret-unknown", "recover-lost-message", "recover-prior-thread"] as const;
const attacks = ["forged-slack-signature", "stale-slack-signature", "duplicate-event", "cross-tenant",
  "cross-channel", "cross-thread", "wrong-user", "wrong-work", "wrong-artifact", "wrong-scope",
  "expired-approval", "revoked-approval", "replayed-confirmation", "idempotency-equivocation",
  "prompt-injection", "crash-after-ingress", "crash-after-effect", "lost-outbound-message",
  "duplicate-block-action", "action-token-forgery", "wrong-approval", "insufficient-quorum",
  "hidden-content-injection", "lost-inbound-acknowledgment"] as const;
const d = (x: number) => `sha256:${x.toString(16).padStart(64, "0")}` as const;
const h = (x: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const;
const key = () => generateKeyPairSync("ed25519");
const signatureMetadata = (k: ReturnType<typeof key>, signerId: string, signedAt = "2026-07-15T12:00:00Z") => ({
  signerId, publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }).toString(),
  signedAt,
  signature: "",
});

function fixture() {
  const registrar = key(), collector = key(), people = [key(), key(), key()],
    trials = [...commands.flatMap((caseId, i) => [0, 1].map(p => ({ id: `command-${caseId}-${p}`,
      kind: "command" as const, caseId, participantId: `person-${p}`, participantRole: "authorized" as const,
      surface: (p === 0 ? "slack" : i % 2 ? "web" : "cli") as "slack" | "web" | "cli",
      accessibility: (p === 0 ? "keyboard" : "screen-reader") as "keyboard" | "screen-reader",
      familiarity: (p === 0 ? "familiar" : "unfamiliar") as "familiar" | "unfamiliar" }))),
      ...attacks.map(caseId => ({ id: `attack-${caseId}`, kind: "attack" as const, caseId,
        participantId: "person-2", participantRole: "unauthorized" as const, surface: "slack" as const,
        accessibility: "standard" as const, familiarity: "familiar" as const }))];
  const registration: any = {
    schema: "autonomy.r20-external-registration.v1", campaignId: "r20-real-slack-1",
    dependencies: { R10: d(10), R17: d(17), R18: d(18), R19: d(19) },
    readinessDigest: d(1), workspaceDigest: d(2), appDigest: d(3), channelDigest: d(4),
    commands: [...commands], attacks: [...attacks], trials, minimumDistinctParticipants: 3, maximumAckMs: 3000,
    startsAt: "2026-07-15T10:00:00Z", endsAt: "2026-07-15T14:00:00Z",
    registrationAuthority: {},
  };
  registration.registrationAuthority = signatureMetadata(registrar, "registrar", "2026-07-15T09:00:00Z");
  registration.registrationAuthority.signature = sign(null,
    Buffer.from(canonicalSemanticJson(signableR20Registration(registration))), registrar.privateKey).toString("base64");
  const artifacts: Record<string, any> = {};
  const observations: R20Observation[] = trials.map((trial, i) => {
    const person = people[Number(trial.participantId.slice(-1))]!, participantId = trial.participantId,
      recovery = trial.kind === "attack" && ["duplicate-event", "duplicate-block-action", "crash-after-ingress", "crash-after-effect", "lost-outbound-message", "lost-inbound-acknowledgment"].includes(trial.caseId as string),
      outcome = trial.kind === "command" ? "accepted" : recovery ? "recovered" : "rejected",
      providerReceiptDigest = trial.kind === "command" || recovery ? d(100 + i) : null,
      effectDigest = trial.kind === "command" || recovery ? d(200 + i) : null;
    const startedAt = "2026-07-15T12:00:00.000Z", completedAt = new Date(Date.parse(startedAt) + 20 + i).toISOString(),
      rawBody = JSON.stringify({ trial: trial.id }), timestamp = "1770000000",
      slackSignature = `v0=${createHmac("sha256", "external-slack-secret").update(`v0:${timestamp}:${rawBody}`).digest("hex")}`,
      source: any = trial.surface === "slack" ? { surface: "slack", startedAt, completedAt, rawBody, timestamp,
        signature: slackSignature,
        ingress: { schema: "autonomy.slack-http-ingress.v1", key: trial.id, requestDigest: h({ rawBody, timestamp, signature: slackSignature }),
          kind: "event-callback", receivedAt: startedAt },
        acknowledgment: { schema: "autonomy.slack-http-acknowledgment.v1", ingressKey: trial.id,
          requestDigest: h({ rawBody, timestamp, signature: slackSignature }), acknowledgedAt: completedAt, elapsedMs: 20 + i } } :
        trial.surface === "web" ? { surface: "web", startedAt, completedAt,
          request: { schema: "autonomy.r20-web-request.v1", requestId: trial.id, body: { command: trial.caseId },
            principalDigest: d(900 + i), receivedAt: startedAt },
          response: { schema: "autonomy.r20-web-response.v1", requestId: trial.id, status: 200, completedAt } } :
        { surface: "cli", startedAt, completedAt,
          invocation: { schema: "autonomy.r20-cli-invocation.v1", invocationId: trial.id,
            argv: [String(trial.caseId)], principalDigest: d(900 + i), invokedAt: startedAt },
          result: { schema: "autonomy.r20-cli-result.v1", invocationId: trial.id, exitCode: 0, completedAt } },
      requestRecord = source.surface === "slack" ? { rawBody: source.rawBody, timestamp: source.timestamp, signature: source.signature } :
        source.surface === "web" ? source.request : source.invocation,
      ingressRecord = source.surface === "slack" ? source.ingress : source.surface === "web" ? source.request : source.invocation,
      acknowledgmentRecord = source.surface === "slack" ? source.acknowledgment : source.surface === "web" ? source.response : source.result,
      providerReceipt = providerReceiptDigest ? { schema: "autonomy.r20-provider-receipt.v1", messageId: `message-${i}`,
        outboxId: trial.id, channelDigest: d(4), threadDigest: d(960 + i), deliveredAt: completedAt, attempt: 1 } : null,
      audit = { schema: "autonomy.r20-trial-audit.v1", campaignId: registration.campaignId,
        observationId: `observation-${i}`, trialId: trial.id, caseId: trial.caseId, participantId,
        surface: trial.surface, requestDigest: h(requestRecord), outboxId: providerReceipt?.outboxId ?? null,
        providerReceiptDigest: providerReceipt ? h(providerReceipt) : null,
        outcome, effectDigests: effectDigest ? [effectDigest] : [],
        effectCountBeforeConfirmation: 0,
        recovery: recovery ? { kind: trial.caseId, originalEffectDigest: effectDigest,
          effectCountBefore: trial.caseId === "crash-after-ingress" ? 0 : 1, effectCountAfter: 1,
          deliveryAttempts: trial.caseId === "lost-outbound-message" ? 2 : 1, recoveredAt: completedAt } : null };
    const value: any = { schema: "autonomy.r20-external-observation.v1", campaignId: registration.campaignId,
      observationId: `observation-${i}`, trialId: trial.id, kind: trial.kind, caseId: trial.caseId,
      participantId, participantRole: trial.participantRole, surface: trial.surface,
      accessibility: trial.accessibility, familiarity: trial.familiarity, outcome,
      providerReceiptDigest: providerReceipt ? h(providerReceipt) : null, effectDigest, requestDigest: h(requestRecord),
      ingressDigest: h(ingressRecord), acknowledgmentDigest: h(acknowledgmentRecord), auditDigest: h(audit),
      duplicateEffectCount: 0, ackMs: 20 + i, observedAt: completedAt,
      evidenceArtifactDigest: "", participantSignature: {} };
    const artifact = { schema: "autonomy.r20-trial-evidence.v1", campaignId: value.campaignId,
      observationId: value.observationId, caseId: value.caseId, participantId, source, audit, providerReceipt };
    value.evidenceArtifactDigest = h(artifact);
    artifacts[value.evidenceArtifactDigest] = artifact;
    value.participantSignature = signatureMetadata(person, participantId, completedAt);
    value.participantSignature.signature = sign(null,
      Buffer.from(canonicalSemanticJson(signableR20Observation(value))), person.privateKey).toString("base64");
    return value;
  });
  const bundle: any = { schema: "autonomy.r20-external-campaign.v1", closureClaim: true,
    registration, observations, collector: {} };
  bundle.collector = signatureMetadata(collector, "independent-collector", "2026-07-15T13:00:00Z");
  bundle.collector.signature = sign(null,
    Buffer.from(canonicalSemanticJson(signableR20Campaign(bundle))), collector.privateKey).toString("base64");
  const trust = {
    closedDependencyEvidence: registration.dependencies,
    readinessDigest: d(1), registrationAuthorityKeys: [registration.registrationAuthority.publicKeyPem],
    collectorAuthorityKeys: [bundle.collector.publicKeyPem],
    participantKeys: Object.fromEntries(people.map((p, i) => [`person-${i}`,
      p.publicKey.export({ type: "spki", format: "pem" }).toString()])),
    participantCapabilities: { "person-0": ["authorized", "keyboard"] as Array<"authorized" | "keyboard">,
      "person-1": ["authorized", "screen-reader", "unfamiliar"] as Array<"authorized" | "screen-reader" | "unfamiliar">,
      "person-2": ["unauthorized"] as Array<"unauthorized"> },
    evidenceArtifacts: artifacts,
    verifySlackSource: (s: any) => s.signature === `v0=${createHmac("sha256", "external-slack-secret")
      .update(`v0:${s.timestamp}:${s.rawBody}`).digest("hex")}`,
    verifyWebSource: (s: any) => s.request.requestId === s.response.requestId,
    verifyCliSource: (s: any) => s.invocation.invocationId === s.result.invocationId,
    verifyProviderReceipt: (r: any) => r.schema === "autonomy.r20-provider-receipt.v1" && r.attempt > 0,
    verifyAuditRecord: (a: any) => a.schema === "autonomy.r20-trial-audit.v1",
  };
  const resignObservation = (index: number) => {
    const observation: any = observations[index]!, old = observation.evidenceArtifactDigest,
      artifact = artifacts[old], next = h(artifact);
    delete artifacts[old]; artifacts[next] = artifact; observation.evidenceArtifactDigest = next;
    observation.participantSignature.signature = "";
    observation.participantSignature.signature = sign(null,
      Buffer.from(canonicalSemanticJson(signableR20Observation(observation))),
      people[Number(observation.participantId.slice(-1))]!.privateKey).toString("base64");
    bundle.collector.signature = "";
    bundle.collector.signature = sign(null, Buffer.from(canonicalSemanticJson(signableR20Campaign(bundle))),
      collector.privateKey).toString("base64");
  };
  return { bundle: bundle as R20CampaignBundle, trust, resignObservation };
}

test("verifies a complete independently collected real Slack R20 matrix", () => {
  const { bundle, trust } = fixture();
  expect(verifyR20ExternalCampaign(bundle, trust)).toMatchObject({
    status: "R20-external-evidence-verified", closureClaim: true,
    observationCount: commands.length * 2 + attacks.length, participantCount: 3,
  });
});

test("rejects omission, forged participants, duplicate effects, missing receipts, accepted attacks, and slow ack", () => {
  const mutations = [
    (b: any) => b.observations.pop(),
    (b: any) => b.observations[0].participantSignature.signature = "forged",
    (b: any) => b.observations[0].duplicateEffectCount = 1,
    (b: any) => b.observations[0].providerReceiptDigest = null,
    (b: any) => { const x = b.observations.find((o: any) => o.kind === "attack"); x.outcome = "accepted"; },
    (b: any) => b.observations[0].ackMs = 3001,
  ];
  for (const mutate of mutations) { const { bundle, trust } = fixture(); mutate(bundle);
    expect(() => verifyR20ExternalCampaign(bundle, trust)).toThrow(); }
});

test("rejects post-registration matrix changes, schema smuggling, and collapsed authorities", () => {
  const mutations = [
    (b: any) => b.registration.commands.reverse(),
    (b: any) => b.registration.extra = true,
    (b: any) => b.collector.publicKeyPem = b.registration.registrationAuthority.publicKeyPem,
    (b: any) => b.closureClaim = false,
  ];
  for (const mutate of mutations) { const { bundle, trust } = fixture(); mutate(bundle);
    expect(() => verifyR20ExternalCampaign(bundle, trust)).toThrow(); }
});

test("rejects incomplete cross-participant assignments, capability forgery, and artifact smuggling", () => {
  const mutations = [
    (b: any, _t: any) => b.registration.trials.splice(0, 1),
    (b: any, _t: any) => b.observations[0].trialId = b.observations[1].trialId,
    (b: any, t: any) => t.participantCapabilities["person-0"] = ["authorized"],
    (b: any, t: any) => t.evidenceArtifacts[b.observations[0].evidenceArtifactDigest].extra = true,
  ];
  for (const mutate of mutations) { const { bundle, trust } = fixture(); mutate(bundle, trust);
    expect(() => verifyR20ExternalCampaign(bundle, trust)).toThrow(); }
});

test("rejects unauthenticated sources, broken causal joins, copied latency, and false recovery", () => {
  const mutations = [
    (_b: any, t: any) => t.verifySlackSource = () => false,
    (b: any, t: any) => { const o = b.observations.find((x: any) => x.surface === "web");
      t.evidenceArtifacts[o.evidenceArtifactDigest].source.response.requestId = "other"; },
    (b: any, t: any) => { const o = b.observations[0];
      t.evidenceArtifacts[o.evidenceArtifactDigest].source.completedAt = "2026-07-15T12:00:01.000Z"; },
    (b: any, t: any) => { const o = b.observations.find((x: any) => x.caseId === "duplicate-event");
      t.evidenceArtifacts[o.evidenceArtifactDigest].audit.recovery.effectCountAfter = 2; },
  ];
  for (const mutate of mutations) { const { bundle, trust } = fixture(); mutate(bundle, trust);
    expect(() => verifyR20ExternalCampaign(bundle, trust)).toThrow(); }
});

test("rejects future provider delivery and recovery even when evidence is rehashed and resigned", () => {
  for (const kind of ["provider", "recovery"] as const) {
    const { bundle, trust, resignObservation } = fixture(), index = kind === "provider" ? 0 :
      bundle.observations.findIndex(o => o.caseId === "duplicate-event"),
      observation = bundle.observations[index]!, artifact: any = trust.evidenceArtifacts[observation.evidenceArtifactDigest];
    if (kind === "provider") artifact.providerReceipt.deliveredAt = "2026-07-15T13:30:00Z";
    else artifact.audit.recovery.recoveredAt = "2026-07-15T13:30:00Z";
    resignObservation(index);
    expect(() => verifyR20ExternalCampaign(bundle, trust)).toThrow();
  }
});
