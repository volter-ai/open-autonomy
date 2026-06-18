// Dry run of the whole dispatch loop, end to end, with NO LLM and NO termfleet.
// A deterministic stand-in follows scripts/skills/pm/SKILL.md step for step, driving the REAL
// runner CLI (exec backend) against a JSON work store. This proves the *plumbing* — claim,
// dispatch, WIP backpressure, status transition, capacity reuse — not the PM model's judgment.
import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = join(import.meta.dir, 'autonomy-cli.ts');

type Issue = { id: string; state: string };

function makeEnv(dir: string): Record<string, string> {
  return {
    AUTONOMY_RUNNER: 'exec',
    AUTONOMY_STATE: join(dir, 'sessions.json'),
    AUTONOMY_LAUNCH_CMD: `printf '%s\\n' "$AUTONOMY_AGENT $AUTONOMY_ISSUE" >> ${JSON.stringify(join(dir, 'dispatch.log'))}`,
  };
}

const auto = (dir: string, env: Record<string, string>, args: string[]) =>
  spawnSync('bun', [cli, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });

// Deterministic PM tick — exactly the SKILL.md procedure, minus the model.
function pmTick(dir: string, env: Record<string, string>): { dispatched: string | null } {
  const storePath = join(dir, 'work.json');
  const store = JSON.parse(readFileSync(storePath, 'utf8')) as Issue[];
  const running = JSON.parse(auto(dir, env, ['list']).stdout) as Array<{ role: string }>;
  if (running.some((s) => s.role === 'develop')) return { dispatched: null }; // WIP: one develop
  const ready = store.find((i) => i.state === 'Ready');
  if (!ready) return { dispatched: null };
  ready.state = 'In Progress'; // claim (work store)
  writeFileSync(storePath, JSON.stringify(store));
  auto(dir, env, ['launch', 'develop', '--issue', ready.id]); // dispatch (runner CLI)
  return { dispatched: ready.id };
}

test('dry run: PM dispatches one, WIP blocks the next, done frees capacity, then the next goes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-dryrun-'));
  const env = makeEnv(dir);
  writeFileSync(join(dir, 'work.json'), JSON.stringify([
    { id: 'APP-1', state: 'Ready' },
    { id: 'APP-2', state: 'Ready' },
  ]));

  // tick 1 → dispatch APP-1
  expect(pmTick(dir, env).dispatched).toBe('APP-1');
  expect(JSON.parse(auto(dir, env, ['list']).stdout).length).toBe(1);

  // tick 2 → develop busy, WIP blocks
  expect(pmTick(dir, env).dispatched).toBe(null);
  expect(JSON.parse(auto(dir, env, ['list']).stdout).length).toBe(1);

  // the develop session finishes
  const session = JSON.parse(auto(dir, env, ['list']).stdout)[0];
  expect(auto(dir, env, ['update', session.id, '--status', 'done']).status).toBe(0);

  // tick 3 → capacity free → dispatch APP-2
  expect(pmTick(dir, env).dispatched).toBe('APP-2');
  expect(JSON.parse(auto(dir, env, ['list']).stdout).length).toBe(1);

  // both issues claimed; the backend saw exactly the two develop launches, with issue ids
  const store = JSON.parse(readFileSync(join(dir, 'work.json'), 'utf8')) as Issue[];
  expect(store.every((i) => i.state === 'In Progress')).toBe(true);
  expect(readFileSync(join(dir, 'dispatch.log'), 'utf8').trim().split('\n')).toEqual([
    'develop APP-1',
    'develop APP-2',
  ]);
});
