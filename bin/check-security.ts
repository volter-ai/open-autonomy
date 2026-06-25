#!/usr/bin/env bun
// check:security — deterministic supply-chain gate. Rides the existing `ci` required check
// (via `bun run check`), so it fires on every agent PR without new branch-protection plumbing.
//
// Two model-independent layers (a reviewer agent shares blindspots with the author; a lockfile
// parser does not):
//   1. Lockfile integrity — every external resolution must come from the official npm registry and
//      carry a sha integrity hash. Catches a `bun.lock` repointed at a malicious host/tarball, a
//      `git+`/`http:`/`github:`/`file:` source smuggled in, or a missing integrity. The classic tools
//      for this (lockfile-lint, OSV-Scanner) don't parse bun's lockfile, so we assert the invariant
//      directly. Local `@workspace:` packages are exempt (they have no registry resolution).
//   2. `bun audit` — known-CVE scan against the npm advisory DB, per lockfile.
//
// Behavioral malicious-package detection (install scripts, obfuscation, typosquats) is the one thing
// this can't do from the lockfile alone — that's the Socket GitHub App's job, layered on top.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

const LOCKFILES = ["bun.lock", "services/agent-model-proxy/bun.lock", "profiles/self-driving/bun.lock"];
const INTEGRITY = /^sha(1|256|384|512)-/;
const ALLOWED_REGISTRY = "https://registry.npmjs.org/";

let failures = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

function parseLock(text: string): any {
  // bun.lock is JSONC (trailing commas); strip them before parse.
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

for (const lock of LOCKFILES) {
  const file = Bun.file(lock);
  if (!(await file.exists())) {
    fail(`${lock}: missing (expected lockfile not found)`);
    continue;
  }
  console.log(`• ${lock}`);
  const l = parseLock(await file.text());
  const packages: Record<string, unknown[]> = l.packages ?? {};

  for (const [key, value] of Object.entries(packages)) {
    const spec = String(value[0] ?? "");
    // Local workspace package — no registry resolution, legitimately no integrity.
    if (spec.includes("@workspace:")) continue;

    const resolution = String(value[1] ?? "");
    const integrity = value[value.length - 1];

    // Resolution must be the default registry ("") or an explicit npmjs URL — nothing else.
    if (resolution !== "" && !resolution.startsWith(ALLOWED_REGISTRY)) {
      fail(`${lock}: "${key}" resolves to a non-registry source: ${resolution}`);
      continue;
    }
    // No alternate-protocol sources anywhere in the entry.
    if (/(?:^|["\s])(git\+|github:|file:|http:\/\/)/.test(JSON.stringify(value))) {
      fail(`${lock}: "${key}" uses a non-registry protocol (git/github/file/http)`);
      continue;
    }
    // Every registry package must carry an integrity hash.
    if (typeof integrity !== "string" || !INTEGRITY.test(integrity)) {
      fail(`${lock}: "${key}" (${spec}) is missing a sha integrity hash`);
    }
  }

  // bun audit (known CVEs) for this lockfile's project.
  const cwd = dirname(lock) || ".";
  const audit = spawnSync("bun", ["audit"], { cwd, encoding: "utf8" });
  if (audit.status !== 0) {
    fail(`${lock}: bun audit reported advisories\n${audit.stdout}${audit.stderr}`);
  }
}

if (failures > 0) {
  console.error(`\ncheck:security FAILED — ${failures} issue(s). A supply-chain change here is human-required.`);
  process.exit(1);
}
console.log("\ncheck:security OK — lockfiles registry-pinned + integrity-verified, no known advisories.");
