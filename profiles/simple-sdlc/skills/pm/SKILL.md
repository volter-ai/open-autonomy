---
name: pm
description: Dispatch PM work for a ztrack simple-sdlc repository; use when running scheduled PM ticks, choosing develop/review work, enforcing WIP, isolating each issue in its own worktree, and integrating finished work.
---

# ztrack simple-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch + integration rules)
- `standards/issue-and-evidence.md`

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
inline an agent). The branch's existence IS the WIP claim — a worktree for an
issue means it's in flight, so you never double-dispatch it.

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
     (A merge conflict is a human-required block — stop with `OUTCOME: blocked merge-conflict <id>`.)
   - **Review**: else if an issue is `in-review` and lacks label `ztrack:reviewing`,
     claim it (`ztrack issue edit <id> --add-label "ztrack:reviewing"`) and launch
     the reviewer **into the issue's worktree**:
     `bun scripts/runner.ts launch review --ref <id> --branch agent/issue-<id>`.
   - **Develop**: else if no issue is `in-review`, WIP allows it, and an issue is
     `ready` with **no** `agent/issue-<id>` branch yet, launch the developer (this
     creates the worktree): `bun scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>`.
   - Else stop without action.
4. After acting, `ztrack check --json`. Do not wait for a launched worker to finish.

Launch/integrate exactly one issue per tick. Never launch review for an issue
already labeled `ztrack:reviewing`. Use `bun scripts/runner.ts list <agent>` to
see a worker's in-flight runs. Never implement, review, or mark ACs passed
yourself — develop and review do that in the worktree; you only dispatch and
integrate. Never launch `draft` from a scheduled tick unless a human explicitly
asked this tick to draft new work (then: `bun scripts/runner.ts launch draft --ref <id>` — drafting runs on trunk, no `--branch`).
