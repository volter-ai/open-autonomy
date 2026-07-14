import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';

const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: {
    seed: { behavior: 'scripts/seed.ts', capabilities: [], triggers: [{ cron: '*/15 * * * *' }] },
  },
  policy: { box: {} },
  resources: [],
};

describe('emitted scheduler hard controls', () => {
  test('maxConcurrent denies a new agent launch while a scheduled agent session is active', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-scheduler-controls-'));
    try {
      const run = compileLocal(ir).generated['scheduler/run.mjs'];
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), run);
      writeFileSync(join(dir, 'scripts', 'autonomy-runner.mjs'),
        `console.log(JSON.stringify([{id:'live',agent:'one',status:'running'}]));\n`);
      const sentinel = join(dir, 'launched');
      writeFileSync(join(dir, 'scripts', 'launch.mjs'),
        `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'launched');\n`);
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({
        maxConcurrent: 1,
        env: {},
        jobs: [
          { name: 'one', agent: 'one', command: 'node scripts/launch.mjs', intervalSeconds: 60, retrySeconds: 10 },
          { name: 'two', agent: 'two', command: 'node scripts/launch.mjs', intervalSeconds: 60, retrySeconds: 10 },
        ],
      }));
      const result = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('maxConcurrent fails closed when session liveness cannot be established', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-scheduler-controls-'));
    try {
      const run = compileLocal(ir).generated['scheduler/run.mjs'];
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), run);
      writeFileSync(join(dir, 'scripts', 'autonomy-runner.mjs'), `process.exit(1);\n`);
      const sentinel = join(dir, 'launched');
      writeFileSync(join(dir, 'scripts', 'launch.mjs'),
        `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'launched');\n`);
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({
        maxConcurrent: 1,
        env: {},
        jobs: [
          { name: 'one', agent: 'one', command: 'node scripts/launch.mjs', intervalSeconds: 60, retrySeconds: 10 },
        ],
      }));
      const result = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
