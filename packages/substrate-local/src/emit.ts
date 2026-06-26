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
import { stringify as stringifyYaml } from 'yaml';
import { cronOf, emitAutonomy, isScript, withGeneratedManifest } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput } from '@open-autonomy/core';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';
// Only the shared portable runtime is borrowed from the github substrate (its neutral relocation is the
// remaining de-vendor work); the manifest serialization + IR helpers now come from core, so local's emit
// no longer depends on github's emit.
import { runtimeFiles } from '@open-autonomy/substrate-github';
import { runnerDefaultsModule } from './runner-config';

// github-only runtime scripts — the proxy/mint+exchange clients and the credentialed skill runner. A
// trusted local box never mints a bounded run token, so these are excluded from the local install
// (keeping it free of github execution-layer code).
const GITHUB_ONLY = new Set([
  'scripts/model-proxy-mint.ts',
  'scripts/model-proxy-exchange.ts',
  'scripts/model-proxy-revoke.ts',
  'scripts/claude-agent-run.ts',
]);

const here = dirname(fileURLToPath(import.meta.url));
// The domain-free runner backend (TermfleetRunner + CLI) and the agent-facing runner seam — emitted
// verbatim from their single sources beside this compiler so generated and dev-time never drift.
const RUNNER_BACKEND = readFileSync(join(here, 'backend.mjs'), 'utf8');
const RUNNER_FRONTEND = readFileSync(join(here, 'runner-frontend.ts'), 'utf8');
// The github-code-host propose backstop (the local runner running a finished proposer's effect — the
// counterpart of the github runner's post-skill job step). Emitted + scheduled only when codeHost=github.
const PROPOSE_SWEEP = readFileSync(join(here, 'propose-sweep.ts'), 'utf8');

// Inverse of secondsToCron for the simple every-N-minutes cron form the local loop honors.
export function cronToSeconds(cron: string): number {
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  return m ? Number(m[1]) * 60 : 900;
}

// The loop driver: fires the schedule's commands every interval, and (continuous mode) reaps idle agent
// sessions so finished cron ticks don't pile up. A cron tick is ephemeral by design — each fires a FRESH
// agent that re-reads state; this is the local analogue of a github job, which terminates when done.
// Locally nothing closes the interactive termfleet window, so the loop reaps it: a session that has been
// IDLE (termfleet `session_waiting`, no attention signal) for AUTONOMY_IDLE_REAP_MS is closed. A session
// still working (running / background-running), one a human took over, or one asking/errored is never
// reaped — keeping the "take over at any time" guarantee. `--once` fires a single tick and exits (no reap).
const LOOP_DRIVER = `#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SCHEDULE = process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json';
const args = process.argv.slice(2);
const schedule = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fireTick = () => {
  for (const command of schedule.scripts) {
    spawnSync(command, { shell: true, stdio: 'inherit', env: Object.assign({}, schedule.env, process.env) });
  }
};

if (args.includes('--once')) {
  fireTick();
  process.exit(0);
}

// Continuous mode: a fast heartbeat that fires ticks on the schedule interval and reaps idle sessions in
// between. The runner (termfleet SDK) does the reaping; we keep the persistent idle-since map here.
const here = dirname(fileURLToPath(import.meta.url));
const IDLE_REAP_MS = Number(process.env.AUTONOMY_IDLE_REAP_MS ?? 60000);
const POLL_MS = Math.max(1000, Number(process.env.AUTONOMY_REAP_POLL_MS ?? 20000));
const intervalMs = Number(schedule.intervalSeconds) * 1000;
// This install's OWN agents = the per-harness launch prompts (one .txt per skill agent). Reaping is
// scoped to these window names so a human's own terminal / another loop is never touched.
const harness = process.env.TERMFLEET_AGENT || 'claude';
let agents = new Set();
try {
  agents = new Set(
    readdirSync(join(here, '..', 'scripts', 'prompts', harness)).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)),
  );
} catch {}
let runner = null;
try {
  ({ runner } = await import(join(here, '..', 'scripts', 'autonomy-runner.mjs')).then((m) => ({ runner: new m.TermfleetRunner() })));
} catch (e) {
  console.error('[loop] reaping disabled (runner unavailable):', e?.message ?? e);
}
const idleSince = new Map();
let lastTick = 0;
while (true) {
  const now = Date.now();
  if (now - lastTick >= intervalMs) {
    fireTick();
    lastTick = Date.now();
  }
  if (runner) {
    try {
      const reaped = await runner.reapIdle({ idleMs: IDLE_REAP_MS, agents, since: idleSince });
      for (const r of reaped) console.log(\`[loop] reaped idle \${r.agent} (\${r.id})\`);
    } catch (e) {
      console.error('[loop] reap error:', e?.message ?? e);
    }
  }
  await sleep(POLL_MS);
}
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
    generated['.open-autonomy/autonomy.yml'] = stringifyYaml(emitAutonomy(ir) as Record<string, unknown>);
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

  // NOTE: the ztrack loop Stop hook (.claude/settings.json) is NOT emitted here. It is Claude Code harness
  // config — what the AGENT does (drive-to-green), identical wherever Claude Code runs — so it belongs to the
  // PROFILE, carried as a resource by the ztrack-using profiles (simple-sdlc, simple-gh-sdlc), and installed
  // on every runner. The runner is launch + isolate + schedule + lifecycle; it does not inject methodology.

  // The local driver: a loop that fires each cron agent on an interval (github used `on: schedule`).
  // Each runs its own behavior via bun, exactly as its github job runs `bun <behavior>`.
  const cronAgents = Object.entries(ir.agents).filter(([, a]) => cronOf(a));
  const intervalSeconds = cronAgents[0] ? cronToSeconds(cronOf(cronAgents[0][1]) as string) : 900;
  generated['scheduler/run.mjs'] = LOOP_DRIVER;
  // A script agent runs its behavior via bun; a prose-skill agent is launched through the runner.
  const scheduleScripts = cronAgents.map(([role, a]) =>
    isScript(a.behavior) ? `bun ${a.behavior}` : `AUTONOMY_AGENT=${role} node scripts/run-agent.mjs`,
  );
  // On a github code host, the local runner runs each finished proposer's effect deterministically each tick
  // (the local counterpart of github's post-skill job step); a local-git code host has no PRs (the PM merges).
  if (ir.codeHost === 'github') {
    generated['scripts/propose-sweep.ts'] = PROPOSE_SWEEP;
    scheduleScripts.push('bun scripts/propose-sweep.ts');
  }
  generated['scheduler/schedule.json'] = `${JSON.stringify({ intervalSeconds, env: {}, scripts: scheduleScripts }, null, 2)}\n`;
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
  // Carry the profile's resources. `.github/` workflows (ci/merge/security/…) are CODE-HOST resources: drop
  // them only for a local-git code host; KEEP them when the code host is github, because they run on github
  // Actions (the code host) regardless of where the agents RUN — a local-runner + github-code-host install
  // still needs them pushed to its github repo. (Runner ⟂ code host — docs/CODE_HOST_RESOURCES.md.)
  const keepCodeHostWorkflows = ir.codeHost === 'github';
  for (const r of ir.resources) {
    if (keepCodeHostWorkflows || !r.startsWith('.github/')) copies.push({ from: r, to: r });
  }
  return withGeneratedManifest({ generated, copies });
}
