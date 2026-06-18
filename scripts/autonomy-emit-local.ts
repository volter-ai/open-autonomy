// Emit autonomy.ir.v1 → a ztrack profile (profile.json + scheduler/schedule.json).
// Substrate = local-loop; harness conventions (skill install paths, run-agent, run.mjs loop)
// are supplied here by the adapter, NOT carried in the IR.
import type { AutonomyIR, CompileOutput, IRWorkflow } from './autonomy-ir';
import type { ZtrackProfile, ZtrackSchedule } from './autonomy-ingest-profile';

// Every workflow's script lives at scheduler/scripts/<name>.mjs (the dest the schedule references).
// A `run:` workflow copies its existing script there; a `launch:` workflow gets a generated launcher.
export function workflowScriptPath(
  w: IRWorkflow,
  name: string,
): { dest: string; source?: string; generated: boolean } {
  const dest = `profiles/${name}/scheduler/scripts/${w.name}.mjs`;
  if (w.run) return { dest, source: w.run, generated: false };
  return { dest, generated: true };
}

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

  const scriptPaths = ir.workflows.map((w) => workflowScriptPath(w, name).dest);
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

// --- Full file-tree compile (local-loop substrate, claude+codex harnesses) ---
// Real, executable driver/launcher contents. The launcher is backend-pluggable via
// AUTONOMY_LAUNCH_CMD (termfleet, codex, a recorder, …), so it runs anywhere.
const loopDriver = (base: string) => `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const SCHEDULE = process.env.AUTONOMY_SCHEDULE || '${base}/scheduler/schedule.json';
const args = process.argv.slice(2);
const schedule = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
do {
  for (const command of schedule.scripts) {
    spawnSync(command, { shell: true, stdio: 'inherit', env: Object.assign({}, schedule.env, process.env) });
  }
  if (args.includes('--once')) break;
  await sleep(Number(schedule.intervalSeconds) * 1000);
} while (true);
`;

const RUN_AGENT_DRIVER = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const agent = process.env.AUTONOMY_AGENT;
if (!agent) throw new Error('AUTONOMY_AGENT required');
const cmd = process.env.AUTONOMY_LAUNCH_CMD;
if (!cmd) { console.log('[launch] ' + agent + ' (no backend configured)'); process.exit(0); }
const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env: Object.assign({}, process.env, { AUTONOMY_AGENT: agent }) });
process.exit(r.status == null ? 1 : r.status);
`;

const launcherScript = (agent: string, base: string) => `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const r = spawnSync('node', ['${base}/scripts/run-agent.mjs'], { stdio: 'inherit', env: Object.assign({}, process.env, { AUTONOMY_AGENT: '${agent}' }) });
process.exit(r.status == null ? 1 : r.status);
`;

export function compileLocal(ir: AutonomyIR, opts: { name?: string } = {}): CompileOutput {
  const name = opts.name ?? 'app';
  const base = `profiles/${name}`;
  const { profile, schedule } = emitProfile(ir, { name });

  const generated: Record<string, string> = {
    [`${base}/profile.json`]: JSON.stringify(profile, null, 2),
    [`${base}/scheduler/schedule.json`]: JSON.stringify(schedule, null, 2),
    [`${base}/scheduler/scripts/run.mjs`]: loopDriver(base),
    [`${base}/scripts/run-agent.mjs`]: RUN_AGENT_DRIVER,
  };
  const copies: Array<{ from: string; to: string }> = [];

  // workflows: run → copy the script to its dest; launch → generate a launcher at its dest
  for (const wf of ir.workflows) {
    const { dest, source, generated: isGen } = workflowScriptPath(wf, name);
    if (isGen) generated[dest] = launcherScript(wf.launch as string, base);
    else copies.push({ from: source as string, to: dest });
  }

  // skills: source folder in the profile bundle + the two harness installs
  for (const [role, agent] of Object.entries(ir.agents)) {
    const src = `skills/${agent.skill}/SKILL.md`;
    copies.push({ from: src, to: `${base}/skills/${agent.skill}/SKILL.md` });
    copies.push({ from: src, to: `.claude/skills/ztrack-${name}-${role}/SKILL.md` });
    copies.push({ from: src, to: `.agents/skills/ztrack-${name}-${role}/SKILL.md` });
  }

  // resources: readme → README.md; everything else → standards/<basename>
  for (const r of ir.resources) {
    const leaf = r.split('/').pop() ?? r;
    if (/readme\.md$/i.test(r)) copies.push({ from: r, to: `${base}/README.md` });
    else copies.push({ from: r, to: `${base}/standards/${leaf}` });
  }

  return { generated, copies };
}
