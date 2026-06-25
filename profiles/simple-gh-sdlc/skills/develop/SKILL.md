---
name: develop
description: Implement one ztrack simple-gh-sdlc issue with evidence and push a branch for PR review; use when dispatched a Ready or rework issue by PM.
---

# ztrack simple-gh-sdlc Develop

Read:

- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. View only that assigned issue and implement only its ACs.
   Stop with `OUTCOME: blocked human-required` if the issue requires a
   human-required path or topic from `risk-and-review.md`.
3. Run project tests/checks. If a relevant check exits 0, accept it as passing;
   do not rerun only to get prettier reporter output.
4. Commit the implementation.
5. For each genuinely satisfied AC, mark it passed **with evidence + proof in one
   patch** (the commit SHA is the evidence) — see `standards/issue-and-evidence.md`:
   `ztrack ac patch <issue> <ac> --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","commit":"<sha>","acVersion":1}],"proof":{"explanation":"…","evidenceRefs":["ev1"]}}'`.
   For an artifact, `ztrack evidence add <file>` (prints `image=<path>`), commit it,
   add `"image":"<path>"` to the entry. Use `ztrack issue view <issue>` for the AC
   ids/`acVersion`; `ztrack check` names the exact command in its fix hint. A
   checked/passed AC with no evidence fails `check` — never fabricate one.
6. Leave unsupported ACs unchecked.
7. When `ztrack check` is green, move the issue to `in-review`
   (`ztrack issue edit <issue> --state "in-review"`) and commit your work on the
   branch. The **substrate opens the auto-merging PR** for your branch and the
   independent `reviewer` is triggered on it — you do not open the PR, request
   review, or merge. If another issue is already `in-review` (WIP), leave this one
   `in-progress` and end with `OUTCOME: blocked review-capacity`.

End with `OUTCOME: ready-for-review` (branch pushed; PR will open for review) or
`OUTCOME: blocked <reason>`. Never merge — the merge boundary is `ci` + the
reviewer's `agent-review`, landed by native auto-merge.
