# Open Autonomy Organization IR v2 Specification

Version: 2.0.0-experimental  
Schema identifier: `autonomy.organization.v2`  
Status: normative experimental standard. Stability and compatibility rules in this document apply within the v2
experimental line; promotion to a stable language version requires R2–R4 conformance evidence.

## 1. Conformance and requirement words

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**,
**RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** are to be interpreted as described by RFC 2119 and
RFC 8174 when, and only when, they appear in capitals. Sections labelled “Informative” are not requirements.

A conforming reader MUST parse the closed structural grammar in the field appendix, MUST apply the validation rules
below, and MUST reject rather than guess meaning for invalid required fields. TypeScript is one implementation of
that grammar, not its normative source. A conforming implementation MAY use another internal representation if its
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
- Requiredness, structural type, enum domain, reference sort, and sequence ordering are given per field in the
  appendix. Unknown members are invalid. Absence invokes section 4; `null` is not absence unless its type admits null.
- Unit-parent, goal-parent, budget-parent, initial-work-parent, initial-work-dependency, and behavior-composition graphs MUST be acyclic.
  Parent edges are child→parent; `a.dependencies=[b]` and `a.behaviors=[b]` create a→b. Self edges are cycles and
  duplicate edges reject. Lifecycle initial/terminal/transition states MUST exist; a lifecycle MUST have a terminal
  state; transition events MUST be nonempty. A lifecycle edge identity is `(from-state, to-state, event)` after
  expanding an array-valued `from`; repeated identities reject.
- Protocol roles MUST be nonempty and unique. Message endpoint sequences MUST be nonempty, contain unique roles, and
  reference declared roles. Session initial/terminal/target states and triggering messages MUST exist in the same
  protocol. An empty message catalog is valid only when no session transition refers to a message.
- Behaviors MUST have a source, inline body, instruction assembly, or composed behavior. Actors MUST name at least
  one behavior. Budgets MUST be nonnegative.

The normative public field grammar and denotation are generated in
[`ORGANIZATION-IR-FIELD-SEMANTICS.md`](./ORGANIZATION-IR-FIELD-SEMANTICS.md). The executable validator and YAML
reader are [`organization-ir.ts`](../packages/core/src/organization-ir.ts) and
[`organization-ir-yaml.ts`](../packages/core/src/organization-ir-yaml.ts). The generated closed machine grammar is
[`organization-ir-v2.schema.json`](../packages/core/src/generated/organization-ir-v2.schema.json). R2 will add the
remaining representation schemas and package-level conformance surface; the appendix remains normative if an
implementation surface drifts from it.

YAML input MUST use the JSON-compatible YAML 1.2 core subset: string mapping keys, no duplicate keys, aliases,
anchors, merge keys, explicit tags, timestamps, binary scalars, or non-finite numbers. The parsed value MUST be JSON
representable. JSON input follows RFC 8259 and duplicate object names MUST be rejected before model validation.

## 4. Defaults and absence

- An absent optional Organization IR catalog denotes an empty catalog. The appendix marks every list materialized as
  an empty ordered sequence during normalization. Other absent optional values remain absent.
- `ImportDecl.required` defaults to true; omitted `symbols` exposes all declarations from the imported module.
- Instruction precedence defaults to the declared standard layer order during normalization; omitted fragment layer
  is derived from its role. An omitted conflict rule is `reject`.
- Optional booleans do not generally default to true. The normative normalization implementation is
  [`organization-normalize.ts`](../packages/core/src/organization-normalize.ts); a compiler MUST NOT invent
  provider-specific defaults.
- An omitted `WorkItemDecl.initialState` denotes its work type’s lifecycle initial state.
- Missing evidence, provider properties, observations, or assurance denotes `unknown`, never success.
- Opaque expression dialects are retained with their language tag. They are not portable predicates and MUST NOT be
  executed during portable compile-time analysis.

## 5. Identity, equality, and equivalence

Catalog identity is `(module logical identity, catalog sort, identifier)`. Import alias renaming changes only local
qualification, not nominal identity. Retrieval location, content digest, actor, worker, session, model, and account
identities are distinct.

Canonical bytes use `oa-c14n-v1`, which is RFC 8785 JSON Canonicalization Scheme (JCS): strings and finite IEEE-754
numbers use its ECMAScript serialization (including `-0`→`0`), arrays retain order, and object keys sort by ascending
UTF-16 code units. Lone surrogates, undefined, non-finite, cyclic, and non-plain values reject. Organization semantic
bytes omit only `documentation` and `provenance`; labels and extensions are
semantic. SHA-256 hashes `"oa-c14n-v1" NUL "autonomy.organization.v2" NUL canonical-json`.

The semantic digest input MUST be constructed as follows. Resolve the closed module graph and sort module IDs
lexically. For every reference, replace its authored spelling with `module-id#catalog/id`, where `module-id` is the
resolved stable logical identity, `catalog` is the target sort, and `id` is the declaration key. Materialize exactly
the defaults in section 4 and the field appendix, then remove each module's `imports`. Recursively remove only
`documentation` and `provenance` members at positions declared as annotations. Retain labels and extensions. Hash the
closed object `{schema:"autonomy.normalized-organization-semantics.v1",root:<root-module-id>,modules:<module-map>}`;
do not hash source maps or a prior digest. Repeating these steps on a normalized artifact MUST be idempotent.

Two closed organizations are semantically equivalent when normalization produces the same domain-framed semantic
digest. Object-key permutation and nonsemantic annotations do not change this digest; array permutation, catalog
identifier changes, opaque semantic payload changes, or any field not explicitly excluded by normalization may change
it. Byte equality is sufficient but not necessary. Observational equivalence is weaker and MUST name its observation
projection, assumptions, and ignored losses.

## 6. Composition algebra

Module linking is nominal, deterministic, and bounded. A qualified reference is `namespace/id`, split at its first
slash. A namespace MUST match `[A-Za-z][A-Za-z0-9._-]*`; it is the explicit import namespace or otherwise its import
catalog key, and duplicates reject. Relative URIs resolve against the importer. If `ImportDecl.module` is present,
the loader MUST match that expected stable logical identity; otherwise the loader-provided identity is explicitly
implementation-defined and the resulting digest is not cross-loader portable. The loader verifies any declared digest before exposing all
symbols or the per-catalog `symbols` allowlist. A required import (the default) failing load, integrity, identity,
visibility, or closure rejects. An optional import may be absent after load failure, but references to it remain
invalid. Lookup selects the field’s target catalog before identifier lookup, so wrong-sort references reject.

The empty disjoint import set is identity. Composition of
closed modules with disjoint exported identities is associative and order-independent after canonicalization.
Colliding logical identities, namespace ambiguity, digest substitution, cycles, or exceeded graph bounds are errors.

Profile patches compose in declaration order. Last-writer behavior applies only where the patch algebra declares it;
unresolved semantic conflicts reject. Instruction assembly is idempotent for identical fragments and follows explicit
precedence; `most-restrictive` is valid only for constraints with a defined restriction order. Runtime conflict choice
is an implementation choice and MUST remain visible in the artifact/evidence. Standard precedence, strongest first,
is `constitution, organization, role, task, skill, conversation, runtime`. Role mapping is constitution→constitution;
policy/constraint→organization; identity→role; procedure/context→task; example→skill; user→conversation. Duplicate
layers or fragments mapped to an absent layer reject. Priority defaults to zero. Missing fragment IDs are derived from
role, layer, text, and source. `higher-precedence` selects stronger layer then higher priority; conflicting distinct
fragments with equal layer and priority reject rather than use authored order. `most-restrictive`
without a declared restriction lattice returns `unsupported` rather than guessing.

## 7. Types, authority, effects, and invalid states

Every reference has a source sort and target sort defined by the field-level appendix. Effects are
abstract `(resource, action, mode, reversible)` declarations; they do not grant authority. A behavior’s composed
effect set MUST be covered by the executing actor’s capability grants or compilation fails. Coverage requires equal
resource/action, equal mode when both sides specify mode, and equal `reversible` when both sides specify it; absence
of mode or reversibility is a wildcard. A grant covers only effects of its referenced capability within its selector.
Opaque selector/condition containment is `unknown` and MUST block invocation unless a later runtime authorization
step is explicitly represented and successfully discharged; a conditional match is not covered authority. Delegation is
componentwise containment of capability, selector, expiry, budget, and delegation flag; open-world delegation is
`unknown`. A trust crossing requires a deployment component whose enforcement contract names the boundary/mechanism;
Organization IR alone cannot assert enforcement.

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
