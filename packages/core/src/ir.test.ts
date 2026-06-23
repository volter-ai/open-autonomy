import { describe, expect, test } from 'bun:test';
import { validateIR, irShape, type AutonomyIR, type IRAgent } from './ir';

function agent(over: Partial<IRAgent> = {}): IRAgent {
  return {
    behavior: 'skills/x',
    capabilities: ['tasks:converse'],
    triggers: [{ cron: '*/5 * * * *' }],
    ...over,
  };
}

function ir(agents: Record<string, IRAgent>): AutonomyIR {
  return { schema: 'autonomy.ir.v1', targets: ['github'], agents, policy: { box: {} }, resources: [] };
}

describe('validateIR — triggers', () => {
  test('accepts cron, event, and task triggers', () => {
    const a = agent({ triggers: [{ cron: '0 0 * * *' }, { event: 'issues' }, { task: 'human-required' }] });
    expect(validateIR(ir({ a }))).toEqual([]);
  });

  test('rejects a trigger that is none of cron/event/task', () => {
    const a = agent({ triggers: [{} as never] });
    expect(validateIR(ir({ a })).some((e) => e.includes('trigger must be a cron, an event, or a task'))).toBe(true);
  });

  test('rejects a task trigger with an empty state', () => {
    const a = agent({ triggers: [{ task: '' }] });
    expect(validateIR(ir({ a })).some((e) => e.includes('task trigger needs a lifecycle state'))).toBe(true);
  });

  test('requires at least one trigger', () => {
    const a = agent({ triggers: [] });
    expect(validateIR(ir({ a })).some((e) => e.includes('at least one trigger'))).toBe(true);
  });
});

describe('validateIR — actor kind', () => {
  test('accepts an omitted kind (defaults to agent)', () => {
    expect(validateIR(ir({ a: agent() }))).toEqual([]);
  });

  test('accepts a human actor triggered by a task state', () => {
    const a = agent({ kind: 'human', behavior: 'humans/maintainer', triggers: [{ task: 'human-required' }] });
    expect(validateIR(ir({ a }))).toEqual([]);
  });

  test('rejects an unknown kind', () => {
    const a = agent({ kind: 'robot' as never });
    expect(validateIR(ir({ a })).some((e) => e.includes("kind must be 'agent' or 'human'"))).toBe(true);
  });
});

describe('validateIR — code:merge is gate-only (the merge boundary)', () => {
  test('rejects code:merge on an agent', () => {
    const a = agent({ capabilities: ['code:propose', 'code:merge'] });
    expect(validateIR(ir({ a })).some((e) => e.includes('code:merge is gate-only'))).toBe(true);
  });

  test('rejects code:merge even when scoped', () => {
    const a = agent({ capabilities: ['code:merge@roadmap'] });
    expect(validateIR(ir({ a })).some((e) => e.includes('code:merge is gate-only'))).toBe(true);
  });

  test('accepts code:propose (and a scoped propose)', () => {
    expect(validateIR(ir({ a: agent({ capabilities: ['code:propose'] }) }))).toEqual([]);
    expect(validateIR(ir({ a: agent({ capabilities: ['code:propose@roadmap'] }) }))).toEqual([]);
  });

  test('rejects an agent holding both code:review and code:propose (the bless/propose split)', () => {
    const a = agent({ capabilities: ['code:propose', 'code:review'] });
    expect(validateIR(ir({ a })).some((e) => e.includes('no agent may hold both code:review and code:propose'))).toBe(true);
    // also when scoped
    const b = agent({ capabilities: ['code:propose@roadmap', 'code:review'] });
    expect(validateIR(ir({ a: b })).some((e) => e.includes('no agent may hold both code:review and code:propose'))).toBe(true);
  });

  test('accepts code:review alone and code:propose alone (the boundary is satisfied by separate agents)', () => {
    expect(validateIR(ir({ a: agent({ capabilities: ['code:review'] }) }))).toEqual([]);
    expect(validateIR(ir({ a: agent({ capabilities: ['code:propose'] }) }))).toEqual([]);
  });
});

describe('validateIR — schema/agents', () => {
  test('rejects a bad schema', () => {
    const bad = { ...ir({ a: agent() }), schema: 'nope' as never };
    expect(validateIR(bad).some((e) => e.includes('bad schema'))).toBe(true);
  });

  test('rejects an empty actor set', () => {
    expect(validateIR(ir({})).some((e) => e.includes('no agents'))).toBe(true);
  });
});

describe('validateIR — result schema (optional, skill agents)', () => {
  test('accepts an optional result schema on a skill agent', () => {
    const a = agent({ result: { schema: { type: 'object', properties: { decision: { type: 'string' } } } } });
    expect(validateIR(ir({ a }))).toEqual([]);
  });

  test('rejects a result on a script-behavior agent (a script returns its result directly)', () => {
    const a = agent({ behavior: 'scripts/agent-pm.ts', result: { schema: { type: 'object' } } });
    expect(validateIR(ir({ a })).some((e) => e.includes('result is for skill agents only'))).toBe(true);
  });

  test('rejects a malformed result (no schema object)', () => {
    const a = agent({ result: {} as never });
    expect(validateIR(ir({ a })).some((e) => e.includes('result must be { schema'))).toBe(true);
  });
});

describe('irShape', () => {
  test('renders a task trigger as task:<state> (not event:undefined)', () => {
    const a = agent({ triggers: [{ task: 'human-required' }, { cron: '0 0 * * *' }] });
    const triggers = irShape(ir({ a })).triggers.find((t) => t.agent === 'a')!.triggers;
    expect(triggers).toContain('task:human-required');
    expect(triggers).toContain('cron:0 0 * * *');
    expect(triggers.some((t) => t.startsWith('event:'))).toBe(false);
  });
});
