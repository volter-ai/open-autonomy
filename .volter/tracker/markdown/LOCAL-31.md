---
identifier: "LOCAL-31"
title: "OA-02: local-git worktrees must base on local trunk, never fetched origin/<trunk> (fully-local guarantee)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:14.127Z"
updatedAt: "2026-07-06T12:58:14.127Z"
url: "local://tracker/issue/LOCAL-31"
---
Assignee: tony

ensureWorktree() in packages/substrate-local/src/runner-frontend.ts fetches and bases agent worktrees on origin/<trunk> whenever a remote-tracking ref resolves — gating on repo shape instead of the declared code host — so the fully-local 'zero dependency on GitHub' guarantee is violated on any repo with a GitHub remote (the NORMAL case). Even offline, the stale clone-time origin ref still wins. manifestCodeHost() already exists and is already used for the propose-effect gate; the fix is architectural: enter the fetch/origin path iff codeHost === 'github'; local-git (and undeclared) base on local HEAD with zero network. A docs-only 'push first' fix is explicitly rejected by the product owner.

Spec: docs/adoption-fixes/OA-02-local-git-worktrees-must-base-on-local-trunk.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P0 | Fix target: open-autonomy
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-2 (§2 P0, ARCHITECTURE VIOLATION — the product-owner framing in the report is binding) + narrative §1 step 15.

## Acceptance Criteria
- [ ] dev/01 v1 a repo WITH a GitHub remote + a simple-sdlc install whose harness is committed locally but NOT pushed: a launched worker's worktree contains the harness (fails today — the worktree bases on stale origin state)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
