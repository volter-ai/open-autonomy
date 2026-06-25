---
name: develop
description: Implement one ztrack simple-sdlc issue and produce real evidence; use when assigned a Ready or rework issue by PM.
---

# ztrack simple-sdlc Develop

Read:

- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

You run in **this issue's own git worktree** (branch `agent/issue-$ZTRACK_ISSUE`),
isolated from other workers. Everything you commit stays on that branch until the
PM integrates it after review — so **commit both your code and the issue's tracker
changes** (`git add -A` catches the `.volter` updates), or they won't merge.
`ztrack check`/`ac patch`/`issue edit` auto-scope to your issue from the branch — no
need to pass the id to `check`.

You **drive your issue to green under `ztrack loop`** (the idiomatic ztrack flow): you
arm it once and a Stop hook holds your turn, re-running `ztrack check` every time you
try to stop — so **you cannot end on a fabricated "done."** Keep working until the
issue is genuinely green, or take an honest escape (which disarms the loop first).

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. View only that assigned issue and implement only its ACs.
   Stop with `OUTCOME: blocked human-required` if the issue requires a
   human-required path or topic from `risk-and-review.md`.
3. **Arm the drive-to-green loop:** `ztrack loop start "$ZTRACK_ISSUE"`. From here, the
   Stop hook won't let your turn end while `ztrack check` is red — keep iterating until
   it's green. It auto-disarms once the issue passes (and is capped, so it can't grind
   forever).
4. Run project tests/checks. If a relevant check exits 0, accept it as passing;
   do not rerun only to get prettier reporter output.
5. Commit the implementation (`git add -A && git commit`).
6. For each genuinely satisfied AC, mark it passed **with evidence + proof in one
   patch** (the commit SHA is the evidence) — see `standards/issue-and-evidence.md`:
   `ztrack ac patch <issue> <ac> --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","commit":"<sha>","acVersion":1}],"proof":{"explanation":"…","evidenceRefs":["ev1"]}}'`.
   For an artifact, `ztrack evidence add <file>` (prints `image=<path>`), commit it,
   add `"image":"<path>"` to the entry. Use `ztrack issue view <issue>` for the AC
   ids/`acVersion`; `ztrack check "$ZTRACK_ISSUE"` names the exact command in its fix
   hint. A checked/passed AC with no evidence fails `check` — never fabricate one.
7. Leave unsupported ACs unchecked. If a claim genuinely can't be satisfied, take an
   **honest escape** — never fake green to finish. Because the loop is armed, first
   disarm it (`ztrack loop stop`), then either: leave the AC pending and end
   `OUTCOME: blocked <reason>` (the PM re-dispatches); descope the AC; or, for a
   finding an authority knowingly accepts, `ztrack waiver sign "$ZTRACK_ISSUE" --code
   <code> [--ac <acId>] --reason "…"`.
8. Move the issue to `in-review` only when **`ztrack check`** (auto-scoped to your
   issue) is green and no other issue is already `in-review`:
   `ztrack issue edit <issue> --state "in-review"`. If another issue is in review,
   leave this issue `in-progress` and end with `OUTCOME: blocked review-capacity`.
9. **Commit the tracker change too** so it integrates with the code:
   `git add -A && git commit -m "evidence + in-review: $ZTRACK_ISSUE"`. Do **not**
   merge to trunk — the PM integrates your branch after review approves.

End with `OUTCOME: ready-for-review` or `OUTCOME: blocked <reason>`.
