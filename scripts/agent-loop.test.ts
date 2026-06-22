import { describe, expect, test } from 'bun:test';
import { missingRequired, salvageSubmission } from './agent-loop.js';

// runClaudeAgent runs a real agent (Claude Code) end-to-end, so it isn't unit-tested here; these cover the
// pure validation helpers that gate what the agent is allowed to return — the trust backstop on the result.
const schema = {
  type: 'object',
  properties: { decision: { type: 'string' }, reason: { type: 'string' } },
  required: ['decision', 'reason'],
};

describe('agent decision validation', () => {
  test('missingRequired flags absent required keys', () => {
    expect(missingRequired(schema, { decision: 'develop', reason: 'ok' })).toEqual([]);
    expect(missingRequired(schema, { decision: 'develop' })).toEqual(['reason']);
    expect(missingRequired(schema, {})).toEqual(['decision', 'reason']);
  });

  test('salvageSubmission extracts a schema-valid object from a ```json fence', () => {
    const got = salvageSubmission('here is my answer:\n```json\n{"decision":"develop","reason":"clear"}\n```', schema);
    expect(got).toEqual({ decision: 'develop', reason: 'clear' });
  });

  test('salvageSubmission extracts a bare JSON object from prose', () => {
    expect(salvageSubmission('verdict: {"decision":"ignore","reason":"dup"}', schema)).toEqual({ decision: 'ignore', reason: 'dup' });
  });

  test('salvageSubmission rejects text with no schema-valid object', () => {
    expect(salvageSubmission('no json here', schema)).toBeNull();
    expect(salvageSubmission('{"decision":"develop"}', schema)).toBeNull(); // missing required `reason`
  });
});
