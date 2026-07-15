import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { agentOf, normalizeSchedule } from './config.ts';

describe('agentOf', () => {
  test('parses any AUTONOMY_AGENT identity without assigning it semantics', () => {
    expect(agentOf('AUTONOMY_AGENT=alpha node scripts/run-agent.mjs')).toBe('alpha');
    expect(agentOf('AUTONOMY_AGENT=beta node scripts/run-agent.mjs')).toBe('beta');
    expect(agentOf('bun scripts/sweep.ts')).toBeNull();
  });
});

describe('normalizeSchedule', () => {
  test('accepts legacy scripts without inferring role or task eligibility', () => {
    const schedule = normalizeSchedule({
      intervalSeconds: 1800,
      scripts: ['AUTONOMY_AGENT=anything node scripts/run-agent.mjs', 'bun scripts/sweep.ts'],
    });
    expect(schedule.jobs.map((job) => job.name)).toEqual(['anything', 'job-2']);
    expect(schedule.jobs.every((job) => job.intervalSeconds === 1800)).toBe(true);
    expect(schedule.jobs.every((job) => job.fence === '.open-autonomy/paused')).toBe(true);
    expect(schedule.scripts).toBe(schedule.jobs); // deprecated migration alias, never a second schedule
    expect(JSON.stringify(schedule)).not.toContain('eligibility');
    expect(JSON.stringify(schedule)).not.toContain('reconciled');
  });

  test('accepts generic jobs with independent cadence, retry, and fences', () => {
    const schedule = normalizeSchedule({
      maxConcurrent: 2,
      env: { FOO: 'bar' },
      jobs: [
        { name: 'frequent-agent', command: 'AUTONOMY_AGENT=alpha node scripts/run-agent.mjs', intervalSeconds: 60, retrySeconds: 15, fence: '.paused' },
        { name: 'infrequent-agent', command: 'AUTONOMY_AGENT=beta node scripts/run-agent.mjs', intervalSeconds: 3600, fence: '.audits-paused' },
      ],
    });
    expect(schedule.maxConcurrent).toBe(2);
    expect(schedule.jobs[0]).toMatchObject({ name: 'frequent-agent', intervalSeconds: 60, retrySeconds: 15, fence: '.paused', agent: 'alpha' });
    expect(schedule.jobs[1]).toMatchObject({ name: 'infrequent-agent', intervalSeconds: 3600, agent: 'beta' });
  });

  test('rejects duplicate names and invalid concurrency without inspecting commands', () => {
    expect(() => normalizeSchedule({ jobs: [
      { name: 'same', command: 'echo one' },
      { name: 'same', command: 'echo two' },
    ] })).toThrow(/duplicate job name/);
    expect(() => normalizeSchedule({ maxConcurrent: 0, jobs: [{ name: 'x', command: 'echo x' }] })).toThrow(/maxConcurrent/);
    expect(() => normalizeSchedule({ jobs: [{ name: 'hot-loop', command: 'echo x', intervalSeconds: 0 }] })).toThrow(/intervalSeconds > 0/);
  });

  test('carries the closed workspace execution field without deriving role semantics', () => {
    const schedule = normalizeSchedule({
      jobs: [{
        name: 'arbitrary',
        agent: 'arbitrary',
        command: 'bun scripts/runner.ts launch arbitrary --workspace isolated',
        workspace: 'isolated',
      }],
    });
    expect(schedule.jobs[0]?.workspace).toBe('isolated');
    expect(() => normalizeSchedule({
      jobs: [{ name: 'bad', command: 'true', workspace: 'private' as never }],
    })).toThrow('workspace must be');
  });
});

test('the substrate implementation contains no tracker or PR eligibility hook', () => {
  const scheduler = readFileSync(new URL('./reconciler.ts', import.meta.url), 'utf8');
  const guards = readFileSync(new URL('./guards.ts', import.meta.url), 'utf8');
  expect(scheduler).not.toMatch(/makeEligibilityCheck|\bztrack\b|\bgh\b|gh-issues/);
  expect(guards).not.toContain('ztrack/preset-kit');
});
