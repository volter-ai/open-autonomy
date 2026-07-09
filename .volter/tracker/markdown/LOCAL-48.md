---
identifier: "LOCAL-48"
title: "F-B: canonicalize the populated-ledger preset-migration story (declared-grammar vs installed-preset split)"
state: "ready"
stateType: "open"
assignees: ["tony"]
priority: 2
devProgress: ""
createdAt: "2026-07-09T14:00:00.000Z"
updatedAt: "2026-07-09T14:00:00.000Z"
url: "local://tracker/issue/LOCAL-48"
---
Assignee: tony

Twin (`twin/profiles/twin-sdlc/ir.yml:10-14`) and now supercode (this install) both declare
`simple-gh-sdlc` grammar while keeping the INSTALLED validation preset at `simple-sdlc` for ledger
compatibility with a large number of pre-existing done items — the PR-coupled rules a real switch would
retro-fail are `ztrack/boilerplates/presets/simple-gh-sdlc.ts:582-594`. There is no documented or
ztrack-assisted path to actually migrate a populated ledger's validation preset from `simple-sdlc` to
`simple-gh-sdlc` grammar, so every real adopter with an existing backlog hand-crafts this split instead
of following a canonical recipe.

Provenance: `docs/adoption-fixes/supercode-install-findings.md` (this install's F-B section) + the
`OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md` study, F-B.

## Acceptance Criteria
- [ ] dev/01 v1 a documented or ztrack-assisted migration path exists for switching a populated ledger's validation preset without retro-failing pre-existing done items
- [ ] dev/02 v1 twin's declared-grammar/installed-preset split is canonicalized as the recommended pattern in OA's docs, OR a migration verb/flag is specced and tracked
