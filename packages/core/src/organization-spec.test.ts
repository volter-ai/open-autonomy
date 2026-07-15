import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseOrganizationIr } from './organization-ir-yaml';

const spec = readFileSync('docs/ORGANIZATION-IR-SPEC.md', 'utf8');

describe('R1 normative Organization IR specification', () => {
  test('publishes every required semantic domain and explicit normative/informative boundaries', () => {
    for (const term of ['MUST', 'denotation', 'Defaults and absence', 'Identity, equality, and equivalence',
      'Composition algebra', 'Events and state', 'Versions, extensions, and migration', 'Lowering and assurance',
      'Unsupported and implementation-defined domains', 'Informative architecture guidance']) expect(spec).toContain(term);
    expect(spec).toContain('ORGANIZATION-IR-FIELD-SEMANTICS.md');
    expect(spec).toContain('organization-ir.ts');
  });

  test('keeps the generated field appendix byte-stable', () => {
    const before = readFileSync('docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', 'utf8');
    const result = spawnSync('bun', ['scripts/generate-organization-field-semantics.ts'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(readFileSync('docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', 'utf8')).toBe(before);
  });

  test('keeps the generated closed schema byte-stable', () => {
    const path = 'packages/core/src/generated/organization-ir-v2.schema.json';
    const before = readFileSync(path, 'utf8');
    const result = spawnSync('bun', ['scripts/generate-organization-schema.ts'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('executes the positive and wrong-sort negative examples', () => {
    expect(() => parseOrganizationIr(readFileSync('docs/examples/autonomous-coding-org.v2.yml', 'utf8'))).not.toThrow();
    expect(() => parseOrganizationIr(readFileSync('docs/examples/invalid/wrong-sort-reference.v2.yml', 'utf8'))).toThrow("unknown behavior 'implement'");
  });

  test('rejects malformed scalars and unknown members before semantic coercion', () => {
    const base = `schema: autonomy.organization.v2\nname: malformed\nbehaviors:\n  work:\n    kind: skill\n    inline: {}\nactors:\n  worker:\n    kind: agent\n    behaviors: [work]\n`;
    expect(() => parseOrganizationIr(`${base}budgets:\n  main:\n    resource: tokens\n    limit: "2"\n    unit: tokens\n`)).toThrow('/budgets/main/limit: must be number');
    expect(() => parseOrganizationIr(`${base}mystery: true\n`)).toThrow("unknown member 'mystery'");
  });

  test('rejects the reviewed graph and reference gaps', () => {
    const base = `schema: autonomy.organization.v2\nname: gaps\ntypes:\n  text:\n    schema: { type: string }\nbehaviors:\n  work:\n    kind: skill\n    inline: {}\nactors:\n  worker:\n    kind: agent\n    behaviors: [work]\n`;
    expect(() => parseOrganizationIr(`${base}budgets:\n  a: { resource: tokens, limit: 1, unit: token, parent: b }\n  b: { resource: tokens, limit: 1, unit: token, parent: a }\n`)).toThrow("budgets.a: parent cycle includes 'a'");
    expect(() => parseOrganizationIr(base.replace('inline: {}', 'inline: {}\n    inputs: { request: absent }'))).toThrow("unknown type 'absent'");
    expect(() => parseOrganizationIr(`${base}goals:\n  ship:\n    statement: Ship\n    measures:\n      - { name: quality, type: absent }\n`)).toThrow("unknown type 'absent'");
  });

  test('rejects duplicate lifecycle edges, invalid namespaces, and incoherent protocols', () => {
    const base = `schema: autonomy.organization.v2\nname: static-rules\nbehaviors:\n  work: { kind: skill, inline: {} }\nactors:\n  worker: { kind: agent, behaviors: [work] }\n`;
    const lifecycle = `${base}workTypes:\n  task:\n    lifecycle:\n      initial: queued\n      terminal: [done]\n      states: { queued: {}, done: {} }\n      transitions:\n        - { from: queued, to: done, event: finish }\n        - { from: queued, to: done, event: finish }\n`;
    expect(() => parseOrganizationIr(lifecycle)).toThrow('duplicate edge');
    const duplicateBehavior = `schema: autonomy.organization.v2\nname: duplicate-behavior\nbehaviors:\n  root: { kind: composite, behaviors: [leaf, leaf] }\n  leaf: { kind: skill, inline: {} }\nactors:\n  worker: { kind: agent, behaviors: [root] }\n`;
    expect(() => parseOrganizationIr(duplicateBehavior)).toThrow("duplicate 'leaf'");
    expect(() => parseOrganizationIr(`${base}imports:\n  lib: { source: { uri: lib }, namespace: "bad space" }\n`)).toThrow('invalid namespace');
    expect(() => parseOrganizationIr(`${base}imports:\n  one: { source: { uri: one }, namespace: shared }\n  two: { source: { uri: two }, namespace: shared }\n`)).toThrow("duplicate namespace 'shared'");
    expect(() => parseOrganizationIr(`${base}protocols:\n  review:\n    roles: [author]\n    messages:\n      submit: { from: author, to: reviewer }\n`)).toThrow("unknown role 'reviewer'");
  });

  test('rejects duplicate keys, aliases, anchors, and non-finite scalars at the YAML boundary', () => {
    const valid = `schema: autonomy.organization.v2\nname: yaml\nbehaviors:\n  work:\n    kind: skill\n    inline: {}\nactors:\n  worker:\n    kind: agent\n    behaviors: [work]\n`;
    expect(() => parseOrganizationIr(`${valid}name: duplicate\n`)).toThrow('Map keys must be unique');
    expect(() => parseOrganizationIr(valid.replace('inline: {}', 'inline: &body {}'))).toThrow('anchor');
    expect(() => parseOrganizationIr(valid.replace('name: yaml', 'name: !!str yaml'))).toThrow('explicit tag');
    expect(() => parseOrganizationIr(valid.replace('inline: {}', 'inline: .inf'))).toThrow('non-finite');
  });
});
