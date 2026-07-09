# Issue And Evidence Standard

Read this from the manager skill and by every subagent it dispatches.

## The board is ztrack

Work items live in the committed ztrack store / registered document sources — not GitHub Issues. State
(`ready`, `in progress`, `done`, `human-required`, …) is durable and visible to every stateless tick.
`ztrack check` is the acceptance **gate** on an issue's content (the ACs + evidence), same as every other
ztrack-tracked profile in this repo.

## Plans-as-docs recipe

ztrack natively supports "one document, many issues": a markdown plan whose headings are `## <TEAM>-N —
title` **is** a tracker source once registered. The manager's research/plan subagents use this directly
instead of hand-authoring individual issues one at a time:

1. A read-only research/plan subagent (dispatched on `models.research`) writes `docs/plans/<topic>.md` in
   ztrack **document grammar**:

   ```markdown
   ## SUP-14 — add rate limiting to the ingest endpoint

   Status: draft
   Assignee: manager

   ### Acceptance Criteria

   - [ ] SUP-14/01 requests over the configured limit return 429 with a Retry-After header
   - [ ] SUP-14/02 the limit is configurable per route, defaulting to 100 req/min
   ```

   Each `##` heading is one issue; `Status`/`Assignee` and the `Acceptance Criteria` block follow the same
   grammar every other bundled profile's issues use. ACs must be **observable, testable, and small enough
   to prove with a real commit** — never subjective ("code is clean" is not an AC; "requests over the
   limit return 429" is).

2. The manager registers the doc as a tracker source:

   ```
   npx ztrack import docs/plans/<topic>.md --register
   ```

   This is idempotent — re-running it after editing the doc updates the registered issues rather than
   duplicating them.

3. The doc's issues now appear in `npx ztrack issue list` like any other issue. They join the board at
   whatever `Status:` the doc declared — commonly `draft`, promoted to `ready` by the manager (or a
   human) once it's this wave's priority. **Only `ready`-state issues are ever dispatched for
   implementation** — see the manager SKILL.md §2 and `standards/workflow.md`'s dispatch-only-ready
   doctrine; `--actionable` (any not-done, unblocked issue, `ready` or not) is advisory context, never the
   dispatch set.

## Checked AC evidence

Evidence is **commit + proof** at its core (an image/artifact is optional). A checked AC carries its
evidence as inline sub-bullets pinned to a real git commit. A checked AC with no evidence fails `ztrack
check` (`checked_ac_no_evidence`):

```markdown
- [x] SUP-14/01 requests over the configured limit return 429 with a Retry-After header
  - status: passed
  - evidence ev1: commit=abc1234 acv=1
  - proof: "test covers the 429 + Retry-After branch" -> ev1
```

Commit first (the SHA is the evidence), then patch the AC's sub-bullets: `ztrack ac patch <id> <ac> ...`
for a stored tracker issue (this profile's board IS a stored ztrack store, unlike the GitHub-synced
`simple-gh-sdlc` flow — patch the issue directly, never hand-edit a loose file).

## PR + evidence line discipline

Every PR the manager lands cites the issue it closes and carries the recorded review verdict:

- PR body includes `Closes: <issue id>` (or the tracker's native cross-reference) and a summary of what
  changed.
- The manager's own `oa-review: pass|fail sha=<head-sha> — <findings>` comment (see SKILL.md §5) is the
  durable review record on that PR — never merge unless the latest verdict is `pass` and its `sha=`
  equals the PR's current head SHA (a pass on an older SHA is stale).
- After merge, the issue gets a `PR:` line pointing at the merged PR, and its state flips to `done` — the
  manager does this itself (see SKILL.md §6); there is no reconcile sweep in this profile.

Never invent commits, images, source text, or approvals. If evidence does not exist, leave the AC
unchecked.
