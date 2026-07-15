import { describe, expect, test } from 'bun:test';
import { REVIEW_RESULT_SCHEMA_ID, validateIR, irShape, type AutonomyIR, type IRAgent } from './ir';
import { parseIr, applyDocumentAutoGate } from './ir-yaml';

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
    const rev = agent({
      capabilities: ['code:review'],
      result: { schema: REVIEW_RESULT_SCHEMA_ID },
      triggers: [{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }],
    });
    expect(validateIR(ir({ dev, rev }))).toEqual([]);
  });

  test('rejects a merge reviewer with no declared standard review result', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'rev' });
    const rev = agent({ capabilities: ['code:review'], triggers: [{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }] });
    expect(validateIR(ir({ dev, rev })).some((e) => e.includes(`result.schema: ${REVIEW_RESULT_SCHEMA_ID}`))).toBe(true);
  });

  test('rejects a merge reviewer that cannot receive the proposal subject', () => {
    const dev = agent({ capabilities: ['code:propose'], review: 'rev' });
    const rev = agent({ capabilities: ['code:review'], result: { schema: REVIEW_RESULT_SCHEMA_ID } });
    expect(validateIR(ir({ dev, rev })).some((e) => e.includes('must declare a trigger param sourced from subject.ref'))).toBe(true);
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
    expect(validateIR(ir({ a })).some((e) => e.includes('known schema id or an inline JSON Schema'))).toBe(true);
  });

  test('accepts the named standard review-result schema and rejects an unknown named schema', () => {
    expect(validateIR(ir({ a: agent({ result: { schema: REVIEW_RESULT_SCHEMA_ID } }) }))).toEqual([]);
    expect(validateIR(ir({ a: agent({ result: { schema: 'example.unknown.v1' as never } }) })).some((e) => e.includes('known schema id'))).toBe(true);
  });
});

describe('validateIR — policy/resources are required (BL-22: raw engine TypeErrors -> actionable errors)', () => {
  // manifest.ts reads ir.policy.box and substrate-github emit.ts reads ir.resources.includes(...) —
  // omitting either used to crash deep in a substrate instead of failing at parse time with a clear
  // message (the audit's three raw TypeErrors: no policy, policy: {}, no resources).
  test('rejects a missing policy', () => {
    const bad = { ...ir({ a: agent() }) } as Partial<AutonomyIR>;
    delete bad.policy;
    expect(validateIR(bad as AutonomyIR).some((e) => e.includes('missing policy'))).toBe(true);
  });

  test('rejects policy: {} (no box key) — the substrate-github emit.ts:154 TypeError', () => {
    const bad = { ...ir({ a: agent() }), policy: {} as never };
    expect(validateIR(bad).some((e) => e.includes('policy.box is required'))).toBe(true);
  });

  test('rejects a missing resources — the emit.ts:501 TypeError', () => {
    const bad = { ...ir({ a: agent() }) } as Partial<AutonomyIR>;
    delete bad.resources;
    expect(validateIR(bad as AutonomyIR).some((e) => e.includes('missing resources'))).toBe(true);
  });

  test('accepts policy: { box: {} } and resources: [] (the minimum valid form)', () => {
    expect(validateIR(ir({ a: agent() }))).toEqual([]);
  });
});

describe('validateIR — capability catalog (BL-22: a typo used to compile silently)', () => {
  test('rejects an unknown capability', () => {
    const a = agent({ capabilities: ['tasks:converse', 'totally-made-up'] });
    expect(validateIR(ir({ a })).some((e) => e.includes("unknown capability 'totally-made-up'"))).toBe(true);
  });

  test('rejects a near-miss typo (code:proposal, not code:propose)', () => {
    const a = agent({ capabilities: ['code:proposal'] });
    expect(validateIR(ir({ a })).some((e) => e.includes("unknown capability 'code:proposal'"))).toBe(true);
  });

  test('accepts every catalog capability, including a scoped one', () => {
    const a = agent({
      capabilities: ['code:propose@roadmap', 'code:review', 'tasks:author', 'tasks:converse', 'agent:launch', 'agent:list', 'agent:update', 'agent:cancel'],
    });
    // code:review + code:propose together trip the merge-boundary error, not the catalog — drop review to isolate the catalog check.
    const errs = validateIR(ir({ a: { ...a, capabilities: a.capabilities!.filter((c) => c !== 'code:review') } }));
    expect(errs.some((e) => e.includes('unknown capability'))).toBe(false);
  });
});

describe('validateIR — trigger param source catalog (BL-22: an unknown source silently resolved to \'\')', () => {
  test('rejects an unknown trigger param source', () => {
    const a = agent({ triggers: [{ dispatch: true, params: { ISSUE: 'subject.reff' } }] });
    expect(validateIR(ir({ a })).some((e) => e.includes("trigger param 'ISSUE' has unknown source 'subject.reff'"))).toBe(true);
  });

  test('accepts every catalog source', () => {
    const a = agent({
      triggers: [
        { dispatch: true, params: { A: 'subject.ref', B: 'subject.actor', C: 'subject.actorRole', D: 'subject.text', E: 'trigger.kind' } },
      ],
    });
    expect(validateIR(ir({ a }))).toEqual([]);
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

// U2 (supercode study §II.9.1) — the `documents.roles` role map: vision/constitution/roadmap declared by
// altitude, never a hardcoded filename. Additive: an IR with no `documents` block is untouched by any of this.
describe('validateIR — documents.roles', () => {
  test('an IR with no documents block validates exactly as before (additive, back-compat)', () => {
    const a = agent();
    expect(validateIR(ir({ a }))).toEqual([]);
  });

  test('rejects documents.roles missing vision — declaring the block without the measuring stick is not allowed', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { constitution: 'docs/CONSTITUTION.md' } as never } };
    expect(validateIR(withDocs).some((e) => e.includes('documents.roles.vision is required'))).toBe(true);
  });

  test('rejects a bare `documents: {}` (no roles key at all)', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: {} as never };
    expect(validateIR(withDocs).some((e) => e.includes('documents.roles is required'))).toBe(true);
  });

  test('accepts vision alone (constitution/roadmap independently optional)', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { vision: 'docs/VISION.md' } } };
    expect(validateIR(withDocs)).toEqual([]);
  });

  test('accepts the full role map', () => {
    const a = agent();
    const withDocs: AutonomyIR = {
      ...ir({ a }),
      documents: { roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md', roadmap: '.open-autonomy/roadmap.yml' } },
    };
    expect(validateIR(withDocs)).toEqual([]);
  });

  test('rejects a glob in a role path — roles are literal paths, one file per role', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { vision: 'docs/*.md' } } };
    expect(validateIR(withDocs).some((e) => e.includes('must be a literal path, not a glob'))).toBe(true);
  });

  test('rejects a Bun.Glob character class ([) in a role path — downstream consumers interpret it as a pattern', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { vision: 'docs/VISION[01].md' } } };
    expect(validateIR(withDocs).some((e) => e.includes('must be a literal path, not a glob'))).toBe(true);
  });

  test('rejects Bun.Glob brace expansion ({) in a role path', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { vision: 'docs/{VISION,MISSION}.md' } } };
    expect(validateIR(withDocs).some((e) => e.includes('must be a literal path, not a glob'))).toBe(true);
  });

  test('rejects an unknown role key — the role set is closed (exactly vision/constitution/roadmap)', () => {
    const a = agent();
    const withDocs: AutonomyIR = {
      ...ir({ a }),
      documents: { roles: { vision: 'docs/VISION.md', mission: 'docs/MISSION.md' } as never },
    };
    expect(
      validateIR(withDocs).some((e) => e.includes('documents.roles.mission: unknown role') && e.includes('vision, constitution, roadmap')),
    ).toBe(true);
  });

  test('rejects a non-string / empty role value', () => {
    const a = agent();
    const withDocs: AutonomyIR = { ...ir({ a }), documents: { roles: { vision: 'docs/VISION.md', constitution: '' } } };
    expect(validateIR(withDocs).some((e) => e.includes('documents.roles.constitution must be a non-empty path string'))).toBe(true);
  });
});

describe('applyDocumentAutoGate — the §II.9.1 keystone', () => {
  const baseIr = (documents?: AutonomyIR['documents'], riskPaths?: string[]): AutonomyIR => ({
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents: { pm: agent() },
    policy: { box: riskPaths ? { risk: { human_required_paths: riskPaths } } : {} },
    resources: [],
    ...(documents ? { documents } : {}),
  });

  test('no documents block → policy.box is untouched (no spurious risk/human_required_paths key)', () => {
    const irNoDocs = baseIr();
    applyDocumentAutoGate(irNoDocs);
    expect(irNoDocs.policy.box).toEqual({});
  });

  test('adds exactly vision + constitution to human_required_paths — never roadmap (the strategist\'s medium)', () => {
    const irWithRoles = baseIr({ roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md', roadmap: '.open-autonomy/roadmap.yml' } });
    applyDocumentAutoGate(irWithRoles);
    const paths = (irWithRoles.policy.box.risk as { human_required_paths: string[] }).human_required_paths;
    expect(paths.sort()).toEqual(['docs/CONSTITUTION.md', 'docs/VISION.md']);
    expect(paths).not.toContain('.open-autonomy/roadmap.yml');
  });

  test('vision alone (no constitution) gates only vision', () => {
    const irVisionOnly = baseIr({ roles: { vision: 'docs/VISION.md' } });
    applyDocumentAutoGate(irVisionOnly);
    expect((irVisionOnly.policy.box.risk as { human_required_paths: string[] }).human_required_paths).toEqual(['docs/VISION.md']);
  });

  test('no-dup: a role path already present in human_required_paths is not duplicated', () => {
    const irAlreadyGated = baseIr(
      { roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' } },
      ['docs/CONSTITUTION.md', 'some/other/path.ts'],
    );
    applyDocumentAutoGate(irAlreadyGated);
    const paths = (irAlreadyGated.policy.box.risk as { human_required_paths: string[] }).human_required_paths;
    expect(paths.filter((p) => p === 'docs/CONSTITUTION.md')).toHaveLength(1);
    expect(paths.sort()).toEqual(['docs/CONSTITUTION.md', 'docs/VISION.md', 'some/other/path.ts'].sort());
  });

  test('parseIr wires the auto-gate in automatically for any real compile path', () => {
    const parsed = parseIr(
      [
        'schema: autonomy.ir.v1',
        'targets: [gh-actions]',
        'agents:',
        '  pm: { behavior: skills/pm, capabilities: [tasks:converse], triggers: [{ cron: "0 0 * * *" }] }',
        'documents:',
        '  roles:',
        '    vision: docs/VISION.md',
        '    constitution: docs/CONSTITUTION.md',
        'policy: { box: {} }',
        'resources: []',
      ].join('\n'),
    );
    expect((parsed.policy.box.risk as { human_required_paths: string[] }).human_required_paths.sort()).toEqual([
      'docs/CONSTITUTION.md',
      'docs/VISION.md',
    ]);
  });
});
