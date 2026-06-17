import { describe, expect, test } from 'bun:test';
import { bootstrapSteps } from './bootstrap-testbed.js';
import {
  classifyScenarios,
  renderReport,
  scenarioIdFromTitle,
  summarizeMetrics,
  type IssueLite,
} from './testbed-proctor-report.js';

describe('testbed proctor report', () => {
  test('extracts the scenario id from an oa-test issue title', () => {
    expect(scenarioIdFromTitle('[oa-test:pm-needs-info] Improve the docs')).toBe('pm-needs-info');
    expect(scenarioIdFromTitle('Unrelated issue')).toBeUndefined();
  });

  test('summarizes issue/PR/run metrics', () => {
    const issues: IssueLite[] = [
      { number: 1, title: 'a', state: 'OPEN', labels: ['needs-info'] },
      { number: 2, title: 'b', state: 'CLOSED', labels: [] },
    ];
    const metrics = summarizeMetrics(
      issues,
      [{ number: 9, title: 'pr', state: 'MERGED', headRefName: 'agent/issue-2' }],
      [{ name: 'ci', conclusion: 'success', status: 'completed' }, { name: 'ci', conclusion: 'failure', status: 'completed' }],
    );
    expect(metrics.issues).toEqual({ total: 2, open: 1, closed: 1 });
    expect(metrics.labels['needs-info']).toBe(1);
    expect(metrics.prs.merged).toBe(1);
    expect(metrics.runs).toEqual({ success: 1, failure: 1, other: 0 });
  });

  test('classifies scenarios conservatively from live issue state', () => {
    const issues: IssueLite[] = [
      { number: 10, title: '[oa-test:pm-needs-info] x', state: 'OPEN', labels: ['needs-info'] },
      { number: 11, title: '[oa-test:pm-clear-docs] y', state: 'CLOSED', labels: [] },
      { number: 12, title: '[oa-test:pm-human-required-risky-workflow] z', state: 'OPEN', labels: ['human-required'] },
    ];
    const results = classifyScenarios(issues);
    const get = (id: string) => results.find((r) => r.id === id);
    expect(get('pm-needs-info')?.status).toBe('proven');
    expect(get('pm-clear-docs')?.status).toBe('proven');
    expect(get('pm-human-required-risky-workflow')?.status).toBe('proven');
    // a scenario with no seeded issue is pending
    expect(get('head-changed-before-merge')?.status).toBe('pending');
  });

  test('renders a report with coverage counts', () => {
    const issues: IssueLite[] = [{ number: 10, title: '[oa-test:pm-needs-info] x', state: 'OPEN', labels: ['needs-info'] }];
    const report = renderReport('owner/name', summarizeMetrics(issues, [], []), classifyScenarios(issues), '2026-06-17T00:00:00Z');
    expect(report).toContain('Testbed proctor report — owner/name');
    expect(report).toContain('Coverage:');
    expect(report).toContain('pm-needs-info');
  });
});

describe('bootstrap steps', () => {
  test('declares the four ordered bootstrap steps', () => {
    expect(bootstrapSteps().map((s) => s.id)).toEqual(['provision', 'secret-check', 'seed', 'preflight']);
  });
});
