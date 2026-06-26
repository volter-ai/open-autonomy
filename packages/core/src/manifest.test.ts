import { describe, expect, test } from 'bun:test';
import { emitAutonomy } from './manifest';
import type { AutonomyIR } from './ir';

const irWithBox = (box: Record<string, unknown>): AutonomyIR => ({
  schema: 'autonomy.ir.v1',
  targets: ['gh-actions'],
  agents: {
    pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '* * * * *' }] },
  },
  policy: { box },
  resources: [],
});

describe('emitAutonomy — policy box', () => {
  test('carries the opaque box verbatim, including profile-specific knobs the substrate does not know', () => {
    // `wip` is not one of the github-known keys (autonomy/risk/merge/planner); it must still survive, or a
    // profile's own governance is silently dropped on the way to the manifest.
    const m = emitAutonomy(
      irWithBox({ wip: { maxInProgress: 1, maxInReview: 1 }, risk: { human_required_topics: ['secrets'] } }),
    );
    expect(m.policy).toEqual({ wip: { maxInProgress: 1, maxInReview: 1 }, risk: { human_required_topics: ['secrets'] } });
  });

  test('an empty box yields an empty policy', () => {
    expect(emitAutonomy(irWithBox({})).policy).toEqual({});
  });
});

describe('emitAutonomy — a kind:human actor', () => {
  const irWithMaintainer = (): AutonomyIR => ({
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents: {
      maintainer: {
        kind: 'human',
        behavior: 'maintainer',
        capabilities: ['tasks:converse', 'code:review'],
        triggers: [{ dispatch: true }],
      },
    },
    policy: { box: {} },
    resources: [],
  });

  test('serializes kind:human with no workflowFile (no launchable job) and the dispatch trigger', () => {
    const m = emitAutonomy(irWithMaintainer());
    const a = m.agents?.maintainer;
    expect(a?.kind).toBe('human');
    expect(a?.workflowFile).toBeUndefined(); // a human has no job to launch
    expect(a?.triggers).toEqual({ dispatch: true }); // dispatch must survive — it's the human's only launch signal
    expect(a?.skill).toBe('maintainer');
  });

  test('does not index a human behavior as an installed skill', () => {
    const m = emitAutonomy(irWithMaintainer());
    expect(m.skills?.maintainer).toBeUndefined(); // the substrate copies no skill file for a person
  });
});
