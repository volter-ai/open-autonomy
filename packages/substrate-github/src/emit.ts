// Emit autonomy.ir.v1 → an open-autonomy manifest + the github installation. The IR is the standard;
// this is github's (partial) implementation. One unit: an agent. The substrate decides execution from
// the behavior artifact — a prose skill runs via a model (the privilege-separated wrapper, untrusted →
// mediated); a script runs deterministically (a job, trusted → direct). See docs/AUTONOMY-IR.md.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import { cronOf, emitAutonomy, withGeneratedManifest } from '@open-autonomy/core';
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
function capsToPermissions(caps: string[], extra?: unknown): string {
  // The agent job's LEAST-PRIVILEGE token: baseline is checkout (contents:read) + OIDC for the model token
  // (id-token:write); each capability widens it (docs/CAPABILITIES.md). The merge boundary is the split:
  // code:propose can push/PR/queue-auto-merge/dispatch-CI but never gets statuses:write (can't self-certify
  // a review); code:review gets statuses:write but never contents:write (can't merge). No agent gets both.
  const p: Record<string, string> = { contents: 'read', 'id-token': 'write' };
  const grant = (k: string, lvl: string) => { if (p[k] !== 'write') p[k] = lvl; };
  for (const rawC of caps) {
    const c = rawC.split('@')[0]; // strip an optional @scope (e.g. code:propose@roadmap)
    if (c === 'code:propose') { p.contents = 'write'; p['pull-requests'] = 'write'; p.actions = 'write'; }
    else if (c === 'code:review') p.statuses = 'write'; // bless-a-merge: post the agent-review status
    else if (c === 'tasks:author' || c === 'tasks:converse') p.issues = 'write';
    else if (c === 'agent:launch' || c === 'agent:update' || c === 'agent:cancel') p.actions = 'write';
    else if (c === 'agent:list') grant('actions', 'read');
  }
  // A github-specific permission the capability vocabulary does not name (e.g. statuses:read so an
  // interpreter's merge gate can SEE the `ci` commit status) rides via `config.permissions`, merged
  // last-write-wins — same escape hatch deterministicPerms uses.
  if (extra && typeof extra === 'object') for (const [k, v] of Object.entries(extra as Record<string, unknown>)) p[k] = String(v);
  return `{ ${Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

// A run-time bound (minutes) — an agnostic IR field the substrate realizes as the job timeout.
function timeoutLines(agent: IRAgent): string[] {
  return typeof agent.timeout === 'number' ? [`    timeout-minutes: ${agent.timeout}`] : [];
}
// Control-aware concurrency: control commands get a SEPARATE group so they are never queued behind the
// run they target. cancel-in-progress false so a re-trigger doesn't kill the run. Derived from the agent
// name + work item — no profile override (substrate-free).
function launchConcurrencyLines(name: string, _agent: IRAgent): string[] {
  const exempt = CONTROL_VERBS.map((v) => `startsWith(github.event.comment.body || '', '/agent ${v}')`).join(' || ');
  return [
    'concurrency:',
    '  group: >-',
    `    ${name}-\${{ github.event.issue.number || inputs.issue_number }}\${{`,
    `    (${exempt}) && '-control' || '' }}`,
    '  cancel-in-progress: false',
  ];
}

// Every agent is a skill (no script behaviors): one realization, the credentialed wrapper below.

// A skill (model) agent: a single CREDENTIALED job whose token is scoped to its capabilities. It reads its
// subject, runs the skill, and acts directly (a generic effect step turns a working-tree change into an
// auto-merging PR; non-proposing agents post their verdict/comment via gh in-skill). No credential-less
// job, no bundle, no publisher — the merge boundary is the capability/permission split (docs/CAPABILITIES.md).
function wrapperYml(name: string, agent: IRAgent): string {
  const caps = agent.capabilities ?? [];
  const skillPath = `.codex/skills/${agent.behavior}/SKILL.md`;
  const RID = `ir-${name}-\${{ github.run_id }}`;
  // The work item comes from the trigger's declared `subject.ref` param (resolved into job env). An agent
  // with no subject.ref is autonomous (cron): it gets a minimal synthetic payload. The skill fetches any
  // deeper context itself (it is credentialed — it has gh + read).
  const refParam = subjectRefParam(agent);
  const branchExpr = refParam ? `agent/issue-\${${refParam}}` : `agent/${RID}`;
  const buildIssue = refParam
    ? [
        `      - name: Provide subject`,
        `        env:`,
        `          GH_TOKEN: \${{ github.token }}`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          ref="\${${refParam}}"`,
        `          if [ -z "$ref" ]; then echo "no subject.ref forwarded by the trigger"; exit 1; fi`,
        `          gh issue view "$ref" --json number,title,body,author,labels,comments --jq '{number,title,body,user:{login:.author.login},labels,comments}' > .agent-run/issue.json`,
      ]
    : [
        `      - name: Provide subject (autonomous — no work item)`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          printf '{"number":0,"title":${JSON.stringify(name)},"body":""}\\n' > .agent-run/issue.json`,
      ];
  // The generic EFFECT step: the agent acts directly in its own credentialed job. If the skill changed the
  // working tree (a code:propose agent), push it as an auto-merging PR — GitHub lands it once `ci` +
  // `agent-review` are green (docs/CAPABILITIES.md, the merge boundary). A non-proposing agent (reviewer:
  // posts agent-review via gh; pm/planner: comment/label via gh) changes no files, so this no-ops. There is
  // no bundle and no publisher — the agent's own token (scoped to its capabilities) does the work.
  const effect = [
    `      - name: Effect — propose the change as an auto-merging PR (if the tree changed)`,
    `        env:`,
    `          GH_TOKEN: \${{ github.token }}`,
    `        run: |`,
    `          set -euo pipefail`,
    `          if [ -z "$(git status --porcelain)" ]; then echo "no working-tree changes; nothing to propose"; exit 0; fi`,
    `          branch="${branchExpr}"`,
    `          git config user.name volter-agent`,
    `          git config user.email volter-agent@users.noreply.github.com`,
    `          git config core.filemode false`,
    `          git checkout -b "$branch"`,
    `          git add -A`,
    `          git commit -m "agent: ${RID}"`,
    `          git push --force origin "$branch"`,
    `          base="\${{ github.event.repository.default_branch }}"`,
    `          body="$(cat .agent-run/artifacts/pr.md 2>/dev/null || echo "Automated agent change (${RID}).")"`,
    `          gh pr create --base "$base" --head "$branch" --title "Agent: ${RID}" --body "$body" || gh pr view "$branch" >/dev/null`,
    `          gh pr merge "$branch" --squash --auto || echo "auto-merge enable failed (non-fatal)"`,
    // Bot-opened PRs don't fire pull_request CI (GITHUB_TOKEN anti-recursion); workflow_dispatch is exempt,
    // so dispatch ci.yml on the PR head to post the required `ci` status that gates auto-merge.
    `          head_sha="$(git rev-parse HEAD)"`,
    `          pr_number="$(gh pr view "$branch" --json number --jq .number 2>/dev/null || echo "")"`,
    `          gh workflow run ci.yml --ref "$branch" -f sha="$head_sha" -f pr="$pr_number" || echo "ci dispatch failed (non-fatal)"`,
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
    // The agent job is CREDENTIALED — its token is scoped to its capabilities (docs/CAPABILITIES.md). It
    // reads its subject, runs the skill, and acts directly; the only thing it can never do is merge (no
    // statuses:write on a proposer; no contents:write on a reviewer), enforced by the permission split.
    `  ${name}:`,
    `    needs: setup`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    permissions: ${capsToPermissions(caps)}`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    `      PUBLIC_AGENT_MODEL: \${{ vars.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash' }}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION }}`,
    `      GH_TOKEN: \${{ github.token }}`,
    ...triggerParamsEnv(agent),
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile || bun install`,
    `      - name: install Claude Code CLI`,
    `        run: npm install -g "@anthropic-ai/claude-code@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && claude --version`,
    ...buildIssue,
    `      - name: Exchange OIDC for the bounded token`,
    `        run: bun scripts/model-proxy-exchange.ts --run-id "${RID}" --audience "$MODEL_PROXY_OIDC_AUDIENCE"`,
    `      - name: Run agent (Claude Code + skill)`,
    `        env:`,
    `          OSS_AGENT_TASK_DIR: .agent-run`,
    `          OSS_AGENT_ISSUE_PATH: .agent-run/issue.json`,
    `        run: |`,
    `          bun scripts/claude-agent-run.ts --skill ${skillPath}; rc=$?; bun scripts/agent-visual-verify.ts || true; exit $rc`,
    ...effect,
    `      - run: bun scripts/model-proxy-revoke.ts --run-id "${RID}" || true`,
    `        if: always()`,
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
  return wrapperYml(name, agent); // every agent is a skill
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
  // Every agent generates its workflow, named for the agent (substrate-derived — no profile-pinned
  // filename). The proxy's OIDC trust is repo-based (any workflow under .github/workflows/), so names are
  // the substrate's to choose.
  for (const [name, agent] of Object.entries(ir.agents)) {
    if (isHuman(agent)) continue; // a human actor is declared in the manifest, not realized as a github job
    generated[`.github/workflows/${name}.yml`] = agentYml(name, agent);
  }
  // Agents carry the operator control plane, so emit its handler.
  if (Object.values(ir.agents).some((a) => !isHuman(a))) {
    generated['.github/agent-control.mjs'] = AGENT_CONTROL;
  }
  // The substrate injects its runtime backend.
  Object.assign(generated, RUNTIME);

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    if (!isHuman(agent)) {
      // Install the skill where each harness discovers it: codex from `.codex/skills/`, Claude Code from
      // `.claude/skills/`. The agent's credentialed job runs Claude Code against the skill.
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.codex/skills/${agent.behavior}/SKILL.md` });
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.claude/skills/${agent.behavior}/SKILL.md` });
    }
  }
  for (const r of ir.resources) copies.push({ from: r, to: r });
  return withGeneratedManifest({ generated, copies });
}
