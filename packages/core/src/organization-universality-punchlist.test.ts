import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Checkpoint = { id: string; dependsOn: string[]; gate: string };

const root = join(import.meta.dir, "../../..");
const manifest = JSON.parse(readFileSync(join(root, "docs/organization-universality-punchlist.json"), "utf8")) as {
  schema: string; claim: string; checkpoints: Checkpoint[];
};
const document = readFileSync(join(root, "docs/ORGANIZATION-UNIVERSALITY-AC.md"), "utf8");
const review = readFileSync(join(root, "docs/evidence/ORGANIZATION-UNIVERSALITY-PUNCHLIST-REVIEW.md"), "utf8");

test("universality punchlist is complete, topologically ordered, and exactly mirrored by normative headings", () => {
  expect(manifest.schema).toBe("open-autonomy.organization-universality-punchlist.v2");
  expect(manifest.claim).toContain("compatible substrate compositions");
  expect(manifest.checkpoints).toHaveLength(23);
  expect(new Set(manifest.checkpoints.map((checkpoint) => checkpoint.id)).size).toBe(23);

  const seen = new Set<string>();
  for (const checkpoint of manifest.checkpoints) {
    expect(checkpoint.id).toMatch(/^U(?:[0-9]|1[0-9]|2[0-2])$/);
    for (const dependency of checkpoint.dependsOn) expect(seen.has(dependency)).toBeTrue();
    seen.add(checkpoint.id);
    expect(document.match(new RegExp(`^## ${checkpoint.id}\\.`, "gm")) ?? []).toHaveLength(1);
  }
  for (let index = 0; index <= 22; index += 1) expect(seen.has(`U${index}`)).toBeTrue();
  expect(new Set(manifest.checkpoints.map((checkpoint) => checkpoint.gate))).toEqual(new Set(["UG1", "UG2", "UG3", "UG4", "UG5", "UG6"]));
});

test("pre-build adversarial review accounts for every known completion loophole", () => {
  for (const finding of [
    "No minimum universality result", "Opaque/extension escape hatch", "Weak observation profile",
    "Universal rejection completes matrix", "Frontend self-certifies fact universe", "Backend selection after results",
    "Holdout repaired after inspection", "Static evidence presented as execution", "Unbounded prompt equivalence",
    "“Minimal core” overclaim", "Weak independent reproduction", "Semantic and release claims coupled",
  ]) expect(review).toContain(finding);
  expect(review).toContain("PASS to begin U0 only");
});

test("universality completion language forbids silent loss and unbounded claims", () => {
  expect(document).toContain("zero silent loss");
  expect(document).toContain("never as unbounded universality");
  expect(document).toContain("all cross-product cells are populated");
  expect(document).toContain("incompatibility earns only diagnostic-completeness credit");
  expect(document).toContain("Opaque invocation proves interoperation only");
  expect(document).toContain("source-mandatory observations that no user profile can weaken");
  expect(document).toContain("frontend cannot add/remove facts from the inventory it must satisfy");
  expect(document).toContain("Publish the frozen-core result first");
  expect(document).toContain("UG6 passes only when every U0 threshold passes");
  expect(document).toContain("No later gate may retroactively change U0 thresholds");
  expect(document).toContain("Canonically represented source facts, population-weighted | ≥ 90%");
  expect(document).toContain("Preserved mandatory observations, population-weighted | ≥ 95%");
  expect(document).toMatch(/compiler\s+cannot improve its success denominator by declaring difficult cells incompatible/);
});
