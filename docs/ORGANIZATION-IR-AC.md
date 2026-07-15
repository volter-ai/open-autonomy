# Organization IR implementation acceptance and proof specification

Status: normative for the experimental Organization IR work on `experiment/organization-ir-v2`.

The required lenses are instantiated into concrete obligations, evidence, limits, and falsifiers in
[`ORGANIZATION-IR-LENS-AUDIT.md`](./ORGANIZATION-IR-LENS-AUDIT.md). A checkpoint cannot close by citing the lens
names below without satisfying that audit.

This document is not a second product roadmap. `docs/ROADMAP.md` remains the canonical roadmap. This document
defines the acceptance criteria, formal obligations, evidence standards, and completeness accounting used to
open and close Organization IR implementation items.

The criteria below create obligations; they do not discharge them. A law written here has assurance status
`unknown` until its checkpoint records appropriate evidence. Implementations must not cite this specification itself
as proof that an implementation satisfies it.

## Objective

Open Autonomy must account for meaning from authored organization through deployment and observation:

```text
Profile + parameters
  -> Organization IR
  -> elaborated organization
  -> requirements
  -> Deployment IR + compatibility assurance report
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
4. Deployment IR: selected instances, bindings, authorities, configuration, and semantic dispositions.

Normalized forms, control plans, execution plans, invocation plans, source maps, and assurance certificates are initially
compiler artifacts. They do not become required authored formats merely because the compiler exposes them for
inspection.

## Completeness contract

Completeness is always relative to a declared semantic domain. Open Autonomy does not claim to represent every
possible organization or prove arbitrary behavior of language models and external services.

The supported semantic domain itself must be enumerated in a versioned **semantic coverage ledger**. Each source
construct and field records its denotation, applicable invariants, requirements it induces, observable effects,
extension behavior, and whether it is portable, dialect-bound, or unsupported. Otherwise “complete within the
supported domain” is circular: the implementation could silently narrow the domain to what it happens to handle.

Two orthogonal classifications are required. Constructs that contain several independently realizable properties
must first be decomposed into atomic semantic obligations. Every atomic obligation has exactly one **semantic
disposition**:

```text
preserved | adapter-realized | approximated | rejected | unresolved
```

- `preserved`: a selected provider natively realizes the required observable semantics.
- `adapter-realized`: a declared adapter enforces or translates those semantics.
- `approximated`: the organization permits a precisely stated weakening.
- `rejected`: the requested realization is incompatible.
- `unresolved`: no sound disposition has yet been established; unresolved never means supported.

Separately, every claim made in support of that disposition has exactly one **assurance status**:

```text
proved | statically-checked | model-checked | property-tested | conformance-tested
| live-observed | externally-attested | assumed | unknown
```

One claim has one current assurance classification but may retain multiple evidence records and their provenance.
These axes must not be conflated. A construct may be `preserved` according to a component manifest while the
provider claim remains merely `externally-attested` or `unknown`. An adapter can preserve semantics, but its
preservation claim may only have fixture-level evidence. `Unknown` describes evidence, not what transformation
happened to a source construct.

No construct, requirement, effect, state class, trust boundary, or relevant observation may disappear silently.
The compiler must distinguish:

- **domain completeness**: the supported, extension, and rejected semantic domains are enumerated rather than inferred
  from implemented code;
- **representational completeness**: every in-scope concept has a representation;
- **referential completeness**: every portable reference is resolved and correctly sorted;
- **constraint consistency**: no accepted organization or deployment contains jointly unsatisfiable mandatory
  obligations within the analyzed domain;
- **operational completeness**: every required runtime responsibility has an owner;
- **proof-accounting completeness**: every obligation has a semantic disposition and assurance status;
- **observational completeness**: every correctness-relevant effect is observable or recorded as a gap;
- **lowering completeness**: every atomic source obligation is preserved, adapter-realized, approximated, rejected,
  or unresolved.

These properties are checked independently. For example, a document may be referentially complete but internally
inconsistent, or lowering-complete while relying on assurance claims that deployment policy does not accept.

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

“Proof” in compiler APIs means a checkable certificate over a stated formal model. Results supported only by tests,
attestations, or assumptions must be named compatibility or assurance reports, not proofs. The report may contain
proved obligations alongside weaker ones.

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
| Compiler | Can the representation be transformed compositionally without hidden target knowledge? | Typed passes, diagnostics, source maps and coverage checks |
| Constraint solving | Are obligations jointly satisfiable, and can failure be explained minimally? | SMT/CSP/search, validation and unsatisfied cores |
| Formal verification | Which claims are decidable or checkable under an explicit model? | Certificates, model checking, property tests and counterexamples |

Classical information theory is reserved for analyses that define probabilistic variables and quantities such as
entropy, mutual information, channel capacity, leakage, or rate-distortion. Context relevance, provenance, and
actor knowledge belong to context-engineering, information-flow, and epistemic lenses unless such a quantitative
model is actually supplied.

### Required lens coverage

The following is minimum coverage, not a claim that other lenses are irrelevant. A checkpoint review must include
each marked lens or explicitly justify non-applicability for a particular sub-item.

| Item | Required lenses |
|---|---|
| B0 existing implementation audit | Semantic, type, algebraic, distributed, security, provenance, refinement |
| P1 modules and identity | Semantic, type, algebraic, graph, security, provenance, evolution, adversarial |
| P2 normalization and hashing | Semantic, algebraic, compiler, provenance, adversarial |
| P3 diagnostics and passes | Type, compiler, provenance, operational, adversarial |
| P4 versions and migrations | Semantic, refinement, provenance, operational/evolution |
| P5 behavior and context | Semantic, type/effect, epistemic, context, security, organizational, adversarial |
| P6 component manifests | Distributed, security/trust, operational, economic, interoperability, adversarial |
| P7 compatibility and solving | Constraint solving, refinement, distributed, security, economic, epistemic |
| P8 lowering | Semantic, refinement, compiler, security, provenance |
| P9 Hermes slice | Distributed, control, queueing, HCI, security, operational, economic, adversarial |
| P10 events and conformance | Algebraic, temporal, distributed, epistemic, database/provenance, security |
| P11 second substrate | Semantic, refinement, interoperability, operational, economic |
| P12 formal analyses | Type theoretic, graph theoretic, transition/temporal, order/lattice, control theoretic, queueing/resource, formal verification |
| P13 ecosystem mappings | Semantic, refinement, interoperability, evolution, adversarial |

## Global engineering gate

Every checkpoint must:

- preserve all existing green tests;
- add positive, negative, and minimal-counterexample coverage;
- pass TypeScript and `git diff --check`;
- produce deterministic output and deterministically ordered diagnostics;
- document public behavior and unsupported cases;
- preserve source provenance where available;
- update the semantic coverage and obligation ledgers for every affected construct;
- introduce no substrate-specific concept into Organization IR;
- make no compiler-internal IR a mandatory authored artifact;
- never silently discard an unsupported semantic construct;
- state what is proved, tested, assumed, and unknown;
- land as a small independently reviewable commit.

Property-based tests are required where an item asserts an algebraic law over a meaningful generated domain.
Golden examples alone do not discharge algebraic claims.

## Punch list

### B0. Audit the existing experimental implementation

The profile instantiator, Organization IR validator, deployment checker, v1 lowerer, and state reducer predate this
acceptance specification. Their existence is not evidence that the corresponding obligations are discharged.

**Engineering ACs.**

- Inventory every current Organization IR, profile, component, deployment, and state field in the semantic coverage
  ledger; mark absent semantics, validation, lowering, and observation explicitly.
- Classify every existing compatibility claim on both the semantic-disposition and assurance axes.
- Test current profile parameter/variant ordering, null/default behavior, patch conflicts, and substrate separation.
- Test current requirement derivation for coverage gaps rather than assuming every typed field induces a requirement.
- Test the reducer against duplicate delivery, invalid subjects, causal gaps, time ordering, partial failure, and
  continuation from a base state; record where its sequential model is intentionally provisional.
- Replace any documentation claim that exceeds the actual evidence with a scoped claim or open obligation.
- Produce a prioritized residual list; B0 closes only when every residual is assigned to a later punch-list item or
  rejected as out of scope.

**Evidence.** Field-to-semantics inventory, negative tests, obligation ledger, and residual ownership table.

**Falsifier.** A currently accepted field, deployment, or event has no semantic disposition, assurance status, or
assigned residual.

**Implementation record.** `packages/core/src/organization-coverage.ts` is the machine-readable coverage,
baseline-obligation, and residual registry. Its test parses all exported experimental interfaces and fails when a
field lacks an entry, when a formal B0 audit ID lacks an obligation, or when an unresolved obligation has no P1-P13
owner. This closes B0 accounting without claiming that forward-assigned residuals are already implemented.

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
- Require resolver policy for allowed schemes, integrity/digest verification where reproducibility is claimed, and
  bounded graph depth/size; mutable imports without a lock or digest cannot contribute to reproducible compilation.
- Support explicit namespaces and reject duplicate, ambiguous, or escaping references.
- Detect missing modules, missing exports, wrong-sort references, and complete import cycles.
- Produce fully qualified logical identities from canonical module identity, never the local namespace alias or an
  absolute machine path; alpha-renaming an alias therefore preserves both meaning and normalized identity.
- Preserve import-site and declaration-site provenance.
- Produce the same closed graph regardless of map or loader enumeration order.
- Leave no unresolved portable reference in a successful result.

**Evidence.** Typed fixtures, cycle and collision counterexamples, property tests for the stated composition laws,
and deterministic snapshots of the closed graph and provenance.

**Falsifier.** Two semantically identical module graphs normalize differently after namespace alpha-renaming or
input reordering, or a reference resolves to a declaration of the wrong sort.

**Implementation record.** `organization-modules.ts` resolves a bounded graph through an abstract loader, separates
canonical module ID from retrieval location and digest, enforces scheme/integrity policy and named-symbol visibility,
and produces closed sort-checked reference edges with use-site and declaration-site provenance. Generated disjoint
import signatures exercise identity, associativity, and order independence; aliases do not enter qualified identity.
The P1 obligation ledger is machine-matched to every P1 row in the formal-lens audit.

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
- Ensure every semantic change in the locked test corpus changes the appropriate digest. This is cryptographic
  collision evidence, not a mathematical proof that collisions are impossible.
- Include imported module semantics transitively while retaining durable nominal identities through content change.
- Preserve a many-to-many source map separately from semantic content.

**Evidence.** Per-rule preservation arguments, property tests for idempotence and ordering invariance, mutation tests
for semantic sensitivity, and cross-process canonical serialization fixtures. Until preservation is derived from a
defined denotational semantics or checkable certificate, it remains tested/assumed rather than proved.

**Falsifier.** Re-normalization changes output, or a capability/policy/instruction change leaves the semantic hash
unchanged when that field is declared semantic.

**Implementation record.** `organization-normalize.ts` produces a closed internal normal form with canonical
qualified references, explicit empty defaults, canonical module ordering, separate many-to-many source maps, and a
domain/version-framed semantic digest. Imports and retrieval locations are absent from semantic payload; annotation
documentation/provenance are excluded only at known annotation locations, while labels, extensions, and opaque
behavior content remain semantic. All eight P2 lens obligations are machine-matched to evidence.

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

**Implementation record.** `organization-compiler.ts` provides immutable typed passes, explicit levels and
dependencies, independent analyses, deterministic structured diagnostics, bounded/redacted rendering, provider pass
registration, obligation receipts, and composable many-to-many source relations. Real profile instantiation, module
resolution, and normalization adapters emit stable codes at authored paths. Every P3 audit obligation is
machine-matched to named evidence.

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
- Implement the migration framework now, but add schema-specific migrations only when a real version edge exists;
  speculative migrations before semantics stabilize are not required.

**Evidence.** Golden fixtures for every supported edge, round-trip tests where reversibility is claimed, and a
counterexample proving unknown fields cannot disappear silently.

**Falsifier.** A migration succeeds after dropping a semantic field without a loss diagnostic.

**Implementation record.** `organization-migrate.ts` supplies independent artifact-family version graphs,
deterministic shortest planning, immutable atomic document steps, destination validation, per-field dispositions,
unaccounted-removal rejection, explicit lossy authorization, provenance composition, and complete replay-version
pins. No speculative production schema edge is registered; synthetic edges test the framework and round-trip claims.
All six P4 obligations are machine-matched to evidence.

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

**Implementation record (2026-07-14).** P5 defines a dialect-tagged expression envelope and bounded portable
predicate AST; external/native dialects remain explicitly opaque. Composed behavior contracts account for typed
inputs, outputs, tools, memories, context, and direct or tool-induced effects, with substitution and actor-authority
checks. Instruction assembly has stable derived identities, explicit layer precedence, deterministic ordering, and
declared conflict handling. Context planning is deterministic over explicit token estimates and preserves trust,
evidence class, and provenance. The resulting invocation plan is inspectable but noncanonical: actor identity,
behavior, runtime implementation, prompt material, contextual evidence, and capability authority remain separate.
The machine-matched P5 ledger and counterexamples live in `organization-coverage.test.ts`,
`organization-expression.test.ts`, and `organization-behavior.test.ts`.

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

**Evidence.** Schema fixtures, composition counterexamples, preservation/loss conformance tests (and round trips only
where reversibility is claimed), and initial manifests for Hermes,
Slack, a coding worker runtime, GitHub/local Git, and one durable work store.

**Falsifier.** Two providers both mutate authoritative work state and the deployment is accepted without a declared
synchronization and conflict-resolution mechanism.

**Implementation record (2026-07-14).** P6 introduces external `autonomy.component.v2` manifests for partial
multi-facet products and directional `autonomy.adapter.v1` contracts. State contracts never infer favorable
distributed semantics: authority, consistency, delivery, ordering, idempotency, recovery, and identity each admit
explicit `unknown`. Interfaces bind versioned commands and observations; manifests also cover configuration,
topology/cardinality, isolation/trust and credential flow, health/failure/upgrade/rollback, capacity, cost, evidence
class, content digests, and origin signatures. Composition rejects overlapping authoritative state owners unless a
named coherence protocol covers all owners. Adapters separately account for identity, causality, retries, conflicts,
pre/postconditions, loss, direction, and reversibility. The initial catalog models Hermes, Slack, a coding-worker
runtime, Git, and a durable work store; claims without adequate evidence remain unknown or asserted rather than
silently promoted. Machine-matched obligations and adversarial fixtures live in `organization-coverage.test.ts` and
`organization-component.test.ts`.

### P7. Compatibility assurance and constructive deployment solving

**Semantic model.** Compatibility asks for a globally coherent witness, not pointwise feature coverage:

```text
find d such that d satisfies requirements(o)
```

The report accounts for provider selection, configuration, bindings, authority, adapters, assumptions, loss, and
the assurance status of each supporting claim. It becomes a proof only for the subset discharged by checkable
certificates under explicit assumptions.

**Engineering ACs.**

- Derive requirements from every semantic construct, not only manually listed feature flags.
- Produce an obligation ledger containing requirements, witnesses, evidence classes, adapters, assumptions, losses, and
  unresolved obligations.
- Validate manually authored deployments before constructing deployments automatically.
- Resolve global composition properties including identity, ordering, authority, consistency, recovery, and trust.
- Generate candidates, propagate constraints, backtrack, and return minimal unsatisfied cores.
- Be sound over every supported constraint: every emitted candidate revalidates independently. State solver
  completeness only for a declared finite fragment; heuristically bounded searches must report incompleteness or
  exhaustion rather than `incompatible`.
- Optimize preferences, cost, capacity, and latency only after mandatory semantics are satisfied.
- Apply an explicit assurance policy that sets the minimum acceptable assurance by obligation/risk class and records
  who accepted each assumption, for what scope, and until what version or expiry.
- Never classify a required unresolved disposition, unknown assurance claim disallowed by policy, or unaccepted
  approximation as executable-compatible.
- Store the selected realization and dispositions in Deployment IR without embedding the entire registry.

**Evidence.** Solver soundness fixtures, deliberately unsatisfiable cores, differential comparison with exhaustive
enumeration over small registries, and obligation-ledger completeness checks.

**Falsifier.** Every requirement has some provider, yet the accepted composition violates a cross-provider invariant.

**Implementation record (2026-07-14).** P7 derives stable atomic obligations from every present semantic leaf and
adds durable-identity obligations, then records one provider/interface/evidence witness, explicit assumption, loss,
or unresolved disposition for each. Manually authored compositions and generated candidates pass the same independent
validator. The finite solver enumerates facet assignments with deterministic tie breaking and lexicographically
optimizes only compatible candidates across approximation, assumptions, preferences, economic uncertainty, cost,
latency, capacity, and provider count. Bounded search exhaustion is never reported as incompatibility. Incompatibility
requires a classified atomic witness core; if exhaustive search cannot derive a valid core for a global contradiction,
the honest result is `undetermined`. High-risk witnesses require an evidenced enforcing principal/trust zone, state
witnesses jointly check authority, consistency, ordering, recovery, and identity, and asserted evidence is unusable
without an identified scoped acceptance. Evidence is in `organization-solver.test.ts` and the machine-matched P7
ledger in `organization-coverage.test.ts`.

### P8. Progressive lowering and preservation

**Semantic model.** Deployment-aware internal passes lower organization semantics through control and execution
forms. Semantics are assumption/guarantee contracts over declared observations, not only sets of allowed traces:
trace inclusion alone can preserve safety while losing a required liveness behavior. Every pass must preserve the
source guarantees under its stated environmental assumptions, or identify an explicit contract weakening.

```text
organization + provisionally compatible deployment
  -> control plan
  -> execution plan
  -> invocation plans and native artifacts
```

**Engineering ACs.**

- Define internal Control Plan, Execution Plan, and Invocation Plan only as demanded by real lowerings.
- Require a provisionally compatible deployment candidate before feasibility lowering; allow lowering to return new
  obligations and force solver backtracking. Emit executable artifacts only after the final obligation set closes
  under deployment policy.
- Return output, source maps, preservation witnesses, new obligations, and losses from every pass.
- Support solver backtracking when a lowering alternative creates an unsatisfied obligation.
- Compose pass certificates transitively only where their assumptions and observation projections align; report any
  unaccounted source obligation as an error.
- Keep prompt rendering, credentials, process isolation, endpoints, and provider configuration below Organization IR.
- Continue supporting `autonomy.ir.v1` as one bounded lowering target.

**Evidence.** Golden passes, source-to-target coverage checks, deliberately unsupported constructs, and metamorphic
tests across equivalent source organizations.

**Falsifier.** A source policy is absent from both emitted enforcement and the preservation/loss report.

**Implementation record (2026-07-14).** P8 adds deployment-aware `autonomy.control.v1` and
`autonomy.execution.v1` internal forms. Each level declares assumptions, guarantees, required-progress obligations,
and versioned observations. Every pass returns output, many-to-many source relations, a conditional preservation
certificate, newly induced obligations, losses, and errors. Certificates compose only when levels, intermediate
assumptions, and observation projections align. Execution lowering introduces explicit isolation and credential-scope
obligations, revalidates them against the deployment, and backtracks across candidates; native emission is impossible
until this fixed point closes. Runtime endpoints, credentials, isolation, renderers, and provider configuration enter
only in Execution IR. A bounded mechanical Execution IR to `autonomy.ir.v1` pass replaces handwritten projection for
its supported subset and rejects unsupported multiplicity or activations. Machine-matched evidence and adversarial
fixtures live in `organization-lowering.test.ts` and `organization-coverage.test.ts`.

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

**Implementation record (2026-07-14).** P9 supplies a pure, snapshot-complete Hermes-centered controller with
durable work, conversations, claims, attempts, effects, approvals, metrics, and external-event deduplication. Its
strict Slack grammar distinguishes new work, status questions, blocked-question answers, mutations, controller
commands, and ambiguity while preserving channel/thread/work identities. Worker and reviewer queues reserve separate
capacity; least-dispatched FIFO ordering, claim TTLs, monotonically increasing fences, retry/cost/progress bounds, and
stable escalation prevent duplicate ownership and unbounded loops. Verified evidence and independent review gate
completion. Repository writes require single-use, scoped, expiring, artifact-bound approval. Hermes effects render as
shell-free argument vectors and require post-state verification because live testing found that refused Hermes CLI
mutations may still exit zero. The isolated real board `oa-p9-proof-20260714` demonstrated idempotent creation of two
unrelated tasks, independent-process restart visibility, heartbeat, stale-run refusal, reclaim/reassignment, typed
needs-input blocking, delayed-answer correlation, new attempts, and completion on pinned Hermes `226e8de8`; exact IDs
and honest failed probes are recorded in `docs/evidence/P9-HERMES-LIVE-TRACE.md`. External Slack credentials were not
used; signed-envelope HCI/security behavior is deterministically exercised in `organization-hermes-controller.test.ts`.

### P10. Lifting, state materialization, and conformance

**Semantic model.** Native observations are lifted by component-owned adapters into a portable causal event graph.
A materializer may consume a canonical linearization only after proving that concurrent independent events commute,
or applying an explicit deterministic conflict policy. Conformance compares the accepted history with required
organization semantics.

```text
state(T ++ U) = apply(state(T), U)                        prefix composition
```

For two causally independent events `a` and `b` that touch commuting state, the materializer must additionally show:

```text
apply(apply(s, a), b) = apply(apply(s, b), a)             topological-order invariance
```

If they do not commute, the event contract must provide arbitration, rejection, or an authoritative order; wall-clock
timestamps alone are insufficient.

**Engineering ACs.**

- Version portable event schemas and reducer semantics.
- Distinguish assertion, observation, inference, attestation, and verification.
- Define duplicate, reorder, concurrency, correction, and retraction behavior.
- Use causal order rather than assuming trustworthy wall-clock total order; validate actor/subject identity,
  authorization, event integrity, and provenance independently of causal well-formedness.
- Lift provider observations without allowing native events to acquire guessed portable meaning.
- Rebuild materialized state from the accepted event history.
- Check lifecycle, authority, evidence, budget, protocol, and safety properties over traces.
- Report observability gaps and unverified liveness assumptions.
- Preserve historical replay across supported schema and reducer migrations.

**Evidence.** Reducer algebra property tests, native-to-portable adapter conformance suites, differential replay,
corrupted/forged event fixtures, and crash/recovery fault injection.

**Falsifier.** Replaying the same accepted causal history under the same versions produces a different portable state.

**Implementation record (2026-07-14).** P10 introduces authenticated `autonomy.event.v2` envelopes and a
version-pinned accepted causal history. Acceptance independently checks identity, content digest, issuer/event
authority, subject binding, authentication, provenance, replay, resource bounds, parent closure, and cycles. Event
contracts declare subject-aware read/write sets and require concurrency to commute, reject, or use explicit ID or
authority arbitration; wall clocks never create causal order. Exact duplicates are idempotent, missing-parent events
remain partition-pending, and immutable correction/retraction events causally supersede active history. Exact-version
component adapters either lift with native provenance or return an observability gap—unknown native events never gain
guessed meaning. Materialization rebuilds state from the active canonical history in causal mode and differential
tests prove prefix composition, topological-order invariance, and serialized replay equality. Conformance separately
reports lifecycle, authority, evidence, budget, protocol, safety, observability gaps, and liveness assumptions.
Clock-explicit bounded temporal monitors return counterexamples or finite-prefix `unknown`, never infer unbounded
liveness from silence. Evidence lives in `organization-causal-state.test.ts` and the P10 machine ledger.

### P11. Second dissimilar substrate

**Semantic model.** Substrate independence is supported only if the same compatible organizational meaning can be
realized by structurally different provider compositions.

**Engineering ACs.**

- Select a control/work provider unlike the Hermes-centered composition, plus separate interaction and worker
  execution providers where possible.
- Compile byte-identical canonical semantic payload and semantic digest without editing or specializing its
  target-independent semantics; source maps and nonsemantic provenance need not be byte-identical.
- Permit deployment configuration to differ. A separately reported profile-specialization experiment may test a
  broader family, but it does not count as the substrate-independence proof for the same organization.
- Compare projected portable traces, dispositions, assumptions, losses, cost, and failure behavior.
- Reject any construct whose apparent portability depended on a Hermes-specific concept.

**Evidence.** Differential conformance corpus across both deployments and a residual report for every behavioral
difference.

**Falsifier.** Supporting the second system requires adding its product-specific state or command vocabulary to
Organization IR.

**Implementation record.** P11 uses a pinned Paperclip control/work component with a separate worker, contrasted
against a dissimilar controller composition. `compareSubstrateRealizations` requires byte-identical normalized
semantics and digest, equal atomic obligation identities, independently conforming causal traces, and equal portable
state projections. Operational assumptions, declared losses, matched faults, four unit-bearing economic dimensions,
source revisions, and trace assurance are exhaustively classified as residuals. Semantic specialization, provider
vocabulary leakage, divergent portable state, unresolved obligations, and nonconformance are negative fixtures.
Evidence and scope limits are recorded in `docs/evidence/P11-PAPERCLIP-PROOF.md`.

### P12. Deeper formal analyses

**Semantic model.** Analyses consume explicit semantics and return checkable results, counterexamples, assumptions,
or unknown.

**Engineering ACs.**

- Add lifecycle reachability, dead-state/deadlock, capability attenuation, least authority, separation of duty,
  protocol compatibility, information flow, budget bounds, retry amplification, and control-loop progress analyses.
- State finite bounds and fairness/environment assumptions for temporal results.
- Prefer counterexample traces over bare failure messages.

**Evidence.** Model-checking corpora, property tests, known counterexamples, and independently checked result
certificates where available.

**Falsifier.** An analysis reports a property as proved while relying on an opaque expression or unstated fairness
assumption.

**Implementation record.** P12 supplies ten finite analyses: lifecycle reachability, dead-state/deadlock,
capability attenuation, least authority, separation of duty, protocol compatibility, information flow, budget and
capacity bounds, retry amplification, and control-loop progress. Every result declares its soundness domain, finite
bounds, fairness/environment assumptions, assurance class, and counterexamples. Open-world relations and exhausted
bounds return `unknown`. Certificates bind the complete analysis model and result and have a tamper negative test.

### P13. Ecosystem mappings

**Semantic model.** External formats are frontends, backends, or embedded dialects—not replacements for
organizational meaning unless their semantic domains coincide.

**Engineering ACs.**

- Adopt existing standards where meanings match; embed narrower standards; adapt different representations; invent
  only missing organizational semantics.
- Define the supported semantic subset and version for every mapping.
- Implement selected Oracle Agent Spec, MCP, A2A, CloudEvents/OpenTelemetry, workflow, policy, and provider mappings
  only with per-construct dispositions and explicit round-trip or loss reports.
- Preserve unknown extensions when safe or reject them; never silently erase them during round trip.
- Separate wire-protocol interoperability from semantic equivalence.

**Evidence.** Standard conformance fixtures, versioned interoperability matrices, round-trip tests where equivalence
is claimed, and loss fixtures where it is not.

**Falsifier.** A successful import/export silently drops a construct in the mapping's declared supported subset.

## Foundation completion gate

P1-P4 are complete only when B0 is complete and one repeatable scenario can:

1. Load and validate a parameterized profile.
2. Instantiate it without substrate access.
3. Resolve a multi-file, namespaced organization through an abstract loader.
4. Elaborate it into a closed canonical form with fully qualified identities.
5. Emit complete source maps, structured diagnostics, and a versioned semantic hash.
6. Demonstrate normalization idempotence and declared module-composition laws over generated cases.
7. Project a deliberately invalid variant back to precise authored source locations.
8. Migrate a real supported schema-version fixture or, until such an edge exists, prove deterministic rejection of
   unsupported versions and no-op handling of the current version.
9. Repeat with byte-identical canonical output, hash, and diagnostics.

Validation against the existing manually authored deployment and v1 lowerer remains a required nonregression test,
but does not gate the semantic completion of P1-P4 on the future P6-P8 architecture.

## Vertical-slice completion gate

P5-P10 are complete only when one target-independent autonomous coding organization can be deployed through a
Hermes-centered composition, managed through Slack, executed by multiple coding workers, restarted under injected
failures, and reconstructed from lifted portable events with no unresolved required obligation and every assurance
claim satisfying the declared deployment policy.

Passing the happy path is insufficient. The evidence corpus must include duplicate and reordered messages, manager
restart, worker loss, claim expiry and fencing, delayed human response, review rejection, exhausted retry/budget,
forged or unverifiable evidence, and an explicitly unsupported configuration.

## Semantic coverage ledger

The coverage ledger prevents scope from being defined retrospectively by whatever the compiler happens to support.
It is versioned with the semantic model and has one row for every public construct or field, including extension
points. Rows may share a denotation, but none may be omitted.

| Field | Meaning |
|---|---|
| Schema/version/path | Stable location of the construct in its owning artifact |
| Domain status | Portable, dialect-bound, extension, deprecated, or rejected |
| Denotation | The state, relation, computation, contract, or observation represented |
| Identity/equivalence | Whether identity is nominal/structural/runtime and which changes preserve meaning |
| Static invariants | Type, reference, graph, and local consistency rules |
| Induced obligations | Requirements the construct creates for analysis, deployment, lowering, and observation |
| Composition rule | How the construct combines and whether order/conflict matters |
| Lowering coverage | Passes or adapters responsible, or an assigned residual |
| Observation coverage | Portable events/evidence that demonstrate relevant effects, or an explicit gap |
| Security/trust owner | Principal and enforcement boundary for sensitive effects |
| Evolution rule | Defaulting, migration, extension, and unknown-field behavior |
| Evidence/residual | Tests, analysis, open obligation, or declared unsupported case |

The ledger describes language coverage; it does not assert that a particular deployment preserves a construct. That
claim belongs in the per-organization obligation ledger and receives its own semantic disposition and assurance
status.

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
| Semantic disposition | Preserved, adapter-realized, approximated, rejected, or unresolved |
| Assurance status | Proved, checked/tested at a named level, observed, attested, assumed, or unknown |
| Source map | Authored location and related declarations |
| Counterexample | Trace or configuration that would falsify the claim |

A checkpoint cannot close while a required obligation is absent from this accounting. A deployment cannot compile
while a required obligation is rejected, impermissibly approximated, unresolved, or supported only by an assurance
status forbidden by its declared assurance policy.

## Definition of done

The Organization IR architecture is not complete merely when it supports many systems. It reaches its intended
standard when, over its declared semantic domain:

- authored meaning has a precise and compositional representation;
- valid source transformations obey their stated laws;
- every deployment responsibility has an authoritative owner and enforcement boundary;
- every lowering step carries preservation evidence or explicit loss;
- every correctness-relevant runtime effect is observable or identified as an observability gap;
- every semantic construct has coverage-ledger entries, and every guarantee separately states its disposition and
  assurance status;
- two materially dissimilar substrate compositions realize the same compatible organization without target-specific
  changes to Organization IR;
- minimal counterexamples are first-class outputs rather than hidden test failures.

The strongest honest claim is **disposition-completeness**, not universal formal completeness: nothing within the
declared domain disappears between what the organization means, what the deployment promises, what the compiler
emits, and what execution demonstrates.
