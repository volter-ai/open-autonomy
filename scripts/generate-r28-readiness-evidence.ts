import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSemanticJson } from "../packages/core/src/organization-canonical";

const paths = [
  "scripts/generate-r28-readiness-evidence.ts",
  "packages/core/src/organization-canonical.ts",
  "packages/core/src/organization-canonical.test.ts",
  "packages/core/src/organization-improvement-loop.ts",
  "packages/core/src/organization-improvement-loop.test.ts",
  "packages/core/src/organization-r28-long-running-campaign.ts",
  "packages/core/src/organization-r28-long-running-campaign.test.ts",
  "packages/core/src/organization-r28-repository-dogfood-live.ts",
  "packages/core/src/organization-r28-repository-dogfood-live.test.ts",
  "packages/core/src/organization-r28-dogfood-v3.test.ts",
  "bench/dev/evidence/r28-external-campaign.ts",
  "bench/dev/evidence/r28-external-campaign.test.ts",
  "docs/evidence/R28-REPOSITORY-DOGFOOD.json",
].sort();
const sha = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const evidence = {
  checkpoint: "R28",
  purpose: "machine-reviewable bounded-improvement model, short repository dogfood, and external-campaign-verifier readiness; never long-running autonomous-organization closure",
  closureClaim: false,
  components: paths.map((path) => ({ path, sha256: sha(readFileSync(path)) })),
  evidenceClasses: ["deterministic-model", "owned-short-dogfood", "external-evidence-verifier"],
  proves: [
    "proposal, evaluation, approval, deployment, canary, decision, effect, pause, and audit transitions are bounded and restartable in the model",
    "accepted, rejected, and automatically rolled-back repository proposals execute with explicit accounting and protected controls",
    "forged approval and compromised-worker evidence are rejected",
    "external campaign verification requires role separation, dependency closure, repository mutation, 90-day heartbeats, OS-process crash coverage, zero residuals, and an independent validator",
  ],
  doesNotProve: [
    "closure of every R0 through R27 dependency",
    "a 90-day canonical-repository campaign",
    "fresh OS-process restart and durable storage recovery at every phase and effect boundary",
    "external identity, signing, accounting, crash-injection, and validation authorities",
    "measurable preregistered improvement without safety regression under real operation",
  ],
  stillRequiredForClosure: [
    "closed dependency artifacts for every prior checkpoint",
    "long-running canonical-repository heartbeats within the declared maximum observation gap",
    "at least one accepted, one rejected, and one automatically rolled-back externally evidenced proposal",
    "fresh-process crash/recovery evidence for every phase plus prepare, delivery, acknowledgement, and storage boundaries",
    "independent role grants, external accounting and attack attestations, global-pause safe-state proof, zero residuals, and independent campaign validation",
  ],
};
await Bun.write("docs/evidence/R28-STRUCTURAL-READINESS.json", `${canonicalSemanticJson(evidence)}\n`);
