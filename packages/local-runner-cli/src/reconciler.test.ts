// The reconciler is the S6/T6 heartbeat — tested via `start()` driven with a short pollMs, real timers
// (matching the house convention: substrate-local's pause-gate.test.ts drives the real emitted run.mjs
// with AUTONOMY_REAP_POLL_MS this same way), an AbortController to stop it deterministically, and stub
// proc/session-runner seams (never a real gh/ztrack/termfleet call).
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from './reconciler.ts';
import { pause, resume } from './pause.ts';
import { readLastFires } from './status.ts';
import { StubProc, ok } from './test-support/stub-proc.ts';
import { StubSessionRunner } from './test-support/stub-session-runner.ts';

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-reconciler-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  return dir;
}

function eligibleAlwaysProc(): StubProc {
  return new StubProc()
    .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }] }])))
    .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
    .onArgs('gh', ['pr', 'list'], () => ok('[]'));
}
function neverEligibleProc(): StubProc {
  return new StubProc()
    .onArgs('gh', ['issue', 'list'], () => ok('[]'))
    .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'))
    .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'in-progress'], () => ok('[]'))
    .onArgs('gh', ['pr', 'list'], () => ok('[]'));
}

async function waitUntil(pred: () => boolean, timeoutMs = 4000, stepMs = 20): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitUntil: timed out');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

describe('reconciler — state-gated fire (paused / in-flight / eligibility)', () => {
  test('paused: never fires even when eligible and no session in flight', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      pause({ cwd: dir });
      const stub = eligibleAlwaysProc();
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 3);
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false);
      expect(readLastFires(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('not eligible: never fires even when unpaused and no session in flight', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const stub = neverEligibleProc();
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 3);
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a session already in flight: never fires a second one (the singleton holds)', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const stub = eligibleAlwaysProc();
      const sessionRunner = new StubSessionRunner();
      sessionRunner.addSession({ id: 's-live', agent: 'manager', status: 'running' });
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 3);
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unpaused + eligible + no session in flight: fires exactly once, then respects the min-gap floor (does not refire while still eligible)', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 3600 }] }); // huge min-gap
    try {
      const stub = eligibleAlwaysProc().on((c) => c.includes('run-agent.mjs'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('run-agent.mjs')));
      await waitUntil(() => heartbeats >= 5); // let several more heartbeats pass
      ac.abort();
      await p;
      const fires = stub.calls.filter((c) => c.cmd.includes('run-agent.mjs'));
      expect(fires).toHaveLength(1); // min-gap floor (3600s) prevents a second fire within the test window
      expect(readLastFires(dir)).toHaveLength(1);
      expect(readLastFires(dir)[0]!.agent).toBe('manager');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('drain-not-kill: an in-flight session is left alone across a pause; death bookkeeping still runs (backoff state is not lost)', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const stub = eligibleAlwaysProc();
      const sessionRunner = new StubSessionRunner();
      sessionRunner.addSession({ id: 's-inflight', agent: 'manager', status: 'running' });
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 2);
      pause({ cwd: dir }); // pause while a session is in flight
      await waitUntil(() => heartbeats >= 5);
      // the session is still tracked as "in flight" by the stub (never ended) — no fire attempted, no crash.
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reconciler — crash-loop backoff', () => {
  test('3 consecutive fast deaths (< 60s lifetime) engage backoff; no further fire happens inside the backoff window', async () => {
    // min-gap 100ms -> backoffMsFor(3 deaths, 100ms) = min(100*2, cap) = 200ms, giving a comfortable
    // window to observe "no fire" after the 3rd death without the test itself becoming slow.
    const dir = tmpRepo({ scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0.1 }] });
    try {
      const sessionRunner = new StubSessionRunner();
      let fireCount = 0;
      // Every fire immediately registers-then-ends a session, so the reconciler reads it as a fast death
      // (< 60s lifetime) on its very next heartbeat — a real termfleet session that crash-loops on launch.
      const stub = new StubProc()
        .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }] }])))
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
        .onArgs('gh', ['pr', 'list'], () => ok('[]'))
        .on(
          (c) => c.includes('run-agent.mjs'),
          () => {
            fireCount += 1;
            const id = `s-${fireCount}`;
            sessionRunner.addSession({ id, agent: 'manager', status: 'running' });
            setTimeout(() => sessionRunner.endSession(id), 1);
            return ok('');
          },
        );
      const ac = new AbortController();
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner });
      await waitUntil(() => fireCount >= 3, 6000);
      const firesAtThreeDeaths = fireCount;
      await new Promise((r) => setTimeout(r, 100)); // well inside the ~200ms backoff window
      const firesAfterSettle = fireCount;
      ac.abort();
      await p;
      expect(firesAtThreeDeaths).toBeGreaterThanOrEqual(3);
      expect(firesAfterSettle).toBe(firesAtThreeDeaths); // backoff held — no fire snuck through
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);
});

describe('reconciler — per-agent independence (U4 generalization over S6/T6 shared state)', () => {
  test('two reconciled scripts with DIFFERENT eligibility get independent verdicts and independent fires', async () => {
    const dir = tmpRepo({
      scripts: [
        { cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, eligibility: 'ztrack', intervalSeconds: 0 },
        { cmd: 'AUTONOMY_AGENT=pm node scripts/run-agent.mjs', reconciled: true, eligibility: 'gh-issues', intervalSeconds: 3600 },
      ],
    });
    try {
      // manager (ztrack) has ready work; pm (gh-issues) does not.
      const stub = new StubProc()
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
        .onArgs('gh', ['issue', 'list'], () => ok('[]'))
        .onArgs('gh', ['pr', 'list'], () => ok('[]'))
        .on((c) => c.includes('run-agent.mjs'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('AUTONOMY_AGENT=manager')));
      await new Promise((r) => setTimeout(r, 120));
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('AUTONOMY_AGENT=manager'))).toBe(true);
      expect(stub.calls.some((c) => c.cmd.includes('AUTONOMY_AGENT=pm'))).toBe(false); // pm never became eligible
      const fires = readLastFires(dir);
      expect(fires.map((f) => f.agent).sort()).toEqual(['manager']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reconciler — unreconciled scripts keep the old clock-gated cadence', () => {
  test('a non-reconciled script fires on its own min-gap regardless of pause (advances even while paused, matching pre-U4 behavior) but is NOT fired while paused', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'bun scripts/sweep.ts', reconciled: false, intervalSeconds: 0 }] });
    try {
      pause({ cwd: dir });
      const stub = new StubProc().on((c) => c.includes('sweep.ts'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 4);
      ac.abort();
      await p;
      expect(stub.calls.some((c) => c.cmd.includes('sweep.ts'))).toBe(false); // paused -> not fired
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unpaused: a non-reconciled script fires on its min-gap with no eligibility probe at all', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'bun scripts/sweep.ts', reconciled: false, intervalSeconds: 0 }] });
    try {
      const stub = new StubProc().on((c) => c.includes('sweep.ts'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('sweep.ts')));
      ac.abort();
      await p;
      expect(stub.calls.every((c) => !c.cmd.includes('ztrack') && !c.cmd.includes('gh '))).toBe(true); // no eligibility probes for a non-reconciled script
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reconciler — resume re-arms within one heartbeat (bounded resurrection latency, II.6.3)', () => {
  test('unpausing mid-run lets an eligible reconciled script fire on the very next heartbeat, not a stale interval', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 3600 }] });
    try {
      pause({ cwd: dir });
      const stub = eligibleAlwaysProc().on((c) => c.includes('run-agent.mjs'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 2);
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false);
      resume({ cwd: dir });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('run-agent.mjs')));
      ac.abort();
      await p;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
