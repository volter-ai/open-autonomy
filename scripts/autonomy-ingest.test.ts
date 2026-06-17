// Falsification step for the Autonomy IR (docs/AUTONOMY-IR.md): ingest the two REAL systems
// — the ztrack profile and the open-autonomy manifest — and prove they both fall into the same
// four nouns. If they don't, the design is wrong on contact.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestProfile } from './autonomy-ingest-profile';
import { ingestAutonomy } from './autonomy-ingest-autonomy';
import { validateIR, irShape } from './autonomy-ir';

const fixtures = join(import.meta.dir, '__fixtures__');
const repoRoot = join(import.meta.dir, '..');

// ztrack: vendored snapshot of profiles/simple-sdlc/{profile,scheduler/schedule}.json (external repo).
const profile = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.profile.json'), 'utf8'));
const schedule = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.schedule.json'), 'utf8'));
// open-autonomy: the live in-repo manifest (the source of truth itself).
const autonomy = Bun.YAML.parse(readFileSync(join(repoRoot, '.open-autonomy', 'autonomy.yml'), 'utf8')) as any;

test('ztrack profile ingests into a valid IR', () => {
  const ir = ingestProfile(profile, schedule);
  expect(validateIR(ir)).toEqual([]);
  expect(Object.keys(ir.agents).sort()).toEqual(['develop', 'draft', 'pm', 'review']);
});

test('open-autonomy manifest ingests into a valid IR', () => {
  const ir = ingestAutonomy(autonomy);
  expect(validateIR(ir)).toEqual([]);
  expect(Object.keys(ir.agents)).toContain('pm');
});

test('both real systems populate the same four nouns', () => {
  const a = irShape(ingestProfile(profile, schedule));
  const b = irShape(ingestAutonomy(autonomy));
  for (const s of [a, b]) {
    expect(s.agents.length).toBeGreaterThan(0);
    expect(s.workflows.length).toBeGreaterThan(0);
    expect(s.resourceCount).toBeGreaterThan(0);
  }
  // Eyeball output: the two systems' IR fingerprints side by side.
  console.log('\n=== ztrack (simple-sdlc) IR shape ===\n' + JSON.stringify(a, null, 2));
  console.log('\n=== open-autonomy IR shape ===\n' + JSON.stringify(b, null, 2));
});

test('the launch/run split surfaces the imperative-vs-declarative dispatch difference', () => {
  const zt = ingestProfile(profile, schedule);
  const oa = ingestAutonomy(autonomy);
  // ztrack buries dispatch in scripts → every workflow is a `run:`.
  expect(zt.workflows.every((w) => !!w.run && !w.launch)).toBe(true);
  // open-autonomy declares dispatch on the agent → schedule workflows are `launch:`.
  expect(oa.workflows.some((w) => !!w.launch)).toBe(true);
});
