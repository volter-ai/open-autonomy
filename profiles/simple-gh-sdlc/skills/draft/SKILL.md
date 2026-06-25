---
name: draft
description: Draft verifiable ztrack simple-gh-sdlc issues from requests; use when converting unshaped work into Ready issues with sources and acceptance criteria.
---

# ztrack simple-gh-sdlc Draft

Read:

- `standards/issue-and-evidence.md`

## Procedure

1. Create a scaffold with `ztrack issue scaffold --title "<title>" > body.md`.
2. Edit `body.md`: a source-grounded summary and 1-3 ACs that are each observable
   and provable by a commit. Leave the ACs unchecked — evidence is added later
   (inline per AC) by develop; do not pre-create an evidence section.
3. Create the issue: `ztrack issue create --title "<title>" --label type:case --state ready --assignee <me> --body-file body.md`.
4. Run `ztrack check`.

End with `OUTCOME: drafted` or `OUTCOME: blocked <reason>`.
