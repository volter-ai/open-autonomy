---
name: pm
description: Dispatch PM work for a ztrack simple-gh-sdlc repository; use when running scheduled PM ticks, choosing develop work, enforcing WIP, or routing outcomes. Review is automatic on the PR.
---

# ztrack simple-gh-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch rules)
- `standards/issue-and-evidence.md`

## The board is the committed store

Work items are **ztrack store issues** (e.g. `COMBO-9`), identified by their **store id**. State
lives in the committed `.volter/tracker/markdown/` store — durable and visible to every stateless
run — not in GitHub issue metadata:

- **ready to develop** = `npx ztrack issue list --actionable --json identifier,title,state` filtered
  to `state == ready`, MINUS any issue whose `agent/issue-<id>` branch already has a PR (GitHub PRs
  are still the review surface: `gh pr list --head agent/issue-<id> --state all --json number,state`),
  MINUS in-flight develop runs (`bun scripts/runner.ts list develop`).
- **in progress** = the issue's `state` is `in-progress` (develop's first act sets this), or a
  `develop` run is in flight (`runner.ts list develop`).
- **in review** = the issue's `state` is `in-review` and an open PR exists on branch
  `agent/issue-<id>` (the substrate's independent `reviewer` gates it: `ci` + `agent-review` → native
  auto-merge). You do not dispatch review.
- **done** = the PR merged (the issue's `state` becomes `done` once `ztrack check`'s
  `done_requires_merged_pr` sees the merge — reconciled by the substrate, not something you set).
- **`needs-info` / `human-required`** = parked for a human; skip unless a human has since replied.
  An issue touching a topic in `policy.risk.human_required_topics` (read the list from
  `.open-autonomy/autonomy.yml` — the one source; never keep your own) is routed `human-required`
  rather than dispatched.

ztrack is the **acceptance gate on the issue's content**, not merely the board: `develop` and
`reviewer` run `ztrack check` against the issue's ACs + evidence. The PM reads state from the store
directly (`ztrack issue list` / `ztrack issue view`), and cross-references GitHub only for the PR
that carries the review.

## Tick

This is an execution skill, not a status report. A tick is complete only after
exactly one eligible dispatch happened, or after you verified none is eligible.

You LAUNCH a worker through the Runner — the substrate-agnostic seam — passing the
**store id** as the work item, and a **`--branch`** that ISOLATES the work:

```
bun scripts/runner.ts launch develop --ref <store-id> --branch agent/issue-<store-id>
```

`--branch` requests isolation explicitly: a local runner runs develop in that branch's
own worktree; the github runner isolates via its job checkout and ignores it (so the
same launch is substrate-agnostic). Name the branch `agent/issue-<store-id>` — the
same branch the proposal lands on. This dispatches the worker (it fetches issue
`<store-id>` as its subject). Never call `gh workflow run`/`termfleet` directly,
and never inline an agent. You launch develop only; the PR is reviewed and merged
without you.

1. **Gather state.**
   - Actionable store issues: `npx ztrack issue list --actionable --json identifier,title,state,assignee,labels`.
   - Open agent PRs: `gh pr list --state open --json number,headRefName,labels,statusCheckRollup,mergeable,mergeStateStatus`
     (a PR's `agent/issue-<id>` branch ties it to store issue `<id>`).
   - In-flight develop runs: `bun scripts/runner.ts list develop`.
   - **For an issue you might rework** (its PR has a failed check or a conflict), read the PR's
     **comment history**: `gh pr view agent/issue-<id> --json comments` (rework bookkeeping lives on
     the PR now, not a GitHub issue — there is no GitHub issue for a store-native item). Your own prior
     `oa-rework:` marker comments are the ONLY record of how many times this issue has been reworked —
     without them you cannot honor the rework cap below.
2. **Respect WIP** from `workflow.md` (at most one develop in flight).
3. **Take exactly one action**, choosing the first eligible issue:
   - **Issue has an open agent PR** → it's in review. If its `agent-review` check is
     missing/pending and `ci` is not failing, leave it (the substrate triggers the
     reviewer on the PR). If a check **failed** or it has a **merge conflict**
     (`mergeStateStatus: DIRTY`), that's rework — but **ENFORCE THE CAP FIRST so a
     broken issue can't loop forever burning model spend**: read `max_develop_attempts`
     from `.open-autonomy/autonomy.yml` (default **2**) and count this issue's prior
     **rework relaunches** — the comments you (the bot) left on the PR that contain the exact marker
     line `oa-rework: <k>` (from the comments you fetched in step 1; count only your own,
     and only that marker — NOT initial-launch or in-review status comments).
     - **count ≥ the cap**, or the failure is unclear/repeating → do **NOT** relaunch.
       **Stop and escalate**: comment on the PR with the situation and
       `npx ztrack issue edit <id> --add-label human-required` + commit + push the store change to
       main (see step 4's push-fallback note).
     - **below the cap** with a clear, addressable failure → re-launch develop for that
       issue's store id, and in the PR comment include the marker line `oa-rework: <count+1>`
       plus the exact failure to fix (the marker is how the next tick counts attempts).
     Never loop. Do NOT open a second PR for an issue that already has one.
   - **Issue is `ready` (state) and WIP allows** → before launching, confirm `agent/issue-<store-id>`
     has **no PR yet in ANY state**: `gh pr list --head "agent/issue-<store-id>" --state all --json number,state`.
     - A **merged** PR exists → the work is already done; the store's `state` should already reflect
       `done` (or is about to on the next reconcile). Do **NOT** relaunch — leave it. Relaunching here
       opens a **duplicate** PR for work that already merged.
     - An **open** PR exists → it's in review (handled by the open-PR case above), not fresh.
     - **No** PR in any state → it's fresh: launch the developer:
       `bun scripts/runner.ts launch develop --ref <store-id> --branch agent/issue-<store-id>`.
   - **Else** (no `ready` issue without a PR; or WIP full) → stop without dispatch.
4. **Human-required routing.** When an issue must be routed to a human (a `human_required_topics`
   match, or the rework cap above): `npx ztrack issue edit <id> --add-label human-required`, then
   `git add .volter/tracker/markdown/<id>.md && git commit -m "chore: <id> human-required" && git push origin main`
   — a small, deterministic PM push straight to `main` (this is store bookkeeping, not code; it
   carries no implementation and needs no PR). **Verify branch protection actually allows this** before
   relying on it: if `main` requires a PR for every change (no direct-push exception for the PM's own
   commits), this push will be rejected — in that case, fall back to opening a small
   `pm/human-required-<id>` branch + PR for just this one-line label/state change instead of pushing
   directly, and note in your tick's status output which path you had to use. Do not silently swallow
   a rejected push — a `human-required` issue whose label never actually landed looks parked to you but
   still dispatchable to everyone else.
   Rework/status bookkeeping (the `oa-rework:` markers, in-review status notes) goes on **PR comments**
   (`gh pr comment agent/issue-<id>`), never a GitHub issue comment — there is no GitHub issue backing a
   store-native item.

Never implement, review, or mark ACs passed yourself. Never launch `draft` from a scheduled tick
unless a human explicitly asked this tick to draft new work; when they do:
`bun scripts/runner.ts launch draft --ref <intake-issue-number>` (draft's input is still a human GH
intake issue number — it mints the store id, the PM never does).
