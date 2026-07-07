---
identifier: "LOCAL-47"
title: "OA-18: open-autonomy doctor — self-verifying local install (7 checks, end-to-end evidence gate)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:52.276Z"
updatedAt: "2026-07-07T07:11:38.084Z"
url: "local://tracker/issue/LOCAL-47"
---
Assignee: tony

A new read-only 'open-autonomy doctor' verb (new bin/doctor.ts; preflight stays pre-compile/mutating) that proves a local-runner install end-to-end before the operator trusts the loop — seven ordered checks matching the audit's exact failure chain: (1) installed-artifact self-check (dry-run compile every bundled profile, verify bundle data files incl. egress-guard.sh); (2) env sanity (NODE_ENV/omit devDeps, probe-load the real pty module, workspace-shadow/self-reference detection); (3) provider identity on the PINNED ports via the real SDK snapshot with foreign-occupant identification; (4) real coding-CLI auth introspection; (5) KEYSTONE: every path in .open-autonomy/generated.json present, committed, and byte-identical inside a worktree created by the install's OWN ensureWorktree probe verb — subsuming F-2/F-3 with zero drift risk; (6) skill resolution inside that worktree; (7) --live spend-gated one-tick launch with terminal capture on death. Each check: probe, pass/fail criterion, actionable failure message, finding it catches (mapped F-1..F-15).

Spec: docs/adoption-fixes/OA-18-doctor-self-verifying-install.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P0-adjacent (umbrella) | Fix target: open-autonomy
Coordinate with: consumes OA-02's ensureWorktree probe export and OA-01's pack-smoke gate; checks 1-4 and 6 buildable in parallel with stubs
Unblocked 2026-07-07: LOCAL-30 (OA-01) + LOCAL-31 (OA-02) both done — pack-smoke gate exists; ensureWorktree/worktreeBase seam landed for check 5 to bind to.
Provenance: OA-INSTALL-AUDIT-FINDINGS.md §5 verdict — the single biggest change.

## Acceptance Criteria
- [ ] dev/01 v1 on a repo in each broken state the audit hit (broken artifact, devDeps omitted, foreign provider on the default port, logged-out CLI, uncommitted/unpushed-origin-based harness, missing skill), 'open-autonomy doctor' exits non-zero naming the specific culprit — per the spec's per-finding ACs
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
