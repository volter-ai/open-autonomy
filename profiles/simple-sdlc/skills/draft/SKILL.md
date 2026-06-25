---
name: draft
description: Draft verifiable ztrack simple-sdlc issues from requests; use when converting unshaped work into Ready issues with sources and acceptance criteria.
---

# ztrack simple-sdlc Draft

Read:

- `standards/issue-and-evidence.md`

You shape the EXISTING request issue named in `$ZTRACK_ISSUE` into a verifiable
Ready issue **in place** — same issue id. Never create a new issue and never
delete the original: drafting *transitions* a request to Ready, it does not
replace it (a new id breaks cross-references and the board's history).

## Procedure

1. Read the work item: `echo "$ZTRACK_ISSUE"` — stop if missing/empty. It is an
   issue **id**, not a file.
2. Read the raw request: `ztrack issue view "$ZTRACK_ISSUE"`.
3. Compose `body.md` (start from `ztrack issue scaffold --title "<title>" > body.md`):
   a source-grounded summary and 1-3 ACs that are each observable and provable by
   a commit. Leave the ACs unchecked — evidence is added later (inline per AC) by
   develop; do not pre-create an evidence section.
4. Update the issue **in place** (keep its id), refining the title if needed:
   `ztrack issue edit "$ZTRACK_ISSUE" --body-file body.md --state ready --assignee me`
   (add `--title "<refined>"` if the original title was vague). Do **not** run
   `ztrack issue create`.
5. Run `ztrack check "$ZTRACK_ISSUE"`.

End with `OUTCOME: drafted` or `OUTCOME: blocked <reason>`.
