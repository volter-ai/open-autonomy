import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSemanticJson } from "../packages/core/src/organization-canonical";

const paths = [
  "scripts/generate-r27-readiness-evidence.ts",
  "packages/core/src/organization-canonical.ts",
  "packages/core/src/organization-canonical.test.ts",
  "packages/core/src/organization-experiment.ts",
  "packages/core/src/organization-experiment.test.ts",
  "packages/core/src/organization-r27-live-canary.ts",
  "packages/core/src/organization-r27-live-canary.test.ts",
  "packages/core/src/organization-r27-live-canary-gate.test.ts",
  "bench/dev/evidence/r27-external-closure.ts",
  "bench/dev/evidence/r27-external-closure.test.ts",
  "bench/dev/evidence/verify-external-campaign.ts",
  "bench/dev/evidence/verify-external-campaign.test.ts",
  "docs/evidence/R27-LIVE-CANARY-BUNDLE.json",
].sort();
const sha = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const evidence = {
  checkpoint: "R27",
  purpose: "machine-reviewable experiment model, owned local canary, and external-closure-verifier readiness; never external causal closure",
  closureClaim: false,
  components: paths.map((path) => ({ path, sha256: sha(readFileSync(path)) })),
  evidenceClasses: ["deterministic-model", "owned-local-canary", "external-evidence-verifier"],
  proves: [
    "all declared experiment modes have bounded deterministic assignment schedules",
    "preregistration, multiplicity, stopping, missingness, provenance, and forbidden-boundary checks are implemented",
    "an owned Paperclip canary performed a real treatment write and automatic guardrail rollback",
    "external closure requires exact randomization replay, raw outcome joins, resolved causal diagnostics, independent roles, durable rollback retry, and cleanup readback",
  ],
  doesNotProve: [
    "closed R19, R21, R22, R23, R24, R25, and R26 dependencies",
    "externally administered population, assignment, exposure, outcome, analysis, rollback, and cleanup authorities",
    "identified novelty, carryover, selection, and interference effects in the owned one-unit canary",
    "externally signed causal estimate or promotion decision",
  ],
  stillRequiredForClosure: [
    "closed dependency artifacts accepted by independently configured dependency verifiers",
    "externally frozen eligible population and preregistered exact randomization design",
    "independently signed assignments, exposures, raw outcomes, diagnostics, analysis, and decision",
    "automatic rollback crash/retry evidence with stable idempotency and verified safe-state readback",
    "externally verified scope cleanup and complete bundle accepted by the R27 external closure verifier",
  ],
};
await Bun.write("docs/evidence/R27-STRUCTURAL-READINESS.json", `${canonicalSemanticJson(evidence)}\n`);
