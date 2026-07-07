---
identifier: "LOCAL-37"
title: "OA-08: launch verification — fail fast on unresolvable skills; PM escalates repeated failed launches"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:28.449Z"
updatedAt: "2026-07-07T10:37:08.255Z"
url: "local://tracker/issue/LOCAL-37"
---
Assignee: tony

Three blind layers let a dead-at-launch worker read as success: launch() never checks the skill exists in the session cwd and the runner CLI exits 0 unconditionally (child status discarded); the backend maps an idle zombie session to status 'done'; and the PM doctrine has no failure branch or cross-tick memory — so the PM re-dispatches the same doomed ref every tick forever, reporting dead runs as 'finished'. Fix (primary, deterministic): pre-launch skill-file existence check in both frontend and backend paths + honest exit codes; secondary: PM escalation via a board-recorded launch-failed marker at N=2.

Spec: docs/adoption-fixes/OA-08-launch-verification-and-dead-worker-escalation.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-02/OA-03 (they remove the common causes; this is the last line of defense — test via a committed skill deletion neither catches)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-7 compounding note (§2 P1) + narrative §1 step 14.

## Acceptance Criteria
- [x] dev/01 v1 launching a worker whose skill file is missing from the worktree fails fast with a named error instead of parking a zombie session (fails today)
  - status: done — launch() skill pre-check + backend.mjs guard refuse before spawn, no session, no effect marker; nonzero exit propagated
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — ACs 1-6,8 proven; AC-7 (live PM 3-tick escalation) doctrine-in-place, live-pending

Close-out: merged to adoption-fixes-backlog @ 5d6a293 (builder 87f8909 + dc8a40d). skillPathFor() pre-check in launch() (frontend) + TermfleetRunner.launch() (backend, covers the scheduler PM) refuses a missing skill with a named/actionable error, no session, no effect marker, honest nonzero exit. PM launch-failed doctrine (record → 1 retry → human-required at N=2). Fable correctness panel caught F1 (a refused --branch launch froze an unrecoverable worktree — the retry re-checked the frozen skill-less copy forever, defeating the spec's retry rationale); cured by tearing down the worktree+branch on refusal iff this launch created them, so a retry rebuilds fresh off the fixed trunk (recovery arc re-verified live). AC-7 live 3-tick bench run tracked as follow-up. 5-link proof: /workspace/proofs/oa-08.md.

<!--tracker:comments
[]
-->
