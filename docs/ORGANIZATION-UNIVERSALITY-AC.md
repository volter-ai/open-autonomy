# Organization universality and substrate-composition acceptance specification

Status: normative experimental punchlist for proving that Organization IR can represent the target autonomy-system
domain and compile compatible organizations into heterogeneous substrate compositions. This follows Organization IR
B0–P13 and Organization Runtime R0–R28; it does not reopen their bounded engineering claims.

## Mission and exact completion claim

The phase is complete only when a preregistered, structurally diverse corpus of real autonomy systems has a total
source-fact disposition into canonical Organization IR, and every preregistered organization × substrate-composition
cell produces exactly one independently replayable result:

1. a deployment with an explicit preservation certificate;
2. a deployment with explicit typed losses accepted by the selected preservation profile; or
3. an incompatibility result with a verified minimal unsatisfied core.

For source system `A`, encoding `E`, substrate composition `Σ`, compiler `C`, native execution `run`, portable lifting
`L`, selected observations `O`, and equivalence relation `≈O`:

```text
E(A) = canonical Organization IR + total source-fact disposition

C(E(A), Σ, O) =
  deployment D + certificate P    when L(run(D)) ≈O A
  deployment D + typed loss P     when O permits every declared loss
  incompatible core K             otherwise
```

The quantified claim must name its finite target population and sampling rule. “Essentially any” may be published
only as a measured coverage statement over that population, never as unbounded universality.

## Non-claims

This phase does not require one substrate to implement every facet, native byte-for-byte identity, identical timing or
scheduling where excluded by the preservation profile, production-duration reliability, universal termination, or
support for autonomy systems outside the declared software-organization domain. It does require zero silent loss.

The organizational twin and autonomous-improvement loop are downstream consumers. Their existence does not prove
representation or compilation coverage. Product packaging is required only where needed to make the universality
claim independently reproducible.

## Proof units and closure rules

Every checkpoint must bind these machine-readable units:

- `SourceFact`: one semantically meaningful native-system fact with provenance;
- `Disposition`: `preserved | derived | lowered | extension | opaque | abstracted | unsupported | inexpressible`;
- `ObservationProfile`: selected observations, equivalence, tolerated variance, and forbidden loss;
- `FacetRequirement`: required behavior, authority, cardinality, topology, and lifecycle;
- `ComponentAdvertisement`: supplied facets, assumptions, exclusions, versions, and conformance evidence;
- `LinkContract`: identities, endpoints, credentials, event routes, retry ownership, delivery, health, and teardown;
- `CompilationCell`: source encoding × substrate composition × observation profile;
- `PreservationCertificate` or `IncompatibilityCore`;
- `ExecutionComparison`: source/native and compiled portable observations;
- `CoverageReport`: denominators, weights, uncertainty, exclusions, and all cell outcomes.

Global invariants:

1. every source fact has exactly one disposition and evidence owner;
2. every generated artifact traces to source, pass, component, version, and assumption;
3. no backend-specific product noun enters canonical Organization IR;
4. a composition has exactly one owner for each exclusive authority and explicit arbitration for replicated facets;
5. prompts, skills, context, tools, memory, and harness behavior are semantic inputs, not untyped files;
6. compiler success implies all mandatory profile observations are preserved or explicitly permitted losses;
7. compiler rejection identifies a replayable unsatisfied core and never substitutes a generic “unsupported”;
8. lifting cannot use compiler-intended outcomes as observed evidence;
9. all cross-product cells are populated; no blank, inferred, or marketing-valued cells;
10. all residual facts are triaged before a coverage claim is published.

Each checkpoint requires positive, negative, minimal-counterexample, mutation, version-skew, and resource-bound tests;
a skeptical review; machine-indexed evidence; and a clean full repository gate.

Each closure review must answer:

```text
Semantic domain and excluded domain:
Source facts owned and totality proof:
Selected observations and equivalence:
Preserved, lost, unknown, and incompatible cases:
Frontend/compiler/backend trust boundary:
Facet authorities and composition boundary:
Prompt/skill/context preservation boundary:
Desired, observed, and lifted-state boundary:
Version, migration, rollback, and teardown boundary:
Counterexample that would falsify the claim:
Assurance class and independently replayable evidence:
```

## Formal-lens routing

| Checkpoints | Required lenses | Concrete question |
|---|---|---|
| U0–U3 | measurement, sampling, ontology, epistemic, adversarial | Is the claimed population fixed, representative, and immune to denominator gaming? |
| U1–U2 | semantics, type theory, algebra, refinement, information flow | What observations distinguish systems, and is every source fact disposition total and honest? |
| U4–U5 | language translation, evolution, provenance, interoperability | Does importing preserve native meaning rather than merely parse syntax? |
| U6–U10 | algebra, constraint solving, distributed systems, security, lifecycle | Is a component composition coherent, constructible, and safely owned across failures? |
| U11 | programming-language semantics, context, security, HCI | Do instructions, skills, tools, memory, and harnesses preserve operational meaning? |
| U12–U13 | compiler construction, modularity, refinement, supply chain | Can independent providers implement the contract without private coupling? |
| U14–U16 | differential testing, causal/provenance, temporal logic, migration | Does native execution support the claimed preservation across the whole matrix? |
| U17–U18 | statistics, measurement validity, reproducibility, adversarial review | Is the published universality claim no broader than the replayable evidence? |

Formal language is evidence-bearing only when variables, domains, relations, and falsifiers are executable or
machine-indexed. A diagram or analogy is not a proof artifact.

## Dependency spine

The authoritative graph is [`organization-universality-punchlist.json`](./organization-universality-punchlist.json).

```text
U0 → U1 → U2 → U3
U2 → U4 → U5
U1/U2 → U6 → U7 → U8 → U9 → U10
U1/U4/U8 → U11
U7/U8/U9/U11 → U12
U3/U5/U10/U12 → U13 → U14 → U15 → U16 → U17 → U18
```

## U0. Quantified target domain and claim grammar

Define the autonomy-system population, inclusion/exclusion rule, unit of analysis, system/version pinning, structural
strata, and admissible coverage claims.

Acceptance:

- The domain is “autonomous software organizations,” not all workflow or agent systems.
- Inclusion is reproducible from public facts and does not select only systems already easy to encode.
- Popularity and structural-diversity strata are recorded separately.
- “90%” identifies whether it weights systems, source facts, required observations, or compilation cells.
- Mutation tests reject denominator changes, post-result exclusions, and ambiguous system versions.

## U1. Observation and preservation-profile calculus

Define versioned profiles such as `work-lifecycle`, `authority-policy`, `human-handoff`, `prompt-skill-context`,
`failure-recovery`, `economic`, and `full-declared`.

Acceptance:

- Each profile declares observables, equivalence, tolerated variance, forbidden loss, and unknown handling.
- Profile refinement and composition have executable laws; conflicting profiles yield a typed conflict.
- Timing, fairness, nondeterminism, and provider-local behavior cannot disappear behind generic equivalence.
- A certificate can be independently replayed from profile, source observations, and lifted target observations.

## U2. Source-fact inventory and total disposition ledger

Create the canonical fact grammar and ledger used for every imported system.

Acceptance:

- Facts cover configuration, runtime behavior, authority, failure, lifecycle, prompt/context, extension, and omission.
- Every fact has stable identity, source citation/digest, semantic scope, and exactly one disposition.
- `opaque` preserves invocation boundaries but makes no internal semantic claim.
- `abstracted` requires proof that the selected observation profile cannot distinguish the removed detail.
- `unsupported` and `inexpressible` remain in coverage denominators under preregistered rules.

## U3. Preregistered ecosystem corpus

Freeze a minimum 15-system corpus spanning at least: controller/kanban, durable workflow, graph runtime, actor system,
coding-session harness, GitHub-native automation, Kubernetes/operator reconciliation, multi-agent conversation, and
human-heavy coordination.

Acceptance:

- At least five systems exceed the declared adoption threshold and at least five are structural forcing functions.
- Exact versions, native examples, licenses, source evidence, and selection rationale are content-addressed.
- One holdout system family is chosen before frontend and backend completion.
- Corpus changes create a new campaign version rather than rewriting results.

## U4. Frontend/importer protocol

Define how native configurations, APIs, graphs, workflows, and retained opaque behaviors become canonical IR plus a
source-fact ledger.

Acceptance:

- Frontends are plugins with version negotiation, provenance, diagnostics, extensions, and deterministic output.
- Import never interprets absent native evidence as a default semantic guarantee.
- Native extensions are namespaced and cannot silently affect canonical passes.
- A clean-room third-party frontend passes a published frontend TCK.

## U5. Canonical source encodings

Implement encodings/importers for the U3 corpus.

Acceptance:

- Every system has at least one characteristic native example exercising its distinctive semantics.
- Every example produces valid canonical IR and a zero-unowned-fact ledger.
- At least three systems are encoded independently by two authors or implementations and differentials are triaged.
- The holdout family is encoded without changing U0–U2 semantics; required extensions are explicit evidence.

## U6. Substrate facet algebra

Define facets independently of products: control/work, scheduling, execution/session, model, interaction, storage,
identity/secrets, policy, observation, and lifecycle.

Acceptance:

- Each facet declares cardinality, authority, replication, ordering, failure, consistency, and lifecycle laws.
- Composition defines identity, event, transaction, credential, and failure boundaries.
- Exclusive-authority collisions, retry ambiguity, teardown gaps, and cyclic bootstrap dependencies are rejected.
- Associativity/commutativity/idempotence are claimed only where property-tested with stated side conditions.

## U7. Component advertisements and requirement contracts

Upgrade capability advertisements into constructive facet contracts.

Acceptance:

- Advertisements bind implementation/version, supplied facets, assumptions, limits, exclusions, and evidence.
- Requirements carry semantic predicates rather than capability-name strings alone.
- False, stale, aliased, or self-attested advertisements fail closed.
- Partial implementations may compose only when the union closes all requirements and link obligations.

## U8. Portable composition/link IR

Create the intermediate representation between solved deployment and native backend plans.

Acceptance:

- It binds stable identities, endpoints, credentials, schemas, routes, correlations, retries, delivery, health,
  observability, upgrades, rollback, and teardown ownership.
- Secret values never enter portable artifacts; only authority-bound references do.
- Cross-component effects specify prepare/delivery/acknowledgement and idempotency boundaries.
- Link plans are deterministic, content-addressed, diffable, and independently validateable.

## U9. Solver soundness, completeness boundary, and explanations

Acceptance:

- Every accepted plan satisfies all facet, topology, policy, resource, and link predicates under replay.
- Rejected finite cases return a verified minimal or declared irreducible unsatisfied core.
- The solver states its decidable fragment and returns `unknown` outside it.
- Differential testing against exhaustive enumeration covers bounded small compositions.
- Optimization preferences cannot turn incompatibility into a lower-scored success.

## U10. Multi-substrate lifecycle and failure semantics

Acceptance:

- Apply, observe, reconcile, upgrade, rollback, drain, and destroy operate over a composition, not isolated components.
- Ownership is total for spawned resources, credentials, durable state, and external effects.
- Crash tests cover every cross-component effect boundary and restart with no duplicated acknowledged effect.
- Partial teardown, split authority, stale epoch, and incompatible rolling-version cases fail safe.

## U11. Prompt, skill, context, memory, tool, and harness semantics

Acceptance:

- Canonical semantics cover instruction precedence, assembly order, skill discovery/invocation, tool schemas, MCP,
  memory injection, continuation, cancellation, timeout, result extraction, and model/provider binding.
- Byte preservation is distinguished from behavioral preservation.
- Harness adapters publish semantic gaps and adversarial instruction-precedence tests.
- At least three dissimilar harnesses execute matched behavior/context fixtures with dispositioned differences.

## U12. Backend and linker SDK

Acceptance:

- A backend consumes only published compiler/link artifacts and SDK interfaces.
- Provider packages supply lowering, application, lifting, lifecycle, and conformance hooks independently.
- SDK compatibility and provider conformance versions are distinct.
- A clean-room backend compiles, links, runs, lifts, and tears down without importing private core modules.

## U13. Structurally diverse backend families

Implement at least five independently shaped backend compositions, including the existing Hermes and Paperclip paths
plus at least three of: durable workflow, graph runtime, Kubernetes/operator, GitHub-native, actor runtime, or
standalone coding-harness composition.

Acceptance:

- Each uses its native control/execution path; a service twin may replace only declared remote dependencies.
- Each publishes supported profiles, losses, limits, and exact version evidence.
- At least two deployments combine three or more independently owned facet providers.
- No backend-specific special case appears in canonical normalization or analysis.

## U14. Complete source × composition compilation matrix

Acceptance:

- Every preregistered source encoding is compiled against every preregistered composition/profile cell.
- Every cell ends in certified success, permitted typed loss, or verified incompatibility core.
- Equivalent compositions produce equivalent portable link obligations modulo declared topology.
- Matrix generation is deterministic and cannot omit failed cells from aggregate coverage.

## U15. Differential native execution and causal lifting

Acceptance:

- Representative compatible cells run matched workloads on source-native and compiled deployments.
- Lifted observations are derived only from authenticated native evidence.
- Comparisons cover success, refusal, timeout, retry, cancellation, human handoff, crash, recovery, and teardown.
- Every difference is assigned to preserved variance, permitted loss, violation, or unresolved investigation.

## U16. Round-trip, migration, and version-skew campaign

Acceptance:

- Where native export exists: native → IR → same native and native → IR → different composition are tested.
- Lossless claims round-trip selected observations; lossy claims preserve exact disposition provenance.
- Frontend, IR, compiler, SDK, backend, and native-version skew is covered.
- Migration preserves historical interpretation and supports rollback until an explicit irreversible boundary.

## U17. Coverage estimator and universality report

Acceptance:

- Report system-, fact-, observation-, and cell-weighted coverage separately with denominators.
- Publish preserved, derived, permitted-loss, incompatible, unsupported, inexpressible, unknown, and violation rates.
- Confidence/sensitivity analysis covers corpus weighting and system-family clustering.
- No “essentially any” or percentage claim exceeds its measured population and preservation profile.
- All raw ledgers, matrices, certificates, incompatibility cores, and replay commands are published.

## U18. Independent reproduction and release gate

Acceptance:

- An independent operator selects one encoded source and one compatible multi-provider composition from published
  artifacts, compiles it, applies it, runs the fixture, verifies the certificate, and destroys it.
- A second implementation reproduces at least one frontend or backend result using only public specifications/TCKs.
- The released CLI exposes import, validate, plan, compile, apply, status, diff, migrate, and destroy for this path.
- Legacy profile compilation is either a frontend to canonical IR or explicitly isolated with a migration plan.
- The final review finds zero silent losses, blank cells, unowned facts, or unscoped universality claims.

## Milestone gates

| Gate | Checkpoints | Claim unlocked |
|---|---|---|
| UG1 — Claim gate | U0–U3 | The target population and meaning of preservation are fixed before results |
| UG2 — Representation gate | U4–U5 | Real source systems have total, replayable encodings |
| UG3 — Composition gate | U6–U10 | Compatible multi-provider deployments are constructively solvable and operable |
| UG4 — Extensibility gate | U11–U12 | Behavioral assets and third-party backends have public semantic contracts |
| UG5 — Cross-product gate | U13–U16 | Diverse backends compile and execute the preregistered source corpus |
| UG6 — Universality gate | U17–U18 | A scoped coverage claim is quantified and independently reproducible |

No later gate may be used to retroactively change U0’s population, U1’s equivalence, or U3’s corpus. A new claim
requires a new versioned campaign.
