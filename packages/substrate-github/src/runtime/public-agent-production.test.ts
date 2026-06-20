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
      'public-agent.yml',
      'public-agent-pm.yml',
      'public-agent-review.yml',
      'open-autonomy-planner.yml',
      'open-autonomy-preflight.yml',
      'open-autonomy-governance-report.yml',
      'model-proxy-admin.yml',
    ]) {
      expect(workflow(name)).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    }
  });

  test('operator controls run as a separate job, before any model work', () => {
    const text = workflow('public-agent.yml');
    // A `/agent ` comment routes to the control job (the vendored control plane), not the model path.
    expect(text).toContain('node .github/agent-control.mjs');
    expect(text).toContain("startsWith(github.event.comment.body, '/agent ')");
    // The model token is minted only in setup, which is gated OFF for a control comment.
    expect(text).toContain('model-proxy-mint.ts');
    expect(text.indexOf('agent-control.mjs')).toBeLessThan(text.indexOf('model-proxy-mint.ts'));
    for (const verb of ['cancel', 'pause', 'resume', 'status', 'retry']) expect(control()).toContain(verb);
  });

  test('the agent job is credential-less; the publisher validates the bundle out-of-band', () => {
    const text = workflow('public-agent.yml');
    expect(text).toContain('persist-credentials: false');
    expect(text).toContain('permissions: { contents: read, issues: read, pull-requests: read, id-token: write }');
    expect(text).toContain('github-agent-publish.ts');
    expect(text).toContain('--expected-run-id');
  });

  test('PM sweep respects pause/backpressure controls', () => {
    const pm = script('agent-pm.ts');
    expect(pm).toContain('-label:agent-paused');
    expect(pm).toContain('-label:agent-repo-paused');
    expect(pm).toContain('-label:agent-maintainer-hold');
    expect(pm).toContain('-label:needs-info');
    expect(pm).toContain('public agent repo pause is enabled; PM sweep skipped');
    expect(workflow('public-agent-pm.yml')).toContain('bun scripts/agent-pm.ts');
  });

  test('model proxy admin exposes status and revoke operations', () => {
    const text = workflow('model-proxy-admin.yml');
    expect(text).toContain('/admin/limits/status');
    expect(text).toContain('/admin/runs/${RUN_ID}/revoke');
  });

  test('direct review uses shared control files and loop budgets', () => {
    const rv = script('agent-reviewer.ts');
    expect(rv).toContain('public-agent-control-files.ts');
    expect(rv).toContain('public-agent-loop-budget.ts');
    expect(rv).toContain('--kind ci');
    expect(rv).toContain('--kind review');
    expect(rv).toContain('--control-files .agent-run/control-files.json');
    expect(workflow('public-agent-review.yml')).toContain('bun scripts/agent-reviewer.ts');
  });

  test('planner workflow applies roadmap issue plans', () => {
    const pl = script('agent-planner.ts');
    expect(pl).toContain('public-agent-planner.ts');
    expect(pl).toContain('origin:roadmap-planner');
    expect(pl).toContain('gh issue create');
    expect(pl).toContain('gh issue edit');
    expect(workflow('open-autonomy-planner.yml')).toContain('bun scripts/agent-planner.ts');
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
    // the canonical installation is COMPILED from the profile (no hand-maintained template dir)
    expect(up).toContain('autonomy-compile.ts profiles/self-driving github');
    expect(up).toContain('open-autonomy-upgrade.ts');
    // it applies to the working tree and stops — the human commits & pushes (so workflow changes,
    // a human_required path the CI token cannot push, go in with the maintainer's own credentials)
    expect(up).not.toContain('gh pr create');
    expect(up).not.toContain('git push');
    // and there is no generated upgrade workflow
    expect(existsSync(new URL('../.github/workflows/open-autonomy-upgrade.yml', import.meta.url))).toBe(false);
  });
});
