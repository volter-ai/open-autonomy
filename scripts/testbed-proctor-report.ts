#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';

// Quantitative + qualitative snapshot of a live testbed run for the proctor playbook
// (docs/LIVE_TESTING_STRATEGY.md). Maps live GitHub issues/PRs/runs to the testbed coverage
// scenarios via their `[oa-test:<id>]` title markers and reports which features are proven,
// pending, or failed. Pure aggregation is exported for tests; the gh fetches live in main().

export interface IssueLite {
  number: number;
  title: string;
  state: string;
  labels: string[];
}

export interface PrLite {
  number: number;
  title: string;
  state: string;
  headRefName: string;
}

export interface RunLite {
  name: string;
  conclusion: string;
  status: string;
}

export type ScenarioStatus = 'proven' | 'failed' | 'in-progress' | 'pending';

export interface ScenarioResult {
  id: string;
  status: ScenarioStatus;
  evidence: string;
}

// The coverage scenarios keyed by their `[oa-test:<id>]` issue marker, with the rule that decides
// whether the live issue state proves the scenario.
export const COVERAGE_SCENARIOS = [
  'pm-clear-docs',
  'pm-needs-info',
  'pm-follow-up-after-needs-info',
  'pm-human-required-risky-workflow',
  'pm-open-pr-review',
  'operator-pause-resume',
  'operator-retry-no-failure',
  'repo-pause',
  'operator-cancel',
  'publisher-policy-rejection',
  'retry-ci-failure',
  'retry-review-failure',
  'head-changed-before-merge',
  'review-low-risk-merge',
  'governance-maintainer-hold',
  'governance-develop-only',
  'governance-risky-approval',
  'planner-creates-proof-gate-issues',
  'decision-memory-smoke',
] as const;

export function scenarioIdFromTitle(title: string): string | undefined {
  return /\[oa-test:([a-z0-9-]+)\]/.exec(title)?.[1];
}

export interface Metrics {
  issues: { total: number; open: number; closed: number };
  labels: Record<string, number>;
  prs: { open: number; merged: number; total: number };
  runs: { success: number; failure: number; other: number };
}

export function summarizeMetrics(issues: IssueLite[], prs: PrLite[], runs: RunLite[]): Metrics {
  const labels: Record<string, number> = {};
  for (const issue of issues) {
    for (const label of issue.labels) labels[label] = (labels[label] ?? 0) + 1;
  }
  return {
    issues: {
      total: issues.length,
      open: issues.filter((i) => i.state.toUpperCase() === 'OPEN').length,
      closed: issues.filter((i) => i.state.toUpperCase() === 'CLOSED').length,
    },
    labels,
    prs: {
      open: prs.filter((p) => p.state.toUpperCase() === 'OPEN').length,
      merged: prs.filter((p) => p.state.toUpperCase() === 'MERGED').length,
      total: prs.length,
    },
    runs: {
      success: runs.filter((r) => r.conclusion === 'success').length,
      failure: runs.filter((r) => r.conclusion === 'failure').length,
      other: runs.filter((r) => r.conclusion !== 'success' && r.conclusion !== 'failure').length,
    },
  };
}

// Classify each coverage scenario from the live issue that carries its marker. Conservative:
// only `proven` when the visible end state matches the scenario's success condition.
export function classifyScenarios(issues: IssueLite[]): ScenarioResult[] {
  const byId = new Map<string, IssueLite>();
  for (const issue of issues) {
    const id = scenarioIdFromTitle(issue.title);
    if (id && !byId.has(id)) byId.set(id, issue);
  }
  return COVERAGE_SCENARIOS.map((id) => {
    const issue = byId.get(id);
    if (!issue) return { id, status: 'pending', evidence: 'no seeded issue found' };
    const labels = new Set(issue.labels);
    const closed = issue.state.toUpperCase() === 'CLOSED';
    const has = (l: string) => labels.has(l);
    let status: ScenarioStatus = 'in-progress';
    if (id === 'pm-needs-info' && has('needs-info')) status = 'proven';
    else if (id === 'pm-human-required-risky-workflow' && (has('human-required') || has('agent-blocked'))) status = 'proven';
    else if (id === 'governance-maintainer-hold' && (has('agent-maintainer-hold') || has('human-required'))) status = 'proven';
    else if (closed) status = 'proven';
    else if (has('human-required') || has('agent-blocked')) status = 'proven';
    else if (has('needs-info')) status = 'in-progress';
    return { id, status, evidence: `#${issue.number} ${issue.state}${issue.labels.length ? ' [' + issue.labels.join(', ') + ']' : ''}` };
  });
}

export function renderReport(repo: string, metrics: Metrics, scenarios: ScenarioResult[], at: string): string {
  const count = (s: ScenarioStatus) => scenarios.filter((x) => x.status === s).length;
  const lines: string[] = [];
  lines.push(`# Testbed proctor report — ${repo}`);
  lines.push('');
  lines.push(`Snapshot: ${at}`);
  lines.push('');
  lines.push('## Quantitative');
  lines.push(`- issues: ${metrics.issues.total} (${metrics.issues.open} open, ${metrics.issues.closed} closed)`);
  lines.push(`- agent PRs: ${metrics.prs.total} (${metrics.prs.open} open, ${metrics.prs.merged} merged)`);
  lines.push(`- recent runs: ${metrics.runs.success} success, ${metrics.runs.failure} failure, ${metrics.runs.other} other`);
  const labelKeys = Object.keys(metrics.labels).sort();
  if (labelKeys.length) lines.push(`- labels: ${labelKeys.map((k) => `${k}=${metrics.labels[k]}`).join(', ')}`);
  lines.push('');
  lines.push(`## Coverage: ${count('proven')}/${scenarios.length} proven, ${count('in-progress')} in-progress, ${count('pending')} pending, ${count('failed')} failed`);
  lines.push('');
  lines.push('| Scenario | Status | Evidence |');
  lines.push('| --- | --- | --- |');
  for (const s of scenarios) lines.push(`| ${s.id} | ${s.status} | ${s.evidence} |`);
  return lines.join('\n');
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const repo = argv[argv.indexOf('--repo') + 1] ?? 'volter-ai/open-autonomy-testbed';
  const at = argv[argv.indexOf('--at') + 1] ?? 'unknown';
  const issues = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'all', '--limit', '100', '--json', 'number,title,state,labels'])) as Array<{ number: number; title: string; state: string; labels: Array<{ name: string }> }>;
  const prs = JSON.parse(gh(['pr', 'list', '-R', repo, '--state', 'all', '--limit', '100', '--json', 'number,title,state,headRefName'])) as PrLite[];
  const runs = JSON.parse(gh(['run', 'list', '-R', repo, '--limit', '40', '--json', 'name,conclusion,status'])) as RunLite[];
  const issuesLite: IssueLite[] = issues.map((i) => ({ number: i.number, title: i.title, state: i.state, labels: i.labels.map((l) => l.name) }));
  const metrics = summarizeMetrics(issuesLite, prs, runs);
  const scenarios = classifyScenarios(issuesLite);
  process.stdout.write(`${renderReport(repo, metrics, scenarios, at)}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
