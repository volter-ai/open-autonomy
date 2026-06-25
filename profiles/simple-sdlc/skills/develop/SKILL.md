---
name: develop
description: Implement one ztrack simple-sdlc issue and produce real evidence; use when assigned a Ready or rework issue by PM.
---

# ztrack simple-sdlc Develop

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
7. Move the issue to `In Review` only when `ztrack check` is green and no
   other issue is already `In Review`: `ztrack issue edit <issue> --state "In Review"`.
   If another issue is in review, leave this issue `In Progress` and end with
   `OUTCOME: blocked review-capacity`.

End with `OUTCOME: ready-for-review` or `OUTCOME: blocked <reason>`.
