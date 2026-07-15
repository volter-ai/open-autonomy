import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backoffMsFor, markWorkspaceLeasesObserved, reconcilePendingEffects, reconcileWorkspaceLeases, start } from './reconciler.ts';
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
  test('constructs the lifecycle runner after exporting the schedule-pinned provider', async () => {
    const dir = repo({
      env: { TERMFLEET_PROVIDER_URL: 'http://schedule-pinned' },
      jobs: [{
        name: 'agent',
        command: 'AUTONOMY_AGENT=agent node scripts/run-agent.mjs',
        intervalSeconds: 60,
        fence: '.paused',
      }],
    }, true);
    try {
      writeFileSync(join(dir, '.paused'), 'paused\n');
      const ambient: NodeJS.ProcessEnv = {};
      const stop = new AbortController();
      let observed: { url?: string; source?: string } = {};
      await start({
        cwd: dir,
        proc: procFor(dir).runner,
        ambient,
        signal: stop.signal,
        sessionRunnerFactory: async () => {
          observed = {
            url: ambient.TERMFLEET_PROVIDER_URL,
            source: ambient.AUTONOMY_PROVIDER_URL_SOURCE,
          };
          stop.abort();
          return new StubSessionRunner();
        },
      });
      expect(observed).toEqual({ url: 'http://schedule-pinned', source: 'schedule' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

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

  test('job fences are independent: the conventional pause marker does not override another fence', async () => {
    const dir = repo({ jobs: [
      { name: 'ordinary', command: 'bun ordinary.ts', intervalSeconds: 60, fence: '.open-autonomy/paused' },
      { name: 'audit', command: 'bun audit.ts', intervalSeconds: 60, fence: '.open-autonomy/audits-paused' },
    ] });
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'operator fence\n');
      const stub = new StubProc().on(() => true, () => ok(''));
      const stop = new AbortController();
      let beats = 0;
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => { beats += 1; } });
      await waitFor(() => beats >= 3);
      expect(stub.calls.some((call) => call.cmd === 'bun ordinary.ts')).toBe(false);
      expect(stub.calls.some((call) => call.cmd === 'bun audit.ts')).toBe(true);
      unlinkSync(join(dir, '.open-autonomy', 'paused'));
      await waitFor(() => stub.calls.some((call) => call.cmd === 'bun ordinary.ts'));
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

  test('maxConcurrent session pressure does not suppress synchronous substrate jobs', async () => {
    const dir = repo({ maxConcurrent: 1, jobs: [
      { name: 'one', agent: 'one', command: 'AUTONOMY_AGENT=one node scripts/run-agent.mjs', intervalSeconds: 60 },
      { name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 },
    ] }, true);
    try {
      const sessions = new StubSessionRunner();
      sessions.addSession({ id: 'existing', agent: 'one', status: 'running' });
      const stub = procFor(dir).onArgs('bun maintenance.ts', [], () => ok(''));
      const stop = new AbortController();
      const running = start({ cwd: dir, proc: stub.runner, ambient: { TERMFLEET_PROVIDER_URL: 'http://pinned' }, signal: stop.signal, pollMs: 15, sessionRunnerFactory: async () => sessions });
      await waitFor(() => stub.calls.some((call) => call.cmd === 'bun maintenance.ts'));
      expect(stub.calls.some((call) => call.cmd.includes('run-agent.mjs'))).toBe(false);
      stop.abort();
      await running;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('successful cadence survives a scheduler restart instead of immediately refiring', async () => {
    const dir = repo({ jobs: [{ name: 'daily-audit', command: 'bun audit.ts', intervalSeconds: 86400 }] });
    try {
      const stub = new StubProc().onArgs('bun audit.ts', [], () => ok(''));
      const firstStop = new AbortController();
      const first = start({ cwd: dir, proc: stub.runner, signal: firstStop.signal, pollMs: 10, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitFor(() => stub.calls.filter((call) => call.cmd === 'bun audit.ts').length === 1);
      firstStop.abort();
      await first;

      let beats = 0;
      const secondStop = new AbortController();
      const second = start({ cwd: dir, proc: stub.runner, signal: secondStop.signal, pollMs: 10, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => { beats += 1; } });
      await waitFor(() => beats >= 3);
      secondStop.abort();
      await second;
      expect(stub.calls.filter((call) => call.cmd === 'bun audit.ts')).toHaveLength(1);
      expect(existsSync(join(dir, '.open-autonomy', 'runner-state', 'schedule-state.json'))).toBe(true);
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

  test('repeated launch failures engage generic exponential backoff without a hot fourth attempt', async () => {
    const dir = repo({ jobs: [{ name: 'unstable', command: 'bun unstable.ts', intervalSeconds: 3600, retrySeconds: 0.01 }] });
    try {
      let attempts = 0;
      const stub = new StubProc().onArgs('bun unstable.ts', [], () => ({ status: (++attempts, 1), stdout: '', stderr: '' }));
      const stop = new AbortController();
      const running = start({ cwd: dir, proc: stub.runner, signal: stop.signal, pollMs: 10, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitFor(() => attempts >= 3);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(attempts).toBe(3);
      stop.abort();
      await running;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('a failed post-session effect keeps its durable marker and retries until success', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const effectsDir = join(dir, '.open-autonomy', 'runner-state', 'effects');
    mkdirSync(effectsDir, { recursive: true });
    const marker = join(effectsDir, 'session-1.json');
    writeFileSync(marker, JSON.stringify({ id: 'session-1', agent: 'worker', effect: 'scripts/effect.ts', worktree: dir }));
    let succeeds = false;
    const proc = new StubProc().onArgs('bun', ['scripts/effect.ts'], () => ({ status: succeeds ? 0 : 1, stdout: '', stderr: '' }));
    const runner = new StubSessionRunner();

    await reconcilePendingEffects(dir, runner, proc.runner);
    expect(existsSync(marker)).toBe(true);
    succeeds = true;
    await reconcilePendingEffects(dir, runner, proc.runner);
    expect(existsSync(marker)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a completion effect waits while its fresh session lease is not yet observable', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const effectsDir = join(dir, '.open-autonomy', 'runner-state', 'effects');
    mkdirSync(effectsDir, { recursive: true });
    const marker = join(effectsDir, 'session-bootstrap.json');
    writeFileSync(marker, JSON.stringify({ id: 'session-bootstrap', agent: 'worker', effect: 'scripts/effect.ts', worktree: dir }));
    const lease = workspaceLease(dir, 'session-bootstrap', dir, new Date().toISOString());
    const proc = new StubProc().onArgs('bun', ['scripts/effect.ts'], () => ok(''));
    const runner = new StubSessionRunner();

    await reconcilePendingEffects(dir, runner, proc.runner);
    expect(existsSync(marker)).toBe(true);
    expect(proc.calls).toHaveLength(0);

    const observed = JSON.parse(readFileSync(lease, 'utf8'));
    observed.observedLiveAt = new Date().toISOString();
    writeFileSync(lease, JSON.stringify(observed));
    await reconcilePendingEffects(dir, runner, proc.runner);
    expect(existsSync(marker)).toBe(false);
    expect(proc.calls.some((call) => call.cmd === 'bun')).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a reaped session is persisted as observed so its ready effect does not wait out bootstrap grace', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const effectsDir = join(dir, '.open-autonomy', 'runner-state', 'effects');
    mkdirSync(effectsDir, { recursive: true });
    const marker = join(effectsDir, 'session-reaped.json');
    writeFileSync(marker, JSON.stringify({ id: 'session-reaped', agent: 'worker', effect: 'scripts/effect.ts', worktree: dir }));
    const lease = workspaceLease(dir, 'session-reaped', dir, new Date().toISOString());
    const proc = new StubProc().onArgs('bun', ['scripts/effect.ts'], () => ok(''));

    markWorkspaceLeasesObserved(dir, ['session-reaped']);
    expect(JSON.parse(readFileSync(lease, 'utf8')).observedLiveAt).toBeTruthy();
    await reconcilePendingEffects(dir, new StubSessionRunner(), proc.runner);
    expect(existsSync(marker)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function workspaceLease(dir: string, id: string, worktree: string, createdAt = '1970-01-01T00:00:00.000Z'): string {
  const leases = join(dir, '.open-autonomy', 'runner-state', 'workspaces');
  mkdirSync(leases, { recursive: true });
  const path = join(leases, `${id}.json`);
  writeFileSync(path, JSON.stringify({
    schema: 'open-autonomy.workspace-lease.v1',
    id,
    agent: 'planner',
    branch: `agent/planner/${id}`,
    worktree,
    createdAt,
  }));
  return path;
}

test('a finished clean isolated workspace is removed with its branch and lease', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const worktree = join(dir, '.worktrees', 'planner-clean');
    mkdirSync(worktree, { recursive: true });
    const lease = workspaceLease(dir, 'session-clean', worktree);
    const proc = new StubProc()
      .onArgs('git', ['status', '--porcelain'], () => ok(''))
      .onArgs('git', ['worktree', 'remove'], () => ok())
      .onArgs('git', ['branch', '-D'], () => ok());
    await reconcileWorkspaceLeases(dir, new StubSessionRunner(), proc.runner);
    expect(existsSync(lease)).toBe(false);
    expect(proc.calls.some((call) => call.args[0] === 'worktree' && call.args[1] === 'remove')).toBe(true);
    expect(proc.calls.some((call) => call.args[0] === 'branch' && call.args[1] === '-D')).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a finished dirty workspace is retained and receives a durable quarantine receipt', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const worktree = join(dir, '.worktrees', 'planner-dirty');
    mkdirSync(worktree, { recursive: true });
    const lease = workspaceLease(dir, 'session-dirty', worktree);
    const proc = new StubProc().onArgs('git', ['status', '--porcelain'], () => ok(' M important.txt\n'));
    await reconcileWorkspaceLeases(dir, new StubSessionRunner(), proc.runner);
    expect(existsSync(lease)).toBe(false);
    expect(existsSync(worktree)).toBe(true);
    const receipt = join(dir, '.open-autonomy', 'runner-state', 'workspace-quarantine', 'session-dirty.json');
    expect(existsSync(receipt)).toBe(true);
    await expect(Bun.file(receipt).text()).resolves.toContain('uncommitted changes');
    expect(proc.calls.some((call) => call.args[0] === 'worktree')).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live sessions and pending completion effects fence workspace cleanup', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const liveWorktree = join(dir, '.worktrees', 'planner-live');
    const effectWorktree = join(dir, '.worktrees', 'planner-effect');
    mkdirSync(liveWorktree, { recursive: true });
    mkdirSync(effectWorktree, { recursive: true });
    const liveLease = workspaceLease(dir, 'session-live', liveWorktree);
    const effectLease = workspaceLease(dir, 'session-effect', effectWorktree);
    const effects = join(dir, '.open-autonomy', 'runner-state', 'effects');
    mkdirSync(effects, { recursive: true });
    writeFileSync(join(effects, 'session-effect.json'), '{}');
    const runner = new StubSessionRunner();
    runner.addSession({ id: 'session-live', agent: 'planner', status: 'running' });
    const proc = new StubProc();
    await reconcileWorkspaceLeases(dir, runner, proc.runner);
    expect(existsSync(liveLease)).toBe(true);
    expect(existsSync(effectLease)).toBe(true);
    expect(proc.calls).toHaveLength(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a fresh lease absent from list is protected during provider bootstrap lag', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const worktree = join(dir, '.worktrees', 'planner-bootstrapping');
    mkdirSync(worktree, { recursive: true });
    const lease = workspaceLease(dir, 'session-bootstrapping', worktree, new Date().toISOString());
    const proc = new StubProc();
    await reconcileWorkspaceLeases(dir, new StubSessionRunner(), proc.runner);
    expect(existsSync(lease)).toBe(true);
    expect(proc.calls).toHaveLength(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an observed lease reconciles immediately after its session disappears', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const worktree = join(dir, '.worktrees', 'planner-observed');
    mkdirSync(worktree, { recursive: true });
    const lease = workspaceLease(dir, 'session-observed', worktree, new Date().toISOString());
    const runner = new StubSessionRunner();
    runner.addSession({ id: 'session-observed', agent: 'planner', status: 'running' });
    const proc = new StubProc()
      .onArgs('git', ['status', '--porcelain'], () => ok(''))
      .onArgs('git', ['worktree', 'remove'], () => ok())
      .onArgs('git', ['branch', '-D'], () => ok());

    await reconcileWorkspaceLeases(dir, runner, proc.runner);
    expect(JSON.parse(readFileSync(lease, 'utf8')).observedLiveAt).toBeString();
    runner.endSession('session-observed');
    await reconcileWorkspaceLeases(dir, runner, proc.runner);
    expect(existsSync(lease)).toBe(false);
    expect(proc.calls.some((call) => call.args[0] === 'worktree' && call.args[1] === 'remove')).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a shared worktree waits for every session lease before cleanup', async () => {
  const dir = repo({ jobs: [{ name: 'maintenance', command: 'bun maintenance.ts', intervalSeconds: 60 }] });
  try {
    const worktree = join(dir, '.worktrees', 'shared-review');
    mkdirSync(worktree, { recursive: true });
    const developerLease = workspaceLease(dir, 'session-developer', worktree);
    const reviewerLease = workspaceLease(dir, 'session-reviewer', worktree);
    const runner = new StubSessionRunner();
    runner.addSession({ id: 'session-reviewer', agent: 'reviewer', status: 'running' });
    const proc = new StubProc()
      .onArgs('git', ['status', '--porcelain'], () => ok(''))
      .onArgs('git', ['worktree', 'remove'], () => ok())
      .onArgs('git', ['branch', '-D'], () => ok());
    await reconcileWorkspaceLeases(dir, runner, proc.runner);
    expect(existsSync(developerLease)).toBe(true);
    expect(existsSync(reviewerLease)).toBe(true);
    expect(proc.calls).toHaveLength(0);

    runner.endSession('session-reviewer');
    await reconcileWorkspaceLeases(dir, runner, proc.runner);
    expect(existsSync(developerLease)).toBe(false);
    expect(existsSync(reviewerLease)).toBe(false);
    expect(proc.calls.filter((call) => call.args[0] === 'worktree')).toHaveLength(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('backoff escalates generically after repeated fast deaths', () => {
  expect(backoffMsFor(2, 100)).toBe(0);
  expect(backoffMsFor(3, 1000)).toBe(2000);
  expect(backoffMsFor(4, 1000)).toBe(4000);
});
