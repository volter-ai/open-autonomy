# Workflow Standard

Read this from the PM and Reviewer skills.

## WIP

- At most one issue in `in-progress`.
- At most one issue in `in-review`.
- PM is the only dispatcher — it launches `develop` (and `draft` on request); it does NOT dispatch review.
- The developer handles one issue and stops; the substrate opens its auto-merging PR.
- **Review is on the PR**: when the PR opens, the substrate triggers the independent `reviewer`, which
  posts the `agent-review` status. `ci` + `agent-review` green → native auto-merge lands it (done = merged PR).
- `ztrack:reviewing` marks an `in-review` issue whose PR the reviewer has claimed.
- If a develop run died and the worktree/branch is clean, scheduled recovery may move stale
  `in-progress` work back to `ready`.

## States

The lifecycle states are exactly those of the `simple-gh-sdlc` ztrack preset (lowercase): an `in-review`
issue must cite its `PR:`, and `done` requires that PR merged.

| State | Meaning |
|---|---|
| `draft` | not yet ready to work |
| `ready` | issue can be implemented |
| `in-progress` | develop agent is working |
| `in-review` | a PR is open and under `agent-review` |
| `done` | the PR merged (all ACs passed with evidence, ztrack green) |

There is no canceled state in this preset — to drop work, delete the issue
(`ztrack issue delete <id>`).

## Gates

Run `ztrack check` before every handoff. Review cannot pass on a red issue or an unmerged-but-claimed PR.
Done is only allowed once the PR is merged with all ACs passed-with-evidence.
