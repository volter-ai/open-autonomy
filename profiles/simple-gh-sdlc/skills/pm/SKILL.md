---
name: pm
description: Dispatch PM work for a ztrack simple-gh-sdlc repository; use when running scheduled PM ticks, choosing develop work, enforcing WIP, or routing outcomes. Review is automatic on the PR.
---

# ztrack simple-gh-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch rules)
- `standards/issue-and-evidence.md`

## The board is GitHub

Work items are **GitHub issues**, identified by their **number**. State lives on
GitHub — durable and visible to every stateless run — NOT in a local ztrack store:

- **ready to develop** = the issue is open, has the **`ready`** label, and has **no
  open agent PR** yet. (The `ready` label is set by `draft` or a maintainer; an
  issue's acceptance criteria live in its body in ztrack form.)
- **in review** = an open PR exists for the issue (branch `agent/issue-<n>`); the
  substrate's independent `reviewer` gates it (`ci` + `agent-review` → native
  auto-merge). You do not dispatch review.
- **done** = the PR merged (the issue auto-closes via `Closes #<n>`).
- **`needs-info` / `human-required`** = parked for a human; skip unless a human has
  since replied.

ztrack is the **acceptance gate on the issue's content**, not the board: `develop`
and `reviewer` run `ztrack check` against the issue's ACs + evidence. The PM reads
state from GitHub.

## Tick

This is an execution skill, not a status report. A tick is complete only after
exactly one eligible dispatch happened, or after you verified none is eligible.

You LAUNCH a worker through the Runner — the substrate-agnostic seam — passing the
**GitHub issue number** as the work item:

```
bun scripts/runner.ts launch develop --ref <issue-number>
```

This dispatches the worker's workflow (it fetches issue `<issue-number>` as its
subject). Never call `gh workflow run`/`termfleet` directly, and never inline an
agent. You launch develop only; the PR is reviewed and merged without you.

1. **Gather GitHub state.**
   - Open issues: `gh issue list --state open --json number,title,labels,assignees`.
   - Open agent PRs: `gh pr list --state open --json number,headRefName,labels,statusCheckRollup,mergeable,mergeStateStatus`
     (a PR's `agent/issue-<n>` branch ties it to issue `<n>`).
   - In-flight develop runs: `bun scripts/runner.ts list develop`.
2. **Respect WIP** from `workflow.md` (at most one develop in flight).
3. **Take exactly one action**, choosing the first eligible issue:
   - **Issue has an open agent PR** → it's in review. If its `agent-review` check is
     missing/pending and `ci` is not failing, leave it (the substrate triggers the
     reviewer on the PR). If a check **failed** or it has a **merge conflict**
     (`mergeStateStatus: DIRTY`), that's rework — re-launch develop for that issue's
     number with a comment naming the failure, respecting `max_develop_attempts`
     (`.open-autonomy/autonomy.yml`); never loop. Do NOT open a second PR for an issue
     that already has one.
   - **Issue is `ready` (label), open, no agent PR, and WIP allows** → launch the
     developer: `bun scripts/runner.ts launch develop --ref <number>`.
   - **Else** (no `ready` issue without a PR; or WIP full) → stop without dispatch.
4. Leave a short status comment on the issue you acted on (`gh issue comment <n>`),
   saying what you decided and why. Do not wait for the launched agent to finish.

Never implement, review, or mark ACs passed yourself — develop and reviewer do that.
Never launch `draft` from a scheduled tick unless a human explicitly asked this tick
to draft new work; when they do: `bun scripts/runner.ts launch draft --ref <number>`.
