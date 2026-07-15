# Open Autonomy Organization IR v2 Specification

Version: 2.0.0-experimental  
Schema identifier: `autonomy.organization.v2`  
Status: normative experimental standard. Stability and compatibility rules in this document apply within the v2
experimental line; promotion to a stable language version requires R2–R4 conformance evidence.

## 1. Conformance and requirement words

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**,
**RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** are to be interpreted as described by RFC 2119 and
RFC 8174 when, and only when, they appear in capitals. Sections labelled “Informative” are not requirements.

A conforming reader MUST parse YAML or JSON into the data model exported by
`packages/core/src/organization-ir.ts`, MUST apply the validation rules below, and MUST reject rather than guess
meaning for invalid required fields. A conforming implementation MAY use another internal representation if its
portable observations are equivalent under section 5.

## 2. Artifacts and denotation

An Organization IR document denotes the tuple

`O = (N, V, I, T, B, L, M, C, A, U, R, G, W, Q, P, K, D, F, X)`

of name, version, imports, types, behaviors, tools, memories, capabilities, actors, units, relations, goals, work,
protocols, policies, budgets, decisions, artifacts, and compiler requirements. Catalog keys are nominal identifiers;
object member order has no meaning. Array order has meaning unless a rule below explicitly treats the array as a set.
The target deployment, worker, model, session, account, transport, and provider are not part of actor identity or the
denotation of `O`.

`autonomy.state.v1` is a distinct observed-state artifact. It denotes facts about one identified organization
revision. State MUST NOT silently alter the definition. `autonomy.profile.v1`, component manifests, deployment IR,
compiler artifacts, and assurance reports are distinct artifact families defined by their own schemas and versions.

## 3. Lexical and structural rules

- `schema` MUST equal `autonomy.organization.v2`; `name` MUST be nonempty; `actors` MUST contain an actor.
- Catalog identifiers MUST match `[A-Za-z][A-Za-z0-9._/-]*` and are compared byte-for-byte.
- A reference is resolved in its declared target catalog. A wrong-sort reference is invalid even if the same key
  exists in another catalog. A qualified imported reference is deferred only through a declared namespace.
- Required scalar and array fields are as typed by the public TypeScript model. Absence of an optional field invokes
  the default rules in section 4; `null` is not absence unless its declared JSON type admits null.
- Parent and initial-work dependency graphs MUST be acyclic. Lifecycle initial/terminal/transition states MUST exist;
  a lifecycle MUST have a terminal state; transition events MUST be nonempty.
- Behaviors MUST have a source, inline body, instruction assembly, or composed behavior. Actors MUST name at least
  one behavior. Budgets MUST be nonnegative.

The normative public field inventory and each field group’s denotation are generated in
[`ORGANIZATION-IR-FIELD-SEMANTICS.md`](./ORGANIZATION-IR-FIELD-SEMANTICS.md). The executable validator and YAML
reader are [`organization-ir.ts`](../packages/core/src/organization-ir.ts) and
[`organization-ir-yaml.ts`](../packages/core/src/organization-ir-yaml.ts). R2 will publish representation schemas;
until then these linked types and validator are the normative structural schema for this experimental version.

## 4. Defaults and absence

- An absent optional catalog denotes an empty catalog. An absent optional list denotes an empty list.
- `ImportDecl.required` defaults to true; omitted `symbols` exposes all declarations from the imported module.
- Instruction precedence defaults to the declared standard layer order during normalization; omitted fragment layer
  is derived from its role. An omitted conflict rule is `reject`.
- Optional booleans do not generally default to true. A compiler MUST use the explicit normalization rules implemented
  by `normalizeOrganization`; it MUST NOT invent provider-specific defaults.
- An omitted `WorkItemDecl.initialState` denotes its work type’s lifecycle initial state.
- Missing evidence, provider properties, observations, or assurance denotes `unknown`, never success.
- Opaque expression dialects are retained with their language tag. They are not portable predicates and MUST NOT be
  executed during portable compile-time analysis.

## 5. Identity, equality, and equivalence

Catalog identity is `(module logical identity, catalog sort, identifier)`. Import alias renaming changes only local
qualification, not nominal identity. Retrieval location, content digest, actor, worker, session, model, and account
identities are distinct.

Two closed organizations are semantically equivalent when normalization produces the same domain-framed semantic
digest. Object-key permutation and nonsemantic annotations do not change this digest; array permutation, catalog
identifier changes, opaque semantic payload changes, or any field not explicitly excluded by normalization may change
it. Byte equality is sufficient but not necessary. Observational equivalence is weaker and MUST name its observation
projection, assumptions, and ignored losses.

## 6. Composition algebra

Module linking is nominal, deterministic, and bounded. The empty disjoint import set is identity. Composition of
closed modules with disjoint exported identities is associative and order-independent after canonicalization.
Colliding logical identities, namespace ambiguity, digest substitution, cycles, or exceeded graph bounds are errors.

Profile patches compose in declaration order. Last-writer behavior applies only where the patch algebra declares it;
unresolved semantic conflicts reject. Instruction assembly is idempotent for identical fragments and follows explicit
precedence; `most-restrictive` is valid only for constraints with a defined restriction order. Runtime conflict choice
is an implementation choice and MUST remain visible in the artifact/evidence.

## 7. Types, authority, effects, and invalid states

Every reference has a source sort and target sort defined by the field-level appendix and validator. Effects are
abstract `(resource, action, mode, reversible)` declarations; they do not grant authority. A behavior’s composed
effect set MUST be covered by the executing actor’s capability grants or compilation fails. Delegation MUST attenuate
authority and MUST NOT cross a declared trust boundary without an enforcing component.

Accountability, assignment, claim, attempt, execution, verification, and conversation are distinct relations.
Transport threads are correlation identifiers, not work identity. A provider claim is not assurance: preservation,
adapter realization, approximation, rejection, and unresolved semantic disposition are independent from assurance
status. Invalid references, lifecycle edges, authority, unsupported required semantics, or forbidden loss MUST prevent
successful lowering rather than produce a partial successful target.

## 8. Events and state

Portable events are immutable, uniquely identified, causally ordered observations interpreted by a pinned event schema
and reducer version. Exact replay is idempotent. A child with unavailable parents remains pending; unauthorized,
corrupt, conflicting-without-arbitration, or subject-mismatched events are rejected. Corrections and retractions are
new causal events and do not rewrite history.

Materialization is pure over accepted history. Equivalent accepted histories MUST produce equivalent portable state.
Native events MUST pass through a versioned component-owned lift adapter; missing observability produces a typed gap,
not guessed state. Finite traces cannot establish unbounded liveness without named fairness/environment assumptions.

## 9. Versions, extensions, and migration

Artifact families version independently. A reader MUST reject an unsupported schema version. Migration MUST follow a
registered directed version edge, account for every transformed or removed field, retain source relations, and emit
an explicit loss requiring authorization when not round-trip preserving. Historical replay pins organization, event,
reducer, compiler, and migration interpretations.

`annotations.extensions` and compiler extensions are namespaced preserved payloads. Unknown extensions MUST be
retained byte-for-value when policy allows them or rejected atomically; they MUST NOT be silently erased. New optional
fields MAY be introduced only with a normative default preserving old meaning. New required fields, changed defaults,
or changed denotation require a new schema version and migration edge. Deprecation does not remove meaning until the
declared compatibility window ends.

## 10. Lowering and assurance

Compilation proceeds through linked, normalized, analyzed, solved deployment, lowered, and emitted artifacts. Every
atomic source obligation receives exactly one semantic disposition: `preserved`, `adapter-realized`, `approximated`,
`rejected`, or `unresolved`. Every supporting claim receives exactly one assurance status: `proved`,
`statically-checked`, `model-checked`, `property-tested`, `conformance-tested`, `live-observed`,
`externally-attested`, `assumed`, or `unknown`.

Required rejected/unresolved obligations, unauthorized approximation, or assurance below deployment policy MUST block
emission. Each pass MUST preserve provenance. Provider product vocabulary MUST remain in component/deployment layers,
not Organization IR. A target choice cannot change source denotation.

## 11. Executable examples

The positive document [`autonomous-coding-org.v2.yml`](./examples/autonomous-coding-org.v2.yml) MUST parse and
validate. [`wrong-sort-reference.v2.yml`](./examples/invalid/wrong-sort-reference.v2.yml) MUST fail because an actor
behavior references a tool identifier. These examples are executed by the specification drift test.

## 12. Unsupported and implementation-defined domains

The portable core does not assign semantics to arbitrary JavaScript/native expressions, provider configuration,
model behavior, natural-language truth, unbounded liveness, wall-clock synchrony, exactly-once transport, global
termination, causal effects inferred only from correlation, or guarantees absent from component evidence. Such values
are opaque, dialect-bound, assumed, unknown, or unsupported as appropriate.

Implementations may choose storage, scheduling algorithm, worker/model, UI, transport, and equivalent canonical
algorithms only where the chosen behavior is outside the declared observation projection or is recorded as an
implementation choice. No implementation-defined choice may change authority, required lifecycle/effects, artifact
identity, accepted loss, or portable event/state meaning.

## 13. Informative architecture guidance

This section is informative. A practical realization commonly separates authored organization, profile family,
component catalog, solved deployment, desired fleet, observed state, interaction control plane, event store, and
workers. [`ORGANIZATION-IR.md`](./ORGANIZATION-IR.md) explains the design motivation and ecosystem mappings; it does
not override this normative specification.
