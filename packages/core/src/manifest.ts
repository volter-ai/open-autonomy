// The open-autonomy manifest (autonomy.yml) — the IR's on-disk serialization. It is substrate-NEUTRAL:
// every substrate emits the identical manifest and the runner reads it. So the (de)serialization is the
// standard's, not any one substrate's emit — it lives here in core, and each substrate's emit imports it
// rather than one substrate housing it for the others.
import { isScript, type AutonomyIR } from './ir.js';

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
      review?: string; // the reviewer agent that judges this proposer's PRs (the merge-boundary review edge)
    }
  >;
  // Portable governance data, carried verbatim — each substrate reads the keys it knows
  // (autonomy/risk/merge/planner for github) and a profile's own knob (e.g. wip) survives untouched.
  policy?: Record<string, unknown>;
}

/** Serialize an IR to the open-autonomy manifest. */
export function emitAutonomy(ir: AutonomyIR): OAManifest {
  const skills: Record<string, string> = {};
  const agents: NonNullable<OAManifest['agents']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    if (!isScript(agent.behavior)) skills[role] = `.codex/skills/${agent.behavior}`;
    const triggers: { schedule?: string; [event: string]: unknown } = {};
    for (const t of agent.triggers ?? []) {
      if ('cron' in t) triggers.schedule = t.cron;
      // A `dispatch` trigger adds nothing to the trigger map — it is invoked on demand through the Runner
      // (every agent is already launchable via its workflowFile). Its only payload is the forwarded params,
      // collected separately below.
      else if ('dispatch' in t) continue;
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
      // The launchable unit the runner targets for agent:launch — named for the agent (substrate-derived).
      workflowFile: `${role}.yml`,
      ...(Object.keys(params).length ? { params } : {}),
      ...(Object.keys(triggers).length ? { triggers } : {}),
      ...(typeof agent.timeout === 'number' ? { timeout: agent.timeout } : {}),
      ...(agent.capabilities?.length ? { capabilities: agent.capabilities } : {}),
      ...(agent.review ? { review: agent.review } : {}),
    };
  }
  // Carry the policy box verbatim — it is opaque governance, not a fixed schema (see OAManifest.policy).
  const policy = (ir.policy.box ?? {}) as OAManifest['policy'];
  return { schema: 'open-autonomy.autonomy.v1', documents: { resources: ir.resources }, skills, agents, policy };
}
