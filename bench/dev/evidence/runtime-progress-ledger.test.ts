import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  verifyProgressLedger,
  importProgressResiduals,
  verifyR20ReadinessEvidence,
  verifyR21ReadinessEvidence,
  verifyR22ReadinessEvidence,
  verifyR23ReadinessEvidence,
  verifyR24ReadinessEvidence,
  verifyR25ReadinessEvidence,
  verifyR26ReadinessEvidence,
  verifyR27ReadinessEvidence,
  verifyR28ReadinessEvidence,
  type BenchProgressLedger,
} from "./runtime-progress-ledger";
import { canonicalSemanticJson } from "@open-autonomy/core";

const root = join(import.meta.dir, "../../..");
const ledger = () =>
  JSON.parse(
    readFileSync(
      join(root, "docs/runtime-ledgers/r20-r28-progress.json"),
      "utf8",
    ),
  ) as BenchProgressLedger;

test("imports every bound partial-evidence residual while preserving unknown obligations", () => {
  const result = verifyProgressLedger(root, ledger());
  expect(result.status).toBe("nonclosure-progress-verified");
  expect(result.residuals).toHaveLength(74);
  expect(result.readinessEvidence).toEqual([
    expect.objectContaining({ checkpoint: "R20" }),
    expect.objectContaining({ checkpoint: "R21" }),
    expect.objectContaining({ checkpoint: "R22" }),
    expect.objectContaining({ checkpoint: "R23" }),
    expect.objectContaining({ checkpoint: "R24" }),
    expect.objectContaining({ checkpoint: "R25" }),
    expect.objectContaining({ checkpoint: "R26" }),
    expect.objectContaining({ checkpoint: "R27" }),
    expect.objectContaining({ checkpoint: "R28" }),
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

test("rejects omission or drift in R20 implementation and Volter simulation readiness", () => {
  const evidence = JSON.parse(readFileSync(join(root, "docs/evidence/R20-VOLTER-STRUCTURAL-READINESS.json"), "utf8"));
  expect(verifyR20ReadinessEvidence(root, evidence)).toMatchObject({ components: 22, closureClaim: false,
    evidenceClass: "simulated-local-substrate", acquisitionClass: "external-evidence-acquisition" });
  const omitted = structuredClone(evidence); omitted.components.pop();
  expect(() => verifyR20ReadinessEvidence(root, omitted)).toThrow("component inventory incomplete");
  const lied = structuredClone(evidence); lied.closureClaim = true;
  expect(() => verifyR20ReadinessEvidence(root, lied)).toThrow("cannot prove closure");
  const drifted = structuredClone(evidence); drifted.components[0].sha256 = "sha256:" + "0".repeat(64);
  expect(() => verifyR20ReadinessEvidence(root, drifted)).toThrow("component drift");
  const contradictory = structuredClone(evidence); contradictory.simulation.proves.push("real human usability");
  expect(() => verifyR20ReadinessEvidence(root, contradictory)).toThrow("cannot prove closure");
  const replaced = structuredClone(evidence); replaced.stillRequiredForClosure = Array(5).fill("anything");
  expect(() => verifyR20ReadinessEvidence(root, replaced)).toThrow("cannot prove closure");
  const omittedDependency = structuredClone(evidence); delete omittedDependency.simulation.versions["@volter/twin"];
  expect(() => verifyR20ReadinessEvidence(root, omittedDependency)).toThrow("dependency inventory incomplete");
  const inflatedAcquisition = structuredClone(evidence); inflatedAcquisition.acquisition.doesNotProve = [];
  expect(() => verifyR20ReadinessEvidence(root, inflatedAcquisition)).toThrow("cannot prove closure");
});

test("rejects omission, drift, or closure inflation in R21 structural readiness", () => {
  const evidence = JSON.parse(readFileSync(join(root, "docs/evidence/R21-STRUCTURAL-READINESS.json"), "utf8"));
  expect(verifyR21ReadinessEvidence(root, evidence)).toMatchObject({ components: 16, closureClaim: false });
  expect(evidence.components.map((x: any) => x.path)).toEqual(expect.arrayContaining([
    "packages/core/src/organization-canonical.ts", "packages/core/src/organization-canonical.test.ts",
  ]));
  const omitted = structuredClone(evidence); omitted.components.pop();
  expect(() => verifyR21ReadinessEvidence(root, omitted)).toThrow("component inventory incomplete");
  const drifted = structuredClone(evidence); drifted.components[0].sha256 = "sha256:" + "0".repeat(64);
  expect(() => verifyR21ReadinessEvidence(root, drifted)).toThrow("component drift");
  const lied = structuredClone(evidence); lied.closureClaim = true;
  expect(() => verifyR21ReadinessEvidence(root, lied)).toThrow("cannot prove closure");
  const erased = structuredClone(evidence); erased.doesNotProve = [];
  expect(() => verifyR21ReadinessEvidence(root, erased)).toThrow("cannot prove closure");
});
test("keeps R22 local custody and benchmark readiness structurally exact and non-closing",()=>{const evidence=JSON.parse(readFileSync(join(root,"docs/evidence/R22-STRUCTURAL-READINESS.json"),"utf8"));expect(verifyR22ReadinessEvidence(root,evidence)).toMatchObject({components:18,closureClaim:false});for(const mutate of [(x:any)=>x.components.pop(),(x:any)=>x.components[0].sha256="sha256:"+"0".repeat(64),(x:any)=>x.closureClaim=true,(x:any)=>x.doesNotProve=[]]){const changed=structuredClone(evidence);mutate(changed);expect(()=>verifyR22ReadinessEvidence(root,changed)).toThrow()}});
test("binds R23 accounting acquisition without upgrading it to live closure",()=>{const evidence=JSON.parse(readFileSync(join(root,"docs/evidence/R23-STRUCTURAL-READINESS.json"),"utf8"));expect(verifyR23ReadinessEvidence(root,evidence)).toMatchObject({components:16,closureClaim:false});for(const mutate of [(x:any)=>x.components.pop(),(x:any)=>x.components[0].sha256="sha256:"+"0".repeat(64),(x:any)=>x.closureClaim=true,(x:any)=>x.doesNotProve=[]]){const changed=structuredClone(evidence);mutate(changed);expect(()=>verifyR23ReadinessEvidence(root,changed)).toThrow()}});
test("binds R25 leakage-safe calibration acquisition without live closure",()=>{const evidence=JSON.parse(readFileSync(join(root,"docs/evidence/R25-STRUCTURAL-READINESS.json"),"utf8"));expect(verifyR25ReadinessEvidence(root,evidence)).toMatchObject({components:14,closureClaim:false});for(const mutate of [(x:any)=>x.components.pop(),(x:any)=>x.components[0].sha256="sha256:"+"0".repeat(64),(x:any)=>x.closureClaim=true,(x:any)=>x.doesNotProve=[]]){const changed=structuredClone(evidence);mutate(changed);expect(()=>verifyR25ReadinessEvidence(root,changed)).toThrow()}});
test("binds R26 certificate acquisition without live optimization closure",()=>{const evidence=JSON.parse(readFileSync(join(root,"docs/evidence/R26-STRUCTURAL-READINESS.json"),"utf8"));expect(verifyR26ReadinessEvidence(root,evidence)).toMatchObject({components:12,closureClaim:false});for(const mutate of [(x:any)=>x.components.pop(),(x:any)=>x.components[0].sha256="sha256:"+"0".repeat(64),(x:any)=>x.closureClaim=true,(x:any)=>x.doesNotProve=[]]){const changed=structuredClone(evidence);mutate(changed);expect(()=>verifyR26ReadinessEvidence(root,changed)).toThrow()}});

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
  expect(verifyR24ReadinessEvidence(root, evidence).components).toBe(38);
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

test("binds R27 and R28 readiness without upgrading local evidence to closure", () => {
  for (const [checkpoint, verifier] of [
    ["R27", verifyR27ReadinessEvidence],
    ["R28", verifyR28ReadinessEvidence],
  ] as const) {
    const path = join(root, `docs/evidence/${checkpoint}-STRUCTURAL-READINESS.json`),
      evidence = JSON.parse(readFileSync(path, "utf8"));
    expect(verifier(root, evidence)).toMatchObject({ closureClaim: false });
    const lied = structuredClone(evidence); lied.closureClaim = true;
    expect(() => verifier(root, lied)).toThrow("cannot prove closure");
    const omitted = structuredClone(evidence); omitted.components.pop();
    expect(() => verifier(root, omitted)).toThrow("component inventory incomplete");
    const drifted = structuredClone(evidence); drifted.components[0].sha256 = `sha256:${"0".repeat(64)}`;
    expect(() => verifier(root, drifted)).toThrow("component drift");
  }
});
