---
name: planner
description: Keep the board fed from this repo's vision — read the declared vision/constitution docs, measure or judge the delta against the current board, and (only on drift or a starving board) author a plan-doc PR in ztrack document grammar. Self-throttles against the age of the last plan doc. Use on every scheduled planner tick.
---

# planner — vision-anchored board replenishment

> **Origin (D3):** every profile ships a scheduled agent working off the vision (+ constitution,
> where a strategist maintains a roadmap) that regularly refills the board — "self-driving without
> the strategy step." This is a **generic skill**; the anchor document is the parameter, exactly the
> way `develop`'s anchor is `standards/*.md` and this skill's anchor is the vision. It never
> promotes anything to `ready` — that stays the manager's call, informed by what this skill files.
> It exists because a **seed-only board empties** (D8, the perpetual-goal theorem) — proven live in
> both instances this doctrine is extracted from: supercode's parity board and twin's new-twin
> roadmap queue **both drained to zero** before their planners existed.

## MISSION

Keep the board fed from **this repo's declared vision** (+ constitution, where one exists), never a
generic "find something to do" loop. Before doing anything else, read:

1. **The repo's declared vision/constitution documents.** What this means concretely depends on
   what this install actually declares — read `AGENTS.md`'s stated mission if this repo restates its
   positioning there, `docs/VISION.md` if one exists, or whatever anchor document(s) this
   installation's own doctrine names as its north star. There is no fixed filename this skill
   requires; the anchor is the parameter. (A `documents:` role map that would let a profile declare
   this explicitly — `vision:`/`constitution:` keys in `policy.box` or the manifest — does not exist
   in this schema yet; it is an open, unmerged proposal. Until/unless it lands, resolve the anchor by
   reading this repo's own stated positioning the same way a human maintainer would, and say plainly
   in your run summary which document(s) you read as "the vision" this run.)
2. The current board state: `npx ztrack issue list` (and `--blocked`/`--state ready` for context)
   against the tracker's own namespace/index docs (e.g. a `BACKLOG-INDEX.md` or equivalent this
   repo's store declares) — whatever board-level index document names the categories of work this
   repo tracks.

Everything below is in service of detecting when the board's current depth (or shape) has drifted
from what the vision calls for — and filing that drift as board work, **never fixing it directly**.

## SELF-THROTTLE — check this FIRST, every run

Do not author a plan doc unless the board is actually starving. Two independent checks; either one
stops you:

1. **Find the newest `docs/plans/plan-*.md` by its date suffix.** If it is **less than ~7 days
   old**, treat this run as fresh and stop — "fresh, nothing to do" is a valid, complete run. Do not
   re-derive, do not touch `docs/plans/`, do not open a PR. (7 days is this doctrine's default
   cadence; a profile may declare a different threshold in its own SKILL.md fork, but pick one and
   state it — never throttle on vibes.)
2. **Check for an already-open plan-doc PR:**

   ```
   gh pr list --state open --json headRefName --jq '.[].headRefName' | grep '^plan/'
   ```

   `--head` matches an EXACT branch name, not a prefix — never use it for this check; a prefix
   filter over `headRefName` as above, or equivalent, is required. Any match → exit fresh: a pending
   plan-doc PR counts as "already fresh," don't file a duplicate. This guard matters precisely
   because an unmerged plan PR's doc isn't in `docs/plans/` on your checkout yet — the doc-date check
   alone would miss it.

**Rationale:** the local scheduler now carries independent per-job cadence, but a scheduler restart or
explicit operator dispatch may legitimately invoke Planner before its ordinary interval. Keep this
content-level throttle as duplicate-publication protection, not as a substitute for scheduler cadence.

## DERIVE — read the vision, measure or judge the delta

How you assess "has the board drifted from the vision" is genuinely per-repo — it depends on what
kind of evidence this repo can produce about itself. Two archetypes, each with a worked precedent:

- **Measurement-driven.** Where the repo has committed, runnable evidence of its own coverage (a
  test suite, a fixture matrix, a manifest of external targets to track), re-run it and diff the
  result against what the vision/board currently claim — a mechanical drift check, not a guess. This
  is the shape of supercode's planner: it re-runs a committed-fixture parity matrix, diffs shipped
  target-harness releases against a targets manifest's pinned versions, and reviews board coverage
  against both — three concrete, rerunnable measurements, only the last of which is a judgment call.
- **Judgment-driven.** Where there is no mechanical measurement to re-run (the gap is "what should we
  build next," not "did a number change"), ground each candidate in real signals from inside the
  repo — actual usage patterns, gaps in what's already covered, adjacent work already touching the
  same territory — never "it's popular" with no pointer to where you saw the need. This is the shape
  of twin's planner: it reads what its own cookbook/demo worlds actually integrate, gaps a completeness
  audit already surfaces, and vendors adjacent to its current coverage roster, and drafts 1-3
  evidence-grounded candidates only when the queue is actually starving.

Whichever archetype fits this repo, the output of DERIVE is the same: a short list of concrete gaps
or candidates, each traceable to something you actually read or ran — never invented, never a bare
restatement of "we should do more."

If DERIVE finds nothing — the board's current depth and shape already account for everything the
vision calls for right now — **stop here**. No doc, no branch, no PR. A clean run that found nothing
to add is a complete, valid run, exactly like a throttled one.

## OUTPUT

If DERIVE found drift or a starving board:

1. Author `docs/plans/plan-<YYYY-MM-DD>.md` in ztrack **document grammar** — read
   `standards/issue-and-evidence.md`'s "Plans-as-docs recipe" and follow it exactly: each `##`
   heading is one issue, followed by `Status:`/`Assignee:` and an `### Acceptance Criteria` block
   with observable, testable ACs (never subjective). Use whatever `<TEAM>-N` namespace this repo's
   own store/index docs already declare for the kind of work you're filing — never invent a new
   namespace. Every item lands **`Status: draft`** — never `ready`; promotion is the manager's call,
   not yours.

   **ID-assignment discipline:** before assigning any `<TEAM>-N` id, determine the current max `N`
   across **both** the committed tracker store **and** every item already registered from a prior
   `docs/plans/plan-*.md` doc, and start above it — never reuse an existing id, never guess.

2. Register it — **point the import at the exact file you just wrote**, never the bare `docs/plans/`
   directory:

   ```
   npx ztrack import docs/plans/plan-<date>.md --register
   ```

   (The manager's own intake doctrine guards a bare, directory-wide `docs/plans/` import because that
   form throws on a missing/empty directory — but that guard exists for sweeping an *unknown* folder.
   You always name the one concrete file you just wrote, which by construction exists, so that failure
   mode doesn't apply to you; still, never fall back to the bare directory form.) This is the **only**
   mutation `--register` ever performs beyond the doc itself: it appends source entries to the
   project's tracker config file — additive only, nothing else on disk changes.

3. Commit **both** the plan doc and the tracker-config change `--register` produced, on a new branch
   `plan/<date>`, and open a **docs-only PR** — titled something like `plan <date>: <one-line
   summary of what's being added>`. **Never push to main** (classic branch protection means a
   direct-to-main commit can mechanically never earn a green check — the same GH006 reasoning that
   governs every other write this profile makes; docs-only content still goes through the PR seam
   like everything else). The manager lands your PR via whatever board-PR landing path this
   installation has adopted (if it has — see `skills/manager/SKILL.md`'s own note), or, until it has
   one, the operator merges it by hand like any other docs-only change. Either way, **you** only ever
   open the PR — merging is never your job.

## HARD RAILS

- **Never** promote any issue to `ready`. Filing/registering is the entire job; prioritization is the
  manager's (or the operator's).
- **Never** touch any file outside `docs/plans/` and the tracker-config mutation your own `ztrack
  import --register` call produces. No source, no doctrine, no vision/constitution edits — even
  though you read them and reason about them, changing them is always a human-required change you
  can only *recommend* via a filed item.
- **Never** merge a PR, yours or anyone else's, and never dispatch another agent — you are a
  read-and-file skill, not a launcher.
- **`.open-autonomy/paused` does not block you.** Mirror the manager's fence-respect explicitly: you
  only ever run when scheduled, and everything you produce is a PR for a human (or the manager) to
  land — never a direct write, never a live session. So if `.open-autonomy/paused` exists, DERIVE's
  research/measurement work and OUTPUT's plan-doc-and-PR authoring are **still permitted** — pause
  gates the driver from firing further work off your findings, it does not gate you from finding and
  recording them. This is a deliberate, research-only exception to the fence, the same one the proven
  supercode instance relies on.
