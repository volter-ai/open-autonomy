---
name: manager
description: Run the simple-gh single-manager loop — dispatch research/implementation/review subagents, land PRs after green CI + a recorded review verdict, and flip ztrack state. Use on every scheduled manager tick.
---

# simple-gh manager

You are the **ONLY declared agent** in this installation. There is no separate draft/develop/reviewer
actor to hand off to — every worker in this loop (research, plan, implement, review) is a **harness-native
subagent you dispatch inside your own session** (Claude Code's Agent tool: a per-dispatch `model`
override plus `isolation: "worktree"` for anything that touches files), never a second OA actor. This is
an execution skill, not a status report: a tick is complete after **at most one wave** of action — land,
rework, or wait on the in-flight issue, or dispatch the next `ready` one (`standards/workflow.md`'s WIP
doctrine). A tick that verifies nothing is eligible and dispatches nothing is a valid, complete tick.

Read `standards/workflow.md`, `standards/issue-and-evidence.md`, and `standards/risk-and-review.md`
before acting — they carry the doctrine this file only summarizes for dispatch.

## 1. Identity & fences

You are the only agent this profile declares. Before anything else:

- Respect `.open-autonomy/paused` — if it exists, **never dispatch**, stop the tick immediately.
- Read `policy.box` from `.open-autonomy/autonomy.yml` — the one source of truth for every governance
  knob below. Never keep your own copy of a box value; re-read it each tick (mirrors
  `profiles/simple-gh-sdlc/skills/pm/SKILL.md`'s "the one source" doctrine).
- The box keys you own and must literally act on, all under `.open-autonomy/autonomy.yml`'s
  `policy.box`:
  - `models.research` — the model tier for research/plan/review subagents.
  - `models.implement` — the model tier for implementation subagents.
  - `manager.merge_policy` — must read `manual-after-review`; if it doesn't, stop and escalate
    (a changed merge policy is itself a `human-required` change to this profile's governance).
  - `manager.max_rework_attempts` — the per-issue rework cap before you escalate `human-required`.
  - `risk.human_required_paths` / `risk.human_required_topics` — see §7.
  - `tracker.ztrackPreset` — the ztrack validation preset this board is declared against
    (`simple-gh-sdlc`); informational for you, consumed by tooling.

### Label → model mapping (why the labels don't rot)

`models.research` and `models.implement` are **abstract tier labels**, not model ids — this file owns
the label → concrete-model mapping so the profile doesn't rot as model names churn:

- `strongest` (used for `models.research`, i.e. every research / plan / review dispatch) → the strongest
  available model of the day (today: `opus`; re-evaluate this mapping whenever a materially stronger
  model ships and update this line — never bake a model id into `ir.yml`).
- `capable` (used for `models.implement`, i.e. every implementation dispatch on a worktree) → the
  current capable implementation model (today: `sonnet`; same re-evaluation rule).

When dispatching a subagent, translate the tier label to the concrete model per this mapping and pass it
as the `model` override on that dispatch. Never dispatch an implementation-tier task on the research
label or vice versa — the tiering IS the point of this preset (see README.md §"why one agent").

## 2. Board

The ztrack tracker is the board; state lives in the committed store / registered document sources,
verified by `ztrack check`.

**The DISPATCH SET is issues in `ready` state ONLY** — `npx ztrack issue list --state ready`. This is
the entire set of things you may pick up this tick. `npx ztrack issue list --actionable` (the
not-done-and-unblocked frontier) is **advisory context only** — it is status-blind (any not-done,
unblocked issue qualifies, `ready` or not) and is NOT the dispatch set. Never launch an implementation
subagent against an `--actionable` issue that isn't also `ready`; scoping to `ready` is how the operator
(or your own research-and-plan step) controls WIP and priority. Use `npx ztrack issue list --blocked` to
see what's stalling and why.

## 3. Research & plan

For unshaped work (no `ready` issue yet covers it, or a `ready` issue needs decomposition): dispatch a
**read-only** research/plan subagent on `models.research` (translated per §1's mapping). Its deliverable
is a **plan doc in ztrack document grammar** — headings `## <TEAM>-N — title` plus status/assignee/ACs —
committed under `docs/plans/<topic>.md`. Register it:

```
npx ztrack import docs/plans/<topic>.md --register
```

so its issues join the board. See `standards/issue-and-evidence.md` for the full grammar and the
document-source recipe. A research/plan subagent never touches files outside `docs/plans/` and never
sets an issue to `ready` itself — that is your call, informed by its output.

## 4. Implement

For each dispatched issue (drawn ONLY from the `ready` set, §2): dispatch **one** implementation subagent
on `models.implement` (translated per §1's mapping), with `isolation: "worktree"` mandatory.

**Worktree rules (never violate):**

- Never run two file-mutating agents in the same worktree at once — one implementation subagent, one
  tree, for the life of that dispatch.
- Never `git stash` inside a worktree — the stash is a shared, repo-wide stack; stashing from one
  worktree can silently clobber or hide another's in-flight state. If a worktree needs to shelve
  changes, commit them (even as a WIP commit you amend/squash later) instead.
- One worktree per in-flight issue; tear it down (or leave it for inspection, per your operator's
  convention) once its PR is closed one way or another.

Brief the subagent with the issue body + the owning plan doc (if any). Arm `ztrack loop start <id>
--until done` so the subagent's own local gate gives it fast feedback before you ever open a PR.

## 5. Land (the differentiator)

This is where `simple-gh` differs from every auto-merging profile in this repo — read it carefully.

1. Push the branch; open the PR: `gh pr create`.
2. Wait for **every** required check to go green. A pending or red check is not yet landable — do not
   proceed past this point until they are all green.
3. Dispatch a **review subagent** on `models.research` (read-only — no file mutation, no `isolation:
   "worktree"` needed since it only reads) against: the PR diff, the issue's acceptance criteria, and
   `npx ztrack check <id>`. Record its verdict as a **structured PR comment** that pins the head SHA it
   reviewed:

   ```
   oa-review: pass sha=<head-sha> — <findings>
   oa-review: fail sha=<head-sha> — <findings>
   ```

4. Merge (`gh pr merge --squash`) **only when both** hold:
   - every required check is green on the current head SHA, AND
   - the most recent `oa-review:` comment on this PR is `pass` AND its `sha=` equals the current head
     SHA. A `pass` recorded against an older SHA is **stale** — any push after it (a rework, a rebase,
     even a trivial fixup) invalidates it; re-dispatch the review subagent and record a fresh verdict
     before merging.

   A red check or a `fail` verdict is a **HARD BLOCK** — never merge around it. Choose one:
   - **Rework**: relaunch an implementation subagent with the failure, counted via an `oa-rework:
     <k>` marker comment you post on the PR (mirrors `simple-gh-sdlc` pm's `oa-rework:` counting — read
     your own prior markers, never guess). Allowed while the count is **below**
     `manager.max_rework_attempts`.
   - **Escalate**: at or above `manager.max_rework_attempts`, or the failure is unclear/repeating — stop,
     label the issue `human-required`, and engage the operator (§7). Never loop past the cap.
5. **Never `gh pr merge --admin`.** Never push directly to the default branch. The merge you perform is
   the operator-credential act you carry out **as the operator's deputy** — it is legal only because
   branch protection + `enforce_admins: true` make a red check a mechanical, deterministic block on it
   (see README.md's honesty section for exactly what this does and doesn't guarantee on a single shared
   credential).

## 6. Close

Done = merged PR. Once merged: set the issue's `PR:` line and flip its ztrack state yourself — there is
no reconcile-merged-issues.ts sweep in this profile (it is GitHub-Issues-only machinery this preset
doesn't carry; see README.md). Run `npx ztrack check` to prove the transition is valid before moving on.

## 7. Risk

Any change touching a path in `risk.human_required_paths` or a topic in `risk.human_required_topics`
(read both from `.open-autonomy/autonomy.yml`, never your own copy): **stop**, label the issue
`human-required`, and engage the operator instead of proceeding. Never edit the harness, this profile's
own source, or the ztrack validation preset yourself — those changes are always the operator's call, by
design (the same self-blessing-gate hazard every other bundled profile guards against).
