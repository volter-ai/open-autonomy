// Emit autonomy.ir.v1 → an open-autonomy manifest (autonomy.yml shape).
// Substrate = github-actions; the .codex/skills prefix and the workflow .yml files are adapter
// conventions. Capabilities/triggers/policy are restored from the IR's config + policy boxes.
import type { AutonomyIR } from './autonomy-ir';
import type { OAManifest } from './autonomy-ingest-autonomy';

export function emitAutonomy(ir: AutonomyIR): OAManifest {
  const scheduleByAgent: Record<string, string> = {};
  for (const w of ir.workflows) if (w.launch) scheduleByAgent[w.launch] = w.cron;

  const skills: Record<string, string> = {};
  const agents: NonNullable<OAManifest['agents']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    skills[role] = `.codex/skills/${agent.skill}`;
    const cfg = agent.config as Record<string, unknown>;

    const triggers: NonNullable<NonNullable<OAManifest['agents']>[string]['triggers']> = {};
    if (scheduleByAgent[role]) triggers.schedule = scheduleByAgent[role];
    if (cfg.workflow_dispatch) triggers.workflow_dispatch = true;
    if (cfg.issue_comment) triggers.issue_comment = true;

    agents[role] = {
      skill: agent.skill,
      ...(Object.keys(triggers).length ? { triggers } : {}),
      ...(Array.isArray(cfg.capabilities) ? { capabilities: cfg.capabilities as string[] } : {}),
    };
  }

  const box = ir.policy.box as Record<string, unknown>;
  const policy: NonNullable<OAManifest['policy']> = {};
  for (const k of ['autonomy', 'risk', 'merge', 'planner'] as const) {
    if (box[k]) policy[k] = box[k] as Record<string, unknown>;
  }

  return {
    schema: 'open-autonomy.autonomy.v1',
    documents: { resources: ir.resources },
    skills,
    agents,
    policy,
  };
}
