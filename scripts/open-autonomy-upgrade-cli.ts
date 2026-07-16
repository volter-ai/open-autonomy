#!/usr/bin/env bun
// Maintainer command (NOT an autonomous agent): upgrade THIS installation to the canonical
// open-autonomy template. Run it locally from your installation's repo root:
//
//   bun scripts/open-autonomy-upgrade-cli.ts            # apply the upgrade to your working tree
//   bun scripts/open-autonomy-upgrade-cli.ts --dry-run  # just print what would change
//
// An upgrade is a RE-COMPILE: it fetches the latest engine, recompiles the canonical profile, and
// regenerates this installation's derived files (workflows, the injected runtime, machinery). Your own
// inputs — roadmap, constitution, sources, the repo shell — are preserved, and files left behind by
// retired agents are removed. It then STOPS: you review (`git diff`), commit, and push. It is
// deliberately human-run, because an upgrade can touch `.github/workflows/**` (a human_required path the
// CI GITHUB_TOKEN cannot push) — your own credentials handle that cleanly.
import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.cwd();
const apply = process.argv.includes('--dry-run') ? '' : '--apply';
const TEMPLATE_REPO = process.env.OPEN_AUTONOMY_TEMPLATE_REPO || 'volter-ai/open-autonomy';
const TEMPLATE_REF = process.env.OPEN_AUTONOMY_TEMPLATE_REF || 'main';

// Use this checkout if it IS open-autonomy; otherwise clone the template repo to get the engine.
let oa: string;
if (existsSync('bin/autonomy-upgrade.ts') && existsSync('profiles/self-driving/ir.yml')) {
  oa = target;
} else {
  oa = resolve('.agent-run/open-autonomy-src');
  if (existsSync(oa)) await $`rm -rf ${oa}`;
  await $`git clone --depth 1 --branch ${TEMPLATE_REF} https://github.com/${TEMPLATE_REPO}.git ${oa}`;
}

await $`cd ${oa} && (bun install --frozen-lockfile || bun install) && bun bin/autonomy-upgrade.ts --profile profiles/self-driving --target ${target} --substrate gh-actions ${apply}`;
