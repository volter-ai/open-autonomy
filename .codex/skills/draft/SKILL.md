---
name: draft
description: Draft a verifiable ztrack issue from a raw human request; use when the PM launches you on an explicit human ask to shape an untriaged issue. Roadmap-originated issues never need you — the planner already shapes them.
---

# Draft

Read:

- `docs/standards/issue-and-evidence.md`

Converged from simple-gh-sdlc's `draft` (supercode study §II.8.1 row 2: self-driving keeps BOTH intake
paths). A roadmap item arrives at the board **pre-shaped** — the planner writes well-scoped issues with ACs
directly (`tasks:author`), so it never needs you. You exist for the OTHER path: a human files a raw,
unshaped issue, and someone (the PM, on an explicit human request this tick — never a scheduled sweep) needs
it turned into a verifiable Ready item before `develop` can pick it up.

Your work item is a **GitHub issue number** in `$ZTRACK_ISSUE`. You shape that existing issue **in place**
into a verifiable Ready work item: rewrite its body into ztrack form (summary + acceptance criteria) and mark
it ready with the **`ready`** label. Never open a new issue — drafting *transitions* the request, keeping its
number (which is its identity and PR cross-reference).

## Procedure

1. `echo "$ZTRACK_ISSUE"` — stop if missing/empty. It is a GitHub issue **number**.
2. Read the raw request: `gh issue view "$ZTRACK_ISSUE" --json title,body,comments`.
3. Compose the issue body in a **temp file outside the repo** (never write it into the tree):
   `ISSUE_MD="$(mktemp)"; ztrack issue scaffold --title "<title>" > "$ISSUE_MD"` — a source-grounded summary
   and 1-3 ACs that are each observable and provable by a commit. Put an `Assignee: <login>` line at the very
   top (the assignee the GitHub issue will carry — `ztrack check` on a body file reads it from there). Leave
   the ACs **unchecked** — develop adds the evidence later; do not pre-create evidence.
4. Validate the shape: `ztrack check "$ISSUE_MD"` (it must parse + accept the ACs).
5. Update the GitHub issue **in place** and mark it ready:
   - `gh issue edit "$ZTRACK_ISSUE" --body-file "$ISSUE_MD"` (refine the title with `--title "<refined>"` if vague),
   - `gh issue edit "$ZTRACK_ISSUE" --add-label ready` (the PM dispatches develop on `ready` issues),
   - assign it: `gh issue edit "$ZTRACK_ISSUE" --add-assignee @me` (or the requesting maintainer).
6. If the request is too vague to shape into provable ACs, do NOT mark it ready: comment the specific
   questions and add the `needs-info` label instead — the PM's human-seam doctrine (Step 2c) takes it from
   there (engage the requester, escalate on SLA).
7. If the request is out of the org's authority (touches a semantic stop topic in
   `docs/standards/risk-and-review.md`) rather than merely
   vague, do NOT mark it ready either: comment why and label `human-required` instead of `needs-info`.

End with `OUTCOME: drafted` (issue is `ready` + has ACs) or `OUTCOME: blocked <reason>`.
