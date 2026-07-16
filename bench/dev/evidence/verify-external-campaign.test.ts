import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalSemanticJson } from "@open-autonomy/core";
import { parseCampaignVerificationArgs, verifyExternalCampaign, verifyTrustModuleAttestation } from "./verify-external-campaign";

const provenance = { attestationDigest: `sha256:${"1".repeat(64)}` as const, rootFingerprint: `sha256:${"2".repeat(64)}` as const };

test("routes only the selected checkpoint and emits a deterministic content-addressed receipt", () => {
  let r27 = 0, r28 = 0;
  const dependencies = {
    R27(bundle: any) { r27++; return { closed: bundle.value === 1 }; },
    R28() { r28++; throw new Error("wrong verifier"); },
  };
  const a = verifyExternalCampaign("R27", '{"value":1}', "export const trust = {};", {}, provenance, dependencies as any),
    b = verifyExternalCampaign("R27", '{"value":1}', "export const trust = {};", {}, provenance, dependencies as any);
  expect(a).toEqual(b); expect(r27).toBe(2); expect(r28).toBe(0);
  expect(a.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(canonicalSemanticJson(a)).not.toContain("export const trust");
});

test("fails before producing a receipt for malformed JSON, absent trust, or verifier rejection", () => {
  const dependencies = { R27() { throw new Error("external evidence rejected"); }, R28() { return {}; } } as any;
  expect(() => verifyExternalCampaign("R27", "{", "trust", {}, provenance, dependencies)).toThrow("not valid JSON");
  expect(() => verifyExternalCampaign("R27", "{}", "trust", null, provenance, dependencies)).toThrow("trust export is missing");
  expect(() => verifyExternalCampaign("R27", "{}", "trust", {}, provenance, dependencies)).toThrow("external evidence rejected");
});

test("requires the complete nonduplicated CLI argument surface", () => {
  const parsed = parseCampaignVerificationArgs(["--checkpoint", "R28", "--bundle", "a.json", "--trust-module", "trust.mjs", "--trust-attestation", "trust.json", "--trust-root", "root.pem", "--out", "receipt.json"]);
  expect(parsed.checkpoint).toBe("R28"); expect(parsed.bundle.endsWith("a.json")).toBe(true);
  expect(() => parseCampaignVerificationArgs(["--checkpoint", "R29", "--bundle", "a", "--trust-module", "b", "--trust-attestation", "d", "--trust-root", "e", "--out", "c"])).toThrow("R27 or R28");
  expect(() => parseCampaignVerificationArgs(["--checkpoint", "R27", "--bundle", "a", "--bundle", "b", "--out", "c"])).toThrow("usage");
});

test("requires an external Ed25519 root to authorize the exact trust module and checkpoint", () => {
  const keys = generateKeyPairSync("ed25519"), module = "export const trust = {};", digest = `sha256:${createHash("sha256").update(module).digest("hex")}`,
    body = { schema: "open-autonomy.external-trust-module-attestation.v1" as const, checkpoint: "R27" as const, moduleDigest: digest, authority: "external-auditor", keyId: "root-1", signedAt: "2026-07-16T00:00:00Z" },
    encoded = JSON.stringify({ ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), keys.privateKey).toString("base64") }),
    pem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  expect(verifyTrustModuleAttestation("R27", module, encoded, pem).rootFingerprint).toMatch(/^sha256:/);
  expect(() => verifyTrustModuleAttestation("R28", module, encoded, pem)).toThrow("binding invalid");
  expect(() => verifyTrustModuleAttestation("R27", `${module} `, encoded, pem)).toThrow("binding invalid");
  const forged = JSON.stringify({ ...body, signature: Buffer.alloc(64).toString("base64") });
  expect(() => verifyTrustModuleAttestation("R27", module, forged, pem)).toThrow("signature invalid");
});
