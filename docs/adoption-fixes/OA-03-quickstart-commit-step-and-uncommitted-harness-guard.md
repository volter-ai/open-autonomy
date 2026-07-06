# OA-03: local quickstart must include the commit-the-harness step, and the launch path must refuse an uncommitted harness

**Finding:** F-3 — The local quickstart omits the mandatory "commit the overlay" step; verbatim-docs users get a loop that looks alive while every worker dies at launch with `Unknown command: /develop` (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P0
**Fix target:** open-autonomy

## Problem

Agents launched with `--branch` run in **git worktrees**, which materialize only **committed** files. The
compiled harness (`scripts/`, `scheduler/`, `.claude/skills/`, `.codex/skills/`, `.open-autonomy/`,
`standards/`, `.claude/settings.json`) is written to the working tree by `compile` and is invisible to every
worker until committed. Yet the Local-runner quickstart's numbered steps 1-5 never instruct committing —
the requirement exists only as a parenthetical in a *different section* of the same doc. A user who follows
the quickstart verbatim gets:

- a scheduler that ticks "successfully",
- a PM that launches workers,
- every worker dying instantly inside its tmux session with `Unknown command: /develop` (the `/develop`
  invocation cannot resolve — the worktree has no `.claude/skills/develop/SKILL.md`),
- **zero error at the scheduler or runner level** — the failure is visible only by capturing the worker's
  terminal, and the PM re-dispatches the same doomed item every tick (audit §1 phase 4, item 14).

There are two defects: (a) the doc omits a mandatory step from the one place users follow step-by-step, and
(b) nothing in the launch path checks the precondition it depends on, so violating it is silent.

## Root cause (file:line citations you have verified by reading them)

Verified by reading on branch `adoption-fixes-backlog`.

**(a) The docs gap — `docs/OPERATIONS.md`:**

- The quickstart ("Local-runner quickstart", heading at `docs/OPERATIONS.md:59`) runs:
  - Step 1 Prerequisites (`:78-113`), Step 2 Start termfleet (`:114-139`),
  - **Step 3 "Compile a profile into your repo" (`:141-163`)** — runs
    `npx open-autonomy compile simple-sdlc local .` (`:152`) and describes the overlay files (`:158-163`),
    with **no commit instruction**,
  - **Step 4 "Run the loop" (`:165-187`)** — goes straight to `node scheduler/run.mjs --once` (`:168`),
  - **Step 5 "Give the loop work" (`:189-271`)**, local-git flavor at `:194-213` — ztrack install/init/issue
    create, still **no commit instruction**.
  Nowhere between compile (`:152`) and the first tick (`:168`) is `git commit` mentioned.
- The requirement IS stated — buried in the **§Install & operate** overlay blockquote,
  `docs/OPERATIONS.md:45-46`: "The OA files are **committed** to the repo (the agents run in git worktrees,
  which only see committed files — it's how OA maintains itself)." A side-note in a section the quickstart
  reader has no reason to re-open mid-install (audit F-15: load-bearing facts living in exactly one place).
- The compile CLI's printed next-steps have the same gap: `bin/autonomy-compile.ts:135-147` prints numbered
  local-loop next steps (prereqs → sign-in → termfleet → tracker → run the loop) — no commit step. So both
  onboarding surfaces (doc and CLI output) omit it.

**(b) The missing guard — `packages/substrate-local/`:**

- The scheduler tick is the emitted `scheduler/run.mjs`, whose source is the `LOOP_DRIVER` template string
  at `packages/substrate-local/src/emit.ts:66-167` (emitted at `emit.ts:255`). `fireTick`
  (`emit.ts:92-96`) shells out to the schedule's commands with **no precondition checks on the harness's git
  state**. Notably there is already exactly one launch-path guard of the shape this fix needs — the
  missing-termfleet check at `emit.ts:83-90`, added because "a schedule fired before `npm install termfleet`
  died several process-hops deep with a raw, buried ERR_MODULE_NOT_FOUND" (`emit.ts:78-82`). The uncommitted
  harness is the same class of failure, one step later, and today it doesn't even die loudly — it zombies.
- The worker-facing mechanism that makes the failure silent:
  - `packages/substrate-local/src/runner-frontend.ts:256-284` (`ensureWorktree`) creates the worktree from a
    committed base — uncommitted harness files simply don't exist in it;
  - the launch prompt still arrives (prompts are read from the **main checkout**:
    `run-agent.mjs` sets `AUTONOMY_PROMPT_DIR` from its own location, `emit.ts:182`; the backend reads the
    prompt file at `packages/substrate-local/src/backend.mjs:49-51`), so the session launches and sends
    `/develop` into a worktree that cannot resolve it (skills are copied to `.claude/skills/<behavior>/`,
    `emit.ts:283-284`; the harness invocation is `/behavior`, `emit.ts:213`);
  - the dead session then reads as **`done`**: `backend.mjs:139-149` maps idle
    (`session_waiting`, no signal) to `{ status: 'done', note: 'idle (turn complete)' }` (`:148`), and the
    loop reaps it (`backend.mjs:94-120`, driven from `emit.ts:156-160`) — so nothing upstream ever sees a
    failure (that indistinguishability is OA-08's subject; the *guard before launch* is this spec's).
- The deterministic list of what must be committed already exists: every compile writes
  `.open-autonomy/generated.json` (`packages/core/src/file-manifest.ts:14`,
  `GENERATED_MANIFEST_PATH`), containing `files: string[]` — the exact output footprint
  (`file-manifest.ts:21-35`, attached to local output at `emit.ts:299` via `withGeneratedManifest`). The
  guard does not need to guess paths.

## Proposed fix (spec depth; what/where/why-over-alternatives)

Three coordinated changes: an explicit doc step, the same step in the CLI's printed next-steps, and a
deterministic refuse-with-names guard at the tick.

### (a) `docs/OPERATIONS.md` — a numbered "Commit the harness" step in the quickstart

Insert a new step between today's step 3 (compile, `:141-163`) and step 4 (run the loop, `:165-187`), and
renumber the following steps (today's 4→5, 5→6, 6→7; also fix the two forward references at `:37-39` and
`:74-76` that say "steps 1-4 … step 5"):

> ### 4. Commit the harness
>
> The agents run in **git worktrees, which only see committed files** — an uncommitted harness produces
> workers that die at launch with `Unknown command: /develop`. Commit everything the compile wrote before
> the first tick:
>
> ```bash
> git add scripts/ scheduler/ .claude/ .codex/ .open-autonomy/ standards/
> git commit -m "Install the open-autonomy harness"
> ```
>
> The authoritative list of what the compile wrote is `.open-autonomy/generated.json` — stage from it if
> you keep any of those directories partially ignored:
> `git add $(node -p "JSON.parse(require('fs').readFileSync('.open-autonomy/generated.json','utf8')).files.join(' ')")`.
> Note `.claude/settings.json` is part of the harness (the ztrack drive-to-green Stop hook) and is included
> above. Re-run this step after every re-compile/upgrade. (No push is required: on the local-git code host,
> worktrees base on your **local** trunk — committing locally is sufficient. GitHub code host installs
> (`simple-gh-sdlc`) additionally push as part of their normal PR flow.)

The staging list above is exact for `simple-sdlc` (generated set: `scripts/*`, `scheduler/run.mjs`,
`scheduler/schedule.json`, `.open-autonomy/autonomy.yml`, `.open-autonomy/generated.json`,
`scripts/prompts/{claude,codex}/*.txt`, per `emit.ts:224-266`; copies: `.claude/skills/*`,
`.codex/skills/*` per `emit.ts:283-284`, plus resources `.claude/settings.json` and `standards/*.md` per
`profiles/simple-sdlc/ir.yml:80-84`). Also update the buried note at `:45-46` to *link* to the new step
("see quickstart step 4") rather than remaining the requirement's only home.

### (b) `bin/autonomy-compile.ts` — the same step in the printed next-steps

In the local-loop next-steps block (`bin/autonomy-compile.ts:135-147`), insert a "Commit the harness" step
immediately before "Run the loop" with the same two commands, and adjust the step-numbering expression at
`:145` (today `${tracker ? 5 : 4}`; becomes commit at `tracker ? 5 : 4` and run-the-loop at
`tracker ? 6 : 5`). This is the message every adopter actually sees at the moment the files land — the doc
alone doesn't reach a user driving via `npx`.

### (c) The runtime guard — refuse a tick when the harness is uncommitted, naming the paths

**Where:** the `LOOP_DRIVER` template in `packages/substrate-local/src/emit.ts` (emitted as
`scheduler/run.mjs`), immediately after the existing termfleet guard (`emit.ts:83-90`) and before any tick
fires — this is the launch path's front door, runs for both `--once` and continuous mode, and is the
earliest point that can stop the PM (and therefore all downstream zombies) with one message. The check:

1. **No-op conditions:** not a git repo (`git rev-parse --git-dir` fails), or `.open-autonomy/generated.json`
   absent (legacy install) → skip silently. (The `hello` profile in a git repo IS checked — its greeter
   doesn't use worktrees, but a committed harness is still the documented invariant and the check is
   harmless; keeping it unconditional avoids re-deriving "does this schedule isolate" here.)
2. **Compute the uncommitted set** from the manifest: `files = JSON.parse(generated.json).files`, then
   `git status --porcelain -- <files...>` (one spawn; paths that are untracked (`??`) or modified/added
   (any status) are "uncommitted"). This exactly detects both the never-committed and the
   partially-committed harness, and nothing else — user files are never inspected (the manifest lists only
   what open-autonomy provably wrote, `file-manifest.ts:1-9`).
3. **If non-empty: refuse** — print and `process.exit(1)`:

   ```
   [loop] the open-autonomy harness is not (fully) committed — agents run in git worktrees, which only
   see committed files; launching now would produce workers that die at launch (Unknown command: /develop).
     uncommitted (N):
       .claude/skills/develop/SKILL.md
       scripts/runner.ts
       …
     Fix:  git add <the paths above>  &&  git commit -m "Install the open-autonomy harness"
     (docs/OPERATIONS.md#local-runner-quickstart, step 4. Override: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1)
   ```

   The env override (`AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1` → warn, don't exit) exists for harness
   developers iterating on the loop driver itself; default is refuse, because the un-overridden failure mode
   is silent uncapped spend.
4. **Style/precedent:** mirror the termfleet guard exactly (`emit.ts:83-90`): plain Node, `spawnSync('git',
   …)`, message with a one-line `Fix:` and a docs pointer. Keep it inside `LOOP_DRIVER` (no new emitted
   file). Add a unit test beside `scheduler-termfleet-guard.test.ts` (that file tests the existing guard —
   same harness applies): temp git repo + minimal manifest + a schedule, assert exit 1 + path names when
   dirty, exit 0 when clean, no-op when not a git repo.

**Why the tick and not the compile verb:** `compile` *just wrote* the files — at that moment they are
uncommitted by construction, so a compile-time check can only nag, not verify (its job is the printed step,
(b)). The tick is the first moment the precondition is load-bearing, checks the *current* state on every
run (catching post-upgrade drift and partial commits weeks later), and is the single choke point ahead of
every launch. A second, per-launch skill-presence check inside `runner.ts launch` is OA-08's deterministic
pre-check — complementary, not duplicative: this guard answers "did you commit what compile wrote", OA-08's
answers "will THIS worker's skill resolve in THIS worktree" (which also catches causes other than an
uncommitted overlay, e.g. a skill deleted in a later commit).

## Alternatives rejected

1. **Docs-only fix (add the step, no guard).** Rejected: the audit proved the failure is silent and
   near-undiagnosable from the outside (visible only via terminal capture, PM reports "finished"); a doc
   step doesn't protect the user who re-compiles later and forgets, or commits partially. On the local
   runner the cost of the silent state is unbounded model spend (OPERATIONS.md:186-187). Also the audit's
   verdict (§5) explicitly calls for the install to become self-verifying — "overlay committed and visible
   from a freshly created worktree" is named as the check that subsumes F-2 and F-3.
2. **Guard-only fix (no doc step).** Rejected: the quickstart must stand alone; hitting an error tick as the
   designed way to learn about committing is hostile, and the CLI next-steps print (`:135-147`) would keep
   promising a working loop it can't deliver.
3. **Auto-commit the harness from `compile` (or from the guard).** Rejected: `compile` writing to git
   history mutates the host repo beyond its remit (the audit's F-9/F-17 class); the operator may want to
   review/squash/exclude; and an auto-commit inside the *scheduler* would commit whatever else is staged.
   Print the exact command instead; the human runs it.
4. **Checking inside `runner-frontend.ts`'s `launch()` only (skip the tick guard).** Rejected as the *only*
   guard: by launch time the PM session already spent a model run, and the PM's own launch (no `--branch`,
   trunk checkout, `runner-frontend.ts:313-316`) succeeds against an uncommitted harness — so the first
   named failure would surface inside the PM's transcript instead of the operator's terminal. Kept as
   defense-in-depth under OA-08.
5. **Making worktrees see uncommitted files (copy the working tree instead of `git worktree add`).**
   Rejected: destroys the isolation guarantee worktrees exist for (a worker would inherit the operator's
   dirty state), diverges from the GitHub substrate's committed-checkout semantics, and contradicts the
   repo's own doctrine ("it's how OA maintains itself", OPERATIONS.md:46).

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Uncommitted harness → the tick refuses, naming the paths.** FAILS today (silent zombie); PASSES after.
   ```bash
   mkdir /tmp/oa03 && cd /tmp/oa03 && git init -q && git commit -q --allow-empty -m base
   bun <checkout>/bin/autonomy-compile.ts simple-sdlc local .      # write harness, do NOT commit
   node scheduler/run.mjs --once; echo "exit=$?"
   ```
   After: exit 1; stderr contains `.claude/skills/develop/SKILL.md` (and the other uncommitted paths), the
   exact `git add … && git commit` remediation, and the docs anchor. Today: exit 0, PM launch attempted,
   no error mentioning commits.
2. **Partially committed harness → refuses naming only the missing paths.** After AC-1's setup:
   `git add scripts/ scheduler/ .open-autonomy/ && git commit -m partial`, then
   `node scheduler/run.mjs --once` → exit 1, names the still-uncommitted `.claude/…`/`.codex/…`/`standards/…`
   paths and does NOT name the committed ones. FAILS today; PASSES after.
3. **Fully committed → tick proceeds (regression).** `git add -A && git commit -m harness`, then
   `node scheduler/run.mjs --once` → the guard is silent and behavior is exactly today's (schedule commands
   fire; with termfleet absent the pre-existing `emit.ts:83-90` guard message appears — unchanged). PASSES
   today; must still PASS after.
4. **Non-git directory → no crash, no false refusal.** `hello` profile compiled into a non-repo dir:
   `node scheduler/run.mjs --once` behaves as today. PASSES today; must still PASS after.
5. **Override:** `AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 node scheduler/run.mjs --once` with a dirty harness →
   warns (same path list) but proceeds, exit as today. FAILS today (flag doesn't exist); PASSES after.
6. **Docs:** `docs/OPERATIONS.md` quickstart contains a numbered "Commit the harness" step between the
   compile step and the run-the-loop step, with the exact staging list and the worktree rationale; the
   `:45-46` note links to it; the step counts at `:37-39`/`:74-76` are consistent. Testable:
   `grep -n "Commit the harness" docs/OPERATIONS.md` lands inside §Local-runner quickstart before "Run the
   loop". FAILS today; PASSES after.
7. **CLI print:** `bun bin/autonomy-compile.ts simple-sdlc local <tmpdir>` output includes the commit step
   before "Run the loop", correctly numbered with and without the tracker step (compare `hello` vs
   `simple-sdlc` outputs). FAILS today; PASSES after. Unit-coverable in `bin/autonomy-compile.test.ts`.
8. **Guard unit tests** in `packages/substrate-local` (beside `scheduler-termfleet-guard.test.ts`) cover
   AC-1/2/3/4/5's logic against a temp repo. FAIL today (don't exist); PASS after.
9. `bun run check` passes.

## Dependencies (OA-XX blocks/blocked-by + reason; OA-02 and OA-03 are closely related — state the ordering you recommend)

- **Blocked-by OA-02 (recommended order: OA-02 first, then OA-03).** This spec's doc step and guard message
  say "commit" and explicitly "(No push is required…)". That statement is true on a remote-having repo —
  the normal case — only after OA-02 bases local-git worktrees on local HEAD. Landing OA-03 first would
  force interim wording ("commit **and push**"), i.e. the product-owner-rejected framing, and then a second
  doc edit. If sequencing is impossible, OA-03's texts must still be written in the OA-02 form and the pair
  released together.
- **Blocks nothing hard; complements OA-08.** OA-03's tick guard removes the most common *cause* of OA-08's
  zombie (whole/partial uncommitted overlay) before any launch; OA-08's per-launch skill pre-check remains
  necessary for causes this guard can't see (a skill file deleted/renamed in a *committed* change, a stale
  worktree base, a forked profile with a wrong behavior name). Either can land without the other; both are
  required to close the audit's "silent zombie" chain.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-3 (also F-15's one-doc-owns-a-load-bearing-fact pattern), §1
  phase 4 items 12-15 (the observed zombie + the 39-file commit), §4 row 6, §5 (the self-verifying-install
  verdict naming this exact check).
- Source verified by reading on branch `adoption-fixes-backlog`:
  `docs/OPERATIONS.md:37-39, 41-46, 59, 74-76, 141-163, 165-187, 194-213`;
  `bin/autonomy-compile.ts:109-148` (next-steps print, numbering at `:145`);
  `packages/substrate-local/src/emit.ts:66-167` (LOOP_DRIVER; termfleet-guard precedent `:83-90`; fireTick
  `:92-96`; emitted at `:255`), `:182, :213, :224-266, :283-284, :299`;
  `packages/substrate-local/src/runner-frontend.ts:256-284, 313-316`;
  `packages/substrate-local/src/backend.mjs:49-51, 94-120, 139-149`;
  `packages/core/src/file-manifest.ts:1-35` (`GENERATED_MANIFEST_PATH`, `withGeneratedManifest`);
  `profiles/simple-sdlc/ir.yml:80-84` (resources incl. `.claude/settings.json`).
