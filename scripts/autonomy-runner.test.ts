// Proves the runner CLI — the uniform interface to the agent runner — actually does
// launch / list / cancel through real processes against the exec backend.
import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Drive the concrete pre-made exec runner directly — no AUTONOMY_RUNNER selection.
const execRunner = join(import.meta.dir, 'autonomy-runner-exec.ts');

function run(dir: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync('bun', [execRunner, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, AUTONOMY_STATE: join(dir, 'sessions.json'), ...extraEnv },
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

test('autonomy get reads one session; update transitions it out of list (done ≠ running)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-cli-'));

  const s = JSON.parse(run(dir, ['launch', 'develop', '--issue', 'I7']).stdout);

  // R (read one)
  const got = JSON.parse(run(dir, ['get', s.id]).stdout);
  expect(got.role).toBe('develop');
  expect(got.status).toBe('running');

  // a missing id reads as not-found
  expect(run(dir, ['get', 'nope']).status).toBe(1);

  // U (transition): mark the finished session done — the fix for "list shows it as running forever"
  expect(run(dir, ['update', s.id, '--status', 'done']).status).toBe(0);
  expect(JSON.parse(run(dir, ['list']).stdout).length).toBe(0); // gone from running
  expect(JSON.parse(run(dir, ['get', s.id]).stdout).status).toBe('done'); // still readable
});

test('autonomy launch invokes the pluggable backend with the role in env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-cli-'));
  const log = join(dir, 'backend.log');
  run(dir, ['launch', 'pm'], { AUTONOMY_LAUNCH_CMD: `printf '%s\\n' "$AUTONOMY_AGENT" >> ${JSON.stringify(log)}` });
  expect(readFileSync(log, 'utf8').trim()).toBe('pm');
});
