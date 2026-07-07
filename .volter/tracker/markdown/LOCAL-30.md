---
identifier: "LOCAL-30"
title: "OA-01: fix broken npm publish (dist/egress-guard.sh) + packed-tarball release smoke gate"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:11.517Z"
updatedAt: "2026-07-07T07:11:30.603Z"
url: "local://tracker/issue/LOCAL-30"
---
Assignee: tony

open-autonomy@0.4.0/0.4.1 npm publishes are dead on arrival: a module-scope readFileSync of egress-guard.sh in packages/substrate-github/src/emit.ts crashes 4 of 6 CLI verbs (compile/lint/upgrade/conformance) from the packed artifact — including purely local compiles, because the bin verbs eagerly import the github substrate — and scripts/build-cli.ts's hand-maintained data-file copy list never included the file. No gate runs any verb from the packed tarball before publish (prepublishOnly only builds).

Spec: docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P0 | Fix target: open-autonomy
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-1 (§2 P0) + narrative §1 step 7.

## Acceptance Criteria
- [x] dev/01 v1 npm pack + install the tarball into a clean directory: every CLI verb, including 'compile simple-sdlc local .', runs without ENOENT (fails today); a check:pack-smoke gate wired into 'bun run check' and prepublishOnly fails if any verb crashes from the packed artifact
  - status: done — check:pack-smoke (13 steps) in `bun run check` + prepublishOnly; tamper-verified red under mutation (proof: /workspace/proofs/oa-01.md)
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — ACs 1-9 fail-before/pass-after with output evidence; AC-10 (publish 0.4.2 + deprecate 0.4.0/0.4.1) is a post-merge owner action, out of this branch's scope

Close-out: merged to adoption-fixes-backlog @ b3ff4ca (builder commits 50b34ec + 768cc92). 5-link proof incl. 2-panelist tamper probes; known limitation recorded (idiom-locked static scan).

<!--tracker:comments
[]
-->
