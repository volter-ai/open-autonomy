---
name: review
description: Review one ztrack simple-sdlc issue; use when PM assigns an In Review issue that is green under ztrack check.
---

# ztrack simple-sdlc Review

Read:

- `standards/workflow.md`
- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. Run `ztrack check "$ZTRACK_ISSUE" --json` (scope to the issue you're reviewing — a
   whole-tracker check can be red for an unrelated issue); stop if your issue is red.
3. Inspect the assigned issue's cited commits and evidence for each passed AC.
   If a cited test/check exits 0, accept the command as passing; do not rerun
   only to get prettier reporter output.
4. Apply `risk-and-review.md`. If the change touches a human-required path or
   topic without explicit approval, move the issue back with
   `ztrack issue edit <issue> --remove-label ztrack:reviewing --state "in-progress"`
   and leave `OUTCOME: changes-requested human-required`.
5. If any claim does not hold, move the issue back with `ztrack issue edit <issue> --remove-label ztrack:reviewing --state "in-progress"` and leave requested changes.
6. If all claims hold, approve with `ztrack issue edit <issue> --remove-label ztrack:reviewing --state done`, then run `ztrack check "$ZTRACK_ISSUE"` again.

End with `OUTCOME: merged` or `OUTCOME: changes-requested`.
