---
identifier: "LOCAL-33"
title: "OA-04: detect npm-workspace/package-name collisions with the runner dep tree; fail loudly"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:18.901Z"
updatedAt: "2026-07-06T12:58:18.901Z"
url: "local://tracker/issue/LOCAL-33"
---
Assignee: tony

The emitted runner (backend.mjs) imports bare 'termfleet'/'@termfleet/core' from the host repo's dependency namespace. npm workspace links and Node self-reference resolution silently rebind those imports to the host's own (possibly unbuilt/incompatible) source when names collide — crashing the loop, or worse, silently running host dev code as the runner SDK. The only existing guard checks existence, not resolution; npm offers no override for workspace shadowing. Fix: detect-and-refuse at preflight/compile (host package name or workspace package names colliding with the runner dep tree) plus a resolution probe in the emitted loop driver; anchored createRequire alone is insufficient (fixes only the self-reference half).

Spec: docs/adoption-fixes/OA-04-workspace-name-collision-detection.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P0 | Fix target: open-autonomy
Coordinate with: OA-05 (same bin/preflight.ts surface — land OA-05 first), OA-06 (check ordering)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-4 (§2 P0) + narrative §1 steps 3, 12.

## Acceptance Criteria
- [ ] dev/01 v1 preflight (and compile) in a repo whose package name or workspace member collides with the runner's dep tree produces a named, actionable error (today: silent shadowing, then a crash deep in the loop)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
