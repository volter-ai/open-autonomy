import { describe, expect, test } from 'bun:test';
import { parseTriageDecision } from './public-agent-triage.js';

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
});
