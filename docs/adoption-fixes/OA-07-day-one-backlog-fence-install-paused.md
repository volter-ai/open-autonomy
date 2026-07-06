# OA-07: day-one fence against an existing backlog — install lands PAUSED, and the PM must read an issue before dispatching it

**Finding:** F-7 — No day-one fence against an existing backlog: the PM's first tick on a populated board dispatched a size-L pre-existing issue whose body explicitly said "do not dispatch" — uncapped local spend on parked work (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

Compiling `simple-sdlc` into a repo that already has a populated ztrack board arms a spend loop against a
backlog nobody approved for automation:

- The audit's first successful tick (§1 phase 4, item 13) swept the target repo's ~52 pre-existing issues
  and dispatched `develop` on **TF-603 — a size-L item whose body explicitly says "do not dispatch it"**
  (a recorded deferral), in preference to the auditor's tiny fresh issue. The issue's *state machine* said
  `ready`; the *prose* said deferred. On the local runner there is no proxy budget — every dispatch bills
  the operator's own model subscription, and the loop re-ticks every 15 minutes.
- There is **no "start paused"**: the first `node scheduler/run.mjs --once` (the documented verification
  step, `docs/OPERATIONS.md:168`) fires the PM immediately, and continuous mode fires it every
  `intervalSeconds` forever. Stopping is documented (`docs/OPERATIONS.md:182-187` — "a stopped loop is what
  bounds model billing"); *starting stopped* does not exist.
- There is **no new-work allowlist**: the PM treats every `ready` issue on the board as eligible, with no
  distinction between "created for this loop" and "52 items of pre-existing backlog the owners parked".
- The PM **never reads the issue body** before dispatching, so an explicit do-not-dispatch/deferred marker
  in prose is invisible to it. The only layer that caught TF-603's deferral was the *developer* — one full
  dispatched session later (audit addendum: the worker read the body, chased the decision record, refused,
  and exited `blocked human-required`). The safety worked at the worker layer at the cost of one paid
  session per bad pick, every time the PM re-picks it.

A fresh install into any lived-in repo therefore starts spending on the wrong work on day one, before the
operator has expressed any intent about the existing backlog.

## Root cause (verified file:line citations)

All paths relative to the repo root; all lines verified by reading on branch `adoption-fixes-backlog`.

**1. The scheduler has no pause concept — a compiled install is hot the moment it is run.**

- `packages/substrate-local/src/emit.ts:66-167` — the `LOOP_DRIVER` template string that `compileLocal`
  emits verbatim as `scheduler/run.mjs`. Its entire configuration surface is one file: line 72 reads
  `process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json'`, line 74 parses it. `fireTick`
  (lines 92-96) iterates `schedule.scripts` unconditionally; `--once` (lines 98-101) calls `fireTick()`
  and exits; continuous mode (lines 150-165) calls it on the interval. **No pause flag, marker file, or
  policy key is consulted anywhere in the driver.**
- `packages/substrate-local/src/emit.ts:253-265` — `compileLocal` generates `scheduler/schedule.json`
  with exactly `{ intervalSeconds, env, scripts }` (line 265). No paused/armed field exists in the schema.
- `packages/substrate-local/src/runner-frontend.ts:287` — `export async function launch(...)`, the seam
  every dispatch goes through (`bun scripts/runner.ts launch develop …`). It reads
  `.open-autonomy/autonomy.yml` today (`manifestAgent`, lines 104-109, and `manifestCodeHost`,
  lines 114-120) but checks no pause/fence state before launching.
- Contrast the **github substrate**, which already treats deterministic pausing as a security-class
  concern: `packages/substrate-github/src/emit.ts:80-85` — "The whole thing is gated by the repo-pause
  kill-switch: `PUBLIC_AGENT_REPO_PAUSED` is a repo VARIABLE (deterministically checkable in `if:` …) so a
  paused fleet skips every agent job deterministically — not by the PM model noticing a label"
  (`REPO_NOT_PAUSED` at line 85). **The local substrate has no analogue of this kill-switch at all** — and
  a kill-switch is only a *stop* control; neither substrate has *start-paused*.

**2. The PM's dispatch doctrine selects work from list metadata only and never reads the body.**

- `profiles/simple-sdlc/skills/pm/SKILL.md:51` — tick step 1 reads the board as
  `ztrack issue list --state open --limit 100 --json identifier,title,state,labels,assignee`. The body is
  not in the field list; no later step views an issue before dispatch.
- `profiles/simple-sdlc/skills/pm/SKILL.md:69-76` — the develop-dispatch rule: eligible = "a `ready` issue
  with **no** `agent/issue-<id>` branch yet (fresh work)". State is the sole eligibility signal ("State is
  a PROPERTY you READ to decide", line 53). Nothing requires reading the issue, nothing defines
  deferred/blocked-by/do-not-dispatch prose as ineligible, nothing prefers fresh work over old backlog.
- `profiles/simple-sdlc/skills/pm/SKILL.md:13-16` — the **only** pre-dispatch ineligibility check that
  exists today: consult `policy.risk.human_required_topics` / `policy.risk.human_required_paths` in
  `.open-autonomy/autonomy.yml`. This proves the pattern (PM consults policy from the manifest before
  dispatch) but its scope is risk topics/paths, not backlog provenance or body markers.
- `profiles/simple-sdlc/standards/workflow.md:30-43` — the states table: `ready` = "issue can be
  implemented". The preset has no deferred/parked state, so a parked item can only express its parking in
  prose — which nothing obliges the PM to read.

**3. No policy vocabulary exists for a backlog fence, though the plumbing for one is already in place.**

- `profiles/simple-sdlc/ir.yml:57-77` — the policy box carries only `tracker.ztrackPreset` and `risk.*`.
  No dispatch/allowlist/backlog key.
- `packages/core/src/manifest.ts:72-73,80` — `emitAutonomy` carries `ir.policy.box` **verbatim** into
  `.open-autonomy/autonomy.yml` ("it is opaque governance, not a fixed schema"), and
  `packages/substrate-local/src/emit.ts:227-229` writes that manifest into every install. So a new
  `policy.box.dispatch.*` key reaches every install with zero core/substrate schema work.
- `bin/autonomy-compile.ts:135-147` — the local-install "Next steps" print; today its final step is
  "Run the loop" (line 145). This is where the unpause step must appear.
- `packages/core/src/upgrade.ts:17-37` — `INSTALL_OWNED_PATHS` ("seeded only if MISSING and never
  overwritten") — the existing seed-once semantics the pause marker must adopt so an operator's unpause is
  never reverted by a re-compile/upgrade.

## Proposed fix

Two mechanisms, layered. The **primary is deterministic** (script-enforced, per the repo's own doctrine
that a boundary an agent must not control is the one legitimate use of a script — CLAUDE.md "Scripts only
for security"); the **secondary is policy + PM doctrine** (governs what is eligible *after* the operator
unpauses).

### Primary — a fresh local install lands PAUSED; the scheduler refuses to tick until the operator unpauses

1. **Pause marker.** `compileLocal` (`packages/substrate-local/src/emit.ts`, in `compileLocal()` around
   line 224) adds a generated file `.open-autonomy/paused` whose content explains itself, e.g.:

   ```
   This open-autonomy install is PAUSED (fresh installs start paused so a pre-existing
   backlog is never dispatched before you review it).
   Review your board first — on a populated tracker, decide which issues the loop may work
   (see policy.dispatch in .open-autonomy/autonomy.yml and docs/OPERATIONS.md step 5).
   Unpause:  rm .open-autonomy/paused
   ```

2. **Seed-once semantics.** The marker is seeded **only on a fresh install** and never resurrected:
   - `materialize` callers detect a fresh install as "no `.open-autonomy/generated.json` in `destDir`"
     (`readGeneratedManifest`, `packages/core/src/file-manifest.ts:39-46`, already returns `[]` exactly in
     that case). On a re-compile into an existing install, the marker is not (re)written.
   - Add `.open-autonomy/paused` to the seed-once set consulted by the upgrade path
     (`packages/core/src/upgrade.ts:17-37` `INSTALL_OWNED_PATHS`, honored at `upgrade.ts:90-92`), so
     `autonomy-upgrade` never re-pauses a running install, and — critically — exclude it from prune's
     orphan deletion (`upgrade.ts:97-103`) so a prune can never silently *unpause* one either. (State
     files must be neither regenerated nor pruned; the manifest entry for it, if any, must be marked
     state, or it must simply never enter `generated.json`.)

3. **Scheduler gate.** In the `LOOP_DRIVER` template (`packages/substrate-local/src/emit.ts:66-167`), add
   a check before any tick fires, effective in **both** `--once` and continuous mode:

   ```js
   const PAUSED = join(here, '..', '.open-autonomy', 'paused');
   if (existsSync(PAUSED)) {
     console.error('[loop] PAUSED — fresh installs start paused so an existing backlog is never dispatched unreviewed.');
     console.error('[loop] review the board, then unpause:  rm .open-autonomy/paused   (details: ' + PAUSED + ')');
     process.exit(1);   // --once: exit nonzero so a scripted install pipeline notices
   }
   ```

   Continuous mode may equivalently re-check the marker each heartbeat and idle-with-message instead of
   exiting; either satisfies the AC, but the check must be at tick-fire time, not only at startup, so
   `touch .open-autonomy/paused` also works as a live kill-switch (closing the local half of the
   github-only `PUBLIC_AGENT_REPO_PAUSED` gap, `packages/substrate-github/src/emit.ts:80-85`).

4. **Defense in depth at the launch seam.** `launch()` in
   `packages/substrate-local/src/runner-frontend.ts:287` refuses (with the same message) while
   `.open-autonomy/paused` exists — so even a manually invoked PM session, or a tick that raced the
   marker, cannot dispatch a worker. (Exception: the human route `launchHuman`, line 202, may stay
   unpaused — parking an ask for a person spends nothing.)

5. **Surfacing.** `bin/autonomy-compile.ts`'s next-steps print (lines 135-147) gains a final explicit
   step: "This install starts PAUSED. Review your tracker board (especially a pre-existing backlog), then
   unpause: `rm .open-autonomy/paused`". `docs/OPERATIONS.md` step 4 (lines 165-187) documents the paused
   default and the unpause command *before* the `run.mjs` invocations; `docs/INSTALL-AGENT.md`'s verify
   phase treats "loop reports PAUSED" as the expected first-tick outcome and adds the operator-ask before
   unpausing. Applies to **all local profiles uniformly** (`hello` included — one extra printed command;
   see Alternatives).

### Secondary — a backlog allowlist in policy + the PM must read the issue before dispatch

6. **Policy vocabulary.** Add to `profiles/simple-sdlc/ir.yml`'s policy box (after `risk:`, lines 69-77):

   ```yaml
   dispatch:
     # Day-one fence: with mode "allowlist", the PM may only dispatch issues carrying `allow_label`.
     # Existing-backlog opt-in = label the items you want worked (bulk: `ztrack issue edit <id>
     # --add-label oa-approved`) or set mode: open once the board is triaged.
     mode: allowlist
     allow_label: oa-approved
   ```

   This is carried verbatim into `.open-autonomy/autonomy.yml` (`packages/core/src/manifest.ts:72-73`) —
   the exact channel the PM already consults for `policy.risk.*` (`pm/SKILL.md:13-16`). Ships **enabled**
   in `simple-sdlc` (and mirrored in `simple-gh-sdlc`'s preset guidance as a follow-up); an operator on a
   fresh/empty board opts out with one policy edit or simply creates issues with the label (the
   OA-12-fixed docs' `issue create` line includes `--label oa-approved`; `--add-label` on `issue edit` is
   proven CLI surface — `pm/SKILL.md:66` already uses it for `ztrack:reviewing`).

7. **PM doctrine** (`profiles/simple-sdlc/skills/pm/SKILL.md`):
   - Extend the policy-consult paragraph (lines 13-16) to also read `policy.dispatch`: under
     `mode: allowlist`, a `ready` issue **without** `allow_label` is ineligible for develop — note it as
     `fenced (no <allow_label>)` in tick output, never dispatch it.
   - Amend the develop-dispatch rule (lines 69-76): before launching develop on any issue, **view it**
     (`ztrack issue view <id>`) and read the body. An issue whose body carries an explicit
     do-not-dispatch / deferred / blocked-by / on-hold marker (or cites a decision record deferring it) is
     **ineligible regardless of its `ready` state** — treat it exactly like the human-required case in
     lines 13-16: do not dispatch; report it as blocked-for-human in tick output. State says *can* be
     worked; prose can still say *must not* — prose wins.
   - Add the eligibility line to `profiles/simple-sdlc/standards/workflow.md`'s WIP/dispatch section
     (after line 23) so the reviewer-side doctrine agrees: "`ready` means implementable, not necessarily
     *approved for the loop*: dispatch eligibility additionally requires `policy.dispatch` (allowlist
     label) and a body free of explicit deferral/do-not-dispatch markers."

**Why this split:** the pause is the only mechanism that is deterministic (a script boundary, not a model
noticing something) and therefore the only one that can carry the day-one *guarantee* — it also covers
trackers/prose the PM misreads. The allowlist + body-read govern the long tail after unpause: they make
"which of my 52 old issues may the loop touch" an explicit, reviewable operator decision and stop the
one-paid-session-per-bad-pick tax the audit measured (addendum: developer refused TF-603 correctly, but
only after a full dispatched session, with no PM memory preventing the same pick next tick — that
re-dispatch amnesia itself is F-3/F-7-compounding territory, tracked with the zombie-detection work, not
here).

## Alternatives rejected

- **Allowlist-only (no pause).** The PM is a prose skill; enforcement by model attention is exactly what
  failed on TF-603 (the state said one thing, the prose another). A fence whose enforcement point is the
  model is a preference, not a guarantee — CLAUDE.md's own doctrine reserves scripts for precisely this
  kind of boundary. Pause is scripted; allowlist is doctrine; both ship.
- **Pause-only (no allowlist/body-read).** Unpausing would restore today's behavior verbatim: the very
  next tick dispatches the worst old item. The operator's "I reviewed the board" must be expressible
  *per-issue*, not only as a global go signal.
- **Board-timestamp floor instead of a label** (only issues created after install are eligible). Rejected
  as primary policy shape: it needs a reliable created-at filter in the tracker CLI (cross-repo, ztrack),
  is silently wrong on imported/migrated boards (import date ≠ authoring intent), and gives the operator
  no way to opt *in* a specific old item short of recreating it. The label is explicit, visible on the
  board, and uses proven CLI surface (`issue edit --add-label`).
- **Pause flag inside `scheduler/schedule.json`.** That file is regenerated by every compile
  (`emit.ts:265`), so a re-compile/upgrade would re-pause a deliberately-running install — the same
  clobber class as F-9. A separate seed-once state file has the right lifecycle.
- **Pause via environment variable (`AUTONOMY_PAUSED=1`)** — inverts the default: absence of an env var
  must mean *paused* for a fresh install, and env vars don't persist per-repo. The marker file is
  per-install, persistent, and inspectable.
- **Exempt `hello` from the paused default** (protect the "see the loop fire in one command" demo).
  Rejected: a uniform guarantee is simpler to state, test, and trust; the demo cost is one printed `rm`
  command. Conditioning the pause on profile or on detected board state is either a special case to
  document or a TOCTOU hole (a board initialized/imported *after* compile sees no fence).
- **A dry-run tick mode as the fence** (`run.mjs --once --dry-run` printing what the PM *would* do).
  Valuable, but not a fence: nothing forces the operator to run it, and the PM's pick is model-driven so
  a dry run doesn't bind the next real tick. Could ship independently; out of scope here.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Fresh install starts paused (the headline AC).** In a disposable repo with a populated ztrack board
   (≥1 pre-existing `ready` issue): `npx open-autonomy compile simple-sdlc local . && node scheduler/run.mjs --once`
   → exits nonzero, prints the PAUSED message naming the unpause command, and **no** PM/worker session is
   launched (`npx termfleet sessions recent --live` shows none; `bun scripts/runner.ts list develop` → `[]`).
   *Fails today:* the tick fires the PM immediately (`emit.ts:92-101` — unconditional `fireTick`).
2. **Marker file exists and self-describes.** After AC-1's compile, `.open-autonomy/paused` exists and its
   content names both the reason and the exact unpause command. *Fails today:* file not emitted.
3. **Unpause is one command and is durable.** `rm .open-autonomy/paused && node scheduler/run.mjs --once`
   → the tick fires (PM session launches). Then `npx open-autonomy compile simple-sdlc local . --force`
   (re-compile into the same install) followed by `node scheduler/run.mjs --once` → still fires: the
   marker was **not** resurrected (fresh-install detection via `.open-autonomy/generated.json`).
   *Fails today:* n/a (no marker) — the durability half guards the new mechanism against F-9 regression.
4. **Launch seam refuses while paused.** With `.open-autonomy/paused` present,
   `bun scripts/runner.ts launch develop --ref X --branch agent/issue-X` → exits nonzero with the PAUSED
   message; no termfleet session is created. *Fails today:* `launch()` (`runner-frontend.ts:287`) has no
   pause check.
5. **Continuous mode honors a marker created mid-run.** Start `node scheduler/run.mjs` unpaused, then
   `touch .open-autonomy/paused` → no further tick fires (observe over ≥2×`intervalSeconds`); the loop
   logs PAUSED at most once per state change. *Fails today:* no pause concept.
6. **Policy fence lands in the manifest.** `npx open-autonomy compile simple-sdlc local .` →
   `.open-autonomy/autonomy.yml` contains `policy.dispatch.mode: allowlist` and
   `policy.dispatch.allow_label: oa-approved` (assert via `grep -A3 'dispatch:' .open-autonomy/autonomy.yml`).
   Unit: extend `packages/core/src/manifest.test.ts`'s policy-box round-trip. *Fails today:* no such keys
   (`ir.yml:57-77`).
7. **PM doctrine: allowlist enforced.** Live tick test (unpaused, `mode: allowlist`): board has one
   `ready` issue **without** `oa-approved` and one **with** it. One tick → the PM dispatches only the
   labeled issue; tick output names the unlabeled one as fenced. *Fails today:* PM dispatches any `ready`
   issue (`pm/SKILL.md:69-76`).
8. **PM doctrine: body read + deferral respected.** Live tick test: one `ready`, `oa-approved` issue whose
   body contains "Do not dispatch — deferred per decision record X." One tick → no develop launched for
   it; tick output reports it blocked-for-human. Repeat tick → still not dispatched (no per-tick
   re-pick). *Fails today:* reproduced live in the audit (TF-603, §1 item 13) — the PM never viewed the
   body (`pm/SKILL.md:51` field list).
9. **Docs state the paused default.** `docs/OPERATIONS.md` local-runner quickstart step 4 and
   `bin/autonomy-compile.ts`'s next-steps print both name the paused default and the unpause command
   (assert: `grep -n 'paused' docs/OPERATIONS.md bin/autonomy-compile.ts`). *Fails today:* zero
   occurrences in either.

## Dependencies (OA-XX edges + reason)

- **→ OA-10 (F-9, overlay collision/manifest):** the pause marker's lifecycle must be wired through the
  same machinery OA-10 touches — it must be exempt from re-compile regeneration, from upgrade prune
  (`upgrade.ts:97-103`), and from OA-10's deleted-file-resurrection guard (an operator's `rm
  .open-autonomy/paused` is the *intended* interaction, and must never be flagged or undone). Build OA-10's
  manifest/guard semantics first or in the same change set.
- **→ OA-12 (F-11, tracker onboarding docs):** the documented conforming `ztrack issue create` line gains
  `--label oa-approved` and both specs edit `docs/OPERATIONS.md` step 5 / the compile next-steps print —
  coordinate to avoid conflicting edits (soft edge; OA-12 can land first with the label added when OA-07
  lands).
- **Related, not a dependency:** the PM's inability to distinguish a worker dead-at-launch from a finished
  one (re-dispatch-forever, noted inside F-7) is the F-3 zombie-detection work (see OA-02's references),
  not part of this fence.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-7; §1 phase 4 items 13-14; addendum (developer-layer refusal
  of TF-603); §3 item 3; §5 prerequisite (3).
- Source read on branch `adoption-fixes-backlog` (git `2fa5614`):
  `profiles/simple-sdlc/skills/pm/SKILL.md:13-16,51,53,66,69-76`;
  `profiles/simple-sdlc/standards/workflow.md:16-28,30-43`;
  `profiles/simple-sdlc/ir.yml:57-84`;
  `packages/substrate-local/src/emit.ts:66-167,218-265`;
  `packages/substrate-local/src/runner-frontend.ts:104-120,202,287`;
  `packages/core/src/manifest.ts:72-80`;
  `packages/core/src/file-manifest.ts:39-46`;
  `packages/core/src/upgrade.ts:17-37,90-103`;
  `packages/substrate-github/src/emit.ts:80-85`;
  `bin/autonomy-compile.ts:135-147`;
  `docs/OPERATIONS.md:165-187,189-210`.
- Spec authored 2026-07-06 as part of the cold-adopter install-audit fix backlog.
