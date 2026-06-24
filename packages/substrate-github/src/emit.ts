// Emit autonomy.ir.v1 → an open-autonomy manifest + the github installation. The IR is the standard;
// this is github's (partial) implementation. One unit: an agent — a prose skill realized as ONE
// credentialed job whose token is scoped to its capabilities; the agent acts directly. There is no
// mediated/credential-less wrapper and no script-as-job path — one realization. See docs/AUTONOMY-IR.md.
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

// Authorization for the comment surface. issue_comment / pull_request_target fire for ANY user (incl.
// drive-by commenters and fork PRs), so the control plane and any comment-launch MUST be gated on a
// maintainer (author_association), and a pull_request_target agent run MUST be gated on a same-repo PR
// or a maintainer author — otherwise a plain comment launches the credentialed agent and a fork PR
// reaches the bless/mint job. (docs/CAPABILITIES.md — the merge boundary; the operator control plane.)
const MAINTAINER_ROLES = `fromJSON('["OWNER","MEMBER","COLLABORATOR"]')`;
const COMMENT_MAINTAINER = `contains(${MAINTAINER_ROLES}, github.event.comment.author_association)`;
const PR_TRUSTED = `(github.event.pull_request.head.repo.full_name == github.repository || contains(${MAINTAINER_ROLES}, github.event.pull_request.author_association))`;
// The control job: a maintainer `/agent <control-verb>` comment (anything that is NOT this agent's
// `/agent <name>` launch command). agent-control.mjs acts on the control verbs and no-ops the rest.
const controlIf = (name: string) =>
  `github.event_name == 'issue_comment' && startsWith(github.event.comment.body, '/agent ') && !startsWith(github.event.comment.body, '/agent ${name}') && ${COMMENT_MAINTAINER}`;
// The agent (setup + work) job runs ONLY on a legitimate, trust-checked trigger: any non-comment /
// non-fork-PR event (workflow_dispatch from the PM, schedule); a labeled `issues` event (applying a label
// needs triage/write, so it is implicitly maintainer-gated — but `issues: opened/reopened/edited` are
// firable by ANY user, so those must NOT launch the agent); a same-repo-or-maintainer pull_request_target;
// or an explicit maintainer `/agent <name>` launch. A plain comment matches none of these. The whole thing
// is gated by the repo-pause kill-switch: `PUBLIC_AGENT_REPO_PAUSED` is a repo VARIABLE (deterministically
// checkable in `if:`, unlike "does any issue carry a label"), so a paused fleet skips every agent job
// deterministically — not by the PM model noticing a label. (Control commands like /agent resume are NOT
// gated, so the fleet can be un-paused.)
const REPO_NOT_PAUSED = `vars.PUBLIC_AGENT_REPO_PAUSED != 'true'`;
const agentRunIf = (name: string) => {
  const triggers = [
    `(github.event_name != 'issue_comment' && github.event_name != 'pull_request_target' && github.event_name != 'issues')`,
    `(github.event_name == 'issues' && github.event.action == 'labeled')`,
    `(github.event_name == 'pull_request_target' && ${PR_TRUSTED})`,
    `(github.event_name == 'issue_comment' && startsWith(github.event.comment.body, '/agent ${name}') && ${COMMENT_MAINTAINER})`,
  ].join(' || ');
  return `${REPO_NOT_PAUSED} && (${triggers})`;
};


// --- `on:` + trigger params ---

// The one manual-dispatch input every agent that targets a work item exposes: which work item. The
// wrapper develops on any dispatch (operator control is a comment, handled by the control job), so
// there is no `command` input; the issue payload is built from this number via the subject.ref param.
const DISPATCH_INPUTS = [
  '      issue_number: { description: "issue/PR number to act on", required: false, type: string }',
];

// Egress lockdown for the credentialed jobs. The agent runs untrusted-derived work (issue/PR/comment text)
// with a capability-scoped GH_TOKEN + a bounded model token in env and full Bash, so a prompt-injected
// agent could try to exfiltrate those over the network. harden-runner block mode denies all egress except
// the allowlist (github API/clone, the npm registry for installs, and the model proxy), so a token can't be
// shipped to an attacker host even if read. The proxy host defaults to the live deployment and is
// overridable per-install via the PUBLIC_AGENT_PROXY_HOST var. harden-runner auto-allows the Actions
// control plane; we only list app-level egress.
const HARDEN_RUNNER = [
  '      - name: Lock down egress (block token exfiltration from untrusted-derived work)',
  '        uses: step-security/harden-runner@v2',
  '        with:',
  '          egress-policy: block',
  '          allowed-endpoints: >',
  '            api.github.com:443',
  '            github.com:443',
  '            codeload.github.com:443',
  '            objects.githubusercontent.com:443',
  '            release-assets.githubusercontent.com:443',
  '            registry.npmjs.org:443',
  "            ${{ vars.PUBLIC_AGENT_PROXY_HOST || 'volter-agent-model-proxy.aaron-0ed.workers.dev' }}:443",
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

// Every agent is a skill realized as one credentialed wrapper job, so every workflow exposes the same
// launch + control surface: workflow_dispatch (the PM / a maintainer dispatches a work item) and
// issue_comment (the operator control plane + maintainer `/agent <name>` launch). The agent's own IR
// triggers (cron, native events) are appended after.
function onLines(agent: IRAgent): string[] {
  const lines = ['on:'];
  const cron = cronOf(agent);
  if (cron) lines.push('  schedule:', `    - cron: "${cron}"`);
  const seen = new Set<string>();
  lines.push('  workflow_dispatch:', '    inputs:', ...DISPATCH_INPUTS);
  lines.push('  issue_comment:', '    types: [created]');
  seen.add('workflow_dispatch').add('issue_comment');
  // Collect the agent's native-event triggers, MERGING configs when two triggers resolve to the same
  // github event (e.g. two `event: issues`, or a `task:` that maps to issues:labeled colliding with an
  // explicit `event: issues`) — array keys like `types` are unioned, scalars last-write-wins. Dropping the
  // later trigger's config (the old behavior) silently lost declared event types.
  const eventConfigs = new Map<string, Record<string, unknown>>();
  for (const t of agent.triggers) {
    if ('cron' in t) continue;
    const e = 'task' in t ? taskAsEvent(t.task) : { event: t.event, config: t.config };
    if (seen.has(e.event)) continue; // workflow_dispatch / issue_comment already on the launch surface
    const merged = eventConfigs.get(e.event) ?? {};
    for (const [k, v] of Object.entries(e.config ?? {})) {
      const prev = merged[k];
      merged[k] = Array.isArray(v) && Array.isArray(prev) ? [...new Set([...prev, ...v])] : v;
    }
    eventConfigs.set(e.event, merged);
  }
  for (const [event, config] of eventConfigs) lines.push(...eventLines(event, config));
  return lines;
}

// Realize an agent's capabilities (docs/CAPABILITIES.md) as a GitHub job `permissions:` block. Pure
// authority → github's permission model; another substrate maps it differently or ignores it.
function capsToPermissions(caps: string[]): string {
  // The agent job's LEAST-PRIVILEGE token: baseline is checkout (contents:read) + OIDC for the model token
  // (id-token:write); each capability widens it (docs/CAPABILITIES.md). The merge boundary is the split:
  // code:propose can push/PR/queue-auto-merge/dispatch-CI but never gets statuses:write (can't self-certify
  // a review); code:review gets statuses:write but never contents:write (can't merge). No agent gets both.
  // Baseline OBSERVATION (docs/CAPABILITIES.md: reads are ambient, not a granted capability): checkout
  // (contents:read), read the work item whether issue or PR (issues+pull-requests:read), and OIDC for the
  // model token (id-token:write). Capabilities below widen WRITE authority.
  const p: Record<string, string> = { contents: 'read', issues: 'read', 'pull-requests': 'read', 'id-token': 'write' };
  const grant = (k: string, lvl: string) => { if (p[k] !== 'write') p[k] = lvl; };
  for (const rawC of caps) {
    const c = rawC.split('@')[0]; // strip an optional @scope (e.g. code:propose@roadmap)
    if (c === 'code:propose') { p.contents = 'write'; p['pull-requests'] = 'write'; p.actions = 'write'; }
    else if (c === 'code:review') p.statuses = 'write'; // bless-a-merge: post the agent-review status
    else if (c === 'tasks:author' || c === 'tasks:converse') p.issues = 'write';
    else if (c === 'agent:launch' || c === 'agent:cancel') p.actions = 'write';
    else if (c === 'agent:list') grant('actions', 'read');
  }
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
  // Only a code:propose agent gets the effect step (push branch + open auto-merging PR). A non-proposer
  // (reviewer/pm/planner) has contents:read, so a stray tracked-file write would make the effect's
  // `git push` 403 and fail the job after the verdict was posted — tie the step to the capability.
  const proposes = caps.some((c) => typeof c === 'string' && c.split('@')[0] === 'code:propose');
  // A tasks:author agent (the periodic issue-manager: pm/planner) runs a deterministic reconcile before its
  // model step — close issues whose linked PR merged. Mechanical wiring (not judgment), so it must not depend
  // on the model remembering to do it; symmetric to `effect` for code:propose. Idempotent.
  const reconciles = caps.some((c) => typeof c === 'string' && c.split('@')[0] === 'tasks:author');
  // The planner additionally reconciles roadmap.yml → tracking issues deterministically. Creating one issue
  // per planned/active item is mechanical wiring (matched by a `roadmap:<id>` label), not judgment — so, like
  // closing merged issues, it must not hinge on a (possibly weak) model executing its skill. Idempotent.
  const reconcilesRoadmap = agent.behavior === 'planner';
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
        `          gh api "repos/\${{ github.repository }}/issues/$ref" --jq '{number,title,body,user:{login:.user.login},labels:[.labels[].name]}' > .agent-run/issue.json`,
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
    // Persist this run's processed transcript AND its visual evidence INTO the proposal so they ride into the
    // PR and become part of PERMANENT history only if the PR merges (non-merged proposals never land them).
    // Each run gets its own folder (transcript.md + any harvested screenshots) so the evidence travels with the
    // record — screenshots would otherwise vanish with the 30-day Actions artifact. Only proposers reach this
    // effect step, so only developer (develop runs) and strategist (strategy decisions) keep records — never
    // the PM/reviewer/planner bookkeeping. `.agent-run/` stays gitignored; this copy is the durable record.
    ...(refParam
      ? [`          ref_slug="$(printf '%s' "\${${refParam}}" | tr -cd '0-9A-Za-z._-' | cut -c1-40)"; [ -z "$ref_slug" ] && ref_slug=item`]
      : [`          ref_slug=autonomous`]),
    `          run_dir=".open-autonomy/history/${name}/\${ref_slug}-run-\${{ github.run_id }}"`,
    `          mkdir -p "$run_dir"`,
    `          cp -f .agent-run/artifacts/transcript.md "$run_dir/transcript.md" 2>/dev/null || true`,
    `          cp -f .agent-run/artifacts/screenshot-* "$run_dir/" 2>/dev/null || true`,
    `          git add -A`,
    // Link the PR to its issue so the merge auto-closes it. The closing keyword goes in the COMMIT message
    // (squash-merge carries it into the merge commit — the reliable path; a PR-body keyword alone is dropped
    // when the repo squashes from the commit message) AND the PR body. Only when the subject is an issue
    // number (refParam present + numeric); roadmap/cron proposers have no issue to close.
    ...(refParam
      ? [
          `          ref="\${${refParam}}"`,
          `          if printf '%s' "$ref" | grep -qE '^[0-9]+$'; then git commit -m "agent: ${RID}" -m "Closes #$ref"; else git commit -m "agent: ${RID}"; fi`,
        ]
      : [`          git commit -m "agent: ${RID}"`]),
    `          git push --force origin "$branch"`,
    `          base="\${{ github.event.repository.default_branch }}"`,
    `          body="$(cat .agent-run/artifacts/pr.md 2>/dev/null || echo "Automated agent change (${RID}).")"`,
    ...(refParam
      ? [`          if printf '%s' "$ref" | grep -qE '^[0-9]+$'; then body="$(printf 'Closes #%s\\n\\n%s' "$ref" "$body")"; fi`]
      : []),
    `          gh pr create --base "$base" --head "$branch" --title "Agent: ${RID}" --body "$body" || gh pr view "$branch" >/dev/null`,
    // Arm native auto-merge — and RETRY. Right after 'pr create' GitHub still reports mergeable=UNKNOWN for a
    // moment, so a single --auto often fails; with the failure swallowed, the PR's checks then go green but
    // nothing ever merges it (no agent holds contents:write to re-arm, and the PM is forbidden to merge), so it
    // sits green-but-stuck forever. Retry until it sticks. This cannot bypass review: branch protection still
    // requires ci + agent-review server-side, so --auto only lands the PR once those are green.
    `          armed=; for i in 1 2 3 4 5 6; do gh pr merge "$branch" --squash --auto && { armed=1; break; } || sleep 4; done`,
    `          [ -n "$armed" ] || echo "auto-merge enable failed after retries (non-fatal)"`,
    // Bot-opened PRs don't fire pull_request CI (GITHUB_TOKEN anti-recursion); workflow_dispatch is exempt,
    // so dispatch ci.yml on the PR head to post the required `ci` status that gates auto-merge.
    `          head_sha="$(git rev-parse HEAD)"`,
    `          pr_number="$(gh pr view "$branch" --json number --jq .number 2>/dev/null || echo "")"`,
    `          gh workflow run ci.yml --ref "$branch" -f sha="$head_sha" -f pr="$pr_number" || echo "ci dispatch failed (non-fatal)"`,
    // Trigger review DETERMINISTICALLY — the same anti-recursion that blocks pull_request CI blocks the
    // reviewer's auto-trigger on a bot PR, so the proposer requests its independent review here (wiring, not
    // a judgment), exactly as it dispatches ci. The reviewer (agent.review) then judges + posts agent-review.
    // No model/PM step in the routing path. (The merge boundary holds: the proposer can dispatch but not bless.)
    ...(agent.review
      ? [`          gh workflow run ${agent.review}.yml -f issue_number="$pr_number" || echo "review dispatch failed (non-fatal)"`]
      : []),
  ];
  return [
    `name: ${name}`,
    ...onLines(agent),
    `permissions: {}`,
    ...launchConcurrencyLines(name, agent),
    `env:`,
    `  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`,
    `jobs:`,
    `  control:`,
    `    if: ${controlIf(name)}`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { contents: read, issues: write, actions: write }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      CONTROL_WORKFLOW: ${name}.yml`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - run: node .github/agent-control.mjs`,
    `  setup:`,
    `    if: ${agentRunIf(name)}`,
    `    runs-on: ubuntu-latest`,
    `    permissions: { contents: read, issues: read, pull-requests: read, id-token: write }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: \${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'volter-agent-model-proxy' }}`,
    ...triggerParamsEnv(agent),
    `    steps:`,
    ...HARDEN_RUNNER,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile`,
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
    ...HARDEN_RUNNER,
    `      - uses: actions/checkout@v4`,
    `      - uses: oven-sh/setup-bun@v2`,
    `      - run: bun install --frozen-lockfile`,
    `      - name: install Claude Code CLI`,
    `        run: npm install -g "@anthropic-ai/claude-code@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && claude --version`,
    ...buildIssue,
    `      - name: Exchange OIDC for the bounded token`,
    `        run: bun scripts/model-proxy-exchange.ts --run-id "${RID}" --audience "$MODEL_PROXY_OIDC_AUDIENCE"`,
    ...(reconciles
      ? [
          `      - name: Reconcile (deterministic — close issues whose PR merged)`,
          `        env:`,
          `          GH_TOKEN: \${{ github.token }}`,
          `        run: bun scripts/reconcile-merged-issues.ts || true`,
          // Re-arm native auto-merge on any agent PR missing it. The proposer arms it once at create time, but
          // that call can fail transiently and nothing else re-arms (no agent holds contents:write; the PM may
          // not merge) — so without this backstop a green PR can sit unmerged forever. Mechanical wiring, not
          // judgment: it cannot bypass review (branch protection still requires ci + agent-review server-side).
          `      - name: Re-arm auto-merge (deterministic — recover green PRs the proposer failed to arm)`,
          `        env:`,
          `          GH_TOKEN: \${{ github.token }}`,
          `        run: bun scripts/rearm-auto-merge.ts || true`,
        ]
      : []),
    ...(reconcilesRoadmap
      ? [
          `      - name: Reconcile roadmap (deterministic — create tracking issues for planned/active items)`,
          `        env:`,
          `          GH_TOKEN: \${{ github.token }}`,
          `        run: bun scripts/reconcile-roadmap-issues.ts || true`,
        ]
      : []),
    `      - name: Run agent (Claude Code + skill)`,
    `        env:`,
    `          OSS_AGENT_TASK_DIR: .agent-run`,
    `          OSS_AGENT_ISSUE_PATH: .agent-run/issue.json`,
    `        run: |`,
    `          bun scripts/claude-agent-run.ts --skill ${skillPath}; rc=$?; bun scripts/agent-visual-verify.ts || true; echo "::group::agent transcript (${RID})"; cat .agent-run/artifacts/transcript.md 2>/dev/null || true; echo "::endgroup::"; exit $rc`,
    ...(proposes ? effect : []),
    // Persist the call result as a durable per-run artifact: claude-agent-run writes .agent-run/artifacts/
    // transcript.md (the model's final message + stderr, secret-redacted) plus pr.md and the subject it
    // acted on — all in gitignored scratch that dies with the runner. Upload it (if: always(), so failed
    // runs are captured too) so every agent call's result is recoverable from the run, not lost.
    `      - name: Save the agent run result (durable transcript artifact)`,
    `        if: always()`,
    `        uses: actions/upload-artifact@v4`,
    `        with:`,
    `          name: agent-run-${name}`,
    `          path: .agent-run/`,
    `          retention-days: 30`,
    `          if-no-files-found: ignore`,
    `      - run: bun scripts/model-proxy-revoke.ts --run-id "${RID}" || true`,
    `        if: always()`,
    ``,
  ].join('\n');
}

// Is this actor a person? A kind:human actor is DECLARED (visible in the manifest), not realized as a
// github job: the durable "await a person" block is the existing work-store mechanism (the human-required
// label + the merge boundary), and HOW a person is notified/assigned/escalated is a design choice the search
// varies via config — not a template frozen in the compiler. So github generates no workflow for a human.
function isHuman(agent: IRAgent): boolean {
  return agent.kind === 'human';
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
    generated[`.github/workflows/${name}.yml`] = wrapperYml(name, agent); // every agent is a skill
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
  // npm UNCONDITIONALLY strips files literally named `.gitignore` from a published package (even under a
  // `files` whitelist), so a profile can't ship its `.gitignore` resource under that name — it stores the
  // content as `gitignore` (no dot) and we emit it to `.gitignore` in the installation. (Standard template
  // workaround; cf. create-react-app/Next.) Every other dotfile packs fine, so this maps only `.gitignore`.
  for (const r of ir.resources) copies.push({ from: r === '.gitignore' ? 'gitignore' : r, to: r });
  return withGeneratedManifest({ generated, copies });
}
