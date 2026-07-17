import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDryRunConfig, installEgressGuard, openLedger, virtualClock } from '@open-autonomy/dry-run';
import { gitCodeHost, makeGitRepo } from '@open-autonomy/dry-run/git';
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

  test('one hermetic ledger binds governed issue-to-merge actions to the activated SHA', async () => {
    assertDryRunConfig({
      endpoints: { codeHost: 'http://127.0.0.1:9999' },
      credentials: { token: 'fake-governed-lifecycle' },
    });
    const guard = installEgressGuard();
    try {
      const root = mkdtempSync(join(tmpdir(), 'oa-governed-lifecycle-'));
      tmps.push(root);
      const scenario = makeGitRepo(root, 'main');
      const codeHost = gitCodeHost(scenario);
      const clock = virtualClock(Date.parse('2026-07-16T00:00:00.000Z'));
      const ledger = openLedger(join(root, 'proof', 'actions.jsonl'), clock.now);
      const tick = () => clock.advance(1_000);
      const issue = { number: 1, title: 'Upgrade governed control plane' };

      ledger.append('code-host', 'issue-intake', issue);
      tick();
      ledger.append('planning', 'maintainer-select', { issue: issue.number, disposition: 'ready' });
      tick();
      const pr = await codeHost.developerImplements({
        issueBranch: 'agent/issue-1',
        base: 'main',
        title: issue.title,
        path: 'change.txt',
        content: 'accepted change\n',
      });
      const headSha = await codeHost.getBranchHead(pr.head);
      ledger.append('code-host', 'isolated-implementation', { issue: issue.number, branch: pr.head, headSha });
      tick();
      ledger.append('code-host', 'open-pr', { issue: issue.number, pr: pr.number, headSha, autoMerge: false });

      const required = ['test', 'security', 'agent-review', 'human-approval'] as const;
      const checks = new Map<string, { sha: string; state: 'success' }>();
      const landingDecision = () => ({
        eligible: required.every((context) => checks.get(context)?.sha === headSha),
        missing: required.filter((context) => checks.get(context)?.sha !== headSha),
      });
      for (const context of required.slice(0, -1)) {
        tick();
        checks.set(context, { sha: headSha, state: 'success' });
        ledger.append('checks', 'exact-head-success', { context, headSha });
      }

      // The negative gate is part of the same trail: three green checks cannot land or activate.
      let decision = landingDecision();
      expect(decision).toEqual({ eligible: false, missing: ['human-approval'] });
      expect((await codeHost.listPullRequests({ base: 'main', state: 'open' })).map((candidate) => candidate.number)).toEqual([pr.number]);
      expect(ledger.entries().some((entry) => entry.port === 'activation')).toBe(false);

      tick();
      checks.set('human-approval', { sha: headSha, state: 'success' });
      ledger.append('checks', 'exact-head-success', { context: 'human-approval', headSha, actorType: 'human' });
      decision = landingDecision();
      expect(decision).toEqual({ eligible: true, missing: [] });
      tick();
      ledger.append('governance', 'eligible-for-manual-landing', { pr: pr.number, headSha, required: [...required] });
      expect((await codeHost.listPullRequests({ base: 'main', state: 'open' }))).toHaveLength(1);

      // Eligibility has no side effect. A distinct human operation performs the real local-git merge.
      tick();
      ledger.append('human', 'merge', { pr: pr.number, actorType: 'human', reviewedHeadSha: headSha });
      const mergeSha = codeHost.mergePr(pr.number);
      expect(mergeSha).toMatch(/^[0-9a-f]{40}$/);
      expect(scenario.headOf('main')).toBe(mergeSha);

      tick();
      const activation = await activateAcceptedGeneration({
        cwd: scenario.work,
        ledger,
        now: clock.now,
        ops: {
          async detectAccepted() { return { sha: mergeSha, acceptedAt: new Date(clock.now()).toISOString() }; },
          async stage(sha) {
            const path = join(activationHome(scenario.work), 'sim', sha);
            mkdirSync(path, { recursive: true });
            return path;
          },
          async validate(generation) {
            if (generation.sha !== mergeSha) throw new Error('activation SHA diverged from human merge');
          },
          async health(generation) {
            if (generation.sha !== mergeSha) throw new Error('cold start used the wrong generation');
          },
        },
      });
      expect(activation.ok).toBe(true);
      expect(activation.state.active?.sha).toBe(mergeSha);
      const activeSha = activation.state.active?.sha;
      if (!activeSha) throw new Error('activation completed without an active generation');

      const artifact = {
        schema: 'open-autonomy.lifecycle-proof.v1',
        issue: issue.number,
        pr: pr.number,
        reviewedHeadSha: headSha,
        mergeSha,
        activeSha,
        actions: ledger.entries(),
        egress: { allowed: guard.allowed, blocked: guard.blocked },
      };
      const proofPath = join(root, 'proof', 'lifecycle.json');
      writeFileSync(proofPath, `${JSON.stringify(artifact, null, 2)}\n`);
      const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as typeof artifact;
      expect(proof.schema).toBe('open-autonomy.lifecycle-proof.v1');
      expect(proof.mergeSha).toBe(proof.activeSha);
      expect(proof.actions.map((entry) => `${entry.port}:${entry.action}`)).toEqual([
        'code-host:issue-intake',
        'planning:maintainer-select',
        'code-host:isolated-implementation',
        'code-host:open-pr',
        'checks:exact-head-success',
        'checks:exact-head-success',
        'checks:exact-head-success',
        'checks:exact-head-success',
        'governance:eligible-for-manual-landing',
        'human:merge',
        'activation:accepted-update-detected',
        'activation:stage',
        'activation:validate',
        'activation:switch',
        'activation:cold-start-health',
      ]);
      expect(proof.egress).toEqual({ allowed: [], blocked: [] });
    } finally {
      guard.uninstall();
    }
  });

  test('a superseded generation fires nothing and stays alive until its SHA-bound session drains', async () => {
    const dir = repo(false);
    const generationSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    await activateAcceptedGeneration({
      cwd: dir,
      ops: {
        async detectAccepted() { return { sha: generationSha, acceptedAt: new Date().toISOString() }; },
        async stage() { return dir; },
        async validate() {},
        async health() {},
      },
    });
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
        return live ? [{ id: 'old-session', agent: 'job-1', status: 'running', controlSha: generationSha }] : [];
      },
      async reapIdle() { return []; },
    };
    let heartbeats = 0;
    await start({
      cwd: dir,
      proc,
      pollMs: 10,
      generationSha,
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
