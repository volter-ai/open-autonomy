import { describe, expect, test } from 'bun:test';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';
import { readControlFileContext, renderControlFilePrompt } from './public-agent-control-files.js';
import { parseRoadmapItems, planRoadmapIssues } from './public-agent-planner.js';
import { renderReviewPrompt } from './public-agent-review.js';

const roadmap = `
schema: open-autonomy.roadmap.v1
items:
  - id: pm-proactive-backlog
    phase: 3
    priority: high
    status: active
    title: PM Operations And Backlog Policy
    proof_gate: pm-open-pr-review
    acceptance:
      - PM routes existing agent PRs to review.
      - PM comments visible wait states.
  - id: complete-item
    phase: 4
    priority: low
    status: done
    title: Already Complete
    proof_gate: complete-proof
    acceptance:
      - Nothing left.
`;

describe('open autonomy planner and control files', () => {
  test('loads root control files into prompt context', () => {
    const context = readControlFileContext('.');
    expect(context.sources).toContain('AGENTS.md');
    expect(context.sources).toContain('.open-autonomy/constitution.md');
    expect(context.sources).toContain('.open-autonomy/review-rubric.yml');
    const prompt = renderControlFilePrompt(context);
    expect(prompt).toContain('Open Autonomy Constitution');
    expect(prompt).toContain('review-rubric.yml');
  });

  test('review prompt includes control-file context', () => {
    const prompt = renderReviewPrompt('diff --git a/docs/x b/docs/x', '{"decision":"pass"}', 'constitution: stay scoped');
    expect(prompt).toContain('Control files:');
    expect(prompt).toContain('constitution: stay scoped');
  });

  test('planner creates missing active roadmap issues and skips done items', () => {
    const items = parseRoadmapItems(roadmap);
    const actions = planRoadmapIssues(items, []);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe('create');
    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
    expect(actions[0]?.body).toContain('Proof gate: `pm-open-pr-review`');
  });

  test('planner updates existing roadmap issues that are missing labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
    expect(action?.action).toBe('update');
    expect(action?.issue_number).toBe(10);
  });

  test('planner dedupes existing roadmap issues with proof labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{
      number: 11,
      title: 'Custom title',
      body: 'Proof gate: `pm-open-pr-review`',
      labels: [
        { name: 'roadmap:phase-3' },
        { name: 'priority:high' },
        { name: 'origin:roadmap-planner' },
        { name: 'proof:pm-open-pr-review' },
      ],
    }]);
    expect(action?.action).toBe('skip');
  });

  test('decision index reconstructs latest state by issue and stage', () => {
    const first = makeDecision({
      stage: 'pm_triage',
      issue: 7,
      actor: 'planner',
      decision: 'develop',
      next_action: 'develop',
    }, new Date('2026-06-16T10:00:00Z'));
    const second = makeDecision({
      stage: 'merge_gate',
      issue: 7,
      pr: 8,
      actor: 'merge-gate',
      decision: 'merge',
      next_action: 'close',
    }, new Date('2026-06-16T10:05:00Z'));
    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
    expect(index.decisions).toBe(2);
    expect(index.issues[0]?.latest_pr).toBe(8);
    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
  });
});
