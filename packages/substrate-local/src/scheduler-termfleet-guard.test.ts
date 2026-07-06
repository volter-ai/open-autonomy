// BL-27 dev/01: running the emitted scheduler before `npm install termfleet` used to die with a raw,
// buried ERR_MODULE_NOT_FOUND (several process-hops deep: run.mjs -> run-agent.mjs -> autonomy-runner.mjs
// -> `import 'termfleet'`). The loop driver now checks up front — but ONLY when the schedule actually
// needs the runner — and prints a friendly "npm install termfleet" fix instead.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
});
