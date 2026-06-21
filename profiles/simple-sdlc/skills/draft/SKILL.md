---
name: ztrack-simple-sdlc-draft
description: Draft verifiable ztrack simple-sdlc issues from requests; use when converting unshaped work into Ready issues with sources and acceptance criteria.
---

# ztrack simple-sdlc Draft

Read:

- `standards/issue-and-evidence.md`

## Procedure

1. Create a scaffold with `ztrack issue scaffold --title "<title>" > body.md`.
2. Edit `body.md` with source-grounded summary, 1-3 ACs, `## Sources`, and empty `## Evidence`.
3. Create the issue with `type:case`, state `Ready`, and an assignee.
4. Run `ztrack check`.

End with `OUTCOME: drafted` or `OUTCOME: blocked <reason>`.
