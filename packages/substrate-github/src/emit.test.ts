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
  // A lifecycle state is realized uniformly as a label of its name — no per-state special-casing.
  test('a `task:` trigger maps to the issues/labeled event, whatever the state', () => {
    for (const state of ['ready', 'in-review', 'human-required', 'done']) {
      const wfs = workflows(compileGithub(irWith([{ task: state }]))); // non-human → a workflow is emitted
      expect(wfs.some((c) => c.includes('issues:') && c.includes('labeled'))).toBe(true);
    }
  });
});

describe('compileGithub — kind: human is declared, not job-realized', () => {
  // A person needs no runner job: the durable "await a human" block is the existing label + merge gate,
  // and how a person is notified/assigned/escalated is config the search varies, not a frozen template.
  test('a human actor generates NO github workflow', () => {
    expect(workflows(compileGithub(irWith([{ task: 'human-required' }], 'human'))).length).toBe(0);
  });

  test('but the human actor IS declared in the manifest (visible labor)', () => {
    const out = compileGithub(irWith([{ task: 'human-required' }], 'human'));
    expect(out.generated['.open-autonomy/autonomy.yml']).toContain('maintainer');
  });

  // Still genuinely unbuilt (the behavioral tier — needs a recorded real run, then a calibrated simulator):
  test.todo('the human seam blocks, escalates on SLA, and resumes on a recorded/redeemed decision', () => {});
});
