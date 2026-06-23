import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildGovernanceReport } from './open-autonomy-governance-report.js';
import { buildPreflightReport } from './open-autonomy-preflight.js';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';

describe('open autonomy fleet and audit surfaces', () => {
  test('preflight passes when required files exist and reports unknown config as warnings', () => {
    const report = buildPreflightReport({ root: '.', env: {}, labels: [] });
    expect(report.ready).toBe(true);
    expect(report.checks.some((check) => check.id === 'file:AGENTS.md' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'env:MODEL_PROXY_URL' && check.status === 'warn')).toBe(true);
  });

  test('version metadata exists for run evidence', () => {
    const version = readFileSync('VERSION', 'utf8').trim();
    const metadata = JSON.parse(readFileSync('.open-autonomy/version.json', 'utf8'));
    expect(version).toBe('0.1.0');
    expect(metadata.version).toBe(version);
    expect(metadata.profile).toBe('default');
  });

  test('preflight blocks when required files are missing', () => {
    const report = buildPreflightReport({ root: '/tmp/open-autonomy-missing-root', env: {}, labels: [] });
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:AGENTS.md');
  });

  test('governance report summarizes decision index outcomes', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'retry',
        issue: 22,
        actor: 'retry-budget',
        decision: 'budget_exhausted',
        reason: 'retry budget exhausted',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ], new Date('2026-06-16T12:01:00Z'));
    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
    expect(report.issues_seen).toBe(1);
    expect(report.decisions_seen).toBe(1);
    expect(report.retry_related).toBe(1);
    expect(report.human_required).toBe(1);
  });
});
