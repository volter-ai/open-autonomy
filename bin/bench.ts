#!/usr/bin/env bun
// Bench — the workload-suite runner. An experiment is a CELL: profile × substrate × workload
// (docs/VISION.md). The workload suite is a diverse, human-owned battery of small repos + task-sets
// (docs / bug / feature / refactor / security / flaky), the subject under test being the org DESIGN, not
// the model.
//
//   bun bin/bench.ts            STATIC: every cell, assert the install COEXISTS with the workload repo
//   bun bin/bench.ts --live     LIVE (not yet wired): provision, run autonomously, score by autonomy ratio
//
// STATIC mode overlays compile(profile, substrate) onto each workload and checks install SAFETY across the
// whole matrix: the install may seed an install-owned file (package.json/README/…) when the project lacks
// it, but must NEVER overwrite the project's own source, and must never leak another profile's agents.
// (Pure per-profile compile coherence + import-closure is check:profiles; this adds the project axis.)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseIr, isInstallOwned } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from '@open-autonomy/substrate-local';

const WL = 'bench/workload';
const PROFILES = 'profiles';

if (process.argv.includes('--live')) {
  console.error('live mode is not wired yet — it provisions a disposable repo per cell from the workload');
  console.error('seed, runs the profile autonomously for its time budget (never hand-cranked), then scores');
  console.error('the outcome with scripts/bench-judge.ts (AI rubric) × scripts/autonomy-ratio.ts (autonomy).');
  console.error('See bench/README.md.');
  process.exit(2);
}

// The project's own files (relative paths), excluding the workload manifest and any local install detritus.
function repoFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'workload.json') continue;
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
  // The "project" is the seed repo the org starts from — install paths are compared against it.
  const seedDir = join(wdir, 'seed');
  const own = new Set(existsSync(seedDir) ? repoFiles(seedDir, seedDir) : []);
  for (const p of profiles) {
    const ir = parseIr(readFileSync(join(PROFILES, p, 'ir.yml'), 'utf8'));
    for (const sub of ir.targets) {
      cells++;
      try {
        const out = sub === 'github' ? compileGithub(ir) : sub === 'local' ? compileLocal(ir) : null;
        if (!out) {
          errs.push(`${w} × ${p}/${sub}: unknown substrate`);
          continue;
        }
        const produced = [...Object.keys(out.generated), ...out.copies.map((c) => c.to)];
        // A produced path that the project already owns is a CLOBBER unless it is install-owned (then the
        // overlay seeds-if-missing and keeps the project's copy).
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
  console.error(`\nbench STATIC FAILED — ${errs.length}/${cells} cells:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nbench STATIC OK: ${cells} cells (${profiles.length} profiles × ${workloads.length} workloads) install cleanly`);
