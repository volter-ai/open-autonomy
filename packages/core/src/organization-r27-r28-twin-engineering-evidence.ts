import {
  verifyR27LiveBundlePublic,
  type R27LiveBundle,
} from "./organization-r27-live-canary";
import {
  verifyR28DogfoodArtifact,
  type R28DogfoodArtifact,
} from "./organization-r28-repository-dogfood-live";

export type TwinEngineeringAssessment = {
  checkpoint: "R27" | "R28";
  engineeringClosed: boolean;
  externalHumanClaim: false;
  productionClaim: false;
  properties: string[];
  residuals: string[];
};
export function assessR27TwinEngineeringEvidence(
  bundle: R27LiveBundle,
): TwinEngineeringAssessment {
  const verified = verifyR27LiveBundlePublic(bundle),
    properties: string[] = [],
    residuals: string[] = [];
  if (verified.substrate === "paperclip" && verified.effects.length === 2)
    properties.push("compiled-paperclip-port-effects");
  if (
    verified.decisions.at(-1)?.state === "rolled-back" &&
    verified.telemetry.carryover.treatmentRestored
  )
    properties.push("automatic-rollback-readback");
  if (
    verified.telemetry.interference.controlUnchanged &&
    verified.telemetry.interference.sentinelUnchanged
  )
    properties.push("bounded-scope-noninterference");
  if (verified.cleanup.status === "archived")
    properties.push("cleanup-readback");
  if (verified.telemetry.humanOrModelClaim !== "none")
    throw Error(
      "R27 twin engineering evidence must not make a human or model-performance claim",
    );
  residuals.push(
    "embedded ephemeral signer is not external identity",
    "single safety drill does not establish causal effectiveness",
    "novelty remains unknown",
    "Paperclip may be local or twinned rather than production",
  );
  return {
    checkpoint: "R27",
    engineeringClosed: properties.length === 4,
    externalHumanClaim: false,
    productionClaim: false,
    properties,
    residuals,
  };
}
export function assessR28TwinEngineeringEvidence(
  a: R28DogfoodArtifact,
): TwinEngineeringAssessment {
  if (!verifyR28DogfoodArtifact(a))
    throw Error("R28 dogfood artifact authentication failed");
  const properties: string[] = [],
    residuals = a.residuals.map((x) => x.reason),
    byOutcome = new Map(a.proposals.map((x) => [x.outcome, x]));
  const accepted = byOutcome.get("accepted"),
    rejected = byOutcome.get("rejected"),
    rolled = byOutcome.get("rolled-back");
  if (
    accepted?.testReceipts.length &&
    accepted.testReceipts.every((x) => x.exitCode === 0) &&
    accepted.gitCommits.length
  )
    properties.push("compiled-accepted-repository-effect");
  if (
    rejected?.testReceipts.some((x) => x.exitCode !== 0) &&
    !rejected.gitCommits.length
  )
    properties.push("compiled-test-gated-rejection");
  if (
    rolled &&
    rolled.testReceipts[0]?.exitCode !== 0 &&
    rolled.testReceipts.at(-1)?.exitCode === 0 &&
    rolled.gitCommits.length === 2
  )
    properties.push("compiled-guardrail-revert-readback");
  if (
    a.audit.every(
      (x, i) =>
        x.sequence === i + 1 &&
        (i === 0
          ? !x.previousDigest
          : x.previousDigest === a.audit[i - 1]!.digest),
    )
  )
    properties.push("durable-effect-audit-chain");
  if (a.attacks.forgedApprovalRejected && a.attacks.compromisedWorkerRejected)
    properties.push("deterministic-forgery-drills");
  if (
    a.crashCampaign.processRestartEvidence !== "model-only" ||
    a.soak.classification !== "short-local"
  )
    throw Error("R28 artifact overstates its engineering evidence class");
  const required = [
    "os-process-restart",
    "effect-crash-boundaries",
    "storage-crash-boundaries",
    "long-running",
    "canonical-repository",
    "external-signing",
  ];
  if (required.some((id) => !a.residuals.some((x) => x.id === id)))
    throw Error("R28 local/twin residual disclosure incomplete");
  return {
    checkpoint: "R28",
    engineeringClosed: properties.length === 5,
    externalHumanClaim: false,
    productionClaim: false,
    properties,
    residuals,
  };
}
