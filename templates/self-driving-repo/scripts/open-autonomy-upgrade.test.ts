import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyUpgradePlan, buildUpgradePlan } from './open-autonomy-upgrade.js';

describe('open autonomy template upgrade', () => {
  test('plans and applies managed template updates', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-'));
    const template = join(root, 'template');
    const target = join(root, 'target');
    mkdirSync(join(template, 'scripts'), { recursive: true });
    mkdirSync(join(template, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(target, 'scripts'), { recursive: true });
    mkdirSync(join(target, '.github', 'workflows'), { recursive: true });

    writeFileSync(join(template, 'scripts', 'public-agent-policy.ts'), 'new policy\n');
    writeFileSync(join(template, '.github', 'workflows', 'public-agent.yml'), 'new workflow\n');
    writeFileSync(join(target, 'scripts', 'public-agent-policy.ts'), 'old policy\n');
    writeFileSync(join(target, '.github', 'workflows', 'old.yml'), 'old workflow\n');
    writeFileSync(join(target, '.github', 'workflows', 'deploy.yml'), 'target-owned workflow\n');

    const plan = buildUpgradePlan(template, target);
    expect(plan.changes).toContainEqual({ path: 'scripts/public-agent-policy.ts', action: 'update' });
    expect(plan.changes).toContainEqual({ path: '.github/workflows/public-agent.yml', action: 'add' });
    expect(plan.changes).not.toContainEqual({ path: '.github/workflows/old.yml', action: 'delete' });
    expect(plan.changes).not.toContainEqual({ path: '.github/workflows/deploy.yml', action: 'delete' });

    applyUpgradePlan(plan);
    expect(readFileSync(join(target, 'scripts', 'public-agent-policy.ts'), 'utf8')).toBe('new policy\n');
    expect(readFileSync(join(target, '.github', 'workflows', 'public-agent.yml'), 'utf8')).toBe('new workflow\n');
    expect(readFileSync(join(target, '.github', 'workflows', 'old.yml'), 'utf8')).toBe('old workflow\n');
    expect(readFileSync(join(target, '.github', 'workflows', 'deploy.yml'), 'utf8')).toBe('target-owned workflow\n');
  });

  test('propagates agent skills but never overwrites local roadmap or constitution', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-seed-'));
    const template = join(root, 'template');
    const target = join(root, 'target');
    mkdirSync(join(template, '.codex', 'skills', 'open-autonomy-strategist'), { recursive: true });
    mkdirSync(join(template, '.open-autonomy'), { recursive: true });
    mkdirSync(join(template, 'docs'), { recursive: true });
    mkdirSync(join(target, '.open-autonomy'), { recursive: true });
    mkdirSync(join(target, 'docs'), { recursive: true });

    writeFileSync(join(template, '.codex', 'skills', 'open-autonomy-strategist', 'SKILL.md'), 'strategist\n');
    writeFileSync(join(template, '.open-autonomy', 'roadmap.yml'), 'template roadmap\n');
    writeFileSync(join(template, 'docs', 'CONSTITUTION.md'), 'template constitution\n');
    // target already has its own roadmap and constitution
    writeFileSync(join(target, '.open-autonomy', 'roadmap.yml'), 'local roadmap\n');
    writeFileSync(join(target, 'docs', 'CONSTITUTION.md'), 'local constitution\n');

    const plan = buildUpgradePlan(template, target);
    // skill propagates (add); local-owned files are not overwritten
    expect(plan.changes).toContainEqual({ path: '.codex/skills/open-autonomy-strategist/SKILL.md', action: 'add' });
    expect(plan.changes).not.toContainEqual({ path: '.open-autonomy/roadmap.yml', action: 'update' });
    expect(plan.changes).not.toContainEqual({ path: 'docs/CONSTITUTION.md', action: 'update' });

    applyUpgradePlan(plan);
    expect(readFileSync(join(target, '.codex', 'skills', 'open-autonomy-strategist', 'SKILL.md'), 'utf8')).toBe('strategist\n');
    expect(readFileSync(join(target, '.open-autonomy', 'roadmap.yml'), 'utf8')).toBe('local roadmap\n');
    expect(readFileSync(join(target, 'docs', 'CONSTITUTION.md'), 'utf8')).toBe('local constitution\n');
  });

  test('seeds local-owned files when missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-seed-missing-'));
    const template = join(root, 'template');
    const target = join(root, 'target');
    mkdirSync(join(template, 'docs'), { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(template, 'docs', 'CONSTITUTION.md'), 'template constitution\n');

    const plan = buildUpgradePlan(template, target);
    expect(plan.changes).toContainEqual({ path: 'docs/CONSTITUTION.md', action: 'add' });
    applyUpgradePlan(plan);
    expect(readFileSync(join(target, 'docs', 'CONSTITUTION.md'), 'utf8')).toBe('template constitution\n');
  });

  test('fails closed when the template is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-missing-'));
    const target = join(root, 'target');
    mkdirSync(target, { recursive: true });
    expect(() => buildUpgradePlan(join(root, 'missing-template'), target)).toThrow('template directory does not exist');
  });
});
