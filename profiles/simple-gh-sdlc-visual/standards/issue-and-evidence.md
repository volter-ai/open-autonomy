# Issue And Evidence Standard

Read this from every simple-gh-sdlc skill.

## Issue Shape

- Work ztrack validates has `type:case` or `type:bug`.
- Non-canceled issues have an assignee.
- Bodies include `## Acceptance Criteria`; each checked AC carries its evidence inline (below).

## Acceptance Criteria

ACs must be observable, testable, and small enough to prove with a real commit.
Do not use subjective ACs like "code is clean".

## Evidence Plan

Every `dev/NN` AC declares, at draft time, **how** it will be proven — its evidence plan, a nested
`plan:` sub-bullet authored before any implementation work starts:

```markdown
- [ ] dev/01 v1 API returns 409 for insufficient stock
  - status: pending
  - plan: test:tests/checkout.test.ts
```

`plan` is one of: `visual-bookend` (a human-observable AC, proven by the baseline/dry-run screenshot
pipeline — see `standards/visual-evidence.md`), `test:<name>` (a specific test that must pass),
`api-output` (a real captured API response), `typecheck`, or `build` (a clean tool run). `bk/` ACs need
no explicit `plan:` — they are inherently `visual-bookend`.

`ztrack check`'s `passed_ac_missing_plan` rule requires this line be present on any passed non-`bk/`
AC — the plan can't be skipped or improvised after the fact. The eventual proof must then cite the
concrete falsifier the plan named (the exact test passing, the clean typecheck/build output, the
captured status/body) — not commit + prose alone; see the develop skill's "Non-visual AC evidence
owner" rule, and the reviewer skill's plan-satisfaction check.

## Checked AC Evidence

Evidence is **commit + proof** at its core (an image/artifact is optional). A
checked AC carries its evidence as **inline sub-bullets** pinned to a real git
commit. A checked AC with **no** evidence fails `check` (`checked_ac_no_evidence`).

Current grammar (what `ztrack check` verifies). The issue is a **committed store file**
(`.volter/tracker/markdown/<ISSUE-ID>.md`) — the single source of truth, riding in the PR diff
alongside the implementation commit — so you **never hand-edit the store markdown**. Every field
mutation goes through `ztrack ac patch <issue> <acId> --json '{...}'` (or, for screenshot-backed
ACs, `scripts/evidence-attach.mjs`, which calls `ac patch` for you):

```bash
npx ztrack ac patch COMBO-9 dev/01 --json '{
  "checked": true,
  "status": "passed",
  "evidence": [{"id": "ev1", "commit": "abc1234", "acVersion": 1}],
  "proof": {"explanation": "test covers the insufficient-stock branch", "evidenceRefs": ["ev1"]}
}'
```

Mark an AC passed **with its evidence + proof together, in one patch** — a checked/passed AC with no
evidence fails `check` (`passed_ac_missing_evidence`). Commit the implementation first (the SHA is
the evidence), then patch the AC and commit the store-file change that patch makes:

```bash
git commit -m "…"          # -> <sha>
npx ztrack ac patch COMBO-9 dev/01 --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","commit":"<sha>","acVersion":1}],"proof":{"explanation":"how the commit shows this AC is met","evidenceRefs":["ev1"]}}'
git add .volter/tracker/markdown/COMBO-9.md && git commit -m "chore: COMBO-9 dev/01 evidence"
```

Then run `ztrack check "$ISSUE"` (the store id, e.g. `COMBO-9`): it verifies each cited commit
exists (and, when relevance is required, that it touches the AC's declared `paths:`), and that every
passed AC's proof references real evidence.

Never invent commits, images, source text, or approvals. If evidence does not
exist, leave the AC pending (unchecked).

## Relevance anchors (`paths:`)

A `dev/NN` or `bk/` AC MAY (and, per the draft skill, SHOULD whenever the AC has a concrete
implementation surface) declare a `paths:` sub-bullet — the repo path(s)/glob(s) its work concerns.
Once declared, `ztrack check`'s `evidence_commit_unrelated` rule requires the AC's cited commit to
actually touch one of those paths; without it, a real-but-unrelated commit (with a recycled image)
could otherwise satisfy the AC's evidence requirement despite proving nothing about this AC's claim.
`.volter/tracker-config.json`'s `relevance: "required"` (if set) makes `paths:` mandatory on every
passed AC (`passed_ac_missing_paths`). See `node_modules/ztrack/docs/GUIDE.md`'s "Relevance" section
for the full grammar.
