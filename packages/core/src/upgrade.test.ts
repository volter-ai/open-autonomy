import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompileOutput } from './ir';
import { planUpgrade, applyUpgrade } from './upgrade';

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

  test('prunes orphaned derived files (opt-in), but never runtime state outside derived dirs', () => {
    const { profile, target } = dirs();
    write(target, 'scripts/agent-upgrade.ts', 'retired orchestrator\n'); // orphan in a derived dir
    write(target, '.github/workflows/open-autonomy-upgrade.yml', 'retired workflow\n'); // orphan
    write(target, '.open-autonomy/strategist-archive.json', '{"runtime":true}\n'); // runtime state — keep
    const out: CompileOutput = {
      generated: { 'scripts/agent-pm.ts': 'pm\n' },
      copies: [],
    };
    const plan = planUpgrade(out, profile, target, { prune: true });
    expect(plan.changes).toContainEqual({ path: 'scripts/agent-upgrade.ts', action: 'delete' });
    expect(plan.changes).toContainEqual({ path: '.github/workflows/open-autonomy-upgrade.yml', action: 'delete' });
    expect(plan.changes.find((c) => c.path === '.open-autonomy/strategist-archive.json')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, 'scripts/agent-upgrade.ts'))).toBe(false);
    expect(existsSync(join(target, '.github/workflows/open-autonomy-upgrade.yml'))).toBe(false);
    expect(existsSync(join(target, '.open-autonomy/strategist-archive.json'))).toBe(true);
  });

  test('does NOT prune by default — hand-authored files in derived dirs survive', () => {
    const { profile, target } = dirs();
    write(target, 'scripts/my-dev-tool.ts', 'hand-authored, not from the compile\n');
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target); // no { prune: true }
    expect(plan.changes.find((c) => c.action === 'delete')).toBeUndefined();
    applyUpgrade(plan, out, profile, target);
    expect(existsSync(join(target, 'scripts/my-dev-tool.ts'))).toBe(true); // not deleted
  });

  test('no changes when the install already matches the compile', () => {
    const { profile, target } = dirs();
    write(target, 'scripts/agent-pm.ts', 'pm\n');
    const out: CompileOutput = { generated: { 'scripts/agent-pm.ts': 'pm\n' }, copies: [] };
    const plan = planUpgrade(out, profile, target);
    expect(plan.changes).toEqual([]);
    expect(plan.notes[0]).toContain('up to date');
  });
});
