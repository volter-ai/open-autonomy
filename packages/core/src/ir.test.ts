import { describe, expect, test } from 'bun:test';
import { validateIR, irShape, type AutonomyIR, type IRAgent } from './ir';
import { parseIr } from './ir-yaml';

describe('parseIr — runner alias normalization (github → gh-actions)', () => {
  // The runner-substrate is `gh-actions`; `github` (which conflated runner with code host) is accepted as a
  // back-compat alias and normalized away on parse, so the rest of the engine only ever sees `gh-actions`.
  test('normalizes the `github` target + policy.box.github key to gh-actions', () => {
    const ir = parseIr([
      'schema: autonomy.ir.v1',
      'targets: [github]',
      'agents:',
      '  pm: { behavior: skills/pm, capabilities: [tasks:converse], triggers: [{ cron: "0 0 * * *" }] }',
      'policy: { box: { github: { model: x/y } } }',
      'resources: []',
    ].join('\n'));
    expect(ir.targets).toEqual(['gh-actions']);
    expect((ir.policy.box as Record<string, unknown>)['gh-actions']).toEqual({ model: 'x/y' });
    expect((ir.policy.box as Record<string, unknown>).github).toBeUndefined();
  });
});

function agent(over: Partial<IRAgent> = {}): IRAgent {
  return {
    behavior: 'skills/x',
    capabilities: ['tasks:converse'],
    triggers: [{ cron: '*/5 * * * *' }],
    ...over,
  };
}

function ir(agents: Record<string, IRAgent>): AutonomyIR {
  return { schema: 'autonomy.ir.v1', targets: ['gh-actions'], agents, policy: { box: {} }, resources: [] };
}

describe('validateIR — triggers', () => {
  test('accepts cron, event, and dispatch triggers', () => {
    const a = agent({ triggers: [{ cron: '0 0 * * *' }, { event: 'issues' }, { dispatch: true }] });
    expect(validateIR(ir({ a }))).toEqual([]);
  });

  test('rejects a trigger that is none of cron/event/dispatch', () => {
    const a = agent({ triggers: [{} as never] });
    expect(validateIR(ir({ a })).some((e) => e.includes('trigger must be a cron, an event, or a dispatch'))).toBe(true);
  });

  test('rejects a malformed dispatch trigger', () => {
    const a = agent({ triggers: [{ dispatch: false } as never] });
    expect(validateIR(ir({ a })).some((e) => e.includes('dispatch trigger must be { dispatch: true }'))).toBe(true);
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

  test('accepts a human actor dispatched on demand', () => {
    const a = agent({ kind: 'human', behavior: 'humans/maintainer', triggers: [{ dispatch: true }] });
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

describe('validateIR — the review edge (deterministic routing target)', () => {
  test('accepts a proposer whose review names an independent code:review agent', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'rev' });
    const rev = agent({ capabilities: ['code:review'] });
    expect(validateIR(ir({ dev, rev }))).toEqual([]);
  });

  test('rejects review naming an unknown agent', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'ghost' });
    expect(validateIR(ir({ dev })).some((e) => e.includes("review names unknown agent 'ghost'"))).toBe(true);
  });

  test('rejects review naming a non-reviewer (no code:review)', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'rev' });
    const rev = agent({ capabilities: ['tasks:converse'] }); // not a reviewer
    expect(validateIR(ir({ dev, rev })).some((e) => e.includes("must hold code:review"))).toBe(true);
  });

  test('rejects an agent reviewing itself (independence)', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'dev' });
    expect(validateIR(ir({ dev })).some((e) => e.includes('INDEPENDENT reviewer, not itself'))).toBe(true);
  });
});

describe('validateIR — schema/agents', () => {
  test('rejects a bad schema', () => {
    const bad = { ...ir({ a: agent() }), schema: 'nope' as never };
    expect(validateIR(bad).some((e) => e.includes('bad schema'))).toBe(true);
  });

  test('rejects an empty actor set', () => {
    const errs = validateIR(ir({}));
    expect(errs.some((e) => e.includes('no agents'))).toBe(true);
    // BL-15: a plain missing/empty agents map names the expected key so a docs-first author self-corrects.
    expect(errs.some((e) => e.includes('no agents (the top-level key is "agents:")'))).toBe(true);
  });

  test('names the actors:->agents: mid-migration mistake when a profile used the SPEC prose key', () => {
    // docs/SPEC.md#the-ir describes the FUTURE key as `actors:`, but the parser only accepts `agents:`
    // today (packages/core/src/ir.ts) — a docs-first author who copies the prose literally gets an empty
    // agent set. The error must name the specific mistake, not just "no agents".
    const withActorsKey = { ...ir({}), actors: { a: agent() } } as unknown as AutonomyIR;
    const errs = validateIR(withActorsKey);
    expect(errs.some((e) => e.includes('no agents (found "actors:" — the key is "agents:")'))).toBe(true);
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
  test('renders a dispatch trigger as dispatch (not event:undefined)', () => {
    const a = agent({ triggers: [{ dispatch: true }, { cron: '0 0 * * *' }] });
    const triggers = irShape(ir({ a })).triggers.find((t) => t.agent === 'a')!.triggers;
    expect(triggers).toContain('dispatch');
    expect(triggers).toContain('cron:0 0 * * *');
    expect(triggers.some((t) => t.startsWith('event:'))).toBe(false);
  });
});
