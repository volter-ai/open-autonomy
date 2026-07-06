---
identifier: "LOCAL-39"
title: "OA-10: overlay collision detection everywhere, printed manifest receipt, settings.json merge policy"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:33.282Z"
updatedAt: "2026-07-06T12:58:33.282Z"
url: "local://tracker/issue/LOCAL-39"
---
Assignee: tony

materialize() writes unconditionally; the existing BL-14 clobber guard is wired with a false 'only self-driving can trip this' comment and scaffold-worded refusal text (misleading for overlay profiles); the .open-autonomy/generated.json manifest is written but never printed (compile prints only a count); .claude/settings.json — which carries a Stop hook firing in EVERY Claude Code session in the repo, human sessions included — has no merge path and upgrade overwrites it; deletions are silently resurrected on re-compile; docs never mention the hook's blast radius. Fix: profile-agnostic named refusal, resurrection guard keyed on prior generated.json, printed file receipt, structured hooks-merge for settings.json (fresh + upgrade), explicit human-session docs.

Spec: docs/adoption-fixes/OA-10-overlay-collision-detection-manifest-settings-merge.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-07 (exempt its pause marker from the resurrection guard), OA-12 (shared OPERATIONS.md hunks)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-9 (§2 P1) + narrative §1 step 8 — NOTE: partially fixed in source since the audited 0.3.1 artifact; this issue covers the verified residuals.

## Acceptance Criteria
- [ ] dev/01 v1 compiling into a repo with a conflicting scripts/<name> or an existing .claude/settings.json refuses (or merges) with a named diff instead of silently overwriting (fails today for the settings/hook and resurrection cases)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
