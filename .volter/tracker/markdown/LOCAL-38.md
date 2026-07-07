---
identifier: "LOCAL-38"
title: "OA-09: coexist with existing termfleet infra — unique ports, durable provider pin, truthful probes"
state: "done"
stateType: "completed"
assignees: ["tony"]
priority: 0
devProgress: ""
createdAt: "2026-07-06T12:58:30.899Z"
updatedAt: "2026-07-07T12:09:43.752Z"
url: "local://tracker/issue/LOCAL-38"
---
Assignee: tony

Coexistence with pre-existing termfleet infrastructure (every fleet box runs one): docs hardcode ports 7373/7402 and INSTALL-AGENT's curl -f probe reads a provider's 404 as 'nothing running'; its re-use-whatever-is-running advice would attach the OA loop to a foreign provider with box-wide launch rights; compile emits schedule.json with an always-empty env so nothing durable carries a pin. (Resolved during study: a PINNED loop does propagate its pin into child launches by design — the leak risk is only for unpinned loops.) Fix: repo-unique port/prefix recipe in the HUMAN quickstart, a truthful /healthz identity probe (distinguishes console/provider/foreign), compile emitting the TERMFLEET_PROVIDER_URL pin into schedule.json env, and a preflight/doctor default-port-occupancy check that names the occupant.

Spec: docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md — authored by Fable 5; build against it (verified file:line root cause, fix spec, alternatives, full numbered ACs).
Priority: P1 | Fix target: open-autonomy
Coordinate with: OA-16 (checklist canonicalizes the recipe), OA-05 (shared preflight surface)
Provenance: OA-INSTALL-AUDIT-FINDINGS.md F-8 (§2 P1) + narrative §1 steps 4, 6.

## Acceptance Criteria
- [x] dev/01 v1 an install on a box with a foreign provider on 7373 gets a warning naming the conflict and produces a pinned schedule.json (today: silent misattachment risk)
  - status: done — see close-out
- [x] dev/02 v1 every numbered criterion in the spec's Acceptance criteria section is demonstrated: each fails before the fix and passes after, with command output as evidence
  - status: done — see close-out

Close-out: merged to adoption-fixes-backlog @ 2b2bc9f (builder a26f02b + 72661e7). Preflight port/provider classification via /healthz body-shape (never curl -fsS /), --provider-url durable pin into scheduler/schedule.json, effective-provider log with source. READ-ONLY (no spend path — both Fable panelists signed off). F-5 crying-wolf cured (unpinned+occupant is a caution, not hard-fail — foreignness is unprovable from a probe); empty-string log-lie cured (env normalized + logged source derived from the real merged env, precedence-of-reality test). AC-7 misattachment live-pending (a live-agent-spend incident during build made a second live launch unwise). 5-link proof: /workspace/proofs/oa-09.md.

<!--tracker:comments
[]
-->
