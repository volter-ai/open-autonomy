import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

// Production wiring after the agent-model migration: a model-interpreted agent (develop) compiles to
// the privilege-separated wrapper; a deterministic agent compiles to a one-step job that runs a
// self-contained scripts/agent-<role>.ts orchestrator. So the wiring these tests guard now lives in the
// entry scripts (and the wrapper), not in hand-written workflow shell — assert it at its new home, plus
// that each workflow actually invokes its orchestrator.
const workflow = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
const script = (name: string) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
const control = () => readFileSync(new URL('../.github/agent-control.mjs', import.meta.url), 'utf8');

describe('public agent production readiness', () => {
  test('workflows opt into Node 24 JavaScript actions', () => {
    for (const name of [
      'ci.yml',
      'draft.yml',
      'develop.yml',
      'pm.yml',
      'reviewer.yml',
      'planner.yml',
      'open-autonomy-preflight.yml',
    ]) {
      expect(workflow(name)).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    }
  });

  test('operator controls run as a separate job, before any model work', () => {
    const text = workflow('develop.yml');
    // A `/agent ` comment routes to the control job (the vendored control plane), not the model path.
    expect(text).toContain('node .github/agent-control.mjs');
    expect(text).toContain("startsWith(github.event.comment.body, '/agent ')");
    // The model token is minted only in setup, which is gated OFF for a control comment.
    expect(text).toContain('model-proxy-mint.ts');
    expect(text.indexOf('agent-control.mjs')).toBeLessThan(text.indexOf('model-proxy-mint.ts'));
    for (const verb of ['cancel', 'pause', 'resume', 'status', 'retry']) expect(control()).toContain(verb);
  });

  test('repo-wide pause is variable-only: /agent pause repo points at the kill-switch, never labels', () => {
    // BL-20 decision: the fleet-wide kill-switch is the PUBLIC_AGENT_REPO_PAUSED repository variable
    // (works even when the control plane is down), NOT a control verb. `/agent pause repo` used to fall
    // through to the per-issue path and silently pause ONE issue while the operator believed the fleet
    // was stopped — it must answer with the real command instead.
    const text = control();
    expect(text).toMatch(/pause\|resume\)\\s\+repo/); // the repo-scope intercept exists
    expect(text).toContain('gh variable set PUBLIC_AGENT_REPO_PAUSED');
    expect(text).toContain('Nothing was ${verb}d');
  });

  test('the comment surface is maintainer-gated and fork-gated (no drive-by launch, no fork escalation)', () => {
    // Every agent that fires on issue_comment / pull_request_target must gate those untrusted-actor
    // surfaces. The control plane and the comment-launch require a maintainer (author_association); a
    // pull_request_target agent run requires a same-repo PR or a maintainer author. A plain comment
    // launches nothing. These are the merge-boundary / control-plane guards — encoded as a check so they
    // can never silently regress (the deep-review found both missing).
    for (const wf of ['draft.yml', 'develop.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      // control job: maintainer-gated
      expect(text).toContain('contains(fromJSON(\'["OWNER","MEMBER","COLLABORATOR"]\'), github.event.comment.author_association)');
      // a plain (non-/agent) comment must NOT reach the setup/agent job: the only issue_comment path into
      // the agent job is an explicit `/agent <name>` launch, also maintainer-gated.
      expect(text).toContain("startsWith(github.event.comment.body, '/agent ");
    }
    // pull_request_target reviewers must carry the fork gate (same-repo PR or maintainer author).
    for (const wf of ['reviewer.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      expect(text).toContain('github.event.pull_request.head.repo.full_name == github.repository');
      expect(text).toContain('github.event.pull_request.author_association');
    }
  });

  test('PR review is triggered DETERMINISTICALLY by the proposer effect, not the PM model', () => {
    // The stall the bench found: PR-routing was a step in the PM's model skill, which a cheap model skips.
    // Routing is mechanical wiring — the proposer's effect (the agent-owned scripts/agent-propose.ts)
    // dispatches its independent reviewer when the PR opens. The workflow passes the reviewer to the effect via
    // REVIEW_WORKFLOW; the script does the deterministic dispatch. Encoded so routing never depends on a model.
    expect(workflow('develop.yml')).toContain('REVIEW_WORKFLOW: reviewer.yml');
    expect(workflow('develop.yml')).toContain('bun scripts/agent-propose.ts');
    expect(workflow('strategist.yml')).toContain('REVIEW_WORKFLOW: strategy_reviewer.yml');
    expect(script('agent-propose.ts')).toContain('REVIEW_WORKFLOW'); // the effect dispatches the review
    // The PM no longer carries a PR-routing step (it owns triage + capacity + close, all judgments/sweeps).
    const pm = readFileSync(new URL('../.codex/skills/pm/SKILL.md', import.meta.url), 'utf8');
    expect(pm).not.toContain('Route open agent PRs to review');
  });

  test('mechanical sweep ops are deterministic (merge.yml resource), not PM-model steps; repo-pause gate', () => {
    // Closing a merged-PR issue + re-arming auto-merge are mechanical wiring — they must not depend on the
    // model. They are NOT inside any agent run: they live in the merge.yml code-host RESOURCE (its schedule
    // sweeps deterministically — docs/CODE_HOST_RESOURCES.md), so no agent workflow carries reconcile/re-arm.
    // Repo-pause is the per-agent kill-switch. Encoded as a check (the bench found these stalling as model steps).
    expect(workflow('merge.yml')).toContain('reconcile-merged-issues.ts');
    expect(workflow('merge.yml')).toContain('rearm-auto-merge.ts');
    expect(workflow('pm.yml')).not.toContain('reconcile-merged-issues.ts'); // moved out of the agent run
    expect(workflow('pm.yml')).toContain("vars.PUBLIC_AGENT_REPO_PAUSED != 'true'");
    expect(workflow('develop.yml')).toContain("vars.PUBLIC_AGENT_REPO_PAUSED != 'true'");
    expect(workflow('reviewer.yml')).not.toContain('reconcile-merged-issues.ts');
  });

  test('every agent run persists its call result (durable transcript artifact + live-log echo)', () => {
    // The model output is otherwise written to gitignored scratch that dies with the runner. Each agent
    // run must upload .agent-run/ (transcript + pr.md + subject) as an artifact (if: always, so failures are
    // captured) AND echo the transcript into the run log — so no agent call's result is ever lost.
    for (const wf of ['draft.yml', 'develop.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      expect(text).toContain('actions/upload-artifact@'); // SHA-pinned; assert the action, not the ref
      expect(text).toContain('path: .agent-run/');
      expect(text).toContain('agent transcript');
    }
  });

  test('credentialed jobs lock down egress (no token exfiltration from untrusted-derived work)', () => {
    // The agent runs untrusted-derived work with a scoped GH_TOKEN + bounded model token in env. Every
    // agent workflow must block egress (harden-runner) so a prompt-injected agent can't ship a token to an
    // attacker host. Encoded as a check so the lockdown can't silently regress.
    for (const wf of ['draft.yml', 'develop.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      expect(text).toContain('step-security/harden-runner');
      expect(text).toContain('egress-policy: block');
    }
  });

  test('the agent job is credentialed (scoped to its capabilities); it proposes its own auto-merging PR', () => {
    const text = workflow('develop.yml');
    // developer = code:propose + tasks:converse → contents/pull-requests/actions/issues:write + id-token.
    expect(text).toContain('pull-requests: write');
    expect(text).toContain('contents: write');
    // It acts directly via its agent-owned, runner-independent effect script (push + open PR + arm via the
    // merge.yml resource). The runner only invokes the script; the propose logic isn't inline methodology.
    expect(text).toContain('bun scripts/agent-propose.ts');
    expect(text).not.toContain('gh pr merge'); // no inline arm in the agent job
    expect(script('agent-propose.ts')).toContain('merge.yml'); // the effect arms auto-merge via the resource
    // The credential-less + bundle + publisher model is gone.
    expect(text).not.toContain('persist-credentials: false');
    expect(text).not.toContain('github-agent-publish.ts');
    expect(text).not.toContain('agent-bundle');
  });

  test('pm is a skill agent that can launch (agent:launch → actions:write) but not change code', () => {
    const text = workflow('pm.yml');
    expect(text).toContain('bun scripts/claude-agent-run.ts --skill .codex/skills/pm/SKILL.md');
    const pmJob = text.slice(text.indexOf('  pm:'));
    expect(pmJob).toContain('actions: write'); // agent:launch — dispatch the developer
    expect(pmJob).toContain('issues: write'); // tasks:author/converse
    expect(pmJob).toContain('pull-requests: write'); // tasks:author — close stale/duplicate/zombie PRs (NOT merge)
    expect(pmJob).not.toContain('contents: write'); // pm changes no code → cannot merge (the boundary holds)
    // The pm skill is the orchestrator: full situational awareness (every issue + the runner) + capacity +
    // escalation doctrine. (Repo-pause is now a deterministic substrate kill-switch, not a PM-model check.)
    const skill = readFileSync(new URL('../.codex/skills/pm/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('max_open_agent_prs'); // capacity judgment
    expect(skill).toContain('gh run list'); // inspects running agents/sessions via the runner
    expect(skill).toContain('human-required'); // escalates rather than looping
  });

  test('human-approval is an additional, deterministic gate (current-head maintainer authorization)', () => {
    const wf = workflow('human-approval.yml');
    // Deterministic gate, not an agent: posts the human-approval status via the gate script.
    expect(wf).toContain('bun scripts/human-approval-gate.ts');
    // Re-evaluated on PR changes, native reviews, and durable exact-SHA approval comments.
    expect(wf).toContain('pull_request_review');
    expect(wf).toContain('issue_comment');
    expect(wf).toContain('types: [created, edited, deleted]');
    expect(wf).toContain('github.event.issue.pull_request');
    expect(wf).toContain('github.event.issue.number');
    expect(wf).toContain('group: human-approval-${{ github.event.pull_request.number || github.event.issue.number || github.event.inputs.pr }}');
    expect(wf).toContain('synchronize');
    // Least privilege: can post the status + comment, but CANNOT merge (no contents:write).
    expect(wf).toContain('statuses: write');
    expect(wf).not.toContain('contents: write');
    // It checks out the BASE (default branch), never the PR head — no untrusted code execution.
    expect(wf).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(wf).toContain('persist-credentials: false');
    // The gate script exists and scopes by sensitive paths + the human-required label.
    const gate = readFileSync(new URL('../scripts/human-approval-gate.ts', import.meta.url), 'utf8');
    expect(gate).toContain("context=human-approval");
    expect(gate).toContain("'human-required'");
    expect(gate).toContain("'human-approval-required'"); // approval routing is distinct from a re-arm hold
    expect(gate).toContain('headSha'); // per-SHA: an Approve counts only on the current head
    expect(gate).toContain('approvalCommandSha');
    expect(gate).toContain('/agent approve');
    expect(gate).toContain('collaborators/${login}/permission');
    expect(gate).toContain('MAINTAINER'); // only OWNER/MEMBER/COLLABORATOR approvals count
    // The approving review is read from the EVENT PAYLOAD (pull_request_review), not only the reviews API —
    // GITHUB_TOKEN can return an empty reviews list, which would wedge every human-required PR. The payload
    // is authoritative + race-free; the API scan is only a backstop.
    expect(gate).toContain('GITHUB_EVENT_PATH');
    expect(gate).toContain('eventReview');
    // github-native ENGAGE: a parked scoped PR is routed to the maintainer(s) out-of-band (assign +
    // request-review → GitHub notifies them), not left silent. The workflow supplies who via $MAINTAINERS.
    expect(gate).toContain('--add-assignee');
    expect(gate).toContain('--add-reviewer');
    expect(gate).toContain('MAINTAINERS'); // the engage targets come from the repo's maintainers variable
    expect(wf).toContain('MAINTAINERS: ${{ vars.PUBLIC_AGENT_MAINTAINERS }}');
    expect(wf).toContain('pull-requests: write'); // needed to assign + request review
    // Reconciliation: the reviewer no longer dead-ends sensitive PRs — it reviews on merits and lets the
    // human-approval gate supply the human sign-off.
    const reviewer = readFileSync(new URL('../.codex/skills/reviewer/SKILL.md', import.meta.url), 'utf8');
    expect(reviewer).toContain('human-approval');
    expect(reviewer).toContain('Review it on the merits');
    expect(reviewer).toContain('`human-required` is a real parked/hold state');
    expect(reviewer).not.toContain('except `human-required`');
    expect(reviewer).toContain('human-approval-required');
  });

  test('native approval is an optional default-branch adapter, not another agent or status publisher', () => {
    const wf = workflow('native-approval.yml');
    expect(wf).toContain('workflow_run:');
    expect(wf).toContain('workflows: [reviewer]');
    expect(wf).not.toContain('pull_request:');
    expect(wf).not.toContain('pull_request_target:');
    expect(wf).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(wf).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(wf).toContain('name: agent-run-reviewer');
    expect(wf).toContain('bun scripts/native-approval-adapter.ts');
    expect(wf).toContain('OPEN_AUTONOMY_NATIVE_APPROVAL_TOKEN');
    expect(wf).toContain('Native approval not configured');
    expect(wf).toContain('EXPECTED_PR: ${{ github.event.inputs.pr }}');
    expect(wf).toContain('EXPECTED_SHA: ${{ github.event.inputs.sha }}');
    expect(wf).toContain('statuses: read');
    expect(wf).not.toContain('statuses: write');
    expect(wf).not.toContain('contents: write');
    const adapter = script('native-approval-adapter.ts');
    expect(adapter).toContain("context === 'agent-review'");
    expect(adapter).not.toContain('context=agent-review');
    expect(adapter).not.toContain('context=human-approval');
  });

  test('merge reviewer judges read-only; trusted effect alone publishes agent-review and cannot merge', () => {
    const text = workflow('reviewer.yml');
    const agentJob = text.slice(text.indexOf('  reviewer:'), text.indexOf('  review_effect:'));
    const effectJob = text.slice(text.indexOf('  review_effect:'));
    expect(agentJob).not.toContain('statuses: write');
    expect(agentJob).not.toContain('issues: write');
    expect(agentJob).not.toContain('contents: write');
    expect(agentJob).toContain('OSS_AGENT_RESULT_PATH');
    expect(agentJob).toContain('OSS_AGENT_RESULT_SCHEMA_PATH');
    expect(effectJob).toContain('statuses: write');
    expect(effectJob).not.toContain('contents: write');
    expect(effectJob).toContain('github.event.repository.default_branch');
    expect(effectJob).toContain('finalize-agent-review.ts');
    // No old prepare/interpreter/bundle pipeline: this is a narrow security-boundary effect.
    expect(text).not.toContain('prepare-review');
    expect(text).not.toContain('interpret-review');
    expect(text).not.toContain('github-agent-publish');
  });

  test('planner owns layer 2: creates issues + proposes roadmap edits (blessed by strategy_reviewer)', () => {
    const text = workflow('planner.yml');
    expect(text).toContain('bun scripts/claude-agent-run.ts --skill .codex/skills/planner/SKILL.md');
    // Close-on-merge is deterministic wiring (bot auto-merge fires no event for `Closes #n`), but it is NOT an
    // agent step — it lives in the merge.yml code-host resource. And creating tracking issues from planned
    // roadmap items is the PLANNER's own job, NOT a script — so the agent run carries no reconcile of any kind.
    expect(text).not.toContain('scripts/reconcile-merged-issues.ts');
    expect(text).not.toContain('scripts/reconcile-roadmap-issues.ts');
    const plJob = text.slice(text.indexOf('  planner:'));
    expect(plJob).toContain('issues: write'); // tasks:author — creates/edits issues directly
    expect(plJob).toContain('contents: write'); // code:propose@roadmap — proposes roadmap.yml edits
    expect(plJob).toContain('strategy_reviewer.yml'); // its roadmap PR is blessed by the strategy reviewer
    const skill = readFileSync(new URL('../.codex/skills/planner/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('origin:roadmap-planner');
    expect(skill).toContain('gh issue create'); // the planner now decomposes items into issues
    expect(skill).toContain('planned: true'); // and sets the soft "fully decomposed" gate
  });

  test('fleet preflight workflow is wired', () => {
    const preflight = workflow('open-autonomy-preflight.yml');
    expect(preflight).toContain('open-autonomy-preflight.ts');
    expect(preflight).toContain('gh label list');
  });

  test('upgrade is a maintainer-run local command, not an autonomous workflow', () => {
    const up = script('open-autonomy-upgrade-cli.ts');
    expect(up).toContain('OPEN_AUTONOMY_TEMPLATE_REPO');
    // the upgrade is a re-compile: clone the engine, run bin/autonomy-upgrade.ts against this install
    expect(up).toContain('bin/autonomy-upgrade.ts');
    expect(up).toContain('--target');
    // it applies to the working tree and stops — the human commits & pushes (so workflow changes,
    // a human_required path the CI token cannot push, go in with the maintainer's own credentials)
    expect(up).not.toContain('gh pr create');
    expect(up).not.toContain('git push');
    // and there is no generated upgrade workflow
    expect(existsSync(new URL('../.github/workflows/open-autonomy-upgrade.yml', import.meta.url))).toBe(false);
  });
});
