import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  verifyProgressLedger,
  type ProgressLedger,
} from "./organization-r20-r28-progress-ledger";

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
    (x: any) => (x.checkpoints[0].obligations[0].assurance = "proven"),
  ]) {
    const value: any = ledger();
    mutate(value);
    expect(() => verifyProgressLedger(root, value)).toThrow();
  }
});
