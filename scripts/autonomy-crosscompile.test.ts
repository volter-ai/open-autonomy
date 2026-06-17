// The headline universality test: compile each real system to the OPPOSITE substrate, and
// pin down exactly what survives and what drops. Cross-compile is lossy BY DESIGN — the IR is
// the superset; each substrate projects down to what it can express.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestProfile } from './autonomy-ingest-profile';
import { ingestAutonomy } from './autonomy-ingest-autonomy';
import { compileLocal } from './autonomy-emit-local';
import { compileGithub } from './autonomy-emit-github';
import { compiledPaths } from './autonomy-ir';

const fixtures = join(import.meta.dir, '__fixtures__');
const repoRoot = join(import.meta.dir, '..');
const profile = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.profile.json'), 'utf8'));
const schedule = JSON.parse(readFileSync(join(fixtures, 'ztrack-simple-sdlc.schedule.json'), 'utf8'));
const autonomy = Bun.YAML.parse(readFileSync(join(repoRoot, '.open-autonomy', 'autonomy.yml'), 'utf8')) as any;

test('ztrack IR → github: run-workflows become .github/workflows; boxed guardrails drop', () => {
  const ir = ingestProfile(profile, schedule);
  const out = compileGithub(ir);
  const paths = compiledPaths(out);

  // SURVIVES: every ztrack run-script becomes a standalone github cron workflow.
  for (const w of ['recover-develop', 'pm-tick', 'recover-review', 'cleanup-pm']) {
    expect(paths).toContain(`.github/workflows/${w}.yml`);
  }
  expect(paths).toContain('.open-autonomy/autonomy.yml');

  // DROPS: humanRequiredPaths/Topics sit under ztrack-specific box keys, so they do NOT land in
  // open-autonomy's policy.risk.human_required_* — cross-format box remapping is not done here.
  expect(out.generated['.open-autonomy/autonomy.yml'].includes('human_required')).toBe(false);

  console.log(
    '\n[ztrack → github]\n' +
      '  survives: agents → codex skills, 4 run-scripts → cron workflows\n' +
      '  drops:    humanRequiredPaths/Topics (box-key mismatch), per-agent WIP (no github equivalent)',
  );
});

test('open-autonomy IR → local: launch becomes a generated launcher; declarative→imperative', () => {
  const ir = ingestAutonomy(autonomy);
  const out = compileLocal(ir, { name: 'app' });
  const paths = compiledPaths(out);

  // SURVIVES: the scheduled (launch) agent becomes a GENERATED launcher script (not a copy).
  expect(out.generated['profiles/app/scheduler/scripts/pm-tick.mjs']).toBeDefined();
  // SURVIVES: all agents still install as local skills (claude + agents harnesses).
  for (const role of Object.keys(ir.agents)) {
    expect(paths).toContain(`.claude/skills/ztrack-app-${role}/SKILL.md`);
  }
  // SURVIVES: roadmap/rubric ride along as copied resources (placement quirk: under standards/).
  expect(paths.some((p) => /roadmap\.yml$/.test(p))).toBe(true);

  console.log(
    '\n[open-autonomy → local]\n' +
      '  survives: agents → skills, launch(pm) → generated launcher, roadmap/rubric → resources\n' +
      '  drops:    capability/merge/risk ENFORCEMENT (advisory only locally), declarative trigger → imperative script',
  );
});
