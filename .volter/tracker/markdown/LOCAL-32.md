---
identifier: "LOCAL-32"
title: "OA-03: quickstart commit-the-harness step + uncommitted-harness guard in the loop driver"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:16.472Z"
updatedAt: "2026-07-07T07:48:46.458Z"
url: "local://tracker/issue/LOCAL-32"
---
Assignee: tony

The OPERATIONS.md local quickstart (steps 1-5) never instructs committing the compiled overlay, and the CLI's compile next-steps print has the same gap — but agents run in git worktrees that only see committed files, so verbatim-docs users get silent zombie workers ('Unknown command: /develop'). The emitted scheduler has no harness-state precondition despite .open-autonomy/generated.json giving an exact checkable file list. Fix: a numbered 'Commit the harness' quickstart step with the exact staging list, the same step in the CLI print, and a tick-time guard in the emitted LOOP_DRIVER that refuses with the uncommitted paths named.

Spec: docs/adoption-fixes/OA-03-quickstart-commit-step-and-uncommitted-harness-guard.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P0 | Fix target: open-autonomy
Coordinate with: OA-08 (complementary last-line-of-defense), OA-16 (checklist canonicalizes the step)
Unblocked 2026-07-07: LOCAL-31 (OA-02) done — committed-locally is sufficient for local-git worktrees.
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-3 (§2 P0) + narrative §1 step 14.

## Acceptance Criteria
- [x] dev/01 v1 running 'node scheduler/run.mjs --once' with an uncommitted harness produces a clear refusal naming the uncommitted paths (today it silently dispatches doomed workers)
  - status: done — see close-out
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — see close-out

Close-out: merged to adoption-fixes-backlog @ 738b8ab (builder commits f1e477d + ccbfacc). Guard drives the emitted scheduler/run.mjs; gitignore-aware (untracked-ignored refuses with -f remediation; tracked-past-ignore clean); per-profile derived staging command (hello has no standards/). Composition with OA-07 pinned @ fbb85bc: paused wins over the harness nag. 5-link proof: /workspace/proofs/oa-03.md.

<!--tracker:comments
[]
-->
