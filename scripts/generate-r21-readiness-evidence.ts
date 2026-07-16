import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSemanticJson } from "../packages/core/src/organization-canonical";

const paths = [
  "scripts/generate-r21-readiness-evidence.ts",
  "packages/core/src/organization-canonical.ts", "packages/core/src/organization-canonical.test.ts",
  "packages/core/src/organization-runtime-reliability.ts", "packages/core/src/organization-runtime-reliability.test.ts",
  "packages/core/src/organization-runtime-reliability-live.ts", "packages/core/src/organization-runtime-reliability-live.test.ts",
  "packages/core/src/organization-r21-external-campaign.ts", "packages/core/src/organization-r21-external-campaign.test.ts",
  "bench/dev/evidence/verify-external-campaign.ts", "bench/dev/evidence/verify-external-campaign.test.ts",
  "docs/evidence/R20-R28-EXTERNAL-INTAKE-SKEPTICAL-REVIEW.md",
].sort();
const sha = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const evidence = {
  checkpoint: "R21", purpose: "machine-reviewable reliability model, local-fixture, and external-campaign-verifier readiness; never deployed disaster-campaign evidence",
  closureClaim: false, components: paths.map(path => ({ path, sha256: sha(readFileSync(path)) })),
  evidenceClasses: ["deterministic-model", "owned-local-fixture", "external-evidence-intake", "external-evidence-verifier"],
  proves: ["eight-service campaign evidence has an exact matrix", "SLO and billing arithmetic is dimensioned and conserved", "fault RPO/RTO and recovery cuts are causal", "topology and workload choices are preregistered", "operator and authority attestations are ordered and authenticated", "external evidence intake requires an independently attested exact trust module and emits a timestamp-bound content-addressed receipt"],
  doesNotProve: ["eight independently deployed services", "multi-region infrastructure", "real provider billing", "external KMS custody", "genuinely unfamiliar human operation", "real production disaster recovery"],
  stillRequiredForClosure: ["closed R15 through R20 dependency evidence", "owned two-region eight-service deployment with authenticated telemetry and billing", "owned process, storage, dependency, network, control-plane and region fault injection", "external KMS and billing authorities", "independently attested unfamiliar operator", "complete signed campaign accepted by the R21 external campaign verifier"],
};
await Bun.write("docs/evidence/R21-STRUCTURAL-READINESS.json", `${canonicalSemanticJson(evidence)}\n`);
