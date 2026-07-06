---
identifier: "LOCAL-43"
title: "OA-14: verify coding-CLI sign-in with a real auth probe, not --version"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:42.861Z"
updatedAt: "2026-07-06T12:58:42.861Z"
url: "local://tracker/issue/LOCAL-43"
---
Assignee: tony

OPERATIONS.md tells users to verify Claude Code sign-in with 'claude --version', which succeeds logged-out (no credential read); INSTALL-AGENT's Phase-0 'tools + auth' snippet checks no coding-CLI auth at all; preflight runs only pty+lockfile checks. The CLI's own 'claude auth status --json' (verified live on 2.1.201, the audit's version) reports loggedIn instantly and offline. Fix: docs use the real auth probe; preflight adopts it (with a graceful fallback for older CLIs and codex).

Spec: docs/adoption-fixes/OA-14-claude-signin-verification.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Coordinate with: OA-16 (checklist), OA-05 (shared preflight surface)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-13 (§2 P2) + narrative §1 phase 2.

## Acceptance Criteria
- [ ] dev/01 v1 the documented sign-in check fails (non-zero / loggedIn:false) on a logged-out box (today's documented check passes); preflight reports auth state
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
