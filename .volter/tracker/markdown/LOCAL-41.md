---
identifier: "LOCAL-41"
title: "OA-12: tracker onboarding — conforming issue-create in docs, pinned ztrack, inline .volter caveat"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:38.083Z"
updatedAt: "2026-07-06T12:58:38.083Z"
url: "local://tracker/issue/LOCAL-41"
---
Assignee: tony

Tracker onboarding on a repo with tracker history: OPERATIONS.md step 5 shows an unpinned 'npm install -D ztrack', an init with no .volter-already-exists caveat (that caveat lives only in INSTALL-AGENT's re-run appendix), and a bare issue-create that produces issue_missing_assignee non-conformance the gh flavor already documents how to avoid; the compile hint still prints a bare issue-create fragment and unpinned install; INSTALL-AGENT.md's claim that the hint shows a bare init is itself stale. Fix: conforming issue-create in the quickstart (assignee + AC body), ztrack pin single-sourced against package.json, inline .volter caveat, corrected hint + stale-claim fix; 4 ztrack-side behaviors listed as cross-repo follow-ups.

Spec: docs/adoption-fixes/OA-12-tracker-onboarding-docs-and-compile-hint.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Coordinate with: OA-07 (allowlist label in the same docs), OA-10 (shared OPERATIONS.md hunks); cross-repo: 4 ztrack follow-ups listed in the spec
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-11 (§2 P2) + narrative §1 steps 10-11 — NOTE: the 'bare ztrack init' compile hint was already fixed in source (preset-aware since BL-29); this issue covers the verified residuals + doc corrections.

## Acceptance Criteria
- [ ] dev/01 v1 the OPERATIONS.md local-git quickstart's verbatim issue-create produces a conforming issue (no issue_missing_assignee); the compile hint prints the same conforming form (fails today)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
