// Emit autonomy.ir.v1 → a ztrack profile (profile.json + scheduler/schedule.json).
// Substrate = local-loop; harness conventions (skill install paths, run-agent, run.mjs loop)
// are supplied here by the adapter, NOT carried in the IR.
import type { AutonomyIR } from './autonomy-ir';
import type { ZtrackProfile, ZtrackSchedule } from './autonomy-ingest-profile';

// Inverse of secondsToCron for the simple every-N-minutes cron form the local loop produces.
export function cronToSeconds(cron: string): number {
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  return m ? Number(m[1]) * 60 : 900;
}

export function emitProfile(
  ir: AutonomyIR,
  opts: { name?: string } = {},
): { profile: ZtrackProfile; schedule: ZtrackSchedule } {
  const name = opts.name ?? 'app';

  const skills: NonNullable<ZtrackProfile['skills']> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    skills[role] = {
      name: `ztrack-${name}-${role}`,
      source: `profiles/${name}/skills/${agent.skill}/SKILL.md`,
      codex: `.agents/skills/ztrack-${name}-${role}/SKILL.md`,
      claude: `.claude/skills/ztrack-${name}-${role}/SKILL.md`,
    };
  }

  // resources split back into the two buckets ztrack distinguishes.
  const readme = ir.resources.find((r) => /readme\.md$/i.test(r));
  const standards = ir.resources.filter((r) => !/readme\.md$/i.test(r));

  // per-agent concurrency → WIP caps.
  const wip: { maxInProgress?: number; maxInReview?: number } = {};
  if (ir.agents.develop) wip.maxInProgress = ir.agents.develop.maxConcurrent;
  if (ir.agents.review) wip.maxInReview = ir.agents.review.maxConcurrent;

  const policy: NonNullable<ZtrackProfile['policy']> = { wip };
  const box = ir.policy.box as Record<string, unknown>;
  if (Array.isArray(box.humanRequiredPaths)) policy.humanRequiredPaths = box.humanRequiredPaths as string[];
  if (Array.isArray(box.humanRequiredTopics)) policy.humanRequiredTopics = box.humanRequiredTopics as string[];

  const scriptPaths = ir.workflows.filter((w) => w.run).map((w) => w.run as string);
  const intervalSeconds = ir.workflows[0] ? cronToSeconds(ir.workflows[0].cron) : 900;

  const profile: ZtrackProfile = {
    schema: 'ztrack.profile.v1',
    name,
    preset: name,
    readme,
    scheduler: {
      schedule: `profiles/${name}/scheduler/schedule.json`,
      scripts: [...scriptPaths, `profiles/${name}/scheduler/scripts/run.mjs`],
    },
    scripts: { runAgent: `profiles/${name}/scripts/run-agent.mjs` },
    skills,
    standards,
    policy,
  };

  const schedule: ZtrackSchedule = {
    intervalSeconds,
    env: {},
    scripts: scriptPaths.map((p) => `node ${p}`),
  };

  return { profile, schedule };
}
