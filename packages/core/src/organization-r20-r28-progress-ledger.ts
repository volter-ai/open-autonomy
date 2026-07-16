import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";

export type ProgressLedger = {
  schema: "autonomy.runtime-progress-ledger.v1";
  purpose: "progress-and-residual-accounting-only";
  closureClaim: false;
  normativePredecessor: { path: string; sha256: string; immutable: true };
  sources: Array<{
    path: string;
    sha256: string;
    selector: string;
    expectedCount: number;
  }>;
  readinessEvidence: Array<{
    checkpoint: string;
    path: string;
    sha256: string;
  }>;
  checkpoints: Array<{
    id: string;
    state: "ready" | "blocked";
    obligations: Array<{ id: string; assurance: "unknown" }>;
    nextArtifact: { id: string; requirements: string[] };
  }>;
  importedResidualCount: number;
  importedResidualDigest: string;
};

type Residual = {
  checkpoint: string;
  source: string;
  locator: string;
  statement: string;
};
const sha = (bytes: string | Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const semanticDigest = (x: unknown) => sha(canonicalSemanticJson(x));
const CANONICAL_PROGRESS_SOURCES: ProgressLedger["sources"] = [
  { path: "docs/evidence/R20-R23-EXTERNAL-PARTICIPATION.md", sha256: "sha256:2970a3ca9d1a1578e7f64d679047b709f27c50319f7f9fd9d3b5ebf9d7aca33c", selector: "external-participation-rows", expectedCount: 9 },
  { path: "docs/evidence/R21-LIVE-CAMPAIGN.json", sha256: "sha256:ac567dec901f1951d09004ac7ec12ab5e306c35933fe154515a905649e373c92", selector: "residuals", expectedCount: 24 },
  { path: "docs/evidence/R22-EXTERNAL-CUSTODY-GATE.json", sha256: "sha256:54272e1eb14f52b70b8448bf8d3df81b37dec8b2b722e4f4e3831fc8eb5d1139", selector: "residuals", expectedCount: 1 },
  { path: "docs/evidence/R23-LOCAL-PROPERTY-GATE.json", sha256: "sha256:c20a51632de12f79fb8e12203f478943bc7aad5c05eb4d9a2d88de9740bd24db", selector: "dependency-residuals", expectedCount: 10 },
  { path: "docs/evidence/R24-V5-NESTED-HERMES-SMOKE.json", sha256: "sha256:de3c0b6b719a5567289234a5a1dd72d0c0661b038fe359843ee78a8ca01a6844", selector: "null-live-fields", expectedCount: 3 },
  { path: "docs/evidence/rejected/R24-R25-ATTEMPTS.json", sha256: "sha256:76ba3b035365979157817e9a759175f67974f90e3b07a52b7962cc63071b13b3", selector: "rejected-attempt-reasons", expectedCount: 15 },
  { path: "docs/evidence/R27-LIVE-CANARY-BUNDLE.json", sha256: "sha256:2301a65a4c4968f2c84a726392172d80cb2e64f2363bc609f1f21d72a185aa0d", selector: "unknown-telemetry", expectedCount: 1 },
  { path: "docs/evidence/R28-REPOSITORY-DOGFOOD.json", sha256: "sha256:e8e736591b2fe0eaa2d6574fc6d4894f5de4d4d75ca05403616adb2cef87ec33", selector: "residuals", expectedCount: 11 },
];
const CANONICAL_RESIDUAL_COUNT = 74;
const CANONICAL_RESIDUAL_DIGEST =
  "sha256:2d27a737bf52d74fff32aefbb6aaafa0bd798bb20f4d73c05026fabbbada03da";
function requiredR24ReadinessPaths(root: string) {
  const core = readdirSync(join(root, "packages/core/src"), {
      recursive: true,
    }) as string[],
    selectedCore = core
      .map((path) => `packages/core/src/${path.replaceAll("\\", "/")}`)
      .filter((path) =>
        /\/(?:organization-r24-[^/]+|organization-matched-benchmark(?:\.test)?\.ts|organization-canonical(?:\.test)?\.ts|organization-process-tree-supervisor-contract(?:\.test)?\.ts|test-support\/organization-r24-v5-fixture(?:\.test)?\.ts)$/.test(
          path,
        ),
      ),
    bin = readdirSync(join(root, "bin"))
      .filter((path) => /^organization-r24-v5(?:\.test)?\.ts$/.test(path))
      .map((path) => `bin/${path}`);
  return [...selectedCore, ...bin].sort();
}
const REQUIRED_R20_READINESS_PATHS = [
  "scripts/generate-r20-readiness-evidence.ts", "package.json", "bun.lock",
  "packages/core/src/organization-command-plane.ts", "packages/core/src/organization-command-plane.test.ts",
  "packages/core/src/organization-command-transports.ts", "packages/core/src/organization-command-transports.test.ts",
  "packages/core/src/organization-slack-http-runtime.ts", "packages/core/src/organization-slack-http-runtime.test.ts",
  "packages/core/src/organization-slack-web-api-port.ts", "bench/dev/integration/slack-volter-twin.test.ts",
  "packages/core/src/organization-r20-external-campaign.ts", "packages/core/src/organization-r20-external-campaign.test.ts",
  "packages/core/src/organization-r20-r23-external-readiness.ts", "packages/core/src/organization-r20-r23-external-readiness.test.ts",
].sort();
const R20_SIMULATION_PROVES = ["real Slack SDK compatibility", "threaded Web API delivery",
  "provider-side metadata reconciliation", "accept-then-timeout duplicate suppression", "durable restart"];
const R20_SIMULATION_LIMITS = ["live Slack request delivery", "real workspace credentials", "real human usability",
  "keyboard accessibility", "screen-reader accessibility", "operator unfamiliarity"];
const R20_CLOSURE_REQUIREMENTS = ["closed R10, R17, R18 and R19 evidence pins",
  "externally administered live Slack workspace and app", "two authorized external participants plus a distinct unauthorized identity",
  "independently attested unfamiliar, keyboard and screen-reader participant strata",
  "complete signed real command, attack and recovery trial matrix accepted by the R20 external campaign verifier"];
const REQUIRED_R21_READINESS_PATHS = ["scripts/generate-r21-readiness-evidence.ts",
  "packages/core/src/organization-canonical.ts", "packages/core/src/organization-canonical.test.ts",
  "packages/core/src/organization-runtime-reliability.ts", "packages/core/src/organization-runtime-reliability.test.ts",
  "packages/core/src/organization-runtime-reliability-live.ts", "packages/core/src/organization-runtime-reliability-live.test.ts",
  "packages/core/src/organization-r21-external-campaign.ts", "packages/core/src/organization-r21-external-campaign.test.ts"].sort();
const R21_CLASSES = ["deterministic-model", "owned-local-fixture", "external-evidence-verifier"];
const R21_PROVES = ["eight-service campaign evidence has an exact matrix", "SLO and billing arithmetic is dimensioned and conserved", "fault RPO/RTO and recovery cuts are causal", "topology and workload choices are preregistered", "operator and authority attestations are ordered and authenticated"];
const R21_LIMITS = ["eight independently deployed services", "multi-region infrastructure", "real provider billing", "external KMS custody", "genuinely unfamiliar human operation", "real production disaster recovery"];
const R21_CLOSURE_REQUIREMENTS = ["closed R15 through R20 dependency evidence", "owned two-region eight-service deployment with authenticated telemetry and billing", "owned process, storage, dependency, network, control-plane and region fault injection", "external KMS and billing authorities", "independently attested unfamiliar operator", "complete signed campaign accepted by the R21 external campaign verifier"];
const REQUIRED_R22_READINESS_PATHS=["scripts/generate-r22-readiness-evidence.ts","packages/core/src/organization-canonical.ts","packages/core/src/organization-canonical.test.ts","packages/core/src/organization-benchmark-protocol.ts","packages/core/src/organization-benchmark-protocol.test.ts","packages/core/src/organization-r22-external-evidence-live.ts","packages/core/src/organization-r22-external-evidence-live.test.ts","packages/core/src/organization-r22-external-campaign.ts","packages/core/src/organization-r22-external-campaign.test.ts","packages/core/src/organization-r22-human-calibration-cli.ts","packages/core/src/generated/r22-human-calibration-study.schema.json"].sort();
const R22_CLASSES=["deterministic-model","owned-local-fixture","external-evidence-verifier"],R22_PROVES=["workload partitions and signed bundle mechanics are implemented","assigned trial omission is rejected by the model","local bubblewrap fixture denies unmounted hidden files and network","simulator and real-human result labels are separated","human calibration refuses an absent or single-rater matrix","external campaign matrices, authority separation, seeded replay, causal enrollment, statistics, and cost conservation are verified"],R22_LIMITS=["externally trusted workload or grader custody","independently replayable custody conclusions","authority-backed human identity and consent","valid externally preregistered statistical inference","real-human calibration population coverage"],R22_CLOSURE_REQUIREMENTS=["closed R3, R4, R8, R10, R11, R14, R16, R20 and R21 dependencies","external registration, workload, environment, scorer, privacy and grader trust roots","complete replayable signed trial and custody evidence","authenticated consented rater identity-key bijection and exact rater-item matrix","preregistered estimand, blocking, uncertainty, censoring and multiplicity analysis","complete signed campaign accepted by an external R22 campaign verifier"];
export function verifyR20ReadinessEvidence(root: string, evidence: any) {
  if (evidence.checkpoint !== "R20" || evidence.closureClaim !== false ||
      evidence.purpose !== "machine-reviewable implementation and Volter simulation readiness; never external Slack or human evidence" ||
      evidence.simulation?.evidenceClass !== "simulated-local-substrate" || evidence.simulation?.provider !== "@volter/twin-slack" ||
      semanticDigest(evidence.simulation.proves) !== semanticDigest(R20_SIMULATION_PROVES) ||
      semanticDigest(evidence.simulation.doesNotProve) !== semanticDigest(R20_SIMULATION_LIMITS) ||
      semanticDigest(evidence.stillRequiredForClosure) !== semanticDigest(R20_CLOSURE_REQUIREMENTS) ||
      evidence.simulation.proves.some((x: string) => evidence.simulation.doesNotProve.includes(x)))
    throw Error("R20 readiness evidence cannot prove closure");
  const submitted = evidence.components.map((x: any) => x.path).sort();
  if (new Set(submitted).size !== submitted.length || semanticDigest(submitted) !== semanticDigest(REQUIRED_R20_READINESS_PATHS))
    throw Error("R20 readiness component inventory incomplete");
  for (const component of evidence.components)
    if (sha(readFileSync(join(root, component.path))) !== component.sha256)
      throw Error(`R20 readiness component drift: ${component.path}`);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (semanticDigest(Object.keys(evidence.simulation.versions).sort()) !==
      semanticDigest(["@slack/web-api", "@volter/twin", "@volter/twin-slack"]))
    throw Error("R20 simulation dependency inventory incomplete");
  for (const [name, version] of Object.entries(evidence.simulation.versions))
    if (pkg.devDependencies?.[name] !== version) throw Error(`R20 simulation dependency drift: ${name}`);
  return { closureClaim: false as const, components: submitted.length, evidenceClass: "simulated-local-substrate" as const };
}
export function verifyR21ReadinessEvidence(root: string, evidence: any) {
  if (evidence.checkpoint !== "R21" || evidence.closureClaim !== false || evidence.purpose !== "machine-reviewable reliability model, local-fixture, and external-campaign-verifier readiness; never deployed disaster-campaign evidence" ||
      semanticDigest(evidence.evidenceClasses) !== semanticDigest(R21_CLASSES) || semanticDigest(evidence.proves) !== semanticDigest(R21_PROVES) ||
      semanticDigest(evidence.doesNotProve) !== semanticDigest(R21_LIMITS) || semanticDigest(evidence.stillRequiredForClosure) !== semanticDigest(R21_CLOSURE_REQUIREMENTS) ||
      evidence.proves.some((x: string) => evidence.doesNotProve.includes(x))) throw Error("R21 readiness evidence cannot prove closure");
  const submitted = evidence.components.map((x: any) => x.path).sort();
  if (new Set(submitted).size !== submitted.length || semanticDigest(submitted) !== semanticDigest(REQUIRED_R21_READINESS_PATHS))
    throw Error("R21 readiness component inventory incomplete");
  for (const component of evidence.components) if (sha(readFileSync(join(root, component.path))) !== component.sha256)
    throw Error(`R21 readiness component drift: ${component.path}`);
  return { closureClaim: false as const, components: submitted.length, evidenceClasses: structuredClone(R21_CLASSES) };
}
export function verifyR22ReadinessEvidence(root:string,evidence:any){if(evidence.checkpoint!=="R22"||evidence.closureClaim!==false||evidence.purpose!=="machine-reviewable benchmark-model, local-custody-fixture, and external-campaign-verifier readiness; never externally trusted benchmark closure"||semanticDigest(evidence.evidenceClasses)!==semanticDigest(R22_CLASSES)||semanticDigest(evidence.proves)!==semanticDigest(R22_PROVES)||semanticDigest(evidence.doesNotProve)!==semanticDigest(R22_LIMITS)||semanticDigest(evidence.stillRequiredForClosure)!==semanticDigest(R22_CLOSURE_REQUIREMENTS)||evidence.proves.some((x:string)=>evidence.doesNotProve.includes(x)))throw Error("R22 readiness evidence cannot prove closure");const submitted=evidence.components.map((x:any)=>x.path).sort();if(new Set(submitted).size!==submitted.length||semanticDigest(submitted)!==semanticDigest(REQUIRED_R22_READINESS_PATHS))throw Error("R22 readiness component inventory incomplete");for(const x of evidence.components)if(sha(readFileSync(join(root,x.path)))!==x.sha256)throw Error(`R22 readiness component drift: ${x.path}`);return{closureClaim:false as const,components:submitted.length,evidenceClasses:structuredClone(R22_CLASSES)}}
export function verifyR24ReadinessEvidence(root: string, evidence: any) {
  if (
    evidence.checkpoint !== "R24" ||
    evidence.closureClaim !== false ||
    evidence.purpose !==
      "machine-reviewable implementation readiness; never live benchmark evidence" ||
    !Array.isArray(evidence.components) ||
    !evidence.components.length ||
    !Array.isArray(evidence.stillRequiredForClosure) ||
    !evidence.stillRequiredForClosure.length
  )
    throw Error("R24 readiness evidence cannot prove closure");
  const submittedComponents = evidence.components
      .map((component: any) => component.path)
      .sort(),
    requiredComponents = requiredR24ReadinessPaths(root);
  if (
    new Set(submittedComponents).size !== submittedComponents.length ||
    semanticDigest(submittedComponents) !== semanticDigest(requiredComponents)
  )
    throw Error("R24 readiness component inventory incomplete");
  for (const component of evidence.components) {
    const bytes = readFileSync(join(root, component.path));
    if (sha(bytes) !== component.sha256)
      throw Error(`readiness component drift: ${component.path}`);
  }
  return { closureClaim: false as const, components: requiredComponents.length };
}

function extract(path: string, selector: string, raw: string): Residual[] {
  if (selector === "external-participation-rows")
    return raw
      .split(/\r?\n/)
      .filter((line) => /^\| R2[0-3] \|/.test(line))
      .map((line, i) => {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((x) => x.trim());
        return {
          checkpoint: cells[0]!,
          source: path,
          locator: `table-row:${i + 1}`,
          statement: `${cells[1]} — ${cells[2]} — ${cells[3]}`,
        };
      });
  const value = JSON.parse(raw);
  if (selector === "residuals")
    return value.residuals.map((x: any, i: number) => ({
      checkpoint: /^r(\d+)/i.test(x.id)
        ? `R${RegExp.$1}`
        : path.includes("R21-")
          ? "R21"
          : path.includes("R22-")
            ? "R22"
            : "R28",
      source: path,
      locator: `residuals[${i}]`,
      statement: `${x.id}: ${x.reason}`,
    }));
  if (selector === "dependency-residuals")
    return value.dependencyDag.flatMap((x: any, i: number) =>
      x.residuals.map((r: string, j: number) => ({
        checkpoint: x.checkpoint,
        source: path,
        locator: `dependencyDag[${i}].residuals[${j}]`,
        statement: r,
      })),
    );
  if (selector === "rejected-attempt-reasons")
    return value.attempts.flatMap((x: any, i: number) =>
      x.reasons.map((r: string, j: number) => ({
        checkpoint: x.id.slice(0, 3),
        source: path,
        locator: `attempts[${i}].reasons[${j}]`,
        statement: `${x.id}: ${r}`,
      })),
    );
  if (selector === "null-live-fields")
    return ["providerResponseAttestation", "moneyUsd", "providerRevision"]
      .filter((key) => value.usage[key] === null)
      .map((key) => ({
        checkpoint: "R24",
        source: path,
        locator: `usage.${key}`,
        statement: `${key} is explicitly unknown`,
      }));
  if (selector === "unknown-telemetry")
    return value.telemetry.novelty.status === "unknown"
      ? [
          {
            checkpoint: "R27",
            source: path,
            locator: "telemetry.novelty.status",
            statement: `novelty effect unknown: ${value.telemetry.novelty.reason}`,
          },
        ]
      : [];
  throw Error(`unsupported residual selector: ${selector}`);
}

export function verifyProgressLedger(root: string, ledger: ProgressLedger) {
  if (
    ledger.schema !== "autonomy.runtime-progress-ledger.v1" ||
    ledger.purpose !== "progress-and-residual-accounting-only" ||
    ledger.closureClaim !== false ||
    ledger.normativePredecessor.immutable !== true
  )
    throw Error("progress ledger cannot be consumed as closure");
  if (
    semanticDigest(ledger.sources) !== semanticDigest(CANONICAL_PROGRESS_SOURCES) ||
    ledger.importedResidualCount !== CANONICAL_RESIDUAL_COUNT ||
    ledger.importedResidualDigest !== CANONICAL_RESIDUAL_DIGEST
  )
    throw Error("canonical residual source inventory drift");
  const predecessor = readFileSync(
    join(root, ledger.normativePredecessor.path),
  );
  if (sha(predecessor) !== ledger.normativePredecessor.sha256)
    throw Error("normative predecessor drift");
  const normative = JSON.parse(predecessor.toString("utf8"));
  const expectedStates = normative.checkpointStateLedger.filter((x: any) =>
    /^R2[0-8]$/.test(x.id),
  );
  const expectedObligations = normative.obligationLedger.filter((x: any) =>
    /^R2[0-8]$/.test(x.checkpoint),
  );
  if (
    ledger.checkpoints.length !== 9 ||
    new Set(ledger.checkpoints.map((x) => x.id)).size !== 9
  )
    throw Error("checkpoint coverage invalid");
  for (const checkpoint of ledger.checkpoints) {
    const state = expectedStates.find((x: any) => x.id === checkpoint.id),
      obligations = expectedObligations.filter(
        (x: any) => x.checkpoint === checkpoint.id,
      ),
      submittedIds = checkpoint.obligations.map((x) => x.id).sort(),
      expectedIds = obligations.map((x: any) => x.id).sort();
    if (
      !state ||
      checkpoint.state !== state.status ||
      !checkpoint.nextArtifact.id ||
      !checkpoint.nextArtifact.requirements.length ||
      checkpoint.obligations.length !== obligations.length ||
      new Set(submittedIds).size !== submittedIds.length ||
      semanticDigest(submittedIds) !== semanticDigest(expectedIds) ||
      checkpoint.obligations.some(
        (x) =>
          x.assurance !== "unknown" ||
          !obligations.some(
            (o: any) => o.id === x.id && o.assurance === "unknown",
          ),
      )
    )
      throw Error(`checkpoint accounting invalid: ${checkpoint.id}`);
  }
  const residuals = importProgressResiduals(root, ledger.sources);
  if (
    residuals.length !== ledger.importedResidualCount ||
    semanticDigest(residuals) !== ledger.importedResidualDigest
  )
    throw Error("imported residual inventory mismatch");
  if (
    !Array.isArray(ledger.readinessEvidence) ||
    semanticDigest(ledger.readinessEvidence.map(x => x.checkpoint).sort()) !== semanticDigest(["R20", "R21", "R22", "R24"]) ||
    new Set(ledger.readinessEvidence.map((x) => x.checkpoint)).size !==
      ledger.readinessEvidence.length
  )
    throw Error("readiness evidence index invalid");
  for (const entry of ledger.readinessEvidence) {
    const raw = readFileSync(join(root, entry.path), "utf8");
    if (sha(raw) !== entry.sha256)
      throw Error(`readiness evidence drift: ${entry.path}`);
    const evidence = JSON.parse(raw);
    if (evidence.checkpoint !== entry.checkpoint)
      throw Error(`readiness checkpoint mismatch: ${entry.path}`);
    if (entry.checkpoint === "R20") verifyR20ReadinessEvidence(root, evidence);
    else if (entry.checkpoint === "R21") verifyR21ReadinessEvidence(root, evidence);
    else if (entry.checkpoint === "R22") verifyR22ReadinessEvidence(root, evidence);
    else if (entry.checkpoint === "R24") verifyR24ReadinessEvidence(root, evidence);
    else throw Error(`unsupported readiness checkpoint: ${entry.checkpoint}`);
  }
  return {
    status: "nonclosure-progress-verified" as const,
    closureClaim: false as const,
    residuals,
    readinessEvidence: structuredClone(ledger.readinessEvidence),
  };
}

export function importProgressResiduals(
  root: string,
  sources: ProgressLedger["sources"],
) {
  const residuals: Residual[] = [];
  for (const source of sources) {
    const raw = readFileSync(join(root, source.path), "utf8");
    if (sha(raw) !== source.sha256)
      throw Error(`progress source drift: ${source.path}`);
    const imported = extract(source.path, source.selector, raw);
    if (imported.length !== source.expectedCount)
      throw Error(`residual import count changed: ${source.path}`);
    residuals.push(...imported);
  }
  return residuals;
}
