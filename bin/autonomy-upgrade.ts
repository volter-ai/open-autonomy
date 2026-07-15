#!/usr/bin/env bun
// Upgrade an installation to a profile's current compiled output — a re-compile, not a file merge.
//   bun bin/autonomy-upgrade.ts --profile profiles/self-driving --target <installDir> [--apply] [--prune]
// Without --apply it prints the plan (a dry run). The derived files (generated workflows, injected
// runtime, machinery) are regenerated; the installation's own inputs (roadmap, constitution, repo
// shell) are seeded only if missing.
//
// DELETION IS OPT-IN. Pruning stale derived files requires BOTH --prune AND --apply, because the prune
// removes anything in scripts//.github/workflows//.codex/skills/ that the compile no longer produces —
// safe against a clean installation, but it would delete hand-authored files if pointed at a source/dev
// checkout. Plain --apply only adds/updates; it never deletes.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseIr, planUpgrade, applyUpgrade } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
// The SAME Claude/Codex project-hook merge policy the fresh-compile CLI applies. Without it, every upgrade
// would silently revert adopter-owned hook configuration to the profile's whole-file copy.
import { settingsMergeStrategies } from './settings-merge.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const profileDir = arg('--profile');
const targetDir = arg('--target');
const apply = process.argv.includes('--apply');
const prune = process.argv.includes('--prune');
if (!profileDir || !targetDir) {
  process.stderr.write('Usage: bun bin/autonomy-upgrade.ts --profile <dir> --target <dir> [--apply] [--prune]\n');
  process.exit(2);
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);
const plan = planUpgrade(out, resolve(profileDir), resolve(targetDir), { prune, mergeStrategies: settingsMergeStrategies });

for (const note of plan.notes) process.stdout.write(`${note}\n`);

// Make deletions impossible to miss: list them loudly before doing anything destructive.
const deletes = plan.changes.filter((c) => c.action === 'delete');
if (deletes.length) {
  process.stderr.write(`\n⚠️  --prune will DELETE ${deletes.length} file(s) the compile no longer produces:\n`);
  for (const d of deletes) process.stderr.write(`     - ${d.path}\n`);
  process.stderr.write('   (run against an INSTALLATION, never the source repo). Re-run with --apply to execute.\n');
}

if (apply && plan.changes.length) {
  applyUpgrade(plan, out, resolve(profileDir), resolve(targetDir), settingsMergeStrategies);
  process.stdout.write(`\nApplied ${plan.changes.length} change(s)${deletes.length ? ` (incl. ${deletes.length} deletion(s))` : ''} to ${targetDir}. Review with \`git diff\`, then commit and push.\n`);
}
process.stdout.write(`upgrade-changes=${plan.changes.length}\n`);
