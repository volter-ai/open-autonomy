// Ingest an open-autonomy manifest (autonomy.yml) → autonomy.ir.v1.
import type { AutonomyIR, Box, IRWorkflow, Trigger } from '@open-autonomy/core';

export interface OAManifest {
  schema?: string;
  documents?: Record<string, unknown>;
  skills?: Record<string, string>;
  agents?: Record<
    string,
    {
      skill?: string;
      // `schedule` is the cron; any other key is an event trigger carried verbatim (workflow_dispatch,
      // issue_comment, issues, pull_request_target, …) — the IR doesn't enumerate them.
      triggers?: { schedule?: string; [event: string]: unknown };
      capabilities?: string[];
      // structural job config the substrate renders (github) or a runner reads (local).
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
    const config: Box = {};
    if (a.capabilities) config.capabilities = a.capabilities;
    // Skill identity is the folder basename (portable); the .codex/skills prefix is harness convention.
    const skillRef = m.skills?.[name] ?? a.skill ?? '';
    agents[name] = {
      skill: skillRef.split('/').pop() ?? skillRef,
      maxConcurrent: 1,
      config,
    };
  }

  // open-autonomy expresses dispatch DECLARATIVELY: an agent carries its own triggers. Each becomes
  // a workflow; `schedule` is the cron the loop interprets, every other key is a carried event.
  const workflows: IRWorkflow[] = [];
  for (const [name, a] of Object.entries(m.agents ?? {})) {
    if (!a.triggers) continue;
    const triggers: Trigger[] = [];
    for (const [key, val] of Object.entries(a.triggers)) {
      if (val === false || val == null) continue;
      if (key === 'schedule' && typeof val === 'string') triggers.push({ cron: val });
      else triggers.push({ event: key, ...(val && typeof val === 'object' ? { config: val as Box } : {}) });
    }
    // structural job config rides the workflow's config box (the github adapter renders it).
    const wfConfig: Box = {};
    if (typeof a.timeout === 'number') wfConfig.timeout = a.timeout;
    if (typeof a.concurrency === 'string') wfConfig.concurrency = a.concurrency;
    if (a.env && typeof a.env === 'object') wfConfig.env = a.env;
    if (triggers.length) workflows.push({ name: `${name}-tick`, triggers, launch: name, config: wfConfig });
  }

  // Closest global concurrency knob open-autonomy has; the rest of policy rides the box.
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
    workflows,
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
