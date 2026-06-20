// The open-autonomy manifest (autonomy.yml) — the IR's on-disk serialization. It is substrate-NEUTRAL:
// every substrate emits the identical manifest and the runner reads it. So the (de)serialization is the
// standard's, not any one substrate's emit — it lives here in core, and each substrate's emit imports it
// rather than one substrate housing it for the others.
import { cfg, isScript, type AutonomyIR } from './ir.js';

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

/** Serialize an IR to the open-autonomy manifest. */
export function emitAutonomy(ir: AutonomyIR): OAManifest {
  const skills: Record<string, string> = {};
  const agents: NonNullable<OAManifest['agents']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    if (!isScript(agent.behavior)) skills[role] = `.codex/skills/${agent.behavior}`;
    const c = cfg(agent);
    const triggers: { schedule?: string; [event: string]: unknown } = {};
    for (const t of agent.triggers ?? []) {
      if ('cron' in t) triggers.schedule = t.cron;
      else triggers[t.event] = t.config ?? true;
    }
    // The agent's declared trigger params (param name -> documented source), unioned across triggers.
    // The runner needs these to resolve a launch's params into the agent's env.
    const params: Record<string, string> = {};
    for (const t of agent.triggers ?? []) {
      for (const [n, s] of Object.entries((t as { params?: Record<string, string> }).params ?? {})) params[n] = s;
    }
    agents[role] = {
      skill: agent.behavior,
      // The launchable unit the github runner targets for agent:launch (workflow_dispatch).
      workflowFile: typeof c.workflowFile === 'string' ? (c.workflowFile as string) : `${role}.yml`,
      ...(Object.keys(params).length ? { params } : {}),
      ...(Object.keys(triggers).length ? { triggers } : {}),
      ...(typeof c.timeout === 'number' ? { timeout: c.timeout } : {}),
      ...(typeof c.concurrency === 'string' ? { concurrency: c.concurrency } : {}),
      ...(c.env && typeof c.env === 'object' ? { env: c.env as Record<string, string> } : {}),
      ...(agent.capabilities?.length ? { capabilities: agent.capabilities } : {}),
    };
  }
  const box = ir.policy.box as Record<string, unknown>;
  const policy: NonNullable<OAManifest['policy']> = {};
  for (const k of ['autonomy', 'risk', 'merge', 'planner'] as const) {
    if (box[k]) policy[k] = box[k] as Record<string, unknown>;
  }
  return { schema: 'open-autonomy.autonomy.v1', documents: { resources: ir.resources }, skills, agents, policy };
}
