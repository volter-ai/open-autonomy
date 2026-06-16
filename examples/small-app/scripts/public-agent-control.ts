#!/usr/bin/env bun

export type AgentControlVerb = 'pause' | 'resume' | 'cancel' | 'retry' | 'status';
export type AgentControlScope = 'issue' | 'repo';

export interface AgentStatusSummaryInput {
  issue: { number?: number; labels?: Array<{ name?: string }> };
  openPr?: { number?: number; url?: string; headRefName?: string } | null;
  runs?: Array<{ databaseId?: number; status?: string; conclusion?: string; url?: string }>;
  proxyRuns?: Record<string, { repo?: string; issue?: number; actor?: string; active?: boolean }>;
  repoPaused?: boolean;
  decisionIndex?: {
    issues?: Array<{
      issue?: number;
      latest_decision?: { stage?: string; decision?: string; reason?: string; next_action?: string; created_at?: string };
      latest_pr?: number;
    }>;
  };
}

export interface AgentStatusSummary {
  issue: number | null;
  paused: boolean;
  repo_paused: boolean;
  blocking_labels: string[];
  open_pr: number | null;
  active_workflow_runs: number;
  active_proxy_runs: string[];
  latest_decision: null | {
    stage?: string;
    decision?: string;
    reason?: string;
    next_action?: string;
    created_at?: string;
  };
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
  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
  return {
    issue: issueNumber,
    paused: labels.includes('agent-paused'),
    repo_paused: input.repoPaused ?? false,
    blocking_labels: blocking,
    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
    active_workflow_runs: activeWorkflowRuns,
    active_proxy_runs: activeProxyRuns,
    latest_decision: indexedIssue?.latest_decision ?? null,
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
  if (summary.latest_decision) {
    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
  }
  return lines.join('\n');
}

function isActiveRunStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'waiting' || status === 'requested';
}
