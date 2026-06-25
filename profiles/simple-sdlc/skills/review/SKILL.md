---
name: review
description: Review one ztrack simple-sdlc issue; use when PM assigns an In Review issue that is green under ztrack check.
---

# ztrack simple-sdlc Review

Read:

- `standards/workflow.md`
- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

You run in the **issue's own worktree** (the developer's branch `agent/issue-$ZTRACK_ISSUE`),
so you see the real code and commits. `ztrack check`/`issue edit` auto-scope to your
issue from the branch. You are a **verdict** only — you mark the issue `done` or send
it back; you **never merge** (the PM integrates the branch after you approve). Commit
your verdict so it travels with the branch.

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. Run `ztrack check --json` (auto-scoped to your issue); stop if it's red.
3. Inspect the assigned issue's cited commits and evidence for each passed AC.
   If a cited test/check exits 0, accept the command as passing; do not rerun
   only to get prettier reporter output.
4. Apply `risk-and-review.md`. If the change touches a human-required path or
   topic without explicit approval, send it back:
   `ztrack issue edit <issue> --remove-label ztrack:reviewing --state "in-progress"`,
   then `git add -A && git commit -m "review: changes-requested"`, and leave
   `OUTCOME: changes-requested human-required`.
5. If any claim does not hold, send it back the same way (`--remove-label ztrack:reviewing
   --state "in-progress"` + commit) and leave requested changes.
6. If all claims hold, approve: `ztrack issue edit <issue> --remove-label ztrack:reviewing --state done`,
   re-run `ztrack check`, then **commit the verdict** so it integrates:
   `git add -A && git commit -m "review: done $ZTRACK_ISSUE"`. The PM merges your branch next tick.

End with `OUTCOME: merged` or `OUTCOME: changes-requested`.
