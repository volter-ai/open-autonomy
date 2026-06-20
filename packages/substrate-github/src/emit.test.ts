import { describe, expect, test } from 'bun:test';
import { compileGithub } from './emit';
import type { AutonomyIR, Trigger } from '@open-autonomy/core';

function irWith(triggers: Trigger[], kind?: 'agent' | 'human'): AutonomyIR {
  return {
    schema: 'autonomy.ir.v1',
    targets: ['github'],
    agents: {
      maintainer: {
        behavior: 'humans/maintainer-review',
        capabilities: ['tasks:converse'],
        triggers,
        config: {},
        ...(kind ? { kind } : {}),
      },
    },
    policy: { box: {} },
    resources: [],
  };
}

function workflows(out: { generated: Record<string, string> }): string[] {
  return Object.entries(out.generated)
    .filter(([p]) => p.startsWith('.github/workflows/'))
    .map(([, c]) => c);
}

describe('compileGithub — task: trigger realization', () => {
  test('`task: human-required` compiles to an issues/labeled workflow trigger', () => {
    const wfs = workflows(compileGithub(irWith([{ task: 'human-required' }], 'human')));
    expect(wfs.some((c) => c.includes('issues:') && c.includes('labeled'))).toBe(true);
  });

  test('`task: in-review` compiles to a pull_request_target workflow trigger', () => {
    const wfs = workflows(compileGithub(irWith([{ task: 'in-review' }])));
    expect(wfs.some((c) => c.includes('pull_request_target'))).toBe(true);
  });

  // kind: human is now realized DISTINCTLY from a model agent — a person gets no model wrapper.
  test('a human actor compiles distinctly from a model agent with the same behavior', () => {
    const a = JSON.stringify(compileGithub(irWith([{ task: 'human-required' }])).generated);
    const h = JSON.stringify(compileGithub(irWith([{ task: 'human-required' }], 'human')).generated);
    expect(h).not.toBe(a);
  });

  test('a human actor gets NO model machinery (no proxy, no mint, no codex)', () => {
    const wf = workflows(compileGithub(irWith([{ task: 'human-required' }], 'human'))).join('\n');
    expect(wf).not.toContain('MODEL_PROXY');
    expect(wf).not.toContain('model-proxy-mint');
    expect(wf.toLowerCase()).not.toContain('codex');
    expect(wf).toContain('issues:'); // still routed by its task trigger
  });

  // Still genuinely unbuilt (next tier — needs a recorded real run, then a derived/calibrated simulator):
  test.todo('kind: human realizes a worklist + escalation + durable pause + redeem, with a calibrated simulator', () => {});
});
