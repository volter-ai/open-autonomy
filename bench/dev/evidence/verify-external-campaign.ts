#!/usr/bin/env bun
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalSemanticJson } from "@open-autonomy/core";
import { verifyR27ExternalClosure, type R27ExternalBundle, type R27Trust } from "./r27-external-closure";
import { verifyR28ExternalCampaign, type R28ExternalCampaign, type R28ExternalTrust } from "./r28-external-campaign";

type Checkpoint = "R27" | "R28";
type VerificationDependencies = {
  R27(bundle: R27ExternalBundle, trust: R27Trust): unknown;
  R28(bundle: R28ExternalCampaign, trust: R28ExternalTrust): unknown;
};
const production: VerificationDependencies = { R27: verifyR27ExternalClosure, R28: verifyR28ExternalCampaign };
const sha = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

export type ExternalCampaignVerificationReceipt = {
  schema: "open-autonomy.bench-external-campaign-verification.v1";
  checkpoint: Checkpoint;
  bundleDigest: `sha256:${string}`;
  trustModuleDigest: `sha256:${string}`;
  trustAttestationDigest: `sha256:${string}`;
  trustRootFingerprint: `sha256:${string}`;
  result: unknown;
  receiptDigest: `sha256:${string}`;
};

export type ExternalTrustModuleAttestation = {
  schema: "open-autonomy.external-trust-module-attestation.v1";
  checkpoint: Checkpoint;
  moduleDigest: `sha256:${string}`;
  authority: string;
  keyId: string;
  signedAt: string;
  signature: string;
};

export function verifyTrustModuleAttestation(checkpoint: Checkpoint, moduleBytes: string, encoded: string, rootPem: string) {
  let value: ExternalTrustModuleAttestation;
  try { value = JSON.parse(encoded); } catch { throw new Error("trust-module attestation is not valid JSON"); }
  const exact = ["schema", "checkpoint", "moduleDigest", "authority", "keyId", "signedAt", "signature"].sort();
  if (Object.keys(value).sort().join("\0") !== exact.join("\0") ||
      value.schema !== "open-autonomy.external-trust-module-attestation.v1" || value.checkpoint !== checkpoint ||
      value.moduleDigest !== sha(moduleBytes) || !value.authority || !value.keyId || !Number.isFinite(Date.parse(value.signedAt)))
    throw new Error("trust-module attestation identity or binding invalid");
  const { signature, ...body } = value;
  let key;
  try { key = createPublicKey(rootPem); } catch { throw new Error("trust root is not a valid public key"); }
  if (key.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(canonicalSemanticJson(body)), key, Buffer.from(signature, "base64")))
    throw new Error("trust-module attestation signature invalid");
  const der = key.export({ type: "spki", format: "der" });
  return { attestationDigest: sha(encoded), rootFingerprint: sha(der) };
}

export function verifyExternalCampaign(
  checkpoint: Checkpoint,
  bundleBytes: string,
  trustModuleBytes: string,
  trust: unknown,
  trustProvenance: { attestationDigest: `sha256:${string}`; rootFingerprint: `sha256:${string}` },
  dependencies: VerificationDependencies = production,
): ExternalCampaignVerificationReceipt {
  let bundle: unknown;
  try { bundle = JSON.parse(bundleBytes); } catch { throw new Error("external campaign bundle is not valid JSON"); }
  if (!trust || typeof trust !== "object") throw new Error("external campaign trust export is missing");
  const result = checkpoint === "R27"
    ? dependencies.R27(bundle as R27ExternalBundle, trust as R27Trust)
    : dependencies.R28(bundle as R28ExternalCampaign, trust as R28ExternalTrust);
  const body = {
    schema: "open-autonomy.bench-external-campaign-verification.v1" as const,
    checkpoint,
    bundleDigest: sha(bundleBytes),
    trustModuleDigest: sha(trustModuleBytes),
    trustAttestationDigest: trustProvenance.attestationDigest,
    trustRootFingerprint: trustProvenance.rootFingerprint,
    result,
  };
  return { ...body, receiptDigest: sha(canonicalSemanticJson(body)) };
}

export function parseCampaignVerificationArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--") || values.has(flag))
      throw new Error("usage: verify-external-campaign --checkpoint <R27|R28> --bundle <json> --trust-module <module> --trust-attestation <json> --trust-root <pem> --out <json>");
    values.set(flag, value);
  }
  const allowed = new Set(["--checkpoint", "--bundle", "--trust-module", "--trust-attestation", "--trust-root", "--out"]);
  if (values.size !== allowed.size || [...values.keys()].some((key) => !allowed.has(key)))
    throw new Error("usage: verify-external-campaign --checkpoint <R27|R28> --bundle <json> --trust-module <module> --trust-attestation <json> --trust-root <pem> --out <json>");
  const checkpoint = values.get("--checkpoint");
  if (checkpoint !== "R27" && checkpoint !== "R28") throw new Error("checkpoint must be R27 or R28");
  return { checkpoint, bundle: resolve(values.get("--bundle")!), trustModule: resolve(values.get("--trust-module")!), trustAttestation: resolve(values.get("--trust-attestation")!), trustRoot: resolve(values.get("--trust-root")!), out: resolve(values.get("--out")!) };
}

export async function runExternalCampaignVerification(argv: string[]) {
  const args = parseCampaignVerificationArgs(argv), bundleBytes = readFileSync(args.bundle, "utf8"),
    trustModuleBytes = readFileSync(args.trustModule, "utf8"), trustAttestationBytes = readFileSync(args.trustAttestation, "utf8"),
    trustRootPem = readFileSync(args.trustRoot, "utf8"), provenance = verifyTrustModuleAttestation(args.checkpoint, trustModuleBytes, trustAttestationBytes, trustRootPem),
    loaded = await import(`${pathToFileURL(args.trustModule).href}?sha=${sha(trustModuleBytes)}`), trust = loaded.trust;
  const receipt = verifyExternalCampaign(args.checkpoint, bundleBytes, trustModuleBytes, trust, provenance);
  await Bun.write(args.out, `${canonicalSemanticJson(receipt)}\n`);
  return receipt;
}

if (import.meta.main) {
  try { await runExternalCampaignVerification(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
