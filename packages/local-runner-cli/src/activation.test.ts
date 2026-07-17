import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDryRunConfig, installEgressGuard, openLedger, virtualClock } from '@open-autonomy/dry-run';
import {
  activateAcceptedGeneration,
  activationHome,
  configureActivation,
  materializeAcceptedGeneration,
  readActivationState,
  rollbackActivation,
  type ActivationGeneration,
  type ActivationOps,
  type ActivationPhase,
} from './activation.ts';
import { start } from './reconciler.ts';
import type { ProcRunner, SessionRunner } from './types.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const D = 'd'.repeat(40);
const tmps: string[] = [];

afterEach(() => {
  for (const path of tmps.splice(0)) rmSync(path, { recursive: true, force: true });
});

function repo(paused = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa243-state-'));
  tmps.push(dir);
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'oa243@example.invalid'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'oa243'], { cwd: dir });
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  if (paused) writeFileSync(join(dir, '.open-autonomy', 'paused'), 'operator pause\n');
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-qm', 'seed'], { cwd: dir });
  configureActivation({ profile: 'profiles/test', pollMs: 1000 }, { cwd: dir });
  return dir;
}

function simulatedOps(root: string, state: { accepted: string; failValidation?: string; failHealth?: string; calls: string[] }): ActivationOps {
  return {
    async detectAccepted() {
      state.calls.push(`detect:${state.accepted}`);
      return { sha: state.accepted, acceptedAt: '2026-07-16T00:00:00.000Z' };
    },
    async stage(sha) {
      state.calls.push(`stage:${sha}`);
      const path = join(root, sha);
      mkdirSync(path, { recursive: true });
      return path;
    },
    async validate(generation) {
      state.calls.push(`validate:${generation.sha}`);
      if (state.failValidation === generation.sha) throw new Error('deliberately invalid profile');
    },
    async health(generation) {
      state.calls.push(`health:${generation.sha}`);
      if (state.failHealth === generation.sha) throw new Error('deliberately broken cold start');
    },
  };
}

describe('atomic accepted-generation activation (#243)', () => {
  test('staging materializes a machine-local provider pin without requiring it in the accepted source commit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa253-materialize-'));
    tmps.push(dir);
    const profile = join(dir, 'profiles', 'test');
    mkdirSync(join(profile, 'scripts'), { recursive: true });
    writeFileSync(join(profile, 'scripts', 'pm.mjs'), 'export default true;\n');
    writeFileSync(join(profile, 'ir.yml'), [
      'schema: autonomy.ir.v1',
      'targets: [local]',
      'codeHost: local-git',
      'agents:',
      '  pm:',
      '    behavior: scripts/pm.mjs',
      '    capabilities: [tasks:converse]',
      '    triggers:',
      '      - cron: "*/15 * * * *"',
      'policy:',
      '  box: {}',
      'resources: [scripts/pm.mjs]',
      '',
    ].join('\n'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'paused'), 'operator pause\n');
    const base = { schema: 'open-autonomy.activation-config.v1' as const, profile: 'profiles/test', pollMs: 1000 };

    materializeAcceptedGeneration(dir, dir, base);
    expect(JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')).env).toEqual({});

    const providerUrl = 'http://127.0.0.1:45678';
    const configured = materializeAcceptedGeneration(dir, dir, { ...base, providerUrl });
    expect(configured.changes).toEqual([{ action: 'update', path: 'scheduler/schedule.json' }]);
    expect(JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')).env.TERMFLEET_PROVIDER_URL).toBe(providerUrl);
    expect(readFileSync(join(dir, '.open-autonomy', 'paused'), 'utf8')).toContain('operator pause');
    expect(materializeAcceptedGeneration(dir, dir, { ...base, providerUrl }).changes).toEqual([]);
  });

  test('same workflow handles activate, no-op, drain, validation rejection, rollback, and central pause preservation', async () => {
    const dir = repo(true);
    const clock = virtualClock(Date.parse('2026-07-16T00:00:00Z'));
    const ledger = openLedger(join(activationHome(dir), 'dry-run-ledger.jsonl'), clock.now);
    const sim = { accepted: A, calls: [] as string[], failValidation: '', failHealth: '' };
    const ops = simulatedOps(join(activationHome(dir), 'sim'), sim);

    const first = await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
    expect(first.ok).toBe(true);
    expect(first.state.active?.sha).toBe(A);
    expect(readFileSync(join(activationHome(dir), 'paused'), 'utf8')).toContain('operator pause');

    const beforeNoop = sim.calls.length;
    const noop = await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
    expect(noop.action).toBe('noop');
    expect(sim.calls.slice(beforeNoop)).toEqual([`detect:${A}`]);

    sim.accepted = B;
    clock.advance(1000);
    const second = await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
    expect(second.state.active?.sha).toBe(B);
    expect(second.state.draining.map((generation) => generation.sha)).toEqual([A]);

    sim.accepted = C;
    sim.failValidation = C;
    const rejected = await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
    expect(rejected.action).toBe('rejected');
    expect(rejected.state.active?.sha).toBe(B);
    expect(rejected.state.lastFailed?.sha).toBe(C);

    sim.accepted = D;
    sim.failHealth = D;
    const rolledBack = await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
    expect(rolledBack.action).toBe('rolled-back');
    expect(rolledBack.state.active?.sha).toBe(B);
    expect(rolledBack.state.lastFailed?.sha).toBe(D);

    const manual = rollbackActivation({ cwd: dir, sha: A, now: clock.now });
    expect(manual.ok).toBe(true);
    expect(manual.state.active?.sha).toBe(A);
    expect(ledger.entries().map((entry) => entry.action)).toContain('rollback');
  });

  test('restart at every transition boundary converges to exactly one active generation', async () => {
    const phases: ActivationPhase[] = ['detected', 'staged', 'validated', 'switched', 'healthy'];
    const table: Array<{ phase: string; active: string; transition: unknown }> = [];
    for (const phase of phases) {
      const dir = repo(false);
      const sim = { accepted: A, calls: [] as string[] };
      const ops = simulatedOps(join(activationHome(dir), 'sim'), sim);
      await activateAcceptedGeneration({ cwd: dir, ops });
      sim.accepted = B;
      await expect(activateAcceptedGeneration({ cwd: dir, ops, interruptAfter: phase })).rejects.toThrow(`after ${phase}`);
      expect(readActivationState(dir).transition?.phase).toBe(phase);
      const resumed = await activateAcceptedGeneration({ cwd: dir, ops });
      expect(resumed.ok).toBe(true);
      expect(resumed.state.active?.sha).toBe(B);
      expect(resumed.state.previous?.sha).toBe(A);
      expect(resumed.state.transition).toBeUndefined();
      table.push({ phase, active: resumed.state.active!.sha, transition: resumed.state.transition });
    }
    expect(table).toHaveLength(5);
  });

  test('hermetic rehearsal records the full action ledger and proves zero external egress', async () => {
    assertDryRunConfig({ endpoints: { twin: 'http://127.0.0.1:9999' }, credentials: { token: 'fake-oa243' } });
    const guard = installEgressGuard();
    try {
      const dir = repo();
      const clock = virtualClock(0);
      const ledger = openLedger(join(activationHome(dir), 'actions.jsonl'), clock.now);
      const sim = { accepted: A, calls: [] as string[] };
      const ops = simulatedOps(join(activationHome(dir), 'sim'), sim);
      await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
      sim.accepted = B;
      clock.advance(60_000);
      await activateAcceptedGeneration({ cwd: dir, ops, ledger, now: clock.now });
      expect(ledger.entries().map((entry) => entry.action)).toEqual([
        'accepted-update-detected', 'stage', 'validate', 'switch', 'cold-start-health',
        'accepted-update-detected', 'stage', 'validate', 'switch', 'cold-start-health',
      ]);
      expect(guard.allowed).toEqual([]);
      expect(guard.blocked).toEqual([]);
    } finally {
      guard.uninstall();
    }
  });

  test('a superseded generation fires nothing and stays alive until its SHA-bound session drains', async () => {
    const dir = repo(false);
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({
      intervalSeconds: 1,
      scripts: ['node -e "throw new Error(\'must not fire\')"'],
    }));
    let live = true;
    let shellFires = 0;
    const proc: ProcRunner = (cmd, args, opts) => {
      if (opts?.shell) shellFires += 1;
      const result = spawnSync(cmd, args, { cwd: opts?.cwd, encoding: 'utf8' });
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error ? { error: result.error } : {}) };
    };
    const runner: SessionRunner = {
      async list() {
        return live ? [{ id: 'old-session', agent: 'job-1', status: 'running', controlSha: A }] : [];
      },
      async reapIdle() { return []; },
    };
    let heartbeats = 0;
    await start({
      cwd: dir,
      proc,
      pollMs: 10,
      generationSha: A,
      canFire: () => false,
      stopWhenDrained: true,
      sessionRunnerFactory: async () => runner,
      onHeartbeat: () => { heartbeats += 1; live = false; },
    });
    expect(heartbeats).toBe(2);
    expect(shellFires).toBe(0);
  });

  test('first-generation health failure leaves no active route, and corrupt routing state fails closed', async () => {
    const dir = repo(false);
    const sim = { accepted: A, calls: [] as string[], failHealth: A };
    const failed = await activateAcceptedGeneration({
      cwd: dir,
      ops: simulatedOps(join(activationHome(dir), 'sim'), sim),
    });
    expect(failed.ok).toBe(false);
    expect(failed.state.active).toBeUndefined();
    expect(failed.state.lastFailed?.sha).toBe(A);

    writeFileSync(join(activationHome(dir), 'state.json'), '{ definitely not json');
    await expect(activateAcceptedGeneration({
      cwd: dir,
      ops: simulatedOps(join(activationHome(dir), 'sim'), { accepted: B, calls: [] }),
    })).rejects.toThrow('activation state is corrupt');
  });
});
