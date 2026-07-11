// The reconciler is the S6/T6 heartbeat — tested via `start()` driven with a short pollMs, real timers
// (matching the house convention: substrate-local's pause-gate.test.ts drives the real emitted run.mjs
// with AUTONOMY_REAP_POLL_MS this same way), an AbortController to stop it deterministically, and stub
// proc/session-runner seams (never a real gh/ztrack/termfleet call).
//
// start() now runs the FULL preflight guard chain (termfleet / OA-04 / OA-09 / OA-03) before the
// heartbeat, exactly like run.mjs did top-level — so every fixture installs a minimal fake termfleet
// package (satisfies the existsSync check) and every stub registers the OA-04 `node import.meta.resolve`
// probe handler (returns a URL inside the fixture's own node_modules/termfleet, i.e. "no collision").
// OA-09 is pinned via an explicit ambient TERMFLEET_PROVIDER_URL so resolution never leaves the fast path.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backoffMsFor, start } from './reconciler.ts';
import { pause, resume } from './pause.ts';
import { readLastFires } from './status.ts';
import { StubProc, ok } from './test-support/stub-proc.ts';
import { StubSessionRunner } from './test-support/stub-session-runner.ts';

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-reconciler-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  // Minimal fake termfleet so the preflight's existsSync check passes (schedules here all use
  // run-agent.mjs, so needsRunner is true).
  mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
  writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
  return dir;
}

/** OA-09 fast-path pin (never reaches discovery) — also what the origin-export assertions read back. */
function pinnedAmbient(): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7999' };
}

/** Register the OA-04 dep-integrity probe handler on a stub: the preflight spawns
 *  `node --input-type=module -e "…import.meta.resolve…" <spec>` per installed RUNNER_SPEC — answer with a
 *  URL INSIDE the fixture's node_modules/termfleet (a clean, collision-free resolution). */
function withDepProbe(stub: StubProc): StubProc {
  return stub.on(
    (c, a) => c === 'node' && a[0] === '--input-type=module',
    (_c, _a, calls) => {
      const cwd = calls[calls.length - 1]!.cwd!;
      return ok(pathToFileURL(join(cwd, 'node_modules', 'termfleet', 'i.js')).href + '\n');
    },
  );
}

function eligibleAlwaysProc(): StubProc {
  return withDepProbe(
    new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok(JSON.stringify([{ number: 1, labels: [{ name: 'ready' }] }])))
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
      .onArgs('gh', ['pr', 'list'], () => ok('[]')),
  );
}
function neverEligibleProc(): StubProc {
  return withDepProbe(
    new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok('[]'))
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'))
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'in-progress'], () => ok('[]'))
      .onArgs('gh', ['pr', 'list'], () => ok('[]')),
  );
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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

// D2 (post-review, TC.3): the reconciler's own automatic heartbeat is the ONE place a fire should ever be
// tagged AUTONOMY_TRIGGER_KIND=cron — a launched skill (e.g. a low-frequency cron-throttled audit) needs a
// signal that is true ONLY on this automatic fire, never on `oa dispatch <agent>` (dispatch.test.ts proves
// that verb tags 'dispatch' instead, even though it fires the identical schedule-line string).
describe('reconciler — D2: the automatic heartbeat tags every fire AUTONOMY_TRIGGER_KIND=cron', () => {
  test('a reconciled (state-gated) automatic fire carries AUTONOMY_TRIGGER_KIND=cron', async () => {
    // "manager" carries a proven default eligibility variant (S6/T6 — config.ts); the tag being asserted
    // here is generic to every reconciled agent, so no agent-specific eligibility config is needed.
    const dir = tmpRepo({ scripts: [{ cmd: 'AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 3600 }] });
    try {
      const stub = eligibleAlwaysProc().on((c) => c.includes('run-agent.mjs'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('run-agent.mjs')));
      ac.abort();
      await p;
      const fire = stub.calls.find((c) => c.cmd.includes('run-agent.mjs'));
      expect(fire?.env?.AUTONOMY_TRIGGER_KIND).toBe('cron');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a non-reconciled (self-throttling) automatic fire ALSO carries AUTONOMY_TRIGGER_KIND=cron', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'bun scripts/sweep.ts', reconciled: false, intervalSeconds: 0 }] });
    try {
      const stub = new StubProc().on((c) => c.includes('sweep.ts'), () => ok(''));
      const ac = new AbortController();
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => new StubSessionRunner() });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('sweep.ts')));
      ac.abort();
      await p;
      const fire = stub.calls.find((c) => c.cmd.includes('sweep.ts'));
      expect(fire?.env?.AUTONOMY_TRIGGER_KIND).toBe('cron');
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
      const stub = withDepProbe(new StubProc())
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner });
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
      const stub = withDepProbe(new StubProc())
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
        .onArgs('gh', ['issue', 'list'], () => ok('[]'))
        .onArgs('gh', ['pr', 'list'], () => ok('[]'))
        .on((c) => c.includes('run-agent.mjs'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner });
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
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 25, sessionRunnerFactory: async () => sessionRunner, onHeartbeat: () => (heartbeats += 1) });
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

describe('start() preflight — the BLOCKER fix: the full run.mjs guard chain runs before the heartbeat', () => {
  test('termfleet missing (schedule needs the runner): start() throws BEFORE any heartbeat/eligibility work', async () => {
    // Build the repo WITHOUT the fake termfleet tmpRepo normally installs.
    const dir = mkdtempSync(join(tmpdir(), 'oa-reconciler-noflight-'));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 0, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] }));
    try {
      const stub = eligibleAlwaysProc();
      let heartbeats = 0;
      await expect(
        start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, pollMs: 30, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => (heartbeats += 1) }),
      ).rejects.toThrow(/termfleet/);
      expect(heartbeats).toBe(0); // never entered the loop
      expect(stub.calls.some((c) => c.cmd === 'gh' || c.cmd === 'npx')).toBe(false); // no eligibility probe ever ran
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('OA-04 collision (probe resolves OUTSIDE node_modules): start() refuses before the loop', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      // A probe answer that points INTO the repo tree (a self-reference) instead of node_modules.
      const stub = new StubProc().on(
        (c, a) => c === 'node' && a[0] === '--input-type=module',
        (_c, _a, calls) => ok(pathToFileURL(join(calls[calls.length - 1]!.cwd!, 'index.js')).href + '\n'),
      );
      await expect(
        start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, pollMs: 30, sessionRunnerFactory: async () => new StubSessionRunner() }),
      ).rejects.toThrow(/COLLISION/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('OA-09: the provider origin is logged + AUTONOMY_PROVIDER_URL_SOURCE lands in the ambient the tick env is built from', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const stub = neverEligibleProc();
      const ambient = pinnedAmbient(); // ambient pin -> source 'env'
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, ambient, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 1);
      ac.abort();
      await p;
      expect(ambient.AUTONOMY_PROVIDER_URL_SOURCE).toBe('env');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('OA-09 schedule-pin origin: no ambient pin + schedule.json env pin => source "schedule"', async () => {
    const dir = tmpRepo({
      intervalSeconds: 0,
      env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' },
      scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }],
    });
    try {
      const stub = neverEligibleProc();
      const ambient: NodeJS.ProcessEnv = { ...process.env };
      delete ambient.TERMFLEET_PROVIDER_URL; // ensure the sandbox's own pin can't shadow the schedule pin
      const ac = new AbortController();
      let heartbeats = 0;
      const p = start({ cwd: dir, ambient, proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => new StubSessionRunner(), onHeartbeat: () => (heartbeats += 1) });
      await waitUntil(() => heartbeats >= 1);
      ac.abort();
      await p;
      expect(ambient.AUTONOMY_PROVIDER_URL_SOURCE).toBe('schedule');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reconciler — fail-closed on an unreadable session probe (TEST GAP)', () => {
  test('probe totally unavailable (runner.list throws, CLI fallback absent): ZERO fires despite eligible work, loud fail-closed log', async () => {
    const dir = tmpRepo({ intervalSeconds: 0, scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const stub = eligibleAlwaysProc();
      // A runner whose list() always throws; the CLI fallback (`node scripts/autonomy-runner.mjs list`)
      // also fails in this bare fixture — listSessionsBestEffort returns null => fail CLOSED.
      const brokenRunner = {
        list: async (): Promise<never> => {
          throw new Error('probe down (simulated)');
        },
        reapIdle: async () => [],
      };
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
        origError(...args);
      };
      const ac = new AbortController();
      let heartbeats = 0;
      try {
        const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => brokenRunner, onHeartbeat: () => (heartbeats += 1) });
        await waitUntil(() => heartbeats >= 3);
        ac.abort();
        await p;
      } finally {
        console.error = origError;
      }
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(false); // 0 fires
      expect(readLastFires(dir)).toEqual([]);
      expect(errors.some((l) => l.includes('fail closed, never stack'))).toBe(true); // loud
      expect(stub.calls.some((c) => c.cmd === 'gh' || c.cmd === 'npx')).toBe(false); // eligibility never even probed (in-flight assumed)
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('backoffMsFor — the escalation curve (TEST GAP: 2x -> 4x -> 8x, cap)', () => {
  const MIN_GAP = 60_000;
  test('below 3 consecutive fast deaths: no backoff at all', () => {
    expect(backoffMsFor(0, MIN_GAP)).toBe(0);
    expect(backoffMsFor(1, MIN_GAP)).toBe(0);
    expect(backoffMsFor(2, MIN_GAP)).toBe(0);
  });
  test('engages at the 3rd fast death with 2x the min-gap, then doubles: 4x, 8x', () => {
    expect(backoffMsFor(3, MIN_GAP)).toBe(2 * MIN_GAP);
    expect(backoffMsFor(4, MIN_GAP)).toBe(4 * MIN_GAP);
    expect(backoffMsFor(5, MIN_GAP)).toBe(8 * MIN_GAP);
  });
  test('caps at 30 minutes regardless of death count or min-gap', () => {
    expect(backoffMsFor(20, MIN_GAP)).toBe(30 * 60 * 1000);
    expect(backoffMsFor(3, 60 * 60 * 1000)).toBe(30 * 60 * 1000); // even the FIRST engagement respects the cap
  });
});

describe('reconciler — healthy-lifetime reset (TEST GAP: a session outliving the fast-death window resets the count)', () => {
  test('2 fast deaths, then a healthy session: crash-loop count resets (logged) and firing continues without backoff', async () => {
    const dir = tmpRepo({ scripts: [{ cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true, intervalSeconds: 0 }] });
    try {
      const sessionRunner = new StubSessionRunner();
      let fireCount = 0;
      const stub = withDepProbe(
        new StubProc()
          .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1' }])))
          .onArgs('gh', ['pr', 'list'], () => ok('[]'))
          .on(
            (c) => c.includes('run-agent.mjs'),
            () => {
              fireCount += 1;
              const id = `s-${fireCount}`;
              sessionRunner.addSession({ id, agent: 'manager', status: 'running' });
              // Fires 1-2: die before the next heartbeat (~1000ms — the pollMs floor — which is < the
              // injected fastDeathMs=1500 => fast deaths). Fire 3: lives ~2600ms (> 1500) -> healthy -> reset.
              const lifetime = fireCount <= 2 ? 1 : 2600; // pollMs floors at 1000ms, so a fast death reads ~1000ms; healthy must outlive fastDeathMs=1500
              setTimeout(() => sessionRunner.endSession(id), lifetime);
              return ok('');
            },
          ),
      );
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
        origError(...args);
      };
      const ac = new AbortController();
      try {
        const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 25, fastDeathMs: 1500, sessionRunnerFactory: async () => sessionRunner });
        await waitUntil(() => fireCount >= 4, 12000); // a 4th fire happened AFTER the healthy 3rd -> no backoff blocked it
        ac.abort();
        await p;
      } finally {
        console.error = origError;
      }
      expect(errors.some((l) => l.includes('consecutive fast-deaths now 2'))).toBe(true); // the two fast deaths registered
      expect(errors.some((l) => l.includes('crash-loop count reset from 2'))).toBe(true); // the healthy session reset them
      expect(errors.some((l) => l.includes('CRASH-LOOP BACKOFF engaged'))).toBe(false); // backoff never engaged (count never hit 3)
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('reconciler — a LEGACY string[] schedule end-to-end through start() (TEST GAP)', () => {
  test('the exact supercode shape ({intervalSeconds, env, scripts: string[]}) default-reconciles the manager line, probes ztrack, and fires', async () => {
    const dir = tmpRepo({
      intervalSeconds: 0,
      env: {},
      scripts: ['AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs', 'bun scripts/sweep.ts'],
    });
    try {
      const stub = eligibleAlwaysProc()
        .on((c) => c.includes('run-agent.mjs'), () => ok(''))
        .on((c) => c.includes('sweep.ts'), () => ok(''));
      const sessionRunner = new StubSessionRunner();
      const ac = new AbortController();
      const p = start({ cwd: dir, ambient: pinnedAmbient(), proc: stub.runner, signal: ac.signal, pollMs: 30, sessionRunnerFactory: async () => sessionRunner });
      await waitUntil(() => stub.calls.some((c) => c.cmd.includes('run-agent.mjs')));
      ac.abort();
      await p;
      // manager default-reconciled -> ztrack probe ran, then the fire; sweep (non-reconciled) clock-fired too.
      expect(stub.calls.some((c) => c.cmd === 'npx' && c.args.includes('ztrack'))).toBe(true);
      expect(stub.calls.some((c) => c.cmd.includes('run-agent.mjs'))).toBe(true);
      expect(stub.calls.some((c) => c.cmd.includes('sweep.ts'))).toBe(true);
      expect(readLastFires(dir).map((f) => f.agent)).toEqual(['manager']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
