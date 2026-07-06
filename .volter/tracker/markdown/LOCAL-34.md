---
identifier: "LOCAL-34"
title: "OA-05: fix preflight's false pty failure — probe-load the real module, not a phantom artifact"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:21.258Z"
updatedAt: "2026-07-06T12:58:21.258Z"
url: "local://tracker/issue/LOCAL-34"
---
Assignee: tony

preflight's ptyBuilt() tests for build/Release/pty.node — an artifact a healthy prebuilt install NEVER has (the module loads from prebuilds/ via its prebuild loader) — so on a working environment preflight prints 'rebuilt dependencies successfully' (the rebuild no-ops green) immediately followed by 'node-pty rebuild FAILED — install the build toolchain' (the phantom artifact re-check), and hard-fails a compliant user at the first documented command. Fix: probe-load the module termfleet actually depends on (read its deps at runtime), rebuild only when the probe fails, and make the output consistent.

Spec: docs/adoption-fixes/OA-05-preflight-false-pty-failure.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-5 (§2 P1) + narrative §1 step 2.

## Acceptance Criteria
- [ ] dev/01 v1 preflight passes on an environment where termfleet's pty module require()s cleanly (fails today); it still fails usefully, with consistent output, when the module genuinely cannot load
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
