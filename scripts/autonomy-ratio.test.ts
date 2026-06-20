import { describe, expect, test } from 'bun:test';
import { isHumanStep, measureFlow } from './autonomy-ratio.js';
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

  test('a flow with a human handoff scores below 1', () => {
    const flow = [
      dec('pm_triage', 'agent-pm', 'develop', 0),
      dec('review', 'agent-reviewer', 'risky', 60_000),
      dec('escalation', 'bot', 'human_required', 120_000),
    ];
    const m = measureFlow(flow);
    expect(m.agentSteps).toBe(2);
    expect(m.humanSteps).toBe(1);
    expect(m.autonomyRatio).toBeCloseTo(2 / 3, 5);
  });

  test('isHumanStep flags escalation, human actors, and human_required', () => {
    expect(isHumanStep(dec('escalation', 'bot', 'x', 0))).toBe(true);
    expect(isHumanStep(dec('review', 'human-maintainer', 'approve', 0))).toBe(true);
    expect(isHumanStep(dec('merge_gate', 'bot', 'human_required', 0))).toBe(true);
    expect(isHumanStep(dec('develop', 'agent-developer', 'pr-ready', 0))).toBe(false);
  });

  test('an empty flow is ratio 1 with zero cycle time (no steps)', () => {
    expect(measureFlow([])).toEqual({ steps: 0, agentSteps: 0, humanSteps: 0, autonomyRatio: 1, cycleTimeMs: 0 });
  });
});
