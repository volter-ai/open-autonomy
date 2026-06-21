// Emit autonomy.ir.v1 → a LOCAL-loop installation. This compiler is INDEPENDENT of the github compiler:
// it builds the install from the shared layer (the substrate-neutral runtime scripts + the manifest +
// resource copies) and adds the LOCAL execution layer (a loop driver on an interval + the local runner
// via termfleet + ambient model env). It never emits github's execution layer — no workflows, no proxy,
// no mint, no wrapper — so a local install and a github install share the portable behavior and ZERO
// execution-layer code. The model endpoint is the box's: on local that means ambient env (the operator's
// OPENAI_API_KEY / OPENAI_BASE_URL, or a local proxy they run) — no injection, no mint.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronOf, emitAutonomy, isScript } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput } from '@open-autonomy/core';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';
// Only the shared portable runtime is borrowed from the github substrate (its neutral relocation is the
// remaining de-vendor work); the manifest serialization + IR helpers now come from core, so local's emit
// no longer depends on github's emit.
import { runtimeFiles } from '@open-autonomy/substrate-github';
import { runnerDefaultsModule } from './runner-config';

// github-only runtime scripts — the proxy/mint clients, the privilege-separated wrapper machinery, and
// the box-setup provisioner. A trusted local box never mints or wraps, so these are excluded from the
// local install (keeping it free of github execution-layer code).
const GITHUB_ONLY = new Set([
  'scripts/provision-model-endpoint.ts',
  'scripts/model-proxy-mint.ts',
  'scripts/model-proxy-exchange.ts',
  'scripts/model-proxy-revoke.ts',
  'scripts/github-agent-publish.ts',
  'scripts/github-agent-publish.test.ts',
  'scripts/github-agent-session.ts',
  'scripts/github-agent-session.test.ts',
  'scripts/claude-agent-run.ts',
]);

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
import { RUNNER_DEFAULTS } from './runner-defaults.mjs';
const agent = process.env.AUTONOMY_AGENT;
if (!agent) throw new Error('AUTONOMY_AGENT required');
const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, 'autonomy-runner.mjs');
const harness = process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness;
const env = { ...process.env, AUTONOMY_PROMPT_DIR: process.env.AUTONOMY_PROMPT_DIR || join(here, 'prompts', harness) };
const forward = (process.env.AUTONOMY_FORWARD || '').split(',').map((s) => s.trim()).filter(Boolean);
const params = forward.flatMap((k) => (process.env[k] ? ['--' + k, process.env[k]] : []));
const timeout = Number(process.env.TERMFLEET_LAUNCH_TIMEOUT_MS || RUNNER_DEFAULTS.launchTimeoutMs);
const r = spawnSync('node', [runner, 'launch', agent, ...params], { stdio: 'inherit', timeout, env });
process.exit(r.error?.code === 'ETIMEDOUT' ? 0 : (r.status ?? 1));
`;

// Per-agent launch prompts for SKILL agents, split by harness: codex invokes the skill with `$name`,
// Claude Code with `/name` — where the name is the skill's OWN id (its behavior = the SKILL.md folder +
// frontmatter `name` it is installed under in .codex/skills/ and .claude/skills/), so the trigger
// actually resolves. Keyed by role: the schedule launches `AUTONOMY_AGENT=<role>`, which selects
// prompts/<harness>/<role>.txt. Script agents run via bun and need no launch prompt.
function promptFiles(ir: AutonomyIR): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    if (isScript(agent.behavior)) continue;
    out[`scripts/prompts/codex/${role}.txt`] = `$${agent.behavior}\n`;
    out[`scripts/prompts/claude/${role}.txt`] = `/${agent.behavior}\n`;
  }
  return out;
}

export function compileLocal(ir: AutonomyIR, opts: { runner?: RunnerName } = {}): CompileOutput {
  const runner = opts.runner ?? 'termfleet';
  if (!SUPPORTED_RUNNERS.includes(runner)) {
    throw new Error(`unsupported runner "${runner}"; supported: ${SUPPORTED_RUNNERS.join(', ')}`);
  }

  const generated: Record<string, string> = {};

  // Shared layer: the manifest, generated the same way for every substrate (unless carried verbatim).
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    generated['.open-autonomy/autonomy.yml'] = Bun.YAML.stringify(emitAutonomy(ir) as Record<string, unknown>);
  }
  // Shared layer: the substrate-neutral runtime scripts, minus the github-only ones.
  for (const [path, content] of Object.entries(runtimeFiles())) {
    if (!GITHUB_ONLY.has(path)) generated[path] = content;
  }

  // Local execution layer: the runner OVERRIDES the github runner.ts from the runtime — launches go to
  // termfleet, not `gh workflow run`.
  generated['scripts/runner.ts'] = RUNNER_FRONTEND;
  generated['scripts/run-agent.mjs'] = RUN_AGENT_DRIVER;
  generated['scripts/autonomy-runner.mjs'] = RUNNER_BACKEND;
  // The single source of the runner's defaults (harness, cli, provider url, timeout). The vendored .mjs
  // runtime imports this instead of re-hardcoding literals; TERMFLEET_* env vars override at runtime.
  generated['scripts/runner-defaults.mjs'] = runnerDefaultsModule();

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
  Object.assign(generated, promptFiles(ir));

  // Copies: skill behaviors + the profile's resources at the repo root, so the agents' cwd-relative gh +
  // script paths resolve unchanged. Drop any github-only resources (e.g. repo CI under .github/).
  const copies: Array<{ from: string; to: string }> = [];
  for (const agent of Object.values(ir.agents)) {
    if (!isScript(agent.behavior)) {
      // Install the skill where each harness resolves a `/name` (claude) / `$name` (codex) invocation:
      // codex from `.codex/skills/`, Claude Code from `.claude/skills/`. The launch prompt (promptFiles)
      // sends `/<behavior>` / `$<behavior>`, which activates the skill of that name — verified end-to-end
      // (a real compiled install: `/greeter` → the greeter skill runs). The skill's frontmatter `name`
      // must equal `<behavior>` for the trigger to resolve (enforced by check:profiles).
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.codex/skills/${agent.behavior}/SKILL.md` });
      copies.push({ from: `skills/${agent.behavior}/SKILL.md`, to: `.claude/skills/${agent.behavior}/SKILL.md` });
    }
  }
  for (const r of ir.resources) {
    if (!r.startsWith('.github/')) copies.push({ from: r, to: r });
  }
  return { generated, copies };
}
