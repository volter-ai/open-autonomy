import { describe, expect, test } from 'bun:test';
import type { AutonomyIR } from './ir';
import { enforcementReport } from './enforcement';

const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local', 'gh-actions'],
  agents: {
    worker: {
      behavior: 'worker',
      capabilities: ['code:propose@src'],
      execution: { workspace: 'isolated' },
      timeout: 30,
      prelaunch: 'bun prepare.ts',
      triggers: [{ cron: '*/15 * * * *' }, { event: 'pull_request' }],
    },
    maintainer: {
      kind: 'human',
      behavior: 'maintainer',
      capabilities: ['code:review'],
      triggers: [{ dispatch: true }],
    },
  },
  policy: { maxConcurrent: 1, box: { decorative: { status: 'enforced' } } },
  resources: [],
};

describe('compiler-derived enforcement report', () => {
  test('local is honest about hard controls and degraded declarations', () => {
    const report = enforcementReport(ir, 'local');
    const byControl = new Map(report.controls.map((control) => [control.control, control.status]));
    expect(byControl.get('policy.maxConcurrent')).toBe('partial');
    expect(byControl.get('agent.worker.execution.workspace')).toBe('enforced');
    expect(byControl.get('agent.worker.timeout')).toBe('unsupported');
    expect(byControl.get('agent.worker.trigger.event:pull_request')).toBe('partial');
    expect(byControl.get('agent.maintainer.human-dispatch')).toBe('partial');
    expect(byControl.get('agent.worker.capabilities')).toBe('unsupported');
  });

  test('opaque profile policy cannot author or override an enforcement claim', () => {
    const report = enforcementReport(ir, 'local');
    expect(report.controls.some((control) => control.control.includes('decorative'))).toBe(false);
    expect(report.controls.every((control) => ['enforced', 'partial', 'unsupported'].includes(control.status))).toBe(true);
  });

  test('GitHub reports its inverse prelaunch/timeout realization', () => {
    const report = enforcementReport(ir, 'gh-actions');
    const byControl = new Map(report.controls.map((control) => [control.control, control.status]));
    expect(byControl.get('agent.worker.timeout')).toBe('enforced');
    expect(byControl.get('agent.worker.prelaunch')).toBe('unsupported');
    expect(byControl.get('agent.worker.capabilities')).toBe('partial');
    expect(byControl.get('policy.maxConcurrent')).toBe('partial');
  });
});
