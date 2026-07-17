import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function emittedRunnerFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-session-env-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts', 'autonomy-runner.mjs'), `
    export class TermfleetRunner {
      constructor({ env = process.env } = {}) { this.env = env; }
      async list() { return [{ id: this.env.TERMFLEET_PROVIDER_URL, agent: 'fixture', status: 'running' }]; }
      async reapIdle() { return []; }
    }
    if (process.argv[2] === 'list') console.log(JSON.stringify([
      { id: process.env.TERMFLEET_PROVIDER_URL, agent: 'fallback', status: 'running' },
    ]));
  `);
  return root;
}

describe('generation-scoped session runner environment', () => {
  test('two runner instances retain distinct provider environments without mutating process.env', async () => {
    const root = emittedRunnerFixture();
    const saved = process.env.TERMFLEET_PROVIDER_URL;
    try {
      process.env.TERMFLEET_PROVIDER_URL = 'http://foreign-global.test';
      const a = await defaultSessionRunner(root, { TERMFLEET_PROVIDER_URL: 'http://generation-a.test' });
      const b = await defaultSessionRunner(root, { TERMFLEET_PROVIDER_URL: 'http://generation-b.test' });
      expect(await Promise.all([a!.list(), b!.list()])).toEqual([
        [{ id: 'http://generation-a.test', agent: 'fixture', status: 'running' }],
        [{ id: 'http://generation-b.test', agent: 'fixture', status: 'running' }],
      ]);
      expect(process.env.TERMFLEET_PROVIDER_URL).toBe('http://foreign-global.test');
    } finally {
      if (saved === undefined) delete process.env.TERMFLEET_PROVIDER_URL;
      else process.env.TERMFLEET_PROVIDER_URL = saved;
    }
  });

  test('the subprocess fallback inherits the same explicit generation environment', async () => {
    const root = emittedRunnerFixture();
    const sessions = await listSessionsBestEffort(root, null, { TERMFLEET_PROVIDER_URL: 'http://fallback-generation.test', PATH: process.env.PATH });
    expect(sessions).toEqual([{ id: 'http://fallback-generation.test', agent: 'fallback', status: 'running' }]);
  });
});
