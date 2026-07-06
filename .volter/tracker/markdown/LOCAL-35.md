---
identifier: "LOCAL-35"
title: "OA-06: preflight must detect NODE_ENV=production/omit=dev devDep no-op installs"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:23.731Z"
updatedAt: "2026-07-06T12:58:23.731Z"
url: "local://tracker/issue/LOCAL-35"
---
Assignee: tony

NODE_ENV=production (npm omit=dev) turns 'npm install -D ztrack' into a silent no-op: exit 0, pin written, nothing installed — the validation preset later fails to resolve and ztrack's own warning prescribes the same no-op command. preflight's charter claims this class of check but its inventory has no env/omit probe; the docs' install lines carry no caveat. Fix: a preflight check that detects NODE_ENV=production/omit=dev and prints the exact override, plus one-line caveats at the documented install steps.

Spec: docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-05 (land after it so the gate stops false-failing), OA-17 (same INSTALL-AGENT block)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-6 (§2 P1) + narrative §1 step 9.

## Acceptance Criteria
- [ ] dev/01 v1 preflight on a NODE_ENV=production box emits a warning naming the condition and the exact override command (silent today); docs install lines carry the caveat
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
