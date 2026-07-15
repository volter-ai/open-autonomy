# Autonomous Organization Runtime formal-lens audit

This audit instantiates the formal obligations in [`ORGANIZATION-RUNTIME-AC.md`](./ORGANIZATION-RUNTIME-AC.md).
Rows are requirements, not evidence. Each stable ID must appear exactly once in the implementation obligation ledger
before its checkpoint can close. Evidence must name a mechanism and minimal falsifier; a reference to this document
does not discharge a row.

Disposition and assurance remain orthogonal and use the vocabularies defined by the Organization IR acceptance
specification. Where a quantitative result is claimed, its evidence must additionally state the estimand, population,
units, uncertainty, missing-data policy, and conditions under which comparison is invalid.

## R0 — baseline and refreshed threat model

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R0-SEM-1 Semantic | Freeze the exact supported semantic and API baseline without retrospectively narrowing it. | A previously supported construct vanishes from the inventory. |
| R0-SEC-1 Security | Enumerate every principal, credential, trust transition, tenant boundary, and privileged effect. | A live operation uses an unlisted credential or principal. |
| R0-DIST-1 Distributed | Enumerate crash, retry, concurrency, delay, partition, and recovery assumptions. | A recovery claim relies on a failure excluded without disclosure. |
| R0-ADV-1 Adversarial | Every finding receives an owner or explicit rejection rationale. | A parking-lot fact has no R-item owner. |

## R1 — normative specification

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R1-SEM-1 Semantic | Normative syntax determines one denotation or declares implementation choice. | Independent readers assign incompatible meaning. |
| R1-TYP-1 Type | Sorts, references, effects, and invalid states have normative static rules. | A schema-valid wrong-sort reference has unspecified validity. |
| R1-ALG-1 Algebraic | Composition, equivalence, identity, ordering, and conflict laws are explicit. | Implementations disagree whether reordering preserves meaning. |
| R1-EVO-1 Evolution | Defaults, extensions, versions, deprecation, and migration are normative. | An unknown field is silently erased under a supported version. |

## R2 — packages and registry

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R2-SEM-1 Semantic | Package identity separates logical name, version, content digest, and retrieval location. | A mirror change alters meaning under the same lock. |
| R2-SEC-1 Security | Resolution prevents substitution, dependency confusion, rollback, and resource exhaustion. | A higher-priority malicious namespace satisfies a locked dependency. |
| R2-ALG-1 Algebraic | Locked resolution is deterministic and offline reproducible. | Equal locks produce unequal normalized graphs. |
| R2-PROV-1 Provenance | Every resolved declaration traces to package, content, signer, and source path. | A compiled field has no resolvable package origin. |

## R3 — conformance and TCK

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R3-REF-1 Refinement | Each conformance level names the observations and guarantees it tests. | A Runner-only test is advertised as semantic conformance. |
| R3-EPI-1 Epistemic | Self-attested, test-observed, live-observed, and certified results remain distinct. | A provider-signed result is displayed as independent certification. |
| R3-ADV-1 Adversarial | The TCK detects omission, swallowed tests, fabricated oracles, and selective execution. | A defective provider passes by not advertising required behavior it uses. |
| R3-EVO-1 Evolution | Language, TCK, provider, and result versions are independently pinned. | A historical pass cannot identify its test semantics. |

## R4 — independent implementation

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R4-SEM-1 Semantic | Independent implementations agree on canonical meaning over the supported corpus. | Canonical bytes or hashes diverge without a classified spec ambiguity. |
| R4-COMP-1 Compiler | No normative rule depends on private TypeScript implementation behavior. | Clean-room implementation requires reading core source. |
| R4-FALS-1 Falsification | Every differential discrepancy is classified and zero remain untriaged. | A “minor difference” has no semantic disposition. |

## R5 — compiler API

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R5-COMP-1 Compiler | Pass inputs are immutable, declared, bounded, cancellable, and deterministic. | A plugin reads undeclared ambient state and changes output. |
| R5-ALG-1 Algebraic | Clean, incremental, cached, and deterministic-parallel builds are equivalent. | Cache presence changes semantic output. |
| R5-SEC-1 Security | Plugins cannot escape declared filesystem, network, secret, or process authority. | A diagnostic plugin reads a deployment secret. |
| R5-EVO-1 Evolution | Public artifacts and APIs have explicit compatibility and migration policy. | A patch release invalidates a valid stored artifact silently. |

## R6 — substrate SDK

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R6-EXT-1 Extensibility | Providers register through public SDK contracts without core product cases. | Adding a provider requires modifying a core switch. |
| R6-REF-1 Refinement | SDK-generated adapters and passes retain source obligations and loss accounting. | A generated adapter drops an obligation. |
| R6-OPS-1 Operational | Health, upgrade, rollback, teardown, and fault injection are SDK-level contracts. | A provider can conform without a recovery criterion. |
| R6-DIR-1 Architecture | Dependency direction remains provider → SDK/core, never core → provider. | Core imports a provider package. |

## R7 — deployment planning

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R7-CSP-1 Constraint | Feasibility precedes optimization and incompatibility requires a valid core. | Cheapest invalid deployment wins. |
| R7-ECO-1 Economic | Pareto dimensions retain units, horizons, uncertainty, and evidence freshness. | Incomparable costs are numerically ranked. |
| R7-REF-1 Refinement | Every selected component/adapter constructively discharges source obligations. | A plan contains an unwitnessed required leaf. |
| R7-EPI-1 Epistemic | Assumed or stale provider claims require explicit acceptance. | Expired asserted capacity is treated as observed. |

## R8 — deployment bundles

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R8-ALG-1 Reproducibility | Equal locked inputs produce the same content-addressed bundle. | Environment promotion rebuilds different semantics. |
| R8-SEC-1 Supply chain | Signatures, provenance, SBOM, substitution checks, and secret exclusion are enforced. | A tampered native artifact verifies. |
| R8-OPS-1 Operations | Bundle includes health, migration, expected observation, and rollback contracts. | Deployment cannot determine whether rollout succeeded. |
| R8-PROV-1 Provenance | A running instance resolves to exact organization/compiler/component inputs. | Live state has no immutable bundle identity. |

## R9 — native MCP

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R9-INT-1 Interoperability | Native negotiation and claimed transports conform to the pinned MCP revision. | Generic envelope fixtures are presented as native wire proof. |
| R9-SEC-1 Security | Discovery never grants capability; origins, auth, schemas, resources, and prompt trust are bounded. | A discovered tool executes outside a declared grant. |
| R9-REF-1 Refinement | Exact subsets round-trip and all other mappings report typed loss. | `_meta` or cancellation semantics vanish silently. |

## R10 — native A2A and Agent Spec

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R10-ORG-1 Organizational | Card, endpoint, actor, behavior, task, and work identity remain distinct. | Card URL becomes durable actor ID by default. |
| R10-REF-1 Refinement | Task/message/flow state relations are explicit and versioned. | `input-required` is guessed into an unrelated work state. |
| R10-SEC-1 Security | Remote discovery, schemas, parts, URLs, and extensions are untrusted and bounded. | A valid card triggers SSRF or authority acquisition. |

## R11 — events, telemetry, workflow, policy

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R11-EPI-1 Epistemic | Envelope/span observation is not truth, verification, or authority. | Span status alone completes work. |
| R11-DIST-1 Distributed | Trace causality, transport delivery, and control causality are not conflated. | A trace parent creates control ordering without an adapter rule. |
| R11-REF-1 Refinement | Workflow lowering and policy enforcement report preserved meaning and loss. | OPA `undefined` is silently treated as allow. |
| R11-EVO-1 Evolution | Bindings, semantic conventions, workflows, and policy bundles are pinned. | Replay changes meaning after collector upgrade. |

## R12 — live Hermes

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R12-DIST-1 Distributed | Restart, duplicate, delay, partition, loss, fencing, and replay preserve invariants. | A stale worker completes reassigned work. |
| R12-OPS-1 Operational | Deploy, inspect, pause, upgrade, backup, restore, rollback, and teardown are bundle-driven. | Recovery needs an undocumented shell command. |
| R12-HCI-1 HCI | Slack interactions correlate durably to typed work and decisions. | A thread deletion erases authoritative work. |
| R12-EPI-1 Epistemic | CLI return status is checked against observed post-state. | Exit zero without mutation counts as success. |

## R13 — live Paperclip

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R13-IND-1 Independence | Paperclip owns work/control without delegating authoritative semantics to Hermes. | Hermes controller remains the hidden source of truth. |
| R13-REF-1 Refinement | The same organization obligations and portable observations are satisfied under declared assumptions. | Product-specific state is added to Organization IR. |
| R13-OPS-1 Operational | Checkout, heartbeat, recovery, approvals, hierarchy, budgets, upgrades, and teardown are live-tested. | Only happy-path issue creation is exercised. |
| R13-ECO-1 Economic | Matched cost, latency, capacity, and human load are reported with uncertainty. | Missing failures make one provider appear cheaper. |

## R14 — desired-state registry

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R14-DB-1 Database | Revisions, branches, promotions, approvals, and histories have explicit transaction semantics. | Concurrent accepted writes yield neither revision. |
| R14-SEC-1 Security | Tenant isolation and per-object authorization apply to data, indexes, backups, and exports. | Cross-tenant identifier enumeration reveals metadata. |
| R14-EVO-1 Evolution | Retention, migration, deletion, backup, and restore preserve declared invariants. | Restored registry accepts a stale revoked approval. |

## R15 — event store and state

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R15-ALG-1 Algebraic | Replay, snapshot, compaction, partition merge, correction, and retraction preserve active state. | Snapshot replay differs from full replay. |
| R15-DB-1 Database | Native, lifted, accepted, pending, rejected, and projected records have explicit authority and isolation. | Partially written lift appears accepted. |
| R15-PRIV-1 Privacy | Retention and deletion define what is erased, retained, derived, and irrecoverable. | Deleted personal payload survives an advertised purge. |
| R15-PROV-1 Provenance | Event time, ingest time, logical order, issuer, integrity, and adapter version remain reconstructible. | A state fact lacks its causal/evidential origin. |

## R16 — reconciliation and drift

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R16-CTRL-1 Control | Reconciliation converges or escalates under bounds, hysteresis, and explicit environment assumptions. | Healthy converged state oscillates indefinitely. |
| R16-DIST-1 Distributed | Effects are idempotent and fenced across crash, duplicate, reorder, and split-brain schedules. | Two reconcilers both perform a singleton migration. |
| R16-SEM-1 Semantic | Semantic, config, version, health, capacity, credential, policy, and observation drift remain distinct. | Missing telemetry is reported as semantic equality. |
| R16-OPS-1 Operational | Canaries, maintenance windows, pause, refusal, rollback, and repair are observable. | Irreconcilable drift is silently overwritten. |

## R17 — human command plane

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R17-HCI-1 HCI | People can correlate, inspect, explain, interrupt, approve, revoke, and recover actions. | Status cannot identify the evidence behind a claim. |
| R17-SEC-1 Security | Identity, tenant, scope, artifact, expiry, and idempotency bind every privileged command. | Approval for artifact A authorizes artifact B. |
| R17-EPI-1 Epistemic | Summaries expose evidence, assumptions, conflicts, and unknowns. | Missing evidence is narrated as completion. |
| R17-ADV-1 Adversarial | Ambiguity and prompt-like content cannot bypass typed confirmation. | Natural-language injection pauses another tenant. |

## R18 — benchmark protocol

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R18-MEA-1 Measurement | Workload, outcome, unit, population, scorer, stopping, and missing-data rules are predeclared. | Failed trials disappear from the denominator. |
| R18-STAT-1 Statistics | Randomization, replication, variance, uncertainty, and multiplicity match the claimed comparison. | One run is presented as a stable ranking. |
| R18-ADV-1 Adversarial | Contamination, grader access, cherry-picking, self-judging, and hidden labor are controlled. | Candidate edits its own grader. |
| R18-PRIV-1 Privacy | Benchmark data rights, secrets, retention, and human-simulator records are bounded. | Private task content leaks into a public result bundle. |

## R19 — measurement and autonomy accounting

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R19-MEA-1 Measurement | Every metric defines event basis, unit, horizon, attribution, censoring, and uncertainty. | “Autonomy” lacks a numerator and denominator. |
| R19-ACC-1 Accounting | Cost, work, retries, human labor, and external services obey conservation/no-double-count rules. | One retry is counted as two completed tasks. |
| R19-ECO-1 Economic | Money, tokens, compute, time, and human burden remain separately attributable before conversion. | Human time is assigned zero cost implicitly. |
| R19-ADV-1 Adversarial | Moving work off-ledger cannot improve the score. | Untracked manual cleanup raises autonomy ratio. |

## R20 — matched live benchmark

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R20-EXP-1 Experimental | Cells use matched workloads, locked environments, randomized order, and complete outcomes. | One substrate receives easier tasks. |
| R20-REF-1 Refinement | Both cells consume unchanged canonical semantics and compare portable outcomes. | Provider-specific specialization is counted as portability. |
| R20-STAT-1 Statistics | Ranking reports effect sizes, error bars, sensitivity, and inconclusive outcomes. | Overlapping uncertainty is hidden behind a total order. |
| R20-FALS-1 Falsification | Every operational/economic/semantic difference is classified. | A timeout is excluded as an “infrastructure issue.” |

## R21 — organizational twin

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R21-SEM-1 Model | State variables, parameters, equations, observables, and abstraction error are explicit. | A dashboard heuristic is called a twin without an executable model. |
| R21-STAT-1 Calibration | Parameter and predictive uncertainty are calibrated on held-out observations. | Claimed 90% intervals cover materially less than 90%. |
| R21-QUE-1 Queueing | Arrival, service, routing, priority, retry, blocking, and capacity assumptions are represented. | Average utilization predicts burst feasibility without a queue model. |
| R21-IDENT-1 Identifiability | Unidentifiable parameters and observationally equivalent models are reported. | One causal story is selected from indistinguishable traces. |

## R22 — counterfactual search

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R22-CSP-1 Constraint | Every candidate satisfies semantic, authority, budget, governance, and rollout constraints before scoring. | Authority-expanding candidate enters the Pareto set. |
| R22-DEC-1 Decision | Objectives, tradeoffs, uncertainty aversion, baseline, and dominance are explicit. | Hidden scalar weights determine the winner. |
| R22-CAU-1 Causal | Prediction and intervention effects remain distinct; unsupported counterfactuals are unknown. | Correlation is reported as expected causal gain. |
| R22-ADV-1 Adversarial | Goodhart, proxy gaming, complexity, and distribution shift are penalized or bounded. | Candidate wins by suppressing recorded escalations. |

## R23 — experimentation and causal evaluation

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R23-CAU-1 Causal | Assignment unit, estimand, interference, carryover, and identification assumptions are predeclared. | Cross-team spillover is ignored in an individual randomization. |
| R23-STAT-1 Statistics | Sample, stopping, multiplicity, guardrails, and analysis are preregistered. | Experiment stops immediately after a favorable fluctuation. |
| R23-SEC-1 Safety | Forbidden boundaries are never randomized; canaries have automatic rollback. | Safety policy is assigned as an experimental treatment. |
| R23-PROV-1 Provenance | Assignment, exposure, outcomes, exclusions, code, and analysis bundle are immutable and linked. | Post-hoc exclusions cannot be reconstructed. |

## R24 — bounded autonomous improvement

| ID / lens | Obligation | Minimal falsifier |
|---|---|---|
| R24-CTRL-1 Control | The loop has bounded proposal rate, spend, scope, cumulative change, and deterministic safe state. | Repeated failed proposals consume resources indefinitely. |
| R24-ORG-1 Organizational | Proposer, evaluator, approver, deployer, and auditor are independently authorized roles. | The proposer approves its own rubric change. |
| R24-SEC-1 Security | Constitution, grader, authority ceiling, evidence, pause, and rollback guards are outside optimizer authority. | Optimizer edits its own approval threshold. |
| R24-REF-1 Refinement | Approved patches compile, conform, canary, promote, and rollback with obligation continuity. | Promotion loses an inherited safety obligation. |
| R24-CAU-1 Causal | Claimed improvement is tied to preregistered evidence or labeled prediction only. | A coincident improvement is attributed to the change. |
| R24-OPS-1 Operational | Restart during any phase preserves one durable decision and effect history. | Restart repeats deployment with a new approval context. |

## Audit closure rule

A checkpoint closes only when every row for that checkpoint:

1. has an implementation owner and ledger entry;
2. records one semantic disposition and one assurance status;
3. names evidence stronger than the claim requires or narrows the claim honestly;
4. has an executable or externally identified falsifier result;
5. assigns every discovered difference to a typed residual category;
6. leaves no untriaged residual when the checkpoint is marked complete.
