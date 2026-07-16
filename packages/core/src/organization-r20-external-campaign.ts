import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

type Digest = `sha256:${string}`;
const COMMANDS = [
  "status", "explain", "create-work", "question", "answer", "approve",
  "mutate", "pause", "resume", "repair", "rollback", "revoke",
  "reject-approval", "notification-preference", "inspect-evidence",
  "interpret-unknown", "recover-lost-message", "recover-prior-thread",
] as const;
const ATTACKS = [
  "forged-slack-signature", "stale-slack-signature", "duplicate-event",
  "cross-tenant", "cross-channel", "cross-thread", "wrong-user",
  "wrong-work", "wrong-artifact", "wrong-scope", "expired-approval",
  "revoked-approval", "replayed-confirmation", "idempotency-equivocation",
  "prompt-injection", "crash-after-ingress", "crash-after-effect",
  "lost-outbound-message",
  "duplicate-block-action", "action-token-forgery", "wrong-approval",
  "insufficient-quorum", "hidden-content-injection", "lost-inbound-acknowledgment",
] as const;
export type R20Command = (typeof COMMANDS)[number];
export type R20Attack = (typeof ATTACKS)[number];
export type R20TrialAssignment = {
  id: string; kind: "command" | "attack"; caseId: R20Command | R20Attack;
  participantId: string; participantRole: "authorized" | "unauthorized";
  surface: "slack" | "web" | "cli";
  accessibility: "standard" | "keyboard" | "screen-reader";
  familiarity: "familiar" | "unfamiliar";
};
type Signature = { signerId: string; publicKeyPem: string; signedAt: string; signature: string };
export type R20CampaignRegistration = {
  schema: "autonomy.r20-external-registration.v1";
  campaignId: string;
  dependencies: { R10: Digest; R17: Digest; R18: Digest; R19: Digest };
  readinessDigest: Digest;
  workspaceDigest: Digest;
  appDigest: Digest;
  channelDigest: Digest;
  commands: R20Command[];
  attacks: R20Attack[];
  trials: R20TrialAssignment[];
  minimumDistinctParticipants: number;
  maximumAckMs: number;
  startsAt: string;
  endsAt: string;
  registrationAuthority: Signature;
};
export type R20Observation = {
  schema: "autonomy.r20-external-observation.v1";
  campaignId: string;
  observationId: string;
  trialId: string;
  kind: "command" | "attack";
  caseId: R20Command | R20Attack;
  participantId: string;
  participantRole: "authorized" | "unauthorized";
  surface: "slack" | "web" | "cli";
  accessibility: "standard" | "keyboard" | "screen-reader";
  familiarity: "familiar" | "unfamiliar";
  requestDigest: Digest;
  ingressDigest: Digest;
  acknowledgmentDigest: Digest;
  auditDigest: Digest;
  providerReceiptDigest: Digest | null;
  effectDigest: Digest | null;
  outcome: "accepted" | "rejected" | "recovered";
  duplicateEffectCount: number;
  ackMs: number;
  observedAt: string;
  evidenceArtifactDigest: Digest;
  participantSignature: Signature;
};
export type R20CampaignBundle = {
  schema: "autonomy.r20-external-campaign.v1";
  closureClaim: true;
  registration: R20CampaignRegistration;
  observations: R20Observation[];
  collector: Signature;
};

const digest = (x: unknown): Digest =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`;
const validDigest = (x: unknown): x is Digest =>
  typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const validDate = (x: unknown) =>
  typeof x === "string" && Number.isFinite(Date.parse(x));
const ed25519 = (pem: string) => {
  try { return createPublicKey(pem).asymmetricKeyType === "ed25519"; } catch { return false; }
};
const keyFingerprint = (pem: string) => {
  try {
    return createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
  } catch { return "invalid"; }
};
function exact(value: unknown, keys: string[], name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0"))
    throw Error(`${name} contains unknown or missing fields`);
}
function signatureBody<T extends object>(value: T, key: keyof T) {
  const copy = structuredClone(value) as any;
  copy[key] = { ...copy[key], signature: "" };
  return copy;
}
function verifySignature(body: unknown, signature: Signature, label: string) {
  exact(signature, ["signerId", "publicKeyPem", "signedAt", "signature"], `${label} signature`);
  if (!signature.signerId || !validDate(signature.signedAt) || !ed25519(signature.publicKeyPem))
    throw Error(`${label} signer invalid`);
  let accepted = false;
  try {
    accepted = verify(null, Buffer.from(canonicalSemanticJson(body)), signature.publicKeyPem,
      Buffer.from(signature.signature, "base64"));
  } catch {}
  if (!accepted) throw Error(`${label} signature invalid`);
}
const framed = (domain: string, body: unknown) => ({ domain, body });
export const signableR20Registration = (x: R20CampaignRegistration) =>
  framed("open-autonomy/r20/registration/v1", signatureBody(x, "registrationAuthority"));
export const signableR20Observation = (x: R20Observation) =>
  framed("open-autonomy/r20/observation/v1", signatureBody(x, "participantSignature"));
export const signableR20Campaign = (x: R20CampaignBundle) =>
  framed("open-autonomy/r20/collector/v1", signatureBody(x, "collector"));

export type R20CampaignTrust = {
  closedDependencyEvidence: { R10: Digest; R17: Digest; R18: Digest; R19: Digest };
  readinessDigest: Digest;
  registrationAuthorityKeys: string[];
  collectorAuthorityKeys: string[];
  participantKeys: Record<string, string>;
  participantCapabilities: Record<string, Array<"authorized" | "unauthorized" | "keyboard" | "screen-reader" | "unfamiliar">>;
  evidenceArtifacts: Record<string, R20TrialEvidence>;
  verifySlackSource(source: Extract<R20TrialSource, { surface: "slack" }>): boolean;
  verifyWebSource(source: Extract<R20TrialSource, { surface: "web" }>): boolean;
  verifyCliSource(source: Extract<R20TrialSource, { surface: "cli" }>): boolean;
  verifyProviderReceipt(receipt: R20ProviderReceipt): boolean;
  verifyAuditRecord(audit: R20TrialEvidence["audit"]): boolean;
};
export type R20ProviderReceipt = { schema: "autonomy.r20-provider-receipt.v1"; messageId: string;
  outboxId: string; channelDigest: Digest; threadDigest: Digest; deliveredAt: string; attempt: number };
type SourceBase = { startedAt: string; completedAt: string };
export type R20TrialSource =
  | (SourceBase & { surface: "slack"; rawBody: string; timestamp: string; signature: string;
      ingress: { schema: "autonomy.slack-http-ingress.v1"; key: string; requestDigest: Digest; kind: "event-callback" | "block-action"; receivedAt: string };
      acknowledgment: { schema: "autonomy.slack-http-acknowledgment.v1"; ingressKey: string; requestDigest: Digest; acknowledgedAt: string; elapsedMs: number } })
  | (SourceBase & { surface: "web"; request: { schema: "autonomy.r20-web-request.v1"; requestId: string; body: unknown; principalDigest: Digest; receivedAt: string };
      response: { schema: "autonomy.r20-web-response.v1"; requestId: string; status: number; completedAt: string } })
  | (SourceBase & { surface: "cli"; invocation: { schema: "autonomy.r20-cli-invocation.v1"; invocationId: string; argv: string[]; principalDigest: Digest; invokedAt: string };
      result: { schema: "autonomy.r20-cli-result.v1"; invocationId: string; exitCode: number; completedAt: string } });
export type R20TrialEvidence = {
  schema: "autonomy.r20-trial-evidence.v1";
  campaignId: string;
  observationId: string;
  caseId: R20Command | R20Attack;
  participantId: string;
  source: R20TrialSource;
  audit: { schema: "autonomy.r20-trial-audit.v1"; campaignId: string; observationId: string;
    trialId: string; caseId: R20Command | R20Attack; participantId: string; surface: "slack" | "web" | "cli";
    requestDigest: Digest; outboxId: string | null; providerReceiptDigest: Digest | null;
    outcome: "accepted" | "rejected" | "recovered"; effectDigests: Digest[]; effectCountBeforeConfirmation: number;
    recovery: null | { kind: R20Attack; originalEffectDigest: Digest; effectCountBefore: number;
      effectCountAfter: number; deliveryAttempts: number; recoveredAt: string } };
  providerReceipt: R20ProviderReceipt | null;
};
export function verifyR20ExternalCampaign(bundle: R20CampaignBundle, trust: R20CampaignTrust) {
  exact(bundle, ["schema", "closureClaim", "registration", "observations", "collector"], "campaign");
  if (bundle.schema !== "autonomy.r20-external-campaign.v1" || bundle.closureClaim !== true)
    throw Error("R20 campaign envelope invalid");
  const r = bundle.registration;
  exact(r, ["schema", "campaignId", "dependencies", "readinessDigest", "workspaceDigest", "appDigest", "channelDigest",
    "commands", "attacks", "trials", "minimumDistinctParticipants", "maximumAckMs", "startsAt", "endsAt",
    "registrationAuthority"], "registration");
  if (r.schema !== "autonomy.r20-external-registration.v1" || !r.campaignId ||
      Object.keys(r.dependencies).sort().join("\0") !== "R10\0R17\0R18\0R19" ||
      !Object.values(r.dependencies).every(validDigest) ||
      ![r.readinessDigest, r.workspaceDigest, r.appDigest, r.channelDigest].every(validDigest) ||
      canonicalSemanticJson(r.commands) !== canonicalSemanticJson(COMMANDS) ||
      canonicalSemanticJson(r.attacks) !== canonicalSemanticJson(ATTACKS) ||
      !Array.isArray(r.trials) || !Number.isSafeInteger(r.minimumDistinctParticipants) || r.minimumDistinctParticipants < 3 ||
      !Number.isFinite(r.maximumAckMs) || r.maximumAckMs <= 0 || !validDate(r.startsAt) ||
      !validDate(r.endsAt) || Date.parse(r.startsAt) >= Date.parse(r.endsAt))
    throw Error("R20 preregistration invalid");
  const trialIds = new Set<string>();
  for (const t of r.trials) {
    exact(t, ["id", "kind", "caseId", "participantId", "participantRole", "surface", "accessibility", "familiarity"], "trial assignment");
    const expected = (COMMANDS as readonly string[]).includes(t.caseId) ? "command" :
      (ATTACKS as readonly string[]).includes(t.caseId) ? "attack" : null;
    if (!t.id || trialIds.has(t.id) || t.kind !== expected || !t.participantId ||
        !["authorized", "unauthorized"].includes(t.participantRole) ||
        !["slack", "web", "cli"].includes(t.surface) ||
        !["standard", "keyboard", "screen-reader"].includes(t.accessibility) ||
        !["familiar", "unfamiliar"].includes(t.familiarity)) throw Error("R20 trial assignment invalid");
    trialIds.add(t.id);
  }
  verifySignature(signableR20Registration(r), r.registrationAuthority, "registration");
  if (r.readinessDigest !== trust.readinessDigest ||
      !trust.registrationAuthorityKeys.map(keyFingerprint).includes(keyFingerprint(r.registrationAuthority.publicKeyPem)))
    throw Error("R20 registration is not bound to trusted readiness/authority");
  if (canonicalSemanticJson(r.dependencies) !== canonicalSemanticJson(trust.closedDependencyEvidence))
    throw Error("R20 dependencies are not bound to closed evidence");
  if (Date.parse(r.registrationAuthority.signedAt) > Date.parse(r.startsAt))
    throw Error("R20 registration was not signed before campaign start");
  const ids = new Set<string>(), participants = new Map<string, string>(), completedTrials = new Set<string>(), cases = new Set<string>();
  for (const o of bundle.observations) {
    exact(o, ["schema", "campaignId", "observationId", "trialId", "kind", "caseId", "participantId",
      "participantRole", "surface", "accessibility", "familiarity", "requestDigest", "ingressDigest", "acknowledgmentDigest", "auditDigest", "providerReceiptDigest",
      "effectDigest", "outcome", "duplicateEffectCount", "ackMs", "observedAt", "evidenceArtifactDigest",
      "participantSignature"],
      "observation");
    if (o.schema !== "autonomy.r20-external-observation.v1" || o.campaignId !== r.campaignId ||
        !o.observationId || ids.has(o.observationId) || !o.trialId || completedTrials.has(o.trialId) || !o.participantId ||
        ![o.requestDigest, o.ingressDigest, o.acknowledgmentDigest, o.auditDigest].every(validDigest) ||
        (o.providerReceiptDigest !== null && !validDigest(o.providerReceiptDigest)) ||
        (o.effectDigest !== null && !validDigest(o.effectDigest)) || !validDigest(o.evidenceArtifactDigest) ||
        !Number.isSafeInteger(o.duplicateEffectCount) ||
        o.duplicateEffectCount !== 0 || !Number.isFinite(o.ackMs) || o.ackMs < 0 || o.ackMs > r.maximumAckMs ||
        !validDate(o.observedAt) || Date.parse(o.observedAt) < Date.parse(r.startsAt) ||
        Date.parse(o.observedAt) > Date.parse(r.endsAt)) throw Error("R20 observation invalid");
    const expectedKind = (COMMANDS as readonly string[]).includes(o.caseId) ? "command" :
      (ATTACKS as readonly string[]).includes(o.caseId) ? "attack" : null;
    const assignment = r.trials.find(t => t.id === o.trialId);
    if (o.kind !== expectedKind || !assignment || assignment.kind !== o.kind || assignment.caseId !== o.caseId ||
        assignment.participantId !== o.participantId || assignment.participantRole !== o.participantRole ||
        assignment.surface !== o.surface || assignment.accessibility !== o.accessibility || assignment.familiarity !== o.familiarity)
      throw Error("R20 case matrix invalid");
    if (o.kind === "command" && (o.participantRole !== "authorized" || o.outcome !== "accepted" ||
        o.providerReceiptDigest === null || o.effectDigest === null))
      throw Error("R20 command did not produce bound real effect and receipt");
    if (o.kind === "attack") {
      const recovery = ["duplicate-event", "duplicate-block-action", "crash-after-ingress", "crash-after-effect",
        "lost-outbound-message", "lost-inbound-acknowledgment"].includes(o.caseId);
      if ((!recovery && (o.outcome !== "rejected" || o.effectDigest !== null || o.providerReceiptDigest !== null)) ||
          (recovery && (o.outcome !== "recovered" || o.effectDigest === null || o.providerReceiptDigest === null)))
        throw Error("R20 attack/recovery semantics invalid");
    }
    const artifact = trust.evidenceArtifacts[o.evidenceArtifactDigest];
    if (artifact) {
      exact(artifact, ["schema", "campaignId", "observationId", "caseId", "participantId", "source", "audit", "providerReceipt"], "trial evidence");
      exact(artifact.audit, ["schema", "campaignId", "observationId", "trialId", "caseId", "participantId", "surface",
        "requestDigest", "outboxId", "providerReceiptDigest", "outcome", "effectDigests", "effectCountBeforeConfirmation", "recovery"], "trial audit");
      if (!trust.verifyAuditRecord(artifact.audit) || !artifact.audit.effectDigests.every(validDigest) || artifact.audit.effectCountBeforeConfirmation !== 0)
        throw Error("trial effect/confirmation boundary invalid");
    }
    if (!artifact || digest(artifact) !== o.evidenceArtifactDigest ||
        artifact.schema !== "autonomy.r20-trial-evidence.v1" || artifact.campaignId !== o.campaignId ||
        artifact.observationId !== o.observationId || artifact.caseId !== o.caseId ||
        artifact.participantId !== o.participantId || artifact.source.surface !== o.surface ||
        artifact.audit.campaignId !== o.campaignId || artifact.audit.observationId !== o.observationId ||
        artifact.audit.trialId !== o.trialId || artifact.audit.caseId !== o.caseId ||
        artifact.audit.participantId !== o.participantId || artifact.audit.surface !== o.surface)
      throw Error("R20 trial evidence join invalid");
    const source = artifact.source,
      requestRecord = source.surface === "slack" ? { rawBody: source.rawBody, timestamp: source.timestamp, signature: source.signature } :
        source.surface === "web" ? source.request : source.invocation,
      ingressRecord = source.surface === "slack" ? source.ingress : source.surface === "web" ? source.request : source.invocation,
      acknowledgmentRecord = source.surface === "slack" ? source.acknowledgment : source.surface === "web" ? source.response : source.result,
      elapsedMs = Date.parse(source.completedAt) - Date.parse(source.startedAt),
      sourceAuthenticated = source.surface === "slack" ? trust.verifySlackSource(source) :
        source.surface === "web" ? trust.verifyWebSource(source) : trust.verifyCliSource(source),
      receiptDigest = artifact.providerReceipt ? digest(artifact.providerReceipt) : null;
    if (!sourceAuthenticated || !validDate(source.startedAt) || !validDate(source.completedAt) || elapsedMs < 0 ||
        Date.parse(source.startedAt) < Date.parse(r.startsAt) || Date.parse(source.completedAt) > Date.parse(r.endsAt) ||
        Date.parse(source.completedAt) > Date.parse(o.observedAt) ||
        (source.surface === "slack" && (source.ingress.requestDigest !== digest(requestRecord) ||
          source.acknowledgment.requestDigest !== source.ingress.requestDigest ||
          source.acknowledgment.ingressKey !== source.ingress.key || source.acknowledgment.elapsedMs !== elapsedMs)) ||
        (source.surface === "slack" && (source.ingress.receivedAt !== source.startedAt ||
          source.acknowledgment.acknowledgedAt !== source.completedAt)) ||
        (source.surface === "web" && (source.request.requestId !== source.response.requestId ||
          source.request.receivedAt !== source.startedAt || source.response.completedAt !== source.completedAt)) ||
        (source.surface === "cli" && (source.invocation.invocationId !== source.result.invocationId ||
          source.invocation.invokedAt !== source.startedAt || source.result.completedAt !== source.completedAt)) ||
        (artifact.providerReceipt !== null && (!trust.verifyProviderReceipt(artifact.providerReceipt) || !validDate(artifact.providerReceipt.deliveredAt) ||
          Date.parse(artifact.providerReceipt.deliveredAt) < Date.parse(source.completedAt) ||
          Date.parse(artifact.providerReceipt.deliveredAt) > Date.parse(o.observedAt))) ||
        digest(requestRecord) !== o.requestDigest || digest(ingressRecord) !== o.ingressDigest ||
        digest(acknowledgmentRecord) !== o.acknowledgmentDigest || digest(artifact.audit) !== o.auditDigest ||
        artifact.audit.outcome !== o.outcome || elapsedMs !== o.ackMs || receiptDigest !== o.providerReceiptDigest ||
        Math.max(0, artifact.audit.effectDigests.length - 1) !== o.duplicateEffectCount ||
        (artifact.audit.effectDigests[0] ?? null) !== o.effectDigest)
      throw Error("R20 trial evidence derivation invalid");
    if (artifact.audit.requestDigest !== o.requestDigest || artifact.audit.providerReceiptDigest !== receiptDigest ||
        (artifact.providerReceipt === null ? artifact.audit.outboxId !== null :
          artifact.audit.outboxId !== artifact.providerReceipt.outboxId || artifact.providerReceipt.channelDigest !== r.channelDigest))
      throw Error("R20 provider/audit causal join invalid");
    const recoveryRecord = artifact.audit.recovery;
    if (o.kind === "attack" && o.outcome === "recovered") {
      if (!recoveryRecord || recoveryRecord.kind !== o.caseId || !validDigest(recoveryRecord.originalEffectDigest) ||
          recoveryRecord.originalEffectDigest !== o.effectDigest || recoveryRecord.effectCountAfter !== 1 ||
          !validDate(recoveryRecord.recoveredAt) || Date.parse(recoveryRecord.recoveredAt) < Date.parse(source.completedAt) ||
          Date.parse(recoveryRecord.recoveredAt) > Date.parse(o.observedAt) ||
          (["crash-after-ingress"].includes(o.caseId) ? recoveryRecord.effectCountBefore !== 0 : recoveryRecord.effectCountBefore !== 1) ||
          (o.caseId === "lost-outbound-message" ? recoveryRecord.deliveryAttempts < 2 : recoveryRecord.deliveryAttempts < 1))
        throw Error("R20 typed recovery evidence invalid");
    } else if (recoveryRecord !== null) throw Error("unexpected R20 recovery evidence");
    verifySignature(signableR20Observation(o), o.participantSignature, "participant observation");
    if (keyFingerprint(trust.participantKeys[o.participantId] ?? "") !== keyFingerprint(o.participantSignature.publicKeyPem))
      throw Error("participant observation is not bound to enrollment");
    const capabilities = trust.participantCapabilities[o.participantId] ?? [];
    if (!capabilities.includes(o.participantRole) || (o.accessibility !== "standard" && !capabilities.includes(o.accessibility)) ||
        (o.familiarity === "unfamiliar" && !capabilities.includes("unfamiliar")))
      throw Error("participant observation exceeds enrolled capabilities");
    if (Date.parse(o.participantSignature.signedAt) < Date.parse(o.observedAt) ||
        Date.parse(o.participantSignature.signedAt) > Date.parse(r.endsAt))
      throw Error("participant signature time is not causally valid");
    const prior = participants.get(o.participantId);
    if (prior && prior !== o.participantSignature.publicKeyPem) throw Error("participant key equivocation");
    participants.set(o.participantId, o.participantSignature.publicKeyPem);
    ids.add(o.observationId); completedTrials.add(o.trialId); cases.add(`${o.kind}:${o.caseId}`);
  }
  const authorized = new Set(r.trials.filter(t => t.participantRole === "authorized").map(t => t.participantId));
  if (completedTrials.size !== r.trials.length || r.trials.some(t => !completedTrials.has(t.id)) ||
      COMMANDS.some(x => !cases.has(`command:${x}`)) || ATTACKS.some(x => !cases.has(`attack:${x}`)) ||
      authorized.size < 2 || [...authorized].some(id => COMMANDS.some(c => !r.trials.some(t => t.participantId === id && t.kind === "command" && t.caseId === c))) ||
      !r.trials.some(t => t.surface === "web") || !r.trials.some(t => t.surface === "cli") ||
      !r.trials.some(t => t.accessibility === "keyboard") || !r.trials.some(t => t.accessibility === "screen-reader") ||
      !r.trials.some(t => t.familiarity === "unfamiliar") ||
      participants.size < r.minimumDistinctParticipants ||
      !bundle.observations.some(x => x.participantRole === "unauthorized"))
    throw Error("R20 external case or participant matrix incomplete");
  verifySignature(signableR20Campaign(bundle), bundle.collector, "collector");
  if (!trust.collectorAuthorityKeys.map(keyFingerprint).includes(keyFingerprint(bundle.collector.publicKeyPem)) ||
      keyFingerprint(bundle.collector.publicKeyPem) === keyFingerprint(r.registrationAuthority.publicKeyPem))
    throw Error("registration and collection authorities are not independent");
  if (bundle.observations.some(o => Date.parse(bundle.collector.signedAt) < Date.parse(o.participantSignature.signedAt)))
    throw Error("collector signed before observations completed");
  if (Date.parse(bundle.collector.signedAt) > Date.parse(r.endsAt))
    throw Error("collector signed after preregistered campaign close");
  const authorityFingerprints = [r.registrationAuthority.publicKeyPem, bundle.collector.publicKeyPem,
    ...Object.values(trust.participantKeys)].map(keyFingerprint);
  if (new Set(authorityFingerprints).size !== authorityFingerprints.length)
    throw Error("R20 authority and participant keys are not globally distinct");
  return { status: "R20-external-evidence-verified" as const, closureClaim: true as const,
    campaignId: r.campaignId, observationCount: bundle.observations.length,
    participantCount: participants.size, bundleDigest: digest(bundle) };
}
