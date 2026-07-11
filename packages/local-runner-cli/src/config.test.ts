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

describe('normalizeSchedule — identity-aware eligibility defaults (MEDIUM-2: legacy twin schedules)', () => {
  test('legacy string[] manager line defaults to ztrack (S6, supercode)', () => {
    const s = normalizeSchedule({ intervalSeconds: 1800, scripts: ['AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
    expect(s.scripts[0]!.reconciled).toBe(true);
    expect(s.scripts[0]!.eligibility).toBe('ztrack');
  });

  test('legacy string[] pm line defaults to gh-issues (T6, twin) — NEVER ztrack probes on a twin-shaped install', () => {
    const s = normalizeSchedule({ intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
    expect(s.scripts[0]!.reconciled).toBe(true);
    expect(s.scripts[0]!.eligibility).toBe('gh-issues');
  });

  test('object shape without explicit eligibility inherits the identity default too (manager -> ztrack, pm -> gh-issues)', () => {
    const s = normalizeSchedule({
      scripts: [
        { cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true },
        { cmd: 'AUTONOMY_AGENT=pm node scripts/run-agent.mjs', reconciled: true },
      ],
    });
    expect(s.scripts[0]!.eligibility).toBe('ztrack');
    expect(s.scripts[1]!.eligibility).toBe('gh-issues');
  });

  test('an explicit eligibility key always beats the identity default', () => {
    const s = normalizeSchedule({ scripts: [{ cmd: 'AUTONOMY_AGENT=pm node scripts/run-agent.mjs', reconciled: true, eligibility: 'ztrack' }] });
    expect(s.scripts[0]!.eligibility).toBe('ztrack');
  });

  test('a reconciled agent that is neither manager nor pm and has NO explicit eligibility throws a loud config error', () => {
    expect(() => normalizeSchedule({ scripts: [{ cmd: 'AUTONOMY_AGENT=strategist node scripts/run-agent.mjs', reconciled: true }] })).toThrow(
      /no eligibility variant and no proven default/,
    );
  });
});

describe('normalizeSchedule — reconciled-script validation (MEDIUM-3)', () => {
  test('reconciled:true with NO resolvable agent identity throws at load (the in-flight filter could never match)', () => {
    expect(() => normalizeSchedule({ scripts: [{ cmd: 'some-wrapper.sh', reconciled: true, eligibility: 'ztrack' }] })).toThrow(
      /no resolvable agent identity/,
    );
  });

  test('two reconciled scripts sharing one agent identity throw at load (state-key collapse)', () => {
    expect(() =>
      normalizeSchedule({
        scripts: [
          { cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true },
          { cmd: 'AUTONOMY_AGENT=manager node other.mjs', reconciled: true },
        ],
      }),
    ).toThrow(/same agent "manager"/);
  });

  test('two NON-reconciled scripts sharing an agent are fine (no reconciler state to collapse)', () => {
    const s = normalizeSchedule({
      scripts: [
        { cmd: 'AUTONOMY_AGENT=sweeper bun scripts/a.ts' },
        { cmd: 'AUTONOMY_AGENT=sweeper bun scripts/b.ts' },
      ],
    });
    expect(s.scripts).toHaveLength(2);
  });

  test('a reconciled + a non-reconciled script sharing an agent are fine too', () => {
    const s = normalizeSchedule({
      scripts: [
        { cmd: 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs', reconciled: true },
        { cmd: 'AUTONOMY_AGENT=manager bun scripts/nightly-report.ts', reconciled: false },
      ],
    });
    expect(s.scripts.filter((x) => x.reconciled)).toHaveLength(1);
  });
});
