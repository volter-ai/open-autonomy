// Emit autonomy.ir.v1 → an open-autonomy manifest + the github installation. The IR is the standard;
// this is github's (partial) implementation. One unit: an agent. The substrate decides execution from
// the behavior artifact — a prose skill runs via a model (the privilege-separated wrapper, untrusted →
// mediated); a script runs deterministically (a job, trusted → direct). See docs/AUTONOMY-IR.md.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import { cfg, cronOf, emitAutonomy, isScript, withGeneratedManifest } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';

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


// --- `on:` + trigger params ---

// The one manual-dispatch input every agent that targets a work item exposes: which work item. The
// wrapper develops on any dispatch (operator control is a comment, handled by the control job), so
// there is no `command` input; the issue payload is built from this number via the subject.ref param.
const DISPATCH_INPUTS = [
  '      issue_number: { description: "issue/PR number to act on", required: false, type: string }',
];

// Render a carried (non-cron) event trigger as github `on:` YAML; its config (issues `types`, …) is
// carried verbatim block-style (scalar | string[]).
// github's realization of the portable `task:` trigger (docs/TASK-LIFECYCLE.md): a lifecycle state is a
// label of that name, so every `task: <state>` fires on the `issues` `labeled` event and the runtime reads
// which label = which state. Uniform by default — no per-state special-casing frozen into the compiler. A
// richer per-state mapping, if a substrate ever wants one, is declared data + conformance, not a branch.
function taskAsEvent(_state: string): { event: string; config?: Record<string, unknown> } {
  return { event: 'issues', config: { types: ['labeled'] } };
}

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
  'subject.actorRole': '${{ github.event.comment.author_association }}',
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
    // A deterministic agent that targets a work item exposes the standard `issue_number` dispatch
    // input (the github resolution of subject.ref reads it); otherwise plain manual dispatch.
    if (subjectRefParam(agent)) {
      lines.push('  workflow_dispatch:', '    inputs:', ...DISPATCH_INPUTS);
    } else {
      lines.push('  workflow_dispatch: {}');
    }
    seen.add('workflow_dispatch');
  }
  for (const t of agent.triggers) {
    if ('cron' in t) continue;
    const e = 'task' in t ? taskAsEvent(t.task) : { event: t.event, config: t.config };
    if (seen.has(e.event)) continue;
    seen.add(e.event);
    lines.push(...eventLines(e.event, e.config));
  }
  return lines;
}

// Realize an agent's capabilities (docs/CAPABILITIES.md) as a GitHub job `permissions:` block. Pure
// authority → github's permission model; another substrate maps it differently or ignores it.
function capsToPermissions(caps: string[]): string {
  // actions:write so the publisher can dispatch CI (workflow_dispatch) on the bot-opened PR head —
  // bot PRs don't trigger pull_request CI (GITHUB_TOKEN anti-recursion), but workflow_dispatch is exempt.
  const p: Record<string, string> = { contents: 'write', 'id-token': 'write', actions: 'write' };
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

// A deterministic agent's job permissions, realized from its capabilities (docs/CAPABILITIES.md). A
// deterministic job is TRUSTED (its own repo code, not model-interpreted), so the baseline is
// contents:write — it may push/merge — and capabilities widen it. The strict least-privilege boundary
// lives in the wrapper's untrusted agent job, not here.
function deterministicPerms(caps: string[], extra?: unknown): string {
  const p: Record<string, string> = {
    contents: 'write',
    'id-token': 'write',
    'pull-requests': 'read',
    checks: 'read',
  };
  for (const c of caps) {
    if (c === 'artifact:author') p['pull-requests'] = 'write';
    else if (c === 'tasks:author' || c === 'tasks:converse') {
      p.issues = 'write';
      p['pull-requests'] = 'write';
    } else if (c === 'agent:launch' || c === 'agent:update' || c === 'agent:cancel') p.actions = 'write';
    else if (c === 'agent:list' && !p.actions) p.actions = 'read';
  }
  // A github-specific permission the capability vocabulary does not name (e.g. statuses:write for
  // posting a commit status) is carried via `config.permissions` and merged here, last-write-wins.
  if (extra && typeof extra === 'object') for (const [k, v] of Object.entries(extra as Record<string, unknown>)) p[k] = String(v);
  return `{ ${Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

// The github box's model-endpoint provisioning, gated on `config.model` (a github-substrate config key —
// the box always has a model endpoint; only agents that call the model need it provisioned). github is
// the untrusted-keyless case, so the box endpoint is the remote proxy reached through a bounded mint. The
// run token is minted via the workflow's GitHub OIDC identity (id-token: write) — NO admin secret in any
// repo; the proxy derives repo/actor/run from the OIDC claims and gates on its trusted-repo allow-list.
// The mint writes the stock SDK env vars to $GITHUB_ENV, so the agent step makes transparent SDK calls
// with no token of its own. A trusted substrate (local) provisions the box its own way (ambient keys).
function modelSetupStep(agent: IRAgent): string[] {
  if (!cfg(agent).model) return [];
  return [
    `      - name: Provision model endpoint`,
    `        env:`,
    `          MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `          MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    `          MODEL_ALLOWLIST: \${{ vars.PUBLIC_AGENT_MODELS || 'deepseek/deepseek-v4-flash' }}`,
    `          PUBLIC_AGENT_RUN_MAX_USD_CENTS: \${{ vars.PUBLIC_AGENT_RUN_MAX_USD_CENTS || '500' }}`,
    `          PUBLIC_AGENT_RUN_MAX_REQUESTS: \${{ vars.PUBLIC_AGENT_RUN_MAX_REQUESTS || '60' }}`,
    `        run: bun scripts/provision-model-endpoint.ts`,
    // Decisions run a real agent: runClaudeAgent spawns Claude Code (investigate, write a schema-validated
    // result). So a model-using deterministic agent needs the CLI on its box.
    `      - name: install Claude Code CLI`,
    `        run: npm install -g "@anthropic-ai/claude-code@\${{ vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION || 'latest' }}" && claude --version`,
  ];
}

// Checkout persists the workflow token by default; an agent that never `git push`es (it acts purely
// through gh/the API) sets `config.persistCredentials: false` for a tighter checkout.
function checkoutLines(agent: IRAgent): string[] {
  return cfg(agent).persistCredentials === false
    ? ['      - uses: actions/checkout@v4', '        with: { persist-credentials: false }']
    : ['      - uses: actions/checkout@v4'];
}

// A deterministic agent (script behavior): trusted, runs the script directly. The script is
// self-contained — it reads/writes via tooling (gh), using the trigger params in its env.
function deterministicYml(name: string, agent: IRAgent): string {
  return [
    `name: ${name}`,
    ...onLines(agent, 'run'),
    `permissions: ${deterministicPerms(agent.capabilities ?? [], cfg(agent).permissions)}`,
    ...concurrencyLines(agent),
    `env:`,
    `  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`,
    `jobs:`,
    `  ${name}:`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    ...triggerParamsEnv(agent),
    ...envLines(agent),
    `    steps:`,
    ...checkoutLines(agent),
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    ...modelSetupStep(agent),
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
    `        run: bun scripts/model-proxy-mint.ts --run-id "${RID}" --models "\${{ vars.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash' }}" --max-usd-cents "\${{ vars.PUBLIC_AGENT_MAX_USD_CENTS || '200' }}" --max-requests "\${{ vars.PUBLIC_AGENT_MAX_REQUESTS || '60' }}" --issue .agent-run/issue.json`,
    `  ${name}:`,
    `    needs: setup`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    permissions: { contents: read, issues: read, pull-requests: read, id-token: write }`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    `      PUBLIC_AGENT_MODEL: \${{ vars.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash' }}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION }}`,
    `      GH_TOKEN: \${{ github.token }}`,
    ...triggerParamsEnv(agent),
    ...envLines(agent),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `        with: { persist-credentials: false }`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - name: install Claude Code CLI`,
    `        run: npm install -g "@anthropic-ai/claude-code@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && claude --version`,
    ...buildIssue,
    `      - name: Exchange OIDC for the bounded token`,
    `        run: bun scripts/model-proxy-exchange.ts --run-id "${RID}" --audience "$MODEL_PROXY_OIDC_AUDIENCE"`,
    `      - name: Run agent (Claude Code + skill) and bundle the result`,
    `        run: |`,
    `          bun scripts/github-agent-session.ts --issue .agent-run/issue.json --run-id "${RID}" --out .agent-run/out --repo "\${{ github.repository }}" --actor "\${{ github.actor }}" -- bash -lc "bun scripts/claude-agent-run.ts --skill ${skillPath}; rc=\\$?; bun scripts/agent-visual-verify.ts || true; exit \\$rc"`,
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
    ...triggerParamsEnv(agent),
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
    // The branch is the canonical per-work-item branch the reviewer/merge-gate recognize
    // (agent/issue-<ref>); a develop retry replaces it. An autonomous agent (no subject.ref) has no
    // work item, so it falls back to a per-run branch.
    refParam ? `          branch="agent/issue-\${${refParam}}"` : `          branch="agent/${RID}"`,
    `          git config user.name volter-agent`,
    `          git config user.email volter-agent@users.noreply.github.com`,
    `          git config core.filemode false`,
    `          git checkout -b "$branch"`,
    `          git add -A`,
    `          if git diff --cached --quiet; then echo "agent produced no changes"; exit 0; fi`,
    `          git commit -m "agent: ${RID}"`,
    `          git push --force origin "$branch"`,
    `          body="$(find .agent-run/bundle -name pr.md | head -1)"`,
    `          if [ -n "$body" ]; then gh pr create --base "\${{ github.event.repository.default_branch }}" --head "$branch" --title "Agent run ${RID}" --body-file "$body"; else gh pr create --base "\${{ github.event.repository.default_branch }}" --head "$branch" --title "Agent run ${RID}" --body "Automated agent run ${RID}"; fi`,
    // Bot-opened PRs don't trigger pull_request CI (GITHUB_TOKEN anti-recursion → action_required), but
    // workflow_dispatch is exempt: dispatch CI on the PR head so it posts the required 'ci' commit status.
    `          head_sha="$(git rev-parse HEAD)"`,
    `          pr_number="$(gh pr view "$branch" --json number --jq .number 2>/dev/null || echo "")"`,
    `          gh workflow run ci.yml --ref "$branch" -f sha="$head_sha" -f pr="$pr_number" || echo "ci dispatch failed (non-fatal)"`,
    `  revoke:`,
    `    needs: [setup, ${name}, publisher]`,
    `    if: always() && needs.setup.result == 'success'`,
    `    runs-on: ubuntu-latest`,
    // contents:read so checkout can fetch a PRIVATE repo (without it the checkout 404s "repository not
    // found" and the cleanup job false-fails, even though the agent work already published).
    `    permissions: { contents: read, id-token: write }`,
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

// Is this actor a person? A kind:human actor is DECLARED (visible in the manifest), not realized as a
// github job: the durable "await a person" block is the existing work-store mechanism (the human-required
// label + the merge gate), and HOW a person is notified/assigned/escalated is a design choice the search
// varies via config — not a template frozen in the compiler. So github generates no workflow for a human.
function isHuman(agent: IRAgent): boolean {
  return agent.kind === 'human';
}

function agentYml(name: string, agent: IRAgent): string {
  return isScript(agent.behavior) ? deterministicYml(name, agent) : wrapperYml(name, agent);
}

// The shared, substrate-neutral runtime scripts (portable agent implementations + gates + the
// transparent model call). Both substrates inject these; only the per-substrate execution layer and the
// github-only scripts (proxy/mint/wrapper) differ. Exposed so another substrate can build its install
// from the shared layer without depending on the github compiler. (The runtime's eventual neutral home is
// the coordinated relocation noted in the package readme; until then it is vendored here.)
export function runtimeFiles(): Record<string, string> {
  return { ...RUNTIME };
}

export function compileGithub(ir: AutonomyIR): CompileOutput {
  const generated: Record<string, string> = {};
  // The manifest is generated unless the profile carries a hand-authored autonomy.yml verbatim.
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    generated['.open-autonomy/autonomy.yml'] = stringifyYaml(emitAutonomy(ir) as Record<string, unknown>);
  }
  // Every agent generates its workflow. The output filename defaults to the agent name; an agent may
  // pin `config.workflowFile` (a github-substrate key) so the file keeps a name other systems already
  // reference — the model-proxy OIDC allowlist, cross-agent `gh workflow run`, branch protection.
  for (const [name, agent] of Object.entries(ir.agents)) {
    if (isHuman(agent)) continue; // a human actor is declared in the manifest, not realized as a github job
    const file = typeof cfg(agent).workflowFile === 'string' ? (cfg(agent).workflowFile as string) : `${name}.yml`;
    generated[`.github/workflows/${file}`] = agentYml(name, agent);
  }
  // Model-interpreted agents carry the operator control plane, so emit its handler.
  if (Object.values(ir.agents).some((a) => !isScript(a.behavior) && !isHuman(a))) {
    generated['.github/agent-control.mjs'] = AGENT_CONTROL;
  }
  // The substrate injects its runtime backend.
  Object.assign(generated, RUNTIME);

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    if (!isScript(agent.behavior) && !isHuman(agent)) {
      // Install the skill where each harness discovers it: codex from `.codex/skills/`, Claude Code from
      // `.claude/skills/`. The developer job runs Claude Code, which can then resolve the skill natively
      // (in addition to the wrapper inlining it). Both copies are immutable to agents (see bundle guard).
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.codex/skills/${agent.behavior}/SKILL.md` });
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.claude/skills/${agent.behavior}/SKILL.md` });
    }
  }
  for (const r of ir.resources) copies.push({ from: r, to: r });
  return withGeneratedManifest({ generated, copies });
}
