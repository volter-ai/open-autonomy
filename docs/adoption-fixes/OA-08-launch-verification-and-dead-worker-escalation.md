# OA-08: launch verification — fail fast when a worker's skill cannot resolve, and PM escalation after repeated failed launches

**Finding:** F-7 (compounding note, split out) — the PM cannot distinguish a worker that died at launch from one that finished; it reports dead runs as "finished" and re-dispatches the same doomed item every tick, forever, with no escalation (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

When a dispatched worker dies at launch — canonically: its skill invocation doesn't resolve, the session
prints `Unknown command: /develop` and sits idle — nothing in the system registers a failure:

- `runner.ts launch` exits **0** regardless;
- the session's status, as reported by `list`/`get`, becomes **`done`** ("idle (turn complete)") — the exact
  same terminal shape as a worker that finished its job;
- the loop then **reaps** the idle session, erasing even that ambiguous evidence;
- the PM, whose doctrine reads sessions and board state, sees a `ready` issue with no running `develop`
  session and dispatches it again — every tick, forever, one dead model session per tick, with no
  escalation and no memory that the previous dispatches failed (audit §1 phase 4 items 13-14: the same
  doomed item was re-dispatched across ticks while the runs were reported as "finished").

On the local runner this is unbounded spend on a loop that can never make progress, and it is the failure
*surface* of both OA-02 (worktree based on stale `origin/<trunk>` → harness absent) and OA-03 (harness never
committed → absent from every worktree). Those two specs remove the common causes; this spec makes the
failure class itself impossible to park silently: launches must be **verified**, and repeated failures must
**escalate**.

## Root cause (file:line citations you have verified by reading them)

Verified by reading on branch `adoption-fixes-backlog`. Three layers, none of which can see a dead-at-launch
worker:

1. **The runner launches blind and reports success unconditionally —
   `packages/substrate-local/src/runner-frontend.ts`:**
   - `launch()` (`:287-364`), skill-agent route: it resolves only the manifest entry (`:288`,
     `manifestAgent(agent)` → `skill: behavior`), creates/reuses the worktree (`:314-316`), and spawns
     `run-agent.mjs` (`:363`) — **it never checks that the behavior's skill file exists in the session's
     cwd**. The invocation that must resolve is the emitted prompt `/develop` (prompt files:
     `packages/substrate-local/src/emit.ts:206-216`, claude form `/${agent.behavior}` at `:213`), which the
     coding CLI resolves against the *session cwd's* `.claude/skills/<behavior>/SKILL.md`
     (copies emitted at `emit.ts:283-284`). The session cwd is the worktree (`createAgentWindow`'s
     `cwd: process.cwd()`, `backend.mjs:56-58`, spawned with `cwd: worktree` at `runner-frontend.ts:363`) —
     which contains the skill only if it is present on the worktree's base commit. Prompt files, by
     contrast, are read from the **main checkout** (`AUTONOMY_PROMPT_DIR` set from the scripts dir,
     `emit.ts:182`; read at `backend.mjs:49-51`) — so the prompt always arrives even when the skill can't
     resolve: the zombie-producing asymmetry.
   - The child's exit status is discarded: `:363` (`spawnSync(… run-agent.mjs …)` with no check of
     `r.status`), and the CLI path returns success unconditionally: `:472-473`
     (`await launch(agent, flags); return 0;`). A PM shelling `bun scripts/runner.ts launch …` can never
     observe a launch failure via exit code today.
2. **The session-state vocabulary has no "died at launch" —
   `packages/substrate-local/src/backend.mjs:135-149` (`sessionOf`):** termfleet's activity states are
   mapped to the contract vocabulary (`running|paused|cancelled|done|failed`, comment `:136-138`); an idle
   session (`session_waiting`, no attention signal) maps to `{ status: 'done', note: 'idle (turn
   complete)' }` (`:148`). A worker that printed `Unknown command: /develop` and stopped is *exactly* an
   idle session — so `list`/`get` (`backend.mjs:72-88`) report it as `done`, indistinguishable from a
   successful finish. (Only an `errored` attention signal maps to `failed`, `:147`; an unresolved slash
   command raises none.) The loop then reaps idle sessions entirely
   (`reapIdle`, `backend.mjs:94-120`, driven by the loop driver at `emit.ts:156-160`), removing the session
   from `list`.
3. **PM doctrine has no failure branch and no cross-tick memory —
   `profiles/simple-sdlc/skills/pm/SKILL.md`:** the tick (`:49-85`) reads board + worktrees + sessions and
   takes one action (integrate/review/develop); `:78` — "Do not wait for a launched worker to finish."
   The develop rule (`:69-76`) dispatches "a `ready` issue with no `agent/issue-<id>` branch yet" or "an
   `in-progress` issue whose branch exists but has no running `develop` session". A dead-at-launch worker
   leaves the issue `ready`/unchanged with no running session — matching a dispatch rule again next tick.
   Nothing in the skill defines what a failed launch *is*, records one on the board (each tick is a fresh
   session — memory must live on the board), or escalates after N repeats.

## Proposed fix (spec depth; what/where/why-over-alternatives)

Layered: a **deterministic runner pre-check** (primary — cheap, exact, fails before any model spend), honest
**exit-status propagation**, and **PM escalation doctrine** (agent judgment, backed by board state) for
whatever still fails. What's deterministic vs judgment:

- *Deterministic (runner, primary):* "will this launch's skill invocation resolve in this session's cwd" is
  a file-existence fact, decidable before launch for zero cost. The runner owns it.
- *Agent judgment (PM, secondary):* "this ref has now failed to launch twice — stop dispatching and
  escalate" is cross-tick triage over board state. The PM owns it (per CLAUDE.md's "scripts only for
  security; judgment belongs to an agent" doctrine — counting and deciding to escalate is triage, not a
  security boundary).

### 1. Runner pre-check (primary) — `packages/substrate-local/src/runner-frontend.ts`

In `launch()`'s skill-agent route, after the worktree is ensured (`:316`) and before spawning
`run-agent.mjs` (`:363`), verify the invocation can resolve:

- Compute the session cwd: `const cwd = worktree || process.cwd();` (matches where `backend.mjs:57` runs
  the session).
- Resolve the active harness **identically to `run-agent.mjs`** (`emit.ts:181`):
  `process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness` — import the default from the co-located
  `./runner-defaults.mjs` (emitted beside this file, `emit.ts:242`; in-package it resolves from
  `runner-config.ts`'s module) rather than re-hardcoding `'claude'`.
- Map harness → skills root exactly as the compiler installs them (`emit.ts:283-284`): `codex` →
  `.codex/skills/`, anything else (claude default) → `.claude/skills/`.
- Check `join(cwd, skillsRoot, behavior, 'SKILL.md')`. **If absent, refuse the launch**: no session is
  created, no effect marker recorded, and the error is named and actionable:

  ```
  [runner] launch refused: develop's skill "develop" is missing at
  .worktrees/agent-issue-7/.claude/skills/develop/SKILL.md — the session would die at launch
  ("Unknown command: /develop"). The worktree contains only files committed on its base; commit the
  harness on trunk (docs/OPERATIONS.md#local-runner-quickstart, "Commit the harness"), or check the
  skill exists for harness "claude". (branch agent/issue-7, base <sha>)
  ```

  Leave the worktree in place (creation is idempotent, `:257`; it becomes valid once the cause is fixed).
- Extract the decision as an exported pure helper for tests, mirroring `mergeInFlight`'s precedent
  (`:392`): `export function skillPathFor(harness: string, behavior: string, cwd: string): string` (+ the
  existence check at the call site), unit-tested in `packages/substrate-local`.
- Scope: applies to skill agents launched **with or without** `--branch` (a trunk-checkout launch of a
  skill missing from the main checkout is the same death); script agents (`:296-305`) and the human route
  (`:290-294`) are untouched. The PM's own scheduled launch goes through the same route via
  `run-agent.mjs` → `autonomy-runner.mjs launch` — note that path calls the **backend** directly, not this
  frontend; see step 3 for how the tick-launched PM is covered.

### 2. Propagate failure honestly — same file (+ the emitted driver)

- `launch()` currently returns `Promise<void>` and swallows child status. Change it to return an exit code
  (or throw a typed error): the pre-check failure returns non-zero, and the spawn results at `:304`, `:332`,
  `:363` propagate `r.status ?? 1` instead of being discarded.
- `runCli`'s launch branch (`:466-473`) returns `launch()`'s code instead of the unconditional `0` at
  `:473`. Now `bun scripts/runner.ts launch …` — the PM's only dispatch verb
  (`profiles/simple-sdlc/skills/pm/SKILL.md:30-34`) — fails *visibly in the PM's own transcript*, which is
  what makes the PM doctrine in step 4 workable.
- `run-agent.mjs` (`emit.ts:196-198`) already propagates the runner's status (`r.status ?? 1`), so no change
  there; the scheduler tick's `spawnSync` (`emit.ts:92-96`) inherits stdio, so the refusal is visible in the
  operator's terminal too.

### 3. Backend guard for the tick-launched PM — `packages/substrate-local/src/backend.mjs`

The scheduler launches the PM via `run-agent.mjs` → `autonomy-runner.mjs launch <agent>`
(`emit.ts:197`, backend CLI `backend.mjs:171-179`), bypassing the frontend — so a missing *PM* skill would
still zombie. Apply the same pre-check in `TermfleetRunner.launch()` (`backend.mjs:30-71`), before
`createAgentWindow` (`:56`): session cwd is `process.cwd()` (`:57`), harness is `this.harness` (`:22`);
if `<cwd>/<skillsRoot>/<window-name>'s behavior…` — the backend doesn't know the manifest's behavior
mapping, but for every emitted prompt the invocation name is the prompt file's content (`/name`), and the
launch's prompt file is already resolved at `:49-51` — so the check is: when a prompt file exists and its
content is a skill invocation (`/x` or `$x`), verify the corresponding skills path exists in cwd; throw the
same named error as step 1 (`launch` already throws on missing terminalId, `:61-63` — same failure channel,
already surfaced by the CLI). When no prompt file exists (bare-name prompt fallback `:51`), skip — nothing
deterministic to verify. Keep both checks: the frontend one gives the PM-facing error *with worktree/base
context*; the backend one covers direct backend launches (the scheduler's PM, manual
`autonomy-runner.mjs launch`).

### 4. PM escalation doctrine — `profiles/simple-sdlc/skills/pm/SKILL.md`

Add a "Failed launches" rule to the tick doctrine (after the dispatch rules, `:69-76`):

- A `runner.ts launch` that **exits non-zero is a failed dispatch** — the issue is *not* claimed and the
  tick's one action was *not* taken; record the failure on the board before ending the tick (ticks are
  fresh sessions — the board is the only memory): add a `launch-failed` label to the issue and a comment
  containing the runner's error line.
- On a later tick, before dispatching an issue that carries `launch-failed`: if the launch fails **again**
  (N=2 total), stop dispatching it — mark it blocked for a human
  (`ztrack issue edit <id> --add-label human-required` per the profile's blocked convention, mirroring the
  existing "blocked-for-human" note at `:14-16`), put the runner error in a comment, and end the tick with
  `OUTCOME: blocked launch-failure <id>`. Never dispatch a `launch-failed`-labeled issue more than once
  more; never remove the label yourself — a human clears it after fixing the cause.
- A *successful* dispatch of an issue carrying `launch-failed` clears the label (the failure was
  environmental and is gone).

This is judgment-layer by design: the deterministic layer (steps 1-3) guarantees the PM *sees* a failure as
a failure; the doctrine only decides when repetition becomes escalation. N=2 keeps one retry for transient
causes (e.g. the operator committing the harness between ticks) while capping spend at two dead dispatches
per ref instead of infinity.

### Why the pre-check is primary (vs post-launch detection)

The pre-check is exact for the observed failure class (unresolvable skill), costs one `existsSync`, runs
*before* a model session exists (zero spend, zero zombie, zero reap-race), and its error names the precise
path — turning the audit's two multi-hour silent failures (F-2, F-3 symptoms) into a one-line diagnosis.
Post-launch detection (scanning transcripts for `Unknown command:`) is inherently secondary: it costs a
launched session first, races the reaper, and depends on harness-specific output strings — see Alternatives.

## Alternatives rejected

1. **Post-launch transcript sniffing as the primary mechanism** (detect `Unknown command: /<skill>` in the
   session and mark it `failed`). Rejected as primary: string- and harness-specific (claude vs codex vs
   future CLIs), races `reapIdle` (`backend.mjs:94-120`), requires new transcript-capture plumbing in the
   backend, and spends a session per detection. May be added later as a generic "session died in its first
   turn" heuristic, but the deterministic pre-check already covers the known class for free.
2. **A new contract status (e.g. `dead-at-launch`) in the session vocabulary.** Rejected: the vocabulary
   (`running|paused|cancelled|done|failed`, `backend.mjs:136-138`) is the cross-substrate Runner contract
   (docs/SPEC.md#the-runner); widening it for one substrate's launch defect changes every consumer. The
   pre-check makes the state unrepresentable instead of representable-and-handled.
3. **Making the runner itself count failures and auto-block issues.** Rejected: the runner is
   deliberately methodology-blind (no tracker/issue knowledge — architecture invariant
   `substrate-is-runner-only`, `runner-frontend.ts:54-56`); counting per-ref failures and editing the board
   is SDLC judgment and belongs to the PM (CLAUDE.md: never script what an agent can do; scripts are for
   security boundaries only).
4. **Having the scheduler kill/flag idle sessions faster.** Rejected: idleness is not failure — a
   *successful* worker also ends idle (`backend.mjs:148` maps both to `done` for a reason); tightening the
   reaper changes nothing about distinguishability.
5. **Only fixing OA-02/OA-03 and skipping launch verification.** Rejected: those close the two *known*
   causes; a missing skill still arises from committed deletions/renames, forked profiles with mismatched
   behavior names (`bin/autonomy-compile.ts:86-90` catches mismatch at compile time but not post-compile
   drift), wrong `TERMFLEET_AGENT` harness with a partial install, or stale worktree bases. The audit's
   compounding observation is precisely that the *system cannot see* this class — cause-by-cause fixes
   don't restore visibility.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Missing skill in the worktree → launch fails fast with a named error, no session.** FAILS today
   (exit 0, zombie session); PASSES after.
   ```bash
   cd /tmp/oa08/repo   # a compiled simple-sdlc install, harness committed (per OA-03), termfleet up
   git rm -r .claude/skills/develop && git commit -m "break develop"   # committed deletion — OA-03's
                                                                       # guard stays green
   bun scripts/runner.ts launch develop --ref 7 --branch agent/issue-7; echo "exit=$?"
   ```
   After: exit non-zero; stderr names the agent, the behavior, the exact missing path
   (`.worktrees/agent-issue-7/.claude/skills/develop/SKILL.md`), and the remediation;
   `bun scripts/runner.ts list develop` shows no new session; no effect marker under
   `.open-autonomy/runner-state/effects/`. Today: exit 0 and a parked session that later reads `done`.
2. **Trunk-checkout skill launch with a missing skill** (no `--branch`) refuses the same way. FAILS today;
   PASSES after.
3. **Exit-status propagation:** with termfleet's provider down, `bun scripts/runner.ts launch develop --ref
   7 --branch agent/issue-7` exits non-zero (backend `launch` throws, `backend.mjs:61-63`). Today:
   the thrown error prints but `runCli` still returns 0 (`runner-frontend.ts:472-473` — verify: the spawn
   at `:363` inherits stdio and its status is dropped). FAILS today; PASSES after.
4. **Backend guard (scheduler-launched PM):** delete `.claude/skills/pm/` (committed), run
   `node scheduler/run.mjs --once` → the tick surfaces a named skill-missing error for `pm` and creates no
   session (assert via `node scripts/autonomy-runner.mjs list`). FAILS today (PM session zombies); PASSES
   after.
5. **Regression:** with the harness intact, `launch develop --ref <id> --branch agent/issue-<id>` creates a
   session exactly as today (`list develop` shows it `running`); the `hello` profile's greeter tick still
   works; script-agent and human-actor launches unchanged. PASSES today; must still PASS after.
6. **Unit tests** (`packages/substrate-local`): `skillPathFor` truth table (claude/codex × branch/no-branch);
   pre-check refusal returns non-zero and writes no effect marker; backend prompt-file check skips when no
   prompt file exists. FAIL today (don't exist); PASS after.
7. **PM doctrine present and exercised:** `profiles/simple-sdlc/skills/pm/SKILL.md` contains the
   failed-launch rule (grep: `launch-failed`); live/bench verification (per the repo's live-proof doctrine):
   with a permanently broken `develop` skill, tick 1 dispatches and records `launch-failed` on the issue,
   tick 2 re-attempts, fails, marks the issue human-required with `OUTCOME: blocked launch-failure <id>`,
   and tick 3 dispatches **nothing** for that ref. FAILS today (infinite re-dispatch, audit §1 item 14);
   PASSES after. (Judgment-layer: verified behaviorally, not unit-tested — consistent with the repo's
   PM-doctrine testing posture.)
8. `bun run check` passes (including `check:profiles` on the edited PM skill).

## Dependencies (OA-XX blocks/blocked-by + reason; OA-02 and OA-03 are closely related — state the ordering you recommend)

- **No hard blockers; recommended order OA-02 → OA-03 → OA-08.** OA-02 and OA-03 remove this failure's two
  common causes (stale origin-based worktree; uncommitted harness) — land them first so OA-08's refusal
  message is a rare last line of defense rather than the everyday first-run experience. OA-08 is
  independently implementable and testable (its AC deliberately uses a *committed* skill deletion, which
  neither OA-02 nor OA-03 detects).
- **Interaction with OA-03:** OA-03's tick guard answers "did you commit what compile wrote" at the loop's
  front door; OA-08's pre-check answers "will THIS launch's skill resolve in THIS cwd" at each dispatch.
  Complementary, not duplicative; OA-08's remediation text points at OA-03's quickstart commit step for the
  uncommitted-cause case.
- **Interaction with OA-02:** until OA-02 lands, a repo with a remote produces worktrees whose base lacks
  the harness even when committed — OA-08's pre-check converts that from a silent zombie into a named error
  (the worktree path + base SHA in the message make the stale-base cause diagnosable), which is precisely
  the visibility the audit lacked at §1 items 14-15.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-7 (the compounding "cannot distinguish died-at-launch from
  finished / re-dispatches forever" note — split into this spec; the day-one-backlog-fence half of F-7 is
  NOT covered here), §1 phase 4 items 13-15, §5 (the self-verifying-install verdict: "a skill invocation
  resolves → one tick launches a worker that survives launch").
- Source verified by reading on branch `adoption-fixes-backlog`:
  `packages/substrate-local/src/runner-frontend.ts:54-56, 256-284, 287-364 (esp. :288, :296-305, :313-316,
  :363), :392, :466-473`;
  `packages/substrate-local/src/backend.mjs:22, 30-71 (esp. :49-51, :56-58, :61-63), :72-88, :94-120,
  :135-149 (esp. :147-148), :171-179`;
  `packages/substrate-local/src/emit.ts:156-160, 181-182, 196-198, 206-216, 242, 283-284`;
  `profiles/simple-sdlc/skills/pm/SKILL.md:14-16, 30-34, 49-85 (esp. :69-76, :78)`;
  `bin/autonomy-compile.ts:86-90` (compile-time skill-name check — establishes that post-compile drift is
  currently uncaught anywhere at launch time).
