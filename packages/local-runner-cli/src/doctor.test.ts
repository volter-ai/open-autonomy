import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctor } from './doctor.ts';
import { pause } from './pause.ts';
import { defaultProc } from './proc.ts';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'oa-doctor-'));
}
function writeSchedule(dir: string, schedule: object): void {
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
}

describe('oa doctor', () => {
  test('malformed schedule.json fails the schedule.json check and skips downstream checks', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), '{ not json');
      const r = await doctor({ cwd: dir });
      expect(r.ok).toBe(false);
      const check = r.checks.find((c) => c.name === 'schedule.json');
      expect(check!.ok).toBe(false);
      expect(check!.detail).toContain('parse failed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a script-only schedule needs no runner deps and no provider probe', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = await doctor({ cwd: dir });
      const dep = r.checks.find((c) => c.name === 'dep-integrity');
      expect(dep!.ok).toBe(true);
      expect(dep!.detail).toContain('script-only');
      expect(r.checks.some((c) => c.name === 'provider-health')).toBe(false);
      const prompts = r.checks.find((c) => c.name === 'prompts');
      expect(prompts!.ok).toBe(true);
      expect(prompts!.detail).toContain('script-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a schedule needing the runner but termfleet not installed fails dep-integrity, naming the fix', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    try {
      const r = await doctor({ cwd: dir, proc: defaultProc });
      const dep = r.checks.find((c) => c.name === 'dep-integrity');
      expect(dep!.ok).toBe(false);
      expect(dep!.detail).toContain('termfleet not installed');
      expect(r.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a schedule needing the runner, termfleet cleanly installed, passes dep-integrity (real node subprocess probe)', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
    try {
      const r = await doctor({ cwd: dir, proc: defaultProc, fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch });
      const dep = r.checks.find((c) => c.name === 'dep-integrity');
      expect(dep!.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('provider-health (--live) reports reachable when fetchImpl resolves ok', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' }, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
    try {
      let calledUrl = '';
      const fetchImpl = (async (url: string) => {
        calledUrl = String(url);
        return new Response('', { status: 200 });
      }) as unknown as typeof fetch;
      const r = await doctor({ cwd: dir, proc: defaultProc, fetchImpl, env: {}, live: true });
      const health = r.checks.find((c) => c.name === 'provider-health');
      expect(health!.ok).toBe(true);
      expect(calledUrl).toBe('http://127.0.0.1:7602/healthz');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('provider-health (--live) reports unreachable when fetchImpl rejects', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' }, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
    try {
      const fetchImpl = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;
      const r = await doctor({ cwd: dir, proc: defaultProc, fetchImpl, env: {}, live: true });
      const health = r.checks.find((c) => c.name === 'provider-health');
      expect(health!.ok).toBe(false);
      expect(health!.detail).toContain('unreachable');
      expect(r.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fence check reports PAUSED with the operator reason; does not itself fail the overall report', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    pause({ cwd: dir, reason: 'operator: maintenance window' });
    try {
      const r = await doctor({ cwd: dir });
      const fence = r.checks.find((c) => c.name === 'fence');
      expect(fence!.ok).toBe(true);
      expect(fence!.detail).toContain('PAUSED');
      expect(fence!.detail).toContain('maintenance window');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prompts/skills existence per declared agent: missing prompt file fails, present passes', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, {
      intervalSeconds: 900,
      scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs', 'AUTONOMY_AGENT=planner node scripts/run-agent.mjs'],
    });
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
    mkdirSync(join(dir, 'scripts', 'prompts', 'claude'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'prompts', 'claude', 'manager.txt'), '/manager\n');
    try {
      const r = await doctor({ cwd: dir, fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch });
      const managerCheck = r.checks.find((c) => c.name === 'prompts:manager');
      const plannerCheck = r.checks.find((c) => c.name === 'prompts:planner');
      expect(managerCheck!.ok).toBe(true);
      expect(plannerCheck!.ok).toBe(false);
      expect(plannerCheck!.detail).toContain('missing');
      expect(r.ok).toBe(false); // planner's missing prompt fails the overall report
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('formatDoctorReport renders every check with an OK/FAIL prefix and a final verdict line', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const { formatDoctorReport } = await import('./doctor.ts');
      const r = await doctor({ cwd: dir });
      const text = formatDoctorReport(r);
      expect(text).toContain('OK  ');
      expect(text).toContain('all checks passed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('oa doctor — the --live gate (MEDIUM-1: the network probe must be opt-in)', () => {
  test('WITHOUT --live: the /healthz probe is skipped (fetch never called), reported as an informational OK check', async () => {
    const dir = tmpRepo();
    writeSchedule(dir, { intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' }, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: { '.': './i.js' } }));
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'i.js'), 'export default 1;\n');
    try {
      let fetchCalls = 0;
      const fetchImpl = (async () => {
        fetchCalls += 1;
        return new Response('', { status: 200 });
      }) as unknown as typeof fetch;
      const r = await doctor({ cwd: dir, proc: defaultProc, fetchImpl, env: {} }); // no live
      const health = r.checks.find((c) => c.name === 'provider-health');
      expect(health!.ok).toBe(true);
      expect(health!.detail).toContain('skipped');
      expect(health!.detail).toContain('--live');
      expect(fetchCalls).toBe(0); // the network probe genuinely never ran
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
