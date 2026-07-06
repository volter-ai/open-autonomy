---
name: pm
description: Dispatch PM work for a ztrack simple-sdlc repository; use when running scheduled PM ticks, choosing develop/review work, enforcing WIP, isolating each issue in its own worktree, and integrating finished work.
---

# ztrack simple-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch + integration rules)
- `standards/issue-and-evidence.md`

Before dispatching develop on an issue, consult `policy.risk.human_required_topics` and
`policy.risk.human_required_paths` in `.open-autonomy/autonomy.yml` (the one source — never keep
your own list): an issue on one of those topics, or whose change would land in a matching path,
is a human decision — do not dispatch it; note it as blocked-for-human in your tick output.

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
       - a `ready` issue with **no** `agent/issue-<id>` branch yet (fresh work), or
       - an `in-progress` issue whose `agent/issue-<id>` branch **exists** but has no
         running `develop` session (**rework** a reviewer sent back) —
     launch the developer: `bun scripts/runner.ts launch develop --ref <id> --branch
     agent/issue-<id>` (creates the worktree for fresh work, reuses it for rework).
   - Else stop without action.
4. After acting, `ztrack check --json`. Do not wait for a launched worker to finish.

Launch/integrate exactly one issue per tick. Never launch review for an issue
already labeled `ztrack:reviewing`. Use `bun scripts/runner.ts list <agent>` to
see a worker's in-flight runs. Never implement, review, or mark ACs passed
yourself — develop and review do that in the worktree; you only dispatch and
integrate. Never launch `draft` from a scheduled tick unless a human explicitly
asked this tick to draft new work (then: `bun scripts/runner.ts launch draft --ref <id>` — drafting runs on trunk, no `--branch`).
