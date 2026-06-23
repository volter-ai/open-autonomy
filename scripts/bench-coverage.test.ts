import { describe, expect, test } from 'bun:test';
import {
  classifyScenarios,
  renderReport,
  scenarioIdFromTitle,
  summarizeMetrics,
  type IssueLite,
} from './bench-coverage.js';

describe('bench coverage grader', () => {
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

  test('a CLOSED resolution scenario is proven; an OPEN one is in-progress', () => {
    const r = classifyScenarios([
      { number: 20, title: '[oa-test:review-low-risk-merge] a', state: 'CLOSED', labels: [] },
      { number: 21, title: '[oa-test:pm-clear-docs] b', state: 'OPEN', labels: [] },
    ]);
    expect(r.find((x) => x.id === 'review-low-risk-merge')?.status).toBe('proven');
    expect(r.find((x) => x.id === 'pm-clear-docs')?.status).toBe('in-progress');
  });

  test('a CLOSED non-resolution scenario without its success label is FAILED, not proven', () => {
    // operator-cancel succeeds via its operator action, not by a bare close — closing it without the
    // escalation/expected state means it did NOT demonstrate the behavior. This is the over-leniency the
    // old `closed => proven` catch-all hid.
    const r = classifyScenarios([{ number: 22, title: '[oa-test:operator-cancel] c', state: 'CLOSED', labels: [] }]);
    expect(r.find((x) => x.id === 'operator-cancel')?.status).toBe('failed');
  });

  test('an escalation scenario (retry-ci-failure) is NOT proven by a bare close', () => {
    // retry-ci-failure ends blocked/escalated (the PR never merges); a bare close is a fail, not proof.
    const r = classifyScenarios([{ number: 23, title: '[oa-test:retry-ci-failure] d', state: 'CLOSED', labels: [] }]);
    expect(r.find((x) => x.id === 'retry-ci-failure')?.status).toBe('failed');
    // but its escalation label proves it
    const r2 = classifyScenarios([{ number: 24, title: '[oa-test:retry-ci-failure] d', state: 'OPEN', labels: ['agent-blocked'] }]);
    expect(r2.find((x) => x.id === 'retry-ci-failure')?.status).toBe('proven');
  });

  test('renders a report with coverage counts', () => {
    const issues: IssueLite[] = [{ number: 10, title: '[oa-test:pm-needs-info] x', state: 'OPEN', labels: ['needs-info'] }];
    const report = renderReport('owner/name', summarizeMetrics(issues, [], []), classifyScenarios(issues), '2026-06-17T00:00:00Z');
    expect(report).toContain('Bench coverage — owner/name');
    expect(report).toContain('Coverage:');
    expect(report).toContain('pm-needs-info');
  });
});
