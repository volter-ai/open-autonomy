import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from './once.ts';
import { pause } from './pause.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';
import { StubProc, ok } from './test-support/stub-proc.ts';

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-once-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  return dir;
}

describe('oa once — fires each currently unfenced job once, with no cadence state', () => {
  test('a legacy pause fence skips its job before runner preflight', async () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      pause({ cwd: dir });
      const stub = new StubProc(); // no handlers registered — a termfleet-missing check would also fail, but PAUSED must win
      const r = await once({ cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(true);
      expect(r.fired).toBe(0);
      expect(stub.calls).toHaveLength(0); // never even reached the termfleet/OA-04/OA-03 guards
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the conventional pause marker does not block a generic job that declares no such fence', async () => {
    const dir = tmpRepo({ jobs: [{ name: 'maintenance', command: 'bun scripts/maintenance.ts', intervalSeconds: 900 }] });
    try {
      pause({ cwd: dir });
      const stub = new StubProc().on(() => true, () => ok(''));
      const r = await once({ cwd: dir, proc: stub.runner });
      expect(r).toEqual({ ok: true, fired: 1 });
      expect(stub.calls.some((call) => call.cmd === 'bun scripts/maintenance.ts')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports a nonzero scheduled command as a failed once run', async () => {
    const dir = tmpRepo({ jobs: [{ name: 'broken', command: 'bun scripts/broken.ts', intervalSeconds: 900 }] });
    try {
      const stub = new StubProc().on(() => true, (cmd) => cmd === 'bun scripts/broken.ts'
        ? { status: 7, stdout: '', stderr: 'broken' }
        : ok(''));
      const r = await once({ cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
      expect(r.fired).toBe(1);
      expect(r.reason).toContain('1 of 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a script-only schedule (no run-agent.mjs) fires every command, needing no termfleet/OA-04 probe', async () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/a.ts', 'bun scripts/b.ts'] });
    try {
      const stub = new StubProc()
        .on((c) => c === 'git', () => ok('')) // rev-parse --git-dir (OA-03) probe
        .on((c) => c.startsWith('bun '), () => ok('')); // fireCommands passes the FULL line as `cmd` (shell:true, args:[])
      const r = await once({ cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(true);
      expect(r.fired).toBe(2);
      expect(stub.calls.filter((c) => c.cmd.startsWith('bun ')).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a schedule needing the runner, but termfleet not installed, fails naming the fix and fires NOTHING', async () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      const stub = new StubProc();
      const r = await once({ cwd: dir, proc: stub.runner });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('npm install termfleet');
      expect(r.fired).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a schedule needing the runner, termfleet installed cleanly, fires (real subprocess node probe for OA-04 + real git probe for OA-03)', async () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
      writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
      Bun.spawnSync(['git', 'init', '-q'], { cwd: dir });
      // Use the REAL defaultProc for the node-based OA-04 probe (it needs to actually resolve via a real
      // `node` subprocess) and the real `git` probes (OA-03), but intercept the FINAL fired schedule
      // command so no real launch happens.
      const proc: ProcRunner = (cmd, args, opts) => {
        if (cmd === 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs') return ok('');
        return defaultProc(cmd, args, opts);
      };
      // A pinned ambient makes OA-09 resolve deterministically ('env' fast path — never a network/dynamic-
      // import discovery) AND lets this test assert the origin export lands in the tick env's source object.
      const ambient: NodeJS.ProcessEnv = { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7999' };
      const r = await once({ cwd: dir, proc, ambient });
      expect(r.ok).toBe(true);
      expect(r.fired).toBe(1);
      expect(ambient.AUTONOMY_PROVIDER_URL_SOURCE).toBe('env'); // OA-09 origin export ran in --once mode too
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
