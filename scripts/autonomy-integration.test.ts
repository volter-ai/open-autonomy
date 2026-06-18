// End-to-end integration: the WHOLE real mechanism as spawned processes. Compile an IR to a local
// setup, materialize it, run the actual scheduler loop once, and watch a work item converge
// Ready → In Progress → Done — driven entirely through the real launcher, the real runner CLI, and
// the real CRUD. The ONLY fake is the agent's brain (scripts/__fixtures__/fake-agent.mjs); every
// process boundary and every runner call is real. (Swap the backend for termfleet + a model and
// this same wiring is a live autonomous run.)
import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileLocal } from './autonomy-emit-local';
import { materialize } from './autonomy-materialize';
import type { AutonomyIR } from './autonomy-ir';

const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: {
    pm: { skill: 'pm', maxConcurrent: 1, config: {} },
    develop: { skill: 'develop', maxConcurrent: 1, config: {} },
  },
  workflows: [{ name: 'pm-tick', cron: '*/15 * * * *', launch: 'pm', config: {} }],
  resources: [],
  policy: { box: {} },
};

test('integration: one loop tick drives PM → develop → issue Done through the real runner chain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-int-'));
  const runnerCmd = `bun ${join(import.meta.dir, 'autonomy-runner-exec.ts')}`;

  // compile → materialize the real local setup
  materialize(compileLocal(ir, { name: 'app', runnerCmd }), dir, () => '# stub skill\n');

  const workStore = join(dir, 'work.json');
  writeFileSync(workStore, JSON.stringify([{ id: 'APP-1', state: 'Ready' }]));

  // run the ACTUAL loop once — everything below is real processes
  const r = spawnSync('node', ['profiles/app/scheduler/scripts/run.mjs', '--once'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      AUTONOMY_STATE: join(dir, 'sessions.json'),
      AUTONOMY_LAUNCH_CMD: `node ${join(import.meta.dir, '__fixtures__', 'fake-agent.mjs')}`,
      AUTONOMY: runnerCmd, // the agent stand-in drives the same runner
      WORK_STORE: workStore,
    },
  });
  expect(r.status).toBe(0);

  // the work item converged end to end
  const issues = JSON.parse(readFileSync(workStore, 'utf8')) as Array<{ id: string; state: string }>;
  expect(issues.find((i) => i.id === 'APP-1')?.state).toBe('Done');

  // the develop session really ran and was transitioned to done (so it's out of `list`)
  const sessions = JSON.parse(readFileSync(join(dir, 'sessions.json'), 'utf8')) as Array<{
    role: string;
    issue?: string;
    status: string;
  }>;
  expect(sessions.some((s) => s.role === 'develop' && s.issue === 'APP-1' && s.status === 'done')).toBe(true);
});
