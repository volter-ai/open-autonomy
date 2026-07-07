---
identifier: "LOCAL-42"
title: "OA-13: happy-path noise — Linux iTerm-adapter crash + undocumented -y (cross-repo termfleet + OA docs)"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:40.476Z"
updatedAt: "2026-07-07T12:42:29.973Z"
url: "local://tracker/issue/LOCAL-42"
---
Assignee: tony

Happy-path noise that reads as breakage. termfleet-side (cross-repo, root-caused from dist): default console settings unconditionally include an iTerm adapter with no platform gate, so on Linux the console spawns 'provider serve --kind iterm', which throws spawnSync osascript ENOENT (unhandled-rejection stack trace) and then a 30s supervisor health timeout — two symptoms, one cause; and 'claude new' throws without -y whenever any panel exists. OA-side: four doc snippets present the sanity-check launch without -y. Fix here: the four doc snippets; file the platform gate + -y prompt UX as a termfleet issue (spec §Proposed fix has the dist citations a termfleet builder needs).

Spec: docs/adoption-fixes/OA-13-termfleet-happy-path-noise.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: termfleet (cross-repo) + open-autonomy docs
Coordinate with: OA-16, OA-09 (same doc regions)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-12 (§2 P2) + narrative §1 steps 5-6.

## Acceptance Criteria
- [x] dev/01 v1 OA docs' sanity-check snippets include -y (and a note about the panel-review prompt); a termfleet issue is filed carrying the spec's platform-gate + prompt citations
  - status: done — see close-out
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — see close-out

Close-out: merged @ OA-13 (builder cff9093). OA-owned docs part: every documented `termfleet claude new` sanity-check snippet now carries `-y` (4 sites: OPERATIONS 167/548, INSTALL-AGENT 275/392) with an inline why (the panel-review guard fires once a panel exists). Fable review PASS (4/4, no site missed). Cross-repo AC 1-3 (termfleet Linux iTerm crash) OUT OF SCOPE — owner/termfleet-repo action. 5-link proof: /workspace/proofs/oa-13.md.

<!--tracker:comments
[]
-->
