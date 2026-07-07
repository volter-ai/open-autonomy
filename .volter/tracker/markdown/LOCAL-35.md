---
identifier: "LOCAL-35"
title: "OA-06: preflight must detect NODE_ENV=production/omit=dev devDep no-op installs"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:23.731Z"
updatedAt: "2026-07-07T10:24:59.960Z"
url: "local://tracker/issue/LOCAL-35"
---
Assignee: tony

NODE_ENV=production (npm omit=dev) turns 'npm install -D ztrack' into a silent no-op: exit 0, pin written, nothing installed — the validation preset later fails to resolve and ztrack's own warning prescribes the same no-op command. preflight's charter claims this class of check but its inventory has no env/omit probe; the docs' install lines carry no caveat. Fix: a preflight check that detects NODE_ENV=production/omit=dev and prints the exact override, plus one-line caveats at the documented install steps.

Spec: docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-05 (land after it so the gate stops false-failing), OA-17 (same INSTALL-AGENT block)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-6 (§2 P1) + narrative §1 step 9.

## Acceptance Criteria
- [x] dev/01 v1 preflight on a NODE_ENV=production box emits a warning naming the condition and the exact override command (silent today); docs install lines carry the caveat
  - status: done — caution tier (never false-fails a healthy box) + evidence-gate hard-fail; --include=dev override; docs carry the caveat at all 3 install lines
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — see close-out and /workspace/proofs/oa-06.md

Close-out: merged to adoption-fixes-backlog @ a24f7fd (builder f13e75e + 4e8a491). checkDevDepInstallability() detects effective npm omit=dev via `npm config get omit --no-workspaces` (catches NODE_ENV=production, npm_config_omit, .npmrc, legacy production=true, AND npm-workspace members where a bare probe errors ENOWORKSPACES); caution tier never fails a healthy box, hard-fails only on evidence (a declared devDep unresolvable via node_modules walk-up); override leads with `--include=dev` (the only form working on all 4 trigger paths). Fable correctness panel caught a workspace-member silent-ship blocker + a hoist false-alarm rider + an override-that-reproduces-the-bug; all cured. 5-link proof: /workspace/proofs/oa-06.md.

<!--tracker:comments
[]
-->
