import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompileOutput } from './ir';
import { planUpgrade, applyUpgrade, isInstallOwned, INSTALL_OWNED_PATHS } from './upgrade';

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-'));
  const profile = join(root, 'profile');
  const target = join(root, 'target');
  mkdirSync(profile, { recursive: true });
  mkdirSync(target, { recursive: true });
  return { profile, target };
}
function write(dir: string, path: string, content: string) {
  const full = join(dir, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('upgrade = recompile (regenerate derived, keep owned inputs, prune orphans)', () => {
  test('regenerates derived files: add new, update changed', () => {
    const { profile, target } = dirs();
    write(target, '.github/workflows/pm.yml', 'old pm\n');
    const out: CompileOutput = {
      generated: { '.github/workflows/pm.yml': 'new pm\n', '.github/workflows/reviewer.yml': 'new reviewer\n' },
      copies: [],
    };
    const plan = planUpgrade(out, profile, target);
    expect(plan.changes).toContainEqual({ path: '.github/workflows/pm.yml', action: 'update' });
    expect(plan.changes).toContainEqual({ path: '.github/workflows/reviewer.yml', action: 'add' });
    applyUpgrade(plan, out, profile, target);
    expect(readFileSync(join(target, '.github/workflows/pm.yml'), 'utf8')).toBe('new pm\n');
    expect(readFileSync(join(target, '.github/workflows/reviewer.yml'), 'utf8')).toBe('new reviewer\n');
  });

  test('install-owned inputs: seed if missing, NEVER overwrite an existing one', () => {
    const { profile, target } = dirs();
    write(profile, 'README.md', 'TEMPLATE readme\n');
    write(profile, '.open-autonomy/roadmap.yml', 'template roadmap\n');
    write(target, '.open-autonomy/roadmap.yml', 'MY roadmap\n'); // install already owns this
    const out: CompileOutput = {
      generated: {},
      copies: [
        { from: 'README.md', to: 'README.md' },
        { from: '.open-autonomy/roadmap.yml', to: '.open-autonomy/roadmap.yml' },
      ],
    };
    const plan = planUpgrade(out, profile, target);
    expect(plan.changes).toContainEqual({ path: 'README.md', action: 'add' }); // missing -> seeded
    expect(plan.changes.find((c) => c.path === '.open-autonomy/roadmap.yml')).toBeUndefined(); // present -> untouched
    applyUpgrade(plan, out, profile, target);
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('TEMPLATE readme\n');
    expect(readFileSync(join(target, '.open-autonomy/roadmap.yml'), 'utf8')).toBe('MY roadmap\n');
  });

  // The prior install's manifest is the provenance: prune may only delete paths it lists.
  const priorManifest = (files: string[]) =>
    JSON.stringify({ schema: 'open-autonomy.generated.v1', files }, null, 2);

  test('prunes manifest-listed orphans (opt-in), but never files outside the manifest', () => {
    const { profile, target } = dirs();
    // The PRIOR install generated these (recorded in its manifest):
    write(target, '.open-autonomy/generated.json', priorManifest(['scripts/agent-pm.ts', 'scripts/agent-upgrade.ts', '.github/workflows/open-autonomy-upgrade.yml']));
    write(target, 'scripts/agent-upgrade.ts', 'retired orchestrator\n'); // OA-generated, now orphaned
    write(target, '.github/workflows/open-autonomy-upgrade.yml', 'retired workflow\n'); // ditto
    write(target, 'scripts/my-dev-tool.ts', 'hand-authored — NOT in the manifest\n'); // must survive
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target, { prune: true });
    expect(plan.changes).toContainEqual({ path: 'scripts/agent-upgrade.ts', action: 'delete' });
    expect(plan.changes).toContainEqual({ path: '.github/workflows/open-autonomy-upgrade.yml', action: 'delete' });
    expect(plan.changes.find((c) => c.path === 'scripts/my-dev-tool.ts')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, 'scripts/agent-upgrade.ts'))).toBe(false);
    expect(existsSync(join(target, 'scripts/my-dev-tool.ts'))).toBe(true); // never in the manifest → untouchable
  });

  test('with no manifest, prune deletes NOTHING (legacy install / non-installation dir)', () => {
    const { profile, target } = dirs();
    write(target, 'scripts/my-dev-tool.ts', 'hand-authored, no manifest present\n');
    write(target, 'scripts/another.ts', 'also hand-authored\n');
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target, { prune: true }); // prune ON, but no manifest
    expect(plan.changes.find((c) => c.action === 'delete')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, 'scripts/my-dev-tool.ts'))).toBe(true);
    expect(existsSync(join(target, 'scripts/another.ts'))).toBe(true);
  });

  test('does NOT prune by default, even with a manifest present', () => {
    const { profile, target } = dirs();
    write(target, '.open-autonomy/generated.json', priorManifest(['scripts/agent-upgrade.ts']));
    write(target, 'scripts/agent-upgrade.ts', 'orphan, but prune not requested\n');
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target); // no { prune: true }
    expect(plan.changes.find((c) => c.action === 'delete')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, 'scripts/agent-upgrade.ts'))).toBe(true);
  });

  // The BL-8 migration shape: a script the prior compile GENERATED (runtime injection) that the new
  // compile carries as a profile-resource COPY at the same install path. `desired` is generated+copies
  // together, so the path is still produced → prune must not touch it (a delete here would rip a live
  // gate script out of every upgraded install).
  test('does NOT prune a manifest-listed path that moved from generated to a profile-carried copy', () => {
    const { profile, target } = dirs();
    write(target, '.open-autonomy/generated.json', priorManifest(['scripts/human-approval-gate.ts']));
    write(target, 'scripts/human-approval-gate.ts', 'gate v1 (was runtime-generated)\n');
    write(profile, 'scripts/human-approval-gate.ts', 'gate v2 (now a profile resource)\n');
    const out: CompileOutput = {
      generated: {},
      copies: [{ from: 'scripts/human-approval-gate.ts', to: 'scripts/human-approval-gate.ts' }],
    };
    const plan = planUpgrade(out, profile, target, { prune: true });
    expect(plan.changes.find((c) => c.action === 'delete')).toBeUndefined();
    expect(plan.changes).toContainEqual({ path: 'scripts/human-approval-gate.ts', action: 'update' });
    applyUpgrade(plan, out, profile, target);
    expect(readFileSync(join(target, 'scripts/human-approval-gate.ts'), 'utf8')).toBe(
      'gate v2 (now a profile resource)\n',
    );
  });

  test('no changes when the install already matches the compile', () => {
    const { profile, target } = dirs();
    write(target, 'scripts/agent-pm.ts', 'pm\n');
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target);
    expect(plan.changes).toEqual([]);
    expect(plan.notes[0]).toContain('up to date');
  });

  // OA-07: the local substrate's day-one pause marker. compileLocal (packages/substrate-local/src/emit.ts)
  // deliberately keeps it OUT of `.open-autonomy/generated.json`'s `files` list, so — regardless of this —
  // prune (below) can structurally never see it as an orphan to delete. INSTALL_OWNED_PATHS carries it too,
  // as the seed-once contract of record for any future generic-upgrade path.
  test('.open-autonomy/paused is declared install-owned (seed-once contract of record)', () => {
    expect(INSTALL_OWNED_PATHS).toContain('.open-autonomy/paused');
    expect(isInstallOwned('.open-autonomy/paused')).toBe(true);
  });

  test('a still-present paused marker is never pruned even if a manifest somehow listed it (belt-and-suspenders)', () => {
    const { profile, target } = dirs();
    // Simulate the worst case a future bug could produce: the marker ends up in the prior manifest anyway.
    write(target, '.open-autonomy/generated.json', priorManifest(['.open-autonomy/paused']));
    write(target, '.open-autonomy/paused', 'PAUSED — operator has not unpaused yet\n');
    const out: CompileOutput = { generated: {}, copies: [] }; // this compile does not produce it (not fresh)
    const plan = planUpgrade(out, profile, target, { prune: true });
    expect(plan.changes.find((c) => c.path === '.open-autonomy/paused')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, '.open-autonomy/paused'))).toBe(true); // never deleted — never silently unpaused
  });
});
