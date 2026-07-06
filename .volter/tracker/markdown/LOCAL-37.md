---
identifier: "LOCAL-37"
title: "OA-08: launch verification — fail fast on unresolvable skills; PM escalates repeated failed launches"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:28.449Z"
updatedAt: "2026-07-06T12:58:28.449Z"
url: "local://tracker/issue/LOCAL-37"
---
Assignee: tony

Three blind layers let a dead-at-launch worker read as success: launch() never checks the skill exists in the session cwd and the runner CLI exits 0 unconditionally (child status discarded); the backend maps an idle zombie session to status 'done'; and the PM doctrine has no failure branch or cross-tick memory — so the PM re-dispatches the same doomed ref every tick forever, reporting dead runs as 'finished'. Fix (primary, deterministic): pre-launch skill-file existence check in both frontend and backend paths + honest exit codes; secondary: PM escalation via a board-recorded launch-failed marker at N=2.

Spec: docs/adoption-fixes/OA-08-launch-verification-and-dead-worker-escalation.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-02/OA-03 (they remove the common causes; this is the last line of defense — test via a committed skill deletion neither catches)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-7 compounding note (§2 P1) + narrative §1 step 14.

## Acceptance Criteria
- [ ] dev/01 v1 launching a worker whose skill file is missing from the worktree fails fast with a named error instead of parking a zombie session (fails today)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
