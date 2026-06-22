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
      'open-autonomy-governance-report.yml',
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
    // The pm skill encodes the backpressure controls.
    const skill = readFileSync(new URL('../.codex/skills/pm/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('agent-repo-paused');
    expect(skill).toContain('max_open_agent_prs');
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

  test('planner is a skill agent that reconciles roadmap into tracking issues', () => {
    const text = workflow('planner.yml');
    expect(text).toContain('bun scripts/claude-agent-run.ts --skill .codex/skills/planner/SKILL.md');
    const plJob = text.slice(text.indexOf('  planner:'));
    expect(plJob).toContain('issues: write'); // tasks:author
    expect(plJob).not.toContain('contents: write'); // planner changes no code
    const skill = readFileSync(new URL('../.codex/skills/planner/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toContain('origin:roadmap-planner');
    expect(skill).toContain('gh issue create');
  });

  test('fleet preflight and governance workflows are wired', () => {
    const preflight = workflow('open-autonomy-preflight.yml');
    expect(preflight).toContain('open-autonomy-preflight.ts');
    expect(preflight).toContain('gh label list');
    const report = workflow('open-autonomy-governance-report.yml');
    expect(report).toContain('public-agent-decision-index.ts');
    expect(report).toContain('open-autonomy-governance-report.ts');
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
