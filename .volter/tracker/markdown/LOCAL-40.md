---
identifier: "LOCAL-40"
title: "OA-11: fix --help adoption hint (recommends the scaffold for existing repos)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:35.726Z"
updatedAt: "2026-07-07T07:11:33.135Z"
url: "local://tracker/issue/LOCAL-40"
---
Assignee: tony

The hardcoded HELP string pairs 'Adopt into the current repo' with 'compile self-driving gh-actions .' — the whole-repo scaffold the README explicitly warns against for existing repos — and its bundled-profile list is stale (4 of 6). No test pins help content. Fix: corrected hint (existing-repo overlay profiles first, scaffold clearly labeled), full profile list, a test pinning the help text, and a packed-help check hanging off OA-01's smoke gate. Note: on 0.3.1 (today's only working publish) the clobber guard doesn't exist, so the bad hint is live-dangerous until OA-01 ships.

Spec: docs/adoption-fixes/OA-11-help-adoption-hint-wrong-profile.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P2 | Fix target: open-autonomy
Unblocked 2026-07-07: LOCAL-30 (OA-01) done — check:pack-smoke exists for the packed-help check; publish itself remains a post-merge owner action.
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-10 (§2 P2) + narrative §1 phase 1.

## Acceptance Criteria
- [ ] dev/01 v1 'open-autonomy --help' shows overlay profiles as the existing-repo adoption path and labels self-driving as a new/dedicated-repo scaffold; a test pins the help content (fails today)
  - status: pending
- [ ] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: pending

<!--tracker:comments
[]
-->
