#!/usr/bin/env bun
// Upgrade an installation to a profile's current compiled output — a re-compile, not a file merge.
//   bun bin/autonomy-upgrade.ts --profile profiles/self-driving --target <installDir> [--apply]
// Without --apply it prints the plan (a dry run). The derived files (generated workflows, injected
// runtime, machinery) are regenerated; the installation's own inputs (roadmap, constitution, repo
// shell) are seeded only if missing; derived files the compile no longer produces are pruned.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseIr, planUpgrade, applyUpgrade } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const profileDir = arg('--profile');
const targetDir = arg('--target');
const apply = process.argv.includes('--apply');
if (!profileDir || !targetDir) {
  process.stderr.write('Usage: bun bin/autonomy-upgrade.ts --profile <dir> --target <dir> [--apply]\n');
  process.exit(2);
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);
const plan = planUpgrade(out, resolve(profileDir), resolve(targetDir));

for (const note of plan.notes) process.stdout.write(`${note}\n`);
if (apply && plan.changes.length) {
  applyUpgrade(plan, out, resolve(profileDir), resolve(targetDir));
  process.stdout.write(`\nApplied ${plan.changes.length} change(s) to ${targetDir}. Review with \`git diff\`, then commit and push.\n`);
}
process.stdout.write(`upgrade-changes=${plan.changes.length}\n`);
