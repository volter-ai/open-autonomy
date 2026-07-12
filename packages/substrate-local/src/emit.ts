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
// U4 opt-in (policy.box.local.runner === "cli"): a thin shim delegating to the versioned `@volter/oa`
// package instead of the byte-copied template below — the runner becomes a dep like termfleet/ztrack
// already are, closing the S6/T6 fork-drift structurally (a release, not a re-copy). Argv-compatible with
// the legacy template: `node scheduler/run.mjs --once` / `node scheduler/run.mjs` (continuous, no args)
// keep working unchanged, because `runCli` implements the SAME argv contract this file's `LOOP_DRIVER`
// always has. DEFAULT UNCHANGED: a profile that never sets this policy key gets LOOP_DRIVER exactly as
// before (see compileLocal below) — this is additive, not a replacement.
const CLI_RUNNER_SHIM = `#!/usr/bin/env node
// Generated by @open-autonomy/substrate-local (policy.box.local.runner === "cli"). This install's local
// driver is the versioned @volter/oa package — see node_modules/@volter/oa/README.md (or
// packages/local-runner-cli/README.md in this source repo) for the adoption path, the S6/T6 fork-drift
// rationale this closes, and how to fall back to the byte-copied template if needed.
import { runCli } from '@volter/oa';
const code = await runCli(process.argv.slice(2));
process.exit(code);
`;

/** Is this profile opted into the versioned CLI runner (U4)? Additive policy key, opaque governance data
 *  under policy.box — never interpreted anywhere except here (emit) and the compile-time instructions
 *  printed by bin/autonomy-compile.ts. */
export function isCliRunner(ir: AutonomyIR): boolean {
  const local = (ir.policy.box as { local?: { runner?: string } } | undefined)?.local;
  return local?.runner === 'cli';
}

const LOOP_DRIVER = `#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, sep } from 'node:path';
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
    ['ztrack', 'ztrack/preset-kit'],
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
    // run-agent.mjs -> autonomy-runner.mjs, or the PM's own nested \`runner.ts launch developer ...\` —  can
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
// --once and continuous mode — the earliest point that can stop the PM (and therefore every downstream
// zombie) with one message. The manifest (.open-autonomy/generated.json) is the authoritative, exact list
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

// D2 fix (post-review, TC.3): fireTick is the loop's OWN automatic tick — its only caller is the scheduler
// itself (--once and continuous mode below), never a human. Tag every command it fires with
// AUTONOMY_TRIGGER_KIND=cron so a launched agent can tell "the scheduler fired me on its own cadence" apart
// from "an operator explicitly typed a launch command" (e.g. \`AUTONOMY_AGENT=audit node
// scripts/run-agent.mjs\`, or \`oa dispatch <agent>\`/\`oa launch <agent>\` — neither of which goes through
// fireTick, so neither ever carries this value). AUTONOMY_SINGLETON alone is NOT that signal: it is baked
// into schedule.json's own command STRING (see scheduleScripts below), so it is present on every re-fire of
// that exact command line regardless of who fires it — including \`oa dispatch <agent>\`, which fires the
// identical schedule-line string on purpose. An agent whose own cadence must differ from "every shared tick"
// (e.g. a low-frequency cron self-throttle) needs a signal that is true ONLY on the scheduler's own
// automatic fire, never on an explicit human dispatch of the same command — this is that signal.
const fireTick = () => {
  const env = Object.assign({}, buildTickEnv(), { AUTONOMY_TRIGGER_KIND: 'cron' });
  for (const command of schedule.scripts) {
    spawnSync(command, { shell: true, stdio: 'inherit', env });
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
// positives against any profile in this repo (self-driving's `develop` has no `dispatch` trigger of its
// own, but self-driving's `pm` holds `agent:launch`, so `develop` is not flagged; only a profile with
// genuinely NO orchestrator at all and an event-only, non-reviewed agent is flagged) — that compiling to
// `local` would silently drop the trigger.
export function undeliverableEventAgents(ir: AutonomyIR): string[] {
  // ASSUMPTION worth naming: the review-target escape assumes the reviews reconciler will actually be
  // emitted to deliver it — but that reconciler is gated on `ir.codeHost === 'github'` (compileLocal below;
  // a `local-git` code host has no PRs to poll). So a `local-git` profile with a review-edge `event` agent
  // is exempted here yet gets NO delivery. Moot for every bundled profile today (every one with a `review:`
  // edge is `codeHost: github`), and a `local-git` reviewer is a contradiction in terms anyway (nothing to
  // review — the PM merges worktrees directly), so this isn't tightened to `&& ir.codeHost === 'github'`;
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

export function compileLocal(ir: AutonomyIR, opts: { runner?: RunnerName; destDir?: string; providerUrl?: string } = {}): CompileOutput {
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
  generated['scheduler/run.mjs'] = isCliRunner(ir) ? CLI_RUNNER_SHIM : LOOP_DRIVER;
  // A script agent runs its behavior via bun; a prose-skill agent is launched through the runner.
  const scheduleScripts = cronAgents.map(([role, a]) =>
    // A prose cron agent (the PM) is single-instance per tick (AUTONOMY_SINGLETON) — see run-agent.mjs. A
    // script agent is a fast deterministic run, no guard needed.
    isScript(a.behavior) ? `bun ${a.behavior}` : `AUTONOMY_AGENT=${role} AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs`,
  );
  // A github code host's propose effect is NOT scheduled here — it is a per-session lifecycle effect the loop
  // driver runs when a proposer's session finishes (see LOOP_DRIVER's reconcilePendingEffects + runner.ts's
  // effect markers), mirroring github's post-skill job step. A local-git code host has no PRs (the PM merges).
  //
  // OA2/OA3: the reconciler backstops (reconcilers.ts) all operate on github PRs/branch-protection — they
  // are meaningless (and would just fail every tick resolving `gh api repos/{owner}/{repo}`) on a
  // `local-git` code host, which has no PRs at all (the PM merges worktrees directly, per the comment
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
  generated['scheduler/schedule.json'] = `${JSON.stringify({ intervalSeconds, env, scripts: scheduleScripts }, null, 2)}\n`;
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
