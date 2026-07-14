import { describe, expect, test } from 'bun:test';
import type { OrganizationIR } from './organization-ir';
import { materializeOrganizationState, type StateEvent } from './organization-state';

const definition: OrganizationIR = {
  schema: 'autonomy.organization.v2',
  name: 'coding-org',
  behaviors: { code: { kind: 'skill', source: { uri: './code.md' } } },
  actors: { coder: { kind: 'agent', behaviors: ['code'] }, reviewer: { kind: 'human', behaviors: ['code'] } },
  workTypes: {
    change: {
      lifecycle: {
        initial: 'ready', terminal: ['done'], states: { ready: {}, working: {}, done: {} },
        transitions: [
          { from: 'ready', to: 'working', event: 'claim' },
          { from: 'working', to: 'done', event: 'accept' },
        ],
      },
    },
  },
  budgets: { tokens: { resource: 'tokens', limit: 1000, unit: 'token' } },
};

const event = (id: string, type: string, at: string, rest: Partial<StateEvent> = {}): StateEvent => ({ id, type, at, ...rest });

describe('portable organization state materialization', () => {
  test('deterministically reduces a work, claim, attempt, artifact, and budget trace', () => {
    const events: StateEvent[] = [
      event('e1', 'work.created', '2026-07-14T12:00:00Z', { subject: { kind: 'work', id: 'w1' }, data: { type: 'change', state: 'ready' } }),
      event('e2', 'work.assigned', '2026-07-14T12:01:00Z', { subject: { kind: 'work', id: 'w1' }, causation: 'e1', data: { assignees: ['coder'] } }),
      event('e3', 'claim.acquired', '2026-07-14T12:02:00Z', { actor: 'coder', subject: { kind: 'claim', id: 'c1' }, data: { work: 'w1' } }),
      event('e4', 'work.transitioned', '2026-07-14T12:03:00Z', { actor: 'coder', subject: { kind: 'work', id: 'w1' }, data: { to: 'working', event: 'claim' } }),
      event('e5', 'attempt.started', '2026-07-14T12:04:00Z', { actor: 'coder', subject: { kind: 'attempt', id: 'a1' }, data: { work: 'w1' } }),
      event('e6', 'artifact.recorded', '2026-07-14T12:05:00Z', { subject: { kind: 'artifact', id: 'patch' }, data: { uri: 'git:abc', producedBy: 'a1', relatedWork: ['w1'] } }),
      event('e7', 'attempt.status', '2026-07-14T12:06:00Z', { subject: { kind: 'attempt', id: 'a1' }, data: { status: 'succeeded', result: { artifact: 'patch' } } }),
      event('e8', 'claim.released', '2026-07-14T12:07:00Z', { subject: { kind: 'claim', id: 'c1' } }),
      event('e9', 'budget.consumed', '2026-07-14T12:08:00Z', { subject: { kind: 'budget', id: 'tokens' }, data: { amount: 125 } }),
    ];
    const result = materializeOrganizationState(definition, events);
    expect(result.errors).toEqual([]);
    expect(result.state?.revision).toBe(9);
    expect(result.state?.work?.w1).toMatchObject({ state: 'working', assignees: ['coder'], currentAttempts: ['a1'] });
    expect(result.state?.attempts?.a1).toMatchObject({ status: 'succeeded', endedAt: '2026-07-14T12:06:00Z' });
    expect(result.state?.claims?.c1.status).toBe('released');
    expect(result.state?.budgetUsage?.tokens.consumed).toBe(125);
  });

  test('rejects invalid lifecycle transitions without partially returning state', () => {
    const result = materializeOrganizationState(definition, [
      event('e1', 'work.created', '2026-07-14T12:00:00Z', { subject: { kind: 'work', id: 'w1' }, data: { type: 'change' } }),
      event('e2', 'work.transitioned', '2026-07-14T12:01:00Z', { subject: { kind: 'work', id: 'w1' }, data: { to: 'done', event: 'accept' } }),
    ]);
    expect(result.state).toBeUndefined();
    expect(result.errors).toContain("events.e2: no 'accept' transition from 'ready' to 'done'");
  });

  test('requires causation to point backward and event ids to be unique', () => {
    const result = materializeOrganizationState(definition, [
      event('same', 'work.created', '2026-07-14T12:00:00Z', { subject: { kind: 'work', id: 'w1' }, data: { type: 'change' } }),
      event('same', 'work.created', '2026-07-14T12:01:00Z', { subject: { kind: 'work', id: 'w2' }, data: { type: 'change' } }),
      event('e3', 'work.created', '2026-07-14T12:02:00Z', { causation: 'future', subject: { kind: 'work', id: 'w3' }, data: { type: 'change' } }),
    ]);
    expect(result.errors).toContain('events.same: duplicate event id');
    expect(result.errors).toContain("events.e3.causation: unknown prior event 'future'");
  });

  test('rejects mismatched subject kinds and regressing sequential observation time', () => {
    const result = materializeOrganizationState(definition, [
      event('e1', 'work.created', '2026-07-14T12:01:00Z', { subject: { kind: 'attempt', id: 'w1' }, data: { type: 'change' } }),
      event('e2', 'work.created', '2026-07-14T12:02:00Z', { subject: { kind: 'work', id: 'w2' }, data: { type: 'change' } }),
      event('e3', 'work.assigned', '2026-07-14T12:01:30Z', { subject: { kind: 'work', id: 'w2' }, data: { assignees: ['coder'] } }),
    ]);
    expect(result.state).toBeUndefined();
    expect(result.errors).toContain("events.e1.subject.kind must be 'work'");
    expect(result.errors).toContain('events.e3.at: timestamp precedes the accepted observation sequence');
  });
});
