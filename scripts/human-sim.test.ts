import { describe, expect, test } from 'bun:test';
import { measureFlow } from './autonomy-ratio.js';
import { simulateHuman } from './human-sim.js';
import { makeDecision } from './public-agent-decision.js';

// A verified HumanTask (shape mirrors @open-autonomy/core HumanTask — inlined so this scripts test needs
// no workspace import). Its `completion` is what makes it fulfillable.
const verifiedTask = {
  ask: 'Review the risky change and approve or reject.',
  assignTo: 'maintainers',
  completion: { ac: 'an authorized decision bound to the reviewed SHA', check: 'both' as const },
};

describe('simulateHuman — a deterministic human stand-in for the testbed', () => {
  test('simulating an approval resolves the task end-to-end (recorded + measured complete)', () => {
    const res = simulateHuman(verifiedTask, { as: 'alice', act: () => 'approve' });
    expect(res).not.toBeNull();
    expect(res!.actor).toBe('human:alice');
    const flow = [
      makeDecision({ stage: 'escalation', issue: 1, actor: 'bot', decision: 'human_required', evidence: [] }, new Date(0)),
      makeDecision({ stage: 'merge_gate', issue: 1, actor: res!.actor, decision: res!.decision, evidence: [] }, new Date(60_000)),
    ];
    const m = measureFlow(flow);
    expect(m.humanResolved).toBe(1);
    expect(m.humanPending).toBe(0);
    expect(m.complete).toBe(true);
  });

  test('simulating an abandon (non-responsive human) leaves the handoff pending — no presumed-done', () => {
    expect(simulateHuman(verifiedTask, { act: () => 'abandon' })).toBeNull();
    const flow = [makeDecision({ stage: 'escalation', issue: 1, actor: 'bot', decision: 'human_required', evidence: [] }, new Date(0))];
    expect(measureFlow(flow).complete).toBe(false);
  });

  test('a notification task (no completion) has nothing to simulate', () => {
    const fyi = { ask: 'FYI: the report is ready.', start: { notify: 'passive' as const } };
    expect(simulateHuman(fyi)).toBeNull();
  });
});
