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

  test('fails closed when the template is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-upgrade-missing-'));
    const target = join(root, 'target');
    mkdirSync(target, { recursive: true });
    expect(() => buildUpgradePlan(join(root, 'missing-template'), target)).toThrow('template directory does not exist');
  });
});
