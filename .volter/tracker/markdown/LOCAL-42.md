---
identifier: "LOCAL-42"
title: "OA-13: happy-path noise — Linux iTerm-adapter crash + undocumented -y (cross-repo termfleet + OA docs)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:40.476Z"
updatedAt: "2026-07-06T12:58:40.476Z"
url: "local://tracker/issue/LOCAL-42"
---
Assignee: tony

Happy-path noise that reads as breakage. termfleet-side (cross-repo, root-caused from dist): default console settings unconditionally include an iTerm adapter with no platform gate, so on Linux the console spawns 'provider serve --kind iterm', which throws spawnSync osascript ENOENT (unhandled-rejection stack trace) and then a 30s supervisor health timeout — two symptoms, one cause; and 'claude new' throws without -y whenever any panel exists. OA-side: four doc snippets present the sanity-check launch without -y. Fix here: the four doc snippets; file the platform gate + -y prompt UX as a termfleet issue (spec §Proposed fix has the dist citations a termfleet builder needs).

Spec: docs/adoption-fixes/OA-13-termfleet-happy-path-noise.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: termfleet (cross-repo) + open-autonomy docs
Coordinate with: OA-16, OA-09 (same doc regions)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-12 (§2 P2) + narrative §1 steps 5-6.

## Acceptance Criteria
- [ ] dev/01 v1 OA docs' sanity-check snippets include -y (and a note about the panel-review prompt); a termfleet issue is filed carrying the spec's platform-gate + prompt citations
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
