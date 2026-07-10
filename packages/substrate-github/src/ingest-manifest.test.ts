import { describe, expect, test } from 'bun:test';
import { emitAutonomy, type AutonomyIR } from '@open-autonomy/core';
import { ingestAutonomy } from './ingest-manifest';

// U2 (supercode study §II.9.1) — verifies the emission shape chosen in manifest.ts (`documents: {
// resources, roles }`, roles NESTED under `documents`) actually round-trips through ingest-manifest.ts's
// `collectDocPaths`, which flattens the (possibly nested) `documents` map into a plain resource list. That
// flattener predates `documents.roles` and has no special-case for it — the nesting choice is exactly what
// makes it pick up role paths as ordinary doc paths for free.
function irWith(documents?: AutonomyIR['documents'], resources: string[] = ['README.md']): AutonomyIR {
  return {
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '* * * * *' }] } },
    policy: { box: {} },
    resources,
    ...(documents ? { documents } : {}),
  };
}

describe('emitAutonomy → ingestAutonomy — documents.roles round-trip', () => {
  test('no roles declared: ingest is unaffected (pre-U2 behavior)', () => {
    const manifest = emitAutonomy(irWith());
    const back = ingestAutonomy(manifest);
    expect(back.resources).toEqual(['README.md']);
    expect(back.documents).toBeUndefined();
  });

  test('a declared role map: every role PATH round-trips into resources (a flattener that never heard of roles still carries the files)', () => {
    const manifest = emitAutonomy(
      irWith({ roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md', roadmap: '.open-autonomy/roadmap.yml' } }),
    );
    const back = ingestAutonomy(manifest);
    expect(back.resources).toEqual(['.open-autonomy/roadmap.yml', 'README.md', 'docs/CONSTITUTION.md', 'docs/VISION.md'].sort());
  });

  test('a declared role map: the role LABELS also reconstruct (full fidelity for a decompile → recompile cycle)', () => {
    const manifest = emitAutonomy(irWith({ roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' } }));
    const back = ingestAutonomy(manifest);
    expect(back.documents).toEqual({ roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' } });
  });

  test('a manifest hand-authored with a malformed roles block (no vision) yields resources only, no documents field', () => {
    // Simulates a manifest some other tool wrote directly (not through emitAutonomy, which would refuse to
    // construct this via validateIR upstream) — ingestAutonomy must not fabricate an invalid roles block.
    const manifest = emitAutonomy(irWith()); // start from a clean manifest
    manifest.documents = { resources: ['README.md'], roles: { constitution: 'docs/CONSTITUTION.md' } as never };
    const back = ingestAutonomy(manifest);
    expect(back.documents).toBeUndefined();
    expect(back.resources).toContain('docs/CONSTITUTION.md'); // the path still carries as a plain resource
  });

  test('resources + roles paths dedupe when the same file appears in both (collectDocPaths already deduped)', () => {
    const manifest = emitAutonomy(irWith({ roles: { vision: 'docs/VISION.md' } }, ['docs/VISION.md', 'README.md']));
    const back = ingestAutonomy(manifest);
    expect(back.resources.filter((p) => p === 'docs/VISION.md')).toHaveLength(1);
  });
});
