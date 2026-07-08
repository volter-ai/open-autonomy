---
identifier: "LOCAL-39"
title: "OA-10: overlay collision detection everywhere, printed manifest receipt, settings.json merge policy"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:33.282Z"
updatedAt: "2026-07-07T11:30:59.652Z"
url: "local://tracker/issue/LOCAL-39"
---
Assignee: tony

materialize() writes unconditionally; the existing BL-14 clobber guard is wired with a false 'only self-driving can trip this' comment and scaffold-worded refusal text (misleading for overlay profiles); the .open-autonomy/generated.json manifest is written but never printed (compile prints only a count); .claude/settings.json — which carries a Stop hook firing in EVERY Claude Code session in the repo, human sessions included — has no merge path and upgrade overwrites it; deletions are silently resurrected on re-compile; docs never mention the hook's blast radius. Fix: profile-agnostic named refusal, resurrection guard keyed on prior generated.json, printed file receipt, structured hooks-merge for settings.json (fresh + upgrade), explicit human-session docs.

Spec: docs/adoption-fixes/OA-10-overlay-collision-detection-manifest-settings-merge.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-07 (exempt its pause marker from the resurrection guard), OA-12 (shared OPERATIONS.md hunks)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-9 (§2 P1) + narrative §1 step 8 — NOTE: partially fixed in source since the audited 0.3.1 artifact; this issue covers the verified residuals.

## Acceptance Criteria
- [x] dev/01 v1 compiling into a repo with a conflicting scripts/<name> or an existing .claude/settings.json refuses (or merges) with a named diff instead of silently overwriting (fails today for the settings/hook and resurrection cases)
  - status: done — profile-agnostic collision refusal; .claude/settings.json structured MERGE (permissions preserved, Stop hook appended, idempotent); findResurrections refuses operator-deleted manifest files
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — ACs 1-8 proven; see close-out (sidecar proof /workspace/proofs/oa-10.md wiped; the committed close-out is the durable proof-of-record)

Close-out: merged to adoption-fixes-backlog @ 3b1ef38 (builder e76c93b + 081b5d3). findResurrections() deletion-resurrection guard (EXEMPTS OA-07's .open-autonomy/paused + all install-owned paths — both panelists signed off at the adversarial shape), .claude/settings.json structured merge (append-if-absent Stop hook, permissions untouched, idempotent) on compile AND upgrade, profile-agnostic collision message + grouped receipt. Fable correctness panel caught a FALSE Stop-hook opt-out doc claim (every documented avenue was silently reverted by the merge/upgrade machinery — the F-9 human-session hazard); cured with a real durable opt-out sentinel (_openAutonomyStopHookOptOut) honored on compile+upgrade, plus truthful docs (resurrection guard is compile-only). 5-link proof: sidecar /workspace/proofs/oa-10.md wiped (box reset); this committed close-out is the durable proof-of-record (code landed + CI-green; no in-repo proof doc was regenerated for this unit).

<!--tracker:comments
[]
-->
