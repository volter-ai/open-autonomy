import { describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_FORBIDDEN_PORTS,
  bringUpProvider,
  derivePortSeed,
  isTermfleetConsoleBody,
  isTermfleetProviderBody,
  pickProviderPorts,
  pinScheduleProviderUrl,
  planBringUpProvider,
  providerDown,
  providerStatus,
  readSchedulePin,
  verifyProviderIdentity,
} from './provider.ts';
import type { SpawnImpl, SpawnedProcess } from './provider.ts';

function tmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-provider-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), `${JSON.stringify({ intervalSeconds: 900, env: {}, scripts: ['bun scripts/sweep.ts'] }, null, 2)}\n`);
  return dir;
}

const fakeSpawn = (): SpawnedProcess => ({ pid: 4242, unref: () => {} });

const GENERIC_HEALTHY = { ok: true, service: 'console', provider: 'virtual-tmux', instanceId: 'generic' };

/** Build a stub `fetch` that answers /healthz generically-healthy for everything, except any URL present
 *  in `overrides` (keyed by exact "http://127.0.0.1:<port>/healthz"), and treats absence from `unreachable`
 *  handling below as a hard connection-refused. `live` lets a test flip a port's reachability mid-run to
 *  simulate a process dying/restarting. */
function stubFetch(opts: { overrides?: Map<string, unknown>; dead?: Set<string> } = {}): typeof fetch {
  const overrides = opts.overrides ?? new Map();
  const dead = opts.dead ?? new Set();
  return (async (url: unknown) => {
    const u = String(url);
    if (dead.has(u)) throw new Error('connect ECONNREFUSED 127.0.0.1');
    const body = overrides.has(u) ? overrides.get(u) : GENERIC_HEALTHY;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('derivePortSeed', () => {
  test('deterministic for the same path', () => {
    expect(derivePortSeed('/a/b/c')).toBe(derivePortSeed('/a/b/c'));
  });
  test('differs (almost certainly) for different paths', () => {
    expect(derivePortSeed('/a/b/c')).not.toBe(derivePortSeed('/x/y/z'));
  });
});

describe('pickProviderPorts', () => {
  test('same repo path -> same ports, deterministically, when nothing is occupied', async () => {
    const a = await pickProviderPorts({ repoPath: '/workspace/build-tg1', isPortFree: () => true });
    const b = await pickProviderPorts({ repoPath: '/workspace/build-tg1', isPortFree: () => true });
    expect(a).toEqual(b);
  });

  test('different repo paths yield different candidate pairs', async () => {
    const a = await pickProviderPorts({ repoPath: '/workspace/build-tg1', isPortFree: () => true });
    const b = await pickProviderPorts({ repoPath: '/workspace/some-other-repo', isPortFree: () => true });
    expect(a).not.toEqual(b);
  });

  test('never returns a pair touching the default box-wide ports', async () => {
    for (const repoPath of ['/a', '/b/c', '/very/different/path/xyz', 'x'.repeat(50), '/workspace/build-tg1']) {
      const pair = await pickProviderPorts({ repoPath, isPortFree: () => true });
      expect(DEFAULT_FORBIDDEN_PORTS).not.toContain(pair.consolePort);
      expect(DEFAULT_FORBIDDEN_PORTS).not.toContain(pair.providerPort);
    }
  });

  test('collision-probe: advances past an occupied candidate to the next free pair', async () => {
    const first = await pickProviderPorts({ repoPath: '/probe-me', rangeStart: 20000, rangeEnd: 20100, isPortFree: () => true });
    const busy = new Set([first.consolePort, first.providerPort]);
    const second = await pickProviderPorts({
      repoPath: '/probe-me',
      rangeStart: 20000,
      rangeEnd: 20100,
      isPortFree: (p) => !busy.has(p),
    });
    expect(second).not.toEqual(first);
    expect(busy.has(second.consolePort)).toBe(false);
    expect(busy.has(second.providerPort)).toBe(false);
  });

  test('a custom forbidden set is respected regardless of the repo-derived seed', async () => {
    // span=3 (rangeStart=100, rangeEnd=103 -> consolePort candidates 100,101,102); forbidding 100 and 101
    // leaves exactly one viable pair (102,103) -- the seed's start offset doesn't matter because the
    // linear probe visits all 3 residues mod 3 within maxAttempts=span+1.
    for (const repoPath of ['/a', '/b/c', '/very/different/path/xyz', 'y'.repeat(37)]) {
      const pair = await pickProviderPorts({ repoPath, rangeStart: 100, rangeEnd: 103, forbidden: [100, 101], isPortFree: () => true });
      expect(pair).toEqual({ consolePort: 102, providerPort: 103 });
    }
  });

  test('throws a clear error when every candidate is occupied', async () => {
    await expect(pickProviderPorts({ repoPath: '/x', rangeStart: 100, rangeEnd: 103, isPortFree: () => false })).rejects.toThrow(/exhausted/);
  });
});

describe('identity classifiers', () => {
  test('isTermfleetConsoleBody', () => {
    expect(isTermfleetConsoleBody({ ok: true, service: 'console' })).toBe(true);
    expect(isTermfleetConsoleBody({ ok: true, service: 'something-else' })).toBe(false);
    expect(isTermfleetConsoleBody({ ok: false, service: 'console' })).toBe(false);
    expect(isTermfleetConsoleBody(null)).toBe(false);
    expect(isTermfleetConsoleBody('not an object')).toBe(false);
  });
  test('isTermfleetProviderBody', () => {
    expect(isTermfleetProviderBody({ ok: true, provider: 'virtual-tmux' })).toBe(true);
    expect(isTermfleetProviderBody({ ok: true, provider: '' })).toBe(false);
    expect(isTermfleetProviderBody({ ok: true })).toBe(false);
    expect(isTermfleetProviderBody({ ok: false, provider: 'virtual-tmux' })).toBe(false);
    expect(isTermfleetProviderBody(undefined)).toBe(false);
  });
});

describe('pinScheduleProviderUrl / readSchedulePin', () => {
  test('round-trips and preserves the legacy scripts:string[] shape', () => {
    const dir = tmpRepo();
    try {
      pinScheduleProviderUrl(dir, 'http://127.0.0.1:41234');
      expect(readSchedulePin(dir)).toBe('http://127.0.0.1:41234');
      const raw = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8'));
      expect(raw.scripts).toEqual(['bun scripts/sweep.ts']);
      expect(raw.intervalSeconds).toBe(900);
      expect(raw.env.TERMFLEET_PROVIDER_URL).toBe('http://127.0.0.1:41234');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves the new per-script object shape and other env keys', () => {
    const dir = tmpRepo();
    try {
      writeFileSync(
        join(dir, 'scheduler', 'schedule.json'),
        JSON.stringify({ env: { SOME_OTHER_VAR: 'x' }, scripts: [{ cmd: 'AUTONOMY_AGENT=pm node scripts/run-agent.mjs', reconciled: true, eligibility: 'gh-issues' }] }),
      );
      pinScheduleProviderUrl(dir, 'http://127.0.0.1:55555');
      const raw = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8'));
      expect(raw.env).toEqual({ SOME_OTHER_VAR: 'x', TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:55555' });
      expect(raw.scripts).toEqual([{ cmd: 'AUTONOMY_AGENT=pm node scripts/run-agent.mjs', reconciled: true, eligibility: 'gh-issues' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('readSchedulePin returns undefined when no file / no pin / malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-provider-nopin-'));
    try {
      expect(readSchedulePin(dir)).toBeUndefined(); // no scheduler/ dir at all
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), '{ not json');
      expect(readSchedulePin(dir)).toBeUndefined(); // malformed
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ env: {}, scripts: [] }));
      expect(readSchedulePin(dir)).toBeUndefined(); // no pin set
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pinScheduleProviderUrl refuses when the install has no scheduler/schedule.json at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-provider-uncompiled-'));
    try {
      expect(() => pinScheduleProviderUrl(dir, 'http://127.0.0.1:1')).toThrow(/does not exist/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =========================================================================================================
// planBringUpProvider — the --dry-run seam. THE critical leg of the whole install --dry-run flag: a real
// termfleet bring-up is itself half of the near-miss hazard this program's remediation wave exists to close.
// `spawnImpl`/`kill` below both THROW if ever invoked — a passing test is the proof this function never
// spawns or kills a real process, under any of the three decision branches.
// =========================================================================================================

describe('planBringUpProvider', () => {
  const poisonSpawn: SpawnImpl = () => {
    throw new Error('planBringUpProvider must NEVER spawn a real process');
  };
  const poisonKill = () => {
    throw new Error('planBringUpProvider must NEVER kill a real process');
  };

  test('fresh install (no state recorded) -> would-start, with the SAME deterministic ports pickProviderPorts would pick; never pins/writes anything', async () => {
    const dir = tmpRepo();
    try {
      const expected = await pickProviderPorts({ repoPath: dir, isPortFree: () => true, rangeStart: 42000, rangeEnd: 42100 });
      const plan = await planBringUpProvider({ cwd: dir, isPortFree: () => true, spawnImpl: poisonSpawn, kill: poisonKill, rangeStart: 42000, rangeEnd: 42100 });
      expect(plan.action).toBe('would-start');
      expect(plan.consolePort).toBe(expected.consolePort);
      expect(plan.providerPort).toBe(expected.providerPort);
      expect(plan.consoleUrl).toBe(`http://127.0.0.1:${expected.consolePort}`);
      expect(plan.providerUrl).toBe(`http://127.0.0.1:${expected.providerPort}`);
      expect(plan.detail).toMatch(/\[DRY-RUN\]/);
      expect(plan.detail).toMatch(/NOT spawned, NOT pinned/);
      // never wrote a pin — schedule.json's env is untouched (no TERMFLEET_PROVIDER_URL key at all).
      expect(readSchedulePin(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('existing HEALTHY pinned state -> would-noop; the identity probe is a non-mutating HTTP GET, never a spawn', async () => {
    const dir = tmpRepo();
    try {
      const overrides = new Map<string, unknown>([
        ['http://127.0.0.1:42200/healthz', { ok: true, service: 'console' }],
        ['http://127.0.0.1:42201/healthz', { ok: true, provider: 'virtual-tmux', instanceId: 'abc' }],
      ]);
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'provider'), { recursive: true });
      writeFileSync(
        join(dir, '.open-autonomy', 'runner-state', 'provider', 'state.json'),
        JSON.stringify({ repoPath: dir, prefix: 'x-oa', consolePort: 42200, providerPort: 42201, consoleUrl: 'http://127.0.0.1:42200', providerUrl: 'http://127.0.0.1:42201', startedAt: new Date().toISOString() }),
      );
      const plan = await planBringUpProvider({ cwd: dir, fetchImpl: stubFetch({ overrides }), spawnImpl: poisonSpawn, kill: poisonKill });
      expect(plan.action).toBe('would-noop');
      expect(plan.providerUrl).toBe('http://127.0.0.1:42201');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('existing DEAD pinned state -> would-restart on the SAME ports, never re-derived', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'provider'), { recursive: true });
      writeFileSync(
        join(dir, '.open-autonomy', 'runner-state', 'provider', 'state.json'),
        JSON.stringify({ repoPath: dir, prefix: 'x-oa', consolePort: 42300, providerPort: 42301, consoleUrl: 'http://127.0.0.1:42300', providerUrl: 'http://127.0.0.1:42301', consolePid: 111, providerPid: 222, startedAt: new Date().toISOString() }),
      );
      const plan = await planBringUpProvider({ cwd: dir, fetchImpl: stubFetch({ dead: new Set(['http://127.0.0.1:42300/healthz', 'http://127.0.0.1:42301/healthz']) }), spawnImpl: poisonSpawn, kill: poisonKill });
      expect(plan.action).toBe('would-restart');
      expect(plan.consolePort).toBe(42300);
      expect(plan.providerPort).toBe(42301);
      expect(plan.detail).toMatch(/SAME already-pinned ports/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('foreign occupant on the pinned provider port -> would-refuse-foreign-occupant, never pins/spawns over it', async () => {
    const dir = tmpRepo();
    try {
      const overrides = new Map<string, unknown>([['http://127.0.0.1:42401/healthz', { some: 'unrelated service' }]]);
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'provider'), { recursive: true });
      writeFileSync(
        join(dir, '.open-autonomy', 'runner-state', 'provider', 'state.json'),
        JSON.stringify({ repoPath: dir, prefix: 'x-oa', consolePort: 42400, providerPort: 42401, consoleUrl: 'http://127.0.0.1:42400', providerUrl: 'http://127.0.0.1:42401', startedAt: new Date().toISOString() }),
      );
      const plan = await planBringUpProvider({ cwd: dir, fetchImpl: stubFetch({ overrides }), spawnImpl: poisonSpawn, kill: poisonKill });
      expect(plan.action).toBe('would-refuse-foreign-occupant');
      expect(plan.detail).toMatch(/would REFUSE/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('bringUpProvider', () => {
  test('fresh bring-up: starts on the derived free pair, verifies identity, pins durably', async () => {
    const dir = tmpRepo();
    try {
      const { consolePort, providerPort } = await pickProviderPorts({ repoPath: dir, isPortFree: () => true });
      const consoleUrl = `http://127.0.0.1:${consolePort}`;
      const providerUrl = `http://127.0.0.1:${providerPort}`;
      const overrides = new Map<string, unknown>([
        [`${consoleUrl}/healthz`, { ok: true, service: 'console' }],
        [`${providerUrl}/healthz`, { ok: true, provider: 'virtual-tmux', instanceId: 'abc' }],
      ]);
      const r = await bringUpProvider({
        cwd: dir,
        isPortFree: () => true,
        fetchImpl: stubFetch({ overrides }),
        spawnImpl: fakeSpawn,
        pollTimeoutMs: 1000,
        pollIntervalMs: 10,
      });
      expect(r.action).toBe('started');
      expect(r.providerUrl).toBe(providerUrl);
      expect(readSchedulePin(dir)).toBe(providerUrl);
      expect(r.state?.consolePid).toBe(4242);
      expect(r.state?.providerPid).toBe(4242);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('idempotent: re-running against a healthy pinned provider is a no-op', async () => {
    const dir = tmpRepo();
    try {
      const fetchImpl = stubFetch(); // GENERIC_HEALTHY for every port -> whatever gets picked is "healthy"
      const first = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(first.action).toBe('started');

      const second = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(second.action).toBe('noop');
      expect(second.providerUrl).toBe(first.providerUrl);
      expect(readSchedulePin(dir)).toBe(first.providerUrl);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a dead pinned provider is restarted on the SAME pinned ports (never re-derived)', async () => {
    const dir = tmpRepo();
    try {
      const { providerPort } = await pickProviderPorts({ repoPath: dir, isPortFree: () => true });
      const providerHealthzUrl = `http://127.0.0.1:${providerPort}/healthz`;

      let deadProvider = false;
      const flakyFetch = (async (url: unknown) => {
        const u = String(url);
        if (u === providerHealthzUrl && deadProvider) {
          throw new Error('connect ECONNREFUSED 127.0.0.1');
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      const first = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl: flakyFetch, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(first.action).toBe('started');
      const firstProviderUrl = first.providerUrl;

      // simulate the provider process dying: its /healthz now refuses. On the NEXT bring-up call, the
      // existing-state check must see it dead and restart -- but by the time startOn's own poll happens
      // (which the test can't easily time-order against), keep providing a healthy response so the
      // restart succeeds. We approximate "dead, then comes back" with a one-shot flag that the
      // existing-state verify consumes, then self-clears before startOn's poll begins.
      deadProvider = true;
      const restartFetch = (async (url: unknown) => {
        const u = String(url);
        if (u === providerHealthzUrl && deadProvider) {
          deadProvider = false; // only the FIRST (existing-state) probe sees it dead; the restart poll sees it healthy
          throw new Error('connect ECONNREFUSED 127.0.0.1');
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      const second = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl: restartFetch, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(second.action).toBe('restarted');
      expect(second.providerUrl).toBe(firstProviderUrl); // SAME ports, never re-derived
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('foreign-occupant rejection: an existing pin now answered by a non-termfleet service is refused, never re-pinned', async () => {
    const dir = tmpRepo();
    try {
      const fetchImpl = stubFetch();
      const first = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(first.action).toBe('started');
      const pinnedUrl = first.providerUrl!;

      const foreignFetch = (async (url: unknown) => {
        const u = String(url);
        if (u === `${pinnedUrl}/healthz`) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', notTermfleet: true }) } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      const second = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl: foreignFetch, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(second.action).toBe('foreign-occupant-refused');
      expect(readSchedulePin(dir)).toBe(pinnedUrl); // unchanged -- never pinned the foreign occupant
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('foreign-occupant rejection on a FRESH bring-up: the derived port answers non-termfleet -> advances, never pins it', async () => {
    const dir = tmpRepo();
    try {
      const pair1 = await pickProviderPorts({ repoPath: dir, isPortFree: () => true });
      const foreignProviderUrl = `http://127.0.0.1:${pair1.providerPort}/healthz`;

      const fetchImpl = (async (url: unknown) => {
        const u = String(url);
        if (u === foreignProviderUrl) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok' }) } as unknown as Response; // no `provider` field -> foreign
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      const r = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(r.action).toBe('started');
      expect(r.providerUrl).not.toBe(`http://127.0.0.1:${pair1.providerPort}`);
      expect(readSchedulePin(dir)).toBe(r.providerUrl);
      expect(readSchedulePin(dir)).not.toBe(`http://127.0.0.1:${pair1.providerPort}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('never picks a forbidden default port even under bring-up (end-to-end sanity)', async () => {
    const dir = tmpRepo();
    try {
      const r = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl: stubFetch(), spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      const port = Number(new URL(r.providerUrl!).port);
      expect(DEFAULT_FORBIDDEN_PORTS).not.toContain(port);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fix round: D1/D2/D3 regressions', () => {
  test('D1: a throw AFTER spawn (poll timeout) group-kills both just-spawned trees before propagating', async () => {
    const dir = tmpRepo();
    try {
      let nextPid = 100;
      const spawned: number[] = [];
      const spawnRecorder = (): SpawnedProcess => {
        const pid = nextPid++;
        spawned.push(pid);
        return { pid, unref: () => {} };
      };
      const killed: number[] = [];
      const deadFetch = (async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1'); // nothing ever answers -> provider poll times out
      }) as unknown as typeof fetch;

      await expect(
        bringUpProvider({
          cwd: dir,
          isPortFree: () => true,
          fetchImpl: deadFetch,
          spawnImpl: spawnRecorder,
          kill: (pid) => killed.push(pid),
          pollTimeoutMs: 50,
          pollIntervalMs: 10,
        }),
      ).rejects.toThrow(/never answered/);

      expect(spawned.length).toBe(2); // one console + one provider spawn, single attempt (non-foreign error rethrows)
      expect([...killed].sort()).toEqual([...spawned].sort()); // BOTH just-spawned trees killed on the error path
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("D1: the fresh-bring-up refusal loop kills each refused attempt's spawns before advancing (no leak across >=2 refusals)", async () => {
    const dir = tmpRepo();
    try {
      // Pre-compute the first two candidate pairs the derivation will visit (mirroring the loop's own
      // exclude-and-re-derive behavior) and plant a plain-http foreign occupant (404s /healthz — the
      // python3 -m http.server shape) on BOTH provider ports.
      const pair1 = await pickProviderPorts({ repoPath: dir, isPortFree: () => true });
      const busy1 = new Set([pair1.consolePort, pair1.providerPort]);
      const pair2 = await pickProviderPorts({ repoPath: dir, isPortFree: (p) => !busy1.has(p) });
      const foreign = new Set([`http://127.0.0.1:${pair1.providerPort}/healthz`, `http://127.0.0.1:${pair2.providerPort}/healthz`]);

      const fetchImpl = (async (url: unknown) => {
        const u = String(url);
        if (foreign.has(u)) {
          return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      let nextPid = 500;
      const spawned: number[] = [];
      const spawnRecorder = (): SpawnedProcess => {
        const pid = nextPid++;
        spawned.push(pid);
        return { pid, unref: () => {} };
      };
      const killed: number[] = [];

      const r = await bringUpProvider({
        cwd: dir,
        isPortFree: () => true,
        fetchImpl,
        spawnImpl: spawnRecorder,
        kill: (pid) => killed.push(pid),
        pollTimeoutMs: 1000,
        pollIntervalMs: 10,
      });

      expect(r.action).toBe('started'); // third candidate pair succeeded
      expect(spawned.length).toBe(6); // 3 attempts x (console + provider)
      // Every spawn of the two REFUSED attempts was killed before advancing; the successful pair was not.
      const refusedPids = spawned.slice(0, 4);
      const successPids = spawned.slice(4);
      expect([...killed].sort()).toEqual([...refusedPids].sort());
      for (const pid of successPids) expect(killed).not.toContain(pid);
      // And neither foreign provider port was ever pinned.
      expect(readSchedulePin(dir)).toBe(r.providerUrl);
      expect(r.providerUrl).not.toBe(`http://127.0.0.1:${pair1.providerPort}`);
      expect(r.providerUrl).not.toBe(`http://127.0.0.1:${pair2.providerPort}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('D2: a pinned port occupied by a plain-http foreigner (404 on /healthz) is FOREIGN-refused — no SIGTERM of recorded pids, no spawn onto it', async () => {
    const dir = tmpRepo();
    try {
      const fetchImpl = stubFetch();
      const first = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      expect(first.action).toBe('started');
      const pinnedUrl = first.providerUrl!;

      const foreign404Fetch = (async (url: unknown) => {
        const u = String(url);
        if (u === `${pinnedUrl}/healthz`) {
          return { ok: false, status: 404, json: async () => ({}) } as unknown as Response; // python3 -m http.server shape
        }
        return { ok: true, status: 200, json: async () => GENERIC_HEALTHY } as unknown as Response;
      }) as unknown as typeof fetch;

      const killed: number[] = [];
      let spawns = 0;
      const second = await bringUpProvider({
        cwd: dir,
        isPortFree: () => true,
        fetchImpl: foreign404Fetch,
        spawnImpl: () => {
          spawns++;
          return fakeSpawn();
        },
        kill: (pid) => killed.push(pid),
        pollTimeoutMs: 1000,
        pollIntervalMs: 10,
      });

      expect(second.action).toBe('foreign-occupant-refused');
      expect(killed).toEqual([]); // never SIGTERMed the recorded pids for a port something else now holds
      expect(spawns).toBe(0); // never spawned onto the occupied port
      expect(readSchedulePin(dir)).toBe(pinnedUrl); // pin untouched
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('D2: classification — any HTTP answer (404, 200-non-JSON) is FOREIGN/answered; only transport failure is dead', async () => {
    const nonJson = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    const rNonJson = await verifyProviderIdentity('http://127.0.0.1:1', nonJson);
    expect(rNonJson.reachable).toBe(true);
    expect(rNonJson.isTermfleet).toBe(false);

    const r404 = await verifyProviderIdentity('http://127.0.0.1:1', (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch);
    expect(r404.reachable).toBe(true);
    expect(r404.isTermfleet).toBe(false);

    const dead = await verifyProviderIdentity(
      'http://127.0.0.1:1',
      (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as unknown as typeof fetch,
    );
    expect(dead.reachable).toBe(false);
  });

  test('D3: after a successful up, the state-recorded pids are ALIVE and own their process group; down reaps them', async () => {
    const dir = tmpRepo();
    try {
      // Real detached spawns (harmless long-sleep node processes standing in for the npx trees) so the
      // recorded pids are real, alive, group-leader processes — the invariant D3's zombie corrupted.
      const realSpawn: SpawnImpl = () => {
        const child = spawn('node', ['-e', 'setTimeout(() => {}, 30000)'], { detached: true, stdio: 'ignore' });
        child.unref();
        return { pid: child.pid, unref: () => {} };
      };
      const r = await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl: stubFetch(), spawnImpl: realSpawn, pollTimeoutMs: 2000, pollIntervalMs: 10 });
      expect(r.action).toBe('started');
      const pids = [r.state!.consolePid!, r.state!.providerPid!];
      try {
        for (const pid of pids) {
          expect(() => process.kill(pid, 0)).not.toThrow(); // alive right after up
          const pgid = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
          expect(pgid).toBe(String(pid)); // detached spawn => its own process-group leader (ours to kill)
        }
      } finally {
        const down = providerDown({ cwd: dir }); // real default kill (group-kill)
        expect(down.action).toBe('stopped');
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const pid of pids) {
        expect(() => process.kill(pid, 0)).toThrow(); // dead after down — nothing leaked
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('providerStatus / providerDown', () => {
  test('status reports not-running when never brought up', async () => {
    const dir = tmpRepo();
    try {
      const r = await providerStatus({ cwd: dir });
      expect(r.running).toBe(false);
      expect(r.detail).toContain('never brought up');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('status reports running after a successful bring-up, and reflects a dead provider', async () => {
    const dir = tmpRepo();
    try {
      const fetchImpl = stubFetch();
      await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });
      const up = await providerStatus({ cwd: dir, fetchImpl });
      expect(up.running).toBe(true);

      const deadFetch = (async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1');
      }) as unknown as typeof fetch;
      const down = await providerStatus({ cwd: dir, fetchImpl: deadFetch });
      expect(down.running).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('down sends SIGTERM to recorded pids and marks state stopped; a second down is a no-op', async () => {
    const dir = tmpRepo();
    try {
      const fetchImpl = stubFetch();
      await bringUpProvider({ cwd: dir, isPortFree: () => true, fetchImpl, spawnImpl: fakeSpawn, pollTimeoutMs: 1000, pollIntervalMs: 10 });

      const killed: Array<[number, string]> = [];
      const r1 = providerDown({ cwd: dir, kill: (pid, signal) => killed.push([pid, signal]) });
      expect(r1.action).toBe('stopped');
      expect(killed).toEqual([
        [4242, 'SIGTERM'],
        [4242, 'SIGTERM'],
      ]);

      const r2 = providerDown({ cwd: dir, kill: (pid, signal) => killed.push([pid, signal]) });
      expect(r2.action).toBe('not-running');
      expect(killed.length).toBe(2); // no additional kills on the second call
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('down on an install that was never brought up is a clean no-op', () => {
    const dir = tmpRepo();
    try {
      const r = providerDown({ cwd: dir });
      expect(r.action).toBe('not-running');
      expect(r.detail).toContain('nothing to stop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
