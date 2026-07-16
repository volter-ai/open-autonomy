#!/usr/bin/env bun
import { readFile, stat } from "node:fs/promises";
import { matchedBenchmarkDigest } from "../packages/core/src/organization-matched-benchmark";
import {
  finalizeVerifiedR24V5Bundle,
  verifyR24V5MatchedBundle,
  type V5AccountingEvidence,
  type V5MatchedBundle,
  type V5PortableEvidence,
  type V5ProjectionTrust,
} from "../packages/core/src/organization-r24-v5-matched-projection";
import type { V5LiveArtifact } from "../packages/core/src/organization-r24-v5-live-acceptance-contract";
import { writeR24V5BundleAtomic } from "../packages/core/src/organization-r24-v5-bundle-store";

type Io = {
  read(path: string): Promise<string>;
  secure(path: string): Promise<boolean>;
  write(line: string): void;
};
type V5ProjectionTrustFile = Omit<V5ProjectionTrust, "resolveReceiptKey"> & {
  receiptKeys: Record<string, string>;
};
const defaultIo: Io = {
  read: (path) => readFile(path, "utf8"),
  secure: async (path) => {
    const metadata = await stat(path);
    return metadata.isFile() && (metadata.mode & 0o077) === 0;
  },
  write: (line) => process.stdout.write(`${line}\n`),
};
const parse = async <T>(io: Io, path: string): Promise<T> => {
  try {
    return JSON.parse(await io.read(path));
  } catch (error) {
    throw Error(`cannot read canonical JSON ${path}: ${String(error)}`);
  }
};
const hydrateTrust = (input: V5ProjectionTrustFile): V5ProjectionTrust => {
  if (!input || typeof input !== "object" || !input.receiptKeys)
    throw Error("R24 trust file invalid");
  const { receiptKeys, ...trust } = input;
  return {
    ...trust,
    resolveReceiptKey(keyId: string) {
      const key = receiptKeys[keyId];
      if (!key) throw Error("R24 receipt key is not trusted");
      return key;
    },
  };
};
const readTrust = async (io: Io, path: string) => {
  if (!(await io.secure(path)))
    throw Error("R24 trust file must be a private regular file");
  return hydrateTrust(await parse<V5ProjectionTrustFile>(io, path));
};

export async function runR24V5BundleCli(
  args: string[],
  io: Io = defaultIo,
) {
  const [command, ...rest] = args;
  if (command === "bundle-finalize") {
    if (rest.length !== 6)
      throw Error(
        "usage: organization-r24-v5 bundle-finalize ARTIFACT PORTABLE ACCOUNTING TRUST ANALYZED_AT OUT",
      );
    const [artifactPath, portablePath, accountingPath, trustPath, analyzedAt, out] =
        rest,
      artifact = await parse<V5LiveArtifact>(io, artifactPath!),
      portable = await parse<V5PortableEvidence[]>(io, portablePath!),
      accounting = await parse<V5AccountingEvidence[]>(io, accountingPath!),
      trust = await readTrust(io, trustPath!),
      bundle = finalizeVerifiedR24V5Bundle(
        artifact,
        portable,
        accounting,
        trust,
        analyzedAt!,
      );
    await writeR24V5BundleAtomic(out!, bundle, trust);
    io.write(
      JSON.stringify({
        schema: bundle.schema,
        digest: bundle.digest,
        analysisDigest: matchedBenchmarkDigest(bundle.analysis),
        output: out,
      }),
    );
    return bundle;
  }
  if (command === "bundle-verify") {
    if (rest.length !== 2)
      throw Error("usage: organization-r24-v5 bundle-verify BUNDLE TRUST");
    const bundle = await parse<V5MatchedBundle>(io, rest[0]!),
      trust = await readTrust(io, rest[1]!),
      analysis = verifyR24V5MatchedBundle(bundle, trust);
    io.write(
      JSON.stringify({
        schema: bundle.schema,
        digest: bundle.digest,
        analysisDigest: matchedBenchmarkDigest(analysis),
        verified: true,
      }),
    );
    return analysis;
  }
  throw Error(
    "usage: organization-r24-v5 <bundle-finalize|bundle-verify> ...",
  );
}

if (import.meta.main)
  runR24V5BundleCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
