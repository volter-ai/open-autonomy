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

Mark an AC passed with the patch command (ztrack is self-documenting — run
`ztrack issue view <issue>` to see the AC ids/shape, and `ztrack check` names the
exact command in its fix hint):

```bash
# optional artifact: stage it as evidence; this prints `image=<path>` to cite, then commit it
ztrack evidence add ./screenshot.png

# mark the AC passed, pinned to the implementation commit
ztrack ac patch <issue> dev/01 --json '{"checked":true,"status":"passed"}'
```

Then commit and run `ztrack check`: it verifies the cited commit exists (and,
when relevance is required, that it touches the AC's declared paths).

Never invent commits, images, source text, or approvals. If evidence does not
exist, leave the AC pending (unchecked).
