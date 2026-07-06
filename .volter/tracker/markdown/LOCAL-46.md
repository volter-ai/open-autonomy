---
identifier: "LOCAL-46"
title: "OA-17: document dep-pin rewrites by the install step; diff package.json before committing"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:49.939Z"
updatedAt: "2026-07-06T12:58:49.939Z"
url: "local://tracker/issue/LOCAL-46"
---
Assignee: tony

Installing the runner deps can rewrite existing dependency ranges in the host's package.json (observed: @termfleet/core ^0.2.0 → ^0.2.1) — tree-shape-dependent npm Arborist behavior OA cannot control (it did NOT reproduce in flat or synthetic-workspace repos, recorded honestly in the spec). Docs promise additivity with no caveat, and INSTALL-AGENT Phase 3 stages package.json blind without diffing after the installs. Docs-only fix: an additivity caveat where the promise is made, and an explicit 'git diff package.json — surface changes to the human before committing' step in INSTALL-AGENT.

Spec: docs/adoption-fixes/OA-17-install-mutates-host-dep-pins.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Coordinate with: OA-06 (coordinate edits to the same INSTALL-AGENT block)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-17 (§2 P2) + narrative §1 step 1.

## Acceptance Criteria
- [ ] dev/01 v1 INSTALL-AGENT Phase 3 contains the diff-and-surface step before the harness commit, and the additivity language carries the caveat (absent today)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
