#!/usr/bin/env bun
// The github substrate VENDORS a copy of the runtime under packages/substrate-github/src/runtime/
// so compileGithub can inject it into installations. The canonical source is scripts/ — that is
// where the runtime is developed and where check:public-agent runs its tests. This keeps the
// vendored mirror in lockstep with scripts/, closing the drift vector the vendored copy creates.
//
//   bun bin/sync-runtime.ts            re-sync the mirror (scripts/ -> packages/.../runtime/)
//   bun bin/sync-runtime.ts --check    verify they match (CI); nonzero exit on drift
//
// The runtime set = every scripts/*.ts EXCEPT open-autonomy's own dev tooling (scaffold/provision/
// bootstrap/fund/proof-audit/testbed-proctor), which is NOT shipped into installations.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'scripts';
const DEST = 'packages/substrate-github/src/runtime';
const DEV_ONLY = new Set([
  'bootstrap-self-driving-testbed.ts', 'bootstrap-testbed.ts', 'fund-bootstrap.ts',
  'open-autonomy-proof-audit.ts', 'open-autonomy-proof-audit.test.ts',
  'provision-target-repo.ts', 'provision-target-repo.test.ts',
  'scaffold-target-repo.ts', 'testbed-proctor-report.ts', 'testbed-proctor-report.test.ts',
  // Bench (dev/analysis): fitness measurement over recorded decisions — not shipped into installs.
  'autonomy-ratio.ts', 'autonomy-ratio.test.ts',
]);
const set = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !DEV_ONLY.has(f)).sort();

const check = process.argv.includes('--check');
const drift: string[] = [];
for (const f of set) {
  const src = readFileSync(join(SRC, f), 'utf8');
  if (!check) { writeFileSync(join(DEST, f), src); continue; }
  let dst = '';
  try { dst = readFileSync(join(DEST, f), 'utf8'); } catch { /* missing */ }
  if (dst !== src) drift.push(f);
}
for (const f of readdirSync(DEST)) if (f.endsWith('.ts') && !set.includes(f)) drift.push(`extra-in-mirror: ${f}`);

if (!check) { console.log(`synced ${set.length} runtime files: ${SRC}/ -> ${DEST}/`); }
else if (drift.length) {
  console.error(`runtime mirror OUT OF SYNC with ${SRC}/ — ${drift.length}:\n  ${drift.join('\n  ')}\n  fix: bun bin/sync-runtime.ts`);
  process.exit(1);
} else console.log(`runtime mirror in sync: ${set.length} files (${SRC}/ == ${DEST}/)`);
