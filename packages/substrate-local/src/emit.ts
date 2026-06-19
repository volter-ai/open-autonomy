// Emit autonomy.ir.v1 → a ztrack profile (profile.json + scheduler/schedule.json).
// Substrate = local-loop; harness conventions (skill install paths, run-agent, run.mjs loop)
// are supplied here by the adapter, NOT carried in the IR.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRWorkflow } from '@open-autonomy/core';
import type { ZtrackProfile, ZtrackSchedule } from './ingest';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';

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

  // The local loop can only honor cron triggers; event-only and raw (substrate-specific) workflows
  // are skipped here (their agent stays launchable, just not auto-fired locally).
  const localWorkflows = ir.workflows.filter((w) => !w.raw && cronOf(w));
  const scriptPaths = localWorkflows.map((w) => workflowScriptPath(w, name).dest);
  const intervalSeconds = localWorkflows[0] ? cronToSeconds(cronOf(localWorkflows[0]) as string) : 900;

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

// The emittable local-loop runner backend (the domain-free TermfleetRunner + CLI). Its single
// source of truth lives next to this compiler as backend.mjs; we emit it verbatim
// into the profile so the generated runner and the dev-time runner never drift.
const RUNNER_BACKEND = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'backend.mjs'),
  'utf8',
);

// run-agent: the launch adapter (the profile's domain seam). Reads AUTONOMY_AGENT (which agent) and
// forwards any env names listed in AUTONOMY_FORWARD (comma-separated) to the runner as opaque
// --key value params; the runner exports them verbatim into the launched agent. Domain vocabulary
// (e.g. ZTRACK_ISSUE) is declared by the profile via AUTONOMY_FORWARD, never known to the system.
// It defaults AUTONOMY_PROMPT_DIR to the emitted per-harness prompts so the runner uses the right
// skill prompt, then delegates to the vendored runner.
const RUN_AGENT_DRIVER = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const agent = process.env.AUTONOMY_AGENT;
if (!agent) throw new Error('AUTONOMY_AGENT required');
const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, 'autonomy-runner.mjs');
const harness = process.env.TERMFLEET_AGENT || 'codex';
const env = { ...process.env, AUTONOMY_PROMPT_DIR: process.env.AUTONOMY_PROMPT_DIR || join(here, 'prompts', harness) };
const forward = (process.env.AUTONOMY_FORWARD || '').split(',').map((s) => s.trim()).filter(Boolean);
const params = forward.flatMap((k) => (process.env[k] ? ['--' + k, process.env[k]] : []));
const timeout = Number(process.env.TERMFLEET_LAUNCH_TIMEOUT_MS || 45000);
const r = spawnSync('node', [runner, 'launch', agent, ...params], { stdio: 'inherit', timeout, env });
process.exit(r.error?.code === 'ETIMEDOUT' ? 0 : (r.status ?? 1));
`;

// A launch: workflow dispatches through the same run-agent adapter PM uses (so prompts + param
// forwarding apply uniformly) — not a hardcoded backend, and not a runtime selection switch.
const launcherScript = (agent: string, base: string) => `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const r = spawnSync('node', [${JSON.stringify(`${base}/scripts/run-agent.mjs`)}], { stdio: 'inherit', env: { ...process.env, AUTONOMY_AGENT: ${JSON.stringify(agent)} } });
process.exit(r.status == null ? 1 : r.status);
`;

// Per-agent skill prompts, split by harness (codex triggers a skill with `$name`, claude with
// `/name`). The skill install name mirrors emitProfile's skills[role].name.
function promptFiles(ir: AutonomyIR, name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of Object.keys(ir.agents)) {
    const skill = `ztrack-${name}-${role}`;
    out[`profiles/${name}/scripts/prompts/codex/${role}.txt`] = `$${skill}\n`;
    out[`profiles/${name}/scripts/prompts/claude/${role}.txt`] = `/${skill}\n`;
  }
  return out;
}

export function compileLocal(
  ir: AutonomyIR,
  opts: { name?: string; runner?: RunnerName; runnerCmd?: string } = {},
): CompileOutput {
  const name = opts.name ?? 'app';
  // The runner is a substrate decision the compiler makes. We only wire a runner we actually
  // ship — pick one of SUPPORTED_RUNNERS or fail fast. The launcher invokes that concrete runner
  // (`autonomy-<runner>`) directly; there is no runtime selection switch.
  const runner = opts.runner ?? 'termfleet';
  if (!SUPPORTED_RUNNERS.includes(runner)) {
    throw new Error(`unsupported runner "${runner}"; supported: ${SUPPORTED_RUNNERS.join(', ')}`);
  }
  const base = `profiles/${name}`;
  const { profile, schedule } = emitProfile(ir, { name });

  const generated: Record<string, string> = {
    [`${base}/profile.json`]: JSON.stringify(profile, null, 2),
    [`${base}/scheduler/schedule.json`]: JSON.stringify(schedule, null, 2),
    [`${base}/scheduler/scripts/run.mjs`]: loopDriver(base),
    [`${base}/scripts/run-agent.mjs`]: RUN_AGENT_DRIVER,
    // The substrate primitive: the domain-free runner backend, emitted verbatim from its single source.
    [`${base}/scripts/autonomy-runner.mjs`]: RUNNER_BACKEND,
    ...promptFiles(ir, name),
  };
  const copies: Array<{ from: string; to: string }> = [];

  // workflows: run → copy the script to its dest; launch → generate a launcher at its dest.
  // Only cron-bearing, non-raw workflows participate in the local loop (events/raw are github-only).
  for (const wf of ir.workflows.filter((w) => !w.raw && cronOf(w))) {
    const { dest, source, generated: isGen } = workflowScriptPath(wf, name);
    if (isGen) generated[dest] = launcherScript(wf.launch as string, base);
    else copies.push({ from: source as string, to: dest });
  }

  // skills: source folder in the profile + the two harness installs
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
