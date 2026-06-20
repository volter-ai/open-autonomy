#!/usr/bin/env bun
// Maintainer command (NOT an autonomous agent): upgrade this installation to the canonical
// open-autonomy template. Run it locally from your installation's repo root:
//
//   bun scripts/open-autonomy-upgrade-cli.ts            # apply the upgrade to your working tree
//
// It compiles the canonical profile (from a fresh clone of the template repo, or in-place if this IS
// open-autonomy), diffs it against your repo, and applies the changes to your working tree — then
// stops. You review (`git diff`), commit, and open a PR yourself. This is deliberately human-run: an
// upgrade can touch `.github/workflows/**` (a human_required path), which the CI GITHUB_TOKEN cannot
// push anyway — your own credentials handle it cleanly.
import { $ } from 'bun';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATE_REPO = process.env.OPEN_AUTONOMY_TEMPLATE_REPO || 'volter-ai/open-autonomy';
const TEMPLATE_REF = process.env.OPEN_AUTONOMY_TEMPLATE_REF || 'main';
const out = '.agent-run/open-autonomy-template';
mkdirSync('.agent-run/upgrade', { recursive: true });

let src: string;
if (existsSync('profiles/self-driving/ir.yml')) {
  src = process.cwd();
} else {
  src = resolve('.agent-run/open-autonomy-src');
  if (existsSync(src)) await $`rm -rf ${src}`;
  await $`git clone --depth 1 --branch ${TEMPLATE_REF} https://github.com/${TEMPLATE_REPO}.git ${src}`;
}
await $`cd ${src} && (bun install --frozen-lockfile || bun install) && bun bin/autonomy-compile.ts profiles/self-driving github ${resolve(out)}`;

await $`bun scripts/open-autonomy-upgrade.ts --template ${out} --target . --out .agent-run/upgrade/plan.json`;
const plan = JSON.parse(readFileSync('.agent-run/upgrade/plan.json', 'utf8')) as {
  changes: unknown[];
  migration_notes: string[];
};
if (!plan.changes?.length) {
  console.log('Already up to date with the open-autonomy template.');
  process.exit(0);
}

await $`bun scripts/open-autonomy-upgrade.ts --template ${out} --target . --apply --out .agent-run/upgrade/plan-applied.json`;
console.log(`Applied ${plan.changes.length} upgrade change(s) to your working tree.`);
for (const note of plan.migration_notes ?? []) console.log(`  - ${note}`);
console.log('\nReview with `git diff`, then commit and open a PR. Workflow changes (.github/workflows)');
console.log('are applied here too; pushing them needs your own credentials (the CI token cannot).');
