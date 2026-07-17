import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pause } from './pause.ts';
import { readLastFires, recordFire, status } from './status.ts';
import { StubSessionRunner } from './test-support/stub-session-runner.ts';
import { activateAcceptedGeneration, activationHome, configureActivation, type ActivationOps } from './activation.ts';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'oa-status-'));
}

describe('recordFire / readLastFires — informational telemetry only, never a control channel', () => {
  test('recordFire writes a per-agent record readLastFires can read back', () => {
    const dir = tmpRepo();
    try {
      recordFire(dir, 'manager', 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs');
      const fires = readLastFires(dir);
      expect(fires).toHaveLength(1);
      expect(fires[0]!.agent).toBe('manager');
      expect(fires[0]!.cmd).toContain('run-agent.mjs');
      expect(new Date(fires[0]!.firedAt).getTime()).not.toBeNaN();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recordFire overwrites the SAME agent key on a later fire (one record per agent, not an append log)', () => {
    const dir = tmpRepo();
    try {
      recordFire(dir, 'manager', 'cmd-1');
      recordFire(dir, 'manager', 'cmd-2');
      const fires = readLastFires(dir);
      expect(fires).toHaveLength(1);
      expect(fires[0]!.cmd).toBe('cmd-2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('readLastFires on a repo with no reconciler fires yet returns empty', () => {
    const dir = tmpRepo();
    try {
      expect(readLastFires(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('oa status', () => {
  test('reports fence PAUSED + reason + no sessions + no last-fire on a fresh install', async () => {
    const dir = tmpRepo();
    try {
      pause({ cwd: dir, reason: 'fresh install' });
      const stubRunner = new StubSessionRunner();
      const r = await status({ cwd: dir, sessionRunnerFactory: async () => stubRunner });
      expect(r.paused).toBe(true);
      expect(r.pauseReason).toContain('fresh install');
      expect(r.sessions).toEqual([]);
      expect(r.lastFires).toEqual([]);
      expect(r.rationale).toContain('PAUSED');
      expect(r.rationale).toContain('none live');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports live sessions + last-fire info when unpaused and a fire has been recorded', async () => {
    const dir = tmpRepo();
    try {
      recordFire(dir, 'manager', 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs');
      const stubRunner = new StubSessionRunner();
      stubRunner.addSession({ id: 's-1', agent: 'manager', status: 'running' });
      const r = await status({ cwd: dir, sessionRunnerFactory: async () => stubRunner });
      expect(r.paused).toBe(false);
      expect(r.sessions).toEqual([{ id: 's-1', agent: 'manager', status: 'running' }]);
      expect(r.lastFires[0]!.agent).toBe('manager');
      expect(r.rationale).toContain('unpaused');
      expect(r.rationale).toContain('manager:running');
      expect(r.rationale).toContain('last-fire[manager]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('sessions === null (probe unavailable) is surfaced distinctly from an empty list', async () => {
    const dir = tmpRepo();
    try {
      const r = await status({ cwd: dir, sessionRunnerFactory: async () => null });
      expect(r.sessions).toBeNull();
      expect(r.rationale).toContain('unknown');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('surfaces the accepted control generation in both structured status and rationale', async () => {
    const dir = tmpRepo();
    try {
      const sha = 'c'.repeat(40);
      const state = join(dir, '.open-autonomy', 'runner-state');
      mkdirSync(state, { recursive: true });
      writeFileSync(join(state, 'control-generation.json'), JSON.stringify({
        schema: 'open-autonomy.control-generation.v1', sha, codeHost: 'github', defaultBranch: 'main', acceptedAt: new Date().toISOString(),
      }));
      const r = await status({ cwd: dir, sessionRunnerFactory: async () => new StubSessionRunner() });
      expect(r.controlGeneration?.sha).toBe(sha);
      expect(r.rationale).toContain(`control-generation: ${sha} (github)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports active, staged/draining, last-failed generations and an exact rollback command', async () => {
    const dir = tmpRepo();
    try {
      spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
      configureActivation({ profile: 'profiles/test', pollMs: 1000 }, { cwd: dir });
      let accepted = 'a'.repeat(40);
      let fail = false;
      const ops: ActivationOps = {
        async detectAccepted() { return { sha: accepted, acceptedAt: new Date().toISOString() }; },
        async stage(sha) { const root = join(activationHome(dir), 'fixture', sha); mkdirSync(root, { recursive: true }); return root; },
        async validate() { if (fail) throw new Error('invalid staged profile'); },
        async health() {},
      };
      await activateAcceptedGeneration({ cwd: dir, ops });
      accepted = 'b'.repeat(40);
      await activateAcceptedGeneration({ cwd: dir, ops });
      accepted = 'c'.repeat(40);
      fail = true;
      await activateAcceptedGeneration({ cwd: dir, ops });

      const report = await status({ cwd: dir, sessionRunnerFactory: async () => new StubSessionRunner() });
      expect(report.activation?.active?.sha).toBe('b'.repeat(40));
      expect(report.rationale).toContain(`activation.active: ${'b'.repeat(40)}`);
      expect(report.rationale).toContain(`activation.draining: ${'a'.repeat(40)}`);
      expect(report.rationale).toContain(`activation.last-failed: ${'c'.repeat(40)} — invalid staged profile`);
      expect(report.rationale).toContain(`activation.rollback: oa rollback ${'a'.repeat(40)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
