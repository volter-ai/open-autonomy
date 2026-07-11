import { describe, expect, test } from 'bun:test';
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
  providerDown,
  providerStatus,
  readSchedulePin,
} from './provider.ts';
import type { SpawnedProcess } from './provider.ts';

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
