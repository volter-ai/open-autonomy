---
identifier: "LOCAL-36"
title: "OA-07: day-one backlog fence — install lands paused; PM must read an issue before dispatch"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:26.121Z"
updatedAt: "2026-07-06T12:58:26.121Z"
url: "local://tracker/issue/LOCAL-36"
---
Assignee: tony

No day-one fence: the emitted local scheduler fires ticks unconditionally (the github substrate has a deterministic kill-switch; local has none), and the PM doctrine selects any 'ready' issue from list metadata without ever reading the body — so a fresh install onto a populated board starts spending on parked backlog at tick 1 (the audit watched it dispatch a size-L issue whose body said 'do not dispatch'). Fix (primary, deterministic): fresh installs seed .open-autonomy/paused, honored by both the loop driver and launch(), until the operator removes it — this also gives local its missing kill-switch. Secondary: a policy dispatch allowlist (oa-approved label) and PM doctrine requiring 'ztrack issue view' before dispatch with deferred/do-not-dispatch prose treated as ineligible.

Spec: docs/adoption-fixes/OA-07-day-one-backlog-fence-install-paused.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-10 (pause marker must be exempt from the resurrection guard/prune), OA-12 (docs issue-create gains the allowlist label)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-7 (§2 P1) + narrative §1 step 13.

## Acceptance Criteria
- [ ] dev/01 v1 a fresh install into a repo with a populated ztrack board, first tick: NO worker is dispatched until the operator explicitly removes the pause marker / allowlists work (fails today)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
