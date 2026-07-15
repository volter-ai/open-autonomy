# Autonomous Organization Runtime implementation acceptance and proof specification

Status: normative planning specification for the phase after Organization IR B0–P13. No R0–R24 checkpoint is
implemented or complete merely because it is specified here.

The stable formal obligations for every checkpoint are instantiated in
[`ORGANIZATION-RUNTIME-LENS-AUDIT.md`](./ORGANIZATION-RUNTIME-LENS-AUDIT.md). Checkpoint prose cannot substitute for
matching those rows to implementation-ledger evidence.

This document is not a second roadmap. [`ROADMAP.md`](./ROADMAP.md) remains the only canonical product roadmap. This
document defines the dependency-ordered implementation punch list, acceptance criteria, proof obligations, evidence
requirements, and falsifiers for turning the completed Organization IR into a public standard, compiler platform,
multi-substrate runtime, measurable autonomous organization, and bounded organizational optimizer.

Requirements written here begin with assurance status `unknown`. Prose is not evidence. Every checkpoint must update
the machine obligation and semantic-coverage ledgers and land as an independently reviewable commit.

## Mission and completion claim

The phase is complete only when an unchanged, content-addressed organization can be compiled and operated on two
genuinely independent live control/work substrates; communicated with through typed human seams; reconstructed from
portable observations; measured for cost, flow, quality, and human labor; analyzed by a calibrated organizational
twin; and safely changed through a proposal, approval, rollout, and rollback loop.

```text
authored organization + behavior packages + policies
  -> published language/specification + verified compiler
  -> solved deployment + substrate SDK + native adapters
  -> desired deployment state + reconciled live fleet
  -> portable event/state store + interaction control plane
  -> conformance + benchmark observations
  -> metrics + organizational twin + candidate changes
  -> independent evaluation + human-ratified rollout/rollback
```

The system must preserve these separations:

- desired organization versus observed fleet state;
- organizational actor versus runtime worker, model, session, account, or endpoint;
- work/control substrate versus interaction, execution, storage, policy, and observation components;
- compiler compatibility versus provider conformance versus live run evidence;
- native wire interoperability versus schema, behavioral, and semantic compatibility;
- optimization proposal versus evaluation, authorization, deployment, and measurement;
- benchmark criterion owner versus system being optimized.

## Global closure rules

Every item R0–R24 must include the review card from [`ORGANIZATION-IR-AC.md`](./ORGANIZATION-IR-AC.md), plus:

```text
Live-system claim:
Desired/observed boundary:
Upgrade and rollback boundary:
Tenant and credential boundary:
Telemetry and privacy boundary:
Economic attribution rule:
Human authority retained:
Benchmark leakage controls:
Operational SLO and error budget:
```

Every checkpoint must:

- preserve the B0–P13 obligation ledger and zero-residual invariant;
- state its semantic domain, equivalence relation, assumptions, and decidability boundary;
- provide positive, negative, minimal-counterexample, resource-bound, and version-skew tests;
- use fault injection for claims about recovery, idempotency, concurrency, failover, or rollback;
- return `unknown`, `unsupported`, or a typed loss instead of inferring success from absent evidence;
- retain source, compiler, component, adapter, deployment, event, and benchmark provenance;
- separate asserted, conformance-tested, live-observed, and independently verified claims;
- introduce no provider product vocabulary into Organization IR;
- pass the complete repository gate, TypeScript, deterministic replay, and `git diff --check`;
- record a proof ledger entry whose evidence can be re-run or whose external identity can be resolved.

## Dependency spine

```text
R0
 ├─ R1 ─ R2 ─ R3 ─ R4
 ├─ R5 ─ R6 ─ R7 ─ R8 ─┬─ R9 ─ R10 ─ R11
 │                       └─ R12 ─ R13
 ├─ R14 ─ R15 ─ R16 ─ R17
 └─ R18 ─ R19 ─ R20 ─ R21 ─ R22 ─ R23 ─ R24

Cross-gates: R4 + R8 + R11 + R13 + R17 feed R18; R18–R20 feed R21; R21–R23 feed R24.
```

Parallel work is permitted only where the dependency relation allows it. A downstream checkpoint cannot use a mock
of an unfinished upstream guarantee as completion evidence.

## Required formal-lens coverage

| Item | Minimum lenses |
|---|---|
| R0 baseline | Semantic, refinement, security, distributed, operational, adversarial |
| R1–R4 public standard | Semantic, type, algebraic, compiler, evolution, interoperability, formal verification |
| R5–R8 SDK/compiler | Compiler, refinement, constraint solving, provenance, security, operational, adversarial |
| R9–R13 native substrates | Distributed, temporal, refinement, interoperability, operational, security, economic |
| R14–R17 control plane | Database, distributed, epistemic, HCI, organizational, security, operational |
| R18–R20 bench/measurement | Measurement theory, statistics, information flow, economic, queueing, adversarial |
| R21–R24 twin/optimization | Control, queueing, causal inference, decision theory, formal verification, HCI, security |

“Measurement theory,” “statistics,” “causal inference,” and “decision theory” are required only where quantitative
claims are made. Each such claim must define its variables, estimand, population, uncertainty, and invalidating
conditions. Information-theoretic language is allowed only with defined random variables and quantities.

---

## R0. Phase baseline and threat-model refresh

**Depends on:** Organization IR B0–P13 closure.

**Engineering ACs.** Re-run the full closure gate on a clean checkout; freeze public semantic digests and fixture
corpus; inventory all experimental APIs, trust boundaries, credentials, tenants, external effects, personal data,
and live-provider assumptions; produce STRIDE-style threats plus distributed failure and economic-abuse models;
assign every finding to R1–R24 or explicitly reject it with rationale; prohibit unowned residuals.

**Evidence.** Reproducible baseline manifest, API/fixture hashes, threat model, residual-owner ledger, two independent
skeptical reviews.

**Falsifier.** A later item relies on an unrecorded credential, authority, daemon, data store, or human operation.

## R1. Normative Organization IR v2 specification

**Depends on:** R0.

**Engineering ACs.** Extract normative syntax, denotations, defaults, identity, equivalence, composition, extension,
version, migration, event, state, lowering, and assurance rules from the implementation; label normative versus
informative text; define RFC-style key words; generate a field-level semantic coverage appendix; include executable
positive and negative examples and unsupported-domain boundaries.

**Evidence.** Published versioned specification, schema cross-links, implementation/spec bidirectional drift test,
external implementer review.

**Falsifier.** Two conforming readers can assign different portable meanings without the specification identifying
the choice as implementation-defined.

## R2. Canonical schemas, packages, and registry protocol

**Depends on:** R1.

**Engineering ACs.** Publish JSON Schema and YAML profiles for every authored/exchanged artifact; define module package
layout, content addressing, signatures, namespaces, dependency locks, registries, mirrors, offline resolution,
yanking, provenance, size/depth limits, and dependency-confusion protection; make builds hermetic under a lockfile.

**Evidence.** Schema corpus, malicious-package fixtures, reproducible offline build, registry/mirror substitution and
revocation tests, deterministic package digest across implementations.

**Falsifier.** Identical lockfiles can resolve to semantically different module graphs without detection.

## R3. Conformance specification and technology compatibility kit

**Depends on:** R1–R2.

**Engineering ACs.** Define language, compiler, component, adapter, substrate, event-lifting, replay, and live-runtime
conformance levels; publish machine-readable test manifests and expected evidence; distinguish mandatory, optional,
conditional, unsupported, and unobserved; support black-box providers; version tests independently from the language;
prevent self-attested results from appearing independently certified.

**Evidence.** Reference runner, intentionally defective runners for every rule, mutation score, implementation matrix,
signed result bundle format.

**Falsifier.** A provider passes by omitting an advertised operation, swallowing a test, or fabricating its own oracle.

## R4. Independent implementation and specification compatibility

**Depends on:** R1–R3.

**Engineering ACs.** Build or commission a minimal independent parser/normalizer/checker in a second language or
codebase; exchange locked corpora; compare canonical bytes, diagnostics classes, semantic hashes, and migration
results; classify every difference; establish compatibility and deprecation windows.

**Evidence.** Differential corpus run by separate toolchains, residual report at zero untriaged differences, external
author feedback.

**Falsifier.** The specification is only implementable by reading private behavior of the TypeScript compiler.

## R5. Stable compiler API and artifact protocol

**Depends on:** R1–R2.

**Engineering ACs.** Stabilize parse/link/normalize/analyze/solve/lower/emit/lift/replay interfaces; define immutable
artifact envelopes, pass capabilities, cancellation, resource budgets, diagnostic streaming, cache keys, incremental
rebuilds, deterministic parallelism, and plugin isolation; offer CLI and library surfaces with semver policy.

**Evidence.** API compatibility tests, deterministic clean/incremental equivalence, hostile plugin sandbox tests,
memory/time cancellation fixtures, golden artifact protocol.

**Falsifier.** A plugin can mutate prior artifacts, read undeclared inputs, or make cache hits alter semantics.

## R6. Substrate SDK and adapter development kit

**Depends on:** R3, R5.

**Engineering ACs.** Ship typed builders and validators for component manifests, adapters, lowering passes, event
lifters, health checks, migrations, and conformance hooks; include a skeleton provider, test doubles, fault scheduler,
trace recorder, credential broker interface, examples, and compatibility generator; core must not import SDK clients.

**Evidence.** A third party implements a toy but nontrivial substrate from documentation alone; generated provider
passes the appropriate TCK levels; forbidden dependency-direction test.

**Falsifier.** Implementing a provider requires editing a core product switch or importing internal compiler files.

## R7. Deployment solver v2 and explainable planning

**Depends on:** R5–R6.

**Engineering ACs.** Add version/region/tenant/topology/cardinality/capacity/SLO/data-residency/credential/upgrade and
cost constraints; support Pareto frontiers rather than one scalar score; return minimal or classified unsatisfied
cores; distinguish exhaustive incompatibility from bounded exhaustion; plan adapters and migrations constructively;
bind every selection to evidence freshness and accepted assumptions.

**Evidence.** Generated finite-domain solver comparisons, independently revalidated plans, adversarial near-miss
cores, stable Pareto ordering, stale-evidence rejection.

**Falsifier.** An economically preferred but semantically or operationally invalid candidate can outrank feasibility.

## R8. Reproducible deployment bundles and supply-chain security

**Depends on:** R5–R7.

**Engineering ACs.** Emit content-addressed deployment bundles containing canonical inputs, locks, selected manifests,
lowering certificates, native artifacts, SBOM, provenance, policies, secret references, migrations, health probes,
rollback plan, and expected observations; sign and verify bundles; prohibit secret material; support deterministic
rebuild and promotion across environments without semantic recompilation.

**Evidence.** Reproducible bundle byte/digest test, SLSA-style provenance, signature/substitution/rollback fixtures,
secret scanner, environment-promotion differential.

**Falsifier.** The running deployment cannot be traced to one immutable organization and compiler input set.

## R9. Native MCP adapter suite

**Depends on:** R6, R8.

**Engineering ACs.** Implement negotiated native MCP transport and lifecycle for the pinned protocol revision; map
tools, resources, prompts, elicitation, cancellation, progress, and errors only within declared subsets; preserve
`_meta`; enforce schema/resource limits, origin/auth boundaries, capability grants, and prompt/context trust; test
stdio and streamable HTTP where claimed.

**Evidence.** Official-schema fixtures, hostile MCP server/client corpus, native interop tests, round trips for exact
subsets, typed losses elsewhere, version negotiation and downgrade rejection.

**Falsifier.** Discovering an MCP tool or prompt grants organizational authority not present in the deployment.

## R10. Native A2A and Agent Spec adapters

**Depends on:** R6, R8.

**Engineering ACs.** Implement A2A agent-card discovery, messages, tasks, artifacts, streaming, cancellation, and
input-required projection; implement Oracle Agent Spec behavior/flow import/export for the exact supported release;
keep remote endpoint, actor identity, behavior, and durable work distinct; preserve extensions; report lifecycle,
authority, flow, and governance losses.

**Evidence.** Official examples plus malicious cards/specs, compatible runtime interop, state-relation corpus,
lossy/nonlossy round trips, SSRF and schema-exhaustion tests.

**Falsifier.** A remote card or serialized agent becomes a trusted organizational actor solely by being well formed.

## R11. Native event, telemetry, workflow, and policy adapters

**Depends on:** R6, R8.

**Engineering ACs.** Implement CloudEvents envelopes and selected bindings, OpenTelemetry traces/metrics/logs,
Serverless Workflow lowering, and OPA/Rego enforcement interfaces; preserve trace versus control causality,
observation versus truth, policy decision versus effect enforcement, and workflow state versus organizational state;
pin semantic conventions and policy bundles.

**Evidence.** Official conformance fixtures where available, collector/runtime interop, trace-context attack corpus,
workflow preservation certificates, policy allow/deny/undefined/error fixtures.

**Falsifier.** A valid event/span is accepted as verified organizational completion without an authorized lift.

## R12. Live Hermes substrate implementation

**Depends on:** R6–R8.

**Engineering ACs.** Replace proof-only composition with a supported Hermes provider implementing manifest discovery,
deployment, configuration, durable work/control, worker execution integration, Slack interaction, health, upgrades,
event lifting, pause/resume, backup/restore, and teardown; pin versions and detect CLI success-without-mutation.

**Evidence.** Disposable live environment from bundle, complete TCK, restart/partition/duplicate/stale-fence/upgrade/
rollback drills, identified run traces, zero manual hidden state.

**Falsifier.** Recovery depends on model conversation memory or an operator command absent from the deployment plan.

## R13. Live Paperclip substrate implementation

**Depends on:** R6–R8.

**Engineering ACs.** Implement Paperclip as an independently deployable work/control provider with separate worker and
interaction providers; cover issue checkout, heartbeat, recovery, approvals, hierarchy, budgets, events, upgrades,
lifting, and teardown; map native states without adding them to Organization IR; document stronger assumptions and
weaker guarantees.

**Evidence.** Same live TCK and fault schedule as R12, pinned source/container, differential portable traces, complete
behavioral residual classification, no shared controller implementation with Hermes.

**Falsifier.** The second deployment secretly delegates its authoritative control semantics to the Hermes adapter.

## R14. Desired-state organization registry

**Depends on:** R2, R5, R8.

**Engineering ACs.** Build a multi-tenant content-addressed registry for organizations, profiles, packages, bundles,
deployments, policies, approvals, and versions; support optimistic concurrency, immutable history, branches,
environment promotion, signatures, retention, export, deletion, and disaster recovery; define authoritative records.

**Evidence.** Transaction/serializability tests, tenant-isolation attacks, backup/restore and point-in-time recovery,
audit reconstruction, large-history bounds.

**Falsifier.** Two accepted writes can silently produce a desired state that corresponds to neither revision.

## R15. Portable event store and observed-state materializer

**Depends on:** R11, R14.

**Engineering ACs.** Persist authenticated native envelopes, lift results, gaps, portable DAGs, corrections,
retractions, snapshots, and projections; support partitions, late data, replay, compaction, retention/privacy deletion,
schema/reducer migration, query consistency, and provenance; separate event time, ingest time, and logical order.

**Evidence.** Database isolation tests, crash recovery at every write boundary, differential full/snapshot replay,
partition reconciliation, migration/rollback, tamper detection, deletion proofs and declared irreversibility.

**Falsifier.** Materialized organization state cannot be reproduced from retained authoritative inputs and versions.

## R16. Fleet reconciler and drift control

**Depends on:** R12–R15.

**Engineering ACs.** Continuously compare desired deployment bundles with observed component state; classify semantic,
configuration, version, health, capacity, credential, policy, and observation drift; plan idempotent repairs with
fencing, rate limits, maintenance windows, canaries, pause, escalation, and rollback; never let observation overwrite
desired state.

**Evidence.** Kubernetes-operator-style reconciliation laws, crash/duplicate/reorder/partition tests, live drift
injection on both substrates, oscillation monitor, repair and refusal traces.

**Falsifier.** Repeated reconcile of a converged healthy fleet causes effects, or irreconcilable drift is reported green.

## R17. Human interaction and organizational command plane

**Depends on:** R14–R16.

**Engineering ACs.** Provide typed Slack-first conversations for status, explanation, work creation, questions,
answers, approvals, mutations, pause, resume, repair, and rollback; bind identity, tenant, channel/thread, work,
decision, artifact, scope, expiry, and idempotency; support notification preferences and accessible web/CLI fallback;
show evidence and uncertainty rather than fabricated summaries.

**Evidence.** End-to-end interaction corpus, replay/forgery/confused-deputy/prompt-injection attacks, usability tests,
lost-message recovery, approval binding and revocation, complete audit trail.

**Falsifier.** Ambiguous natural language directly performs a privileged mutation without a typed confirmation boundary.

## R18. Benchmark protocol and workload registry

**Depends on:** R3–R4, R8, R11, R13, R17.

**Engineering ACs.** Define benchmark units, workload packages, train/dev/test separation, environment locks, seed and
randomization policy, contamination controls, judge independence, stopping rules, retries, missing-data treatment,
cost accounting, human simulation, privacy, and result schemas; register coding and noncoding organizational tasks;
make criteria externally owned and immutable during a run.

**Evidence.** Reproducible workload packages, adversarial gaming tests, inter-rater calibration, repeated-run variance,
hidden test set, signed result bundles.

**Falsifier.** The organization can improve its score by editing the grader, selecting only successful attempts, or
accessing hidden answers.

## R19. Organizational measurement and autonomy accounting

**Depends on:** R15, R17–R18.

**Engineering ACs.** Define events and estimands for lead/cycle/wait time, throughput, WIP, first-pass yield, rework,
defects, reliability, tokens, compute, money, human-minutes, interruption burden, escalation, autonomy ratio, and
value delivery; attach units, attribution, horizons, censoring, uncertainty, and provenance; prevent double counting
across retries, providers, and humans.

**Evidence.** Synthetic ground-truth ledgers, conservation/accounting invariants, missing/censored-data fixtures,
cross-provider normalization, real-human timing calibration, confidence intervals.

**Falsifier.** Moving hidden work to a human or external service improves reported autonomy or cost without attribution.

## R20. Competitive benchmark execution on two live substrates

**Depends on:** R12–R13, R18–R19.

**Engineering ACs.** Run unchanged canonical organizations through matched workload cells on Hermes and Paperclip;
randomize order, lock models/tools/repositories, measure uncertainty, inject matched faults, include failures and
timeouts, compare portable outcomes and economic/operational residuals, and publish replayable result bundles.

**Evidence.** Multiple independent live repetitions, identified provider revisions, raw/lifted traces, statistical
report with effect sizes/error bars, zero untriaged differences.

**Falsifier.** A ranking changes merely because one substrate received easier tasks, hidden manual help, or excluded failures.

## R21. Organizational twin v1

**Depends on:** R16, R19–R20.

**Engineering ACs.** Build a versioned executable model of queues, service distributions, routing, retries, review,
failures, budgets, human seams, and provider capacities; infer parameters with uncertainty; separate observed,
estimated, and assumed values; predict held-out throughput, latency, cost, quality, and bottlenecks; expose sensitivity
and identifiability limits.

**Evidence.** Simulation invariants, synthetic parameter recovery, posterior/prediction calibration, held-out live
predictions, ablation and uncertainty coverage, falsifying traces.

**Falsifier.** The twin is called calibrated while its prediction intervals systematically miss held-out observations.

## R22. Counterfactual planner and constrained organization search

**Depends on:** R7, R21.

**Engineering ACs.** Search profile, component, capacity, routing, retry, review, and human-seam changes under semantic,
security, budget, governance, and rollout constraints; distinguish prediction from causal effect; use Pareto fronts;
penalize uncertainty and complexity; reject unidentifiable comparisons; emit a typed organization patch, rationale,
expected effects, assumptions, risks, and rollback trigger.

**Evidence.** Known-optimum synthetic worlds, constraint and dominance tests, counterfactual backtests, no-op baseline,
adversarial Goodhart/gaming corpus, independent certificate validation.

**Falsifier.** The planner recommends an infeasible or authority-expanding change because it scores well in simulation.

## R23. Safe experimentation, canaries, and causal evaluation

**Depends on:** R16, R18–R22.

**Engineering ACs.** Support shadow, replay, canary, randomized, switchback, and stepped-wedge experiments where valid;
pre-register hypotheses, metrics, guardrails, sample/stopping rules, assignment units, interference assumptions, and
rollback; detect novelty, carryover, selection bias, and cross-task interference; never randomize forbidden safety boundaries.

**Evidence.** Randomization and analysis tests, simulated false-positive/coverage studies, live low-risk canary,
automatic guardrail rollback, immutable preregistration and complete analysis bundle.

**Falsifier.** A post-hoc metric or selectively stopped run is presented as causal evidence for an organization change.

## R24. Bounded autonomous organization-improvement loop

**Depends on:** every prior checkpoint.

**Engineering ACs.** Close the loop from observation to twin update, candidate proposal, static/formal checks,
independent benchmark, human approval, signed deployment, canary, monitoring, promotion or rollback, and durable
decision memory; enforce proposal rate, spend, scope, authority, experiment, and cumulative-change bounds; separate
proposer, evaluator, approver, deployer, and auditor; provide global pause and deterministic safe state.

**Evidence.** Long-running dogfood on this repository, at least one accepted and one rejected proposal, one automatic
rollback, restart during every phase, forged approval and compromised-worker drills, measurable improvement against
pre-registered criteria without safety regression, complete causal/audit reconstruction.

**Falsifier.** The optimizer can modify its own constitution, grader, authority ceiling, evidence, or rollback guard
and then use the modified rule to approve itself.

---

## Milestone gates

### G1 — Public-standard gate (R0–R4)

A clean-room implementer can parse, normalize, diagnose, and exchange the supported semantic corpus without reading
the TypeScript implementation, and discrepancies are classified rather than hand-waved.

### G2 — Provider-platform gate (R5–R8)

A provider can be developed outside core, solved into a deployment, lowered reproducibly, packaged with provenance,
and independently tested through the TCK.

### G3 — Native-interoperability gate (R9–R11)

Every selected external standard has a native adapter for a versioned subset, official or authoritative fixtures,
explicit trust boundaries, extension behavior, and exact loss reports. Descriptor-only support does not pass.

### G4 — Two-live-substrate gate (R12–R13)

The identical canonical organization runs on independent Hermes and Paperclip control/work implementations under the
same adversarial schedule, with portable trace comparison and no shared hidden controller.

### G5 — Truthful-control-plane gate (R14–R17)

Desired state, observed history, reconciliation, and human authority remain reconstructible, tenant-isolated,
interruptible, and operationally recoverable across crashes, upgrades, drift, and rollback.

### G6 — Measurement gate (R18–R20)

The benchmark can compare organization/substrate cells with locked workloads, complete cost and human-labor
attribution, uncertainty, contamination controls, and replayable raw evidence.

### G7 — Twin gate (R21–R23)

The twin predicts held-out outcomes with calibrated uncertainty; proposed interventions are constrained and evaluated
under pre-registered causal designs or explicitly remain predictions.

### G8 — Autonomous-organization gate (R24)

The running organization safely improves a bounded aspect of itself through independent evaluation and human-ratified
deployment, survives faults, and can prove exactly why it promoted or rolled back the change.

## Final proof-accounting gate

The phase cannot close until:

1. all R0–R24 formal-lens rows are machine-matched to obligation-ledger entries;
2. every public interface field has a semantic-coverage owner;
3. every required obligation has one disposition and one honest assurance status;
4. every external version, live run, benchmark cell, and deployment bundle is pinned and resolvable;
5. every behavioral difference and audit finding is triaged, leaving zero parking-lot residuals;
6. every milestone gate has rerunnable or externally identified evidence;
7. a fresh adversarial review pair finds no unowned critical claim;
8. the full clean-checkout and disaster-recovery demonstrations succeed without undocumented operator state.
