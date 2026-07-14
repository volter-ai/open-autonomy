# Enforcement status and backlog

Open Autonomy distinguishes declarations a substrate or owning service can mechanically realize from
agent methodology. Every compile emits `.open-autonomy/enforcement.json`; its statuses are derived by
the compiler and cannot be supplied through `policy.box`.

- `enforced`: the selected target realizes the control mechanically.
- `partial`: part of the declaration is enforced, but a material boundary is missing.
- `unsupported`: the selected target does not realize the declaration.

Opaque policy remains permitted for service configuration and agent inputs, but it is never evidence
that a hard control exists. A new hard-control declaration must land with its consumer, report mapping,
and a denial test.

## Do now

### Partial support to finish

- [x] Emit a target-specific enforcement report for typed runner controls.
- [x] Make local workspace isolation use shared control state, the remote default branch for a GitHub
  code host, durable leases, clean-workspace reclamation, and dirty-workspace quarantine.
- [x] Emit one per-job local schedule contract and accept validated, adopter-owned local target data for
  independent fences/retry timing; deny scheduled launches at the declared local-agent concurrency cap.
- [ ] Move concurrency admission into the shared Runner launch path so manual dispatch and
  agent-initiated launches cannot bypass the scheduled-launch cap; until then the report remains partial.
- [ ] Scope local capabilities with actor credentials/tool/filesystem/network boundaries; until then the
  report must continue to mark them unsupported.
- [ ] Add a real local wall-clock session timeout; launch-startup timeout is not equivalent.
- [ ] Publish/integrate the local operator CLI so managed-provider `up/status/down`, durable cadence, and
  diagnostics are available to compiled installs without a source checkout.
- [ ] Provision and verify GitHub path approval, required checks, current-SHA review, and non-admin merge
  gates, reporting degraded state when repository permissions prevent installation.
- [ ] Move merge policy and state-only paths into typed code-host controls with a verified GitHub
  consumer; prose consumption by a role skill does not make them hard gates.
- [ ] Demonstrate distinct model-tier routing per supported harness or report single-model degradation.

### Potential support to implement

- [ ] Make task-state promotion actor-attributable in the task service. Planner proposals must remain
  non-ready until an authorized human promotes them.
- [ ] Authenticate local human-task completion while preserving the substrate-neutral
  `launch/list/get/update/cancel` interface.
- [ ] Separate scratch, durable evidence, and shared control state with explicit retention ownership.
- [ ] Add denial tests for every newly hardened control; source-string checks alone are insufficient.

## Can wait

### Partial support to broaden

- [ ] Normalize cancellation, timeout, retry, and status semantics across local, GitHub Actions, and
  future ACP-backed runners.
- [ ] Add production human engagement adapters such as issue comments, Slack, email, and paging.
- [ ] Extend code-host gate provisioning beyond GitHub without putting code-host behavior in a runner.

### Potential support for later

- [ ] Add CPU, memory, process-count, storage, and network quotas to local launches.
- [ ] Add distributed leases and crash recovery for multi-machine runners.
- [ ] Add service-issued actor identities usable by task and code-host services.
- [ ] Add transcript/evidence retention, export, and redaction policies.

## Not manifest policy

Role procedure stays in skills and standards: which vision documents an agent chooses to read, audit
methodology, semantic risk classification, rework judgment, report layout, and publication strategy.
Active profiles therefore do not declare `human_required_topics` or rework-attempt limits as if a runner
could enforce them. If one becomes mechanically realizable, first reformulate it as a concrete operation
owned by a runner, task service, or code-host service.
