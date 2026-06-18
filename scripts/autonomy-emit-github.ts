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

// --- Full file-tree compile (github runner = Actions + a model proxy, à la open-autonomy) ---
// On github the runner is the Actions job itself: a launch: workflow RUNS the agent in-job, with model
// access through a bounded proxy (MODEL_PROXY_URL) — exactly open-autonomy's public-agent model, not
// termfleet. The agent's own nested dispatch uses the github runner (`gh workflow run <agent>.yml`).
// A run: workflow just runs the script on cron.
function workflowYml(wf: IRWorkflow): string {
  if (wf.run) {
    return [
      `name: ${wf.name}`,
      `on:`,
      `  schedule:`,
      `    - cron: "${wf.cron}"`,
      `  workflow_dispatch: {}`,
      `jobs:`,
      `  ${wf.name}:`,
      `    runs-on: ubuntu-latest`,
      `    steps:`,
      `      - uses: actions/checkout@v4`,
      `      - run: node ${wf.run}`,
      ``,
    ].join('\n');
  }
  // A real, tool-using agent runs IN the job (codex exec via the bounded proxy — open-autonomy's
  // model: no raw key, a metered/revocable token). codex makes real repo changes, which are committed.
  return [
    `name: ${wf.name}`,
    `on:`,
    `  schedule:`,
    `    - cron: "${wf.cron}"`,
    `  workflow_dispatch:`,
    `    inputs:`,
    `      task: { description: "task for the agent", required: false, default: "Create a file IR-AGENT-PROOF.md at the repo root containing exactly one line: built by a real codex agent in the compiled autonomy IR github workflow" }`,
    `permissions: { contents: write, id-token: write }`,
    `jobs:`,
    `  ${wf.name}:`,
    `    runs-on: ubuntu-latest`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_ADMIN_TOKEN: \${{ secrets.MODEL_PROXY_ADMIN_TOKEN }}`,
    `      PUBLIC_AGENT_MODEL: \${{ vars.PUBLIC_AGENT_MODEL }}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CODEX_VERSION }}`,
    `      TASK: \${{ github.event.inputs.task }}`,
    `      RID: ir-${wf.launch}-\${{ github.run_id }}`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - name: relax apparmor for the codex sandbox`,
    `        run: |`,
    `          cur=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || true)`,
    `          if [ -n "$cur" ] && [ "$cur" != "0" ]; then sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0; fi`,
    `      - name: install codex CLI`,
    `        run: npm install -g "@openai/codex@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && codex --version`,
    `      - name: mint a bounded per-run proxy token`,
    `        id: mint`,
    `        run: |`,
    `          printf '{"number":0,"title":"ir-agent","body":%s}\\n' "$(jq -Rs . <<< "$TASK")" > /tmp/issue.json`,
    `          bun scripts/model-proxy-mint.ts --run-id "$RID" --models "$PUBLIC_AGENT_MODEL" --max-usd-cents 200 --max-requests 60 --issue /tmp/issue.json`,
    `      - name: run a real codex agent (tools + repo edits) through the proxy`,
    `        env:`,
    `          MODEL_PROXY_TOKEN: \${{ steps.mint.outputs.token }}`,
    `          OSS_AGENT_TASK_DIR: /tmp/agent-task`,
    `        run: |`,
    `          mkdir -p /tmp/agent-task`,
    `          bun scripts/codex-agent-run.ts --issue /tmp/issue.json`,
    `      - name: commit the agent's real changes`,
    `        run: |`,
    `          git config user.name autonomy-ir; git config user.email ir@autonomy`,
    `          git checkout -b "$RID"; git add -A`,
    `          git commit -m "real codex agent run via compiled IR workflow" || { echo "NO CHANGES FROM AGENT"; exit 1; }`,
    `          git push origin "$RID"`,
    `      - if: always()`,
    `        run: bun scripts/model-proxy-revoke.ts --run-id "$RID" || true`,
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
