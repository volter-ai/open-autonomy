// Ingest an open-autonomy manifest (autonomy.yml) → autonomy.ir.v1 agents.
import type { AutonomyIR, Box, Trigger } from '@open-autonomy/core';

export interface OAManifest {
  schema?: string;
  documents?: Record<string, unknown>;
  skills?: Record<string, string>;
  agents?: Record<
    string,
    {
      skill?: string;
      workflowFile?: string;
      params?: Record<string, string>;
      // `schedule` is the cron; any other key is an event trigger carried verbatim.
      triggers?: { schedule?: string; [event: string]: unknown };
      capabilities?: string[];
      timeout?: number;
      concurrency?: string;
      env?: Record<string, string>;
    }
  >;
  policy?: {
    autonomy?: Record<string, unknown>;
    risk?: Record<string, unknown>;
    merge?: Record<string, unknown>;
    planner?: Record<string, unknown>;
  };
}

export function ingestAutonomy(m: OAManifest): AutonomyIR {
  const agents: AutonomyIR['agents'] = {};
  for (const [name, a] of Object.entries(m.agents ?? {})) {
    // Behavior identity is the folder basename (portable); the .codex/skills prefix is harness convention.
    const skillRef = m.skills?.[name] ?? a.skill ?? '';
    const triggers: Trigger[] = [];
    for (const [key, val] of Object.entries(a.triggers ?? {})) {
      if (val === false || val == null) continue;
      if (key === 'schedule' && typeof val === 'string') triggers.push({ cron: val });
      else triggers.push({ event: key, ...(val && typeof val === 'object' ? { config: val as Box } : {}) });
    }
    const config: Box = {};
    if (typeof a.timeout === 'number') config.timeout = a.timeout;
    if (typeof a.concurrency === 'string') config.concurrency = a.concurrency;
    if (a.env && typeof a.env === 'object') config.env = a.env;
    agents[name] = {
      behavior: skillRef.split('/').pop() ?? skillRef,
      capabilities: a.capabilities ?? [],
      triggers,
      config,
    };
  }

  const autonomy = m.policy?.autonomy as Record<string, unknown> | undefined;
  const maxConcurrent =
    typeof autonomy?.max_open_agent_prs === 'number' ? (autonomy.max_open_agent_prs as number) : undefined;
  const policyBox: Box = {};
  for (const k of ['autonomy', 'risk', 'merge', 'planner'] as const) {
    if (m.policy?.[k]) policyBox[k] = m.policy[k];
  }

  return {
    schema: 'autonomy.ir.v1',
    targets: ['github'],
    agents,
    resources: collectDocPaths(m.documents),
    policy: { maxConcurrent, box: policyBox },
  };
}

/** Flatten the (possibly nested) documents map into a sorted, deduped list of file paths. */
function collectDocPaths(documents?: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(documents);
  return [...new Set(out)].sort();
}
