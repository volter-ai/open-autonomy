// Emit autonomy.ir.v1 → an open-autonomy manifest (autonomy.yml shape).
// Substrate = github-actions; the .codex/skills prefix and the workflow .yml files are adapter
// conventions. Capabilities/triggers/policy are restored from the IR's config + policy boxes.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRStep, IRWorkflow } from '@open-autonomy/core';
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

// Map an agent's declared capabilities (carried in config.box) to a GitHub job `permissions:` block.
// This is the github adapter interpreting carried config at COMPILE time — the same config a local
// runner would read at runtime; the box carries it, each substrate reads it when it suits. A launch
// job also commits the agent's work, so contents:write is baseline.
function capsToPermissions(caps: string[]): string {
  const p: Record<string, string> = { contents: 'write', 'id-token': 'write' };
  for (const c of caps) {
    if (c.startsWith('issue:')) p.issues = 'write';
    else if (c.startsWith('pr:') || c === 'branch:write') p['pull-requests'] = 'write';
    else if (c === 'workflow:dispatch') p.actions = 'write';
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

// Universal envelope: opt every workflow into the Node 24 JS-actions runtime. GitHub deprecated the
// node20 action runtime; OA hand-wrote this top-level env per workflow — the compiler applies it
// uniformly (top-level env applies to all jobs). A production-readiness contract, not just DRY.
const NODE24_ENV = ['env:', '  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"'];

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

// --- The step/ABI client (github implementation) ---
// A `steps` workflow is a deterministic program pipeline; the github client renders each ABI verb with
// gh/git. The IR names the verb + its data; this is the only substrate-specific surface (per
// docs/IR-WORKFLOWS.md). A local client would render the same verbs over the work-store.

// `on:` for a steps pipeline: schedule (cron) + the dry-run/apply dispatch convention (only when a step
// is applyOnly) + carried events. No issue_comment/control plane (that is the launch envelope).
function onLinesForSteps(wf: IRWorkflow): string[] {
  const lines = ['on:'];
  const cron = cronOf(wf);
  if (cron) lines.push('  schedule:', `    - cron: "${cron}"`);
  const seen = new Set<string>(['workflow_dispatch']);
  if ((wf.steps ?? []).some((s) => s.applyOnly)) {
    lines.push(
      '  workflow_dispatch:',
      '    inputs:',
      '      apply:',
      '        description: Apply changes (default dry-run)',
      '        required: false',
      "        default: 'false'",
      '        type: choice',
      "        options: ['false', 'true']",
    );
  } else {
    lines.push('  workflow_dispatch: {}');
  }
  for (const t of wf.triggers) {
    if ('cron' in t || seen.has(t.event)) continue;
    seen.add(t.event);
    lines.push(`  ${t.event}: {}`);
  }
  return lines;
}

// Steps run deterministic logic + gh; baseline contents:read (no commit, no model) + caps. Distinct
// from a launch job (which commits → contents:write + id-token).
function stepsPermissions(caps: string[]): string {
  const p: Record<string, string> = { contents: 'read' };
  for (const c of caps) {
    if (c.startsWith('issue:')) p.issues = 'write';
    else if (c.startsWith('pr:') || c === 'branch:write') p['pull-requests'] = 'write';
    else if (c === 'workflow:dispatch') p.actions = 'write';
  }
  return `{ ${Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

// The github applyWork renderer — apply a work-mutation plan ({actions:[{action,issue_number,title,
// body,labels}]}) with gh: ensure every label used exists (best-effort), then create/update each item
// and attach its labels one at a time (a single bad label must never block the issue). This is the
// github client's rendering of the `apply` verb; a local client would write the work-store instead.
const APPLY_PLAN_BODY = (plan: string): string[] => [
  `set -euo pipefail`,
  `PLAN=${plan}`,
  `jq -r '.actions[].labels[]?' "$PLAN" | sort -u | while IFS= read -r label; do`,
  `  [ -n "$label" ] && gh label create "$label" --color CFD3D7 2>/dev/null || true`,
  `done`,
  `jq -c '.actions[] | select(.action == "create" or .action == "update")' "$PLAN" | while IFS= read -r action; do`,
  `  kind="$(jq -r '.action' <<< "$action")"`,
  `  number="$(jq -r '.issue_number // empty' <<< "$action")"`,
  `  title="$(jq -r '.title' <<< "$action")"`,
  `  body="$(jq -r '.body' <<< "$action")"`,
  `  labels="$(jq -r '.labels | join(",")' <<< "$action")"`,
  `  if [ "$kind" = "create" ]; then`,
  `    url="$(gh issue create --title "$title" --body "$body")"`,
  `    number="$(printf '%s\\n' "$url" | grep -oE '[0-9]+$' || true)"`,
  `  else`,
  `    gh issue edit "$number" --title "$title" --body "$body" || true`,
  `  fi`,
  `  if [ -n "$number" ]; then`,
  `    printf '%s\\n' "$labels" | tr ',' '\\n' | while IFS= read -r lbl; do`,
  `      [ -n "$lbl" ] && gh issue edit "$number" --add-label "$lbl" || true`,
  `    done`,
  `  fi`,
  `done`,
];

function str(box: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = box?.[key];
  return typeof v === 'string' ? v : fallback;
}

// Render one step to github YAML lines (indented for a job `steps:` list). The verb dispatch IS the ABI.
function stepLines(step: IRStep): string[] {
  const w = (step.with ?? {}) as Record<string, unknown>;
  const head = [`      - name: ${step.name}`];
  if (step.applyOnly) head.push(`        if: inputs.apply == 'true' || github.event_name == 'schedule'`);
  const block = (body: string[]): string[] => [...head, `        run: |`, ...body.map((l) => `          ${l}`)];
  switch (step.uses) {
    case 'gather': {
      const out = str(w, 'out', '.agent-run/gather.json');
      const dir = out.includes('/') ? out.slice(0, out.lastIndexOf('/')) : '.';
      const fields = str(w, 'fields', 'number,title,body,labels,url,state');
      return block([
        `mkdir -p ${dir}`,
        `gh issue list --state ${str(w, 'state', 'open')} --search ${JSON.stringify(str(w, 'query', ''))} --limit ${typeof w.limit === 'number' ? w.limit : 200} --json ${fields} > ${out}`,
      ]);
    }
    case 'run': {
      const args = Array.isArray(w.args) ? (w.args as string[]) : [];
      const cmd = `bun ${str(w, 'script', '')}${args.length ? ' ' + args.join(' ') : ''}`;
      const mk = str(w, 'mkdir', ''); // ensure an output dir exists (scripts writeFileSync into it)
      return mk ? block([`mkdir -p ${mk}`, cmd]) : [...head, `        run: ${cmd}`];
    }
    case 'apply':
      return block(APPLY_PLAN_BODY(str(w, 'plan', '.agent-run/plan.json')));
    default:
      throw new Error(`unknown step verb "${step.uses}" in step "${step.name}"`);
  }
}

function stepsWorkflowYml(wf: IRWorkflow, ir: AutonomyIR): string {
  if ((wf.steps ?? []).some((s) => s.needsModel)) {
    // The model envelope for steps pipelines arrives with the strategist migration; keep it explicit
    // rather than silently emit a model-less run.
    throw new Error(`steps workflow ${wf.name}: needsModel not yet implemented (see docs/IR-WORKFLOWS.md)`);
  }
  const caps = ((wf.config as Record<string, unknown>).capabilities as string[]) ?? [];
  // GH_TOKEN is only needed when a step shells out to `gh` (gather/apply); a pure-script pipeline
  // (e.g. governance-report) gets no token. Extra job env (model vars, …) rides on config.env.
  const usesGh = (wf.steps ?? []).some((s) => s.uses === 'gather' || s.uses === 'apply');
  const jobEnv = [...(usesGh ? [`      GH_TOKEN: \${{ github.token }}`] : []), ...envLines(wf)];
  return [
    `name: ${wf.name}`,
    ...onLinesForSteps(wf),
    `permissions: ${stepsPermissions(caps)}`,
    ...concurrencyLines(wf),
    ...NODE24_ENV,
    `jobs:`,
    `  ${wf.name}:`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(wf),
    ...(jobEnv.length ? ['    env:', ...jobEnv] : []),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    ...(wf.steps ?? []).flatMap(stepLines),
    ...artifactLines(wf),
    ``,
  ].join('\n');
}

function workflowYml(wf: IRWorkflow, ir: AutonomyIR): string {
  if (wf.steps) return stepsWorkflowYml(wf, ir);
  if (wf.run) {
    return [
      `name: ${wf.name}`,
      ...onLines(wf, 'run'),
      ...concurrencyLines(wf),
      ...NODE24_ENV,
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
    ...NODE24_ENV,
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
