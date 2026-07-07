// BL-27 dev/01: running the emitted scheduler before `npm install termfleet` used to die with a raw,
// buried ERR_MODULE_NOT_FOUND (several process-hops deep: run.mjs -> run-agent.mjs -> autonomy-runner.mjs
// -> `import 'termfleet'`). The loop driver now checks up front — but ONLY when the schedule actually
// needs the runner — and prints a friendly "npm install termfleet" fix instead.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLocal } from './emit';
import type { AutonomyIR } from '@open-autonomy/core';

const skillAgentIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

const scriptOnlyIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

function scaffold(ir: AutonomyIR): string {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa-termfleet-guard-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']);
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), out.generated['scheduler/schedule.json']);
  // A script-only schedule's script (scripts/sweep.ts) must exist for `bun scripts/sweep.ts` to at least
  // ATTEMPT to run (its own success/failure is irrelevant — this test only cares whether the termfleet
  // guard fires, not whether the script itself does anything).
  if (out.generated['scheduler/schedule.json'].includes('scripts/sweep.ts')) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'sweep.ts'), 'console.log("swept");\n');
  }
  return dir;
}

describe('scheduler/run.mjs --once — the termfleet pre-flight guard', () => {
  test('a schedule that launches a skill agent (needs the runner) fails FAST with npm-install guidance, no termfleet installed', () => {
    const dir = scaffold(skillAgentIr);
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('npm install termfleet');
      expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND'); // the friendly message replaces the raw crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a script-only schedule (no skill agent) never needs the runner — no termfleet warning at all', () => {
    const dir = scaffold(scriptOnlyIr);
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.stderr).not.toContain('npm install termfleet');
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // OA-04 (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md): node_modules/termfleet
  // EXISTING is not enough to prove the guard above safe — an npm workspace can symlink that exact path
  // to the HOST's own in-development source (the audit's "termfleet" repro: a workspace `packages/core`
  // published as "termfleet" itself). The OLD existsSync guard passes here (the path exists!) and the
  // process would go on to crash several hops deep with a raw ERR_MODULE_NOT_FOUND (or, worse, silently
  // run the wrong code). This is the tamper probe for the emit.ts change: reverting the guard back to a
  // bare existsSync makes this test fail (status stays 0 — `fireTick` always exits 0 on --once regardless
  // of what its spawned commands do — and no COLLISION text is ever printed).
  test('a workspace-shadowed termfleet (node_modules/termfleet is a symlink into the repo tree) is refused with the named collision error, before any tick', () => {
    const dir = scaffold(skillAgentIr);
    try {
      // The exact shape npm workspaces produces: the "real" package lives at a repo-tracked path (as if it
      // were a workspace member happening to be named "termfleet"), and node_modules/termfleet is a
      // symlink to it — never a registry copy.
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(
        join(dir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', main: 'index.js' }),
      );
      writeFileSync(join(dir, 'packages', 'core', 'index.js'), 'export const x = 1;\n');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', 'termfleet'), 'dir');
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('COLLISION');
      expect(r.stderr).toContain('termfleet');
      expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND'); // the named collision error replaces the raw crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
