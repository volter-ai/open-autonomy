// Emit autonomy.ir.v1 → an open-autonomy manifest + the github installation. The IR is the standard;
// this is github's (partial) implementation. One unit: an agent — a prose skill realized as a bounded model
// job. Most effects are direct. A proposer's merge reviewer is the security-boundary exception: it emits a
// bound result and a separate base-branch job publishes the status atomically. See docs/SPEC.md#the-ir.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import {
  REVIEW_RESULT_SCHEMA_ID,
  cronOf,
  emitAutonomy,
  enforcementReport,
  resolveResultSchema,
  withGeneratedManifest,
} from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';

// Lazy sibling-data reads (OA-01): these used to be module-scope `readFileSync`s, which meant merely
// IMPORTING this module (e.g. to reach GithubRunner, or from `lint`/`conformance`, which legitimately
// import both substrates) touched disk and could throw before any code path that actually needed the
// data ran. A missing sibling file (a packaging bug — see docs/adoption-fixes/OA-01) used to take down
// EVERY verb that merely imported '@open-autonomy/substrate-github', including a plain `local` compile.
// Now the read only happens the first time the emit site that needs it actually runs, and a miss throws
// an actionable error instead of a raw ENOENT deep in bundled code.
function readSiblingOrThrow<T>(read: () => T, literal: string): T {
  try {
    return read();
  } catch (e) {
    throw new Error(
      `open-autonomy: packaging bug — sibling data file '${literal}' is missing next to the substrate-github ` +
        `module (expected beside ${import.meta.url}). This file should ship with the package; reinstall ` +
        `open-autonomy, or file an issue: https://github.com/volter-ai/open-autonomy/issues. ` +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

// The operator control plane (the github surface of the Runner contract). Single source of truth is
// a sibling file we emit verbatim into the compiled repo as .github/agent-control.mjs.
let _agentControl: string | undefined;
function agentControlSrc(): string {
  return (_agentControl ??= readSiblingOrThrow(
    () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'control-backend.mjs'), 'utf8'),
    'control-backend.mjs',
  ));
}

// The github substrate's runtime backend — the scripts every github installation runs. Domain-free,
// injected (vendored under ./runtime, mirrored to scripts/); a profile never carries it.
let _runtime: Record<string, string> | undefined;
function runtimeSrcs(): Record<string, string> {
  return (_runtime ??= readSiblingOrThrow(() => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
    const out: Record<string, string> = {};
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.ts')) out[`scripts/${f}`] = readFileSync(join(dir, f), 'utf8');
    }
    return out;
  }, 'runtime/'));
}

// The self-managed egress allowlist the credentialed jobs run when a profile sets
// policy.box.gh-actions.private_egress_guard. Egress lockdown of the credentialed box is RUNNER security
// ("which box, how it's wrapped") — substrate machinery, so the substrate owns the implementation
// (sibling source, like control-backend.mjs) and emits it TOGETHER with the job step that invokes it
// (egressGuard()). Flag set ⇒ step + scripts/egress-guard.sh, both; unset ⇒ neither. It was previously one
// profile's resource, so any OTHER flag-setting profile compiled to agent jobs that died on a missing file.
let _egressGuard: string | undefined;
function egressGuardSrc(): string {
  return (_egressGuard ??= readSiblingOrThrow(
    () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'egress-guard.sh'), 'utf8'),
    'egress-guard.sh',
  ));
}

const CONTROL_VERBS = ['cancel', 'pause', 'resume', 'status', 'retry'];

// The security baseline (security.yml + dependabot.yml) is a CODE-HOST RESOURCE, not engine output — a
// github-CI workflow carried as a profile resource, like the standards docs (docs/CODE_HOST_RESOURCES.md).
// The engine emits only what it DERIVES from the IR: the agent workflows, and the two security DATA
// materializations below — zizmor.yml (the guarded agent-workflow names) and human-required-paths.json
// (policy). Those aren't authored logic; they're the IR projected into a runtime-readable form.

// Generated per install: baseline the guarded patterns in the engine's OWN emitted agent workflows
// (pull_request_target gated by author_association; github.run_id/token expansions). A NEW high finding of
// any other class still fails. Profile-owned workflows carry inline \`# zizmor: ignore\` where they need it.
function zizmorConfig(agentWorkflows: string[]): string {
  const ignores = agentWorkflows.map((w) => `      - ${w}`).join('\n');
  return `# Emitted by substrate-github. Baselines the guarded patterns in the agent workflows the engine
# emits (pull_request_target gated by an author_association allowlist; github.run_id/token expansions —
# all GitHub-controlled, not attacker input). A NEW high finding of any other class still fails the gate.
rules:
  dangerous-triggers:
    ignore:
${ignores}
  template-injection:
    ignore:
${ignores}
`;
}

// Authorization for the comment surface. issue_comment / pull_request_target fire for ANY user (incl.
// drive-by commenters and fork PRs), so the control plane and any comment-launch MUST be gated on a
// maintainer (author_association), and a pull_request_target agent run MUST be gated on a same-repo PR
// or a maintainer author — otherwise a plain comment launches the credentialed agent and a fork PR
// reaches the bless/mint job. (docs/SPEC.md#capabilities — the merge boundary; the operator control plane.)
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
// Per-install github config the PROFILE declares in policy.box.github (the substrate reads policy; the core
// carries it verbatim). The engine bakes in NO org identity — a profile supplies its proxy host, OIDC
// audience, model, and bot git identity, which the emitted workflow uses as the `vars.*` fallback. A profile
// that declares none emits a bare `vars.*` (the install must set the variable); bot identity falls back to a
// generic open-autonomy default (a substrate default, not org identity).
interface GithubBox {
  proxy_host?: string;
  oidc_audience?: string;
  model?: string;
  bot_name?: string;
  bot_email?: string;
  // EXTRA required-check workflows the propose effect must dispatch on a bot PR so their required status posts
  // on the head SHA (a bot PR fires no pull_request, so an undispatched required check would wedge the PR).
  // Each names a dispatchable gate workflow that posts a commit status; the check CONTEXT is the gate's own
  // name. Used by soc2-baseline to make `supply-chain` + `codeql` blocking on bot PRs. Empty elsewhere.
  propose_dispatch_checks?: string[];
  // EXTRA agent-reviewer workflows the propose effect must dispatch on a bot PR (like the main `review:` edge):
  // a bot-opened PR fires no pull_request_target, so a second reviewer (e.g. soc2-baseline's advisory
  // `compliance-verifier`) only runs if the proposer KICKS it with `issue_number=<pr>` — the agent-reviewer
  // dispatch shape (NOT the gate `sha=/pr=` shape). Empty everywhere except where declared.
  propose_dispatch_reviews?: string[];
  // Opt-in commit-signing mode for the propose effect. `verified-api` re-creates the agent commit through
  // GitHub's git/commits API so the job's GITHUB_TOKEN (github-actions[bot]) signs it "Verified" — keyless,
  // lets branch protection require signed commits (C6). Unset ⇒ plain git commit (current behavior). Other
  // profiles don't set it, so this is a no-op everywhere except where declared.
  commit_signing?: string;
  // Opt-in self-managed egress allowlist (scripts/egress-guard.sh) injected into the agent job. The
  // no-account fallback for PRIVATE repos, where the free harden-runner block (Community = public only) can't
  // enforce: it allowlists GitHub /meta ranges (keeps the runner alive) + the agent's hosts (model proxy via
  // MODEL_PROXY_URL, npm, github CDNs) and default-DENYs the rest. Unset ⇒ not injected (no-op elsewhere).
  private_egress_guard?: boolean;
}
// The box ALWAYS has a model endpoint (docs/SPEC.md#the-box), so the substrate supplies a DEFAULT model when
// the profile names none — a profile that omits it (e.g. a generic SDLC preset) still runs instead of dying
// at mint with `--models ""`. This is a capability default, NOT org identity: it's overridable by the profile
// (policy.box.github.model) and, at runtime, by `vars.PUBLIC_AGENT_MODEL`. proxy_host/oidc_audience are NOT
// defaulted here — those are real infra identity (a specific proxy URL/audience) and stay profile/install config.
const DEFAULT_GITHUB_MODEL = 'deepseek/deepseek-v4-flash';
const githubBox = (ir: AutonomyIR): GithubBox => {
  // The runner's box config is keyed by the runner name `gh-actions` (parseIr normalizes the old `github`
  // alias to it; the `?? .github` fallback covers IRs constructed without going through parseIr).
  const box = (ir.policy.box['gh-actions'] ?? ir.policy.box.github ?? {}) as GithubBox;
  return { ...box, model: box.model ?? DEFAULT_GITHUB_MODEL };
};
// `${{ vars.NAME || 'fallback' }}` when the profile declares a fallback, else a bare `${{ vars.NAME }}`.
const varOr = (name: string, fallback?: string): string =>
  fallback ? `\${{ vars.${name} || '${fallback}' }}` : `\${{ vars.${name} }}`;

function hardenRunner(gh: GithubBox): string[] {
  return [
    '      - name: Lock down egress (block token exfiltration from untrusted-derived work)',
    '        uses: step-security/harden-runner@9af89fc71515a100421586dfdb3dc9c984fbf411 # v2.19.4',
    '        with:',
    '          egress-policy: block',
    '          allowed-endpoints: >',
    '            api.github.com:443',
    '            github.com:443',
    '            codeload.github.com:443',
    '            objects.githubusercontent.com:443',
    '            release-assets.githubusercontent.com:443',
    '            registry.npmjs.org:443',
    // harden-runner's OWN agent/telemetry endpoints — REQUIRED for egress-policy:block to ENFORCE. Without
    // them the block agent can't initialize and harden-runner FAILS OPEN (verified live: non-allowlisted
    // egress was ALLOWED). With them, the free Action blocks on hosted runners — no StepSecurity account/App.
    '            agent.api.stepsecurity.io:443',
    '            prod.app-api.stepsecurity.io:443',
    `            ${varOr('PUBLIC_AGENT_PROXY_HOST', gh.proxy_host)}:443`,
  ];
}

// Opt-in self-managed egress allowlist for the credentialed jobs — the no-account fallback that ENFORCES on
// PRIVATE repos (where harden-runner Community only audits). Runs the shipped scripts/egress-guard.sh, which
// allowlists the GitHub /meta ranges + the agent's hosts (npm, github CDNs, and the proxy from MODEL_PROXY_URL)
// and default-DENYs the rest. Empty unless the profile sets policy.box.gh-actions.private_egress_guard.
function egressGuard(gh: GithubBox): string[] {
  if (!gh.private_egress_guard) return [];
  return [
    '      - name: Self-managed egress allowlist (no-account fallback; ENFORCES on private repos)',
    '        env:',
    `          MODEL_PROXY_URL: ${varOr('MODEL_PROXY_URL', gh.proxy_host ? `https://${gh.proxy_host}` : undefined)}`,
    '        run: bash scripts/egress-guard.sh',
  ];
}

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

// The documented trigger-param SOURCE contract (docs/SPEC.md#trigger-params) → github resolution. The core
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
  // github event (e.g. two `event: issues`) — array keys like `types` are unioned, scalars last-write-wins.
  // Dropping the later trigger's config (the old behavior) silently lost declared event types. A `dispatch`
  // trigger adds nothing here — it is already covered by the always-present workflow_dispatch launch surface.
  const eventConfigs = new Map<string, Record<string, unknown>>();
  for (const t of agent.triggers) {
    if ('cron' in t || 'dispatch' in t) continue;
    const e = { event: t.event, config: t.config };
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

// Realize an agent's capabilities (docs/SPEC.md#capabilities) as a GitHub job `permissions:` block. Pure
// authority → github's permission model; another substrate maps it differently or ignores it.
function capsToPermissions(caps: string[], deferMergeReviewEffects = false): string {
  // The agent job's LEAST-PRIVILEGE token: baseline is checkout (contents:read) + OIDC for the model token
  // (id-token:write); each capability widens it (docs/SPEC.md#capabilities). The merge boundary is the split:
  // code:propose can push/PR/queue-auto-merge/dispatch-CI but never gets statuses:write (can't self-certify
  // a review); a merge reviewer gets neither statuses nor contents write (its trusted effect publishes the
  // bound verdict). Other code:review agents get statuses:write but never contents:write. No agent gets both.
  // Baseline OBSERVATION (docs/SPEC.md#capabilities: reads are ambient, not a granted capability): checkout
  // (contents:read), read the work item whether issue or PR (issues+pull-requests:read), and OIDC for the
  // model token (id-token:write). Capabilities below widen WRITE authority.
  const p: Record<string, string> = { contents: 'read', issues: 'read', 'pull-requests': 'read', 'id-token': 'write' };
  const grant = (k: string, lvl: string) => { if (p[k] !== 'write') p[k] = lvl; };
  for (const rawC of caps) {
    const c = rawC.split('@')[0]; // strip an optional @scope (e.g. code:propose@roadmap)
    if (c === 'code:propose') { p.contents = 'write'; p['pull-requests'] = 'write'; p.actions = 'write'; }
    // A reviewer wired as a proposer's merge reviewer emits a typed judgment; a separate trusted job owns
    // the status/comment effects. Other code:review agents (for example an advisory verifier posting its own
    // non-merge status) retain the direct capability realization.
    else if (c === 'code:review' && !deferMergeReviewEffects) p.statuses = 'write';
    // tasks:author manages the work board — create/edit issues AND close stale/duplicate/zombie PRs (a PR whose
    // issue already closed). pull-requests:write enables close/comment/route but NOT merge (merging writes to the
    // protected branch → needs contents:write, which this never grants) — so the no-self-merge boundary holds.
    else if (c === 'tasks:author') { p.issues = 'write'; p['pull-requests'] = 'write'; }
    else if (c === 'tasks:converse' && !deferMergeReviewEffects) p.issues = 'write'; // comment only
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

// A skill (model) agent reads its subject and runs with capability-scoped authority. Proposers use the
// generic effect below. A merge reviewer is read-only and emits a typed result; review_effect is the narrow
// security-boundary publisher. The merge boundary remains the capability split (docs/SPEC.md#capabilities).
function wrapperYml(
  name: string,
  agent: IRAgent,
  gh: GithubBox,
  isControlPrimary = false,
  finalizesMergeReview = false,
  humanApprovalWorkflow = false,
): string {
  const caps = agent.capabilities ?? [];
  if (finalizesMergeReview && agent.result?.schema !== REVIEW_RESULT_SCHEMA_ID) {
    throw new Error(`merge reviewer '${name}' must declare result.schema: ${REVIEW_RESULT_SCHEMA_ID}`);
  }
  const declaredResultSchema = agent.result ? resolveResultSchema(agent.result.schema) : undefined;
  // Only a code:propose agent gets the effect step (push branch + open auto-merging PR). A non-proposer
  // (reviewer/pm/planner) has contents:read, so a stray tracked-file write would make the effect's
  // `git push` 403 and fail the job after the verdict was posted — tie the step to the capability.
  const proposes = caps.some((c) => typeof c === 'string' && c.split('@')[0] === 'code:propose');
  // Closing merged-issue + re-arming auto-merge are NOT done here: they're integration, not actor output, so
  // they live in the merge.yml code-host resource (its schedule sweeps deterministically, decoupled from any
  // agent run — docs/CODE_HOST_RESOURCES.md). The agent job emits only the actor's own work + its proposal.
  // (No deterministic roadmap reconcile: creating tracking issues from planned roadmap items is the PLANNER's
  // own job, not a script. The model is strong enough to own it — a missed issue self-corrects next run — and
  // scripting an agent's work just because "a model might skip it" is the wrong instinct. See AGENTS.md.)
  const skillPath = `.codex/skills/${agent.behavior}/SKILL.md`;
  const RID = `ir-${name}-\${{ github.run_id }}`;
  // A GitHub rerun keeps github.run_id but increments github.run_attempt. The logical run/branch identity
  // remains stable, while every proxy budget/token lifecycle gets a fresh identity so a rerun cannot
  // collide with the immutable prior proxy ledger entry.
  const PROXY_RID = `${RID}-\${{ github.run_attempt }}`;
  // The work item comes from the trigger's declared `subject.ref` param (resolved into job env). An agent
  // with no subject.ref is autonomous (cron): it gets a minimal synthetic payload. The skill fetches any
  // deeper context itself (it is credentialed — it has gh + read).
  const refParam = subjectRefParam(agent);
  if (finalizesMergeReview && !refParam) {
    throw new Error(`merge reviewer '${name}' must declare a trigger param sourced from subject.ref`);
  }
  const branchExpr = refParam ? `agent/issue-\${${refParam}}` : `agent/${RID}`;
  // TC.3: an agent can now legitimately carry BOTH a subject.ref-bearing dispatch trigger AND a cron
  // trigger (audit: dispatch for an operator-targeted run, cron for a repo-wide drift sweep with no
  // subject at all). `subjectRefParam` is agent-wide (it doesn't know which trigger actually fired this
  // run), so on a REAL `schedule` firing, `$ref` is legitimately empty — that must NOT be treated as the
  // "no subject.ref forwarded" caller error the exit-1 below exists to catch. Scope the schedule carve-out
  // to agents that actually declare a cron (cronOf(agent)) so every other dispatch-only agent's emitted
  // step is BYTE-IDENTICAL to before this change — `github.event_name` can only ever BE `schedule` for an
  // agent whose `on:` block declares a `schedule:` trigger in the first place, so the extra branch is inert
  // (never reachable) on every agent that doesn't.
  const hasCron = !!cronOf(agent);
  // The empty-ref guard line ITSELF must stay byte-identical to before this change for every agent that
  // doesn't declare a cron (the reviewer's own requirement) — only an agent that actually carries a cron
  // trigger gets the extra schedule-aware branch; everyone else keeps the original single-line form.
  const emptyRefGuard = hasCron
    ? [
        `          if [ -z "$ref" ]; then`,
        `            if [ "\${{ github.event_name }}" = "schedule" ]; then`,
        `              printf '{"number":0,"title":${JSON.stringify(name)},"body":""}\\n' > .agent-run/issue.json`,
        `              exit 0`,
        `            fi`,
        `            echo "no subject.ref forwarded by the trigger"; exit 1`,
        `          fi`,
      ]
    : [`          if [ -z "$ref" ]; then echo "no subject.ref forwarded by the trigger"; exit 1; fi`];
  const buildIssue = refParam
    ? [
        `      - name: Provide subject`,
        `        env:`,
        `          GH_TOKEN: \${{ github.token }}`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          ref="\${${refParam}}"`,
        ...emptyRefGuard,
        `          gh api "repos/\${{ github.repository }}/issues/$ref" --jq '{number,title,body,user:{login:.user.login},labels:[.labels[].name]}' > .agent-run/issue.json`,
      ]
    : [
        `      - name: Provide subject (autonomous — no work item)`,
        `        run: |`,
        `          mkdir -p .agent-run`,
        `          printf '{"number":0,"title":${JSON.stringify(name)},"body":""}\\n' > .agent-run/issue.json`,
      ];
  // --max-requests is a runaway-loop guard, NOT the cost bound (--max-usd-cents is). 60 was too low for the
  // orchestrator: the PM reviews the WHOLE board and routinely needs >60 calls. Keep 250 as the secondary
  // guard so the dollar cap remains the primary bound.
  const mintModelToken = (condition?: string): string[] => [
    `      - name: Mint bounded model token`,
    ...(condition ? [`        if: ${condition}`] : []),
    `        run: bun scripts/model-proxy-mint.ts --run-id "${PROXY_RID}" --models "${varOr('PUBLIC_AGENT_MODEL', gh.model)}" --max-usd-cents "\${{ vars.PUBLIC_AGENT_MAX_USD_CENTS || '200' }}" --max-requests "\${{ vars.PUBLIC_AGENT_MAX_REQUESTS || '250' }}" --issue .agent-run/issue.json`,
  ];
  const reviewTarget = finalizesMergeReview && refParam ? [
    `      - name: Bind review target`,
    `        id: review_target`,
    `        env:`,
    `          GH_TOKEN: \${{ github.token }}`,
    `        run: |`,
    `          ref="\${${refParam}}"`,
    `          pr="$(gh pr view "$ref" --json number --jq .number)"`,
    `          sha="$(gh pr view "$ref" --json headRefOid --jq .headRefOid)"`,
    `          test -n "$pr" && test -n "$sha"`,
    `          echo "pr=$pr" >> "$GITHUB_OUTPUT"`,
    `          echo "sha=$sha" >> "$GITHUB_OUTPUT"`,
  ] : [];
  // The EFFECT step: a code:propose agent's propose ACTION — turn the working tree into an auto-merging PR.
  // The logic is the agent-owned, runner-INDEPENDENT scripts/agent-propose.ts (git + gh, identical on any
  // runner); the runner only supplies the credential + env and invokes it. Methodology lives with the agent,
  // not the runner (docs/CODE_HOST_RESOURCES.md). ISSUE_REF/GITHUB_* are ambient in the job env. A non-proposer
  // changes no files, so it never gets this step.
  const effect = [
    `      - name: Effect — propose the change as an auto-merging PR (if the tree changed)`,
    `        env:`,
    `          GH_TOKEN: ${'${{ github.token }}'}`,
    `          AGENT_NAME: ${name}`,
    `          AGENT_BOT_NAME: ${gh.bot_name ?? 'open-autonomy-agent'}`,
    `          AGENT_BOT_EMAIL: ${gh.bot_email ?? 'open-autonomy-agent@users.noreply.github.com'}`,
    ...(agent.review ? [`          REVIEW_WORKFLOW: ${agent.review}.yml`] : []),
    ...(gh.propose_dispatch_checks?.length
      ? [`          EXTRA_CHECK_WORKFLOWS: ${gh.propose_dispatch_checks.join(',')}`]
      : []),
    ...(gh.propose_dispatch_reviews?.length
      ? [`          EXTRA_REVIEW_WORKFLOWS: ${gh.propose_dispatch_reviews.join(',')}`]
      : []),
    ...(gh.commit_signing ? [`          COMMIT_SIGNING: ${gh.commit_signing}`] : []),
    `        run: bun scripts/agent-propose.ts`,
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
    // Issue-level verbs (decide/answer) must act ONCE, but every agent has a control job — mark exactly one as
    // the primary so those verbs run there only (the per-workflow verbs cancel/status/retry still run on all).
    ...(isControlPrimary ? [`      ISSUE_CONTROL_PRIMARY: "1"`] : []),
    `    steps:`,
    `      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1`,
    `      - run: node .github/agent-control.mjs`,
    `  setup:`,
    `    if: ${agentRunIf(name)}`,
    `    runs-on: ubuntu-latest`,
    ...(finalizesMergeReview ? [
      `    outputs:`,
      `      review_pr: \${{ steps.review_target.outputs.pr }}`,
      `      review_sha: \${{ steps.review_target.outputs.sha }}`,
    ] : []),
    `    permissions: { contents: read, issues: read, pull-requests: read${finalizesMergeReview ? '' : ', id-token: write'} }`,
    `    env:`,
    `      GH_TOKEN: \${{ github.token }}`,
    ...(!finalizesMergeReview ? [
      `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
      `      MODEL_PROXY_OIDC_AUDIENCE: ${varOr('MODEL_PROXY_OIDC_AUDIENCE', gh.oidc_audience)}`,
    ] : []),
    ...triggerParamsEnv(agent),
    `    steps:`,
    ...hardenRunner(gh),
    `      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1`,
    ...reviewTarget,
    ...egressGuard(gh),
    `      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`,
    `      - run: bun install --frozen-lockfile`,
    ...buildIssue,
    ...(!finalizesMergeReview ? mintModelToken() : []),
    // The agent job's token is scoped to its capabilities (docs/SPEC.md#capabilities). A merge reviewer is
    // further narrowed to read-only because the trusted effect owns status/comment publication.
    `  ${name}:`,
    `    needs: setup`,
    `    runs-on: ubuntu-latest`,
    ...timeoutLines(agent),
    `    permissions: ${capsToPermissions(caps, finalizesMergeReview)}`,
    `    env:`,
    `      MODEL_PROXY_URL: \${{ vars.MODEL_PROXY_URL }}`,
    `      MODEL_PROXY_OIDC_AUDIENCE: ${varOr('MODEL_PROXY_OIDC_AUDIENCE', gh.oidc_audience)}`,
    `      PUBLIC_AGENT_MODEL: ${varOr('PUBLIC_AGENT_MODEL', gh.model)}`,
    `      PUBLIC_AGENT_CITED_VERSION: \${{ vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION }}`,
    `      GH_TOKEN: \${{ github.token }}`,
    // Who the org engages for the human seam — so a skill (e.g. the PM, Step 2c) can assign/@mention the
    // maintainer without an Actions-variables API read the job token may not have. Empty → fall back to owner.
    `      MAINTAINERS: \${{ vars.PUBLIC_AGENT_MAINTAINERS }}`,
    ...triggerParamsEnv(agent),
    `    steps:`,
    ...hardenRunner(gh),
    `      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1`,
    ...egressGuard(gh),
    `      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`,
    `      - run: bun install --frozen-lockfile`,
    ...(!finalizesMergeReview ? [
      `      - name: install Claude Code CLI`,
      `        run: npm install -g "@anthropic-ai/claude-code@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && claude --version`,
    ] : []),
    ...buildIssue,
    ...(finalizesMergeReview ? [
      `      - name: Wait for required checks before model review`,
      `        id: review_prerequisites`,
      `        env:`,
      `          GH_TOKEN: \${{ github.token }}`,
      `        run: bun scripts/review-prerequisites.ts --pr "\${{ needs.setup.outputs.review_pr }}" --sha "\${{ needs.setup.outputs.review_sha }}" --result .agent-run/artifacts/result.json --github-output "$GITHUB_OUTPUT"${humanApprovalWorkflow ? ' --parallel human-approval' : ''}`,
      ...mintModelToken("steps.review_prerequisites.outputs.run_model == 'true'"),
    ] : []),
    ...(finalizesMergeReview ? [
      `      - name: install Claude Code CLI`,
      `        if: steps.review_prerequisites.outputs.run_model == 'true'`,
      `        run: npm install -g "@anthropic-ai/claude-code@\${PUBLIC_AGENT_CITED_VERSION:-latest}" && claude --version`,
    ] : []),
    `      - name: Exchange OIDC for the bounded token`,
    ...(finalizesMergeReview ? [`        if: steps.review_prerequisites.outputs.run_model == 'true'`] : []),
    `        run: bun scripts/model-proxy-exchange.ts --run-id "${PROXY_RID}" --audience "$MODEL_PROXY_OIDC_AUDIENCE"`,
    `      - name: Run agent (Claude Code + skill)`,
    ...(finalizesMergeReview ? [`        if: steps.review_prerequisites.outputs.run_model == 'true'`] : []),
    `        env:`,
    `          OSS_AGENT_TASK_DIR: .agent-run`,
    `          OSS_AGENT_ISSUE_PATH: .agent-run/issue.json`,
    ...(declaredResultSchema ? [
      `          OSS_AGENT_RESULT_PATH: .agent-run/artifacts/result.json`,
      `          OSS_AGENT_RESULT_SCHEMA_PATH: .agent-run/result-schema.json`,
    ] : []),
    `        run: |`,
    ...(declaredResultSchema ? [
      `          cat > .agent-run/result-schema.json <<'OPEN_AUTONOMY_RESULT_SCHEMA'`,
      `          ${JSON.stringify(declaredResultSchema)}`,
      `          OPEN_AUTONOMY_RESULT_SCHEMA`,
    ] : []),
    `          bun scripts/claude-agent-run.ts --skill ${skillPath} --run-id "${PROXY_RID}"; rc=$?; bun scripts/agent-visual-verify.ts || true; echo "::group::agent transcript (${PROXY_RID})"; cat .agent-run/artifacts/transcript.md 2>/dev/null || true; echo "::endgroup::"; exit $rc`,
    ...(proposes ? effect : []),
    // Persist the call result as a durable per-run artifact: claude-agent-run writes .agent-run/artifacts/
    // transcript.md (the model's final message + stderr, secret-redacted) plus pr.md and the subject it
    // acted on — all in gitignored scratch that dies with the runner. Upload it (if: always(), so failed
    // runs are captured too) so every agent call's result is recoverable from the run, not lost.
    `      - name: Save the agent run result (durable transcript artifact)`,
    `        if: always()`,
    `        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2`,
    `        with:`,
    `          name: agent-run-${name}`,
    `          path: .agent-run/`,
    // .agent-run/ is a DOT-dir, and upload-artifact@v4 excludes hidden files by default — without this the
    // upload silently finds "no files" and every run (esp. PM/reviewer, which have no other persistence, and
    // ANY failed run) loses its transcript, making agent failures undiagnosable. Include hidden files.
    `          include-hidden-files: true`,
    `          retention-days: 30`,
    `          if-no-files-found: ignore`,
    // Release the run slot — RETRY, don't silently swallow. revoke is if:always() in the SAME job as mint, so a
    // post-mint step failure still reaches it; but a single `|| true` let a transient revoke failure leak the
    // slot silently (it only self-heals at token TTL ~2h, and slots are a scarce shared cap). Retry, and if it
    // still fails, surface it loudly — but stay non-fatal (the run's real work succeeded; TTL is the backstop).
    `      - name: Release the run slot (revoke minted token)`,
    `        if: ${finalizesMergeReview ? "always() && steps.review_prerequisites.outputs.run_model == 'true'" : 'always()'}`,
    `        run: |`,
    `          for i in 1 2 3 4 5; do bun scripts/model-proxy-revoke.ts --run-id "${PROXY_RID}" && exit 0 || sleep 3; done`,
    `          echo "::warning::run-slot revoke failed after retries for ${PROXY_RID}; slot will auto-reap at token TTL"`,
    ...(finalizesMergeReview ? [
      `  review_effect:`,
      `    needs: [setup, ${name}]`,
      `    if: always() && needs.setup.result == 'success'`,
      `    runs-on: ubuntu-latest`,
      `    permissions: { contents: read, issues: write, pull-requests: write, statuses: write, actions: write }`,
      `    steps:`,
      `      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1`,
      `        with:`,
      `          ref: \${{ github.event.repository.default_branch }}`,
      `      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0`,
      `        continue-on-error: true`,
      `        with:`,
      `          name: agent-run-${name}`,
      `          path: .agent-finalize`,
      `      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`,
      `        with:`,
      `          bun-version: 1.3.10`,
      `      - name: Finalize the bound review result (fail closed)`,
      `        env:`,
      `          GH_TOKEN: \${{ github.token }}`,
      `          GITHUB_REPOSITORY: \${{ github.repository }}`,
      `          EXPECTED_PR: \${{ needs.setup.outputs.review_pr }}`,
      `          EXPECTED_SHA: \${{ needs.setup.outputs.review_sha }}`,
      `          REVIEWER_JOB_RESULT: \${{ needs['${name}'].result }}`,
      `          REVIEW_RESULT_PATH: .agent-finalize/artifacts/result.json`,
      ...(humanApprovalWorkflow ? [`          HUMAN_APPROVAL_WORKFLOW: human-approval.yml`] : []),
      `        run: bun scripts/finalize-agent-review.ts`,
    ] : []),
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
  return { ...runtimeSrcs() };
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
  // The issue-level control primary: the first non-human agent. Its control job (and only its) handles the
  // once-per-issue verbs (decide/answer), so they don't fire N times across every agent's control job.
  const controlPrimary = Object.entries(ir.agents).find(([, a]) => !isHuman(a))?.[0];
  const mergeReviewers = new Set(Object.values(ir.agents).map((a) => a.review).filter((v): v is string => !!v));
  const hasHumanApprovalWorkflow = ir.resources.includes('.github/workflows/human-approval.yml');
  for (const [name, agent] of Object.entries(ir.agents)) {
    if (isHuman(agent)) continue; // a human actor is declared in the manifest, not realized as a github job
    generated[`.github/workflows/${name}.yml`] = wrapperYml(
      name,
      agent,
      githubBox(ir),
      name === controlPrimary,
      mergeReviewers.has(name),
      hasHumanApprovalWorkflow,
    ); // every agent is a skill
  }
  // Agents carry the operator control plane, so emit its handler.
  if (Object.values(ir.agents).some((a) => !isHuman(a))) {
    generated['.github/agent-control.mjs'] = agentControlSrc();
  }
  // The substrate injects its runtime backend.
  Object.assign(generated, runtimeSrcs());
  // The egress-guard step and its script ship together (see egressGuardSrc): a flag-setting profile must
  // never get a job step referencing a file only some other profile carries.
  if (githubBox(ir).private_egress_guard) generated['scripts/egress-guard.sh'] = egressGuardSrc();

  // Derived security DATA: the zizmor baseline scoped to the agent workflows THIS compile emitted (their
  // guarded patterns are the engine's, not the app's). The security.yml workflow + dependabot config that
  // consume it are code-host RESOURCES carried by the profile, not engine output (docs/CODE_HOST_RESOURCES.md).
  const agentWorkflows = Object.entries(ir.agents)
    .filter(([, a]) => !isHuman(a))
    .map(([name]) => `${name}.yml`);
  generated['.github/zizmor.yml'] = zizmorConfig(agentWorkflows);

  // Materialize the profile's human-required scope verbatim for the gate to read. The substrate CARRIES
  // policy, it does not author or augment it (the IR contract: policy.box is carried verbatim, never
  // interpreted). No paths baked into the engine — a profile declares what merging must gate (its
  // workflows, manifest, skills, lockfile, …) in policy.box.risk.human_required_paths.
  const risk = (ir.policy.box.risk ?? {}) as { human_required_paths?: string[] };
  generated['.open-autonomy/human-required-paths.json'] = JSON.stringify(risk.human_required_paths ?? [], null, 2) + '\n';

  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    // Install the skill where each harness discovers it: codex from `.codex/skills/`, Claude Code from
    // `.claude/skills/`. The behavior slot is UNIVERSAL — every actor has one, whatever its kind. An
    // agent's credentialed job runs Claude Code against the skill; a human actor gets no job, but their
    // skill ships too: it is the person's doctrine (what an engage points them at), and the manifest's
    // `skill:` key must resolve to a real file, not dangle.
    copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.codex/skills/${agent.behavior}/SKILL.md` });
    copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.claude/skills/${agent.behavior}/SKILL.md` });
  }
  // npm UNCONDITIONALLY strips files literally named `.gitignore` from a published package (even under a
  // `files` whitelist), so a profile can't ship its `.gitignore` resource under that name — it stores the
  // content as `gitignore` (no dot) and we emit it to `.gitignore` in the installation. (Standard template
  // workaround; cf. create-react-app/Next.) Every other dotfile packs fine, so this maps only `.gitignore`.
  for (const r of ir.resources) copies.push({ from: r === '.gitignore' ? 'gitignore' : r, to: r });
  generated['.open-autonomy/enforcement.json'] = `${JSON.stringify(enforcementReport(ir, 'gh-actions'), null, 2)}\n`;
  return withGeneratedManifest({ generated, copies });
}
