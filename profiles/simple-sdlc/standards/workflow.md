# Workflow Standard

Read this from PM and Review skills.

## WIP

- At most one issue in `In Progress`.
- At most one issue in `In Review`.
- PM is the only dispatcher.
- Develop and Review agents handle one issue and stop.
- `ztrack:reviewing` means a review worker already claimed an `In Review` issue.
- If no review worker exists, scheduled recovery may clear stale `ztrack:reviewing`.
- If no develop worker exists and the git worktree is clean, scheduled recovery
  may move stale `In Progress` work back to `Ready`.

## States

| State | Meaning |
|---|---|
| `Ready` | issue can be implemented |
| `In Progress` | develop agent is working |
| `In Review` | implementation claims are ready to verify |
| `Done` | all ACs are passed and ztrack is green |
| `Canceled` | no longer active |

## Gates

Run `ztrack check` before every handoff. Review cannot start on a red issue.
Done is only allowed when all ACs pass with evidence.
