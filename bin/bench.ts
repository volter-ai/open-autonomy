#!/usr/bin/env bun
// Bench — the workload-suite runner. An experiment is a CELL: profile × substrate × workload
// (docs/VISION.md). The workload suite is a diverse, human-owned battery of small repos + task-sets
// (docs / bug / feature / refactor / security / flaky), the subject under test being the org DESIGN.
//
//   bun bin/bench.ts                                   PREFLIGHT: every cell installs without clobbering
//   bun bin/bench.ts --live --workload W --profile P   provision a disposable repo + seed the goal
//   bun bin/bench.ts --drive --repo O/N                OVERCLOCK: fast/reliable test heartbeat until settled
//   bun bin/bench.ts --operate --repo O/N              OPERATOR-SIM: drive+verify the manual-operator scenarios
//   bun bin/bench.ts --score --repo O/N --workload W   clone the run's result + judge it (AI rubric)
//
// PREFLIGHT is static: overlay compile(profile, substrate) onto each workload and assert the install
// COEXISTS — it may seed an install-owned file (package.json/README/…) when missing, but never overwrites
// the project's own source, and never leaks another profile's agents. LIVE provisions a disposable github
// repo (volter-test-fixtures) from the workload seed, installs the profile, and seeds the goal as the org's
// intake; the agents then run autonomously on cron (never hand-cranked). SCORE reads the result with the AI
// rubric judge. (Pure per-profile compile coherence + import-closure is check:profiles.)
import { readFileSync, readdirSync, existsSync, statSync, cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
  const meta = JSON.parse(readFileSync(join(wdir, 'workload.json'), 'utf8')) as {
    summary: string;
    intake?: { mode?: 'goal' | 'scenarios' | 'none'; seeder?: string };
  };
  const goal = readFileSync(join(wdir, 'goal.md'), 'utf8');

  const id = Date.now().toString(36);
  const repo = `${ORG}/bench-${wl}-${profile}-${id}`;
  const build = mkdtempSync(join(tmpdir(), 'bench-build-'));
  console.log(`building install: compile(${profile}, ${substrate}) -> ${build}`);
  run('bun', ['bin/autonomy-compile.ts', join(PROFILES, profile), substrate, build]);
  const seed = join(wdir, 'seed');
  if (existsSync(seed)) {
    // Overlay the project onto the installed machinery. Keep ONLY the runtime-critical install files
    // (package.json/bun.lock) so the runtime's deps survive; the workload seed otherwise WINS. A workload's
    // roadmap/docs/README are its TEST FIXTURE — a conformance scenario sets the board it is scored against
    // (e.g. planner-creates-proof-gate-issues needs a roadmap WITH planned/active items) — so they must
    // override the profile's defaults, not be silently dropped by the broader install-owned keep rule.
    const KEEP_FROM_INSTALL = new Set(['package.json', 'bun.lock']);
    let added = 0;
    let kept = 0;
    for (const rel of repoFiles(seed, seed)) {
      if (KEEP_FROM_INSTALL.has(rel) && existsSync(join(build, rel))) {
        kept++;
        continue;
      }
      mkdirSync(join(build, dirname(rel)), { recursive: true });
      cpSync(join(seed, rel), join(build, rel));
      added++;
    }
    console.log(`overlaid workload seed: ${added} project files added, ${kept} install-owned kept`);
  }
  // The bench cell's provision manifest: the TEMPLATE owns the cell infrastructure (OIDC/model-proxy
  // vars, secrets, branch protection — what makes a disposable funded cell), and the workload may
  // contribute EXTRA labels its intake needs (e.g. the conformance scenarios' `manual-operator-test`).
  // Union the labels so the seeder's labels exist; everything else comes from the template.
  const provision = JSON.parse(readFileSync('bench/provision.template.json', 'utf8')) as { labels?: Array<{ name: string }> };
  const seedProvision = join(seed, 'provision.json');
  if (existsSync(seedProvision)) {
    const sp = JSON.parse(readFileSync(seedProvision, 'utf8')) as { labels?: Array<{ name: string }> };
    const have = new Set((provision.labels ?? []).map((l) => l.name));
    for (const l of sp.labels ?? []) if (!have.has(l.name)) (provision.labels ??= []).push(l);
  }
  writeFileSync(join(build, 'provision.json'), `${JSON.stringify(provision, null, 2)}\n`);

  console.log(`provisioning ${repo} …`);
  run('bun', ['scripts/provision-target-repo.ts', '--repo', repo, '--source', build, '--private', '--force-content']);

  // Seed the org's intake per the workload's declared mode. A freshly-created repo isn't immediately
  // addressable — retry briefly past the race.
  const intake = meta.intake ?? { mode: 'goal' };
  if (intake.mode === 'none') {
    console.log(`intake: none — no issues seeded; the org self-starts (e.g. the strategist generates the roadmap)`);
  } else if (intake.mode === 'scenarios') {
    const seeder = intake.seeder ?? 'scripts/testbed-seed-issues.ts';
    console.log(`intake: scenarios — seeding via ${seeder}`);
    for (let i = 0; ; i++) {
      try { run('bun', [join(build, seeder), '--apply', '--all', '--repo', repo]); break; }
      catch (e) { if (i >= 4) throw e; Bun.sleepSync(2000); }
    }
  } else {
    console.log(`seeding the goal as the org's intake issue …`);
    for (let i = 0; ; i++) {
      try { run('gh', ['issue', 'create', '-R', repo, '--title', meta.summary, '--body', goal]); break; }
      catch (e) { if (i >= 4) throw e; Bun.sleepSync(2000); }
    }
  }

  // Bootstrap-fund the disposable cell with a bounded grant (the operator's treasury action; the agents
  // only spend it via OIDC). Retried past the admin-token's propagation lag (a freshly-rotated worker
  // secret isn't live for a few seconds). Teardown refunds the unused remainder.
  const adminToken = process.env.MODEL_PROXY_ADMIN_TOKEN;
  const proxyBase = process.env.MODEL_PROXY_URL || 'https://volter-agent-model-proxy.aaron-0ed.workers.dev';
  if (adminToken) {
    const funder = arg('--funder', 'volter-ai/open-autonomy');
    const cents = Number(arg('--fund-usd-cents', '500'));
    let funded = false;
    for (let i = 0; i < 8 && !funded; i++) {
      const res = await fetch(`${proxyBase}/admin/accounts/${encodeURIComponent(funder)}/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ to: repo, amount_usd_cents: cents, key: `bench:${repo}` }),
      });
      funded = res.ok;
      if (!funded) await new Promise((r) => setTimeout(r, 5000)); // wait out secret propagation
    }
    console.log(funded ? `funded ${repo}: $${(cents / 100).toFixed(2)} from ${funder}` : `FAILED to fund ${repo} after retries`);
    if (!funded) process.exit(1);
  } else {
    console.log(`no per-repo grant (set MODEL_PROXY_ADMIN_TOKEN to bootstrap-fund the cell)`);
  }

  console.log(`\nlive cell up: https://github.com/${repo}`);
  console.log(`the agents now run autonomously on cron. overclock the heartbeat for a fast test run:`);
  console.log(`  bun bin/bench.ts --drive --repo ${repo}`);
  console.log(`then score it:`);
  console.log(`  bun bin/bench.ts --score --repo ${repo} --workload ${wl}`);
  process.exit(0);
}

// ---- DRIVE (overclock): a fast, reliable test heartbeat ----
// The production heartbeat is GitHub `schedule` cron, but it is slow (min */5) and flaky on fresh repos, so a
// live cell can idle 30+ min between sweeps. The heartbeat is the CLOCK, not a judgment — so for TESTING we
// drive it fast via workflow_dispatch (always reliable), paced by actual sweep completion. The agents still
// make EVERY decision (triage/develop/review); we only remove the cron dead-time. This is a bench-only
// accelerator — the installed system is unchanged. (Per-PR review+merge is already deterministic, so once a
// sweep launches developers the work flows on its own; we only re-tick the periodic PM/planner sweep.)
if (process.argv.includes('--drive')) {
  const repo = arg('--repo');
  if (!repo) throw new Error('usage: --drive --repo <owner/name> [--ticks N] [--settle SECONDS] [--planner]');
  const maxTicks = Number(arg('--ticks', '12'));
  const settleMs = Number(arg('--settle', '300')) * 1000;
  const withPlanner = process.argv.includes('--planner'); // also tick the planner (greenfield / planner-gated workloads)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const sh = (a: string[]) => { try { return execFileSync('gh', a, { encoding: 'utf8' }).trim(); } catch { return ''; } };
  const num = (a: string[]) => Number(sh(a) || '0');
  const snapshot = () => ({
    openPRs: num(['pr', 'list', '-R', repo, '--state', 'open', '--json', 'number', '--jq', 'length']),
    merged: num(['pr', 'list', '-R', repo, '--state', 'merged', '--json', 'number', '--jq', 'length']),
    closed: num(['issue', 'list', '-R', repo, '--state', 'closed', '--json', 'number', '--jq', 'length']),
    openIssues: num(['issue', 'list', '-R', repo, '--state', 'open', '--json', 'number', '--jq', 'length']),
  });
  console.log(`overclock: driving ${repo} — up to ${maxTicks} ticks, ${settleMs / 1000}s settle/tick${withPlanner ? ' (+planner)' : ''}`);
  let prev = '';
  let stable = 0;
  for (let tick = 1; tick <= maxTicks; tick++) {
    run('gh', ['workflow', 'run', 'pm.yml', '-R', repo]);
    if (tick === 1 && withPlanner) run('gh', ['workflow', 'run', 'planner.yml', '-R', repo]);
    // Pace by the PM sweep actually completing (not a blind sleep), then a settle window for the developers
    // it launched to flow develop -> auto-review -> auto-merge before the next sweep triages/closes.
    await sleep(20000); // let the dispatched run register
    const deadline = Date.now() + 7 * 60 * 1000;
    while (Date.now() < deadline && sh(['run', 'list', '-R', repo, '--workflow', 'pm.yml', '--limit', '1', '--json', 'status', '--jq', '.[0].status']) !== 'completed') {
      await sleep(15000);
    }
    await sleep(settleMs);
    const s = snapshot();
    const key = `${s.openPRs}/${s.merged}/${s.closed}/${s.openIssues}`;
    console.log(`  tick ${tick}: PRs open=${s.openPRs} merged=${s.merged} | issues open=${s.openIssues} closed=${s.closed}`);
    // Settled = no open PRs in flight AND nothing changed since the last tick, twice running (steady state).
    if (s.openPRs === 0 && key === prev) {
      if (++stable >= 2) { console.log('  settled (steady state).'); break; }
    } else stable = 0;
    prev = key;
  }
  console.log(`overclock done. score: bun bin/bench.ts --score --repo ${repo} --workload <W>`);
  process.exit(0);
}

// ---- OPERATE (operator/human sim): drive + verify the manual-operator-test scenarios ----
// The autonomous half of conformance is driven by --drive; the operator half needs a maintainer's inputs
// (/agent commands, labels, induced conditions). This simulates that operator and verifies the system's
// real response, labeling confirmed scenarios `oa-test-passed` (the coverage grader counts that as proven).
if (process.argv.includes('--operate')) {
  const repo = arg('--repo');
  if (!repo) throw new Error('usage: --operate --repo <owner/name>');
  run('bun', ['scripts/bench-operate.ts', '--repo', repo]);
  process.exit(0);
}

// ---- TEARDOWN: refund the unused balance to the funder, then delete the disposable repo ----
// A cell's funding is a transaction: bootstrap grants the repo a bounded budget; teardown refunds whatever
// it didn't spend (a reverse grant) so the funder only ever loses the actual model spend. Disposable cells
// must close their funding, or the funder bleeds out one locked grant at a time.
if (process.argv.includes('--teardown')) {
  const repo = arg('--repo');
  if (!repo) throw new Error('usage: --teardown --repo <owner/name> [--funder <acct>] [--keep-repo]');
  const adminToken = process.env.MODEL_PROXY_ADMIN_TOKEN;
  const proxyBase = process.env.MODEL_PROXY_URL || 'https://volter-agent-model-proxy.aaron-0ed.workers.dev';
  if (adminToken) {
    const funder = arg('--funder', 'volter-ai/open-autonomy');
    const acct = (await (await fetch(`${proxyBase}/v1/accounts/${encodeURIComponent(repo)}`)).json()) as { balance_usd_cents?: number };
    const remaining = acct.balance_usd_cents ?? 0;
    if (remaining > 0) {
      const res = await fetch(`${proxyBase}/admin/accounts/${encodeURIComponent(repo)}/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ to: funder, amount_usd_cents: remaining, key: `bench:refund:${repo}` }),
      });
      console.log(`refunded ${repo} -> ${funder}: ${res.ok ? `$${(remaining / 100).toFixed(2)} (unused)` : `FAILED ${res.status}`}`);
    } else {
      console.log(`nothing to refund (${repo} balance is $0)`);
    }
    // Release any active run slots the cell still holds. Deleting the repo does NOT revoke its in-flight
    // proxy runs — they would pin the per-actor/per-repo active-run caps for the full token TTL (~2h),
    // which is exactly what saturates the caps after a few bench cycles. Free them here.
    const reaped = await fetch(`${proxyBase}/admin/accounts/${encodeURIComponent(repo)}/reap-runs`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken },
    });
    const r = (await reaped.json().catch(() => ({}))) as { freed?: number };
    console.log(reaped.ok ? `released ${r.freed ?? 0} active run slot(s) for ${repo}` : `FAILED to release run slots (${reaped.status})`);
  } else {
    console.log('no admin token — skipping refund + run-slot release; set MODEL_PROXY_ADMIN_TOKEN to reclaim them');
  }
  if (process.argv.includes('--keep-repo')) {
    console.log(`kept repo ${repo} (--keep-repo)`);
  } else {
    run('gh', ['repo', 'delete', repo, '--yes']);
    console.log(`deleted ${repo}`);
  }
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
  // Run the graders the workload declares — pluggable per workload (rubric judge / coverage), the
  // eval-framework idiom (one case suite, scorers chosen per case). Default to the rubric judge.
  const meta = JSON.parse(readFileSync(join(WL, wl, 'workload.json'), 'utf8')) as { graders?: string[] };
  const graders = meta.graders ?? ['rubric'];
  const out = arg('--out');
  for (const g of graders) {
    console.log(`\n— grader: ${g} —`);
    if (g === 'rubric') run('bun', ['scripts/bench-judge.ts', '--workload', join(WL, wl), '--result', dir, ...(out ? ['--out', out] : [])]);
    else if (g === 'coverage') run('bun', ['scripts/bench-coverage.ts', '--repo', repo]);
    else throw new Error(`unknown grader "${g}" in ${wl}/workload.json (use rubric|coverage)`);
  }
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
