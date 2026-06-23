#!/usr/bin/env bun
// The github substrate VENDORS a copy of the GENERIC runtime under packages/substrate-github/src/runtime/
// so compileGithub can inject it into EVERY installation. The mirror holds only substrate machinery —
// the thin credentialed skill runner (claude-agent-run.ts + agent.ts), the model-proxy mint/exchange/
// revoke clients, the visual-verify helper, and the runner. The canonical source is scripts/ (where it is
// developed + tested) and the mirror tracks it.
//
//   bun bin/sync-runtime.ts            re-sync the mirror (scripts/ -> packages/.../runtime/)
//   bun bin/sync-runtime.ts --check    verify they match (CI); nonzero exit on drift
//
// EXCLUDED from the mirror (so they do NOT leak into every profile's install):
//   - DEV_ONLY: open-autonomy's own dev/analysis tooling (scaffold/bootstrap/proof/testbed/bench) —
//     never shipped into any installation.
//   - PROFILE_OWNED: the self-driving PROFILE's own agents (pm/reviewer/planner/strategist + their
//     deterministic libraries). These are profile content, not substrate runtime — they live in
//     profiles/self-driving/scripts/ and ship only via that profile's `resources`. Vendoring them here
//     is exactly the leak that put OA's PM/reviewer into an unrelated profile's install.
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'scripts';
const DEST = 'packages/substrate-github/src/runtime';
const DEV_ONLY = new Set([
  'fund-bootstrap.ts',
  'open-autonomy-proof-audit.ts', 'open-autonomy-proof-audit.test.ts',
  'provision-target-repo.ts', 'provision-target-repo.test.ts',
  // Bench (dev/analysis): the one eval harness's graders — fitness measurement, not shipped.
  // Workloads + the runner live in bench/; these are the per-grader scripts under scripts/.
  'bench-judge.ts', 'bench-coverage.ts', 'bench-coverage.test.ts', 'bench-operate.ts',
  // Packaging tooling: builds the published node CLI bundle — dev-only, never shipped into an install.
  'build-cli.ts',
  // Operator treasury tooling: rotates the proxy admin token (worker secret + local .env) — dev-only.
  'rotate-admin-token.ts',
]);
const PROFILE_OWNED = new Set([
  // self-driving's OWN governance/preflight/upgrade tooling — profile content, shipped via the profile's
  // `resources`, NOT vendored into the generic runtime mirror. (All agents are skills; there are no agent
  // behavior scripts.)
  'open-autonomy-config.ts', 'open-autonomy-preflight.ts', 'open-autonomy-upgrade-cli.ts',
]);
// Unit tests are dev artifacts, NOT install content — they never run in an installation and would carry
// dangling deps if vendored. They stay in scripts/ (run by check:public-agent) and ship to no profile.
const excluded = (f: string) => DEV_ONLY.has(f) || PROFILE_OWNED.has(f) || f.endsWith('.test.ts');
const set = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !excluded(f)).sort();

const check = process.argv.includes('--check');
const drift: string[] = [];
for (const f of set) {
  const src = readFileSync(join(SRC, f), 'utf8');
  if (!check) { writeFileSync(join(DEST, f), src); continue; }
  let dst = '';
  try { dst = readFileSync(join(DEST, f), 'utf8'); } catch { /* missing */ }
  if (dst !== src) drift.push(f);
}
// Write mode prunes stale mirror files (e.g. a script newly moved into a profile) so the mirror never
// keeps shipping something that is no longer generic runtime.
if (!check) for (const f of readdirSync(DEST)) if (f.endsWith('.ts') && !set.includes(f)) rmSync(join(DEST, f));
for (const f of readdirSync(DEST)) if (f.endsWith('.ts') && !set.includes(f)) drift.push(`extra-in-mirror: ${f}`);

if (!check) { console.log(`synced ${set.length} runtime files: ${SRC}/ -> ${DEST}/`); }
else if (drift.length) {
  console.error(`runtime mirror OUT OF SYNC with ${SRC}/ — ${drift.length}:\n  ${drift.join('\n  ')}\n  fix: bun bin/sync-runtime.ts`);
  process.exit(1);
} else console.log(`runtime mirror in sync: ${set.length} files (${SRC}/ == ${DEST}/)`);
