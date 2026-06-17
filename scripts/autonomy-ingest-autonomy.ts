// Ingest an open-autonomy manifest (autonomy.yml) → autonomy.ir.v1.
import type { AutonomyIR, Box, IRWorkflow } from './autonomy-ir';

export interface OAManifest {
  schema?: string;
  documents?: Record<string, unknown>;
  skills?: Record<string, string>;
  agents?: Record<
    string,
    {
      skill?: string;
      triggers?: { schedule?: string; workflow_dispatch?: boolean; issue_comment?: boolean };
      capabilities?: string[];
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
    // Non-cron triggers aren't core; carry them so they survive the round-trip.
    if (a.triggers?.workflow_dispatch) config.workflow_dispatch = true;
    if (a.triggers?.issue_comment) config.issue_comment = true;
    agents[name] = {
      skill: m.skills?.[name] ?? a.skill ?? '',
      maxConcurrent: 1,
      config,
    };
  }

  // open-autonomy expresses dispatch DECLARATIVELY: an agent carries its own schedule trigger.
  const workflows: IRWorkflow[] = [];
  for (const [name, a] of Object.entries(m.agents ?? {})) {
    if (a.triggers?.schedule) {
      workflows.push({ name: `${name}-tick`, cron: a.triggers.schedule, launch: name, config: {} });
    }
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
