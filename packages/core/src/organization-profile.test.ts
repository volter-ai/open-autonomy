import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { instantiateProfile, type OrganizationProfileIR } from './organization-profile';
import { parseOrganizationProfile } from './organization-ir-yaml';
import { lowerOrganizationToV1 } from './organization-compile';

describe('autonomy.profile.v1', () => {
  const profile = () => parseOrganizationProfile(readFileSync('docs/examples/coding-team.profile.yml', 'utf8'));

  test('instantiates typed parameters into a valid OrganizationIR', () => {
    const result = instantiateProfile(profile(), { teamName: 'compiler-team', concurrency: 12 });
    expect(result.errors).toEqual([]);
    expect(result.organization?.name).toBe('compiler-team');
    expect(result.organization?.actors.coders.capacity?.concurrent).toBe(12);
    expect(result.organization?.workTypes?.change.assignment?.mode).toBe('lease');
  });

  test('applies matching variants deterministically', () => {
    const result = instantiateProfile(profile(), { teamName: 'fast-team', assignmentMode: 'direct', strictReview: false });
    expect(result.variants).toEqual(['relaxed-review', 'direct-assignment']);
    expect(result.organization?.workTypes?.change.verification?.independent).toBe(false);
    expect(result.organization?.workTypes?.change.assignment?.exclusive).toBeUndefined();
  });

  test('makes overlapping patch order observable with deterministic last-writer semantics', () => {
    const ordered = profile();
    ordered.variants = {
      first: { when: [{ parameter: 'strictReview', operator: 'eq', value: true }], patches: [{ operation: 'set', path: '/name', value: 'first' }] },
      second: { when: [{ parameter: 'strictReview', operator: 'eq', value: true }], patches: [{ operation: 'set', path: '/name', value: 'second' }] },
    };
    const forward = instantiateProfile(ordered, { teamName: 'base' });
    ordered.variants = { second: ordered.variants.second, first: ordered.variants.first };
    const reverse = instantiateProfile(ordered, { teamName: 'base' });
    expect(forward.variants).toEqual(['first', 'second']);
    expect(forward.organization?.name).toBe('second');
    expect(reverse.variants).toEqual(['second', 'first']);
    expect(reverse.organization?.name).toBe('first');
  });

  test('rejects missing, unknown, incorrectly typed, and out-of-range parameters', () => {
    expect(instantiateProfile(profile()).errors).toContain("parameter 'teamName' is required");
    expect(instantiateProfile(profile(), { teamName: 'ok', ghost: true }).errors).toContain("unknown parameter 'ghost'");
    expect(instantiateProfile(profile(), { teamName: 'ok', concurrency: 'many' }).errors).toContain("parameter 'concurrency' must be integer");
    expect(instantiateProfile(profile(), { teamName: 'ok', concurrency: 101 }).errors).toContain("parameter 'concurrency' must be <= 100");
  });

  test('does not replace an explicitly supplied null with a default', () => {
    const nullable = profile();
    nullable.parameters = {
      ...nullable.parameters,
      label: { type: 'string', default: 'default-label' },
    };
    const result = instantiateProfile(nullable, { teamName: 'ok', label: null });
    expect(result.errors).toContain("parameter 'label' must be string");
    expect(result.parameters.label).toBeNull();
  });

  test('returns an instantiation error instead of throwing for an unbound template placeholder', () => {
    const unbound = profile();
    unbound.template.name = '${{ params.notDeclared }}';
    expect(() => instantiateProfile(unbound, { teamName: 'ok' })).not.toThrow();
    expect(instantiateProfile(unbound, { teamName: 'ok' }).errors).toContain("unbound profile parameter 'notDeclared'");
  });

  test('rejects a patch whose path cannot be realized', () => {
    const broken: OrganizationProfileIR = {
      ...profile(),
      variants: { broken: { when: [{ parameter: 'strictReview', operator: 'eq', value: true }], patches: [{ operation: 'set', path: '/missing/value', value: true }] } },
    };
    expect(instantiateProfile(broken, { teamName: 'ok' }).errors.some((x) => x.includes('patch path does not exist'))).toBe(true);
  });

  test('an instantiated profile flows through substrate solving and v1 lowering', () => {
    const instantiated = instantiateProfile(profile(), { teamName: 'lowered-team', concurrency: 3 });
    const organization = instantiated.organization!;
    const provides = Object.fromEntries([
      'actors.identity', 'actors.behavior', 'actors.activation', 'actors.capacity', 'authority.capabilities', 'work.types',
    ].map((feature) => [feature, { realization: 'native' as const }]));
    const result = lowerOrganizationToV1(organization, {
      deployment: { schema: 'autonomy.deployment.v1', name: 'test', providers: { runtime: { component: 'test-runtime' } } },
      components: { 'test-runtime': { id: 'test-runtime', provides } },
      targets: ['local'],
      actors: {
        manager: { behavior: 'manager', capabilities: ['tasks:author', 'agent:launch'], triggers: [{ cron: '*/5 * * * *' }] },
        coders: { behavior: 'coder', capabilities: ['code:propose'], triggers: [{ dispatch: true }], review: 'reviewer' },
        reviewer: { behavior: 'reviewer', capabilities: ['code:review'], triggers: [{ dispatch: true }] },
      },
      policy: { maxConcurrent: 3, box: {} },
    });
    expect(result.compatibility.status).toBe('compatible');
    expect(result.errors).toEqual([]);
    expect(result.ir?.policy.maxConcurrent).toBe(3);
  });
});
