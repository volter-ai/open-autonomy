// U4: policy.box.local.runner === "cli" opt-in — compileLocal emits a thin shim delegating to the
// versioned @volter/oa package instead of the byte-copied LOOP_DRIVER template. DEFAULT UNCHANGED: a
// profile that never sets this key gets the exact same scheduler/run.mjs bytes as before this change (the
// existing catalog — hello/self-driving/simple-sdlc/simple-gh-sdlc — all compile through the unopted-in
// path; check:profiles already re-proves this for every bundled profile every run).
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal, isCliRunner } from './emit';

const baseIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

const cliRunnerIr: AutonomyIR = { ...baseIr, policy: { box: { local: { runner: 'cli' } } } };
const isolatedProseIr: AutonomyIR = {
  ...cliRunnerIr,
  agents: {
    planner: {
      behavior: 'planner',
      capabilities: ['tasks:author'],
      triggers: [{ cron: '13 5 * * *' }],
      execution: { workspace: 'isolated' },
    },
  },
};

describe('isCliRunner', () => {
  test('false when policy.box carries no local.runner key (the default)', () => {
    expect(isCliRunner(baseIr)).toBe(false);
  });
  test('false when local.runner is some other value', () => {
    expect(isCliRunner({ ...baseIr, policy: { box: { local: { runner: 'template' } } } })).toBe(false);
  });
  test('true only for the exact opt-in value', () => {
    expect(isCliRunner(cliRunnerIr)).toBe(true);
  });
});

describe('compileLocal — DEFAULT UNCHANGED', () => {
  test('a profile with no local.runner policy key emits the ORIGINAL byte-copied run.mjs template (contains the full driver source, not an import shim)', () => {
    const out = compileLocal(baseIr);
    const runMjs = out.generated['scheduler/run.mjs'];
    expect(runMjs).toContain('#!/usr/bin/env node');
    expect(runMjs).not.toContain("from '@volter/oa'");
    // A structural fingerprint of the full byte-copied template (the S6-shaped reconciler comment this
    // package's README explicitly says the default template does NOT yet carry — see docs note below):
    expect(runMjs).toContain('PAUSE GATE');
    expect(runMjs.length).toBeGreaterThan(5000); // the full template, not a thin shim
  });
});

describe('compileLocal — policy.box.local.runner === "cli" opt-in', () => {
  test('emits a thin shim importing @volter/oa instead of the full template', () => {
    const out = compileLocal(cliRunnerIr);
    const runMjs = out.generated['scheduler/run.mjs'];
    expect(runMjs).toContain("from '@volter/oa'");
    expect(runMjs).toContain('runCli(process.argv.slice(2))');
    expect(runMjs.length).toBeLessThan(1000); // genuinely thin
  });

  test('emits generic per-job schedule data without role or task eligibility fields', () => {
    const schedule = JSON.parse(compileLocal(cliRunnerIr).generated['scheduler/schedule.json']) as { jobs: Array<Record<string, unknown>> };
    expect(schedule.jobs).toHaveLength(1);
    expect(schedule.jobs[0]).toMatchObject({ name: 'sweep', command: 'bun scripts/sweep.ts', intervalSeconds: 900 });
    expect(schedule.jobs[0]).not.toHaveProperty('agent');
    expect(JSON.stringify(schedule)).not.toContain('eligibility');
    expect(JSON.stringify(schedule)).not.toContain('reconciled');
  });

  test('carries declared workspace isolation and routes the scheduled prose launch through the Runner', () => {
    const schedule = JSON.parse(compileLocal(isolatedProseIr).generated['scheduler/schedule.json']) as { jobs: Array<Record<string, unknown>> };
    expect(schedule.jobs[0]).toMatchObject({
      name: 'planner',
      agent: 'planner',
      workspace: 'isolated',
      command: 'AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch planner --workspace isolated --fence .open-autonomy/paused',
    });
    expect(JSON.stringify(schedule)).not.toContain('code:propose');
    expect(JSON.stringify(schedule)).not.toContain('pull-request');
  });

  test('every other generated file is byte-identical to the non-opted-in compile (the opt-in is additive, scoped to run.mjs only)', () => {
    const withCli = compileLocal(cliRunnerIr).generated;
    const withoutCli = compileLocal(baseIr).generated;
    const keysA = Object.keys(withCli).sort();
    const keysB = Object.keys(withoutCli).sort();
    expect(keysA).toEqual(keysB);
    for (const k of keysA) {
      if (k === 'scheduler/run.mjs' || k === 'scheduler/schedule.json') continue;
      if (k === '.open-autonomy/autonomy.yml') continue; // carries the policy box itself, legitimately differs
      expect(withCli[k]).toBe(withoutCli[k]);
    }
  });
});

// Real end-to-end proof: the emitted shim, wired to a REAL (symlinked) copy of this source repo's own
// @volter/oa package, actually resolves and runs under plain `node` — argv-compatible with the legacy
// contract (`node scheduler/run.mjs --once` / no-args continuous), matching every existing
// scheduler/run.mjs subprocess test's calling convention (pause-gate.test.ts, scheduler-termfleet-guard.
// test.ts, provider-pin.test.ts, ...).
describe('compileLocal — CLI-runner shim, real subprocess proof', () => {
  function scaffoldWithRealOaPackage(ir: AutonomyIR): { dir: string; sentinel: string } {
    const out = compileLocal(ir);
    const dir = mkdtempSync(join(tmpdir(), 'oa-cli-shim-'));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']);
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), out.generated['scheduler/schedule.json']);
    const sentinel = join(dir, 'sentinel.log');
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'sweep.ts'), `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(sentinel)}, 'tick\\n');\n`);
    // Symlink this monorepo's own real packages/local-runner-cli into the fixture's node_modules/@volter/oa
    // — the exact "npm install @volter/oa" dependency the design contract requires, made real for the test
    // instead of hand-rolling a fake stub of the whole package.
    const realPkg = resolve(import.meta.dirname, '..', '..', 'local-runner-cli');
    mkdirSync(join(dir, 'node_modules', '@volter'), { recursive: true });
    symlinkSync(realPkg, join(dir, 'node_modules', '@volter', 'oa'));
    return { dir, sentinel };
  }

  test('`node scheduler/run.mjs --once` (legacy argv) fires the schedule via the CLI shim', () => {
    const { dir, sentinel } = scaffoldWithRealOaPackage(cliRunnerIr);
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(Bun.file(sentinel).size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the shim honors the job fence by skipping the fenced job', () => {
    const { dir, sentinel } = scaffoldWithRealOaPackage(cliRunnerIr);
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'test paused\n');
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
