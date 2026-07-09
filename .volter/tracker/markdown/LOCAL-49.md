---
identifier: "LOCAL-49"
title: "F-E: IR/manifest vocabulary for the landing actor (auto | operator | manager-deputy)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 2
devProgress: ""
createdAt: "2026-07-09T14:00:00.000Z"
updatedAt: "2026-07-09T14:00:00.000Z"
url: "local://tracker/issue/LOCAL-49"
---
Assignee: tony

The IR forbids `code:merge` (`packages/core/src/ir.ts:118-129`) and can only stay SILENT about who lands
a PR — there is no vocabulary for declaring the landing actor. `simple-gh`'s differentiator (the manager
merges as the operator's deputy after green CI + a recorded review, rather than native auto-merge or a
human clicking merge) is therefore invisible to conformance/manifest tooling; nothing machine-readable
distinguishes a `simple-gh`-style manager-deputy merge from any other landing model. A `landing:`
declaration would make this first-class and inspectable.

Provenance: the supercode `simple-gh` install (`docs/adoption-fixes/supercode-install-findings.md`, F-E
section) + the `OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md` study, F-E.

## Acceptance Criteria
- [ ] dev/01 v1 an IR field or manifest annotation declares the landing actor (auto | operator | manager-deputy)
- [ ] dev/02 v1 validateIR/conformance can read the declared landing actor without contradicting the existing code:merge gate-only rule
- [ ] dev/03 v1 simple-gh's ir.yml sets the new field to manager-deputy
