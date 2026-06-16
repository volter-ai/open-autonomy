#!/usr/bin/env bun

export type AgentControlVerb = 'pause' | 'resume' | 'cancel' | 'retry' | 'status';
export type AgentControlScope = 'issue' | 'repo';

export interface AgentStatusSummaryInput {
  issue: { number?: number; labels?: Array<{ name?: string }> };
  openPr?: { number?: number; url?: string; headRefName?: string } | null;
  runs?: Array<{ databaseId?: number; status?: string; conclusion?: string; url?: string }>;
  proxyRuns?: Record<string, { repo?: string; issue?: number; actor?: string; active?: boolean }>;
  repoPaused?: boolean;
}

export interface AgentStatusSummary {
  issue: number | null;
  paused: boolean;
  repo_paused: boolean;
  blocking_labels: string[];
  open_pr: number | null;
  active_workflow_runs: number;
  active_proxy_runs: string[];
}

export function parseControlScope(raw: string): AgentControlScope {
  return /\b(repo|repository|global)\b/i.test(raw) ? 'repo' : 'issue';
}

export function summarizeAgentStatus(input: AgentStatusSummaryInput): AgentStatusSummary {
  const labels = (input.issue.labels ?? []).map((label) => (label.name ?? '').toLowerCase()).filter(Boolean);
  const blocking = labels.filter((label) => ['agent-paused', 'agent-blocked', 'human-required', 'security'].includes(label));
  const activeWorkflowRuns = (input.runs ?? []).filter((run) => isActiveRunStatus(run.status)).length;
  const issueNumber = input.issue.number ?? null;
  const activeProxyRuns = Object.entries(input.proxyRuns ?? {})
    .filter(([, run]) => run.active && run.issue === issueNumber)
    .map(([runId]) => runId)
    .sort();
  return {
    issue: issueNumber,
    paused: labels.includes('agent-paused'),
    repo_paused: input.repoPaused ?? false,
    blocking_labels: blocking,
    open_pr: input.openPr?.number ?? null,
    active_workflow_runs: activeWorkflowRuns,
    active_proxy_runs: activeProxyRuns,
  };
}

export function renderStatusComment(summary: AgentStatusSummary): string {
  const lines = [
    `Agent status for issue #${summary.issue ?? 'unknown'}:`,
    `- repo paused: ${summary.repo_paused ? 'yes' : 'no'}`,
    `- issue paused: ${summary.paused ? 'yes' : 'no'}`,
    `- blocking labels: ${summary.blocking_labels.length ? summary.blocking_labels.join(', ') : 'none'}`,
    `- open agent PR: ${summary.open_pr ? `#${summary.open_pr}` : 'none'}`,
    `- active workflow runs: ${summary.active_workflow_runs}`,
    `- active proxy runs: ${summary.active_proxy_runs.length ? summary.active_proxy_runs.join(', ') : 'none'}`,
  ];
  return lines.join('\n');
}

function isActiveRunStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'waiting' || status === 'requested';
}
