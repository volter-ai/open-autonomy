// Emit autonomy.ir.v1 → an open-autonomy manifest (autonomy.yml shape).
// Substrate = github-actions; the .codex/skills prefix and the workflow .yml files are adapter
// conventions. Capabilities/triggers/policy are restored from the IR's config + policy boxes.
import type { AutonomyIR, CompileOutput, IRWorkflow } from './autonomy-ir';
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

// --- Full file-tree compile (github-actions = a TRIGGER TRANSPORT, not a runner) ---
// github isn't a different runner — it's just an Actions cron that calls the SAME runner as local.
// A launch: workflow runs `autonomy launch <agent>` (→ termfleet, reachable at TERMFLEET_PROVIDER_URL,
// e.g. a tunneled/remote provider); a run: workflow runs the script. autonomy.yml carries agent-triggers.
function workflowYml(wf: IRWorkflow): string {
  const action = wf.launch
    ? `      - run: autonomy launch ${wf.launch}`
    : `      - run: node ${wf.run}`;
  return [
    `name: ${wf.name}`,
    `on:`,
    `  schedule:`,
    `    - cron: "${wf.cron}"`,
    `  workflow_dispatch: {}`,
    `jobs:`,
    `  ${wf.name}:`,
    `    runs-on: ubuntu-latest`,
    `    env:`,
    `      TERMFLEET_PROVIDER_URL: \${{ secrets.TERMFLEET_PROVIDER_URL }}`,
    `      TERMFLEET_AGENT: claude`,
    `    steps:`,
    action,
    ``,
  ].join('\n');
}

export function compileGithub(ir: AutonomyIR): CompileOutput {
  const manifest = emitAutonomy(ir);
  const generated: Record<string, string> = {
    '.open-autonomy/autonomy.yml': Bun.YAML.stringify(manifest as Record<string, unknown>),
  };
  for (const wf of ir.workflows) generated[`.github/workflows/${wf.name}.yml`] = workflowYml(wf);

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    copies.push({ from: `skills/${agent.skill}/SKILL.md`, to: `.codex/skills/${agent.skill}/SKILL.md` });
  }
  for (const r of ir.resources) copies.push({ from: r, to: r }); // resources mirror

  return { generated, copies };
}
