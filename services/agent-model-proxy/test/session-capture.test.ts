import { describe, expect, test } from 'bun:test';
import { sessionTurnsFromBody, redactSecrets } from '../src/session-capture.js';

describe('session-capture', () => {
  test('renders string and block content (text, tool_use, tool_result) into turns', () => {
    const turns = sessionTurnsFromBody({
      messages: [
        { role: 'user', content: 'fix the bug in auth.ts' },
        { role: 'assistant', content: [
          { type: 'text', text: 'Looking at auth.ts now.' },
          { type: 'tool_use', name: 'Read', input: { file_path: 'auth.ts' } },
        ] },
        { role: 'user', content: [{ type: 'tool_result', content: 'line 1\nline 2' }] },
      ],
    });
    expect(turns.length).toBe(3);
    expect(turns[0]).toEqual({ role: 'user', text: 'fix the bug in auth.ts' });
    expect(turns[1].text).toContain('Looking at auth.ts');
    expect(turns[1].text).toContain('[tool: Read]');
    expect(turns[2].text).toContain('[tool result]');
  });

  test('redacts secret-shaped tokens', () => {
    expect(redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 here')).toContain('[redacted]');
    expect(redactSecrets('sk-ant-abcdefghij0123456789ABCDEFGHIJ')).toBe('[redacted]');
    const turns = sessionTurnsFromBody({ messages: [{ role: 'user', content: 'use ghp_abcdefghijklmnopqrstuvwxyz0123456789' }] });
    expect(turns[0].text).not.toContain('ghp_abcd');
    expect(turns[0].text).toContain('[redacted]');
  });

  test('keeps only the last 12 turns and caps long text', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
    const turns = sessionTurnsFromBody({ messages: many });
    expect(turns.length).toBe(12);
    expect(turns[turns.length - 1].text).toBe('msg 29'); // newest kept

    const long = sessionTurnsFromBody({ messages: [{ role: 'user', content: 'x'.repeat(5000) }] });
    expect(long[0].text.length).toBeLessThanOrEqual(1401); // capped + ellipsis
    expect(long[0].text.endsWith('…')).toBe(true);
  });

  test('drops empty turns and tolerates malformed input', () => {
    expect(sessionTurnsFromBody({}).length).toBe(0);
    expect(sessionTurnsFromBody({ messages: 'nope' as unknown as [] }).length).toBe(0);
    expect(sessionTurnsFromBody({ messages: [{ role: 'user', content: [] }] }).length).toBe(0); // empty → dropped
  });
});
