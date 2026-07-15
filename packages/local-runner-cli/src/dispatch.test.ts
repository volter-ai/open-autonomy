import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatch } from './dispatch.ts';
import { pause } from './pause.ts';
import { StubProc, ok } from './test-support/stub-proc.ts';

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-dispatch-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  return dir;
}

describe('oa dispatch <agent> — the manual single dispatch', () => {
  test('fires exactly the one schedule line matching the agent, ignoring every other line', () => {
    const dir = tmpRepo({
      intervalSeconds: 900,
      scripts: ['bun scripts/sweep.ts', 'AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs', 'AUTONOMY_AGENT=planner node scripts/run-agent.mjs'],
    });
    try {
      const stub = new StubProc().on(() => true, () => ok(''));
      const r = dispatch('manager', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(true);
      expect(r.matched).toContain('AUTONOMY_AGENT=manager');
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]!.cmd).toContain('AUTONOMY_AGENT=manager');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an unknown agent name fails, naming the declared agents', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      const stub = new StubProc();
      const r = dispatch('nonexistent', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
      expect(r.matched).toBeNull();
      expect(r.reason).toContain('manager');
      expect(stub.calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dispatch refuses a fenced job instead of bypassing a declared control', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=planner node scripts/run-agent.mjs'] });
    try {
      pause({ cwd: dir });
      const stub = new StubProc().on(() => true, () => ok(''));
      const r = dispatch('planner', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('fenced by .open-autonomy/paused');
      expect(stub.calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dispatch honors the schedule-wide concurrency cap', () => {
    const dir = tmpRepo({
      maxConcurrent: 1,
      jobs: [
        { name: 'manager', agent: 'manager', command: 'node scripts/manager.mjs', intervalSeconds: 900 },
        { name: 'planner', agent: 'planner', command: 'node scripts/planner.mjs', intervalSeconds: 900 },
      ],
    });
    try {
      const stub = new StubProc()
        .on(() => true, () => ok(''))
        .onArgs('node', [join(dir, 'scripts', 'autonomy-runner.mjs'), 'list'], () =>
          ok(JSON.stringify([{ id: 'live', agent: 'manager', status: 'running' }])));
      const r = dispatch('planner', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('maxConcurrent=1 is already reached');
      expect(stub.calls.some((call) => call.cmd === 'node scripts/planner.mjs')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a failed launch (nonzero exit) is reported as not ok', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      const stub = new StubProc().on(() => true, () => ({ status: 1, stdout: '', stderr: 'boom' }));
      const r = dispatch('manager', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // D2 (post-review, TC.3): AUTONOMY_SINGLETON is baked into the schedule-line STRING itself, so a manual
  // `oa dispatch <agent>` fires the exact same string (and env-var prefix) an automatic reconciler tick
  // would — a skill that keyed its cron-vs-dispatch self-throttle off AUTONOMY_SINGLETON's presence would
  // silently misclassify this real, explicit, human-driven verb as its own automatic cadence. These tests
  // prove `dispatch()` tags every fire it makes AUTONOMY_TRIGGER_KIND=dispatch — the correct, distinct
  // signal a launched skill can use to tell "an operator explicitly asked for this" apart from "the
  // scheduler fired me on its own cadence" (packages/local-runner-cli/src/reconciler.ts tags 'cron').
  describe('D2 — AUTONOMY_TRIGGER_KIND=dispatch, distinct from the reconciler\'s own automatic "cron" tag', () => {
    test('a manual dispatch of a cron-bearing, AUTONOMY_SINGLETON-carrying schedule line is tagged "dispatch", never "cron"', () => {
      // Mirrors a real audit schedule line post-TC.3: AUTONOMY_SINGLETON=1 is baked into the command
      // string (compiled by packages/substrate-local/src/emit.ts's scheduleScripts) — this is exactly the
      // shape a real `oa dispatch audit` would fire.
      const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=audit AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
      try {
        const stub = new StubProc().on(() => true, () => ok(''));
        const r = dispatch('audit', { cwd: dir, proc: stub.runner });
        expect(r.ok).toBe(true);
        expect(stub.calls).toHaveLength(1);
        // the fired command STRING still carries AUTONOMY_SINGLETON=1 (unchanged — that var's real job,
        // the dedup guard, is untouched by this fix)...
        expect(stub.calls[0]!.cmd).toContain('AUTONOMY_SINGLETON=1');
        // ...but the SURROUNDING env this call passes is tagged dispatch, not cron — the signal a launched
        // skill actually reads to tell the two apart.
        expect(stub.calls[0]!.env?.AUTONOMY_TRIGGER_KIND).toBe('dispatch');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('never sets AUTONOMY_TRIGGER_KIND=cron under any circumstance', () => {
      const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=planner AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
      try {
        const stub = new StubProc().on(() => true, () => ok(''));
        dispatch('planner', { cwd: dir, proc: stub.runner });
        expect(stub.calls[0]!.env?.AUTONOMY_TRIGGER_KIND).not.toBe('cron');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
