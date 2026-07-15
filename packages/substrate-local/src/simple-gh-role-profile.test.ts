import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseIr } from '@open-autonomy/core';
import { defaultAgentCommand } from '@termfleet/core/agent-launch.js';
import { compileLocal } from './emit';

const ROOT = join(import.meta.dir, '..', '..', '..');
const PROFILE = join(ROOT, 'profiles', 'simple-gh');
const ZTRACK_GATE = 'node_modules/ztrack/plugins/ztrack/hooks/stop-loop.sh';
const WISHY_WASHY_AGENT_LANGUAGE =
  /\b(?:when|where|if)\s+(?:supported|possible)\b|\bbest[- ]effort\b|\bsingle-model degradation\b|\bdegrades honestly\b/i;

function installedCopy(out: ReturnType<typeof compileLocal>, path: string): string {
  const copy = out.copies.find(({ to }) => to === path);
  if (!copy) throw new Error(`compiled profile did not install ${path}`);
  return readFileSync(join(PROFILE, copy.from), 'utf8');
}

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
      taskStates: { open: 'draft', ready: 'ready', review: 'in-review', inputRequired: 'human-required' },
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
    expect(out.copies).toContainEqual({ from: '.claude/settings.json', to: '.claude/settings.json' });
    expect(out.copies).toContainEqual({ from: '.codex/hooks.json', to: '.codex/hooks.json' });
  });

  test('installed Manager doctrine fails closed and pins the complete execution/review/landing contract', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const out = compileLocal(ir);
    const codexManager = installedCopy(out, '.codex/skills/manager/SKILL.md');
    const claudeManager = installedCopy(out, '.claude/skills/manager/SKILL.md');
    expect(claudeManager).toBe(codexManager);

    // No substrate allowance may weaken the agent-facing contract.
    expect(codexManager).not.toMatch(/when supported|when possible|otherwise[^\n]*degrad|single-model degradation/i);
    expect(codexManager).toContain('npx ztrack loop start "<task-id>" --until "<mapped-review-state>"');
    expect(codexManager).not.toContain('loop start "<task-id>" --until done');
    expect(codexManager).toContain('npx ztrack loop status');
    expect(codexManager).toMatch(/first actions inside that worktree, before\s+reading or mutating repository files/);
    expect(codexManager).toContain('Both commands must exit zero');
    expect(codexManager).toContain('this profile maps it to `in-review`');
    expect(codexManager).toMatch(/implement the acceptance criteria, run the relevant tests, commit, push, open or update the PR,\s+record AC evidence/);
    expect(codexManager).toMatch(/do not dispatch, substitute another tier, or reuse one model for both\s+roles/);

    // Safety/rework/landing rails remain explicit and durable in the installed prompt.
    expect(codexManager).toContain('.open-autonomy/paused');
    expect(codexManager).toContain('direct `.open-autonomy/paused` check is the mandatory fail-safe');
    expect(codexManager).toContain('oa-rework:<k> sha=<failed-head-sha>');
    expect(codexManager).toContain('if `k < 2`');
    expect(codexManager).toContain('At `k = 2`');
    expect(codexManager).toContain('every required repository check on exactly `HEAD_SHA`');
    expect(codexManager).toMatch(/review\s+is `pass` for exactly that same SHA/);
    expect(codexManager).toContain('gh pr merge "$PR_NUMBER" --squash');
  });

  test('every installed skill and launch prompt forbids substrate/model degradation language', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const out = compileLocal(ir);
    const artifacts = [
      ...out.copies
        .filter(({ to }) => to.includes('/skills/'))
        .map(({ from, to }) => ({ path: to, text: readFileSync(join(PROFILE, from), 'utf8') })),
      ...Object.entries(out.generated)
        .filter(([path]) => path.startsWith('scripts/prompts/'))
        .map(([path, text]) => ({ path, text })),
    ];

    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      expect(artifact.text, artifact.path).not.toMatch(WISHY_WASHY_AGENT_LANGUAGE);
    }
  });

  test('installed Claude and Codex artifacts enforce the same current Stop/SubagentStop gate', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const out = compileLocal(ir);
    const claude = installedCopy(out, '.claude/settings.json');
    const codex = installedCopy(out, '.codex/hooks.json');
    expect(codex).toBe(claude);
    expect(claude).not.toContain('plugins/ztrack-gate/');

    const parsed = JSON.parse(claude) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    expect(Object.keys(parsed.hooks).sort()).toEqual(['Stop', 'SubagentStop']);
    for (const event of ['Stop', 'SubagentStop']) {
      const commands = parsed.hooks[event]!.flatMap((entry) => entry.hooks.map((hook) => hook.command));
      expect(commands).toHaveLength(1);
      expect(commands[0]).toContain(ZTRACK_GATE);
      expect(commands[0]).toContain('exit 2');
    }
    expect(existsSync(join(ROOT, ZTRACK_GATE))).toBe(true);
  });

  test('the installed Termfleet Codex launch activates project hooks without interactive trust', () => {
    // Probe the exact @termfleet/core runtime dependency used by the provider, not a reimplemented command
    // string. Codex otherwise skips untrusted project hooks, so either flag drifting away must fail CI.
    const command = defaultAgentCommand('codex', undefined, { trustedCwd: ROOT });
    expect(command).toContain('--dangerously-bypass-hook-trust');
    expect(command).toContain('projects.');
    expect(command).toContain('trust_level="trusted"');
    expect(command.indexOf('--dangerously-bypass-hook-trust')).toBeGreaterThan(command.indexOf('codex'));
  });

  test('keeps task and role semantics out of scheduler source', () => {
    const ir = parseIr(readFileSync(join(PROFILE, 'ir.yml'), 'utf8'));
    const scheduler = compileLocal(ir).generated['scheduler/run.mjs'];
    expect(scheduler).not.toMatch(/\bztrack\b|\bmanager\b|\bplanner\b|\bkaizen\b|gh\s+(?:issue|pr)/);
  });
});
