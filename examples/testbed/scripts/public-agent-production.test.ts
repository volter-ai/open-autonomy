import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const workflow = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

describe('public agent production readiness', () => {
  test('workflows opt into Node 24 JavaScript actions', () => {
    for (const name of ['ci.yml', 'public-agent.yml', 'public-agent-pm.yml', 'public-agent-review.yml', 'open-autonomy-planner.yml', 'model-proxy-admin.yml']) {
      expect(workflow(name)).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    }
  });

  test('operator controls are wired before model minting', () => {
    const text = workflow('public-agent.yml');
    expect(text).toContain("startsWith(github.event.comment.body, '/agent pause')");
    expect(text).toContain("startsWith(github.event.comment.body, '/agent status')");
    expect(text).toContain('Handle operator control');
    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
    expect(text).toContain('Agent retry did not find a failed infrastructure run');
  });

  test('PM and direct develop respect pause/backpressure controls', () => {
    expect(workflow('public-agent-pm.yml')).toContain('-label:agent-paused');
    expect(workflow('public-agent-pm.yml')).toContain('-label:agent-repo-paused');
    expect(workflow('public-agent-pm.yml')).toContain('public agent repo pause is enabled; PM sweep skipped');
    expect(workflow('public-agent.yml')).toContain('repo-level agent pause is enabled');
    expect(workflow('public-agent.yml')).toContain('agent-repo-paused');
    expect(workflow('public-agent.yml')).toContain('steps.repo_pause.outputs.paused');
  });

  test('model proxy admin exposes status and revoke operations', () => {
    const text = workflow('model-proxy-admin.yml');
    expect(text).toContain('/admin/limits/status');
    expect(text).toContain('/admin/runs/${RUN_ID}/revoke');
  });

  test('publisher rejections are surfaced before the job fails', () => {
    const text = workflow('public-agent.yml');
    expect(text).toContain('Agent run blocked: publisher rejected the generated bundle.');
    expect(text).toContain('--decision "rejected"');
    expect(text).toContain('agent-publisher-decisions-${{ needs.agent-runner.outputs.run_id }}');
    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
  });

  test('direct review uses shared control files and loop budgets', () => {
    const text = workflow('public-agent-review.yml');
    expect(text).toContain('public-agent-control-files.ts');
    expect(text).toContain('public-agent-loop-budget.ts');
    expect(text).toContain('--kind ci');
    expect(text).toContain('--kind review');
    expect(text).toContain('--control-files .agent-run/control-files.json');
  });

  test('planner workflow applies roadmap issue plans', () => {
    const text = workflow('open-autonomy-planner.yml');
    expect(text).toContain('public-agent-planner.ts');
    expect(text).toContain('origin:roadmap-planner');
    expect(text).toContain('gh issue create');
    expect(text).toContain('gh issue edit');
  });
});
