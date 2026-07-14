# Organization IR implementation acceptance and proof specification

Status: normative for the experimental Organization IR work on `experiment/organization-ir-v2`.

This document is not a second product roadmap. `docs/ROADMAP.md` remains the canonical roadmap. This document
defines the acceptance criteria, formal obligations, evidence standards, and completeness accounting used to
open and close Organization IR implementation items.

## Objective

Open Autonomy must account for meaning from authored organization through deployment and observation:

```text
Profile + parameters
  -> Organization IR
  -> elaborated organization
  -> requirements
  -> Deployment IR + compatibility proof
  -> progressive lowering
  -> native artifacts and execution
  -> lifted portable events
  -> Organization State IR
  -> conformance result
```

The four durable authored or exchanged artifacts remain distinct:

1. Profile: a typed family of organizations.
2. Organization IR: target-independent organizational meaning.
3. Substrate component manifests: provider facets, interfaces, restrictions, and adapters.
4. Deployment IR: selected instances, bindings, authorities, configuration, and proof dispositions.

Normalized forms, control plans, execution plans, invocation plans, source maps, and proof objects are initially
compiler artifacts. They do not become required authored formats merely because the compiler exposes them for
inspection.

## Completeness contract

Completeness is always relative to a declared semantic domain. Open Autonomy does not claim to represent every
possible organization or prove arbitrary behavior of language models and external services.

Within the supported domain, every semantically relevant construct and proof obligation must have exactly one
visible disposition:

```text
preserved | adapter-realized | approximated | rejected | unknown
```

- `preserved`: a selected provider natively realizes the required observable semantics.
- `adapter-realized`: a declared adapter enforces or translates those semantics.
- `approximated`: the organization permits a precisely stated weakening.
- `rejected`: the requested realization is incompatible.
- `unknown`: evidence is insufficient; unknown never means supported.

No construct, requirement, effect, state class, trust boundary, or relevant observation may disappear silently.
The compiler must distinguish:

- **representational completeness**: every in-scope concept has a representation;
- **referential completeness**: every portable reference is resolved and correctly sorted;
- **operational completeness**: every required runtime responsibility has an owner;
- **proof completeness**: every obligation has a disposition and evidence class;
- **observational completeness**: every correctness-relevant effect is observable or recorded as a gap;
- **lowering completeness**: every source construct is preserved, adapted, approximated, rejected, or unknown.

## Review method

Every punch-list item must include this review card:

```text
Semantic claim:
Mathematical object:
Equivalence relation:
Laws and invariants:
Composition boundary:
Runtime owner:
Trust boundary:
Failure model:
Information retained and discarded:
Proof obligations created:
Proof obligations discharged:
Decidability boundary:
Engineering mechanism:
Evidence class:
Minimal falsifying counterexample:
Known assumptions and unknowns:
```

A formal lens is useful only when it terminates in a concrete engineering decision, a falsifiable property, or
an explicit limit. Terminology without an obligation or counterexample is not evidence.

## Evidence classes

Claims must record the strongest evidence actually obtained:

| Evidence | Establishes | Does not by itself establish |
|---|---|---|
| Type construction | Some invalid states are unrepresentable | Runtime behavior of external systems |
| Static proof/analysis | A property under stated model assumptions | That the model matches a provider |
| Model checking | A property over the explored finite transition system | Unbounded or omitted environmental behavior |
| Property test | Broad executable evidence for a law | A universal mathematical proof |
| Deterministic fixture | Exact behavior for represented cases | Live provider conformance |
| Fault-injection test | Behavior under tested failure schedules | All possible distributed executions |
| Conformance test | Provider behavior against a portable contract | Permanent behavior across future provider versions |
| Live observation | What occurred in the identified run | A universal guarantee |
| External attestation | A named external assertion | Independently verified truth unless stated |
| Runtime monitor | Whether observed traces violate a property | Unobserved behavior or future liveness |
| Assumption | A dependency made explicit | A discharged guarantee |
| Unknown | Honest absence of evidence | Permission to compile a required property |

Evidence must match the claim. A prompt is not an authorization boundary; a manifest assertion is not a live
conformance proof; a unit test is not a proof of arbitrary concurrent behavior.

## Cross-cutting lenses

Apply lenses in proportion to the construct. Each applicable lens must yield obligations or be explicitly marked
not applicable.

| Lens | Concrete question | Typical mechanism |
|---|---|---|
| Denotational/semantic | What observable meaning is independent of representation? | Semantic domains, equivalence and refinement |
| Type theoretic | Which invalid references, effects, and compositions can be rejected statically? | Sorted references, schemas, effect types |
| Algebraic | Which operations are associative, idempotent, commutative, or order-sensitive? | Laws and property tests |
| Graph theoretic | Which cycles, reachability failures, cuts, or unresolved edges exist? | SCC, reachability and dependency analysis |
| Transition/temporal | Which safety and liveness properties hold over executions? | LTS, temporal properties, model checking and monitors |
| Order/lattice | Does authority attenuate and does semantic loss move monotonically? | Partial orders, joins/meets and containment checks |
| Refinement | Does each lowering preserve required observations? | Pass witnesses and trace projection |
| Distributed systems | What happens under concurrency, duplication, delay, partition, and restart? | Fencing, idempotency, reconciliation and fault injection |
| Security/trust | Which principal and enforcement boundary protects each effect? | Capability checks, isolation and information flow |
| Epistemic | Is a statement observed, reported, inferred, assumed, or independently verified? | Provenance and evidence classes |
| Context engineering | Is necessary information assembled without contradiction or unsafe excess? | Typed context plans, precedence and retention tests |
| Control theoretic | Does a perpetual feedback loop converge or consume resources indefinitely? | Progress measures, bounds, hysteresis and loop monitors |
| Queueing/resource | Is demand feasible under capacity, fairness, latency, and budget constraints? | Admission control, bounds and solver constraints |
| Organizational | Are accountability, execution, delegation, review, and decision rights distinct? | Relational invariants and separation-of-duty checks |
| Database/provenance | Which facts are authoritative and reconstructible? | Event/state separation, transactions and source provenance |
| HCI | Can a person correlate, interrupt, approve, and understand the organization? | Interaction traces and usability scenarios |
| Operational/evolution | Can it restart, migrate, upgrade, and preserve continuity? | Recovery, migrations, version skew and rollback tests |
| Economic | Are cost and resource tradeoffs explicit and attributable? | Budgets, reservations and optimization objectives |
| Adversarial | How can ambiguity, replay, forgery, or authority laundering break the claim? | Threat models and negative tests |
| Interoperability | Should the concept adopt, embed, adapt, or extend an existing standard? | Mappings and round-trip/conformance tests |

Classical information theory is reserved for analyses that define probabilistic variables and quantities such as
entropy, mutual information, channel capacity, leakage, or rate-distortion. Context relevance, provenance, and
actor knowledge belong to context-engineering, information-flow, and epistemic lenses unless such a quantitative
model is actually supplied.

## Global engineering gate

Every checkpoint must:

- preserve all existing green tests;
- add positive, negative, and minimal-counterexample coverage;
- pass TypeScript and `git diff --check`;
- produce deterministic output and deterministically ordered diagnostics;
- document public behavior and unsupported cases;
- preserve source provenance where available;
- introduce no substrate-specific concept into Organization IR;
- make no compiler-internal IR a mandatory authored artifact;
- silently discard no unsupported semantic construct;
- state what is proved, tested, assumed, and unknown;
- land as a small independently reviewable commit.

Property-based tests are required where an item asserts an algebraic law over a meaningful generated domain.
Golden examples alone do not discharge algebraic claims.

## Punch list

### P1. Modules, imports, namespaces, and stable identity

**Semantic model.** A module exports a sorted signature of declarations. Resolution links a finite module graph
into a closed organization. Nominal identity, structural digest, and runtime instance identity are distinct types.

**Required laws.** For valid, nonconflicting modules and the defined composition operator:

```text
resolve(A + empty) ~= resolve(A)                         identity
resolve((A + B) + C) ~= resolve(A + (B + C))             associativity
resolve(A + B) ~= resolve(B + A)                         order independence where disjoint
resolve(alphaRename(A)) ~= resolve(A)                    alpha-equivalence
```

**Engineering ACs.**

- Resolve through an abstract loader; compiler core performs no direct filesystem or network access.
- Resolve relative URIs against the importing module URI, not the process working directory.
- Support explicit namespaces and reject duplicate, ambiguous, or escaping references.
- Detect missing modules, missing exports, wrong-sort references, and complete import cycles.
- Produce fully qualified logical identities independent of absolute machine paths.
- Preserve import-site and declaration-site provenance.
- Produce the same closed graph regardless of map or loader enumeration order.
- Leave no unresolved portable reference in a successful result.

**Evidence.** Typed fixtures, cycle and collision counterexamples, property tests for the stated composition laws,
and deterministic snapshots of the closed graph and provenance.

**Falsifier.** Two semantically identical module graphs normalize differently after namespace alpha-renaming or
input reordering, or a reference resolves to a declaration of the wrong sort.

### P2. Elaboration, normalization, and semantic hashing

**Semantic model.** Normalization is a semantics-preserving canonical projection `N` from authored organizations
to a closed compiler form.

**Required laws.**

```text
N(N(x)) = N(x)                                           idempotence
meaning(N(x)) = meaning(x)                               preservation
x ~= y implies N(x) = N(y) for declared equivalences    canonicality
```

**Engineering ACs.**

- Make defaults explicit, resolve references, expand reusable declarations, and canonicalize unordered maps.
- Explicitly define which sequences remain order-sensitive, especially instructions, transitions, and variants.
- Reject invalid input rather than return a partially valid normal form.
- Compute versioned semantic hashes unaffected by formatting, map order, timestamps, absolute paths, source maps,
  and documentation-only changes declared nonsemantic.
- Ensure every semantic change in the locked test corpus changes the appropriate digest.
- Include imported module semantics transitively while retaining durable nominal identities through content change.
- Preserve a many-to-many source map separately from semantic content.

**Evidence.** Property tests for idempotence and ordering invariance, mutation tests for semantic sensitivity, and
cross-process canonical serialization fixtures.

**Falsifier.** Re-normalization changes output, or a capability/policy/instruction change leaves the semantic hash
unchanged when that field is declared semantic.

### P3. Structured diagnostics, source maps, and compiler passes

**Semantic model.** A pass is a typed partial transformation that may return output, diagnostics, source-map
relations, preservation witnesses, and new obligations. It cannot mutate its input.

**Engineering ACs.**

- Give every diagnostic a stable code, severity, phase, message, optional source span, related locations, and fix.
- Serialize diagnostics independently of human rendering and sort them deterministically.
- Map diagnostics through imports, profile instantiation, generated declarations, and all implemented passes.
- Declare pass input/output levels and required analyses.
- Stop dependent passes after fatal failure while allowing independent analyses to report additional findings.
- Permit provider-owned passes through registration, without product-name branches in compiler core.
- Expose pass results for testing and inspection.

**Evidence.** Mutation tests proving input immutability; source-map round-trip fixtures; deterministic multi-error
fixtures; typed rejection of invalid pass order where practical.

**Falsifier.** The same input yields differently ordered diagnostics, or a lowered error cannot be traced to the
authored declaration that caused it.

### P4. Versioning and migration

**Semantic model.** A migration is an explicit version-indexed transformation with a stated preservation or loss
relation. Organization, profile, component manifest, deployment, and state schemas evolve independently.

**Engineering ACs.**

- Reject unsupported future versions and absent migration paths.
- Validate every result against the destination schema.
- Preserve provenance and emit a disposition for every removed or transformed semantic field.
- Require explicit authorization for lossy migration.
- Make migration planning deterministic and already-current migration a no-op.
- Retain enough reducer/compiler version metadata to replay historical traces.

**Evidence.** Golden fixtures for every supported edge, round-trip tests where reversibility is claimed, and a
counterexample proving unknown fields cannot disappear silently.

**Falsifier.** A migration succeeds after dropping a semantic field without a loss diagnostic.

### P5. Semantic envelopes for expressions, behavior, instructions, and context

**Semantic model.** Behaviors are typed computations with input, output, effects, and contextual requirements.
Instruction assembly is an ordered, provenance-preserving operation, not set union. Expressions declare a dialect;
only the portable core receives portable static meaning.

**Engineering ACs.**

- Separate behavior meaning from prompt rendering and model/runtime selection.
- Define typed behavior inputs, outputs, required effects, tools, memories, and context.
- Define instruction precedence, stable fragment identity, ordering, and conflict rejection.
- Represent expressions with language, source, result type, free variables/effects where known, and analyzability.
- Supply a deliberately small portable predicate core; embed CEL/Rego/JSON Logic/native dialects explicitly.
- Mark opaque expressions unknown for analyses that require their semantics.
- Produce an inspectable invocation plan later without making it canonical organizational meaning.
- Preserve instruction and context provenance through rendering.

**Evidence.** Type/effect mismatch counterexamples, deterministic assembly tests, precedence property tests, and
differential fixtures demonstrating that runtime renderers preserve the same fragment order and authority.

**Falsifier.** A behavior can invoke an undeclared effect, or a lower-precedence user fragment silently overrides a
higher-precedence organizational constraint.

### P6. Substrate component and adapter manifests

**Semantic model.** A component implements one or more facet algebras with operations and laws. A product may
implement multiple overlapping facets. Adapters are directional, typed, versioned components.

**Engineering ACs.**

- Describe provided and required facets, configuration schema, commands, observations, state ownership, interfaces,
  identities, delivery/consistency, topology, cardinality, isolation, trust, failure, recovery, capacity, and cost.
- Distinguish lowering, lifting, bridge, and enforcement adapters.
- Declare adapter preconditions, output obligations, semantic losses, and versions.
- Permit partial use of a multi-facet product such as Hermes.
- Reject overlapping authoritative owners without an explicit coherence protocol.
- Keep manifests external to Organization IR and keep organization-specific shims forbidden.
- Record whether each manifest claim is asserted, conformance-tested, live-observed, or unknown.

**Evidence.** Schema fixtures, composition counterexamples, adapter round trips, and initial manifests for Hermes,
Slack, a coding worker runtime, GitHub/local Git, and one durable work store.

**Falsifier.** Two providers both mutate authoritative work state and the deployment is accepted without a declared
synchronization and conflict-resolution mechanism.

### P7. Compatibility proof and constructive deployment solving

**Semantic model.** Compatibility asks for a globally coherent witness, not pointwise feature coverage:

```text
find d such that d satisfies requirements(o)
```

The witness accounts for provider selection, configuration, bindings, authority, adapters, assumptions, and loss.

**Engineering ACs.**

- Derive requirements from every semantic construct, not only manually listed feature flags.
- Produce a proof ledger containing requirements, witnesses, evidence classes, adapters, assumptions, losses, and
  unresolved obligations.
- Validate manually authored deployments before constructing deployments automatically.
- Resolve global composition properties including identity, ordering, authority, consistency, recovery, and trust.
- Generate candidates, propagate constraints, backtrack, and return minimal unsatisfied cores.
- Optimize preferences, cost, capacity, and latency only after mandatory semantics are satisfied.
- Never classify required `unknown` or unaccepted approximation as compatible.
- Store the selected realization and dispositions in Deployment IR without embedding the entire registry.

**Evidence.** Solver soundness fixtures, deliberately unsatisfiable cores, differential comparison with exhaustive
enumeration over small registries, and proof-ledger completeness checks.

**Falsifier.** Every requirement has some provider, yet the accepted composition violates a cross-provider invariant.

### P8. Progressive lowering and preservation

**Semantic model.** Deployment-aware internal passes lower organization semantics through control and execution
forms. Every pass establishes a refinement relation and accounts for semantic loss.

```text
organization + proven deployment
  -> control plan
  -> execution plan
  -> invocation plans and native artifacts
```

**Engineering ACs.**

- Define internal Control Plan, Execution Plan, and Invocation Plan only as demanded by real lowerings.
- Require a compatible deployment proof before emission of executable artifacts.
- Return output, source maps, preservation witnesses, new obligations, and losses from every pass.
- Support solver backtracking when a lowering alternative creates an unsatisfied obligation.
- Compose pass witnesses transitively and report any unaccounted source construct as an error.
- Keep prompt rendering, credentials, process isolation, endpoints, and provider configuration below Organization IR.
- Continue supporting `autonomy.ir.v1` as one bounded lowering target.

**Evidence.** Golden passes, source-to-target coverage checks, deliberately unsupported constructs, and metamorphic
tests across equivalent source organizations.

**Falsifier.** A source policy is absent from both emitted enforcement and the preservation/loss report.

### P9. Hermes autonomous-coding vertical slice

**Semantic model.** The slice is an architectural falsification experiment, not proof that Hermes is the universal
substrate. Hermes supplies only its declared facets in a composed deployment.

**Engineering ACs.**

- Maintain multiple unrelated durable work items across manager restarts.
- Correlate Slack channels/threads, portable conversations, questions, answers, and work without equating them.
- Distinguish asking about work, answering a blocked attempt, mutating work, and creating new work.
- Create, fence, recover, release, and reassign worker claims and attempts.
- Preserve organization, actor, session, work, attempt, and runtime identities as distinct values.
- Execute coding workers in declared isolation with scoped tools and credentials.
- Record artifacts, provenance, review, approvals, failures, retries, budgets, and user interventions.
- Restart without losing authoritative organizational continuity or duplicating acknowledged effects.
- Make every critical policy name its technical enforcement boundary.
- Record cost, latency, queue depth, and progress so runaway control loops are detectable.

**Evidence.** Deterministic integration fixtures plus live, identified traces for restart, duplicate delivery, delayed
answer, worker loss, reassignment, review rejection, and successful completion.

**Falsifier.** A Slack reply resumes the wrong task, or restarting the manager duplicates an already acknowledged
external effect.

### P10. Lifting, state materialization, and conformance

**Semantic model.** Native observations are lifted by component-owned adapters into a causally ordered portable
trace. State is a deterministic fold over accepted events, and conformance compares observed traces with required
organization semantics.

```text
state(T ++ U) = apply(state(T), U)                        prefix composition
```

**Engineering ACs.**

- Version portable event schemas and reducer semantics.
- Distinguish assertion, observation, inference, attestation, and verification.
- Define duplicate, reorder, concurrency, correction, and retraction behavior.
- Use causal order rather than assuming trustworthy wall-clock total order.
- Lift provider observations without allowing native events to acquire guessed portable meaning.
- Rebuild materialized state from the accepted event history.
- Check lifecycle, authority, evidence, budget, protocol, and safety properties over traces.
- Report observability gaps and unverified liveness assumptions.
- Preserve historical replay across supported schema and reducer migrations.

**Evidence.** Reducer algebra property tests, native-to-portable adapter conformance suites, differential replay,
corrupted/forged event fixtures, and crash/recovery fault injection.

**Falsifier.** Replaying the same accepted causal history under the same versions produces a different portable state.

### P11. Second dissimilar substrate

**Semantic model.** Substrate independence is supported only if the same compatible organizational meaning can be
realized by structurally different provider compositions.

**Engineering ACs.**

- Select a control/work provider unlike the Hermes-centered composition, plus separate interaction and worker
  execution providers where possible.
- Compile the same organization without editing its target-independent semantics.
- Permit only deployment configuration and explicitly parameterized organizational specialization to differ.
- Compare projected portable traces, dispositions, assumptions, losses, cost, and failure behavior.
- Reject any construct whose apparent portability depended on a Hermes-specific concept.

**Evidence.** Differential conformance corpus across both deployments and a residual report for every behavioral
difference.

**Falsifier.** Supporting the second system requires adding its product-specific state or command vocabulary to
Organization IR.

### P12. Deeper analyses and ecosystem mappings

**Semantic model.** Analyses consume explicit semantics and return proofs, counterexamples, assumptions, or unknown;
external formats are frontends/backends, not replacements for organizational meaning unless their domains coincide.

**Engineering ACs.**

- Add lifecycle reachability, dead-state/deadlock, capability attenuation, least authority, separation of duty,
  protocol compatibility, information flow, budget bounds, retry amplification, and control-loop progress analyses.
- State finite bounds and fairness/environment assumptions for temporal results.
- Prefer counterexample traces over bare failure messages.
- Adopt existing standards where meanings match; embed narrower standards; adapt different representations; invent
  only missing organizational semantics.
- Implement mappings for selected Oracle Agent Spec, MCP, A2A, CloudEvents/OpenTelemetry, workflow, policy, and
  provider formats only with explicit round-trip or loss reports.

**Evidence.** Model-checking corpora, property tests, known counterexamples, standard conformance fixtures, and
round-trip preservation reports.

**Falsifier.** An analysis reports a property as proved while relying on an opaque expression or unstated fairness
assumption.

## Foundation completion gate

P1-P4 are complete only when one repeatable scenario can:

1. Load and validate a parameterized profile.
2. Instantiate it without substrate access.
3. Resolve a multi-file, namespaced organization through an abstract loader.
4. Elaborate it into a closed canonical form with fully qualified identities.
5. Emit complete source maps, structured diagnostics, and a versioned semantic hash.
6. Demonstrate normalization idempotence and declared module-composition laws over generated cases.
7. Project a deliberately invalid variant back to precise authored source locations.
8. Validate a manually authored composed deployment.
9. Lower the valid organization to the existing v1 target.
10. Repeat with byte-identical canonical output, hash, diagnostics, compatibility result, and lowered output.

## Vertical-slice completion gate

P5-P10 are complete only when one target-independent autonomous coding organization can be deployed through a
Hermes-centered composition, managed through Slack, executed by multiple coding workers, restarted under injected
failures, and reconstructed from lifted portable events with no undisposed required obligation.

Passing the happy path is insufficient. The evidence corpus must include duplicate and reordered messages, manager
restart, worker loss, claim expiry and fencing, delayed human response, review rejection, exhausted retry/budget,
forged or unverifiable evidence, and an explicitly unsupported configuration.

## Obligation ledger

The compiler should eventually emit this ledger. Until then, each implementation checkpoint records it in tests or
design notes.

| Field | Meaning |
|---|---|
| Obligation ID | Stable machine-readable identifier |
| Claim | Falsifiable property being asserted |
| Origin | Organization/source construct creating it |
| Owner | Compiler pass, component, adapter, operator, or external environment responsible |
| Assumptions | Conditions under which evidence applies |
| Evidence | Type/proof/test/conformance/observation/attestation/assumption/unknown |
| Disposition | Preserved, adapter-realized, approximated, rejected, or unknown |
| Source map | Authored location and related declarations |
| Counterexample | Trace or configuration that would falsify the claim |

A checkpoint cannot close while a required obligation is absent from this accounting. A deployment cannot compile
while a required obligation is rejected, impermissibly approximated, or unknown under its declared loss and
assumption policy.

## Definition of done

The Organization IR architecture is not complete merely when it supports many systems. It reaches its intended
standard when, over its declared semantic domain:

- authored meaning has a precise and compositional representation;
- valid source transformations obey their stated laws;
- every deployment responsibility has an authoritative owner and enforcement boundary;
- every lowering step carries preservation evidence or explicit loss;
- every correctness-relevant runtime effect is observable or identified as an observability gap;
- every guarantee says whether it is proved, tested, attested, assumed, or unknown;
- two materially dissimilar substrate compositions realize the same compatible organization without target-specific
  changes to Organization IR;
- minimal counterexamples are first-class outputs rather than hidden test failures.

The strongest honest claim is **disposition-completeness**, not universal formal completeness: nothing within the
declared domain disappears between what the organization means, what the deployment promises, what the compiler
emits, and what execution demonstrates.
