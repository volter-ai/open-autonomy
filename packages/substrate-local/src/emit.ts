// Emit autonomy.ir.v1 → a LOCAL-loop installation. The install MIRRORS the github layout (the same
// injected agent runtime + manifest + resources at the repo root), so the agents — which talk to gh for
// tasks/artifact on every substrate — run unchanged. Only the EXECUTION layer differs: instead of
// github workflows + the gh runner, local ships a loop driver (run.mjs on an interval) + the local
// runner (launch via termfleet). The runner is the one true substrate seam.
//
// The shared agent runtime + manifest currently live in @open-autonomy/substrate-github; we reuse its
// compile output and strip the github-specific execution layer. (A neutral home for the shared runtime
// is a future cleanup — the agent code itself is substrate-agnostic.)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput } from '@open-autonomy/core';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

// A script behavior runs directly; a prose skill is launched through the runner (same rule as github).
const isScript = (behavior: string): boolean => /\.(ts|mjs|js)$/.test(behavior);

const here = dirname(fileURLToPath(import.meta.url));
// The domain-free runner backend (TermfleetRunner + CLI) and the agent-facing runner seam — emitted
// verbatim from their single sources beside this compiler so generated and dev-time never drift.
const RUNNER_BACKEND = readFileSync(join(here, 'backend.mjs'), 'utf8');
const RUNNER_FRONTEND = readFileSync(join(here, 'runner-frontend.ts'), 'utf8');

// Inverse of secondsToCron for the simple every-N-minutes cron form the local loop honors.
export function cronToSeconds(cron: string): number {
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  return m ? Number(m[1]) * 60 : 900;
}

// The loop driver: fires the schedule's commands every interval (or once with --once).
const LOOP_DRIVER = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const SCHEDULE = process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json';
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

// run-agent: the launch adapter the local runner drives. Reads AUTONOMY_AGENT + forwards the env names
// listed in AUTONOMY_FORWARD as opaque --key value params to the (co-located) runner backend, pointing
// it at the right per-harness prompt.
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

// Per-agent launch prompts, split by harness (codex triggers a skill with `$name`, claude with
// `/name`); the install name is `${profile}-${role}`. They live in scripts/prompts/ where run-agent
// points the backend.
function promptFiles(ir: AutonomyIR, name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of Object.keys(ir.agents)) {
    const skill = `${name}-${role}`;
    out[`scripts/prompts/codex/${role}.txt`] = `$${skill}\n`;
    out[`scripts/prompts/claude/${role}.txt`] = `/${skill}\n`;
  }
  return out;
}

export function compileLocal(ir: AutonomyIR, opts: { name?: string; runner?: RunnerName } = {}): CompileOutput {
  const name = opts.name ?? 'app';
  const runner = opts.runner ?? 'termfleet';
  if (!SUPPORTED_RUNNERS.includes(runner)) {
    throw new Error(`unsupported runner "${runner}"; supported: ${SUPPORTED_RUNNERS.join(', ')}`);
  }

  // Reuse github's compile (the shared agent runtime + manifest + resource copies), then strip its
  // EXECUTION layer (workflows + the control plane) and bolt on the local one.
  const gh = compileGithub(ir);
  const generated: Record<string, string> = {};
  for (const [path, content] of Object.entries(gh.generated)) {
    if (path.startsWith('.github/')) continue; // github workflows + agent-control.mjs are github-only
    generated[path] = content;
  }

  // The local runner OVERRIDES the github runner.ts injected from the runtime — launches go to termfleet.
  generated['scripts/runner.ts'] = RUNNER_FRONTEND;
  generated['scripts/run-agent.mjs'] = RUN_AGENT_DRIVER;
  generated['scripts/autonomy-runner.mjs'] = RUNNER_BACKEND;

  // The local driver: a loop that fires each cron agent on an interval (github used `on: schedule`).
  // Each runs its own behavior via bun, exactly as its github job runs `bun <behavior>`.
  const cronAgents = Object.entries(ir.agents).filter(([, a]) => cronOf(a));
  const intervalSeconds = cronAgents[0] ? cronToSeconds(cronOf(cronAgents[0][1]) as string) : 900;
  generated['scheduler/run.mjs'] = LOOP_DRIVER;
  generated['scheduler/schedule.json'] = `${JSON.stringify(
    {
      intervalSeconds,
      env: {},
      // A script agent runs its behavior via bun; a prose-skill agent is launched through the runner.
      scripts: cronAgents.map(([role, a]) =>
        isScript(a.behavior) ? `bun ${a.behavior}` : `AUTONOMY_AGENT=${role} node scripts/run-agent.mjs`,
      ),
    },
    null,
    2,
  )}\n`;
  Object.assign(generated, promptFiles(ir, name));

  // Copies: reuse github's (skills + resources at the repo root) so the agents' cwd-relative gh + script
  // paths resolve unchanged. Drop the github-only workflow resources.
  const copies = gh.copies.filter((c) => !c.to.startsWith('.github/'));
  return { generated, copies };
}
