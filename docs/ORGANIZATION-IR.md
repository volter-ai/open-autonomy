# Open Autonomy Organization IR

Status: exploratory v2 architecture implemented alongside the deployed `autonomy.ir.v1` profile format.

Implemented experimental surfaces:

- TypeScript definition and state models;
- YAML parsers and cross-reference/lifecycle validation;
- backend capability manifests;
- semantic feature-use detection;
- preservation reports (`preserved`, `shimmed`, `approximated`, `rejected`);
- conservative `autonomy.organization.v2 -> autonomy.ir.v1` lowering;
- a complete coding-organization definition and separate v1 installation mapping.

## Decision

Open Autonomy needs two related representations:

1. `autonomy.organization.v2` describes what an organization means independently of a runtime.
2. `autonomy.state.v1` records what happened while an organization was running.

The current `autonomy.ir.v1` remains supported. It is a useful runner profile and a future lowering target,
not a sufficiently complete canonical representation of an autonomous organization.

## The four artifacts

Open Autonomy must keep four things distinct:

| Artifact | Meaning |
|---|---|
| Organization IR | One target-independent organization: actors, behavior, goals, work, authority, protocols and governance |
| Profile | A parameterized family or constrained specialization of organizations |
| Substrate component manifest | The facets one provider implements, the interfaces it requires, and the configurations it forbids |
| Deployment IR | Selected provider instances, bindings, authoritative ownership and configuration for one realization |

```text
instantiate(profile, parameters) -> organization
solve(organization, available substrate components) -> deployment candidates
lower(organization, proven deployment) -> artifacts + preservation report
```

Target choice and provider wiring never change the denotation of the organization.

`autonomy.profile.v1` makes the profile distinction concrete. It contains typed parameters, an OrganizationIR
template, and deterministic conditional patches. Instantiation validates parameter types and bounds, applies
matching variants in declaration order, and must produce an ordinary valid OrganizationIR before substrate
selection begins. Profiles therefore express organization families without gaining access to deployment or
provider configuration.

## Substrate is a composition, not a product category

A substrate is a graph of multi-facet capability providers. Facets overlap: Hermes may provide actor,
behavior, session, Slack, MCP and worker-execution facilities simultaneously; Paperclip may provide work,
goal, approval, budget and UI facilities; Postgres may provide transactions and an event log. None must be
declared *the* substrate by itself.

Useful facet families include:

- actor and behavior runtime;
- activation and scheduling;
- work/control, claims and durability;
- interaction and transport;
- tool/capability execution;
- session, context and memory;
- worker/process execution and isolation;
- policy, authority, approvals and accounting;
- artifacts, evidence, events and observability.

A component manifest declares both provisions and restrictions. A provider that implements tasks but permits
only one assignee cannot realize a profile requiring joint assignment merely because both sides mention
“tasks.” A deployment also names the authoritative owner of each state class and the bindings between
providers; two providers cannot both own work state without an explicit synchronization protocol.

## Compatibility is a proof obligation

Compatibility belongs to `(organization, deployment)`, not to either a profile or product name alone. It asks
whether there exists a configured composition whose observable behavior satisfies the organization’s required
semantics.

The solver checks more than feature presence:

- cardinality and topology;
- authority, attenuation and separation of duty;
- state consistency and durability;
- lifecycle and ordering;
- identity persistence;
- protocol correlation and delivery guarantees;
- isolation, concurrency and temporal bounds;
- failure, retry and recovery semantics;
- authoritative ownership and composition conflicts.

Results are `compatible`, `compatible-with-adapters`, `compatible-with-approximation`, `configurable`,
`incompatible`, or `undetermined`. Missing manifest information is `undetermined`, never silently supported.
Required semantics may be preserved natively or by a declared substrate adapter; optional semantics may be
approximated only under the module’s loss policy.

## Why definition and state are separate

An actor is not a model process. A work item is not an agent session. A goal is not a prompt. An assignment
is not an attempt. Mixing these objects makes restart, reassignment, audit, replay, and multi-runtime
compilation ambiguous.

```text
OrganizationIR (definition)                 OrganizationStateIR (observation)
-----------------------------------         ---------------------------------
actor identity and behavior                 actor/session activity
goals and measures                          current goal observations
work types and lifecycle machines           work items and their current states
assignment/retry/verification policies      claims, attempts, failures, results
authority and budgets                       grants exercised and budget consumed
protocol/session types                      conversations and correlated messages
artifact types                              artifact instances and provenance
```

The state document may be a materialized view of an event log. It is not configuration fed back into the
definition implicitly.

## Semantic planes

The v2 module is organized into linked catalogs rather than one universal agent object.

### Behavior plane

- `types`: reusable JSON-schema-compatible data types.
- `behaviors`: prompts, skills, Oracle Agent Spec components, workflows, programs, composites, or external components.
- `instructions`: first-class prompt fragments with semantic roles, precedence, conditional inclusion, and conflict policy.
- `tools`: typed callable capabilities with declared effects and idempotency.
- `memories`: working, episodic, semantic, procedural, organizational, artifact, or external memory with explicit scope and retention.

This plane can import Oracle Agent Spec and AIR without forcing organizational state into either format.

### Organization plane

- `actors`: durable human, agent, service, or collective identities.
- `units`: organizations, divisions, teams, boards, committees, markets, and worker pools.
- `relations`: reporting, supervision, review, advice, supply, audit, and election edges.
- `decisions`: owner, quorum, voting, consensus, auction, model, or custom decision rules.

Organizational topology is data and may be changed through authorized state transitions. Hierarchy is one
possible topology rather than the definition of organization.

### Purpose plane

- `goals`: nested intended outcomes.
- `measures`: observations, targets, and optimization direction.
- `policies`: human-owned constraints and governance.

Goals describe why work exists. Work carries a reference to a goal rather than copying its prompt text.

### Work plane

- `workTypes`: input/output types, state machines, assignment, retry, verification, and context rules.
- `initialWork`: optional seed work in the definition.
- state-side `work`: durable instances.
- state-side `attempts`: bounded executions of one work item by one actor.
- state-side `claims`: atomic ownership/lease facts independent of attempts.

The minimum causal chain is:

```text
goal <- work item <- attempt <- artifact/evidence
          ^              ^
     accountable      executing actor
```

Accountability, assignment, claim, and execution are distinct relations.

### Authority plane

- `capabilities`: abstract actions over resource kinds.
- actor `CapabilityGrant`s: scoped, conditional, budgeted and optionally delegable grants.
- `policies`: authorization, obligation, prohibition, approval, privacy, retention, safety, and quality rules.
- `budgets`: nested limits over money, tokens, time, compute, or requests.

Delegation never silently increases authority. A backend must preserve attenuation, insert an enforcing
shim, or reject compilation.

### Interaction plane

- `protocols`: roles, typed messages, effects, correlation fields, and optional session state machines.
- state-side `conversations`: participants, external channel/thread identity, related work and messages.

Slack is a transport projection. A Slack thread may discuss or mutate work, but it is not itself the
authoritative work item.

### Evidence plane

- artifact types and artifact instances;
- decisions and rationale;
- causally linked events;
- attempt failures and evidence;
- budget use;
- provenance on every declaration through annotations.

## Progressive lowering

The canonical organization representation should lower through explicit stages:

```text
organization + behavior semantics
        ↓ organization-selection and policy elaboration
work/control semantics
        ↓ scheduling, durability, protocol and security lowering
execution plan
        ↓ backend capability negotiation
substrate configuration and runtime artifacts
```

Likely external mappings:

| External system | Role |
|---|---|
| Oracle Agent Spec | behavior/component frontend and backend |
| AIR | recovered-source and analysis frontend |
| Paperclip | hierarchical ticket-organization backend and lifting frontend |
| MCP | tool/resource/prompt boundary lowering |
| A2A | remote actor/protocol lowering |
| OpenTelemetry / Agent Spec Tracing | observation projection |
| Temporal / Serverless Workflow | durable work/control lowering |
| `autonomy.ir.v1` | current bounded runner-profile lowering |

## Compilation contract

A substrate component publishes a multi-facet capability and constraint manifest. The selected deployment
must collectively account for every source construct with one of:

1. `preserved`: observable semantics are represented natively;
2. `shimmed`: a generated runtime component enforces the semantics;
3. `approximated`: a declared loss is accepted by the module's loss policy;
4. `rejected`: required semantics cannot be represented safely.

Silent dropping is never legal. Target choice is a compiler invocation, not part of the organization’s
meaning.

The initial implementation is in `packages/core/src/organization-compile.ts`. The documented example keeps
the two inputs visibly separate:

- `docs/examples/autonomous-coding-org.v2.yml` — target-independent organizational meaning;
- a separate deployment document — selected provider instances, bindings, and v1 projection parameters.

If the selected components cannot collectively preserve a required feature, no target IR is emitted. Adapters
are owned and declared by substrate components, not asserted ad hoc by each organization. Required guarantees
may be preserved or adapter-realized; they may never be merely approximated.

## Formal-analysis hooks

The representation is designed to support, without claiming the analyses are implemented yet:

- reference and schema typing;
- capability/effect analysis and least-authority checks;
- information-flow and trust-origin analysis;
- lifecycle reachability, dead-state and deadlock checks;
- session/protocol duality and message-order checks;
- dependency-cycle and resource-bound analysis;
- delegation attenuation and separation-of-duty proofs;
- temporal properties over event traces;
- categorical composition of organizations and behavior components;
- refinement checks between lowering levels;
- trace equivalence and backend conformance.

## Compatibility with v1

No current profile changes in this phase. A future `v2 -> v1` lowering can emit v1 actors where:

- a v2 actor has one selected implementation;
- its activation rules map to v1 triggers;
- its grants map to the closed v1 capability catalog;
- its behavior maps to an installed skill or program;
- unsupported organizational semantics are supplied by a control-plane behavior or rejected.

This avoids a flag-day migration and prevents the existing GitHub/local proof from being destabilized by
the broader semantic work.
