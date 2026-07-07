// Emit autonomy.ir.v1 → a LOCAL-loop installation. This compiler is INDEPENDENT of the github compiler:
// it builds the install from the shared layer (the substrate-neutral runtime scripts + the manifest +
// resource copies) and adds the LOCAL execution layer (a loop driver on an interval + the local runner
// via termfleet + ambient model env). It never emits github's execution layer — no workflows, no proxy,
// no mint, no wrapper — so a local install and a github install share the portable behavior and ZERO
// execution-layer code. The model endpoint is the box's: on local that means ambient env (the operator's
// OPENAI_API_KEY / OPENAI_BASE_URL, or a local proxy they run) — no injection, no mint.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import { GENERATED_MANIFEST_PATH, cronOf, emitAutonomy, isScript, withGeneratedManifest } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';
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

// Lazy sibling-data reads (OA-01, symmetric with substrate-github/src/emit.ts): module-scope
// `readFileSync`s here meant merely importing '@open-autonomy/substrate-local' (e.g. from `lint`, which
// imports every substrate to compile a profile against its declared targets) touched disk before any
// caller actually asked for a local compile. Now the read happens on first use, and a miss throws an
// actionable error instead of a raw ENOENT.
function readSiblingOrThrow(read: () => string, literal: string): string {
  try {
    return read();
  } catch (e) {
    throw new Error(
      `open-autonomy: packaging bug — sibling data file '${literal}' is missing next to the substrate-local ` +
        `module (expected beside ${import.meta.url}). This file should ship with the package; reinstall ` +
        `open-autonomy, or file an issue: https://github.com/volter-ai/open-autonomy/issues. ` +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

// The domain-free runner backend (TermfleetRunner + CLI) and the agent-facing runner seam — emitted
// verbatim from their single sources beside this compiler so generated and dev-time never drift.
let _runnerBackend: string | undefined;
function runnerBackendSrc(): string {
  return (_runnerBackend ??= readSiblingOrThrow(
    () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'backend.mjs'), 'utf8'),
    'backend.mjs',
  ));
}
let _runnerFrontend: string | undefined;
function runnerFrontendSrc(): string {
  return (_runnerFrontend ??= readSiblingOrThrow(
    () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'runner-frontend.ts'), 'utf8'),
    'runner-frontend.ts',
  ));
}
// NOTE: a github code host's propose effect (turning a finished proposer's worktree into a PR) is NOT a
// scheduled script. It is a per-session LIFECYCLE effect: runner.ts records it at launch and the loop driver
// runs it when that session finishes (reconcilePendingEffects above) — the local mirror of github's
// post-skill job step. (This replaced the old propose-sweep poller, which scanned worktrees + reconstructed
// SDLC state in the runner — a methodology leak. See the loop driver + runner-frontend's effect markers.)

// Is this actor a person? A kind:human actor is DECLARED (visible in the manifest) but never EXECUTED on
// any substrate — mirrors github's own `isHuman` (substrate-github/src/emit.ts): no scheduled tick, no
// launch prompt. Unlike github, local still emits no per-agent job either way (the loop is one shared
// driver), so the only local-specific decisions are: exclude a human from the schedule (even if it
// somehow carries a cron — see cronAgents below) and from promptFiles (no harness invocation for a
// person). Its SKILL.md IS still copied (see the copies loop below) — same as github: the file is the
// person's doctrine (what an engage points them at), not a launchable unit.
function isHuman(agent: IRAgent): boolean {
  return agent.kind === 'human';
}

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
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const SCHEDULE = process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json';
const args = process.argv.slice(2);
const schedule = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PAUSE GATE (OA-07): a fresh install lands PAUSED (see compileLocal's seed-once marker) so an existing
// backlog is never dispatched before the operator reviews it. Checked at TICK-FIRE time (not just at
// startup) in BOTH modes, so \`touch .open-autonomy/paused\` also works as a live kill-switch and
// \`rm .open-autonomy/paused\` un-pauses immediately on the next check — never only once at process start.
const PAUSED = join(here, '..', '.open-autonomy', 'paused');
const pausedMessage = () =>
  '[loop] PAUSED — fresh installs start paused so an existing backlog is never dispatched unreviewed.\\n' +
  '[loop] review the board, then unpause:  rm .open-autonomy/paused   (details: ' + PAUSED + ')';

// \`--once\` checks PAUSED first — before even the termfleet dependency check below — so a paused install
// deterministically reports PAUSED as the reason nothing ran, never masked by an unrelated "termfleet not
// installed" exit that would also (coincidentally) prevent a launch. Continuous mode's gate lives in its
// own heartbeat loop further down (it must re-check on every beat, not just once at startup).
if (args.includes('--once') && existsSync(PAUSED)) {
  console.error(pausedMessage());
  process.exit(1); // scripted install pipelines notice a nonzero exit, not just log text
}

// A schedule command that launches a skill (prose) agent goes through run-agent.mjs -> the runner (the
// termfleet SDK) — a peer dep this loop drives but does NOT vendor. Before this check, a schedule fired
// before \`npm install termfleet\` died several process-hops deep with a raw, buried ERR_MODULE_NOT_FOUND
// (the FIRST command an adopter runs, per docs/OPERATIONS.md: \`node scheduler/run.mjs --once\`). A
// script-only schedule (every agent a deterministic scripts/*.ts behavior) never touches the runner, so
// the check is scoped to schedules that actually need it — never a false alarm on one that doesn't.
const needsRunner = schedule.scripts.some((c) => c.includes('run-agent.mjs'));
if (needsRunner && !existsSync(join(here, '..', 'node_modules', 'termfleet'))) {
  console.error(
    '[loop] this schedule launches a skill agent through the runner, but termfleet is not installed in this repo.\\n' +
      '  Fix:  npm install termfleet   (the local runner drives it via its SDK — see docs/OPERATIONS.md#local-runner-quickstart)',
  );
  process.exit(1);
}

const fireTick = () => {
  for (const command of schedule.scripts) {
    spawnSync(command, { shell: true, stdio: 'inherit', env: Object.assign({}, schedule.env, process.env) });
  }
};

if (args.includes('--once')) {
  // PAUSED was already checked above (before the termfleet gate) — reaching here means it's clear.
  fireTick();
  process.exit(0);
}

// Continuous mode: a fast heartbeat that fires ticks on the schedule interval and reaps idle sessions in
// between. The runner (termfleet SDK) does the reaping; we keep the persistent idle-since map here.
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

// Post-session effects: the local mirror of github's post-skill job step. The runner's launch seam
// (scripts/runner.ts) records a pending effect per code:propose session — keyed by terminalId — under
// runner-state/effects. When that session is GONE from the runner's live list (finished + reaped), run its
// recorded effect in its worktree and retire the marker. Domain-free: the loop runs "<effect> in <worktree>",
// never any issue/tracker logic (it replaces the old propose-sweep, which scanned worktrees + reconstructed
// SDLC state — a methodology leak). Crash-safe: a marker outlives a missed reap and is reconciled on a later
// tick, and agent-propose is idempotent (it updates the same branch/PR); the marker is deleted once it runs.
const EFFECTS_DIR = join(here, '..', '.open-autonomy', 'runner-state', 'effects');
async function reconcilePendingEffects(runner) {
  let files = [];
  try { files = readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.json')); } catch { return; } // no markers dir yet
  if (!files.length) return;
  let live;
  try { live = new Set((await runner.list()).map((s) => s.id)); } catch { return; } // liveness unknown -> wait a tick
  for (const file of files) {
    const path = join(EFFECTS_DIR, file);
    let marker;
    try { marker = JSON.parse(readFileSync(path, 'utf8')); } catch { try { unlinkSync(path); } catch {} continue; }
    if (live.has(marker.id)) continue; // session still running -> its effect runs after it finishes
    console.log(\`[loop] post-session effect: \${marker.agent} (\${marker.id}) -> \${marker.effect} in \${marker.worktree}\`);
    spawnSync('bun', [marker.effect], { cwd: marker.worktree, stdio: 'inherit', env: Object.assign({}, process.env, marker.env) });
    try { unlinkSync(path); } catch {}
  }
}
const idleSince = new Map();
let lastTick = 0;
// PAUSE GATE, continuous mode: re-checked every heartbeat (not cached), so a marker created/removed
// mid-run takes effect on the very next poll. Logged at most once per STATE CHANGE (not every heartbeat),
// so a paused loop doesn't spam its own log while idling.
let paused = false;
while (true) {
  const now = Date.now();
  const nowPaused = existsSync(PAUSED);
  if (nowPaused !== paused) {
    console.error(nowPaused ? pausedMessage() : '[loop] unpaused — resuming ticks.');
    paused = nowPaused;
  }
  if (now - lastTick >= intervalMs) {
    if (!paused) fireTick();
    lastTick = Date.now();
  }
  if (runner) {
    try {
      const reaped = await runner.reapIdle({ idleMs: IDLE_REAP_MS, agents, since: idleSince });
      for (const r of reaped) console.log(\`[loop] reaped idle \${r.agent} (\${r.id})\`);
      await reconcilePendingEffects(runner); // run finished proposers' effects (the post-skill step's local twin)
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
// A cron agent (AUTONOMY_SINGLETON) is single-instance: skip this tick if one is already ACTIVELY in flight
// (running or awaiting-human), so fresh ticks don't pile up sessions while the prior one is still working —
// the local analogue of github's job concurrency. A finished/idle session does not block (it is reaped, and
// a fresh tick re-reads state), so the loop keeps ticking.
if (process.env.AUTONOMY_SINGLETON) {
  try {
    const all = JSON.parse(spawnSync('node', [runner, 'list'], { encoding: 'utf8' }).stdout || '[]');
    const busy = all.filter((s) => s.agent === agent && (s.status === 'running' || s.status === 'paused'));
    if (busy.length) { console.log(\`[run-agent] \${agent} already in flight (\${busy.length}); skipping this tick\`); process.exit(0); }
  } catch { /* backend unavailable -> fall through and try the launch */ }
}
const timeout = Number(process.env.TERMFLEET_LAUNCH_TIMEOUT_MS || RUNNER_DEFAULTS.launchTimeoutMs);
const r = spawnSync('node', [runner, 'launch', agent, ...params], { stdio: 'inherit', timeout, env });
process.exit(r.error?.code === 'ETIMEDOUT' ? 0 : (r.status ?? 1));
`;

// The pause marker (OA-07). Self-describing content: an operator who stumbles on the file (not just one
// who reads the docs) understands why it's paused and the exact unpause command. Seeded ONLY on a fresh
// install (compileLocal's freshInstall check below) and NEVER re-added by a re-compile/upgrade — an
// operator's `rm .open-autonomy/paused` is the intended interaction and must survive every future compile.
const PAUSED_MARKER = `This open-autonomy install is PAUSED (fresh installs start paused so a pre-existing
backlog is never dispatched before you review it).
Review your board first — on a populated tracker, decide which issues the loop may work
(see policy.dispatch in .open-autonomy/autonomy.yml and docs/OPERATIONS.md step 5).
Unpause:  rm .open-autonomy/paused
`;

// Per-agent launch prompts for SKILL agents, split by harness: codex invokes the skill with `$name`,
// Claude Code with `/name` — where the name is the skill's OWN id (its behavior = the SKILL.md folder +
// frontmatter `name` it is installed under in .codex/skills/ and .claude/skills/), so the trigger
// actually resolves. Keyed by role: the schedule launches `AUTONOMY_AGENT=<role>`, which selects
// prompts/<harness>/<role>.txt. Script agents run via bun and need no launch prompt.
function promptFiles(ir: AutonomyIR): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, agent] of Object.entries(ir.agents)) {
    // A kind:human actor has no harness to invoke — there is no model to hand a `/name`/`$name` prompt to
    // (the runner's human route parks a session instead; see runner-frontend.ts). Skip it like a script.
    if (isScript(agent.behavior) || isHuman(agent)) continue;
    out[`scripts/prompts/codex/${role}.txt`] = `$${agent.behavior}\n`;
    out[`scripts/prompts/claude/${role}.txt`] = `/${agent.behavior}\n`;
  }
  return out;
}

export function compileLocal(ir: AutonomyIR, opts: { runner?: RunnerName; destDir?: string } = {}): CompileOutput {
  const runner = opts.runner ?? 'termfleet';
  if (!SUPPORTED_RUNNERS.includes(runner)) {
    throw new Error(`unsupported runner "${runner}"; supported: ${SUPPORTED_RUNNERS.join(', ')}`);
  }
  // Fresh-install detection for the pause marker (OA-07): "fresh" = no `.open-autonomy/generated.json` in
  // destDir yet — the exact signal `readGeneratedManifest` already treats as "no prior install" (the same
  // one upgrade's prune relies on). No destDir given (an in-memory compile: a dry-run print, a unit test,
  // lint/bench's own disposable cells) is treated as fresh, matching the common case.
  const freshInstall = !opts.destDir || !existsSync(join(opts.destDir, GENERATED_MANIFEST_PATH));

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
  generated['scripts/runner.ts'] = runnerFrontendSrc();
  generated['scripts/run-agent.mjs'] = RUN_AGENT_DRIVER;
  generated['scripts/autonomy-runner.mjs'] = runnerBackendSrc();
  // The single source of the runner's defaults (harness, cli, provider url, timeout). The vendored .mjs
  // runtime imports this instead of re-hardcoding literals; TERMFLEET_* env vars override at runtime.
  generated['scripts/runner-defaults.mjs'] = runnerDefaultsModule();

  // NOTE: the ztrack loop Stop hook (.claude/settings.json) is NOT emitted here. It is Claude Code harness
  // config — what the AGENT does (drive-to-green), identical wherever Claude Code runs — so it belongs to the
  // PROFILE, carried as a resource by the ztrack-using profiles (simple-sdlc, simple-gh-sdlc), and installed
  // on every runner. The runner is launch + isolate + schedule + lifecycle; it does not inject methodology.

  // The local driver: a loop that fires each cron agent on an interval (github used `on: schedule`).
  // Each runs its own behavior via bun, exactly as its github job runs `bun <behavior>`.
  // Exclude a kind:human actor even if it (unusually) carries a cron — a person is never ticked by the
  // loop; it is DISPATCHED (see the runner's human route) when another actor routes work to it.
  const cronAgents = Object.entries(ir.agents).filter(([, a]) => cronOf(a) && !isHuman(a));
  const intervalSeconds = cronAgents[0] ? cronToSeconds(cronOf(cronAgents[0][1]) as string) : 900;
  generated['scheduler/run.mjs'] = LOOP_DRIVER;
  // A script agent runs its behavior via bun; a prose-skill agent is launched through the runner.
  const scheduleScripts = cronAgents.map(([role, a]) =>
    // A prose cron agent (the PM) is single-instance per tick (AUTONOMY_SINGLETON) — see run-agent.mjs. A
    // script agent is a fast deterministic run, no guard needed.
    isScript(a.behavior) ? `bun ${a.behavior}` : `AUTONOMY_AGENT=${role} AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs`,
  );
  // A github code host's propose effect is NOT scheduled here — it is a per-session lifecycle effect the loop
  // driver runs when a proposer's session finishes (see LOOP_DRIVER's reconcilePendingEffects + runner.ts's
  // effect markers), mirroring github's post-skill job step. A local-git code host has no PRs (the PM merges).
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
      // A kind:human actor's behavior is ALSO a prose folder (a task spec, not a script), so it falls
      // through this same `!isScript` branch and its SKILL.md is copied too — mirroring github
      // (compileGithub copies every actor's skill unconditionally): the file is never launched here, but
      // it is the doctrine an `engage` hands the person (see runner-frontend.ts's human route). No
      // separate kind check needed — the copy decision is already "any non-script behavior".
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
    // npm strips files literally named `.gitignore` from a published package, so a profile ships that
    // resource's content under the name `gitignore` (no dot) and we emit it back to `.gitignore` — same
    // mapping compileGithub applies. Without this, a profile that carries `.gitignore` (e.g. self-driving)
    // fails to compile to a local install.
    if (keepCodeHostWorkflows || !r.startsWith('.github/')) copies.push({ from: r === '.gitignore' ? 'gitignore' : r, to: r });
  }
  const compiled = withGeneratedManifest({ generated, copies });
  // The pause marker is added AFTER withGeneratedManifest computes `.open-autonomy/generated.json`'s file
  // list — deliberately: it must never be recorded there. Prune (packages/core/src/upgrade.ts) only ever
  // deletes paths the manifest lists as open-autonomy-generated, so a marker that never enters the
  // manifest can never be treated as an orphan and silently pruned (which would silently UNPAUSE a running
  // install). It is written to disk on a fresh install only (materialize() writes whatever's in
  // `.generated`); a re-compile/upgrade of an EXISTING install (freshInstall === false) never adds this
  // key at all, so it neither resurrects a removed marker nor clobbers a still-present one — the file is
  // simply outside that compile's output entirely, matching INSTALL_OWNED_PATHS's seed-once contract
  // (packages/core/src/upgrade.ts) if it's ever routed through the generic upgrade machinery instead.
  if (freshInstall) compiled.generated['.open-autonomy/paused'] = PAUSED_MARKER;
  return compiled;
}
