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

  // HONEST GAP (verified 2026-06-20): `kind: human` is validated by core but NOT realized distinctly by
  // the github substrate — it currently compiles byte-identically to a model-interpreted agent. The human
  // realization (worklist + escalation + durable pause + simulator hook) is unbuilt; the loop is unproven.
  test.todo('kind: human realizes a worklist + escalation + durable pause, distinct from a model agent', () => {});
});
