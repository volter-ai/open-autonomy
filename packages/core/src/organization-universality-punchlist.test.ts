import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Checkpoint = { id: string; dependsOn: string[]; gate: string };

const root = join(import.meta.dir, "../../..");
const manifest = JSON.parse(readFileSync(join(root, "docs/organization-universality-punchlist.json"), "utf8")) as {
  schema: string; claim: string; checkpoints: Checkpoint[];
};
const document = readFileSync(join(root, "docs/ORGANIZATION-UNIVERSALITY-AC.md"), "utf8");

test("universality punchlist is complete, topologically ordered, and exactly mirrored by normative headings", () => {
  expect(manifest.schema).toBe("open-autonomy.organization-universality-punchlist.v1");
  expect(manifest.claim).toContain("compatible substrate compositions");
  expect(manifest.checkpoints).toHaveLength(19);
  expect(new Set(manifest.checkpoints.map((checkpoint) => checkpoint.id)).size).toBe(19);

  const seen = new Set<string>();
  for (const checkpoint of manifest.checkpoints) {
    expect(checkpoint.id).toMatch(/^U(?:[0-9]|1[0-8])$/);
    for (const dependency of checkpoint.dependsOn) expect(seen.has(dependency)).toBeTrue();
    seen.add(checkpoint.id);
    expect(document.match(new RegExp(`^## ${checkpoint.id}\\.`, "gm")) ?? []).toHaveLength(1);
  }
  for (let index = 0; index <= 18; index += 1) expect(seen.has(`U${index}`)).toBeTrue();
  expect(new Set(manifest.checkpoints.map((checkpoint) => checkpoint.gate))).toEqual(new Set(["UG1", "UG2", "UG3", "UG4", "UG5", "UG6"]));
});

test("universality completion language forbids silent loss and unbounded claims", () => {
  expect(document).toContain("zero silent loss");
  expect(document).toContain("never as unbounded universality");
  expect(document).toContain("all cross-product cells are populated");
  expect(document).toContain("No later gate may be used to retroactively change U0’s population");
});
