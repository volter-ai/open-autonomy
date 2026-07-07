---
identifier: "LOCAL-45"
title: "OA-16: one canonical Local install checklist — de-strand the load-bearing facts"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:47.593Z"
updatedAt: "2026-07-07T14:11:23.750Z"
url: "local://tracker/issue/LOCAL-45"
---
Assignee: tony

Seven load-bearing install facts each live in exactly one of three overlapping docs (commit-the-overlay only in an Install & operate side-note; ports/prefix advice, teardown, stop-conditions, durability, and verify only in INSTALL-AGENT; README routes to an overview anchor rather than a complete path) — so a reader of any single doc, including the one addressed to them, misses something fatal. Fix: one canonical 'Local install checklist' section in OPERATIONS.md enumerating every load-bearing step in order (deps → preflight → ports/pin → compile → COMMIT → tracker → first issue → first tick → verify), README + INSTALL-AGENT link to it instead of duplicating, teardown mirrored into OPERATIONS. AC is a completeness checklist: every load-bearing fact reachable from the quickstart path a cold reader follows.

Spec: docs/adoption-fixes/OA-16-canonical-local-install-checklist.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Unblocked 2026-07-07: LOCAL-38 (OA-09), LOCAL-42 (OA-13), LOCAL-43 (OA-14) all done — OA-16 canonicalizes their corrected text against the finalized docs.
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-15 (§2 P2) + narrative §1 phase 1.

## Acceptance Criteria
- [x] dev/01 v1 every load-bearing fact in the spec's stranded-facts table is reachable by following OPERATIONS.md's checklist top to bottom (several are unreachable today); README and INSTALL-AGENT link to the canonical section without duplicated steps
  - status: done — see close-out
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — see close-out

Close-out: merged @ OA-16 (builder 05a3691 + panel fix-up 0251e7c). docs/OPERATIONS.md Local-runner quickstart canonicalized into "## Local install checklist" (back-compat <a id=local-runner-quickstart> preserves all code-emitted pointers incl. the F-3 error message); Stop-conditions before step 1 + Stop & teardown after step 8 + Fact-to-step completeness map; README + INSTALL-AGENT link instead of duplicate (single-hit de-dup). Both Fable panelists confirmed NO landed correction reverted; blocked on 3 introduced defects (dangled pointers, README off-by-one, stranded durability) all cured. 5-link proof: /workspace/proofs/oa-16.md.

<!--tracker:comments
[]
-->
