# Workflow Standard

Read this from PM and Review skills.

## Isolation & integration

- Each issue is worked in its **own git worktree** on branch `agent/issue-<id>`.
  The PM assigns that branch and passes the **same `--branch`** to develop and the
  reviewer (they share the worktree); the Runner creates/reuses it.
- The tracker is a **shared board** (central across all worktrees), so the PM reads
  every issue's live state on trunk without inspecting worktrees.
- **Only the PM touches trunk.** Workers commit on their branch; the PM **integrates**
  a `done` issue by `git merge --no-ff agent/issue-<id>` into trunk, then removes the
  worktree + branch. Review is a verdict only — it never merges.

## WIP

- At most one issue in `in-progress`, at most one in `in-review`.
- WIP is read from the in-flight `agent/issue-<id>` worktrees/branches (`git worktree list`).
- PM is the only dispatcher and the only integrator.
- Develop and Review agents handle one issue and stop.
- `ztrack:reviewing` means a review worker already claimed an `in-review` issue.
- Scheduled recovery may clear a stale `ztrack:reviewing`, or move stale `in-progress`
  work (a clean, abandoned worktree) back to `ready` and drop the worktree.

## States

The lifecycle states are exactly those of the `simple-sdlc` ztrack preset (lowercase):

| State | Meaning |
|---|---|
| `draft` | not yet ready to work |
| `ready` | issue can be implemented |
| `in-progress` | develop agent is working |
| `in-review` | implementation claims are ready to verify |
| `done` | all ACs are passed and ztrack is green |

There is no canceled state in this preset — to drop work, delete the issue
(`ztrack issue delete <id>`).

## Gates

A worker in its worktree runs `ztrack check` (it **auto-scopes** to the issue from
the branch name — no id needed) before every handoff. Review cannot start on a red
issue. Done is only allowed when all of the issue's ACs pass with evidence. (The PM
on trunk may run a whole-tracker `ztrack check` for board awareness.)
