import { describe, expect, test } from 'bun:test';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';

const baseIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: {
    sweep: {
      behavior: 'scripts/sweep.ts',
      capabilities: ['tasks:converse'],
      triggers: [{ cron: '*/15 * * * *' }],
    },
  },
  policy: { box: {} },
  resources: [],
};

describe('compileLocal — one scheduler contract', () => {
  test('always emits the self-contained driver; profile policy cannot select an implementation', () => {
    const ordinary = compileLocal(baseIr).generated['scheduler/run.mjs'];
    const withDecorativeLegacyKey = compileLocal({
      ...baseIr,
      policy: { box: { local: { runner: 'cli' } } },
    }).generated['scheduler/run.mjs'];
    expect(ordinary).toBe(withDecorativeLegacyKey);
    expect(ordinary).not.toContain("from '@volter/oa'");
    expect(ordinary).toContain('const jobs = Array.isArray(schedule.jobs)');
  });

  test('always emits generic per-job schedule data', () => {
    const schedule = JSON.parse(compileLocal(baseIr).generated['scheduler/schedule.json']) as {
      schema: string;
      jobs: Array<Record<string, unknown>>;
    };
    expect(schedule.schema).toBe('open-autonomy.local-schedule.v2');
    expect(schedule.jobs).toHaveLength(1);
    expect(schedule.jobs[0]).toMatchObject({
      name: 'sweep',
      command: 'bun scripts/sweep.ts',
      intervalSeconds: 900,
      fence: '.open-autonomy/paused',
    });
    expect(schedule).not.toHaveProperty('scripts');
  });

  test('emits a compiler-owned target enforcement report', () => {
    const report = JSON.parse(compileLocal(baseIr).generated['.open-autonomy/enforcement.json']);
    expect(report).toMatchObject({ schema: 'open-autonomy.enforcement.v1', target: 'local', generated: true });
    expect(report.controls.some((control: { control: string }) => control.control === 'agent.sweep.capabilities')).toBe(true);
  });

  test('carries declared workspace isolation into the actual Runner launch', () => {
    const ir: AutonomyIR = {
      ...baseIr,
      agents: {
        planner: {
          behavior: 'planner',
          capabilities: ['tasks:author'],
          triggers: [{ cron: '13 5 * * *' }],
          execution: { workspace: 'isolated' },
        },
      },
    };
    const schedule = JSON.parse(compileLocal(ir).generated['scheduler/schedule.json']) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(schedule.jobs[0]).toMatchObject({
      name: 'planner',
      agent: 'planner',
      workspace: 'isolated',
      command: 'AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch planner --workspace isolated --fence .open-autonomy/paused',
    });
  });

  test('applies adopter-owned independent fences and retry timing without profile or scheduler role logic', () => {
    const ir: AutonomyIR = {
      ...baseIr,
      agents: {
        executor: {
          behavior: 'executor',
          capabilities: ['tasks:author'],
          triggers: [{ cron: '*/30 * * * *' }],
          execution: { workspace: 'isolated' },
        },
        analyst: {
          behavior: 'analyst',
          capabilities: ['tasks:author'],
          triggers: [{ cron: '23 6 * * *' }],
          execution: { workspace: 'isolated' },
        },
      },
    };
    const compiled = compileLocal(ir, {
      scheduleConfig: {
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { fence: '.open-autonomy/execution-paused', retrySeconds: 120 },
        agents: { analyst: { fence: '.open-autonomy/analysis-paused', retrySeconds: 3600 } },
      },
    });
    const schedule = JSON.parse(compiled.generated['scheduler/schedule.json']) as { jobs: Array<Record<string, unknown>> };

    expect(schedule.jobs[0]).toMatchObject({
      name: 'executor',
      fence: '.open-autonomy/execution-paused',
      retrySeconds: 120,
      command: 'AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch executor --workspace isolated --fence .open-autonomy/execution-paused',
    });
    expect(schedule.jobs[1]).toMatchObject({
      name: 'analyst',
      fence: '.open-autonomy/analysis-paused',
      retrySeconds: 3600,
      command: 'AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch analyst --workspace isolated --fence .open-autonomy/analysis-paused',
    });
    expect(compiled.generated['.open-autonomy/paused']).toContain('rm .open-autonomy/paused');
    expect(compiled.generated['.open-autonomy/execution-paused']).toContain('rm .open-autonomy/execution-paused');
    expect(compiled.generated['.open-autonomy/analysis-paused']).toContain('rm .open-autonomy/analysis-paused');
    const manifest = JSON.parse(compiled.generated['.open-autonomy/generated.json']) as { files: string[] };
    expect(manifest.files).not.toContain('.open-autonomy/paused');
    expect(manifest.files).not.toContain('.open-autonomy/execution-paused');
    expect(manifest.files).not.toContain('.open-autonomy/analysis-paused');
  });

  test('fails closed on unknown agents and unsafe fence paths in local schedule config', () => {
    expect(() => compileLocal(baseIr, {
      scheduleConfig: {
        schema: 'open-autonomy.local-schedule-config.v1',
        agents: { missing: { fence: '.open-autonomy/paused' } },
      },
    })).toThrow(/does not name a scheduled agent/);
    expect(() => compileLocal(baseIr, {
      scheduleConfig: {
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { fence: '../outside' },
      },
    })).toThrow(/safe relative path/);
  });
});
