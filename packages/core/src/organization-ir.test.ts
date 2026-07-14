import { describe, expect, test } from 'bun:test';
import { parseOrganizationIr, parseOrganizationStateIr } from './organization-ir-yaml';
import { validateOrganizationIR, type OrganizationIR } from './organization-ir';

const minimal: OrganizationIR = {
  schema: 'autonomy.organization.v2',
  name: 'example',
  behaviors: { worker: { kind: 'skill', source: { uri: './skills/worker/SKILL.md' } } },
  actors: { worker: { kind: 'agent', behaviors: ['worker'] } },
};

describe('autonomy.organization.v2', () => {
  test('accepts the minimal target-independent organization', () => {
    expect(validateOrganizationIR(minimal)).toEqual({ errors: [], warnings: [] });
  });

  test('rejects dangling semantic references', () => {
    const ir: OrganizationIR = {
      ...minimal,
      actors: { worker: { kind: 'agent', behaviors: ['missing'], reportsTo: ['ghost'] } },
    };
    const errors = validateOrganizationIR(ir).errors;
    expect(errors).toContain("actors.worker.behaviors: unknown behavior 'missing'");
    expect(errors).toContain("actors.worker.reportsTo: unknown actor or unit 'ghost'");
  });

  test('checks lifecycle states and initial work', () => {
    const ir: OrganizationIR = {
      ...minimal,
      workTypes: {
        task: {
          lifecycle: {
            initial: 'open',
            terminal: ['done'],
            states: { open: {}, done: { category: 'terminal' } },
            transitions: [{ from: 'open', to: 'done', event: 'complete' }],
          },
        },
      },
      initialWork: { first: { type: 'task', title: 'First', initialState: 'unknown' } },
    };
    expect(validateOrganizationIR(ir).errors).toContain("initialWork.first.initialState: unknown state 'unknown' for type 'task'");
  });

  test('detects parent and dependency cycles', () => {
    const ir: OrganizationIR = {
      ...minimal,
      goals: {
        a: { statement: 'a', parent: 'b' },
        b: { statement: 'b', parent: 'a' },
      },
      workTypes: {
        task: {
          lifecycle: { initial: 'open', terminal: ['done'], states: { open: {}, done: {} }, transitions: [] },
        },
      },
      initialWork: {
        a: { type: 'task', title: 'a', dependencies: ['b'] },
        b: { type: 'task', title: 'b', dependencies: ['a'] },
      },
    };
    const errors = validateOrganizationIR(ir).errors;
    expect(errors.some((x) => x.includes('parent cycle'))).toBe(true);
    expect(errors.some((x) => x.includes('dependency cycle'))).toBe(true);
  });

  test('parses YAML and validates operational state against its definition', () => {
    const definition = parseOrganizationIr(`
schema: autonomy.organization.v2
name: coding-org
behaviors:
  coder: { kind: skill, source: { uri: ./skills/coder/SKILL.md } }
actors:
  coder: { kind: agent, behaviors: [coder] }
workTypes:
  change:
    lifecycle:
      initial: ready
      terminal: [done]
      states: { ready: {}, working: {}, done: {} }
      transitions:
        - { from: ready, to: working, event: claim }
        - { from: working, to: done, event: verify }
`);
    const state = parseOrganizationStateIr(`
schema: autonomy.state.v1
organization: { name: coding-org }
revision: 1
observedAt: 2026-07-14T12:00:00Z
work:
  issue-1: { type: change, state: working, assignees: [coder] }
attempts:
  run-1: { work: issue-1, actor: coder, status: running }
claims:
  claim-1:
    work: issue-1
    actor: coder
    acquiredAt: 2026-07-14T12:00:00Z
    status: active
`, definition);
    expect(state.work?.['issue-1'].state).toBe('working');
  });
});
