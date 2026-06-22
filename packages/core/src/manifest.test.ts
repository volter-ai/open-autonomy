import { describe, expect, test } from 'bun:test';
import { emitAutonomy } from './manifest';
import type { AutonomyIR } from './ir';

const irWithBox = (box: Record<string, unknown>): AutonomyIR => ({
  schema: 'autonomy.ir.v1',
  targets: ['github'],
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
