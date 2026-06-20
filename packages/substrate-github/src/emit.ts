// Emit autonomy.ir.v1 → an open-autonomy manifest (autonomy.yml shape).
// Substrate = github-actions; the .codex/skills prefix and the workflow .yml files are adapter
// conventions. Capabilities/triggers/policy are restored from the IR's config + policy boxes.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRWorkflow } from '@open-autonomy/core';
import type { OAManifest } from './ingest-manifest';

// The operator control plane (the github surface of the Runner contract). Single source of truth is
// a sibling file we emit verbatim into the compiled repo as .github/agent-control.mjs.
const AGENT_CONTROL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'control-backend.mjs'),
  'utf8',
);

// The github substrate's runtime backend — the scripts every github installation runs (the agent
// driver, model-proxy client, control/decision/merge logic). It is domain-free and identical for
// every install, so the substrate OWNS it and injects it (vendored under ./runtime, mirrored to
// scripts/), exactly as the local substrate injects autonomy-runner.mjs + run.mjs. A profile never
// carries it. Read once at module load, like AGENT_CONTROL.
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
const RUNTIME: Record<string, string> = {};
for (const f of readdirSync(RUNTIME_DIR)) {
  if (f.endsWith('.ts')) RUNTIME[`scripts/${f}`] = readFileSync(join(RUNTIME_DIR, f), 'utf8');
}

// The five Runner-contract operations an operator can issue against a running github agent.
const CONTROL_VERBS = ['cancel', 'pause', 'resume', 'status', 'retry'];
// A control comment is `/agent <verb>` on the issue; the agent job skips these, the control job owns them.
const IS_CONTROL = "github.event_name == 'issue_comment' && startsWith(github.event.comment.body, '/agent ')";
const NOT_CONTROL = "github.event_name != 'issue_comment' || !startsWith(github.event.comment.body, '/agent ')";

export function emitAutonomy(ir: AutonomyIR): OAManifest {
  const wfByAgent: Record<string, IRWorkflow> = {};
  for (const w of ir.workflows) if (w.launch) wfByAgent[w.launch] = w;

  const skills: Record<string, string> = {};
  const agents: NonNullable<OAManifest['agents']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    skills[role] = `.codex/skills/${agent.skill}`;
    const cfg = agent.config as Record<string, unknown>;

    // Rebuild the manifest triggers block from the agent's launch workflow: cron -> schedule,
    // every carried event -> its key (verbatim; a bare event becomes `true`).
    const triggers: { schedule?: string; [event: string]: unknown } = {};
    for (const t of wfByAgent[role]?.triggers ?? []) {
      if ('cron' in t) triggers.schedule = t.cron;
      else triggers[t.event] = t.config ?? true;
    }
    // structural job config carried on the workflow rides back onto the agent.
    const wfCfg = (wfByAgent[role]?.config ?? {}) as Record<string, unknown>;

    agents[role] = {
      skill: agent.skill,
      ...(Object.keys(triggers).length ? { triggers } : {}),
      ...(typeof wfCfg.timeout === 'number' ? { timeout: wfCfg.timeout } : {}),
      ...(typeof wfCfg.concurrency === 'string' ? { concurrency: wfCfg.concurrency } : {}),
      ...(wfCfg.env && typeof wfCfg.env === 'object' ? { env: wfCfg.env as Record<string, string> } : {}),
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
// Render the `on:` block from the workflow's triggers. cron -> schedule; workflow_dispatch is the
// manual interface (with a task input for a launch job); every other carried event renders verbatim
// as `on: <event>` and is left to GitHub to fire — the IR doesn't model event semantics.
const DISPATCH_INPUTS = [
  '      task: { description: "task for the agent", required: false, default: "Create a file IR-AGENT-PROOF.md at the repo root containing exactly one line: built by a real codex agent in the compiled autonomy IR github workflow" }',
  '      issue_number: { description: "issue to act on (used by /agent retry)", required: false, type: string }',
];

function onLines(wf: IRWorkflow, kind: 'run' | 'launch'): string[] {
  const lines = ['on:'];
  const cron = cronOf(wf);
  if (cron) lines.push('  schedule:', `    - cron: "${cron}"`);
  const seen = new Set<string>();
  if (kind === 'launch') {
    lines.push('  workflow_dispatch:', '    inputs:', ...DISPATCH_INPUTS);
    // mandatory: the operator control surface arrives via issue comments.
    lines.push('  issue_comment:', '    types: [created]');
    seen.add('workflow_dispatch').add('issue_comment');
  } else {
    lines.push('  workflow_dispatch: {}');
    seen.add('workflow_dispatch');
  }
  for (const t of wf.triggers) {
    if ('cron' in t || seen.has(t.event)) continue;
    seen.add(t.event);
    lines.push(`  ${t.event}: {}`);
  }
  return lines;
}

// Realize an agent's universal capabilities (docs/CAPABILITIES.md) as a GitHub job `permissions:` block.
// The capabilities name only universal nouns (artifact/tasks/agent); github is what maps them to its
// permission model — another substrate maps them differently or ignores them. A launch job also commits
// the agent's work, so contents:write is baseline.
function capsToPermissions(caps: string[]): string {
  const p: Record<string, string> = { contents: 'write', 'id-token': 'write' };
  const grant = (k: string, lvl: string) => { if (p[k] !== 'write') p[k] = lvl; }; // write wins over read
  for (const c of caps) {
    if (c === 'artifact:author') p['pull-requests'] = 'write';
    else if (c === 'tasks:author' || c === 'tasks:converse') p.issues = 'write';
    else if (c === 'agent:launch' || c === 'agent:update' || c === 'agent:cancel') p.actions = 'write';
    else if (c === 'agent:list') grant('actions', 'read');
  }
  return `{ ${Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

// Structural job config carried in the workflow's config box, rendered by the github adapter at
// compile time. `timeout` (minutes) → job timeout-minutes; `concurrency` (a group string, github-
// only, carried verbatim) → top-level concurrency; extra `env` (key→value, may hold ${{ }} tokens)
// → merged into the job env. A substrate that doesn't understand a key just ignores it.
function concurrencyLines(wf: IRWorkflow): string[] {
  const group = (wf.config as Record<string, unknown>).concurrency;
  return typeof group === 'string' && group
    ? ['concurrency:', `  group: ${JSON.stringify(group)}`, '  cancel-in-progress: false']
    : [];
}
function timeoutLines(wf: IRWorkflow): string[] {
  const t = (wf.config as Record<string, unknown>).timeout;
  return typeof t === 'number' ? [`    timeout-minutes: ${t}`] : [];
}
function envLines(wf: IRWorkflow): string[] {
  const env = (wf.config as Record<string, unknown>).env;
  if (!env || typeof env !== 'object') return [];
  return Object.entries(env as Record<string, unknown>).map(([k, v]) => `      ${k}: ${v}`);
}

// Concurrency for a launch workflow. `config.concurrency` overrides; otherwise the mandatory
// control-aware group: control commands (`/agent cancel|…`) get a SEPARATE group so they are never
// queued behind the very agent run they target (open-autonomy's insight). cancel-in-progress stays
// false so a normal re-trigger doesn't kill an in-flight agent.
function launchConcurrencyLines(wf: IRWorkflow): string[] {
  const override = (wf.config as Record<string, unknown>).concurrency;
  if (typeof override === 'string' && override) {
    return ['concurrency:', `  group: ${JSON.stringify(override)}`, '  cancel-in-progress: false'];
  }
  const exempt = CONTROL_VERBS.map(
    (v) => `startsWith(github.event.comment.body || inputs.command || '', '/agent ${v}')`,
  ).join(' || ');
  return [
    'concurrency:',
    '  group: >-',
    `    ${wf.name}-\${{ github.event.issue.number || inputs.issue_number }}\${{`,
    `    (${exempt}) && '-control' || '' }}`,
    '  cancel-in-progress: false',
  ];
}

// Universal envelope: upload the agent's evidence dir (.agent-run) as a run artifact, always. Part of
// every workflow OA hand-wrote (but inconsistently); the compiler applies it uniformly.
function artifactLines(wf: IRWorkflow): string[] {
  return [
    `      - uses: actions/upload-artifact@v4`,
    `        if: always()`,
    `        with:`,
    `          name: ${wf.name}-\${{ github.run_id }}`,
    `          path: .agent-run`,
    `          if-no-files-found: warn`,
  ];
}

function workflowYml(wf: IRWorkflow, ir: AutonomyIR): string {
  if (wf.run) {
    return [
      `name: ${wf.name}`,
      ...onLines(wf, 'run'),
      ...concurrencyLines(wf),
      `jobs:`,
      `  ${wf.name}:`,
      `    runs-on: ubuntu-latest`,
      ...timeoutLines(wf),
      ...(envLines(wf).length ? ['    env:', ...envLines(wf)] : []),
      `    steps:`,
      `      - uses: actions/checkout@v4`,
      `      - run: node ${wf.run}`,
      ...artifactLines(wf),
      ``,
    ].join('\n');
  }
  // A real, tool-using agent runs IN the job (codex exec via the bounded proxy — open-autonomy's
  // model: no raw key, a metered/revocable token). codex makes real repo changes, which are committed.
  return [
    `name: ${wf.name}`,
    ...onLines(wf, 'launch'),
    `permissions: ${capsToPermissions((ir.agents[wf.launch as string]?.config.capabilities as string[]) ?? [])}`,
    ...launchConcurrencyLines(wf),
    `jobs:`,
    // Mandatory operator control plane: the github surface of the Runner contract. An `/agent <verb>`
    // issue comment runs the control handler (cancel/pause/resume/status/retry → gh / labels).
    `  control:`,
    `    if: ${IS_CONTROL}`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { contents: read, issues: write, actions: write }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      CONTROL_WORKFLOW: ${wf.name}.yml`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - run: node .github/agent-control.mjs`,
    // The agent job: runs for schedule / dispatch / label events — never for a /agent control comment.
    `  ${wf.name}:`,
    `    if: ${NOT_CONTROL}`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(wf),
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_ADMIN_TOKEN: \${{ secrets.MODEL_PROXY_ADMIN_TOKEN }}`,
    `      PUBLIC_AGENT_MODEL: \${{ vars.PUBLIC_AGENT_MODEL }}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CODEX_VERSION }}`,
    `      TASK: \${{ github.event.inputs.task }}`,
    `      RID: ir-${wf.launch}-\${{ github.run_id }}`,
    ...envLines(wf),
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
    `        if: "\${{ !contains(github.event.issue.labels.*.name, 'agent-paused') }}"`,
    `        env:`,
    `          MODEL_PROXY_TOKEN: \${{ steps.mint.outputs.token }}`,
    `          OSS_AGENT_TASK_DIR: /tmp/agent-task`,
    `        run: |`,
    `          mkdir -p /tmp/agent-task`,
    `          bun scripts/codex-agent-run.ts --issue /tmp/issue.json`,
    `      - name: commit the agent's real changes`,
    `        if: "\${{ !contains(github.event.issue.labels.*.name, 'agent-paused') }}"`,
    `        run: |`,
    `          git config user.name autonomy-ir; git config user.email ir@autonomy`,
    `          git checkout -b "$RID"; git add -A`,
    `          git commit -m "real codex agent run via compiled IR workflow" || { echo "NO CHANGES FROM AGENT"; exit 1; }`,
    `          git push origin "$RID"`,
    `      - if: always()`,
    `        run: bun scripts/model-proxy-revoke.ts --run-id "$RID" || true`,
    ...artifactLines(wf),
    ``,
  ].join('\n');
}

export function compileGithub(ir: AutonomyIR): CompileOutput {
  const generated: Record<string, string> = {};
  // The manifest is generated from the IR — UNLESS the profile carries a hand-authored autonomy.yml
  // verbatim. A hand-authored manifest's exact YAML (structured `documents` map, key order, quoting)
  // can't be regenerated faithfully, so when the profile carries one as a resource the verbatim copy
  // wins. Same principle as raw-carried workflows: model what's modelable, carry the rest exactly.
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    generated['.open-autonomy/autonomy.yml'] = Bun.YAML.stringify(emitAutonomy(ir) as Record<string, unknown>);
  }
  // raw workflows are carried verbatim (a hand-authored body the IR doesn't model); the rest are
  // generated from the interpreted fields.
  for (const wf of ir.workflows) {
    generated[`.github/workflows/${wf.name}.yml`] = wf.raw != null ? wf.raw : workflowYml(wf, ir);
  }
  // every generated launch workflow carries the mandatory operator control plane, so emit its handler.
  if (ir.workflows.some((wf) => wf.launch && wf.raw == null)) {
    generated['.github/agent-control.mjs'] = AGENT_CONTROL;
  }
  // the substrate injects its runtime backend — the scripts the workflows invoke (`bun scripts/*`).
  Object.assign(generated, RUNTIME);

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    copies.push({ from: `skills/${agent.skill}/SKILL.md`, to: `.codex/skills/${agent.skill}/SKILL.md` });
  }
  for (const r of ir.resources) copies.push({ from: r, to: r }); // resources mirror

  return { generated, copies };
}
