import { describe, expect, test } from 'bun:test';
import { parseTriageDecision, pmApprovedDevelop } from './public-agent-triage.js';

describe('public-agent-triage', () => {
  test('parses strict JSON decisions', () => {
    expect(parseTriageDecision('{"decision":"approve_run","reason":"clear bug"}')).toEqual({
      decision: 'approve_run',
      reason: 'clear bug',
    });
  });

  test('rejects invalid decisions', () => {
    expect(() => parseTriageDecision('{"decision":"spend_everything","reason":"no"}')).toThrow('invalid decision');
  });

  test('approves PM develop handoffs without a second model triage', () => {
    const decision = pmApprovedDevelop({
      number: 6,
      comments: [
        {
          author: { login: 'maintainer' },
          createdAt: '2026-06-16T17:55:27Z',
          body: 'Clarification: please add one sentence to docs/PROJECT.md.',
        },
        {
          author: { login: 'github-actions' },
          createdAt: '2026-06-16T17:56:14Z',
          body: '/agent develop\n\nPM reason: The issue has been clarified with explicit instructions.',
        },
      ],
    });
    expect(decision?.decision).toBe('approve_run');
    expect(decision?.reason).toContain('PM already approved develop');
  });
});
