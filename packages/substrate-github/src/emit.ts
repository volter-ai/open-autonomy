// Emit autonomy.ir.v1 → an open-autonomy manifest + the github installation. The IR is the standard;
// this is github's (partial) implementation. One unit: an agent. The substrate decides execution from
// the behavior artifact — a prose skill runs via a model (the privilege-separated wrapper, untrusted →
// mediated); a script runs deterministically (a job, trusted → direct). See docs/AUTONOMY-IR.md.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';
import type { OAManifest } from './ingest-manifest';

// The operator control plane (the github surface of the Runner contract). Single source of truth is
// a sibling file we emit verbatim into the compiled repo as .github/agent-control.mjs.
const AGENT_CONTROL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'control-backend.mjs'),
  'utf8',
);

// The github substrate's runtime backend — the scripts every github installation runs. Domain-free,
// injected (vendored under ./runtime, mirrored to scripts/); a profile never carries it.
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
const RUNTIME: Record<string, string> = {};
for (const f of readdirSync(RUNTIME_DIR)) {
  if (f.endsWith('.ts')) RUNTIME[`scripts/${f}`] = readFileSync(join(RUNTIME_DIR, f), 'utf8');
}

const CONTROL_VERBS = ['cancel', 'pause', 'resume', 'status', 'retry'];
const IS_CONTROL = "github.event_name == 'issue_comment' && startsWith(github.event.comment.body, '/agent ')";
const NOT_CONTROL = "github.event_name != 'issue_comment' || !startsWith(github.event.comment.body, '/agent ')";

// The substrate decides how to run an agent's behavior. A script artifact → deterministic (trusted,
// direct); anything else (a prose skill folder) → model-interpreted (untrusted, mediated wrapper).
function isScript(behavior: string): boolean {
  return /\.(ts|mjs|js)$/.test(behavior);
}
function cfg(agent: IRAgent): Record<string, unknown> {
  return agent.config as Record<string, unknown>;
}

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
    agents[role] = {
      skill: agent.behavior,
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

// --- `on:` + trigger params ---

const DISPATCH_INPUTS = [
  '      task: { description: "task for the agent", required: false, default: "Create a file IR-AGENT-PROOF.md at the repo root containing exactly one line: built by a real codex agent in the compiled autonomy IR github workflow" }',
  '      issue_number: { description: "issue to act on (used by /agent retry)", required: false, type: string }',
];

// Render a carried (non-cron) event trigger as github `on:` YAML; its config (issues `types`, …) is
// carried verbatim block-style (scalar | string[]).
function eventLines(event: string, config?: Record<string, unknown>): string[] {
  if (!config || Object.keys(config).length === 0) return [`  ${event}: {}`];
  const lines = [`  ${event}:`];
  for (const [k, v] of Object.entries(config)) {
    if (Array.isArray(v)) lines.push(`    ${k}:`, ...v.map((item) => `      - ${JSON.stringify(item)}`));
    else lines.push(`    ${k}: ${JSON.stringify(v)}`);
  }
  return lines;
}

// The documented trigger-param SOURCE contract (docs/TRIGGER-PARAMS.md) → github resolution. The core
// only wires the opaque param name; the substrate resolves each documented source from its firing context.
const TRIGGER_SOURCE_GH: Record<string, string> = {
  'subject.ref': "${{ github.event.issue.number || github.event.inputs.issue_number || github.event.pull_request.number }}",
  'subject.actor': "${{ github.event.sender.login || github.actor }}",
  'subject.text': "${{ github.event.comment.body || github.event.issue.body }}",
  'trigger.kind': "${{ github.event.action || github.event_name }}",
};
type WithParams = { params?: Record<string, string> };
// An agent's declared trigger params (unioned across its triggers) → job env lines (opaque name → the
// github resolution of its documented source).
function triggerParamsEnv(agent: IRAgent): string[] {
  const params: Record<string, string> = {};
  for (const t of agent.triggers) for (const [n, s] of Object.entries((t as WithParams).params ?? {})) params[n] = s;
  return Object.entries(params).map(([n, s]) => `      ${n}: ${TRIGGER_SOURCE_GH[s] ?? "''"}`);
}
function subjectRefParam(agent: IRAgent): string | undefined {
  for (const t of agent.triggers) for (const [n, s] of Object.entries((t as WithParams).params ?? {})) if (s === 'subject.ref') return n;
  return undefined;
}

function onLines(agent: IRAgent, kind: 'run' | 'launch'): string[] {
  const lines = ['on:'];
  const cron = cronOf(agent);
  if (cron) lines.push('  schedule:', `    - cron: "${cron}"`);
  const seen = new Set<string>();
  if (kind === 'launch') {
    lines.push('  workflow_dispatch:', '    inputs:', ...DISPATCH_INPUTS);
    lines.push('  issue_comment:', '    types: [created]');
    seen.add('workflow_dispatch').add('issue_comment');
  } else {
    lines.push('  workflow_dispatch: {}');
    seen.add('workflow_dispatch');
  }
  for (const t of agent.triggers) {
    if ('cron' in t || seen.has(t.event)) continue;
    seen.add(t.event);
    lines.push(...eventLines(t.event, t.config));
  }
  return lines;
}

// Realize an agent's capabilities (docs/CAPABILITIES.md) as a GitHub job `permissions:` block. Pure
// authority → github's permission model; another substrate maps it differently or ignores it.
function capsToPermissions(caps: string[]): string {
  const p: Record<string, string> = { contents: 'write', 'id-token': 'write' };
  const grant = (k: string, lvl: string) => { if (p[k] !== 'write') p[k] = lvl; };
  for (const c of caps) {
    if (c === 'artifact:author') p['pull-requests'] = 'write';
    else if (c === 'tasks:author' || c === 'tasks:converse') p.issues = 'write';
    else if (c === 'agent:launch' || c === 'agent:update' || c === 'agent:cancel') p.actions = 'write';
    else if (c === 'agent:list') grant('actions', 'read');
  }
  return `{ ${Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

// Structural job config the github adapter reads from the agent's config box.
function concurrencyLines(agent: IRAgent): string[] {
  const group = cfg(agent).concurrency;
  return typeof group === 'string' && group
    ? ['concurrency:', `  group: ${JSON.stringify(group)}`, '  cancel-in-progress: false']
    : [];
}
function timeoutLines(agent: IRAgent): string[] {
  const t = cfg(agent).timeout;
  return typeof t === 'number' ? [`    timeout-minutes: ${t}`] : [];
}
function envLines(agent: IRAgent): string[] {
  const env = cfg(agent).env;
  if (!env || typeof env !== 'object') return [];
  return Object.entries(env as Record<string, unknown>).map(([k, v]) => `      ${k}: ${v}`);
}
// Control-aware concurrency for a model-interpreted agent: control commands get a SEPARATE group so
// they are never queued behind the run they target. cancel-in-progress false so a re-trigger doesn't kill.
function launchConcurrencyLines(name: string, agent: IRAgent): string[] {
  const override = cfg(agent).concurrency;
  if (typeof override === 'string' && override) {
    return ['concurrency:', `  group: ${JSON.stringify(override)}`, '  cancel-in-progress: false'];
  }
  const exempt = CONTROL_VERBS.map((v) => `startsWith(github.event.comment.body || '', '/agent ${v}')`).join(' || ');
  return [
    'concurrency:',
    '  group: >-',
    `    ${name}-\${{ github.event.issue.number || inputs.issue_number }}\${{`,
    `    (${exempt}) && '-control' || '' }}`,
    '  cancel-in-progress: false',
  ];
}
function artifactLines(name: string): string[] {
  return [
    `      - uses: actions/upload-artifact@v4`,
    `        if: always()`,
    `        with:`,
    `          name: ${name}-\${{ github.run_id }}`,
    `          path: .agent-run`,
    `          if-no-files-found: warn`,
  ];
}

// A deterministic agent (script behavior): trusted, runs the script directly. The script is
// self-contained — it reads/writes via tooling (gh), using the trigger params in its env.
function deterministicYml(name: string, agent: IRAgent): string {
  return [
    `name: ${name}`,
    ...onLines(agent, 'run'),
    `permissions: ${capsToPermissions(agent.capabilities ?? [])}`,
    ...concurrencyLines(agent),
    `env:`,
    `  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`,
    `jobs:`,
    `  ${name}:`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    ...triggerParamsEnv(agent),
    ...envLines(agent),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - run: bun ${agent.behavior}`,
    ...artifactLines(name),
    ``,
  ].join('\n');
}

// A model-interpreted agent (skill behavior): the universal privilege-separated wrapper. The agent job
// holds NO write creds and NO admin token (persist-credentials:false, read-only); its only output is the
// bundle, which the trusted publisher validates and applies. Trust boundary correct by construction.
function wrapperYml(name: string, agent: IRAgent): string {
  const caps = agent.capabilities ?? [];
  const skillPath = `.codex/skills/${agent.behavior}/SKILL.md`;
  const RID = `ir-${name}-\${{ github.run_id }}`;
  const BUNDLE = `agent-bundle-\${{ github.run_id }}`;
  // The work item comes from the trigger's declared `subject.ref` param (resolved into job env), fetched
  // via tooling — not implicit $GITHUB_EVENT_PATH. An agent with no subject.ref is autonomous (cron):
  // it gets a minimal synthetic payload rather than a work item.
  const refParam = subjectRefParam(agent);
  const buildIssue = refParam
    ? [
        `      - name: Build issue payload`,
        `        env:`,
        `          GH_TOKEN: \${{ github.token }}`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          ref="\${${refParam}}"`,
        `          if [ -z "$ref" ]; then echo "no subject.ref forwarded by the trigger"; exit 1; fi`,
        `          gh issue view "$ref" --json number,title,body,author,labels,comments --jq '{number,title,body,user:{login:.author.login},labels,comments}' > .agent-run/issue.json`,
      ]
    : [
        `      - name: Build payload (autonomous — no work item)`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          printf '{"number":0,"title":${JSON.stringify(name)},"body":""}\\n' > .agent-run/issue.json`,
      ];
  return [
    `name: ${name}`,
    ...onLines(agent, 'launch'),
    `permissions: {}`,
    ...launchConcurrencyLines(name, agent),
    `env:`,
    `  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`,
    `jobs:`,
    `  control:`,
    `    if: ${IS_CONTROL}`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { contents: read, issues: write, actions: write }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      CONTROL_WORKFLOW: ${name}.yml`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - run: node .github/agent-control.mjs`,
    `  setup:`,
    `    if: ${NOT_CONTROL}`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { contents: read, issues: read, id-token: write }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    ...triggerParamsEnv(agent),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    ...buildIssue,
    `      - name: Mint bounded model token`,
    `        run: bun scripts/model-proxy-mint.ts --run-id "${RID}" --models "\${{ vars.PUBLIC_AGENT_MODEL || 'gpt-4o-mini' }}" --max-usd-cents "\${{ vars.PUBLIC_AGENT_MAX_USD_CENTS || '200' }}" --max-requests "\${{ vars.PUBLIC_AGENT_MAX_REQUESTS || '60' }}" --issue .agent-run/issue.json`,
    `  ${name}:`,
    `    needs: setup`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    permissions: { contents: read, issues: read, pull-requests: read, id-token: write }`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    `      PUBLIC_AGENT_MODEL: \${{ vars.PUBLIC_AGENT_MODEL || 'gpt-4o-mini' }}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CODEX_VERSION }}`,
    `      GH_TOKEN: \${{ github.token }}`,
    ...triggerParamsEnv(agent),
    ...envLines(agent),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `        with: { persist-credentials: false }`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - name: relax apparmor for the codex sandbox`,
    `        run: |`,
    `          cur=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || true)`,
    `          if [ -n "$cur" ] && [ "$cur" != "0" ]; then sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0; fi`,
    `      - name: install codex CLI`,
    `        run: npm install -g "@openai/codex@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && codex --version`,
    ...buildIssue,
    `      - name: Exchange OIDC for the bounded token`,
    `        run: bun scripts/model-proxy-exchange.ts --run-id "${RID}" --audience "$MODEL_PROXY_OIDC_AUDIENCE"`,
    `      - name: Run agent (codex + skill) and bundle the result`,
    `        run: |`,
    `          bun scripts/github-agent-session.ts --issue .agent-run/issue.json --run-id "${RID}" --out .agent-run/out --repo "\${{ github.repository }}" --actor "\${{ github.actor }}" -- bash -lc "bun scripts/codex-agent-run.ts --skill ${skillPath}; rc=\\$?; bun scripts/agent-visual-verify.ts || true; exit \\$rc"`,
    `      - uses: actions/upload-artifact@v4`,
    `        with:`,
    `          name: ${BUNDLE}`,
    `          path: .agent-run/out/bundle`,
    `          if-no-files-found: error`,
    `  publisher:`,
    `    needs: [setup, ${name}]`,
    `    runs-on: ubuntu-latest`,
    `    permissions: ${capsToPermissions(caps)}`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - uses: actions/download-artifact@v4`,
    `        with:`,
    `          name: ${BUNDLE}`,
    `          path: .agent-run/bundle`,
    `      - name: Validate and apply the agent bundle`,
    `        run: bun scripts/github-agent-publish.ts --bundle .agent-run/bundle --apply --expected-run-id "${RID}" --expected-repo "\${{ github.repository }}"`,
    `      - name: Open the agent's pull request`,
    `        run: |`,
    `          set -euo pipefail`,
    `          branch="agent/${RID}"`,
    `          git config user.name volter-agent`,
    `          git config user.email volter-agent@users.noreply.github.com`,
    `          git config core.filemode false`,
    `          git checkout -b "$branch"`,
    `          git add -A`,
    `          if git diff --cached --quiet; then echo "agent produced no changes"; exit 0; fi`,
    `          git commit -m "agent: ${RID}"`,
    `          git push --force-with-lease origin "$branch"`,
    `          body="$(find .agent-run/bundle -name pr.md | head -1)"`,
    `          if [ -n "$body" ]; then gh pr create --base "\${{ github.event.repository.default_branch }}" --head "$branch" --title "Agent run ${RID}" --body-file "$body"; else gh pr create --base "\${{ github.event.repository.default_branch }}" --head "$branch" --title "Agent run ${RID}" --body "Automated agent run ${RID}"; fi`,
    `  revoke:`,
    `    needs: [setup, ${name}, publisher]`,
    `    if: always() && needs.setup.result == 'success'`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { id-token: write }`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - run: bun scripts/model-proxy-revoke.ts --run-id "${RID}" || true`,
    ``,
  ].join('\n');
}

function agentYml(name: string, agent: IRAgent): string {
  return isScript(agent.behavior) ? deterministicYml(name, agent) : wrapperYml(name, agent);
}

export function compileGithub(ir: AutonomyIR): CompileOutput {
  const generated: Record<string, string> = {};
  // The manifest is generated unless the profile carries a hand-authored autonomy.yml verbatim.
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    generated['.open-autonomy/autonomy.yml'] = Bun.YAML.stringify(emitAutonomy(ir) as Record<string, unknown>);
  }
  // Every agent generates its workflow.
  for (const [name, agent] of Object.entries(ir.agents)) {
    generated[`.github/workflows/${name}.yml`] = agentYml(name, agent);
  }
  // Model-interpreted agents carry the operator control plane, so emit its handler.
  if (Object.values(ir.agents).some((a) => !isScript(a.behavior))) {
    generated['.github/agent-control.mjs'] = AGENT_CONTROL;
  }
  // The substrate injects its runtime backend.
  Object.assign(generated, RUNTIME);

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    if (!isScript(agent.behavior)) {
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.codex/skills/${agent.behavior}/SKILL.md` });
    }
  }
  for (const r of ir.resources) copies.push({ from: r, to: r });
  return { generated, copies };
}
