import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

// Production wiring after the agent-model migration: a model-interpreted agent (developer) compiles to
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
      'developer.yml',
      'pm.yml',
      'reviewer.yml',
      'planner.yml',
      'open-autonomy-preflight.yml',
    ]) {
      expect(workflow(name)).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    }
  });

  test('operator controls run as a separate job, before any model work', () => {
    const text = workflow('developer.yml');
    // A `/agent ` comment routes to the control job (the vendored control plane), not the model path.
    expect(text).toContain('node .github/agent-control.mjs');
    expect(text).toContain("startsWith(github.event.comment.body, '/agent ')");
    // The model token is minted only in setup, which is gated OFF for a control comment.
    expect(text).toContain('model-proxy-mint.ts');
    expect(text.indexOf('agent-control.mjs')).toBeLessThan(text.indexOf('model-proxy-mint.ts'));
    for (const verb of ['cancel', 'pause', 'resume', 'status', 'retry']) expect(control()).toContain(verb);
  });

  test('the comment surface is maintainer-gated and fork-gated (no drive-by launch, no fork escalation)', () => {
    // Every agent that fires on issue_comment / pull_request_target must gate those untrusted-actor
    // surfaces. The control plane and the comment-launch require a maintainer (author_association); a
    // pull_request_target agent run requires a same-repo PR or a maintainer author. A plain comment
    // launches nothing. These are the merge-boundary / control-plane guards — encoded as a check so they
    // can never silently regress (the deep-review found both missing).
    for (const wf of ['developer.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
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
    // Routing is mechanical wiring — the proposer's effect dispatches its independent reviewer when the PR
    // opens (same path as the ci dispatch). Encoded as a check so routing never silently depends on a model.
    expect(workflow('developer.yml')).toContain('gh workflow run reviewer.yml -f issue_number=');
    expect(workflow('strategist.yml')).toContain('gh workflow run strategy_reviewer.yml -f issue_number=');
    // The PM no longer carries a PR-routing step (it owns triage + capacity + close, all judgments/sweeps).
    const pm = readFileSync(new URL('../.codex/skills/pm/SKILL.md', import.meta.url), 'utf8');
    expect(pm).not.toContain('Route open agent PRs to review');
  });

  test('mechanical sweep ops are deterministic, not PM-model steps (reconcile + repo-pause)', () => {
    // Closing a merged-PR issue and honoring repo-pause are mechanical wiring — they must not depend on the
    // model. A tasks:author agent runs a deterministic reconcile step; every agent job is gated on the
    // repo-pause variable kill-switch. Encoded as a check (the bench found these stalling as model steps).
    const pm = workflow('pm.yml');
    expect(pm).toContain('reconcile-merged-issues.ts');
    expect(pm).toContain("vars.PUBLIC_AGENT_REPO_PAUSED != 'true'");
    expect(workflow('developer.yml')).toContain("vars.PUBLIC_AGENT_REPO_PAUSED != 'true'");
    // a non-tasks:author agent does NOT reconcile (capability-gated, like effect on code:propose)
    expect(workflow('reviewer.yml')).not.toContain('reconcile-merged-issues.ts');
  });

  test('every agent run persists its call result (durable transcript artifact + live-log echo)', () => {
    // The model output is otherwise written to gitignored scratch that dies with the runner. Each agent
    // run must upload .agent-run/ (transcript + pr.md + subject) as an artifact (if: always, so failures are
    // captured) AND echo the transcript into the run log — so no agent call's result is ever lost.
    for (const wf of ['developer.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      expect(text).toContain('actions/upload-artifact@v4');
      expect(text).toContain('path: .agent-run/');
      expect(text).toContain('agent transcript');
    }
  });

  test('credentialed jobs lock down egress (no token exfiltration from untrusted-derived work)', () => {
    // The agent runs untrusted-derived work with a scoped GH_TOKEN + bounded model token in env. Every
    // agent workflow must block egress (harden-runner) so a prompt-injected agent can't ship a token to an
    // attacker host. Encoded as a check so the lockdown can't silently regress.
    for (const wf of ['developer.yml', 'reviewer.yml', 'pm.yml', 'planner.yml', 'strategist.yml', 'strategy_reviewer.yml']) {
      const text = workflow(wf);
      expect(text).toContain('step-security/harden-runner');
      expect(text).toContain('egress-policy: block');
    }
  });

  test('the agent job is credentialed (scoped to its capabilities); it proposes its own auto-merging PR', () => {
    const text = workflow('developer.yml');
    // developer = code:propose + tasks:converse → contents/pull-requests/actions/issues:write + id-token.
    expect(text).toContain('pull-requests: write');
    expect(text).toContain('contents: write');
    // It acts directly: the generic effect step pushes its change and queues native auto-merge.
    expect(text).toContain('gh pr merge "$branch" --squash --auto');
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
    expect(pmJob).not.toContain('contents: write'); // pm changes no code
    // The pm skill is the orchestrator: full situational awareness (every issue + the runner) + capacity +
    // escalation doctrine. (Repo-pause is now a deterministic substrate kill-switch, not a PM-model check.)
    const skill = readFileSync(new URL('../.codex/skills/pm/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('max_open_agent_prs'); // capacity judgment
    expect(skill).toContain('gh run list'); // inspects running agents/sessions via the runner
    expect(skill).toContain('human-required'); // escalates rather than looping
  });

  test('reviewer holds code:review (statuses:write) and cannot merge (no contents:write)', () => {
    // The reviewer posts the agent-review verdict status; it has no contents:write, so it cannot merge.
    // GitHub native auto-merge lands the PR once ci + agent-review are green (the permission-split boundary).
    const text = workflow('reviewer.yml');
    const agentJob = text.slice(text.indexOf('  reviewer:'));
    expect(agentJob).toContain('statuses: write');
    expect(agentJob).not.toContain('contents: write');
    // No prepare/interpreter scripts and no bundle — the skill acts directly.
    expect(text).not.toContain('prepare-review');
    expect(text).not.toContain('interpret-review');
    expect(text).not.toContain('github-agent-publish');
  });

  test('planner reconciles roadmap into tracking issues (creation is deterministic, not the model)', () => {
    const text = workflow('planner.yml');
    expect(text).toContain('bun scripts/claude-agent-run.ts --skill .codex/skills/planner/SKILL.md');
    // Creating one tracking issue per planned/active item is mechanical wiring, so it runs as a deterministic
    // step (not left to a possibly-weak model executing the skill) — symmetric with closing merged issues.
    expect(text).toContain('scripts/reconcile-roadmap-issues.ts');
    expect(text).toContain('scripts/reconcile-merged-issues.ts');
    const plJob = text.slice(text.indexOf('  planner:'));
    expect(plJob).toContain('issues: write'); // tasks:author
    expect(plJob).not.toContain('contents: write'); // planner changes no code
    const skill = readFileSync(new URL('../.codex/skills/planner/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('origin:roadmap-planner');
    expect(skill).not.toContain('gh issue create'); // creation is deterministic; the skill must not duplicate
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
