import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseIr } from '@open-autonomy/core';
import { compileLocal } from './emit';

const ROOT = join(import.meta.dir, '..', '..', '..');
const PROFILE = join(ROOT, 'profiles', 'simple-gh');

describe('simple-gh — clean compiled role system', () => {
  test('compiles Manager, Planner, Kaizen, and human Maintainer with disjoint fences', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const out = compileLocal(ir, {
      scheduleConfig: {
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { fence: '.open-autonomy/paused', retrySeconds: 300 },
        agents: {
          planner: { fence: '.open-autonomy/audits-paused', retrySeconds: 3600 },
          kaizen: { fence: '.open-autonomy/audits-paused', retrySeconds: 3600 },
        },
      },
    });

    const manifest = parseYaml(out.generated['.open-autonomy/autonomy.yml']) as {
      agents: Record<string, { kind?: string; capabilities?: string[] }>;
      skills: Record<string, string>;
      policy: Record<string, unknown>;
    };
    expect(Object.keys(manifest.agents)).toEqual(['manager', 'planner', 'kaizen', 'maintainer']);
    expect(manifest.agents.maintainer?.kind).toBe('human');
    expect(manifest.skills).toEqual({
      manager: '.codex/skills/manager',
      planner: '.codex/skills/planner',
      kaizen: '.codex/skills/kaizen',
    });
    expect(manifest.agents.manager?.capabilities).toContain('agent:launch@maintainer');
    expect(manifest.policy).toMatchObject({
      tracker: { tool: 'npx ztrack' },
      taskStates: { open: 'draft', ready: 'ready', inputRequired: 'human-required' },
      maxConcurrent: 1,
    });

    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as {
      maxConcurrent: number;
      jobs: Array<{ name: string; agent?: string; fence?: string; workspace?: string; command: string; retrySeconds: number }>;
    };
    expect(schedule.maxConcurrent).toBe(1);
    expect(schedule.jobs.filter((job) => job.agent).map((job) => job.name)).toEqual(['manager', 'planner', 'kaizen']);
    expect(schedule.jobs.find((job) => job.name === 'manager')).toMatchObject({
      fence: '.open-autonomy/paused',
      workspace: 'isolated',
      retrySeconds: 300,
    });
    for (const name of ['planner', 'kaizen']) {
      expect(schedule.jobs.find((job) => job.name === name)).toMatchObject({
        fence: '.open-autonomy/audits-paused',
        workspace: 'isolated',
        retrySeconds: 3600,
      });
    }
    expect(schedule.jobs.every((job) => typeof job.fence === 'string' && job.fence.length > 0)).toBe(true);

    const installedSkills = out.copies.map(({ to }) => to).filter((path) => path.includes('/skills/'));
    expect(installedSkills).toEqual([
      '.codex/skills/manager/SKILL.md', '.claude/skills/manager/SKILL.md',
      '.codex/skills/planner/SKILL.md', '.claude/skills/planner/SKILL.md',
      '.codex/skills/kaizen/SKILL.md', '.claude/skills/kaizen/SKILL.md',
      '.codex/skills/maintainer/SKILL.md', '.claude/skills/maintainer/SKILL.md',
    ]);
  });

  test('keeps task and role semantics out of scheduler source', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const scheduler = compileLocal(ir).generated['scheduler/run.mjs'];
    expect(scheduler).not.toMatch(/\bztrack\b|\bmanager\b|\bplanner\b|\bkaizen\b|gh\s+(?:issue|pr)/);
  });
});
