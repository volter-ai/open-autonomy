import { randomBytes } from "node:crypto";
import { open, link, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyR24V5MatchedBundle,
  type V5MatchedBundle,
  type V5ProjectionTrust,
} from "./organization-r24-v5-matched-projection";

export async function writeR24V5BundleAtomic(
  path: string,
  bundle: V5MatchedBundle,
  trust: V5ProjectionTrust,
) {
  if (!path || path.endsWith("/") || !bundle.digest)
    throw Error("R24 bundle store input invalid");
  verifyR24V5MatchedBundle(bundle, trust);
  const parent = dirname(path),
    tempPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const parentStat = await stat(parent);
  if (!parentStat.isDirectory()) throw Error("R24 bundle parent is not a directory");
  let temp: Awaited<ReturnType<typeof open>> | undefined;
  try {
    temp = await open(tempPath, "wx", 0o600);
    await temp.writeFile(`${canonicalSemanticJson(bundle)}\n`, "utf8");
    await temp.sync();
    await temp.close();
    temp = undefined;
    // Evidence bundles are immutable. link(2) publishes the fully synced inode
    // without an overwrite window and fails atomically if the name exists.
    await link(tempPath, path);
    await rm(tempPath);
    const directory = await open(parent, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return bundle.digest;
  } finally {
    if (temp) await temp.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
