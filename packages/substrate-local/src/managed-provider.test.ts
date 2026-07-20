import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
// The implementation is emitted verbatim as plain Node JavaScript into adopter repositories.
// @ts-expect-error deliberately no TypeScript declaration for the emitted runtime module
import { ensureManagedProvider, validateManagedProviderConfig } from './managed-provider.mjs';

const skillAgentIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

const health = (instanceId: string) => ({
  reachable: true,
  status: 200,
  health: { ok: true, provider: 'virtual-tmux', instanceId },
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'oa-managed-provider-'));
  return {
    dir,
    config: {
      schema: 'open-autonomy.managed-provider.v1',
      mode: 'managed',
      kind: 'virtual-tmux',
      name: 'ponder-open-autonomy',
      url: 'http://127.0.0.1:17620',
      runtimeDir: dir,
      tmuxSocket: 'ponder-open-autonomy',
      count: 1,
      maxWindows: 16,
      reapEndedAfterSeconds: 300,
    },
  };
}

function writeOwner(dir: string, instanceId: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'owner.json'),
    `${JSON.stringify({
      schema: 'open-autonomy.managed-provider-owner.v1',
      name: 'ponder-open-autonomy',
      url: 'http://127.0.0.1:17620',
      kind: 'virtual-tmux',
      tmuxSocket: 'ponder-open-autonomy',
      instanceId,
      claimedAt: '2026-07-19T00:00:00.000Z',
    })}\n`,
  );
}

describe('managed virtual-tmux provider ownership', () => {
  test('compile emits the owned provider contract and its ensure runtime together', () => {
    const out = compileLocal(skillAgentIr, {
      providerUrl: 'http://127.0.0.1:17620',
      managedProviderName: 'ponder-open-autonomy',
      providerRuntimeDir: '/Volumes/PeakSSD/Ponder-runtime/termfleet-provider',
    });
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']);
    expect(schedule.provider).toEqual({
      schema: 'open-autonomy.managed-provider.v1',
      mode: 'managed',
      kind: 'virtual-tmux',
      name: 'ponder-open-autonomy',
      url: 'http://127.0.0.1:17620',
      runtimeDir: '/Volumes/PeakSSD/Ponder-runtime/termfleet-provider',
      tmuxSocket: 'ponder-open-autonomy',
      count: 1,
      maxWindows: 16,
      reapEndedAfterSeconds: 300,
    });
    expect(schedule.env.TERMFLEET_PROVIDER_URL).toBe('http://127.0.0.1:17620');
    expect(out.generated['scheduler/ensure-provider.mjs']).toContain('ensureManagedProvider');
    expect(out.generated['scheduler/run.mjs']).toContain('refusing to attach to another provider');
  });

  test('every scheduler start ensures the same named provider before a v2 job runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-managed-scheduler-'));
    try {
      const out = compileLocal(skillAgentIr, {
        providerUrl: 'http://127.0.0.1:17620',
        managedProviderName: 'ponder-open-autonomy',
        providerRuntimeDir: join(dir, 'provider-runtime'),
      });
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']);
      const schedule = JSON.parse(out.generated['scheduler/schedule.json']);
      schedule.jobs[0].command = 'node scripts/job.mjs';
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), `${JSON.stringify(schedule)}\n`);
      writeFileSync(
        join(dir, 'scheduler', 'ensure-provider.mjs'),
        `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const countPath = ${JSON.stringify(join(dir, 'ensure-count'))};
const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) + 1 : 1;
writeFileSync(countPath, String(count));
console.log(JSON.stringify({ action: count === 1 ? 'started' : 'reused', instanceId: 'owned-1' }));
`,
      );
      writeFileSync(
        join(dir, 'scripts', 'job.mjs'),
        `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(dir, 'job-env'))}, process.env.TERMFLEET_PROVIDER_URL || '');\n`,
      );

      const first = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      const second = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });

      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(first.stderr).toContain('managed:ponder-open-autonomy, started, instance owned-1');
      expect(second.stderr).toContain('managed:ponder-open-autonomy, reused, instance owned-1');
      expect(readFileSync(join(dir, 'ensure-count'), 'utf8')).toBe('2');
      expect(readFileSync(join(dir, 'job-env'), 'utf8')).toBe('http://127.0.0.1:17620');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('compile refuses a managed provider without a fixed URL or with a non-loopback endpoint', () => {
    expect(() => compileLocal(skillAgentIr, { managedProviderName: 'ponder-open-autonomy' })).toThrow('requires providerUrl');
    expect(() =>
      compileLocal(skillAgentIr, {
        managedProviderName: 'ponder-open-autonomy',
        providerUrl: 'http://192.0.2.10:17620',
      }),
    ).toThrow('explicit loopback');
  });

  test('reuses the same healthy owned instance without spawning', async () => {
    const { dir, config } = fixture();
    try {
      writeOwner(dir, 'provider-1');
      let spawns = 0;
      const result = await ensureManagedProvider(config, {
        probe: async () => health('provider-1'),
        spawn: () => {
          spawns += 1;
          return { pid: 12, exited: () => false };
        },
      });
      expect(result.action).toBe('reused');
      expect(result.instanceId).toBe('provider-1');
      expect(spawns).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refuses to adopt a healthy provider on the configured port without its owner record', async () => {
    const { dir, config } = fixture();
    try {
      await expect(
        ensureManagedProvider(config, {
          probe: async () => health('foreign-provider'),
          spawn: () => ({ pid: 12, exited: () => false }),
        }),
      ).rejects.toThrow('refusing to adopt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('starts once, records the provider identity, then reuses that identity', async () => {
    const { dir, config } = fixture();
    try {
      let probes = 0;
      let spawns = 0;
      const result = await ensureManagedProvider(config, {
        probe: async () => (probes++ === 0 ? { reachable: false } : health('provider-1')),
        spawn: () => {
          spawns += 1;
          return { pid: 12, exited: () => false };
        },
        sleep: async () => {},
      });
      expect(result.action).toBe('started');
      expect(spawns).toBe(1);
      expect(JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')).instanceId).toBe('provider-1');

      const reused = await ensureManagedProvider(config, {
        probe: async () => health('provider-1'),
        spawn: () => {
          throw new Error('must not spawn');
        },
      });
      expect(reused.action).toBe('reused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('restarts an absent owned provider only when the durable instance identity returns', async () => {
    const { dir, config } = fixture();
    try {
      writeOwner(dir, 'provider-1');
      let probes = 0;
      const result = await ensureManagedProvider(config, {
        probe: async () => (probes++ === 0 ? { reachable: false } : health('provider-1')),
        spawn: () => ({ pid: 13, exited: () => false }),
        sleep: async () => {},
      });
      expect(result.action).toBe('restarted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refuses identity drift after restart', async () => {
    const { dir, config } = fixture();
    try {
      writeOwner(dir, 'provider-1');
      let probes = 0;
      await expect(
        ensureManagedProvider(config, {
          probe: async () => (probes++ === 0 ? { reachable: false } : health('provider-2')),
          spawn: () => ({ pid: 13, exited: () => false }),
          sleep: async () => {},
        }),
      ).rejects.toThrow('refusing identity drift');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only accepts an explicit loopback URL and a stable unambiguous name', () => {
    const { dir, config } = fixture();
    try {
      expect(() => validateManagedProviderConfig({ ...config, url: 'http://localhost:17620' })).toThrow('explicit loopback');
      expect(() => validateManagedProviderConfig({ ...config, name: 'Ponder' })).toThrow('lowercase');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
