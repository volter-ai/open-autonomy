import { describe, expect, test } from 'bun:test';
import { isHumanStep, measureFlow } from './autonomy-ratio.js';
import { humanResolution } from './public-agent-merge-gate.js';
import { type DecisionStage, makeDecision } from './public-agent-decision.js';

function dec(stage: DecisionStage, actor: string, decision: string, atMs: number) {
  return makeDecision({ stage, issue: 1, actor, decision, evidence: [] }, new Date(atMs));
}

describe('measureFlow — the autonomy ratio', () => {
  test('an all-agent flow scores ratio 1 and reports cycle time', () => {
    const flow = [
      dec('pm_triage', 'agent-pm', 'develop', 0),
      dec('develop', 'agent-developer', 'pr-ready', 60_000),
      dec('review', 'agent-reviewer', 'pass', 120_000),
      dec('merge_gate', 'bot', 'merge', 180_000),
    ];
    const m = measureFlow(flow);
    expect(m.humanSteps).toBe(0);
    expect(m.autonomyRatio).toBe(1);
    expect(m.cycleTimeMs).toBe(180_000);
  });

  test('an UNRESOLVED handoff is pending, not done (no presumed-done)', () => {
    const flow = [
      dec('pm_triage', 'agent-pm', 'develop', 0),
      dec('review', 'agent-reviewer', 'risky', 60_000),
      dec('escalation', 'bot', 'human_required', 120_000), // handed off, never answered
    ];
    const m = measureFlow(flow);
    expect(m.agentSteps).toBe(2);
    expect(m.humanHandoffs).toBe(1);
    expect(m.humanResolved).toBe(0);
    expect(m.humanPending).toBe(1);
    expect(m.complete).toBe(false); // the flow is NOT done — a human was required but never resolved it
    expect(m.autonomyRatio).toBeCloseTo(2 / 3, 5);
  });

  test('a handoff answered by a verified resolution is complete', () => {
    const flow = [
      dec('review', 'agent-reviewer', 'risky', 0),
      dec('escalation', 'bot', 'human_required', 60_000),
      dec('merge_gate', 'human:alice', 'approved', 120_000), // the human resolved it
    ];
    const m = measureFlow(flow);
    expect(m.humanHandoffs).toBe(1);
    expect(m.humanResolved).toBe(1);
    expect(m.humanPending).toBe(0);
    expect(m.complete).toBe(true);
  });

  test('isHumanStep flags escalation, human actors, and human_required', () => {
    expect(isHumanStep(dec('escalation', 'bot', 'x', 0))).toBe(true);
    expect(isHumanStep(dec('review', 'human-maintainer', 'approve', 0))).toBe(true);
    expect(isHumanStep(dec('merge_gate', 'bot', 'human_required', 0))).toBe(true);
    expect(isHumanStep(dec('develop', 'agent-developer', 'pr-ready', 0))).toBe(false);
  });

  test('an empty flow is ratio 1, complete, with zero cycle time (no steps)', () => {
    expect(measureFlow([])).toEqual({
      steps: 0, agentSteps: 0, humanSteps: 0, humanHandoffs: 0, humanResolved: 0,
      humanPending: 0, complete: true, autonomyRatio: 1, cycleTimeMs: 0,
    });
  });

  test('the human seam end-to-end: observe a resolution → record human:<login> → the ratio counts it', () => {
    // A maintainer holds, then unblocks — the merge gate observes the resolution with attribution.
    const res = humanResolution({
      comments: [
        { body: 'hold, needs maintainer', createdAt: '2026-06-20T10:00:00Z', author: { login: 'alice' } },
        { body: 'ok to merge', createdAt: '2026-06-20T11:00:00Z', author: { login: 'alice' } },
      ],
    });
    expect(res).toEqual({ login: 'alice', at: '2026-06-20T11:00:00Z' });

    // Recorded with the human:<login> convention, the resolution counts as a human step.
    const resolution = makeDecision(
      { stage: 'merge_gate', issue: 1, actor: `human:${res!.login}`, decision: 'approved', evidence: [] },
      new Date(Date.parse(res!.at)),
    );
    expect(isHumanStep(resolution)).toBe(true);

    const flow = [
      makeDecision({ stage: 'pm_triage', issue: 1, actor: 'agent-pm', decision: 'develop', evidence: [] }, new Date(0)),
      makeDecision({ stage: 'review', issue: 1, actor: 'agent-reviewer', decision: 'risky', evidence: [] }, new Date(60_000)),
      resolution,
    ];
    const m = measureFlow(flow);
    expect(m.humanSteps).toBe(1); // the human:alice resolution — human *work*, not just a handoff
    expect(m.agentSteps).toBe(2);
    expect(m.autonomyRatio).toBeCloseTo(2 / 3, 5);
  });
});
