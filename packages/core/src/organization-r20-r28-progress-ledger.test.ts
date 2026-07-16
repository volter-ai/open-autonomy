import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  verifyProgressLedger,
  importProgressResiduals,
  verifyR24ReadinessEvidence,
  type ProgressLedger,
} from "./organization-r20-r28-progress-ledger";
import { canonicalSemanticJson } from "./organization-canonical";

const root = join(import.meta.dir, "../../..");
const ledger = () =>
  JSON.parse(
    readFileSync(
      join(root, "docs/runtime-ledgers/r20-r28-progress.json"),
      "utf8",
    ),
  ) as ProgressLedger;

test("imports every bound partial-evidence residual while preserving unknown obligations", () => {
  const result = verifyProgressLedger(root, ledger());
  expect(result.status).toBe("nonclosure-progress-verified");
  expect(result.residuals).toHaveLength(74);
  expect(result.readinessEvidence).toEqual([
    expect.objectContaining({ checkpoint: "R24" }),
  ]);
  expect(new Set(result.residuals.map((x) => x.checkpoint))).toEqual(
    new Set([
      "R18",
      "R20",
      "R21",
      "R22",
      "R23",
      "R24",
      "R25",
      "R26",
      "R27",
      "R28",
    ]),
  );
});

test("fails closed on fabricated closure, omitted residual import, source drift, or upgraded assurance", () => {
  for (const mutate of [
    (x: any) => (x.closureClaim = true),
    (x: any) => x.sources.pop(),
    (x: any) => (x.sources[0].sha256 = "sha256:" + "0".repeat(64)),
    (x: any) => (x.readinessEvidence[0].sha256 = "sha256:" + "0".repeat(64)),
    (x: any) => x.readinessEvidence.pop(),
    (x: any) => (x.checkpoints[0].obligations[1] = x.checkpoints[0].obligations[0]),
    (x: any) => (x.checkpoints[0].obligations[0].assurance = "proven"),
  ]) {
    const value: any = ledger();
    mutate(value);
    expect(() => verifyProgressLedger(root, value)).toThrow();
  }
});

test("rejects a self-consistent recomputed omission of a canonical residual source", () => {
  const value: any = ledger();
  value.sources.pop();
  const residuals = importProgressResiduals(root, value.sources);
  value.importedResidualCount = residuals.length;
  value.importedResidualDigest = `sha256:${createHash("sha256")
    .update(canonicalSemanticJson(residuals))
    .digest("hex")}`;
  expect(residuals).toHaveLength(63);
  expect(() => verifyProgressLedger(root, value)).toThrow(
    "canonical residual source inventory drift",
  );
});

test("rejects omission or drift anywhere in the derived R24 dependency and test inventory", () => {
  const evidence = JSON.parse(
    readFileSync(
      join(root, "docs/evidence/R24-V5-STRUCTURAL-READINESS.json"),
      "utf8",
    ),
  );
  expect(verifyR24ReadinessEvidence(root, evidence).components).toBe(30);
  const omitted = structuredClone(evidence);
  omitted.components = omitted.components.filter(
    (x: any) => x.path !== "packages/core/src/organization-r24-v5-protocol.ts",
  );
  expect(() => verifyR24ReadinessEvidence(root, omitted)).toThrow(
    "component inventory incomplete",
  );
  const drifted = structuredClone(evidence);
  drifted.components.find(
    (x: any) => x.path === "packages/core/src/organization-r24-v5-protocol.test.ts",
  ).sha256 = "sha256:" + "0".repeat(64);
  expect(() => verifyR24ReadinessEvidence(root, drifted)).toThrow(
    "readiness component drift",
  );
  const canonicalDrift = structuredClone(evidence);
  canonicalDrift.components.find(
    (x: any) => x.path === "packages/core/src/organization-canonical.test.ts",
  ).sha256 = "sha256:" + "0".repeat(64);
  expect(() => verifyR24ReadinessEvidence(root, canonicalDrift)).toThrow(
    "readiness component drift",
  );
});
