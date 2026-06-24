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

describe('compileGithub — dispatch trigger realization', () => {
  // A dispatch trigger is invoked on demand through the Runner — every workflow already exposes
  // workflow_dispatch, so a dispatch trigger adds NO extra `on:` event (no issues:labeled label-watching).
  test('a `dispatch` trigger emits workflow_dispatch and adds no issues-event to `on:`', () => {
    const wfs = workflows(compileGithub(irWith([{ dispatch: true }]))); // non-human → a workflow is emitted
    expect(wfs.length).toBe(1);
    expect(wfs[0]).toContain('workflow_dispatch:');
    // dispatch adds nothing to `on:` beyond the always-present launch surface — no `issues:` label-watch.
    const onBlock = wfs[0]!.slice(wfs[0]!.indexOf('\non:'), wfs[0]!.indexOf('\njobs:'));
    expect(onBlock.includes('\n  issues:')).toBe(false);
  });
});

describe('compileGithub — kind: human is declared, not job-realized', () => {
  // A person needs no runner job: the durable "await a human" block is the existing label + merge boundary,
  // and how a person is notified/assigned/escalated is config the search varies, not a frozen template.
  test('a human actor generates NO github workflow', () => {
    expect(workflows(compileGithub(irWith([{ dispatch: true }], 'human'))).length).toBe(0);
  });

  test('but the human actor IS declared in the manifest (visible labor)', () => {
    const out = compileGithub(irWith([{ dispatch: true }], 'human'));
    expect(out.generated['.open-autonomy/autonomy.yml']).toContain('maintainer');
  });

  // Still genuinely unbuilt (the behavioral tier — needs a recorded real run, then a calibrated simulator):
  test.todo('the human seam blocks, escalates on SLA, and resumes on a recorded/redeemed decision', () => {});
});
