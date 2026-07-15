import { expect, test } from "bun:test";
import { createHash, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const artifactPath = join(
  import.meta.dir,
  "../../../docs/evidence/R24-V5-NESTED-HERMES-SMOKE.json",
);
const sha = (bytes: string | Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("R24 V5 direct-local Hermes smoke is publicly replayable and cannot claim closure", () => {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const { signing, digest, signature, ...body } = artifact;

  expect(artifact.schema).toBe("autonomy.r24-local-nested-hermes-smoke.v5");
  expect(artifact.closureClaim).toBe(false);
  expect(signing.authenticity).toBe("local-self-signature");
  expect(digest).toBe(sha(JSON.stringify(body)));
  expect(
    verify(
      null,
      Buffer.from(digest),
      signing.publicKeyPem,
      Buffer.from(signature, "base64"),
    ),
  ).toBe(true);

  expect(sha(artifact.replayBytes.configYaml)).toBe(
    artifact.manifest.configDigest,
  );
  expect(sha(artifact.replayBytes.skillMarkdown)).toBe(
    artifact.manifest.skillDigest,
  );
  expect(
    sha(Buffer.from(artifact.replayBytes.outcomeWorkerBase64, "base64")),
  ).toBe(artifact.manifest.outcomeWorkerDigest);
  expect(artifact.outcome).toBe(artifact.expectedOutcome);
  expect(artifact.evidence.uniqueIdempotencyRecord).toBe(true);
  expect(artifact.evidence.authenticity).toContain("not model-resistant");

  expect(artifact.cleanup.attempts.length).toBeGreaterThanOrEqual(2);
  for (const cleanup of artifact.cleanup.attempts) {
    expect(cleanup.absent).toBe(true);
    expect(existsSync(cleanup.root)).toBe(false);
  }
  expect(artifact.limitations).toContain(
    "Direct local nested-Hermes smoke only; bypasses the R24 launcher, Hermes Kanban native scheduling, and Paperclip.",
  );

  const serialized = JSON.stringify(artifact);
  expect(serialized).not.toMatch(
    /(?:sk-or-v1-|-----BEGIN PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]+)/i,
  );
  expect(artifact.passed).toBe(true);
});
