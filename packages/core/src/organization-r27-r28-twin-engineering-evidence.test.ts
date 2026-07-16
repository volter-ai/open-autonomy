import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessR27TwinEngineeringEvidence,
  assessR28TwinEngineeringEvidence,
} from "./organization-r27-r28-twin-engineering-evidence";
import type { R27LiveBundle } from "./organization-r27-live-canary";
import type { R28DogfoodArtifact } from "./organization-r28-repository-dogfood-live";
const root = join(import.meta.dir, "../../..");
test("classifies the signed R27 canary as compiled engineering evidence without human or production claims", () => {
  const bundle = JSON.parse(
      readFileSync(
        join(root, "docs/evidence/R27-LIVE-CANARY-BUNDLE.json"),
        "utf8",
      ),
    ) as R27LiveBundle,
    a = assessR27TwinEngineeringEvidence(bundle);
  expect(a).toEqual(
    expect.objectContaining({
      checkpoint: "R27",
      engineeringClosed: true,
      externalHumanClaim: false,
      productionClaim: false,
    }),
  );
  expect(a.properties).toEqual(
    expect.arrayContaining([
      "compiled-paperclip-port-effects",
      "automatic-rollback-readback",
    ]),
  );
  expect(a.residuals).toContain(
    "single safety drill does not establish causal effectiveness",
  );
});
test("classifies repository dogfood effects while preserving every local/twin limitation", () => {
  const artifact = JSON.parse(
      readFileSync(
        join(root, "docs/evidence/R28-REPOSITORY-DOGFOOD.json"),
        "utf8",
      ),
    ) as R28DogfoodArtifact,
    a = assessR28TwinEngineeringEvidence(artifact);
  expect(a).toEqual(
    expect.objectContaining({
      checkpoint: "R28",
      engineeringClosed: true,
      externalHumanClaim: false,
      productionClaim: false,
    }),
  );
  expect(a.properties).toEqual(
    expect.arrayContaining([
      "compiled-accepted-repository-effect",
      "compiled-test-gated-rejection",
      "compiled-guardrail-revert-readback",
    ]),
  );
  expect(a.residuals.some((x) => x.includes("long-running dogfood"))).toBe(
    true,
  );
});
test("rejects an R28 artifact that erases its OS restart limitation", () => {
  const artifact = JSON.parse(
    readFileSync(
      join(root, "docs/evidence/R28-REPOSITORY-DOGFOOD.json"),
      "utf8",
    ),
  ) as R28DogfoodArtifact;
  artifact.residuals = artifact.residuals.filter(
    (x) => x.id !== "os-process-restart",
  );
  const { digest: _, signature: __, ...body } = artifact;
  artifact.digest = "sha256:tampered";
  expect(() => assessR28TwinEngineeringEvidence(artifact)).toThrow(
    /authentication/,
  );
  expect(body.schema).toBe("autonomy.r28-repository-dogfood.v1");
});
