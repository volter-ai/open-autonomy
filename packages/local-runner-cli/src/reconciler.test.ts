import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backoffMsFor, start } from './reconciler.ts';
import { StubProc, ok } from './test-support/stub-proc.ts';
import { StubSessionRunner } from './test-support/stub-session-runner.ts';

function repo(schedule: object, withRunner = false): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oa-scheduler-')));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  if (withRunner) {
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), '{"name":"termfleet"}');
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'export {}');
  }
  return dir;
}

function procFor(dir: string): StubProc {
  return new StubProc().on(
    (cmd, args) => cmd === 'node' && args[0] === '--input-type=module',
    () => ok(pathToFileURL(join(dir, 'node_modules', 'termfleet', 'index.js')).href + '\n'),
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('generic substrate scheduler', () => {
  test('fires an arbitrary agent without task or PR eligibility probes', async () => {
    const dir = repo({ jobs: [{ name: 'arbitrary', command: 'AUTONOMY_AGENT=anything node scripts/run-agent.mjs', intervalSeconds: 60 }] }, true);
    try {
      const sessions = new StubSessionRunner();
      const stub = procFor(dir).on((cmd) => cmd.includes('run-agent.mjs'), () => ok(''));
      const stop = new AbortController();
      const running = start({ cwd: dir, proc: stub.runner, ambient: { TERMFLEET_PROVIDER_URL: 'http://pinned' }, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => sessions });
      await waitFor(() => stub.calls.some((call) => call.cmd.includes('run-agent.mjs')));
      stop.abort();
      await running;
      expect(stub.calls.some((call) => call.cmd === 'gh' || call.cmd === 'npx')).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a job fence blocks only that job and clearing it makes the due job fire', async () => {
    const dir = repo({ jobs: [
      { name: 'blocked', command: 'bun blocked.ts', intervalSeconds: 60, fence: '.blocked' },
      { name: 'open', command: 'bun open.ts', intervalSeconds: 60 },
    ] });
    try {
      writeFileSync(join(dir, '.blocked'), '');
      const stub = new StubProc().on(() => true, () => ok(''));
      const stop = new AbortController();
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitFor(() => stub.calls.some((call) => call.cmd === 'bun open.ts'));
      expect(stub.calls.some((call) => call.cmd === 'bun blocked.ts')).toBe(false);
      unlinkSync(join(dir, '.blocked'));
      await waitFor(() => stub.calls.some((call) => call.cmd === 'bun blocked.ts'));
      stop.abort();
      await running;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('the global pause fence blocks every generic job independently of job-specific fences', async () => {
    const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'operator fence\n');
      const stub = new StubProc().on(() => true, () => ok(''));
      const stop = new AbortController();
      let beats = 0;
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => { beats += 1; } });
      await waitFor(() => beats >= 3);
      expect(stub.calls.some((call) => call.cmd === 'bun maintenance.ts')).toBe(false);
      unlinkSync(join(dir, '.open-autonomy', 'paused'));
      await waitFor(() => stub.calls.some((call) => call.cmd === 'bun maintenance.ts'));
      stop.abort();
      await running;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('maxConcurrent is generic backpressure across agent identities', async () => {
    const dir = repo({ maxConcurrent: 1, jobs: [
      { name: 'one', command: 'AUTONOMY_AGENT=one node scripts/run-agent.mjs', intervalSeconds: 60 },
      { name: 'two', command: 'AUTONOMY_AGENT=two node scripts/run-agent.mjs', intervalSeconds: 60 },
    ] }, true);
    try {
      const sessions = new StubSessionRunner();
      sessions.addSession({ id: 'existing', agent: 'one', status: 'running' });
      const stub = procFor(dir).on((cmd) => cmd.includes('run-agent.mjs'), () => ok(''));
      const stop = new AbortController();
      let beats = 0;
      const running = start({ cwd: dir, proc: stub.runner, ambient: { TERMFLEET_PROVIDER_URL: 'http://pinned' }, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => sessions, onHeartbeat: () => { beats += 1; } });
      await waitFor(() => beats >= 3);
      expect(stub.calls.some((call) => call.cmd.includes('run-agent.mjs'))).toBe(false);
      sessions.endSession('existing');
      await waitFor(() => stub.calls.some((call) => call.cmd.includes('run-agent.mjs')));
      expect(stub.calls.filter((call) => call.cmd.includes('run-agent.mjs'))).toHaveLength(1);
      stop.abort();
      await running;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a failed command retries on retrySeconds rather than its normal cadence', async () => {
    const dir = repo({ jobs: [{ name: 'retry', command: 'bun retry.ts', intervalSeconds: 3600, retrySeconds: 0.03 }] });
    try {
      let attempts = 0;
      const stub = new StubProc().onArgs('bun retry.ts', [], () => ({ status: ++attempts === 1 ? 1 : 0, stdout: '', stderr: '' }));
      const stop = new AbortController();
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 10, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitFor(() => attempts >= 2);
      stop.abort();
      await running;
      expect(attempts).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('repeated launch failures receive generic exponential backoff', async () => {
    const dir = repo({ jobs: [{ name: 'unstable', command: 'bun unstable.ts', intervalSeconds: 3600, retrySeconds: 0.01 }] });
    try {
      let attempts = 0;
      const stub = new StubProc().onArgs('bun unstable.ts', [], () => ({ status: ++attempts < 4 ? 1 : 0, stdout: '', stderr: '' }));
      const stop = new AbortController();
      const started = Date.now();
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 10, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitFor(() => attempts >= 4, 3000);
      const elapsed = Date.now() - started;
      stop.abort();
      await running;
      expect(elapsed).toBeGreaterThanOrEqual(900);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('backoff escalates generically after repeated fast deaths', () => {
  expect(backoffMsFor(2, 100)).toBe(0);
  expect(backoffMsFor(3, 1000)).toBe(2000);
  expect(backoffMsFor(4, 1000)).toBe(4000);
});
