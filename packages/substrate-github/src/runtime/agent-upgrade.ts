#!/usr/bin/env bun
// Deterministic upgrade agent (autonomy.ir.v1 behavior). Compiles the canonical open-autonomy profile
// (locally if this checkout IS open-autonomy, else from a fresh clone of the template repo), diffs the
// compiled installation against this one, and opens an upgrade PR. The canonical installation is the
// COMPILE of profiles/self-driving — there is no hand-maintained template. A faithful port of the
// former open-autonomy-upgrade.yml; dispatch always applies (you dispatch upgrade to get the PR).
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
  await $`git clone --depth 1 --branch ${TEMPLATE_REF} https://github.com/${TEMPLATE_REPO}.git ${src}`;
}
await $`cd ${src} && (bun install --frozen-lockfile || bun install) && bun bin/autonomy-compile.ts profiles/self-driving github ${resolve(out)}`;

await $`bun scripts/open-autonomy-upgrade.ts --template ${out} --target . --out .agent-run/upgrade/plan.json`;
const plan = JSON.parse(readFileSync('.agent-run/upgrade/plan.json', 'utf8')) as {
  changes: unknown[];
  migration_notes: string[];
};
if (!plan.changes?.length) {
  console.log('No upgrade changes to apply.');
  process.exit(0);
}

const branch = `open-autonomy/upgrade-${process.env.GITHUB_RUN_ID}`;
await $`git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`;
await $`git config user.name "github-actions[bot]"`;
await $`git checkout -b ${branch}`;
await $`bun scripts/open-autonomy-upgrade.ts --template ${out} --target . --apply --out .agent-run/upgrade/plan-applied.json`;
await $`git add AGENTS.md VERSION .open-autonomy .github/workflows scripts docs`;
await $`git commit -m "chore: upgrade open-autonomy template"`;
await $`git push --set-upstream origin ${branch}`;
await Bun.write('.agent-run/upgrade/body.md', (plan.migration_notes ?? []).join('\n'));
const base = process.env.GITHUB_REF_NAME || 'main';
await $`gh pr create --title "chore: upgrade open-autonomy template" --body-file .agent-run/upgrade/body.md --base ${base} --head ${branch}`;
