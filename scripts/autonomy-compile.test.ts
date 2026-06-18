// File-tree compile, checked against the two real oracles:
//  - local: the exact installed file set asserted by demos/autonomous-profile-setup.sh (ztrack).
//  - github: the .open-autonomy / .github / .codex shape of templates/self-driving-repo.
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

// Oracle: the required[] list in volter-ztrack/demos/autonomous-profile-setup.sh (snapshot).
const ZTRACK_REQUIRED = [
  'profiles/simple-sdlc/profile.json',
  'profiles/simple-sdlc/README.md',
  'profiles/simple-sdlc/scheduler/schedule.json',
  'profiles/simple-sdlc/scheduler/scripts/run.mjs',
  'profiles/simple-sdlc/scheduler/scripts/pm-tick.mjs',
  'profiles/simple-sdlc/scheduler/scripts/cleanup-pm.mjs',
  'profiles/simple-sdlc/scheduler/scripts/recover-develop.mjs',
  'profiles/simple-sdlc/scheduler/scripts/recover-review.mjs',
  'profiles/simple-sdlc/scripts/run-agent.mjs',
  '.agents/skills/ztrack-simple-sdlc-pm/SKILL.md',
  '.agents/skills/ztrack-simple-sdlc-draft/SKILL.md',
  '.agents/skills/ztrack-simple-sdlc-develop/SKILL.md',
  '.agents/skills/ztrack-simple-sdlc-review/SKILL.md',
  '.claude/skills/ztrack-simple-sdlc-pm/SKILL.md',
  '.claude/skills/ztrack-simple-sdlc-draft/SKILL.md',
  '.claude/skills/ztrack-simple-sdlc-develop/SKILL.md',
  '.claude/skills/ztrack-simple-sdlc-review/SKILL.md',
  'profiles/simple-sdlc/skills/pm/SKILL.md',
  'profiles/simple-sdlc/skills/draft/SKILL.md',
  'profiles/simple-sdlc/skills/develop/SKILL.md',
  'profiles/simple-sdlc/skills/review/SKILL.md',
  'profiles/simple-sdlc/standards/workflow.md',
  'profiles/simple-sdlc/standards/issue-and-evidence.md',
  'profiles/simple-sdlc/standards/risk-and-review.md',
].sort();

test('local compile reproduces the ztrack installed file set exactly', () => {
  const ir = ingestProfile(profile, schedule);
  const paths = compiledPaths(compileLocal(ir, { name: 'simple-sdlc' }));
  expect(paths).toEqual(ZTRACK_REQUIRED);
});

test('the compiler wires a concrete supported runner into the launcher (no runtime selection)', () => {
  const launchIr = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: { pm: { skill: 'pm', maxConcurrent: 1, config: {} } },
    workflows: [{ name: 'pm-tick', cron: '*/15 * * * *', launch: 'pm', config: {} }],
    resources: [],
    policy: { box: {} },
  } as const;

  // default local runner is termfleet; the launcher names it directly
  const def = compileLocal(launchIr as never, { name: 'app' });
  expect(def.generated['profiles/app/scheduler/scripts/pm-tick.mjs']).toContain('autonomy-termfleet');

  // compile-time override to another SUPPORTED runner
  const exec = compileLocal(launchIr as never, { name: 'app', runner: 'exec' });
  expect(exec.generated['profiles/app/scheduler/scripts/pm-tick.mjs']).toContain('autonomy-exec');

  // a runner we don't ship fails fast — we only install runners we support
  expect(() => compileLocal(launchIr as never, { name: 'app', runner: 'github' as never })).toThrow(/unsupported runner/);
});

test('github compile produces the open-autonomy shape (manifest + workflows + codex skills)', () => {
  const ir = ingestAutonomy(autonomy);
  const paths = compiledPaths(compileGithub(ir));
  expect(paths).toContain('.open-autonomy/autonomy.yml');
  expect(paths).toContain('.github/workflows/pm-tick.yml'); // the one scheduled (launch) agent
  expect(paths).toContain('.codex/skills/open-autonomy-pm/SKILL.md');
  // one .codex skill per agent
  for (const role of Object.keys(ir.agents)) {
    expect(paths.some((p) => p.startsWith('.codex/skills/') && p.endsWith('/SKILL.md'))).toBe(true);
  }
});
