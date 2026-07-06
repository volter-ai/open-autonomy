---
identifier: "LOCAL-44"
title: "OA-15: reconcile the release process — version stamps, one checklist, npm/VERSION/version.json consistency"
state: "draft"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:45.198Z"
updatedAt: "2026-07-06T12:58:45.198Z"
url: "local://tracker/issue/LOCAL-44"
---
Assignee: tony

Version/doc skew is structural: two disjoint release docs (OPERATIONS.md release process is VERSION-file-based and never mentions npm; orphaned RELEASING.md is package.json-based) with no consistency check; 0.4.0/0.4.1 releases deliberately bumped only package.json while VERSION/version.json stay 0.1.0 — meaning .open-autonomy/version.json has stamped 0.1.0 into every install ever produced, defeating its purpose; docs carry no 'written for vX.Y' stamp; the emitted next-steps hardlink blob/main. Fix: one reconciled release process wiring OA-01's pack-smoke gate into the checklist, version stamps in docs, version.json actually tracking releases, registry re-alignment once the fixed version publishes.

Spec: docs/adoption-fixes/OA-15-version-doc-skew-release-process.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Blocked by: LOCAL-30 (OA-01 — checklist references check:pack-smoke; registry re-alignment needs the fixed release)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-14 (§2 P2) + narrative §1 step 7 aftermath.

## Acceptance Criteria
- [ ] dev/01 v1 a release-consistency check fails when package.json, VERSION, and .open-autonomy/version.json disagree (they disagree today); docs carry a version stamp
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
