// Proves the runner CLI — the uniform interface to the agent runner — actually does
// launch / list / cancel through real processes against the exec backend.
import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = join(import.meta.dir, 'autonomy-cli.ts');

function run(dir: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync('bun', [cli, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, AUTONOMY_RUNNER: 'exec', AUTONOMY_STATE: join(dir, 'sessions.json'), ...extraEnv },
  });
}

test('autonomy CLI: launch → list → cancel over the exec backend', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-cli-'));

  const a = JSON.parse(run(dir, ['launch', 'develop', '--issue', 'I1']).stdout);
  run(dir, ['launch', 'review', '--issue', 'I2']);

  let listed = JSON.parse(run(dir, ['list']).stdout);
  expect(listed.length).toBe(2);
  expect(listed.map((s: { role: string }) => s.role).sort()).toEqual(['develop', 'review']);

  expect(run(dir, ['cancel', a.id]).status).toBe(0);

  listed = JSON.parse(run(dir, ['list']).stdout);
  expect(listed.length).toBe(1);
  expect(listed[0].role).toBe('review');
  expect(listed[0].issue).toBe('I2');
});

test('autonomy launch invokes the pluggable backend with the role in env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-cli-'));
  const log = join(dir, 'backend.log');
  run(dir, ['launch', 'pm'], { AUTONOMY_LAUNCH_CMD: `printf '%s\\n' "$AUTONOMY_AGENT" >> ${JSON.stringify(log)}` });
  expect(readFileSync(log, 'utf8').trim()).toBe('pm');
});
