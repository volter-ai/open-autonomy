import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSemanticJson } from "../packages/core/src/organization-canonical";

const paths = [
  "scripts/generate-r20-readiness-evidence.ts", "package.json", "bun.lock",
  "packages/core/src/organization-command-plane.ts", "packages/core/src/organization-command-plane.test.ts",
  "packages/core/src/organization-command-transports.ts", "packages/core/src/organization-command-transports.test.ts",
  "packages/core/src/organization-slack-http-runtime.ts", "packages/core/src/organization-slack-http-runtime.test.ts",
  "packages/core/src/organization-slack-web-api-port.ts", "bench/dev/integration/slack-volter-twin.test.ts",
  "packages/core/src/organization-r20-external-campaign.ts", "packages/core/src/organization-r20-external-campaign.test.ts",
  "packages/core/src/organization-r20-r23-external-readiness.ts", "packages/core/src/organization-r20-r23-external-readiness.test.ts",
  "bench/dev/evidence/verify-external-campaign.ts", "bench/dev/evidence/verify-external-campaign.test.ts",
  "docs/evidence/R20-R28-EXTERNAL-INTAKE-SKEPTICAL-REVIEW.md",
  "bench/dev/evidence/r20-acquisition.ts", "bench/dev/evidence/r20-acquisition-cli.ts", "bench/dev/evidence/r20-acquisition.test.ts",
  "docs/evidence/R20-ACQUISITION-SKEPTICAL-REVIEW.md",
].sort();
const sha = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const evidence = {
  checkpoint: "R20", purpose: "machine-reviewable implementation, Volter simulation, and external-acquisition readiness; never external Slack or human evidence",
  closureClaim: false, components: paths.map(path => ({ path, sha256: sha(readFileSync(path)) })),
  simulation: { evidenceClass: "simulated-local-substrate", provider: "@volter/twin-slack",
    versions: { "@volter/twin": pkg.devDependencies["@volter/twin"], "@volter/twin-slack": pkg.devDependencies["@volter/twin-slack"],
      "@slack/web-api": pkg.devDependencies["@slack/web-api"] },
    test: "bench/dev/integration/slack-volter-twin.test.ts",
    proves: ["real Slack SDK compatibility", "threaded Web API delivery", "provider-side metadata reconciliation", "accept-then-timeout duplicate suppression", "durable restart"],
    doesNotProve: ["live Slack request delivery", "real workspace credentials", "real human usability", "keyboard accessibility", "screen-reader accessibility", "operator unfamiliarity"] },
  acquisition: { evidenceClass: "external-evidence-acquisition",
    proves: ["registration and participant key separation", "exact preregistered trial request domain", "parallel participant-bound signed response custody", "complete-before-collection gating", "restart-safe exact campaign assembly", "production R20 verifier composition"],
    doesNotProve: ["live Slack request delivery", "real workspace credentials", "real human participation", "keyboard accessibility", "screen-reader accessibility", "operator unfamiliarity"] },
  stillRequiredForClosure: ["closed R10, R17, R18 and R19 evidence pins", "externally administered live Slack workspace and app",
    "two authorized external participants plus a distinct unauthorized identity", "independently attested unfamiliar, keyboard and screen-reader participant strata",
    "complete signed real command, attack and recovery trial matrix accepted by the R20 external campaign verifier"],
};
await Bun.write("docs/evidence/R20-VOLTER-STRUCTURAL-READINESS.json", `${canonicalSemanticJson(evidence)}\n`);
