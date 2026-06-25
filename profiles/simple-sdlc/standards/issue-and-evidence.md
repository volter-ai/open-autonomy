# Issue And Evidence Standard

Read this from every simple-sdlc skill.

## Issue Shape

- Work ztrack validates has `type:case` or `type:bug`.
- Non-canceled issues have an assignee.
- Bodies include `## Acceptance Criteria`; each checked AC carries its evidence inline (below).

## Acceptance Criteria

ACs must be observable, testable, and small enough to prove with a real commit.
Do not use subjective ACs like "code is clean".

## Checked AC Evidence

Evidence is **commit + proof** at its core (an image/artifact is optional). A
checked AC carries its evidence as **inline sub-bullets** pinned to a real git
commit. A checked AC with **no** evidence fails `check` (`checked_ac_no_evidence`).

Current grammar (what `ztrack check` verifies — let the tooling write it, don't hand-author):

```markdown
- [x] dev/01 v1 API returns 409 for insufficient stock
  - status: passed
  - evidence ev1: commit=abc1234 acv=1
  - proof: "test covers the insufficient-stock branch" -> ev1
```

Mark an AC passed **with its evidence + proof in one patch** — a checked/passed
AC with no evidence fails `check` (`passed_ac_missing_evidence`). ztrack is
self-documenting: run `ztrack issue view <issue>` for the AC ids/`acVersion`, and
`ztrack check` names this exact command (with values filled in) in its fix hint.

```bash
# do the work and COMMIT first — the commit SHA is the evidence
git commit -m "…"                       # -> <sha>

# (optional) stage an artifact; `evidence add` prints image=<path>; commit it and
# add "image":"<path>" to the evidence entry below
ztrack evidence add ./screenshot.png

ztrack ac patch <issue> dev/01 --json '{
  "checked": true,
  "status": "passed",
  "evidence": [{ "id": "ev1", "commit": "<sha>", "acVersion": 1 }],
  "proof": { "explanation": "ev1 shows the AC holds", "evidenceRefs": ["ev1"] }
}'
```

Then run `ztrack check`: it verifies each cited commit exists (and, when relevance
is required, that it touches the AC's declared paths), and that every passed AC's
proof references real evidence.

Never invent commits, images, source text, or approvals. If evidence does not
exist, leave the AC pending (unchecked).
