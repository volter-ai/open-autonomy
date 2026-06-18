// The "it actually works" test: compile an IR to a local setup, materialize it to a temp dir,
// run the loop once, and observe real process execution — a `run:` script fires AND a `launch:`
// agent is dispatched through the generated launcher → run-agent → a pluggable backend.
import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileLocal } from './autonomy-emit-local';
import { materialize } from './autonomy-materialize';
import type { AutonomyIR } from './autonomy-ir';

const HEARTBEAT_SRC = `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.AUTONOMY_HEARTBEAT, 'beat');
`;

const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { pm: { skill: 'pm', maxConcurrent: 1, config: {} } },
  workflows: [
    { name: 'pm-tick', cron: '*/15 * * * *', launch: 'pm', config: {} },
    { name: 'heartbeat', cron: '*/15 * * * *', run: 'scripts/heartbeat.mjs', config: {} },
  ],
  resources: [],
  policy: { box: {} },
};

test('a compiled local setup actually runs: loop fires a run-script and dispatches a launch-agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-run-'));
  const out = compileLocal(ir, { name: 'app' });
  materialize(out, dir, (from) => (from === 'scripts/heartbeat.mjs' ? HEARTBEAT_SRC : '# stub\n'));

  const heartbeatFile = join(dir, 'heartbeat.txt');
  const launchLog = join(dir, 'launches.log');

  const r = spawnSync('node', ['profiles/app/scheduler/scripts/run.mjs', '--once'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      AUTONOMY_HEARTBEAT: heartbeatFile,
      AUTONOMY_LAUNCH_CMD: `printf '%s\\n' "$AUTONOMY_AGENT" >> ${JSON.stringify(launchLog)}`,
    },
  });

  expect(r.status).toBe(0);
  // the run: workflow executed
  expect(existsSync(heartbeatFile)).toBe(true);
  expect(readFileSync(heartbeatFile, 'utf8')).toBe('beat');
  // the launch: workflow dispatched the right agent through run-agent → backend
  expect(existsSync(launchLog)).toBe(true);
  expect(readFileSync(launchLog, 'utf8').trim()).toBe('pm');
});
