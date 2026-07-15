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
import { GENERATED_MANIFEST_PATH, cronOf, emitAutonomy, enforcementReport, isScript, withGeneratedManifest } from '@open-autonomy/core';
import type { AutonomyIR, CompileOutput, IRAgent } from '@open-autonomy/core';
import { SUPPORTED_RUNNERS, type RunnerName } from '@open-autonomy/core';
// Only the shared portable runtime is borrowed from the github substrate (its neutral relocation is the
// remaining de-vendor work); the manifest serialization + IR helpers now come from core, so local's emit
// no longer depends on github's emit.
import { runtimeFiles } from '@open-autonomy/substrate-github';
import { runnerDefaultsModule } from './runner-config';
import { reconcileOpenChecksSrc, reconcileOpenReviewsSrc, reconcileReadyBranchesSrc } from './reconcilers';

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

// Compile a scheduled actor's declared execution contract into the generic Runner seam. Isolation is
// launch mechanics only: it neither selects a role nor asks for a proposal/PR. Existing profiles that omit
// execution keep the historical direct shared-checkout launch unchanged.
function scheduledCommand(role: string, agent: IRAgent, fence = '.open-autonomy/paused'): string {
  if (isScript(agent.behavior)) return `bun ${agent.behavior}`;
  if (agent.execution?.workspace === 'isolated')
    return `AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch ${role} --workspace isolated --fence ${fence}`;
  return `AUTONOMY_AGENT=${role} AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs`;
}

export interface LocalScheduleJobConfig {
  fence?: string;
  retrySeconds?: number;
}

/** Local-substrate configuration supplied by the adopter/compiler invocation, never by profile policy.
 * It changes only when generic jobs retry and which durable marker fences them; agent methodology stays
 * in skills and task/code-host behavior stays out of the scheduler. */
export interface LocalScheduleConfig {
  schema: 'open-autonomy.local-schedule-config.v1';
  defaults?: LocalScheduleJobConfig;
  agents?: Record<string, LocalScheduleJobConfig>;
  effects?: LocalScheduleJobConfig;
}

function validatedJobConfig(value: unknown, where: string): LocalScheduleJobConfig {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${where} must be an object`);
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input))
    if (key !== 'fence' && key !== 'retrySeconds')
      throw new Error(`${where}.${key} is unknown (allowed: fence, retrySeconds)`);
  if (input.fence !== undefined) {
    if (typeof input.fence !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(input.fence) || input.fence.startsWith('/') || input.fence.split('/').includes('..'))
      throw new Error(`${where}.fence must be a safe relative path`);
  }
  if (input.retrySeconds !== undefined && (!Number.isInteger(input.retrySeconds) || Number(input.retrySeconds) < 0))
    throw new Error(`${where}.retrySeconds must be a non-negative integer`);
  return {
    ...(input.fence !== undefined ? { fence: input.fence } : {}),
    ...(input.retrySeconds !== undefined ? { retrySeconds: Number(input.retrySeconds) } : {}),
  };
}

function validateScheduleConfig(ir: AutonomyIR, value: LocalScheduleConfig | undefined): LocalScheduleConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('local schedule config must be an object');
  if (value.schema !== 'open-autonomy.local-schedule-config.v1')
    throw new Error('local schedule config schema must be open-autonomy.local-schedule-config.v1');
  for (const key of Object.keys(value))
    if (key !== 'schema' && key !== 'defaults' && key !== 'agents' && key !== 'effects')
      throw new Error(`local schedule config.${key} is unknown (allowed: defaults, agents, effects)`);
  validatedJobConfig(value.defaults, 'local schedule config.defaults');
  validatedJobConfig(value.effects, 'local schedule config.effects');
  if (value.agents !== undefined && (!value.agents || typeof value.agents !== 'object' || Array.isArray(value.agents)))
    throw new Error('local schedule config.agents must be an object keyed by scheduled agent name');
  const scheduled = new Set(Object.entries(ir.agents).filter(([, agent]) => cronOf(agent) && !isHuman(agent)).map(([name]) => name));
  for (const [name, config] of Object.entries(value.agents ?? {})) {
    if (!scheduled.has(name))
      throw new Error(`local schedule config.agents.${name} does not name a scheduled agent`);
    validatedJobConfig(config, `local schedule config.agents.${name}`);
  }
  return value;
}

function mergedJobConfig(baseRetrySeconds: number, defaults: LocalScheduleJobConfig | undefined, specific: LocalScheduleJobConfig | undefined): Required<LocalScheduleJobConfig> {
  return {
    fence: specific?.fence ?? defaults?.fence ?? '.open-autonomy/paused',
    retrySeconds: specific?.retrySeconds ?? defaults?.retrySeconds ?? baseRetrySeconds,
  };
}

function installedScheduleFences(destDir: string | undefined): Set<string> {
  if (!destDir) return new Set();
  try {
    const schedule = JSON.parse(readFileSync(join(destDir, 'scheduler', 'schedule.json'), 'utf8')) as {
      jobs?: Array<{ fence?: unknown }>;
    };
    return new Set((schedule.jobs ?? []).flatMap((job) => typeof job.fence === 'string' ? [job.fence] : []));
  } catch {
    return new Set();
  }
}

// Inverse of secondsToCron for the simple every-N-minutes cron form the local loop honors.
export function cronToSeconds(cron: string): number {
  const value = cron.trim();
  let match = /^\*\/(\d+) \* \* \* \*$/.exec(value);
  if (match) return Number(match[1]) * 60;
  match = /^\d+ \*\/(\d+) \* \* \*$/.exec(value);
  if (match) return Number(match[1]) * 3600;
  if (/^\d+ \d+ \* \* \*$/.test(value)) return 86400;
  if (/^\d+ \d+ \* \* [\d,-]+$/.test(value)) return 7 * 86400;
  if (/^\d+ \d+ [\d,-]+ \* \*$/.test(value)) return 28 * 86400;
  return 900;
}

// The loop driver: fires the schedule's commands every interval, and (continuous mode) reaps idle agent
// sessions so finished cron ticks don't pile up. A cron tick is ephemeral by design — each fires a FRESH
// agent that re-reads state; this is the local analogue of a github job, which terminates when done.
// Locally nothing closes the interactive termfleet window, so the loop reaps it: a session that has been
// IDLE (termfleet `session_waiting`, no attention signal) for AUTONOMY_IDLE_REAP_MS is closed. A session
// still working (running / background-running), one a human took over, or one asking/errored is never
// reaped — keeping the "take over at any time" guarantee. `--once` fires a single tick and exits (no reap).
const LOOP_DRIVER = `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const SCHEDULE = process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json';
const args = process.argv.slice(2);
const schedule = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
// Jobs are the only emitted schedule contract. Accept historical scripts for upgrades, but never require
// a profile policy flag to select a scheduler implementation.
const jobs = Array.isArray(schedule.jobs)
  ? schedule.jobs
  : (schedule.scripts || []).map((command, index) => ({
      name: 'job-' + (index + 1), command, intervalSeconds: schedule.intervalSeconds || 900,
      fence: '.open-autonomy/paused',
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = args.includes('--once');
const dispatchIndex = args.indexOf('--dispatch');
if (once && dispatchIndex !== -1) {
  console.error('[loop] choose either --once or --dispatch <job>, not both.');
  process.exit(2);
}

// PAUSE GATE (OA-07): fences belong to jobs, not to the loop as a whole. The default schedule still uses
// .open-autonomy/paused for every job, while adopter target config may give groups independent markers.
// Evaluate the markers at tick-fire time so creating/removing one takes effect without restarting the loop.
const fencePath = (job) => job.fence ? join(here, '..', job.fence) : null;
const blockedFences = () => new Set(jobs.flatMap((job) => {
  const path = fencePath(job);
  return path && existsSync(path) ? [job.fence] : [];
}));
const pausedMessage = (fences) =>
  '[loop] PAUSED — scheduled jobs are blocked by ' + [...fences].join(', ') + '.\\n' +
  '[loop] remove only the fence(s) whose jobs you intend to run:  ' + [...fences].map((f) => 'rm ' + f).join('   ');

let dispatchJob = null;
if (dispatchIndex !== -1) {
  const target = (args[dispatchIndex + 1] || '').trim();
  if (!target || target.startsWith('--')) {
    console.error('[loop] usage: scheduler/run.mjs --dispatch <job-name-or-agent>');
    process.exit(2);
  }
  const byName = jobs.filter((job) => job.name === target);
  const matches = byName.length ? byName : jobs.filter((job) => job.agent === target);
  if (matches.length !== 1) {
    const detail = matches.length ? 'matched ' + matches.length + ' jobs' : 'matched no declared job';
    console.error('[loop] cannot dispatch "' + target + '": ' + detail + '.');
    process.exit(2);
  }
  [dispatchJob] = matches;
  const path = fencePath(dispatchJob);
  if (path && existsSync(path)) {
    console.error(pausedMessage(new Set([dispatchJob.fence])));
    process.exit(1);
  }
}

// In --once mode an entirely fenced schedule is a deterministic no-op and reports that before optional
// runner dependency checks. A partially fenced schedule continues: only its unfenced jobs are eligible.
if (once) {
  const fences = blockedFences();
  if (jobs.length > 0 && jobs.every((job) => {
    const path = fencePath(job);
    return path && existsSync(path);
  })) {
    console.error(pausedMessage(fences));
    process.exit(1);
  }
}

// A schedule command that launches a skill (prose) agent goes through run-agent.mjs -> the runner (the
// termfleet SDK) — a peer dep this loop drives but does NOT vendor. Before this check, a schedule fired
// before \`npm install termfleet\` died several process-hops deep with a raw, buried ERR_MODULE_NOT_FOUND
// (the FIRST command an adopter runs, per docs/OPERATIONS.md: \`node scheduler/run.mjs --once\`). A
// script-only schedule (every agent a deterministic scripts/*.ts behavior) never touches the runner, so
// the check is scoped to schedules that actually need it — never a false alarm on one that doesn't.
const eligibleJobs = dispatchJob ? [dispatchJob] : jobs;
const needsRunner = eligibleJobs.some((job) => {
  if (!/scripts\\/(?:run-agent\\.mjs|runner\\.ts)/.test(job.command)) return false;
  // A one-shot run never reaches a fenced job, so don't mask useful partial-fence behavior with a
  // dependency that only the blocked group would need. Continuous mode may later be unfenced in place.
  const path = fencePath(job);
  return !once || !path || !existsSync(path);
});
if (needsRunner) {
  const repoRoot = join(here, '..');
  const termfleetDir = join(repoRoot, 'node_modules', 'termfleet');
  if (!existsSync(termfleetDir)) {
    console.error(
      '[loop] this schedule launches a skill agent through the runner, but termfleet is not installed in this repo.\\n' +
        '  Fix:  npm install termfleet   (the local runner drives it via its SDK — see docs/OPERATIONS.md#local-runner-quickstart)',
    );
    process.exit(1);
  }
  // OA-04 (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md): node_modules/termfleet
  // EXISTING is not enough — an npm workspace can symlink a runner-dependency path to the HOST's own
  // in-development source (shadowing), or this repo's own root package.json can itself be named one of the
  // runner's imported specifiers (Node ESM self-reference). Either way the runner would load the wrong code
  // — sometimes silently. So resolve each specifier the runner ACTUALLY imports the way it will at launch
  // (\`import.meta.resolve\` from this repo's root, in a fresh child \`node\`) and refuse unless it lands on a
  // REAL copy inside node_modules/ — the same authoritative probe \`preflight\`/\`compile\` run (Check C in
  // bin/collision-check.ts), inlined here (NOT imported — this file ships dependency-free plain Node into
  // every install; it must never \`import\` from bin/). Probes the SAME specifiers as Check C — critically
  // \`@termfleet/core/local-providers.js\`, not just \`termfleet\`: a workspace member named \`@termfleet/core\`
  // added AFTER install leaves \`termfleet\` resolving fine while \`@termfleet/core\` shadows, so the run would
  // otherwise still die hops-deep with ERR_PACKAGE_PATH_NOT_EXPORTED (audit mode (a)) at this last chokepoint.
  const nodeModulesRoot = join(repoRoot, 'node_modules');
  const RUNNER_SPECS = [
    ['termfleet', 'termfleet'],
    ['@termfleet/core', '@termfleet/core/local-providers.js'],
  ];
  const firstErrLine = (s) => {
    const lines = (s || '').split('\\n').map((l) => l.trim()).filter(Boolean);
    // Prefer the thrown 'Error [ERR_*]: <msg>' line over the 'return new ERR_*(' code-frame line (which
    // also contains an ERR_ token a few frames up), else the first non-empty line.
    return lines.find((l) => /^Error\\b/.test(l)) || lines.find((l) => /\\bERR_[A-Z_]+/.test(l)) || lines[0] || 'no error output';
  };
  const probeSpec = (name, spec) => {
    const pkgDir = join(nodeModulesRoot, name);
    if (!existsSync(join(pkgDir, 'package.json'))) return null; // not installed -> nothing to probe (termfleet handled above)
    const probe = spawnSync(
      'node',
      ['--input-type=module', '-e', "console.log(import.meta.resolve(process.argv[1]))", spec],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    if (probe.status !== 0) return '"' + spec + '" failed to resolve (' + firstErrLine(probe.stderr) + ')';
    let resolvedPath;
    try {
      resolvedPath = fileURLToPath((probe.stdout || '').trim());
    } catch {
      return 'could not parse the resolved specifier for "' + spec + '": ' + (probe.stdout || '').trim();
    }
    const expectedPrefix = pkgDir + sep;
    if (resolvedPath !== pkgDir && !resolvedPath.startsWith(expectedPrefix)) {
      return '"' + spec + '" resolved OUTSIDE node_modules/' + name + '/ (to ' + resolvedPath + ') — a self-reference, not the installed package';
    }
    // realpathSync-escape branch: reached when resolution DID land string-wise inside node_modules/<name>/
    // but the dir is a symlink whose real target escapes into the repo tree. With Node's default
    // realpath-on resolution the OUTSIDE branch above already fires for a symlink, so this is the defense
    // for a run under NODE_OPTIONS=--preserve-symlinks (resolution keeps the symlink path, so only the
    // realpath reveals the escape) — kept because that mode is real and cheap to cover.
    let real = pkgDir;
    try {
      real = realpathSync(pkgDir);
    } catch {
      /* leave as pkgDir */
    }
    if (real !== nodeModulesRoot && !real.startsWith(expectedPrefix) && !real.startsWith(nodeModulesRoot + sep)) {
      return '"' + name + '" is installed via a link that escapes node_modules into this repo (realpath ' + real + ')';
    }
    return null;
  };
  for (const [name, spec] of RUNNER_SPECS) {
    const collisionDetail = probeSpec(name, spec);
    if (collisionDetail) {
      console.error(
        '[loop] COLLISION: a runner dependency does not resolve to the published package this repo depends on — ' +
          collisionDetail +
          '.\\n' +
          '  This means either (a) this repo\\'s own root package.json is itself named a runner dependency (Node ESM\\n' +
          '  self-reference binds the bare import to THIS repo instead of node_modules/), or (b) an npm workspace\\n' +
          '  member is named "termfleet"/"@termfleet/core"/a runner dependency and its symlink shadows the published copy.\\n' +
          '  Consequence: the runner would load this repo\\'s own dev code as the runner SDK, or crash several hops\\n' +
          '  deep. Fix: rename the colliding workspace/root package, or run the loop from a repo that does not\\n' +
          '  itself develop the runner\\'s own dependencies. npm has NO flag to prefer the registry copy over a\\n' +
          '  workspace link — there is no in-place override. (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md)',
      );
      process.exit(1);
    }
  }

  // OA-09: log the EFFECTIVE provider URL + its ORIGIN once, before any tick fires — a misattachment (an
  // ambient/current-context/foreign-auto-discovered provider silently taking this loop's launches) is now
  // visible in the very first line of output instead of never. Origin is one of: \`env\` (an ambient
  // TERMFLEET_PROVIDER_URL — beats everything else per the documented override doctrine), \`schedule\` (the
  // durable --provider-url compile pin, this file's schedule.json env, above), \`current-context\` (a
  // machine-global \`termfleet use\`), or \`auto-local\` (zero-config live discovery). The pin cases resolve
  // with NO network call (mirrors resolveDefaultProvider's own \`if (url) return\` fast path below); only the
  // unpinned branch calls the SDK's real discovery (reads ~/.termfleet + probes each candidate's /healthz).
  //
  // CRITICAL (skeptic-panel Blocker 2): this must be derived from the SAME effective values \`buildTickEnv\`
  // passes to launched children, or the log LIES. A set-but-EMPTY ambient TERMFLEET_PROVIDER_URL (the
  // \`VAR= node scheduler/run.mjs\` idiom) is falsy but was NOT unset — the old \`if (process.env.X)\` read it
  // as "no pin -> use schedule", yet the tick's merge (\`Object.assign({}, schedule.env, process.env)\`) let
  // that empty string OVERRIDE the schedule pin, so the child auto-discovered while this line claimed the pin
  // held. Fix: TRIM both sides (empty/whitespace ⇒ unset), identically to buildTickEnv's normalization.
  const ambientPin = (process.env.TERMFLEET_PROVIDER_URL || '').trim();
  const schedulePin = ((schedule.env && schedule.env.TERMFLEET_PROVIDER_URL) || '').trim();
  let providerUrl;
  let providerSource;
  if (ambientPin) {
    providerUrl = ambientPin;
    providerSource = 'env';
  } else if (schedulePin) {
    providerUrl = schedulePin;
    providerSource = 'schedule';
  } else {
    try {
      const { resolveDefaultProvider } = await import('@termfleet/core/local-providers.js');
      const resolved = await resolveDefaultProvider({});
      providerUrl = resolved.baseUrl;
      providerSource = resolved.source;
    } catch (e) {
      console.error(\`[loop] provider: none resolved yet (\${e?.message ?? e}) — will be resolved (or fail loudly) at launch time.\`);
    }
  }
  if (providerUrl) {
    // stderr, matching this file's own convention for diagnostic lines (PAUSED/COLLISION above) — stdout
    // here carries no structured output of its own, but keeping ALL of the loop's own log noise off stdout
    // is what lets a future consumer safely pipe/parse this process's stdout.
    console.error(\`[loop] provider \${providerUrl} (\${providerSource})\`);
    // Re-export the ORIGIN as a hint (AUTONOMY_PROVIDER_URL_SOURCE) so a NESTED resolve — this tick's
    // run-agent.mjs -> autonomy-runner.mjs, or any nested \`runner.ts launch ...\` — can
    // report the same schedule-vs-env distinction. By the time those processes run, schedule.env and
    // process.env are already merged (fireTick below / runner-frontend.ts's own env spread), so this is the
    // only point that still knows which side the pin came from. Matched by the AUTONOMY.* export filter in
    // backend.mjs/runner.ts's launch(), so it also propagates transitively into launched agent sessions.
    process.env.AUTONOMY_PROVIDER_URL_SOURCE = providerSource;
  }
}

// The uncommitted-harness guard (OA-03): agents launched with \`--branch\` run in git WORKTREES, which
// materialize only COMMITTED files. If the compiled harness isn't committed, every worker dies instantly
// inside its tmux session with \`Unknown command: /develop\` — and nothing upstream ever sees it (the dead
// session reads as 'done'). Same shape as the termfleet guard just above: plain spawnSync, no-op when the
// precondition doesn't apply, refuse-with-names otherwise. Runs once, before the first tick, in both
// --once and continuous mode — the earliest point that can stop a scheduled agent and all of its
// downstream launches with one message. The manifest (.open-autonomy/generated.json) is the authoritative, exact list
// of what compile wrote — never a guess, never a scan of user files.
const GENERATED_MANIFEST = join(here, '..', '.open-autonomy', 'generated.json');
const isGitRepo = spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0;
if (isGitRepo && existsSync(GENERATED_MANIFEST)) {
  let manifestFiles = [];
  try {
    const manifest = JSON.parse(readFileSync(GENERATED_MANIFEST, 'utf8'));
    manifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
  } catch {
    manifestFiles = [];
  }
  if (manifestFiles.length) {
    // Two spawns, both scoped to exactly the manifest's paths (user files are never inspected):
    //   1. \`git status --porcelain\` -> the modified/added/deleted/untracked-unignored set ("uncommitted").
    //   2. \`git ls-files\` -> the tracked set.
    // A manifest path that is UNTRACKED yet ABSENT from the status output is, by elimination, GITIGNORED —
    // \`git status\` silently omits ignored files even when named in the pathspec (and \`--ignored\` collapses
    // an ignored dir to one '!! dir/' entry, losing the file names, so it can't name paths either). That is
    // the worst case for this guard's purpose: a worktree will not contain the file either, so it must
    // REFUSE too, with \`git add -f\` remediation. A path that is TRACKED (committed once, even \`add -f\`ed
    // past an ignore rule) and unmodified is CLEAN: worktrees materialize tracked files regardless of
    // ignore rules, so those are never nagged.
    const status = spawnSync('git', ['status', '--porcelain', '--', ...manifestFiles], { encoding: 'utf8' });
    const statusPaths = (status.stdout || '')
      .split('\\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const raw = line.slice(3);
        return raw.includes(' -> ') ? raw.slice(raw.lastIndexOf(' -> ') + 4) : raw; // a rename entry names the NEW path
      });
    const lsFiles = spawnSync('git', ['ls-files', '--', ...manifestFiles], { encoding: 'utf8' });
    const tracked = new Set((lsFiles.stdout || '').split('\\n').filter((l) => l.length > 0));
    const statusSet = new Set(statusPaths);
    const untrackedSilent = manifestFiles.filter((f) => !tracked.has(f) && !statusSet.has(f));
    const ignored = untrackedSilent.filter((f) => existsSync(join(here, '..', f)));
    // Untracked + absent from status + absent from disk = never even written (a corrupted/hand-pruned
    // install) — not committable as-is, still refuse and name it under "uncommitted".
    const dirty = statusPaths.concat(untrackedSilent.filter((f) => !existsSync(join(here, '..', f))));
    if (dirty.length || ignored.length) {
      const lines = [
        '[loop] the open-autonomy harness is not (fully) committed — agents run in git worktrees, which only',
        '  see committed files; launching now would produce workers that die at launch (Unknown command: /develop).',
      ];
      if (dirty.length) lines.push('  uncommitted (' + dirty.length + '):', ...dirty.map((f) => '    ' + f));
      if (ignored.length)
        lines.push(
          '  gitignored (' + ignored.length + ') — matched by .gitignore so NOT tracked; a worktree will not contain these either:',
          ...ignored.map((f) => '    ' + f),
        );
      lines.push(
        '  Fix:  git add ' + (ignored.length ? '-f ' : '') + '<the paths above>  &&  git commit -m "Install the open-autonomy harness"' +
          (ignored.length ? '   (-f stages past .gitignore; or un-ignore the harness paths)' : ''),
        '  (docs/OPERATIONS.md#local-runner-quickstart, step 4. Override: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1)',
      );
      if (process.env.AUTONOMY_ALLOW_UNCOMMITTED_HARNESS === '1') {
        console.error(
          ['[loop] WARNING — AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1: proceeding with an uncommitted harness.']
            .concat(lines)
            .join('\\n'),
        );
      } else {
        console.error(lines.join('\\n'));
        process.exit(1);
      }
    }
  }
}

// The env each tick passes to a launched command. Precedence (UNCHANGED, documented doctrine): ambient
// process.env overrides schedule.env. One normalization (OA-09 Blocker 2): a set-but-EMPTY ambient
// TERMFLEET_PROVIDER_URL is treated as UNSET so it can't SHADOW a real schedule pin — the SDK itself treats
// '' as unset, and \`VAR= node scheduler/run.mjs\` is a plausible operator idiom, so an empty ambient value
// dropping the compiled pin (and sending the child to auto-discovery) would be a silent misattachment the
// startup log above would even MISreport. The [loop] provider line is derived from these same effective
// values, so the two can never disagree about what the child actually receives.
const buildTickEnv = () => {
  const env = Object.assign({}, schedule.env, process.env);
  if (typeof process.env.TERMFLEET_PROVIDER_URL === 'string' && process.env.TERMFLEET_PROVIDER_URL.trim() === '') {
    if (schedule.env && schedule.env.TERMFLEET_PROVIDER_URL) env.TERMFLEET_PROVIDER_URL = schedule.env.TERMFLEET_PROVIDER_URL;
    else delete env.TERMFLEET_PROVIDER_URL;
  }
  return env;
};

// D2 fix (post-review, TC.3): automatic --once/continuous fires use AUTONOMY_TRIGGER_KIND=cron, while the
// explicit --dispatch path below passes \`dispatch\`. A launched agent can therefore distinguish scheduler
// cadence from an operator request even though both enter through the same declared-job executor.
// AUTONOMY_SINGLETON alone is NOT that signal: it is baked
// into schedule.json's own command STRING (see scheduleScripts below), so it is present on every re-fire of
// that exact command line regardless of who fires it — including \`oa dispatch <agent>\`, which fires the
// identical schedule-line string on purpose. An agent whose own cadence must differ from "every shared tick"
// (e.g. a low-frequency cron self-throttle) needs a signal that is true ONLY on the scheduler's own
// automatic fire, never on an explicit human dispatch of the same command — this is that signal.
const activeSessionCount = (env) => {
  try {
    const output = spawnSync('node', [join(here, '..', 'scripts', 'autonomy-runner.mjs'), 'list'], { encoding: 'utf8', env });
    if (output.status !== 0 || output.error) return null;
    const sessions = JSON.parse(output.stdout || '[]');
    if (!Array.isArray(sessions)) return null;
    const scheduled = new Set(jobs.map((job) => job.agent).filter(Boolean));
    return sessions.filter((session) => scheduled.has(session.agent) &&
      (session.status === 'running' || session.status === 'paused' || session.status === 'awaiting-human')).length;
  } catch { return null; }
};
const fireJobs = (dueJobs, { triggerKind = 'cron', reportSkips = false } = {}) => {
  const env = Object.assign({}, buildTickEnv(), { AUTONOMY_TRIGGER_KIND: triggerKind });
  const maxConcurrent = Number(schedule.maxConcurrent || Number.POSITIVE_INFINITY);
  let active = Number.isFinite(maxConcurrent) ? activeSessionCount(env) : 0;
  const results = [];
  const skipped = [];
  for (const job of dueJobs) {
    if (job.fence && existsSync(join(here, '..', job.fence))) {
      skipped.push({ job, reason: 'fenced by ' + job.fence });
      continue;
    }
    // A declared cap is a hard control. If liveness cannot be established, fail closed for
    // agent launches rather than treating an unavailable provider as an empty provider.
    if (job.agent && active === null) {
      skipped.push({ job, reason: 'runner liveness is unavailable while maxConcurrent is enforced' });
      continue;
    }
    if (job.agent && active >= maxConcurrent) {
      skipped.push({ job, reason: 'maxConcurrent ' + maxConcurrent + ' is already reached' });
      continue;
    }
    const result = spawnSync(job.command, { shell: true, stdio: 'inherit', env });
    if (job.agent && result.status === 0 && !result.error) active += 1;
    results.push({ job, result });
  }
  if (reportSkips) {
    for (const skippedJob of skipped)
      console.error('[loop] dispatch refused for "' + skippedJob.job.name + '": ' + skippedJob.reason + '.');
  }
  return { results, skipped };
};

if (dispatchJob) {
  const { results } = fireJobs([dispatchJob], { triggerKind: 'dispatch', reportSkips: true });
  if (!results.length) process.exit(1);
  const [{ result }] = results;
  process.exit(result.error ? 1 : (result.status ?? 1));
}

if (once) {
  fireJobs(jobs);
  process.exit(0);
}

// Continuous mode: a fast heartbeat that fires ticks on the schedule interval and reaps idle sessions in
// between. The runner (termfleet SDK) does the reaping; we keep the persistent idle-since map here.
const IDLE_REAP_MS = Number(process.env.AUTONOMY_IDLE_REAP_MS ?? 60000);
const POLL_MS = Math.max(1000, Number(process.env.AUTONOMY_REAP_POLL_MS ?? 20000));
const nextFireAt = new Map(jobs.map((job) => [job.name, 0]));
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
const WORKSPACES_DIR = join(here, '..', '.open-autonomy', 'runner-state', 'workspaces');
const WORKSPACE_QUARANTINE_DIR = join(here, '..', '.open-autonomy', 'runner-state', 'workspace-quarantine');
// A provider may return a terminal ID before that terminal appears in list(). A fresh, never-observed lease
// is therefore not evidence of a finished session. Keep it through a bounded bootstrap window; once list()
// has observed the ID, disappearance is authoritative and normal cleanup can happen without waiting.
const configuredWorkspaceLeaseGraceMs = Number(process.env.AUTONOMY_WORKSPACE_LEASE_GRACE_MS ?? 120000);
const WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS = Number.isFinite(configuredWorkspaceLeaseGraceMs) && configuredWorkspaceLeaseGraceMs >= 0
  ? configuredWorkspaceLeaseGraceMs
  : 120000;
function markWorkspaceLeasesObserved(ids) {
  if (!ids.length) return;
  const wanted = new Set(ids);
  let files = [];
  try { files = readdirSync(WORKSPACES_DIR).filter((file) => file.endsWith('.json')); } catch { return; }
  const observedLiveAt = new Date().toISOString();
  for (const file of files) {
    const path = join(WORKSPACES_DIR, file);
    try {
      const lease = JSON.parse(readFileSync(path, 'utf8'));
      if (!wanted.has(lease.id) || lease.observedLiveAt) continue;
      writeFileSync(path, JSON.stringify(Object.assign({}, lease, { observedLiveAt }), null, 2) + '\\n');
    } catch {}
  }
}
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
    // A fresh co-located workspace lease means the provider may simply not list the new terminal yet.
    // Old effect markers without leases retain their historical immediate reconciliation behavior.
    try {
      const lease = JSON.parse(readFileSync(join(WORKSPACES_DIR, file), 'utf8'));
      const createdAt = Date.parse(lease.createdAt);
      if (!lease.observedLiveAt && Number.isFinite(createdAt) && Date.now() - createdAt < WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS) continue;
    } catch {}
    console.log(\`[loop] post-session effect: \${marker.agent} (\${marker.id}) -> \${marker.effect} in \${marker.worktree}\`);
    const result = spawnSync('bun', [marker.effect], { cwd: marker.worktree, stdio: 'inherit', env: Object.assign({}, process.env, marker.env) });
    if (result.status === 0 && !result.error) {
      try { unlinkSync(path); } catch {}
    } else {
      console.error(\`[loop] post-session effect failed; retaining \${file} for retry: \${result.error?.message ?? \`exit \${result.status ?? 'unknown'}\`}\`);
    }
  }
}
async function reconcileWorkspaceLeases(runner) {
  let files = [];
  try { files = readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith('.json')); } catch { return; }
  let live;
  try { live = new Set((await runner.list()).map((s) => s.id)); } catch { return; }
  const records = files.flatMap((file) => {
    const path = join(WORKSPACES_DIR, file);
    try { return [{ file, path, lease: JSON.parse(readFileSync(path, 'utf8')) }]; } catch { return []; }
  });
  const handled = new Set();
  for (const record of records) {
    const { lease } = record;
    if (handled.has(lease.worktree)) continue;
    handled.add(lease.worktree);
    const peers = records.filter((candidate) => candidate.lease.worktree === lease.worktree);
    const livePeers = peers.filter((peer) => live.has(peer.lease.id));
    for (const peer of livePeers) {
      if (peer.lease.observedLiveAt) continue;
      peer.lease.observedLiveAt = new Date().toISOString();
      try { writeFileSync(peer.path, JSON.stringify(peer.lease, null, 2) + '\\n'); } catch {}
    }
    if (livePeers.length || peers.some((peer) => existsSync(join(EFFECTS_DIR, peer.file)))) continue;
    const now = Date.now();
    const bootstrapping = peers.some((peer) => {
      if (peer.lease.observedLiveAt) return false;
      const createdAt = Date.parse(peer.lease.createdAt);
      return Number.isFinite(createdAt) && now - createdAt < WORKSPACE_LEASE_BOOTSTRAP_GRACE_MS;
    });
    if (bootstrapping) continue;
    if (!existsSync(lease.worktree)) { for (const peer of peers) try { unlinkSync(peer.path); } catch {} continue; }
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: lease.worktree, encoding: 'utf8' });
    if (status.status !== 0 || status.error || (status.stdout || '').trim()) {
      mkdirSync(WORKSPACE_QUARANTINE_DIR, { recursive: true });
      for (const peer of peers) {
        writeFileSync(join(WORKSPACE_QUARANTINE_DIR, peer.file), JSON.stringify({
          ...peer.lease,
          quarantinedAt: new Date().toISOString(),
          reason: status.status !== 0 || status.error ? 'git status failed' : 'worktree has uncommitted changes',
        }, null, 2) + '\\n');
        try { unlinkSync(peer.path); } catch {}
      }
      console.error(\`[loop] retained dirty workspace for \${lease.agent} (\${lease.id}): \${lease.worktree}\`);
      continue;
    }
    const removed = spawnSync('git', ['worktree', 'remove', lease.worktree], { cwd: join(here, '..'), encoding: 'utf8' });
    if (removed.status !== 0 || removed.error) continue;
    spawnSync('git', ['branch', '-D', lease.branch], { cwd: join(here, '..'), encoding: 'utf8' });
    for (const peer of peers) try { unlinkSync(peer.path); } catch {}
    console.log(\`[loop] cleaned workspace for \${lease.agent} (\${lease.id})\`);
  }
}
const idleSince = new Map();
// Report fence transitions once per marker state change. Job eligibility itself remains in fireJobs, so
// one fenced group never suppresses unrelated work and a marker change takes effect on the next heartbeat.
let lastBlockedFences = new Set();
while (true) {
  const now = Date.now();
  const currentBlockedFences = blockedFences();
  const addedFences = new Set([...currentBlockedFences].filter((f) => !lastBlockedFences.has(f)));
  const removedFences = [...lastBlockedFences].filter((f) => !currentBlockedFences.has(f));
  if (addedFences.size) console.error(pausedMessage(addedFences));
  if (removedFences.length) console.error('[loop] unpaused jobs fenced by: ' + removedFences.join(', '));
  lastBlockedFences = currentBlockedFences;
  const due = jobs.filter((job) => now >= (nextFireAt.get(job.name) || 0));
  for (const { job, result } of fireJobs(due).results) {
    const seconds = result.status === 0 && !result.error
      ? Number(job.intervalSeconds || schedule.intervalSeconds || 900)
      : Number(job.retrySeconds || job.intervalSeconds || schedule.intervalSeconds || 900);
    nextFireAt.set(job.name, Date.now() + seconds * 1000);
  }
  if (runner) {
    try {
      const reaped = await runner.reapIdle({ idleMs: IDLE_REAP_MS, agents, since: idleSince });
      for (const r of reaped) console.log(\`[loop] reaped idle \${r.agent} (\${r.id})\`);
      markWorkspaceLeasesObserved(reaped.map((result) => result.id));
      await reconcilePendingEffects(runner); // run finished proposers' effects (the post-skill step's local twin)
      await reconcileWorkspaceLeases(runner);
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
    const busy = all.filter((s) => s.agent === agent
      && (s.status === 'running' || s.status === 'paused' || s.status === 'awaiting-human'));
    if (busy.length) { console.log(\`[run-agent] \${agent} already in flight (\${busy.length}); skipping this tick\`); process.exit(0); }
  } catch { /* backend unavailable -> fall through and try the launch */ }
}
const timeout = Number(process.env.TERMFLEET_LAUNCH_TIMEOUT_MS || RUNNER_DEFAULTS.launchTimeoutMs);
const r = spawnSync('node', [runner, 'launch', agent, ...params], { stdio: 'inherit', timeout, env });
process.exit(r.error?.code === 'ETIMEDOUT' ? 0 : (r.status ?? 1));
`;

// A self-describing fence marker. Every distinct job fence is seeded ONLY on a fresh install and added
// after the generated manifest, so deleting one is durable operator state rather than a generated-file
// drift for compile/upgrade to resurrect. The historical default remains .open-autonomy/paused.
function pausedMarker(path: string): string {
  return `This open-autonomy schedule fence is PAUSED (fresh installs start fenced so a pre-existing
backlog is never dispatched before you review it).
Review the work eligible behind this fence, then unpause only this job group.
Unpause:  rm ${path}
`;
}

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

// OA2: compile-time validation that an agent's `event`-kind trigger has a real local-substrate delivery
// mechanism, so it can never be SILENTLY dropped the way it was before this change. On gh-actions, an
// `event` trigger (`issue_comment`, `pull_request_target`, …) becomes a real `on:` block a github Action
// fires natively. `compileLocal` has no webhook listener at all — its schedule only ever fires
// `cron`/`dispatch` agents (see `cronAgents` below), so an agent whose ONLY triggers are `event`-kind used
// to compile clean and then simply never run: no compile-time signal, no runtime warning, nothing (the gap
// docs/SPEC.md's conformance section names but that BL-22 dev/04 left unimplemented — see that section's
// "not full feature-conformance" caveat, and BACKLOG.md's own note that a per-feature target/substrate
// check "isn't wired up"). This function is that check, scoped to the one target it can decide about
// (`local`) — never a general feature-conformance oracle.
//
// An agent is NEVER at risk of silent drop if it has some OTHER portable way to be invoked, even while
// also declaring `event` triggers:
//   - it declares its own `dispatch: true` trigger — `dispatch` is portable by definition (docs/SPEC.md:
//     "the two PORTABLE trigger kinds are cron and dispatch"), and the Runner's `launch` (scripts/runner.ts)
//     can invoke ANY agent by name regardless of what else it declares — so an agent with a `dispatch`
//     trigger is reachable on `local` today, the `event` entry is simply the gh-actions-native REALIZATION
//     of that same portable dispatch (e.g. a "/agent <name>" comment IS a human doing the dispatch on
//     github; the profile's own PM does the identical dispatch locally via `runner.ts launch <name>`).
//   - it is named by some OTHER agent's `review:` field — reconcile-open-reviews.mjs (reconcilers.ts) is
//     the one generic delivery mechanism this substrate ships, and it dispatches exactly these agents.
// What's left after both of those — an agent whose ENTIRE trigger set is `event`-kind (no cron, no
// dispatch) and that nothing else's `review:` names — genuinely has NO invocation path on `local` unless
// some OTHER agent in the profile holds `agent:launch` at all (an orchestrator that could, in principle, launch
// it on its own schedule/logic — prose the IR can't read, but its EXISTENCE is a decidable, structural
// fact). Only when NEITHER escape applies do we know for certain — from the IR alone, with no false
// positives against a profile with an explicit orchestrator: only a profile with genuinely NO
// `agent:launch` capability and an event-only, non-reviewed agent is flagged. In that case the IR alone
// proves that compiling to `local` would silently drop the trigger.
export function undeliverableEventAgents(ir: AutonomyIR): string[] {
  // ASSUMPTION worth naming: the review-target escape assumes the reviews reconciler will actually be
  // emitted to deliver it — but that reconciler is gated on `ir.codeHost === 'github'` (compileLocal below;
  // a `local-git` code host has no PRs to poll). So a `local-git` profile with a review-edge `event` agent
  // is exempted here yet gets NO delivery. Moot for every bundled profile today (every one with a `review:`
  // edge is `codeHost: github`), and a `local-git` reviewer is a contradiction in terms anyway (nothing to
  // review — the calling role merges worktrees directly), so this isn't tightened to `&& ir.codeHost === 'github'`;
  // if a real local-git-with-review profile ever appears, add that clause and a delivery path together.
  const reviewTargets = new Set<string>();
  for (const agent of Object.values(ir.agents)) if (agent.review) reviewTargets.add(agent.review);
  const hasOrchestrator = Object.values(ir.agents).some((a) => (a.capabilities ?? []).includes('agent:launch'));

  return Object.entries(ir.agents)
    .filter(([role, a]) => {
      if (isHuman(a)) return false;
      const triggers = a.triggers ?? [];
      const hasEvent = triggers.some((t) => 'event' in t);
      if (!hasEvent) return false;
      const hasDispatch = triggers.some((t) => 'dispatch' in t);
      if (hasDispatch) return false; // reachable via the portable Runner dispatch regardless of `event`
      if (reviewTargets.has(role)) return false; // reconcile-open-reviews.mjs delivers this one
      return !hasOrchestrator; // no agent:launch anywhere -> structurally no one could ever dispatch it either
    })
    .map(([role]) => role);
}

export function compileLocal(ir: AutonomyIR, opts: { runner?: RunnerName; destDir?: string; providerUrl?: string; scheduleConfig?: LocalScheduleConfig } = {}): CompileOutput {
  const runner = opts.runner ?? 'termfleet';
  if (!SUPPORTED_RUNNERS.includes(runner)) {
    throw new Error(`unsupported runner "${runner}"; supported: ${SUPPORTED_RUNNERS.join(', ')}`);
  }
  // OA2: fail loud (never silently drop) when an agent's ONLY delivery would have been an `event` trigger
  // this substrate cannot fire and has no reconciler covering. See `undeliverableEventAgents` above for the
  // full rationale; this is the one place a local compile can still catch it before shipping an install
  // whose agent silently never runs.
  const undeliverable = undeliverableEventAgents(ir);
  if (undeliverable.length) {
    throw new Error(
      `open-autonomy: compiling to "local" but agent(s) ${undeliverable.join(', ')} declare an event-kind ` +
        `trigger with no local delivery mechanism (the local substrate has no webhook listener; only a ` +
        `code:propose agent's declared "review:" target is delivered, by scripts/reconcile-open-reviews.mjs). ` +
        `Compiling would silently drop that trigger — the agent would install correctly and never run. Fix: ` +
        `add a "dispatch: true" or "cron" trigger the loop can fire, name the agent as another agent's ` +
        `"review:" target if it really is a review edge, or compile this profile onto "gh-actions" instead, ` +
        `which fires event triggers natively.`,
    );
  }
  // Fresh-install detection for the pause marker (OA-07): "fresh" = no `.open-autonomy/generated.json` in
  // destDir yet — the exact signal `readGeneratedManifest` already treats as "no prior install" (the same
  // one upgrade's prune relies on). No destDir given (an in-memory compile: a dry-run print, a unit test,
  // lint/bench's own disposable cells) is treated as fresh, matching the common case.
  const freshInstall = !opts.destDir || !existsSync(join(opts.destDir, GENERATED_MANIFEST_PATH));
  const priorScheduledFences = installedScheduleFences(opts.destDir);
  const scheduleConfig = validateScheduleConfig(ir, opts.scheduleConfig);

  const generated: Record<string, string> = {};

  // Shared layer: the manifest, generated the same way for every substrate (unless carried verbatim).
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    const manifest = emitAutonomy(ir) as Record<string, unknown>;
    generated['.open-autonomy/autonomy.yml'] = stringifyYaml(manifest);
    generated['.open-autonomy/autonomy.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
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

  // NOTE: ztrack Stop/SubagentStop hooks are NOT invented here. The ztrack-backed profiles carry the
  // byte-identical `.claude/settings.json` and `.codex/hooks.json` resources, so the completion gate is
  // profile-owned and enforced under both declared harnesses. The runner remains launch + isolate +
  // schedule + lifecycle; it does not branch methodology by harness.

  // The local driver: a loop that fires each cron agent on an interval (github used `on: schedule`).
  // Each runs its own behavior via bun, exactly as its github job runs `bun <behavior>`.
  // Exclude a kind:human actor even if it (unusually) carries a cron — a person is never ticked by the
  // loop; it is DISPATCHED (see the runner's human route) when another actor routes work to it.
  const cronAgents = Object.entries(ir.agents).filter(([, a]) => cronOf(a) && !isHuman(a));
  const intervalSeconds = cronAgents[0] ? cronToSeconds(cronOf(cronAgents[0][1]) as string) : 900;
  generated['scheduler/run.mjs'] = LOOP_DRIVER;
  // A script agent runs its behavior via bun; a prose-skill agent is launched through the runner.
  const scheduleScripts = cronAgents.map(([role, agent]) => {
    const baseRetry = Math.min(300, cronToSeconds(cronOf(agent) as string));
    const config = mergedJobConfig(baseRetry, scheduleConfig?.defaults, scheduleConfig?.agents?.[role]);
    return scheduledCommand(role, agent, config.fence);
  });
  // A github code host's propose effect is NOT scheduled here — it is a per-session lifecycle effect the loop
  // driver runs when a proposer's session finishes (see LOOP_DRIVER's reconcilePendingEffects + runner.ts's
  // effect markers), mirroring github's post-skill job step. A local-git code host has no PRs (the calling role merges).
  //
  // OA2/OA3: the reconciler backstops (reconcilers.ts) all operate on github PRs/branch-protection — they
  // are meaningless (and would just fail every tick resolving `gh api repos/{owner}/{repo}`) on a
  // `local-git` code host, which has no PRs at all (the calling role merges worktrees directly, per the comment
  // above). Gated on `ir.codeHost === 'github'` AND at least one code:propose agent existing — an install
  // with neither never needed a github-PR reconciler in the first place. Wired into the same schedule the
  // cron loop already fires, right after the cron agents, so every tick both dispatches scheduled work AND
  // converges any open agent PR — the local mirror of what a real webhook would have fired instantly.
  const hasProposer = Object.values(ir.agents).some((a) => (a.capabilities ?? []).includes('code:propose'));
  if (ir.codeHost === 'github' && hasProposer) {
    generated['scripts/reconcile-ready-branches.mjs'] = reconcileReadyBranchesSrc();
    generated['scripts/reconcile-open-checks.mjs'] = reconcileOpenChecksSrc();
    scheduleScripts.push('bun scripts/reconcile-ready-branches.mjs', 'bun scripts/reconcile-open-checks.mjs');
    // The review-edge delivery script only earns its place when some agent actually declares a `review:`
    // edge for another to fulfil — otherwise there is nothing for it to deliver (see
    // `locallyDeliverableAgents`), and emitting a script with permanently-empty work would just be noise on
    // every tick's log.
    if (Object.values(ir.agents).some((a) => a.review)) {
      generated['scripts/reconcile-open-reviews.mjs'] = reconcileOpenReviewsSrc();
      scheduleScripts.push('bun scripts/reconcile-open-reviews.mjs');
    }
  }
  //
  // OA-09: `env` was always `{}` — nothing durable carried a TERMFLEET_PROVIDER_URL pin, so it existed only
  // if the operator remembered to export it in the exact shell that started the loop (lost across shells,
  // supervisors, re-runs). `--provider-url` (bin/autonomy-compile.ts) makes the pin part of the compiled
  // artifact instead. Precedence is UNCHANGED: LOOP_DRIVER's fireTick still does
  // `Object.assign({}, schedule.env, process.env)` — an ambient TERMFLEET_PROVIDER_URL still overrides this
  // compiled default, matching the documented TERMFLEET_* override doctrine (runner-config.ts).
  const env = opts.providerUrl ? { TERMFLEET_PROVIDER_URL: opts.providerUrl } : {};
  const cronJobs = cronAgents.map(([role, agent]) => {
    const script = isScript(agent.behavior);
    const baseRetry = Math.min(300, cronToSeconds(cronOf(agent) as string));
    const config = mergedJobConfig(baseRetry, scheduleConfig?.defaults, scheduleConfig?.agents?.[role]);
    return {
      name: role,
      command: scheduledCommand(role, agent, config.fence),
      intervalSeconds: cronToSeconds(cronOf(agent) as string),
      retrySeconds: config.retrySeconds,
      fence: config.fence,
      ...(!script ? { agent: role, ...(agent.execution ? { workspace: agent.execution.workspace } : {}) } : {}),
    };
  });
  const effectConfig = mergedJobConfig(Math.min(300, intervalSeconds), scheduleConfig?.defaults, scheduleConfig?.effects);
  const extraJobs = scheduleScripts.slice(cronAgents.length).map((command, index) => ({
    name: `trigger-delivery-${index + 1}`,
    command,
    intervalSeconds,
    retrySeconds: effectConfig.retrySeconds,
    fence: effectConfig.fence,
  }));
  const jobs = [...cronJobs, ...extraJobs];
  generated['scheduler/schedule.json'] = `${JSON.stringify({
    schema: 'open-autonomy.local-schedule.v2',
    ...(ir.policy.maxConcurrent ? { maxConcurrent: ir.policy.maxConcurrent } : {}),
    env,
    jobs,
  }, null, 2)}\n`;
  generated['.open-autonomy/enforcement.json'] = `${JSON.stringify(enforcementReport(ir, 'local'), null, 2)}\n`;
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
  // Fence markers are added AFTER withGeneratedManifest computes `.open-autonomy/generated.json`'s file
  // list — deliberately: prune can never treat one as a generated orphan and silently unpause a running
  // install. Existing installs emit none, so recompiles neither resurrect removed markers nor clobber
  // markers still present. A Set makes shared group fences (for example Planner + Kaizen) one control.
  if (freshInstall) {
    // Keep the default marker even when every scheduled job uses a custom fence: direct Runner launches
    // without an explicit --fence still use this safe day-one control, and profiles with no cron jobs may
    // still have dispatch-only machine agents. Custom job markers are additional independent controls.
    for (const path of new Set(['.open-autonomy/paused', ...jobs.map((job) => job.fence).filter(Boolean)])) {
      compiled.generated[path] = pausedMarker(path);
    }
  } else {
    // A removed marker for an unchanged fence is deliberate operator state and stays removed. A newly
    // introduced job fence has no such history, so seed it once rather than activating a new scheduled
    // group merely because an existing installation changed its target configuration.
    for (const path of new Set(jobs.map((job) => job.fence).filter(Boolean))) {
      if (!priorScheduledFences.has(path)) compiled.generated[path] = pausedMarker(path);
    }
  }
  return compiled;
}
