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
  // The agent runs IN the job, with model access via a bounded per-run proxy token (open-autonomy's
  // model: the Action never holds a raw key — it mints a metered, revocable token). A real model call
  // through the proxy produces the work, which is committed to a branch.
  return [
    `name: ${wf.name}`,
    `on:`,
    `  schedule:`,
    `    - cron: "${wf.cron}"`,
    `  workflow_dispatch:`,
    `    inputs:`,
    `      task: { description: "task for the agent", required: false, default: "Write a file IR-AGENT-PROOF.md at the repo root whose only line is: built by the compiled autonomy IR github workflow" }`,
    `permissions: { contents: write, id-token: write }`,
    `jobs:`,
    `  ${wf.name}:`,
    `    runs-on: ubuntu-latest`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_ADMIN_TOKEN: \${{ secrets.MODEL_PROXY_ADMIN_TOKEN }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE }}`,
    `      MODEL: \${{ vars.PUBLIC_AGENT_MODEL }}`,
    `      TASK: \${{ github.event.inputs.task }}`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - name: mint a bounded per-run proxy token`,
    `        id: mint`,
    `        run: |`,
    `          echo "RID=ir-${wf.launch}-\${{ github.run_id }}" >> "$GITHUB_ENV"`,
    `          echo '{"number":0}' > /tmp/issue.json`,
    `          bun scripts/model-proxy-mint.ts --run-id "ir-${wf.launch}-\${{ github.run_id }}" --max-usd-cents 50 --max-requests 30 --issue /tmp/issue.json`,
    `      - name: run the agent (real model call through the proxy)`,
    `        run: |`,
    `          RESP=$(curl -fsS "$MODEL_PROXY_URL/openai/v1/chat/completions" -H "authorization: Bearer \${{ steps.mint.outputs.token }}" -H "content-type: application/json" -d "$(jq -nc --arg m "$MODEL" --arg t "$TASK" '{model:$m,messages:[{role:"user",content:($t+" Output ONLY the file content, nothing else.")}]}')")`,
    `          echo "$RESP" | jq -r '.choices[0].message.content' > IR-AGENT-PROOF.md`,
    `          echo "--- agent wrote: ---"; cat IR-AGENT-PROOF.md`,
    `      - name: commit the agent's work`,
    `        run: |`,
    `          git config user.name autonomy-ir; git config user.email ir@autonomy`,
    `          git checkout -b "$RID"; git add -A; git commit -m "agent run via compiled IR workflow"`,
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
