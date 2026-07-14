import { describe, expect, test } from 'bun:test';
import { ArtifactMigrationRegistry, type MigrationEdge, type ReplayVersionPin } from './organization-migrate';

const v1to2: MigrationEdge = {
  id: 'organization.v1-to-v2', kind: 'organization', from: 'v1', to: 'v2',
  migrate(input) {
    const source = input as { schema: string; agents: Record<string, unknown> };
    return {
      document: { schema: 'v2', actors: structuredClone(source.agents) },
      dispositions: [
        { source: '/schema', target: '/schema', disposition: 'transformed', explanation: 'version marker' },
        { source: '/agents', target: '/actors', disposition: 'renamed' },
      ],
      sourceMap: [{ output: 'compiler:/v2/actors', sources: [{ location: 'mem:/v1.yml', path: '/agents' }] }],
    };
  },
  validate(document) { return (document as { schema?: string }).schema === 'v2' ? [] : ['schema must be v2']; },
};

describe('P4 artifact versioning and migration', () => {
  test('plans and applies a deterministic validated migration without mutating input', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    const input = { schema: 'v1', agents: { worker: { kind: 'agent' } } };
    const result = registry.migrate('organization', 'v1', 'v2', input);
    expect(result.errors).toEqual([]);
    expect(result.plan).toEqual({ kind: 'organization', from: 'v1', to: 'v2', steps: ['organization.v1-to-v2'], lossy: false });
    expect(result.document).toEqual({ schema: 'v2', actors: input.agents });
    expect(input).toHaveProperty('agents');
    expect(result.dispositions.map((item) => item.disposition)).toEqual(['transformed', 'renamed']);
  });

  test('handles current version as a deterministic no-op and rejects absent future paths', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    const current = { schema: 'v2', actors: {} };
    const noop = registry.migrate('organization', 'v2', 'v2', current);
    expect(noop).toMatchObject({ document: current, plan: { steps: [], lossy: false }, dispositions: [], errors: [] });
    expect(registry.migrate('organization', 'v2', 'v99', current).errors)
      .toEqual(['OA-MIGRATION-NO-PATH: organization v2 -> v99']);
    expect(registry.migrate('state', 'v1', 'v2', current).errors)
      .toEqual(['OA-MIGRATION-NO-PATH: state v1 -> v2']);
  });

  test('requires explicit authorization for loss and accounts for removed fields', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    registry.register({
      id: 'organization.v2-to-v3', kind: 'organization', from: 'v2', to: 'v3', lossy: true,
      migrate(input) {
        const source = input as { actors: unknown };
        return { document: { schema: 'v3', actors: source.actors }, dispositions: [
          { source: '/schema', target: '/schema', disposition: 'transformed' },
          { source: '/actors', target: '/actors', disposition: 'preserved' },
        ] };
      },
    });
    expect(registry.migrate('organization', 'v1', 'v3', { schema: 'v1', agents: {} }).errors)
      .toEqual(['OA-MIGRATION-LOSS-NOT-AUTHORIZED: organization v1 -> v3']);
    expect(registry.migrate('organization', 'v1', 'v3', { schema: 'v1', agents: {} }, { allowLossy: true }).errors).toEqual([]);

    const incomplete = new ArtifactMigrationRegistry();
    incomplete.register({
      id: 'profile.drop', kind: 'profile', from: 'v1', to: 'v2',
      migrate: () => ({ document: { schema: 'v2' }, dispositions: [{ source: '/schema', target: '/schema', disposition: 'transformed' }] }),
    });
    expect(incomplete.migrate('profile', 'v1', 'v2', { schema: 'v1', template: {} }).errors)
      .toEqual(['OA-MIGRATION-UNACCOUNTED-REMOVAL profile.drop: /template']);
  });

  test('chooses a stable shortest path and rejects duplicate edges', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    const edge = (id: string, from: string, to: string): MigrationEdge => ({
      id, kind: 'organization', from, to,
      migrate: (document) => ({ document, dispositions: [{ source: '/schema', target: '/schema', disposition: 'preserved' }] }),
    });
    registry.register(edge('b-v2-v3', 'v2', 'v3'));
    registry.register(edge('a-v2-v3-direct', 'v2', 'v3-direct'));
    expect(registry.plan('organization', 'v1', 'v3')?.steps).toEqual(['organization.v1-to-v2', 'b-v2-v3']);
    expect(() => registry.register(edge('duplicate-route', 'v1', 'v2'))).toThrow('already registered');
  });

  test('round-trips a migration that claims lossless renaming', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    registry.register({
      id: 'organization.v2-to-v1', kind: 'organization', from: 'v2', to: 'v1',
      migrate(input) {
        const source = input as { schema: string; actors: Record<string, unknown> };
        return { document: { schema: 'v1', agents: structuredClone(source.actors) }, dispositions: [
          { source: '/schema', target: '/schema', disposition: 'transformed' },
          { source: '/actors', target: '/agents', disposition: 'renamed' },
        ] };
      },
    });
    const original = { schema: 'v1', agents: { worker: { kind: 'agent' } } };
    const forward = registry.migrate('organization', 'v1', 'v2', original);
    const backward = registry.migrate('organization', 'v2', 'v1', forward.document);
    expect(backward.errors).toEqual([]);
    expect(backward.document).toEqual(original);
  });

  test('returns no partial document when a later step fails', () => {
    const registry = new ArtifactMigrationRegistry(); registry.register(v1to2);
    registry.register({
      id: 'organization.broken', kind: 'organization', from: 'v2', to: 'broken',
      migrate() { throw new Error('boom'); },
    });
    const result = registry.migrate('organization', 'v1', 'broken', { schema: 'v1', agents: {} });
    expect(result.document).toBeUndefined();
    expect(result.errors).toEqual(['OA-MIGRATION-STEP-FAILED organization.broken: boom']);
  });

  test('pins every version needed to interpret historical operational evidence', () => {
    const pin: ReplayVersionPin = {
      organizationDigest: 'sha256:org', eventSchema: 'autonomy.event.v1',
      reducerVersion: 'oa-state-reducer-v1', compilerVersion: 'oa-compiler-v2',
    };
    expect(Object.keys(pin).sort()).toEqual(['compilerVersion', 'eventSchema', 'organizationDigest', 'reducerVersion']);
  });
});
