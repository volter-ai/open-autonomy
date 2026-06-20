// Emit autonomy.ir.v1 → a generic local-loop installation: schedule.json + the run.mjs loop + the
// vendored runner + a run-agent adapter + per-harness skill prompts. The substrate is TOOLING-AGNOSTIC
// — whatever an agent calls (ztrack, gh + npm, …) is the profile's concern, carried opaquely through
// AUTONOMY_FORWARD; the substrate never names it. Harness conventions (skill install paths, run-agent,
// the loop) are supplied here by the adapter, NOT carried in the IR.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';

// The substrate decides execution from the behavior artifact (same rule as github): a script runs
// directly; a prose skill gets a generated launcher that drives the agent through the runner.
const isScript = (behavior: string): boolean => /\.(ts|mjs|js)$/.test(behavior);

// The schedule the loop reads: an interval + the commands to run each tick. Generic, not tied to any tool.
export interface LocalSchedule {
  intervalSeconds: number;
  env: Record<string, string>;
  scripts: string[];
}

// Each agent's tick script lives at scheduler/scripts/<role>-tick.mjs (the dest the schedule
// references). A script-behavior agent copies its script there; a skill agent gets a generated launcher.
export function agentScriptPath(
  role: string,
  agent: IRAgent,
  name: string,
): { dest: string; source?: string; generated: boolean } {
  // A script-behavior agent's tick keeps the source extension (a .ts tick must stay .ts so the
  // bun runtime strips its types); a skill agent gets a generated .mjs launcher.
  if (isScript(agent.behavior)) {
    const ext = agent.behavior.slice(agent.behavior.lastIndexOf('.'));
    return { dest: `profiles/${name}/scheduler/scripts/${role}-tick${ext}`, source: agent.behavior, generated: false };
  }
  return { dest: `profiles/${name}/scheduler/scripts/${role}-tick.mjs`, generated: true };
}

// Inverse of secondsToCron for the simple every-N-minutes cron form the local loop produces.
export function cronToSeconds(cron: string): number {
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  return m ? Number(m[1]) * 60 : 900;
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

// The agent-facing Runner seam (launch/list), emitted next to the agent ticks so an agent's
// `import './runner.js'` resolves to the LOCAL runner. Single source: runner-frontend.ts beside us.
const RUNNER_FRONTEND = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'runner-frontend.ts'),
  'utf8',
);

// run-agent: the launch adapter (the profile's domain seam). Reads AUTONOMY_AGENT (which agent) and
// forwards any env names listed in AUTONOMY_FORWARD (comma-separated) to the runner as opaque
// --key value params; the runner exports them verbatim into the launched agent. Domain/tooling
// vocabulary (e.g. a ztrack profile declares ZTRACK_ISSUE) is named by the profile via AUTONOMY_FORWARD,
// never known to the system. It defaults AUTONOMY_PROMPT_DIR to the emitted per-harness prompts so the
// runner uses the right skill prompt, then delegates to the vendored runner.
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

// A launch: workflow dispatches through the same run-agent adapter every agent uses (so prompts +
// param forwarding apply uniformly) — not a hardcoded backend, and not a runtime selection switch.
const launcherScript = (agent: string, base: string) => `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const r = spawnSync('node', [${JSON.stringify(`${base}/scripts/run-agent.mjs`)}], { stdio: 'inherit', env: { ...process.env, AUTONOMY_AGENT: ${JSON.stringify(agent)} } });
process.exit(r.status == null ? 1 : r.status);
`;

// Per-agent skill prompts, split by harness (codex triggers a skill with `$name`, claude with
// `/name`). The skill install name is `${profile}-${role}` — the profile name namespaces it, with no
// tool baked in.
function promptFiles(ir: AutonomyIR, name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of Object.keys(ir.agents)) {
    const skill = `${name}-${role}`;
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

  // The local loop can only honor cron triggers; event-only agents are skipped here (still launchable,
  // just not auto-fired locally). This is the local substrate's partial implementation of the standard.
  const localAgents = Object.entries(ir.agents).filter(([, a]) => cronOf(a));
  const intervalSeconds = localAgents[0] ? cronToSeconds(cronOf(localAgents[0][1]) as string) : 900;
  const schedule: LocalSchedule = {
    intervalSeconds,
    env: {},
    // A script-behavior agent (a bun/.ts orchestrator) runs via bun so its types are stripped and its
    // runner import resolves; a generated skill launcher runs via node.
    scripts: localAgents.map(
      ([role, a]) => `${isScript(a.behavior) ? 'bun' : 'node'} ${agentScriptPath(role, a, name).dest}`,
    ),
  };

  const generated: Record<string, string> = {
    [`${base}/scheduler/schedule.json`]: JSON.stringify(schedule, null, 2),
    [`${base}/scheduler/scripts/run.mjs`]: loopDriver(base),
    // The agent-facing Runner seam, next to the ticks so `import './runner.js'` resolves to the local one.
    [`${base}/scheduler/scripts/runner.ts`]: RUNNER_FRONTEND,
    [`${base}/scripts/run-agent.mjs`]: RUN_AGENT_DRIVER,
    // The substrate primitive: the domain-free runner backend, emitted verbatim from its single source.
    [`${base}/scripts/autonomy-runner.mjs`]: RUNNER_BACKEND,
    ...promptFiles(ir, name),
  };
  const copies: Array<{ from: string; to: string }> = [];

  // agents: script behavior → copy the script to its dest; skill behavior → generate a launcher.
  for (const [role, agent] of localAgents) {
    const { dest, source, generated: isGen } = agentScriptPath(role, agent, name);
    if (isGen) generated[dest] = launcherScript(role, base);
    else copies.push({ from: source as string, to: dest });
  }

  // skills: only skill-behavior agents have a skill folder + the two harness installs (`${profile}-${role}`).
  for (const [role, agent] of Object.entries(ir.agents)) {
    if (isScript(agent.behavior)) continue;
    const src = `skills/${agent.behavior}/SKILL.md`;
    copies.push({ from: src, to: `${base}/skills/${agent.behavior}/SKILL.md` });
    copies.push({ from: src, to: `.claude/skills/${name}-${role}/SKILL.md` });
    copies.push({ from: src, to: `.agents/skills/${name}-${role}/SKILL.md` });
  }

  // resources: readme → README.md; everything else → standards/<basename>
  for (const r of ir.resources) {
    const leaf = r.split('/').pop() ?? r;
    if (/readme\.md$/i.test(r)) copies.push({ from: r, to: `${base}/README.md` });
    else copies.push({ from: r, to: `${base}/standards/${leaf}` });
  }

  return { generated, copies };
}
