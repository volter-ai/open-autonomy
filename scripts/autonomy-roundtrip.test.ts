// Closes the round-trip for the Autonomy IR (docs/AUTONOMY-IR.md): for each real system,
// prove emit is faithful to the IR by checking ingest = ingest∘emit∘ingest (IR-stable).
// This is the markdownPort-style proof — robust to formatting/convention differences,
// strict about information content.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestProfile } from './autonomy-ingest-profile';
import { ingestAutonomy } from './autonomy-ingest-autonomy';
import { emitProfile } from './autonomy-emit-local';
import { emitAutonomy } from './autonomy-emit-github';
import { validateIR } from './autonomy-ir';

const fixtures = join(import.meta.dir, '__fixtures__');
const repoRoot = join(import.meta.dir, '..');
const profile = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.profile.json'), 'utf8'));
const schedule = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.schedule.json'), 'utf8'));
const autonomy = Bun.YAML.parse(readFileSync(join(repoRoot, '.open-autonomy', 'autonomy.yml'), 'utf8')) as any;

test('ztrack profile round-trips (ingest = ingest∘emit∘ingest)', () => {
  const ir1 = ingestProfile(profile, schedule);
  const { profile: p2, schedule: s2 } = emitProfile(ir1, { name: 'simple-sdlc' });
  const ir2 = ingestProfile(p2, s2);
  expect(validateIR(ir2)).toEqual([]);
  expect(ir2).toEqual(ir1);
});

test('open-autonomy manifest round-trips (ingest = ingest∘emit∘ingest)', () => {
  const ir1 = ingestAutonomy(autonomy);
  const ir2 = ingestAutonomy(emitAutonomy(ir1));
  expect(validateIR(ir2)).toEqual([]);
  expect(ir2).toEqual(ir1);
});

test('emitted local profile carries both harness skill targets (claude + codex)', () => {
  const ir = ingestProfile(profile, schedule);
  const { profile: p } = emitProfile(ir, { name: 'simple-sdlc' });
  for (const role of Object.keys(ir.agents)) {
    expect(p.skills![role]!.claude).toBe(`.claude/skills/ztrack-simple-sdlc-${role}/SKILL.md`);
    expect(p.skills![role]!.codex).toBe(`.agents/skills/ztrack-simple-sdlc-${role}/SKILL.md`);
  }
});

test('emitted github manifest re-parses with the original agent set', () => {
  const ir = ingestAutonomy(autonomy);
  const m = emitAutonomy(ir);
  expect(Object.keys(m.agents!).sort()).toEqual(Object.keys(autonomy.agents).sort());
});
