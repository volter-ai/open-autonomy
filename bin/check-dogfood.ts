#!/usr/bin/env bun
// Dogfood: open-autonomy's OWN root installation must equal what its profile compiles, for every
// MANAGED file (workflows, skills, runtime, standards, rubrics, version). This makes the profile the
// single source of truth for OA itself — drift like a security fix landing in the live workflow but
// not the profile (which would then ship vulnerable installations) fails the build.
//
// Repo-OWNED + seed-only files (package.json, README, roadmap, autonomy.yml, CONSTITUTION, the dev
// docs) are owned per-repo and legitimately differ — this is the SAME install-owned set the upgrade
// uses (seed-if-missing, never overwrite), declared once in core, and excluded here.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, INSTALL_OWNED_PATHS } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

const P = 'profiles/self-driving';
const REPO_OWNED = new Set(INSTALL_OWNED_PATHS);

const ir = parseIr(readFileSync(join(P, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);
const produced = new Map<string, string>();
for (const [p, c] of Object.entries(out.generated)) produced.set(p, c);
for (const { from, to } of out.copies) produced.set(to, readFileSync(join(P, from), 'utf8'));

const drift: string[] = [];
let checked = 0;
for (const [path, content] of produced) {
  if (REPO_OWNED.has(path)) continue;
  checked++;
  if (!existsSync(path)) drift.push(`missing in OA root: ${path}`);
  else if (readFileSync(path, 'utf8') !== content) drift.push(`drift (root != profile): ${path}`);
}
if (drift.length) {
  console.error(`dogfood drift — OA's root != compile(${P}) for ${drift.length} managed file(s):\n  ${drift.join('\n  ')}`);
  console.error(`  fix: edit the profile to match (it is the source); or, if the file is repo-owned, add it to REPO_OWNED.`);
  process.exit(1);
}
console.log(`dogfood OK: OA root == compile(${P}) for all ${checked} managed files`);
