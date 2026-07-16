import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSemanticJson } from "../packages/core/src/organization-canonical";

const paths = ["scripts/generate-r22-readiness-evidence.ts",
  "packages/core/src/organization-canonical.ts", "packages/core/src/organization-canonical.test.ts",
  "packages/core/src/organization-benchmark-protocol.ts", "packages/core/src/organization-benchmark-protocol.test.ts",
  "packages/core/src/organization-r22-external-evidence-live.ts", "packages/core/src/organization-r22-external-evidence-live.test.ts",
  "packages/core/src/organization-r22-human-calibration-cli.ts", "packages/core/src/generated/r22-human-calibration-study.schema.json"].sort();
const sha=(x:string|Buffer)=>`sha256:${createHash("sha256").update(x).digest("hex")}`;
const evidence={checkpoint:"R22",purpose:"machine-reviewable benchmark-model and local-custody-fixture readiness; never externally trusted benchmark closure",closureClaim:false,
  components:paths.map(path=>({path,sha256:sha(readFileSync(path))})),evidenceClasses:["deterministic-model","owned-local-fixture"],
  proves:["workload partitions and signed bundle mechanics are implemented","assigned trial omission is rejected by the model","local bubblewrap fixture denies unmounted hidden files and network","simulator and real-human result labels are separated","human calibration refuses an absent or single-rater matrix"],
  doesNotProve:["externally trusted workload or grader custody","independently replayable custody conclusions","authority-backed human identity and consent","valid externally preregistered statistical inference","real-human calibration population coverage"],
  stillRequiredForClosure:["closed R3, R4, R8, R10, R11, R14, R16, R20 and R21 dependencies","external registration, workload, environment, scorer, privacy and grader trust roots","complete replayable signed trial and custody evidence","authenticated consented rater identity-key bijection and exact rater-item matrix","preregistered estimand, blocking, uncertainty, censoring and multiplicity analysis","complete signed campaign accepted by an external R22 campaign verifier"]};
await Bun.write("docs/evidence/R22-STRUCTURAL-READINESS.json",`${canonicalSemanticJson(evidence)}\n`);
