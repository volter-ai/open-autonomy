import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
      );
    if (
      !state ||
      checkpoint.state !== state.status ||
      !checkpoint.nextArtifact.id ||
      !checkpoint.nextArtifact.requirements.length ||
      checkpoint.obligations.length !== obligations.length ||
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
  return {
    status: "nonclosure-progress-verified" as const,
    closureClaim: false as const,
    residuals,
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
