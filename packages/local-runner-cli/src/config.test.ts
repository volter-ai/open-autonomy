import { describe, expect, test } from 'bun:test';
import { agentOf, normalizeSchedule } from './config.ts';

describe('agentOf', () => {
  test('parses AUTONOMY_AGENT=<role> out of a command line', () => {
    expect(agentOf('AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs')).toBe('manager');
    expect(agentOf('AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs')).toBe('pm');
  });
  test('returns null for a plain script command', () => {
    expect(agentOf('bun scripts/sweep.ts')).toBeNull();
  });
});

describe('normalizeSchedule — legacy shape (scripts: string[])', () => {
  test('one shared intervalSeconds applies to every script line', () => {
    const s = normalizeSchedule({
      intervalSeconds: 1800,
      env: { FOO: 'bar' },
      scripts: ['bun scripts/sweep.ts', 'AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'],
    });
    expect(s.intervalSeconds).toBe(1800);
    expect(s.env).toEqual({ FOO: 'bar' });
    expect(s.scripts).toHaveLength(2);
    expect(s.scripts[0]!.intervalSeconds).toBe(1800);
    expect(s.scripts[1]!.intervalSeconds).toBe(1800);
  });

  test('default reconciled detection: AUTONOMY_AGENT=manager (S6) and AUTONOMY_AGENT=pm (T6) both match; anything else does not', () => {
    const s = normalizeSchedule({
      intervalSeconds: 900,
      scripts: [
        'AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs',
        'AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs',
        'AUTONOMY_AGENT=planner AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs',
        'bun scripts/sweep.ts',
      ],
    });
    expect(s.scripts[0]!.reconciled).toBe(true);
    expect(s.scripts[1]!.reconciled).toBe(true);
    expect(s.scripts[2]!.reconciled).toBe(false);
    expect(s.scripts[3]!.reconciled).toBe(false);
  });

  test('default eligibility variant is ztrack when not specified', () => {
    const s = normalizeSchedule({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=manager node scripts/run-agent.mjs'] });
    expect(s.scripts[0]!.eligibility).toBe('ztrack');
  });
});

describe('normalizeSchedule — new per-script object shape', () => {
  test('per-script intervalSeconds overrides the top-level default (the per-agent-cadence generalization)', () => {
    const s = normalizeSchedule({
      intervalSeconds: 900,
      scripts: [
        { cmd: 'AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs', intervalSeconds: 60, reconciled: true, eligibility: 'gh-issues' },
        { cmd: 'AUTONOMY_AGENT=planner node scripts/run-agent.mjs', intervalSeconds: 1800 },
      ],
    });
    expect(s.scripts[0]!.intervalSeconds).toBe(60);
    expect(s.scripts[0]!.eligibility).toBe('gh-issues');
    expect(s.scripts[1]!.intervalSeconds).toBe(1800);
    expect(s.scripts[1]!.reconciled).toBe(false); // planner never matched the default regex, no explicit override
  });

  test('explicit reconciled:true overrides an agent name that would NOT default-match (e.g. a future second reconciled agent)', () => {
    const s = normalizeSchedule({
      scripts: [{ cmd: 'AUTONOMY_AGENT=strategist node scripts/run-agent.mjs', reconciled: true, eligibility: 'gh-issues' }],
    });
    expect(s.scripts[0]!.reconciled).toBe(true);
    expect(s.scripts[0]!.agent).toBe('strategist');
  });

  test('explicit agent field overrides the parsed AUTONOMY_AGENT (e.g. a wrapper command)', () => {
    const s = normalizeSchedule({ scripts: [{ cmd: 'some-wrapper.sh', agent: 'manager', reconciled: true }] });
    expect(s.scripts[0]!.agent).toBe('manager');
  });

  test('mixed shape: a plain string entry alongside an object entry both normalize correctly', () => {
    const s = normalizeSchedule({
      intervalSeconds: 300,
      scripts: ['bun scripts/sweep.ts', { cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true }],
    });
    expect(s.scripts[0]!.intervalSeconds).toBe(300);
    expect(s.scripts[0]!.reconciled).toBe(false);
    expect(s.scripts[1]!.reconciled).toBe(true);
  });
});
