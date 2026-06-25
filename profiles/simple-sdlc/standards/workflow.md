# Workflow Standard

Read this from PM and Review skills.

## WIP

- At most one issue in `in-progress`.
- At most one issue in `in-review`.
- PM is the only dispatcher.
- Develop and Review agents handle one issue and stop.
- `ztrack:reviewing` means a review worker already claimed an `in-review` issue.
- If no review worker exists, scheduled recovery may clear stale `ztrack:reviewing`.
- If no develop worker exists and the git worktree is clean, scheduled recovery
  may move stale `in-progress` work back to `ready`.

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

Run `ztrack check` before every handoff. Review cannot start on a red issue.
Done is only allowed when all ACs pass with evidence.
