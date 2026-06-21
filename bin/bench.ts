#!/usr/bin/env bun
// Bench — the workload-suite runner. An experiment is a CELL: profile × substrate × workload
// (docs/VISION.md). The workload suite is a diverse, human-owned battery of small repos + task-sets
// (docs / bug / feature / refactor / security / flaky), the subject under test being the org DESIGN.
//
//   bun bin/bench.ts                                   PREFLIGHT: every cell installs without clobbering
//   bun bin/bench.ts --live --workload W --profile P   provision a disposable repo + seed the goal
//   bun bin/bench.ts --score --repo O/N --workload W   clone the run's result + judge it (AI rubric)
//
// PREFLIGHT is static: overlay compile(profile, substrate) onto each workload and assert the install
// COEXISTS — it may seed an install-owned file (package.json/README/…) when missing, but never overwrites
// the project's own source, and never leaks another profile's agents. LIVE provisions a disposable github
// repo (volter-test-fixtures) from the workload seed, installs the profile, and seeds the goal as the org's
// intake; the agents then run autonomously on cron (never hand-cranked). SCORE reads the result with the AI
// rubric judge. (Pure per-profile compile coherence + import-closure is check:profiles.)
import { readFileSync, readdirSync, existsSync, statSync, cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseIr, isInstallOwned } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from '@open-autonomy/substrate-local';

const WL = 'bench/workload';
const PROFILES = 'profiles';
const ORG = 'volter-test-fixtures';
const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit' });

function compileTo(profile: string, substrate: string) {
  const ir = parseIr(readFileSync(join(PROFILES, profile, 'ir.yml'), 'utf8'));
  if (!ir.targets.includes(substrate as never)) throw new Error(`profile ${profile} does not target ${substrate}`);
  return substrate === 'github' ? compileGithub(ir) : compileLocal(ir);
}

// ---- LIVE: provision a disposable repo from (workload, profile) and seed the goal ----
if (process.argv.includes('--live')) {
  const wl = arg('--workload');
  const profile = arg('--profile');
  const substrate = arg('--substrate', 'github');
  if (!wl || !profile) throw new Error('usage: --live --workload <name> --profile <name> [--substrate github]');
  if (substrate !== 'github') throw new Error('live runs target github (disposable repos in ' + ORG + ')');
  const wdir = join(WL, wl);
  const meta = JSON.parse(readFileSync(join(wdir, 'workload.json'), 'utf8')) as { summary: string };
  const goal = readFileSync(join(wdir, 'goal.md'), 'utf8');

  const id = Date.now().toString(36);
  const repo = `${ORG}/bench-${wl}-${profile}-${id}`;
  const build = mkdtempSync(join(tmpdir(), 'bench-build-'));
  console.log(`building install: compile(${profile}, ${substrate}) -> ${build}`);
  run('bun', ['bin/autonomy-compile.ts', join(PROFILES, profile), substrate, build]);
  const seed = join(wdir, 'seed');
  if (existsSync(seed)) {
    // Overlay the project onto the installed machinery, but let the install win for install-owned files
    // (package.json/README/…) so the runtime's deps survive — the same seed-if-missing rule the upgrade
    // uses, applied to the project axis. The project's own source (src/…) is added.
    let added = 0;
    let kept = 0;
    for (const rel of repoFiles(seed, seed)) {
      if (isInstallOwned(rel) && existsSync(join(build, rel))) {
        kept++;
        continue;
      }
      mkdirSync(join(build, dirname(rel)), { recursive: true });
      cpSync(join(seed, rel), join(build, rel));
      added++;
    }
    console.log(`overlaid workload seed: ${added} project files added, ${kept} install-owned kept`);
  }
  cpSync('bench/provision.template.json', join(build, 'provision.json'));

  console.log(`provisioning ${repo} …`);
  run('bun', ['scripts/provision-target-repo.ts', '--repo', repo, '--source', build, '--private', '--force-content']);

  console.log(`seeding the goal as the org's intake issue …`);
  run('gh', ['issue', 'create', '-R', repo, '--title', meta.summary, '--body', goal]);

  // Fund the disposable repo's proxy account so its agents can mint (ENFORCE_ACCOUNT_BALANCE). A grant
  // from a funded source; bounded — bench spend is capped per run and by this balance. Skipped (with a
  // warning) if no admin token is present, since the run would then fail at mint with account_balance_exhausted.
  const adminToken = process.env.MODEL_PROXY_ADMIN_TOKEN;
  const proxyBase = process.env.MODEL_PROXY_URL || 'https://volter-agent-model-proxy.aaron-0ed.workers.dev';
  if (adminToken) {
    const funder = arg('--funder', 'volter-ai/open-autonomy');
    const cents = Number(arg('--fund-usd-cents', '500'));
    const res = await fetch(`${proxyBase}/admin/accounts/${encodeURIComponent(funder)}/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ to: repo, amount_usd_cents: cents, key: `bench:${repo}` }),
    });
    console.log(`funded ${repo}: ${res.ok ? `$${(cents / 100).toFixed(2)} from ${funder}` : `FAILED ${res.status}`}`);
  } else {
    console.log('MODEL_PROXY_ADMIN_TOKEN unset — repo NOT funded; agents will fail at mint until it has a balance');
  }

  console.log(`\nlive cell up: https://github.com/${repo}`);
  console.log(`the agents now run autonomously on cron. when the run has settled, score it:`);
  console.log(`  bun bin/bench.ts --score --repo ${repo} --workload ${wl}`);
  process.exit(0);
}

// ---- SCORE: clone the run's result and judge it against the workload rubric ----
if (process.argv.includes('--score')) {
  const repo = arg('--repo');
  const wl = arg('--workload');
  if (!repo || !wl) throw new Error('usage: --score --repo <owner/name> --workload <name>');
  const dir = mkdtempSync(join(tmpdir(), 'bench-result-'));
  console.log(`cloning ${repo} -> ${dir}`);
  run('gh', ['repo', 'clone', repo, dir, '--', '--depth', '1']);
  const judgeArgs = ['scripts/bench-judge.ts', '--workload', join(WL, wl), '--result', dir];
  const out = arg('--out');
  if (out) judgeArgs.push('--out', out);
  run('bun', judgeArgs);
  process.exit(0);
}

// ---- PREFLIGHT (default): cross-matrix install coexistence ----
function repoFiles(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...repoFiles(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

const workloads = readdirSync(WL).filter((d) => existsSync(join(WL, d, 'workload.json')));
const profiles = readdirSync(PROFILES).filter((d) => existsSync(join(PROFILES, d, 'ir.yml')));
const errs: string[] = [];
let cells = 0;

for (const w of workloads) {
  const wdir = join(WL, w);
  const meta = JSON.parse(readFileSync(join(wdir, 'workload.json'), 'utf8')) as { kind?: string };
  const seedDir = join(wdir, 'seed');
  const own = new Set(existsSync(seedDir) ? repoFiles(seedDir, seedDir) : []);
  for (const p of profiles) {
    const ir = parseIr(readFileSync(join(PROFILES, p, 'ir.yml'), 'utf8'));
    for (const sub of ir.targets) {
      cells++;
      try {
        const out = compileTo(p, sub);
        const produced = [...Object.keys(out.generated), ...out.copies.map((c) => c.to)];
        const clobbers = produced.filter((path) => own.has(path) && !isInstallOwned(path));
        const seeded = produced.filter((path) => own.has(path) && isInstallOwned(path));
        if (clobbers.length)
          errs.push(`${w} × ${p}/${sub}: install would OVERWRITE project files: ${clobbers.join(', ')}`);
        console.log(
          `cell ${clobbers.length ? 'FAIL' : 'OK  '}: ${w} [${meta.kind ?? '?'}] × ${p}/${sub} — ${produced.length} install files, ${seeded.length} seeded-kept, ${clobbers.length} clobbers`,
        );
      } catch (e) {
        errs.push(`${w} × ${p}/${sub}: compile failed — ${(e as Error).message}`);
      }
    }
  }
}

if (errs.length) {
  console.error(`\nbench PREFLIGHT FAILED — ${errs.length}/${cells} cells:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nbench PREFLIGHT OK: ${cells} cells (${profiles.length} profiles × ${workloads.length} workloads) install cleanly`);
