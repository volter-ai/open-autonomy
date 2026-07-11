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

  test('dispatch WORKS EVEN WHILE PAUSED — the documented workaround for the first-run circularity (the paused driver fires nothing, but a manual dispatch must still be possible)', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=planner node scripts/run-agent.mjs'] });
    try {
      pause({ cwd: dir });
      const stub = new StubProc().on(() => true, () => ok(''));
      const r = dispatch('planner', { cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(true); // NOT blocked by the fence
      expect(stub.calls).toHaveLength(1);
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
});
