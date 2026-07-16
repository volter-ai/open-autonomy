import { expect, test } from "bun:test";
import { canonicalSemanticJson } from "@open-autonomy/core";
import { parseCampaignVerificationArgs, verifyExternalCampaign } from "./verify-external-campaign";

test("routes only the selected checkpoint and emits a deterministic content-addressed receipt", () => {
  let r27 = 0, r28 = 0;
  const dependencies = {
    R27(bundle: any) { r27++; return { closed: bundle.value === 1 }; },
    R28() { r28++; throw new Error("wrong verifier"); },
  };
  const a = verifyExternalCampaign("R27", '{"value":1}', "export const trust = {};", {}, dependencies as any),
    b = verifyExternalCampaign("R27", '{"value":1}', "export const trust = {};", {}, dependencies as any);
  expect(a).toEqual(b); expect(r27).toBe(2); expect(r28).toBe(0);
  expect(a.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(canonicalSemanticJson(a)).not.toContain("export const trust");
});

test("fails before producing a receipt for malformed JSON, absent trust, or verifier rejection", () => {
  const dependencies = { R27() { throw new Error("external evidence rejected"); }, R28() { return {}; } } as any;
  expect(() => verifyExternalCampaign("R27", "{", "trust", {}, dependencies)).toThrow("not valid JSON");
  expect(() => verifyExternalCampaign("R27", "{}", "trust", null, dependencies)).toThrow("trust export is missing");
  expect(() => verifyExternalCampaign("R27", "{}", "trust", {}, dependencies)).toThrow("external evidence rejected");
});

test("requires the complete nonduplicated CLI argument surface", () => {
  const parsed = parseCampaignVerificationArgs(["--checkpoint", "R28", "--bundle", "a.json", "--trust-module", "trust.mjs", "--out", "receipt.json"]);
  expect(parsed.checkpoint).toBe("R28"); expect(parsed.bundle.endsWith("a.json")).toBe(true);
  expect(() => parseCampaignVerificationArgs(["--checkpoint", "R29", "--bundle", "a", "--trust-module", "b", "--out", "c"])).toThrow("R27 or R28");
  expect(() => parseCampaignVerificationArgs(["--checkpoint", "R27", "--bundle", "a", "--bundle", "b", "--out", "c"])).toThrow("usage");
});
