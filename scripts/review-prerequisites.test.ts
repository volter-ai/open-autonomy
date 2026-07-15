import { describe, expect, test } from 'bun:test';
import { classifyPrerequisites } from './review-prerequisites';

describe('review prerequisites', () => {
  test('waits for missing and in-progress required contexts while ignoring parallel gates', () => {
    expect(classifyPrerequisites(
      ['ci', 'security', 'agent-review', 'human-approval'],
      [{ name: 'ci', status: 'IN_PROGRESS' }],
      ['human-approval'],
    )).toEqual({ passing: [], pending: ['ci', 'security'], failing: [] });
  });

  test('classifies mechanical failures for deterministic rework', () => {
    expect(classifyPrerequisites(
      ['ci', 'security'],
      [{ name: 'ci', conclusion: 'SUCCESS' }, { context: 'security', state: 'FAILURE' }],
    )).toEqual({ passing: ['ci'], pending: [], failing: [{ name: 'security', state: 'FAILURE' }] });
  });

  test('accepts the terminal states GitHub treats as passing required checks', () => {
    expect(classifyPrerequisites(
      ['ci', 'lint', 'optional'],
      [{ name: 'ci', conclusion: 'SUCCESS' }, { name: 'lint', conclusion: 'NEUTRAL' },
        { name: 'optional', conclusion: 'SKIPPED' }],
    )).toEqual({ passing: ['ci', 'lint', 'optional'], pending: [], failing: [] });
  });

  test('fails closed when duplicate contexts disagree instead of accepting a stale success', () => {
    expect(classifyPrerequisites(
      ['ci'],
      [{ name: 'ci', conclusion: 'SUCCESS' }, { name: 'ci', conclusion: 'FAILURE' }],
    )).toEqual({ passing: [], pending: [], failing: [{ name: 'ci', state: 'FAILURE' }] });
  });
});
