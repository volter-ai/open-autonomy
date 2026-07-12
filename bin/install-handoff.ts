#!/usr/bin/env bun
// TE.6 — Phase 6 HAND-OFF (OA-INSTALL-IMPLEMENTATION-TASKS.md#te6, DESIGN §Phase 6, G4a/G4b + hardening
// #2/#7; docs/OPERATIONS.md:513-519,700-785; scripts/open-autonomy-preflight.ts:83).
//
// Split exactly the way the task list splits it:
//
//   G4a (in-session, THIS FILE's job) — the human promotes the FIRST board item to ready/oa-approved
//   (a HUMAN act; this module only ever VERIFIES it happened, never performs it — see `verifyG4aReady`,
//   a thin wrapper around TA.2's own `hasDispatchableWork`, reused verbatim rather than re-derived), then
//   constructs the substrate-specific go-live action:
//     - LOCAL:  `oa resume` (safe — a single unlink, no process spawn; see pause.ts) + `oa start` under
//               tmux/nohup. ⛔ SAFETY (this session's own TE.5 incident, see this file's header below):
//               `oa start`'s command construction MUST force TERMFLEET_PROVIDER_URL to this install's OWN
//               scheduler/schedule.json pin (TG.1's durable artifact, via provider.ts's `readSchedulePin`)
//               — never rely on ambient env, which `env.ts`'s own `resolveProvider` documents as
//               beating the schedule pin ("ambient TERMFLEET_PROVIDER_URL, beats everything"). This file
//               NEVER executes the constructed `start` command — every acceptance leg for it stops at
//               "the command was constructed correctly," mirroring install-execute.ts's own
//               `buildBoardSeedDispatchCommand` discipline (and its own regression test shape) exactly.
//     - HOSTED (gh-actions): per DESIGN hardening #7's ORIGINAL text, "there's no paused file — the
//       analogue is removing an `agent-paused` label". That assumption does NOT survive contact with the
//       actual code (verified, not assumed, per this program's standing rule #2/#6):
//         * `agent-paused` IS a real label (scripts/open-autonomy-preflight.ts:86, `SEAM_CONTRACT_LABELS`)
//           — but it is a PER-ISSUE marker only. `/agent pause`/`/agent resume` (`.github/agent-control.mjs`,
//           `docs/OSS_AGENT_RUNBOOK.md:92-94`) add/remove it on ONE issue; the PM's sweep and direct
//           `/agent develop` on that one issue wait while it's present. It is never a repo-wide fence.
//         * The REAL repo-wide kill-switch — the thing actually analogous to local's `.open-autonomy/paused`
//           + `oa resume` — is the **`PUBLIC_AGENT_REPO_PAUSED` repository variable**. Every emitted agent
//           workflow's job-level `if:` gates on it (`packages/substrate-github/src/emit.ts:117`,
//           `REPO_NOT_PAUSED = "vars.PUBLIC_AGENT_REPO_PAUSED != 'true'"` — confirmed live in every generated
//           workflow at root, e.g. `.github/workflows/pm.yml:30`, `develop.yml:28`, `reviewer.yml:34`,
//           `planner.yml:30`, `draft.yml:29`, `strategist.yml:30`, `strategy_reviewer.yml:33`,
//           `audit.yml:28`). `.github/agent-control.mjs:53` (mirrored in
//           `packages/substrate-github/src/control-backend.mjs:53`) documents the exact operator command:
//           `gh variable set PUBLIC_AGENT_REPO_PAUSED --repo <repo> --body <true|false>`.
//         * This is not a stale-doc-vs-code mismatch this unit discovered fresh — `BACKLOG.md`'s dev/01
//           entry (2026-07-06, commit 64092c8) already recorded the correction: a documented
//           `/agent pause repo` control VERB never existed in `agent-control.mjs` (which implements only
//           `cancel|pause|resume|status|retry|decide|answer`, no `repo` variant), and the prefix regex bug
//           made `/agent pause repo` silently mislabel ONE issue while an operator believed the whole fleet
//           was paused. "DECIDED (maintainer): variable-only — no repo-wide control verb." README/RUNBOOK/
//           OPERATIONS already reflect this; this file's `buildHostedGoLive` is simply the FIRST piece of
//           TE.* orchestration code to act on the corrected mechanism instead of the DESIGN doc's original
//           (now-known-stale) `agent-paused`-label assumption.
//     Also note: unlike local (paused-BY-DEFAULT at compile time — `a4PausedSeeded`), NONE of the
//     github-hosted profiles' `provision.json` seed `PUBLIC_AGENT_REPO_PAUSED` at all (self-driving,
//     simple-gh, simple-gh-sdlc ship no `variables` block; soc2-baseline's ships one but seeds it
//     `"false"`, i.e. already unpaused) — `docs/OPERATIONS.md`'s own table records the unset default as
//     "running". So a hosted install's go-live is honestly EITHER a no-op (report it, never fabricate an
//     action) or a real variable clear, depending on what's actually live — `buildHostedGoLive` reads the
//     variable first and only ever constructs the clear command when the repo is ACTUALLY paused.
//
//   G4b (async babysit protocol) — NOT an in-session step. `G4B_RUNBOOK` (below) is the written runbook:
//   watch the first draft->develop->review->PR cycle, approve the first merge, THEN arm native auto-merge.
//   It is prose (a markdown string, also mirrored verbatim into docs/OSS_AGENT_RUNBOOK.md's new "Phase 6
//   Hand-Off" section) that names only already-built primitives (`oa status`, `oa maturity`, `gh pr checks`,
//   `gh pr merge`, `gh repo edit --enable-auto-merge`) — this file holds no automated executor for it (the
//   design's own reality-check: G4b spans hours-to-days, so it cannot be one CLI call).
//
// ⛔⛔⛔ ABSOLUTE SAFETY: nothing in this file ever spawns `oa start`, `tmux new-session`, or any other
// dispatch/launch command for real — every "go-live" function here only ever CONSTRUCTS a `DispatchCommand`
// (cmd/args/env), the exact same construct-only discipline TE.5's `buildBoardSeedDispatchCommand` uses, and
// every constructed local `start` command's env is asserted, never executed, in this unit's own tests.
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Substrate, DispatchCommand } from './install-execute.ts';
import { defaultProc, firstLine } from '../packages/local-runner-cli/src/proc.ts';
import type { ProcResult, ProcRunner } from '../packages/local-runner-cli/src/types.ts';
import {
  hasDispatchableWork,
  type DispatchableWorkOptions,
  type DispatchableWorkVerdict,
  type EligibilityVariant,
} from '../packages/local-runner-cli/src/board-readiness.ts';
import { readSchedulePin } from '../packages/local-runner-cli/src/provider.ts';
import { resume as resumeReal, isPaused, pausedMarkerPath } from '../packages/local-runner-cli/src/pause.ts';

export { defaultProc, firstLine };
export type { ProcResult, ProcRunner };

// =========================================================================================================
// G4a — VERIFY the human promotion happened. Never performs it. Reuses TA.2's `hasDispatchableWork`
// (packages/local-runner-cli/src/board-readiness.ts) verbatim: "does the board hold >=1 ready item that
// clears the profile's own oa-approved/allowlist fence and isn't already in flight?" is EXACTLY "did the
// human promote the first item?" — no re-derivation.
// =========================================================================================================

export interface G4aVerification {
  ready: boolean;
  message: string;
  verdict: DispatchableWorkVerdict;
}

/** `opts` is TA.2's own `DispatchableWorkOptions` (cwd + profileDir/actor/variant + optional proc) — passed
 *  straight through, so every board-kind-resolution rule TA.2 already proves (setup-pack.yml first,
 *  identity-default fallback, explicit override) applies here unchanged. */
export function verifyG4aReady(opts: DispatchableWorkOptions): G4aVerification {
  const verdict = hasDispatchableWork(opts);
  if (!verdict.actionable) {
    return {
      ready: false,
      message: `not ready for go-live, promote an item first — ${verdict.reason} (need >=1 'ready' item${verdict.allowlistLabel ? ` carrying the '${verdict.allowlistLabel}' label` : ''}, not already in flight)`,
      verdict,
    };
  }
  return {
    ready: true,
    message: `ready for go-live — ${verdict.reason}`,
    verdict,
  };
}

// =========================================================================================================
// LOCAL go-live — command construction only. `oa resume` is a single `unlinkSync` (pause.ts) with zero
// process-spawn/launch risk, so this module calls the REAL function (injectable for tests) rather than
// merely constructing a command for it — mirrors TG.1's own `bringUpProvider`, a real (safe) side effect.
// `oa start` is NEVER executed here — only ever constructed as a `DispatchCommand`, tmux/nohup-wrapped,
// with TERMFLEET_PROVIDER_URL FORCED into its own `env` field.
// =========================================================================================================

// `DispatchCommand` is TE.5's own construct-only shape (bin/install-execute.ts, imported above) — reused
// verbatim, never re-declared, so both units' "constructed but never executed" launch commands share one
// type. Re-exported here so this module's own consumers/tests don't need to reach into install-execute.ts.
export type { DispatchCommand };

export type Launcher = 'tmux' | 'nohup';

export interface LocalGoLiveBlocked {
  status: 'blocked';
  message: string;
}

export interface LocalGoLiveResult {
  status: 'ok';
  pin: string;
  resume: { wasPaused: boolean; path: string };
  startCommand: DispatchCommand;
  message: string;
}

export interface BuildLocalGoLiveOptions {
  launcher?: Launcher;
  sessionName?: string;
  logFile?: string;
  /** injectable — tests pass a stub that just records the unlink attempt; defaults to pause.ts's REAL
   *  `resume()` (safe: file removal only, matches this module's own header). */
  resumeFn?: typeof resumeReal;
  /** --dry-run: `resume()` is normally performed for real even in this module's own default operation
   *  (single `unlinkSync`, zero spawn risk — see this file's own header). Under --dry-run that real file
   *  removal is skipped too: a dry-run's own contract is "the target repo is left byte-for-byte untouched",
   *  and removing `.open-autonomy/paused` would show up as a real change in `git status`. Reports what
   *  WOULD happen via a pure read (`isPaused`/`pausedMarkerPath`) instead. */
  dryRun?: boolean;
}

/** Constructs (and, for the safe `resume` half only, PERFORMS) the local go-live sequence. Refuses —
 *  returns `{status:'blocked'}`, never silently falls through to ambient — when this install has no
 *  TG.1 schedule pin recorded: launching `oa start` unpinned on a shared box is exactly the OA-09 hazard
 *  (`env.ts`: "ambient TERMFLEET_PROVIDER_URL, beats everything") this session's own incident re-taught. */
export function buildLocalGoLive(repoDir: string, opts: BuildLocalGoLiveOptions = {}): LocalGoLiveResult | LocalGoLiveBlocked {
  const pin = readSchedulePin(repoDir);
  if (!pin) {
    return {
      status: 'blocked',
      message:
        `[oa] go-live: no TERMFLEET_PROVIDER_URL pin found in ${repoDir}/scheduler/schedule.json — refusing to ` +
        "construct a go-live launch that could fall through to an ambient, box-wide termfleet provider (OA-09; " +
        "env.ts's resolveProvider: \"ambient TERMFLEET_PROVIDER_URL, beats everything\"). Run `oa provider up` " +
        'first (TG.1, packages/local-runner-cli/src/provider.ts) to bring up and pin this install\'s own provider.',
    };
  }

  // --dry-run: never call the real resume() (a real unlinkSync) — read-only equivalent instead (see this
  // option's own doc comment for why even this otherwise-safe write is suppressed under dry-run).
  const resume = opts.dryRun
    ? { wasPaused: isPaused(repoDir), path: pausedMarkerPath(repoDir) }
    : (opts.resumeFn ?? resumeReal)({ cwd: repoDir });

  const forcedEnv: Record<string, string> = { TERMFLEET_PROVIDER_URL: pin };
  const sessionName = opts.sessionName ?? `oa-${basename(repoDir)}`;
  const launcher = opts.launcher ?? 'tmux';

  let startCommand: DispatchCommand;
  if (launcher === 'tmux') {
    // `tmux new-session -d -s <name> oa start` — matches docs/OPERATIONS.md's own documented durable-loop
    // pattern ("run it ... inside a persistent tmux") and TG.1's own provider-bring-up precedent (detached,
    // logged, install-scoped). `-e VAR=val` (tmux >=3.2) additionally seeds the NEW SESSION's own environment
    // table for good measure — belt-and-suspenders alongside the `env` field below, which is what this
    // module's own tests assert on (the field a caller's `proc()` spawn of `tmux` itself actually receives;
    // a freshly-spawned tmux server inherits ITS spawning process's env, so forcing `env` on the `tmux`
    // process this function returns is what actually propagates the pin into the new session either way).
    const args = ['new-session', '-d', '-s', sessionName];
    for (const [k, v] of Object.entries(forcedEnv)) args.push('-e', `${k}=${v}`);
    args.push('oa', 'start');
    startCommand = { cmd: 'tmux', args, env: forcedEnv };
  } else {
    // nohup fallback (no tmux on the box) — docs/OPERATIONS.md's documented minimum:
    // `nohup oa start >> <logfile> 2>&1 &`. A shell string is unavoidable here (redirection + `&`), but the
    // FORCED pin still travels via the constructed command's own `env` field (never ambient) — the caller's
    // `proc()` must spawn this with `shell: true` and the env from THIS OBJECT, not `process.env` verbatim.
    const logFile = opts.logFile ?? '.open-autonomy/runner-state/oa-loop.log';
    startCommand = { cmd: 'nohup', args: ['sh', '-c', `oa start >> ${logFile} 2>&1 &`], env: forcedEnv };
  }

  const resumeVerb = opts.dryRun
    ? `${resume.wasPaused ? '[DRY-RUN] would lift the fence (currently paused)' : '[DRY-RUN] would be a no-op (not currently paused)'}`
    : `resume ${resume.wasPaused ? 'lifted the fence (was paused)' : 'no-op (was not paused)'}`;
  return {
    status: 'ok',
    pin,
    resume,
    startCommand,
    message:
      `[oa] go-live: ${resumeVerb} at ${resume.path}; ` +
      `constructed ${launcher} launch of \`oa start\` with TERMFLEET_PROVIDER_URL FORCED to this install's own schedule pin ` +
      `(${pin}) — never ambient. NOT executed by this call.`,
  };
}

// =========================================================================================================
// HOSTED (gh-actions) go-live — reads the REAL repo-wide kill-switch (`PUBLIC_AGENT_REPO_PAUSED`), never
// the per-issue `agent-paused` label. See file header for the full citation trail.
// =========================================================================================================

export interface HostedGoLiveResult {
  mechanism: 'PUBLIC_AGENT_REPO_PAUSED repository variable';
  currentValue: string | undefined;
  paused: boolean;
  action: 'none-needed' | 'clear-pause' | 'unknown';
  command?: DispatchCommand;
  message: string;
  citation: string;
  notAgentPausedLabel: string;
}

const HOSTED_CITATION =
  "packages/substrate-github/src/emit.ts:117 (REPO_NOT_PAUSED = \"vars.PUBLIC_AGENT_REPO_PAUSED != 'true'\", " +
  'every emitted agent workflow job-level `if:`) + .github/agent-control.mjs:53 (documented operator command: ' +
  '`gh variable set PUBLIC_AGENT_REPO_PAUSED --repo <repo> --body <true|false>`) + docs/OPERATIONS.md:700-785 ' +
  '(repo-variable table + First Public Rollout Policy: "PUBLIC_AGENT_REPO_PAUSED=false only during supervised windows").';

const NOT_AGENT_PAUSED_LABEL_NOTE =
  "`agent-paused` (scripts/open-autonomy-preflight.ts:86, SEAM_CONTRACT_LABELS) is real but PER-ISSUE only " +
  '(`/agent pause`/`/agent resume`, docs/OSS_AGENT_RUNBOOK.md:92-94) — never a repo-wide fence. BACKLOG.md\'s ' +
  'dev/01 (2026-07-06, commit 64092c8) already corrected the DESIGN doc\'s original "agent-paused label removal" ' +
  'assumption: a `/agent pause repo` control verb was documented but never implemented in agent-control.mjs ' +
  '(only cancel|pause|resume|status|retry|decide|answer exist, no `repo` variant) — DECIDED: variable-only.';

/** Reads the live `PUBLIC_AGENT_REPO_PAUSED` value via `gh variable get` and constructs the clear command
 *  ONLY when the repo is actually paused — never fabricates an action against a repo that's already live
 *  (standing rule #6: a verdict must never OVERstate readiness, but constructing an unnecessary "fix" for
 *  a repo that isn't broken is its own kind of dishonesty about what actually happened). */
export function buildHostedGoLive(ownerRepo: string, opts: { proc?: ProcRunner } = {}): HostedGoLiveResult {
  const proc = opts.proc ?? defaultProc;
  const r = proc('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', ownerRepo], {});
  // `gh variable get` exits nonzero (with a "variable ... not found" stderr) when the variable is unset —
  // that is the DOCUMENTED default ("unset (running)", docs/OPERATIONS.md's own table), never an error.
  if (r.status !== 0) {
    const notFound = /not found/i.test(r.stderr) || /not found/i.test(r.stdout);
    if (notFound) {
      return {
        mechanism: 'PUBLIC_AGENT_REPO_PAUSED repository variable',
        currentValue: undefined,
        paused: false,
        action: 'none-needed',
        message: `[oa] hosted go-live: PUBLIC_AGENT_REPO_PAUSED is unset on ${ownerRepo} — unset means "running" (docs/OPERATIONS.md's documented default), so the repo-wide fence is already lifted. No action taken.`,
        citation: HOSTED_CITATION,
        notAgentPausedLabel: NOT_AGENT_PAUSED_LABEL_NOTE,
      };
    }
    return {
      mechanism: 'PUBLIC_AGENT_REPO_PAUSED repository variable',
      currentValue: undefined,
      paused: false,
      action: 'unknown',
      message: `[oa] hosted go-live: could not read PUBLIC_AGENT_REPO_PAUSED on ${ownerRepo} (${firstLine(r.stderr || r.stdout)}) — verdict withheld, never assumed unpaused.`,
      citation: HOSTED_CITATION,
      notAgentPausedLabel: NOT_AGENT_PAUSED_LABEL_NOTE,
    };
  }

  const currentValue = r.stdout.trim();
  const paused = currentValue === 'true';
  if (!paused) {
    return {
      mechanism: 'PUBLIC_AGENT_REPO_PAUSED repository variable',
      currentValue,
      paused: false,
      action: 'none-needed',
      message: `[oa] hosted go-live: PUBLIC_AGENT_REPO_PAUSED=${JSON.stringify(currentValue)} on ${ownerRepo} — already not paused ('true' is the only value the workflow \`if:\` guard treats as paused). No action taken.`,
      citation: HOSTED_CITATION,
      notAgentPausedLabel: NOT_AGENT_PAUSED_LABEL_NOTE,
    };
  }

  const command: DispatchCommand = { cmd: 'gh', args: ['variable', 'set', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', ownerRepo, '--body', 'false'] };
  return {
    mechanism: 'PUBLIC_AGENT_REPO_PAUSED repository variable',
    currentValue,
    paused: true,
    action: 'clear-pause',
    command,
    message: `[oa] hosted go-live: PUBLIC_AGENT_REPO_PAUSED=true on ${ownerRepo} — the repo-wide fence IS up. Constructed \`${command.cmd} ${command.args.join(' ')}\` to clear it. NOT executed by this call.`,
    citation: HOSTED_CITATION,
    notAgentPausedLabel: NOT_AGENT_PAUSED_LABEL_NOTE,
  };
}

// =========================================================================================================
// runG4a — the orchestrator: verify -> (if ready) construct the substrate-specific go-live. Never executes
// a launch command; only ever performs the SAFE local resume() and the READ half of the hosted variable
// check. Mirrors install-execute.ts's step()-shaped reporting for consistency across the TE.* series.
// =========================================================================================================

export interface RunG4aOptions {
  substrate: Substrate;
  repoDir: string;
  profileDir?: string;
  actor?: string;
  variant?: EligibilityVariant;
  allowlistLabel?: string;
  ownerRepo?: string;
  proc?: ProcRunner;
  local?: BuildLocalGoLiveOptions;
  /** top-level convenience — forwarded into `local.dryRun` (an explicit `local.dryRun` still wins) so a
   *  caller need not remember to nest it under `local` just to get the safe HAND-OFF behavior. */
  dryRun?: boolean;
}

export interface RunG4aReport {
  verification: G4aVerification;
  goLive?: LocalGoLiveResult | LocalGoLiveBlocked | HostedGoLiveResult;
}

export function runG4a(opts: RunG4aOptions): RunG4aReport {
  const proc = opts.proc ?? defaultProc;
  const verifyOpts: DispatchableWorkOptions = { cwd: opts.repoDir, proc };
  if (opts.profileDir) verifyOpts.profileDir = opts.profileDir;
  if (opts.actor) verifyOpts.actor = opts.actor;
  if (opts.variant) verifyOpts.variant = opts.variant;
  if (opts.allowlistLabel) verifyOpts.allowlistLabel = opts.allowlistLabel;
  const verification = verifyG4aReady(verifyOpts);
  if (!verification.ready) return { verification };

  if (opts.substrate === 'local') {
    const local: BuildLocalGoLiveOptions = { ...opts.local, dryRun: opts.local?.dryRun ?? opts.dryRun };
    return { verification, goLive: buildLocalGoLive(opts.repoDir, local) };
  }
  if (!opts.ownerRepo) {
    return {
      verification,
      goLive: { status: 'blocked', message: '[oa] go-live: gh-actions target requires --owner-repo <owner/name> to read/clear PUBLIC_AGENT_REPO_PAUSED' } as LocalGoLiveBlocked,
    };
  }
  return { verification, goLive: buildHostedGoLive(opts.ownerRepo, { proc }) };
}

/** Local-substrate paused-fence introspection — a thin, honest re-export so callers/tests don't reach into
 *  pause.ts directly just to print "is this install currently paused". */
export function localPauseState(repoDir: string): { paused: boolean; path: string } {
  return { paused: isPaused(repoDir), path: pausedMarkerPath(repoDir) };
}
export function localScheduleDirExists(repoDir: string): boolean {
  return existsSync(repoDir);
}

// =========================================================================================================
// G4b — the async babysit protocol. NOT automated (the design's own reality-check: hours-to-days, cannot
// be one CLI call). This is the written runbook artifact — also mirrored verbatim into
// docs/OSS_AGENT_RUNBOOK.md's "Phase 6 Hand-Off" section. References ONLY already-built, real primitives.
// =========================================================================================================

export const G4B_RUNBOOK = `## Phase 6 Hand-Off — G4b async babysit protocol

G4a (above) lifts the fence and constructs the go-live launch. What happens next — the first full
draft -> develop -> review -> PR cycle — takes **hours to days**, not one CLI call. This is a runbook for
a human to follow across that window, not something an agent session executes start-to-finish.

### 1. Confirm the loop actually started

\`\`\`bash
oa status
\`\`\`

Expect \`fence: unpaused\` and, once the first tick has fired, a live session line
(\`sessions: N live (<agent>:<status>, ...)\`). If sessions stays \`none live\` for longer than one
reconcile period (~20s heartbeat locally; the next cron tick on gh-actions), re-check \`oa doctor\` and the
provider (\`oa provider status\`) before assuming the loop is stuck.

### 2. Watch the first PR appear and go green

\`\`\`bash
gh pr list --search "is:open is:pr"
gh pr checks <pr-number>
\`\`\`

Wait for all three required checks (\`ci\`, \`agent-review\`, and — where the profile has it —
\`human-approval\`) to post. A \`DIRTY\`/conflicting PR never auto-merges even when green; re-dispatch is the
PM's own doctrine, not an operator action.

### 3. Review the first PR yourself (this is the "babysit" step)

Read the diff. This is the one PR in the whole lifecycle a human reads end-to-end before trusting the
fleet's own \`agent-review\` gate. If the profile carries a \`human-approval\` required check, approve it on
GitHub (a maintainer Approve on the current head SHA); otherwise merge directly once \`ci\`+\`agent-review\`
are green:

\`\`\`bash
gh pr merge <pr-number> --squash
\`\`\`

### 4. Confirm the merge actually landed

\`\`\`bash
gh pr view <pr-number> --json state,mergedAt
oa maturity
\`\`\`

\`oa maturity\` (TB.2) recomputes the IMM stage from real, install-scoped evidence — after a genuine merge
+ a subsequent tick, expect it to progress toward M6/ADVANCING (mission-advancing signal); it will report
the stage HONESTLY (never a fabricated M6 off a single merge alone — see \`missionAdvancingSignal\`,
packages/local-runner-cli/src/m6-signal.ts).

### 5. Only THEN arm native auto-merge

Never before step 4 completes — auto-merging before you've watched one PR land under supervision means the
first real proof of the review gate's independence never happens under human eyes.

\`\`\`bash
gh repo edit <owner>/<repo> --enable-auto-merge
\`\`\`

(Local-substrate installs have no native auto-merge concept — the PM's own merge doctrine performs the
merge each tick once required checks are green; there is nothing to "arm" locally.)

### 6. Ongoing supervision

- \`oa status\` / \`gh pr checks <n>\` — spot-check periodically, not continuously.
- \`oa maturity --json\` — machine-readable stage + blockers, safe to script into a periodic check.
- Escalation still routes through the human seam (\`human-required\` label, \`needs-info\`, \`agent-blocked\`) —
  \`docs/OPERATIONS.md\`'s Operator Controls section is the full reference.
`;

// =========================================================================================================
// CLI: bun bin/install-handoff.ts verify|go-live|runbook ...
// =========================================================================================================

const USAGE = [
  'usage: bun bin/install-handoff.ts verify --repo-dir <dir> [--profile-dir <dir>] [--actor <name>] [--json]',
  '       bun bin/install-handoff.ts go-live --repo-dir <dir> --substrate local|gh-actions',
  '         [--profile-dir <dir>] [--actor <name>] [--owner-repo <owner/name>] [--launcher tmux|nohup] [--json]',
  '       bun bin/install-handoff.ts runbook   # prints the G4b async babysit protocol',
  '',
  '⛔ SAFETY: `go-live` never executes a launch. It VERIFIES G4a (board promotion), and (local substrate',
  'only, once verified) PERFORMS the safe `oa resume` fence-lift for real (a single unlink, no spawn) —',
  'then CONSTRUCTS the launch half (`oa start` locally, or the hosted PUBLIC_AGENT_REPO_PAUSED clear),',
  'printing it for a human to run.',
].join('\n');

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const json = argv.includes('--json');

  if (mode === 'runbook') {
    process.stdout.write(G4B_RUNBOOK);
    process.exit(0);
  }

  if (mode === 'verify' || mode === 'go-live') {
    const repoDir = flagValue(argv, '--repo-dir');
    if (!repoDir) {
      process.stderr.write(`error: --repo-dir is required\n\n${USAGE}\n`);
      process.exit(2);
    }
    const verifyOpts: DispatchableWorkOptions = { cwd: repoDir };
    const profileDir = flagValue(argv, '--profile-dir');
    const actor = flagValue(argv, '--actor');
    if (profileDir) verifyOpts.profileDir = profileDir;
    if (actor) verifyOpts.actor = actor;

    if (mode === 'verify') {
      const v = verifyG4aReady(verifyOpts);
      process.stdout.write((json ? JSON.stringify(v, null, 2) : v.message) + '\n');
      process.exit(0);
    }

    const substrate = flagValue(argv, '--substrate');
    if (substrate !== 'local' && substrate !== 'gh-actions') {
      process.stderr.write(`error: --substrate must be 'local' or 'gh-actions'\n\n${USAGE}\n`);
      process.exit(2);
    }
    const ownerRepo = flagValue(argv, '--owner-repo');
    const launcherFlag = flagValue(argv, '--launcher');
    const launcher: Launcher | undefined = launcherFlag === 'tmux' || launcherFlag === 'nohup' ? launcherFlag : undefined;
    const runOpts: RunG4aOptions = { substrate, repoDir };
    if (profileDir) runOpts.profileDir = profileDir;
    if (actor) runOpts.actor = actor;
    if (ownerRepo) runOpts.ownerRepo = ownerRepo;
    if (launcher) runOpts.local = { launcher };
    const report = runG4a(runOpts);
    if (json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write(`${report.verification.message}\n`);
      if (report.goLive) {
        process.stdout.write(`${'message' in report.goLive ? report.goLive.message : JSON.stringify(report.goLive)}\n`);
      }
    }
    process.exit(0);
  }

  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}
