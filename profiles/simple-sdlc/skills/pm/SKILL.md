---
name: pm
description: Dispatch PM work for a ztrack simple-sdlc repository; use when running scheduled PM ticks, choosing develop/review work, enforcing WIP, isolating each issue in its own worktree, and integrating finished work.
---

# ztrack simple-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch + integration rules)
- `standards/issue-and-evidence.md`

Before dispatching develop on an issue, consult the semantic stop topics in
`standards/risk-and-review.md` and `policy.risk.human_required_paths` in
`.open-autonomy/autonomy.yml`: an issue on one of those topics, or whose change would land in a matching path,
is a human decision — do not dispatch it; note it as blocked-for-human in your tick output.

Also consult `policy.dispatch` in `.open-autonomy/autonomy.yml`. Under `mode: allowlist`, a `ready`
issue **without** the label named in `allow_label` (e.g. `oa-approved`) is a day-one fence against a
pre-existing backlog nobody has opted in yet — it is **ineligible for develop regardless of its `ready`
state**: never dispatch it, and report it as `fenced (no <allow_label>)` in your tick output (do not treat
it as blocked-for-human — it's not a decision, it's simply not yet opted in). Under `mode: open` (or no
`policy.dispatch` box at all), every `ready` issue is eligible on this axis.

This is an execution skill, not a status report. Do not stop after summarizing
state. A tick is complete only after exactly one action happened (a dispatch or
an integration), or after you verified none is eligible.

## How work is isolated

Each issue is worked in its **own git worktree** on a branch named for it:
`agent/issue-<id>`. You assign that branch and hand the **same `--branch`** to
both the developer and the reviewer, so they share one isolated worktree — the
Runner creates/reuses it:

```
bun scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>
bun scripts/runner.ts launch review  --ref <id> --branch agent/issue-<id>
```

`launch` is the only way to start a worker (never call `termfleet`/`gh` or
inline an agent). A branch marks an issue as **claimed** (WIP), but a branch does
**not** by itself mean a worker is running right now: when a reviewer requests
changes it sends the issue back to `in-progress` and **ends**, leaving the branch
behind with no live worker. So to decide whether work is actually in flight, read
the running sessions with `bun scripts/runner.ts list develop` / `list review` —
never infer "a developer is in flight" from the branch alone. An `in-progress`
issue whose branch exists but has **no** running `develop` session is **rework**
that a reviewer sent back, and you must re-dispatch develop into that same branch.

The tracker is a **shared board** (one central view across every worktree), so
`ztrack issue list`/`view` here on trunk show each worker's live state even
while their work sits on a branch — you read state centrally and never inspect
worktrees by hand.

## Tick

1. `ztrack check --json` and `ztrack issue list --state open --limit 100 --json identifier,title,state,labels,assignee`.
2. `git worktree list` — the `agent/issue-<id>` worktrees are the in-flight work; enforce WIP from `workflow.md`.
3. Take **exactly one** action, in this priority order. State is a PROPERTY you READ to decide:
   - **Integrate** a finished issue: if an issue is `done` and its branch
     `agent/issue-<id>` still exists, merge it to trunk and tear the worktree
     down — this is how reviewed work lands:
     ```
     git merge --no-ff -m "integrate <id>" agent/issue-<id>
     git worktree remove --force .worktrees/agent-issue-<id> ; git branch -d agent/issue-<id>
     ```
     (If the merge reports a conflict, it is a human-required block: immediately
     `git merge --abort` so trunk stays clean, leave the branch/worktree intact for a
     human to resolve, and stop with `OUTCOME: blocked merge-conflict <id>`. Never
     hand-resolve a conflict or force-land it.)
   - **Review**: else if an issue is `in-review` and lacks label `ztrack:reviewing`,
     claim it (`ztrack issue edit <id> --add-label "ztrack:reviewing"`) and launch
     the reviewer **into the issue's worktree**:
     `bun scripts/runner.ts launch review --ref <id> --branch agent/issue-<id>`.
   - **Develop**: else if no issue is `in-review`, WIP allows it, and (checking
     `bun scripts/runner.ts list develop` — there is no `develop` already running)
     an issue needs a developer — either:
       - a `ready` issue with **no** `agent/issue-<id>` branch yet (fresh work) **and**,
         under `policy.dispatch.mode: allowlist`, carrying `allow_label` — or
       - an `in-progress` issue whose `agent/issue-<id>` branch **exists** but has no
         running `develop` session (**rework** a reviewer sent back; already dispatched
         once, so the allowlist gate doesn't re-apply) —

     **Before launching, `ztrack issue view <id>` and read the body.** State (`ready`) says the
     issue *can* be implemented; it says nothing about whether it *should be* right now. An
     explicit do-not-dispatch / deferred / blocked-by / on-hold marker in the body (or a citation
     of a decision record deferring it) makes the issue **ineligible regardless of its `ready`
     state — prose wins over state**. Treat it exactly like the human-required case above: do not
     dispatch; report it as blocked-for-human in tick output, and move on to the next-eligible
     candidate this same tick (don't just stop). Re-reading the body every tick means a deferred
     issue is refused every tick, not just the first time — there is no separate "already saw
     this" memory to maintain.

     Once a candidate clears both the allowlist gate and the body read, launch the developer:
     `bun scripts/runner.ts launch develop --ref <id> --branch
     agent/issue-<id>` (creates the worktree for fresh work, reuses it for rework). Never pick an issue
     labeled `human-required` as a Develop candidate (see "Failed launches" below for the escalation that
     adds it); an issue labeled `launch-failed` IS still eligible — it gets exactly one retry (see below).
   - Else stop without action.
4. After acting, `ztrack check --json`. Do not wait for a launched worker to finish.

## Failed launches

`bun scripts/runner.ts launch` exits **non-zero** when the launch itself failed — its skill invocation could
not resolve in the session's cwd, or the launch call errored for any other reason. That is a **failed
dispatch, not a claim**: the issue is not `ready`/`in-progress` because of it, and the tick's "exactly one
action" has not happened yet by launching alone — recording the failure on the board is what completes the
tick's action instead.

- **A refused launch leaves the issue `ready` with NO branch or worktree.** The runner tears down any
  worktree/branch it created for a launch it then refused (a frozen worktree could never see the operator's
  fix), so a `launch-failed` issue is back to the clean "`ready`, no `agent/issue-<id>` branch" shape — it
  stays the **retry candidate** by the Develop rule's fresh-work clause on the next tick, and it does **not**
  consume a WIP/in-progress slot (no `agent/issue-*` worktree exists for it in `git worktree list`). So a
  `launch-failed` issue never wedges develop dispatch; it simply gets its one retry when it comes up again.
- **First failure:** when `launch develop --ref <id> --branch agent/issue-<id>` exits non-zero, record it
  before ending the tick (a tick is a fresh session — the board is the **only** memory across ticks):
  `ztrack issue edit <id> --add-label launch-failed`, and `ztrack issue comment <id> "<the runner's error
  line>"`.
- **An issue carrying `launch-failed` gets exactly one more attempt (N=2 total).** On a later tick, when it
  would otherwise be the Develop candidate, dispatch it again the same way. **A successful retry clears the
  label** (`ztrack issue edit <id> --remove-label launch-failed`) — the failure was environmental (e.g. the
  operator committed the missing skill between ticks) and is now gone. If this second attempt **also** exits
  non-zero: **escalate** — `ztrack issue edit <id> --add-label human-required`, comment the runner's error
  line, and end the tick with `OUTCOME: blocked launch-failure <id>`.
- **After escalation, hands off.** Never dispatch a `launch-failed`-labeled issue a third time, and once an
  issue carries `human-required` never remove `launch-failed` **or** `human-required` yourself — a human
  clears both after fixing the cause. (The "successful retry clears `launch-failed`" rule above applies only
  **before** escalation — i.e. while the issue does not yet carry `human-required`.)
- An issue carrying `human-required` (for this reason or any other) is never a Develop candidate — skip it
  exactly like the risk-gated / body-deferred cases above, every tick, until a human clears the label.

Launch/integrate exactly one issue per tick. Never launch review for an issue
already labeled `ztrack:reviewing`. Use `bun scripts/runner.ts list <agent>` to
see a worker's in-flight runs. Never implement, review, or mark ACs passed
yourself — develop and review do that in the worktree; you only dispatch and
integrate. Never launch `draft` from a scheduled tick unless a human explicitly
asked this tick to draft new work (then: `bun scripts/runner.ts launch draft --ref <id>` — drafting runs on trunk, no `--branch`).
