import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { NoopHumanRunner, handoffDecision, type HumanTask } from './human-runner.js';
import { classifyStep, measureFlow } from './autonomy-ratio.js';

const task: HumanTask = {
  issue: 7,
  actorClass: 'maintainer',
  ask: 'Approve the dependency-trust change before it can merge.',
  completionCondition: 'An authorized /agent approve from a maintainer.',
  requestedBy: 'reviewer',
};

describe('human runner — the no-op (bookkeeping) floor', () => {
  test('run records a handoff and returns a handle; status is honestly unknown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'human-runner-'));
    const runner = new NoopHumanRunner(dir);

    const handle = runner.run(task);
    expect(handle).toMatch(/^dec_[a-f0-9]{12,}$/);

    const state = runner.status(handle);
    expect(state.status).toBe('unknown'); // never fabricates `complete`
    expect(state.history).toHaveLength(1); // the recorded handoff is the audit trail
    expect(state.history[0].id).toBe(handle);
    expect(state.note).toContain('bookkeeping-only');
  });

  test('the recorded handoff carries the ask + completion condition, as an escalation decision', () => {
    const dec = handoffDecision(task);
    expect(dec.stage).toBe('escalation');
    expect(dec.decision).toBe('human_required:maintainer');
    expect(dec.reason).toBe(task.ask);
    expect(dec.next_action).toBe(task.completionCondition); // the completion condition is recorded, not lost
    expect(dec.subject).toEqual({ type: 'issue', number: 7 });
  });

  test('the autonomy grader counts the bookkeeping record as a human handoff (pending until resolved)', () => {
    const dec = handoffDecision(task);
    expect(classifyStep(dec)).toBe('handoff');
    const flow = measureFlow([dec]);
    expect(flow.humanHandoffs).toBe(1);
    expect(flow.humanPending).toBe(1); // a no-op runner never resolves it → the flow is not complete
    expect(flow.complete).toBe(false);
  });
});
