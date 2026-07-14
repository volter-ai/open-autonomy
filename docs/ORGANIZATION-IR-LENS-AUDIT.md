# Organization IR formal-lens audit

Status: normative audit companion to [`ORGANIZATION-IR-AC.md`](./ORGANIZATION-IR-AC.md).

This document instantiates the required lenses for B0 and P1-P13. It is not evidence that an implementation meets
the obligations: every row begins `open` unless linked to separately recorded evidence. It exists to make omissions,
assumptions, undecidable claims, and falsifiers explicit before implementation.

## Reading the audit

Each row contains:

- **ID/lens**: stable obligation identifier and formal lens;
- **obligation**: falsifiable property, law, or distinction;
- **mechanism/evidence**: intended engineering enforcement and appropriate evidence;
- **boundary/falsifier**: assumption, decidability limit, or minimal counterexample.

Evidence status and semantic disposition remain separate. A property test may support a preservation claim without
proving it; a provider may claim native preservation while its assurance remains unknown.

## Cross-cutting findings

The audit found these requirements to be cross-cutting rather than owned by only one checkpoint:

1. The semantic coverage ledger must exist before completeness can be measured.
2. Atomic obligations, not whole fields or products, are the unit of compatibility accounting.
3. Nominal, structural, deployment-instance, runtime-session, and event identities must be distinct.
4. All determinism claims are relative to pinned inputs, compiler/reducer versions, and declared environment data.
5. Safety and liveness require different evidence; finite reachability does not prove environmental progress.
6. Every security invariant must name a technical enforcement boundary, not merely an instruction or actor.
7. Provider assertions require an assurance policy; feature compatibility alone cannot authorize execution.
8. Lowering is preservation of assumption/guarantee contracts under an observation projection, not merely syntax
   translation or trace inclusion.
9. Concurrent event histories require causal semantics, commutativity, or explicit arbitration.
10. The same canonical organization—not merely the same profile family—must survive the second-substrate test.
11. Extension and opaque-expression behavior must be reject/preserve/unknown by construction; never silent.
12. Solver, analyzer, and migration completeness claims must state their finite domain and resource bounds.

## B0 — existing experimental implementation audit

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| B0-SEM-1 Semantic | Every current public field has a stated denotation or explicit residual. | Field-by-field semantic coverage ledger reviewed against TypeScript interfaces and YAML fixtures. | Falsifier: an accepted field has no meaning outside its TypeScript shape. |
| B0-SEM-2 Semantic | Profile, organization, deployment, compiler IR, and state remain disjoint semantic categories. | Cross-artifact dependency audit and negative construction tests. | Falsifier: profile parameters select Hermes, or runtime state silently changes organization meaning. |
| B0-TYP-1 Type | Every current reference has a declared source sort and target sort. | Reference inventory plus wrong-sort negative tests. | Current `Id = string` provides no static proof; assurance is validation-tested at best. |
| B0-ALG-1 Algebraic | Current ordered profile patches have explicit order semantics; commuting patches are distinguished from conflicting patches. | Patch read/write-set analysis and permutation property tests for disjoint patches. | Falsifier: reordering apparently independent variants changes output without a reported conflict. |
| B0-ALG-2 Algebraic | State materialization satisfies prefix composition for successful traces. | Generated trace splits checked against whole-trace reduction. | Current all-or-nothing error result may conceal partial reduction; invalid suffix behavior needs separate semantics. |
| B0-DIST-1 Distributed | Current claim/event types do not imply concurrency guarantees the reducer cannot enforce. | Failure-schedule review and explicit provisional-sequential classification. | Falsifier: documentation claims exclusive distributed claims from an in-memory reducer. |
| B0-SEC-1 Security | Declared capabilities and policies are never described as enforced unless a boundary realizes them. | Requirement-to-enforcer inventory. | Falsifier: a prompt instruction is counted as capability isolation. |
| B0-PROV-1 Provenance | Existing source refs distinguish assertion origin from verified evidence. | Provenance/evidence audit of examples and types. | Falsifier: `SourceRef` alone is treated as attestation of truth. |
| B0-REF-1 Refinement | The current v2-to-v1 lowering accounts for every used source obligation. | Coverage ledger compared with `usedOrganizationFeatures`, projections, and loss report. | Known risk: feature detection is catalog-level and may miss field-level semantics. |
| B0-RES-1 Completeness | Every discovered gap is assigned to B0/P1-P13 or rejected with rationale. | Residual ownership table with zero untriaged entries. | Falsifier: an audit note has no owner or disposition. |

## P1 — modules, imports, namespaces, and stable identity

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P1-SEM-1 Semantic | Module composition preserves declaration meaning and visibility. | Define module signatures, exports/imports, visibility, and linking denotation. | Falsifier: importing a module changes an unrelated declaration's meaning. |
| P1-TYP-1 Type | Resolution is sort-preserving and successful output is closed. | Branded catalog references plus validation; wrong-sort and unresolved-reference fixtures. | Falsifier: an actor reference resolves to a behavior with the same spelling. |
| P1-ALG-1 Algebraic | Disjoint composition has identity, associativity, and order independence. | Property tests over generated acyclic module graphs. | Laws exclude conflicts and ordered override constructs; those require separate semantics. |
| P1-ALG-2 Algebraic | Namespace alias renaming is alpha-equivalent. | Canonical identities derive from module identity, never local alias; rename property test. | Falsifier: changing `eng` to `engineering` changes semantic hash. |
| P1-GRA-1 Graph | Resolution terminates on a finite bounded graph and reports complete cycles. | DFS/SCC with depth/node/byte bounds and related diagnostics. | Falsifier: a cycle hangs or reports only the final edge without the cycle. |
| P1-SEC-1 Security | Resolver policy constrains schemes, roots, network access, and import integrity. | Abstract loader, allowlist, digest/lock verification, traversal tests. | Falsifier: a relative import escapes its allowed root or mutable remote content is called reproducible. |
| P1-PROV-1 Provenance | Every resolved declaration retains declaration-site and import-site provenance. | Many-to-many source relations and nested import fixtures. | Falsifier: error in a transitive import points only at generated output. |
| P1-EVO-1 Evolution | Logical identity survives content change but responds predictably to module/declaration rename. | Separate nominal ID and digest types; rename/mutation fixtures. | Cross-module moves require explicit succession/migration; identity continuity is not inferred. |
| P1-ADV-1 Adversarial | Namespace squatting, confusables, digest substitution, and resource exhaustion fail closed. | Normalized identifiers, collision checks, integrity verification, bounded-loader tests. | Unicode policy must be explicit; accepting visually confusable identifiers without warning falsifies the claim. |

## P2 — elaboration, normalization, and semantic hashing

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P2-SEM-1 Semantic | Each elaboration rule preserves the declared denotation. | Per-rule argument/certificate and source-to-normal-form examples. | Until denotation exists, assurance is assumed/tested, not proved. |
| P2-ALG-1 Algebraic | Normalization is idempotent. | Property test `N(N(x)) = N(x)` over generated valid organizations. | Falsifier: defaults or generated IDs change on the second pass. |
| P2-ALG-2 Algebraic | Declared irrelevant ordering and formatting do not affect canonical output. | Canonical serializer and permutation/metamorphic tests. | Instruction, transition, and variant order remain semantic unless explicitly proven otherwise. |
| P2-ALG-3 Algebraic | Declared equivalent source forms normalize equally. | Equivalence-class fixtures and property generators. | The equivalence relation must precede the test; observed equality does not define semantics retroactively. |
| P2-COMP-1 Compiler | Invalid input cannot yield a successful partial normal form. | Result type separates output from fatal diagnostics; mutation and early-failure tests. | Recoverable analysis snapshots must be explicitly marked non-compilable. |
| P2-PROV-1 Provenance | Source maps do not alter semantic content or digest. | Separate serialization channels and hash invariance test. | Debug metadata accidentally included in the digest falsifies reproducibility. |
| P2-ADV-1 Adversarial | Canonicalization cannot be exploited by duplicate keys, numeric ambiguity, or extension erasure. | Strict YAML/JSON decoding, canonical-number rules, duplicate-key rejection, extension fixtures. | Cryptographic collision freedom is assumed, never mathematically proved. |
| P2-DET-1 Determinism | Reproducibility is relative to pinned imports, compiler version, canonicalization version, and declared environment inputs. | Reproducibility manifest and cross-process test. | Mutable unpinned imports or hidden environment reads invalidate the claim. |

## P3 — structured diagnostics, source maps, and compiler passes

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P3-TYP-1 Type | Pass input/output levels and analysis dependencies are explicit. | Generic pass types plus runtime verification for plugins. | Dynamically loaded code cannot rely on TypeScript alone. |
| P3-COMP-1 Compiler | A pass is input-immutable and deterministic over declared inputs. | Frozen/generated inputs, mutation detection, repeat execution. | Time, randomness, filesystem, or network access must be declared capabilities or forbidden. |
| P3-COMP-2 Compiler | Fatal failure prevents dependent emission while independent diagnostics may continue. | Dependency DAG and phase-status result model. | Falsifier: target artifacts emit after a failed preservation check. |
| P3-PROV-1 Provenance | Diagnostics and generated objects map through many-to-many transformations. | Relational source map, composition tests, related locations. | A single-source-span model is insufficient for merges and generated enforcement. |
| P3-OPS-1 Operational | Diagnostics are stable enough for automation and bounded under adversarial input. | Stable codes, deterministic sorting, deduplication and count/size limits. | Falsifier: one malformed graph produces unbounded duplicate diagnostics. |
| P3-ADV-1 Adversarial | Diagnostic text and source excerpts cannot inject terminal/control output or expose secrets. | Escaping/redaction policy and malicious-source fixtures. | Human rendering is a trust boundary distinct from diagnostic construction. |
| P3-EXT-1 Extensibility | Provider passes register through typed interfaces without product cases in core. | Plugin registry and fake-provider conformance fixture. | Registration does not authorize arbitrary compiler-process effects. |

## P4 — versioning and migration

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P4-SEM-1 Semantic | Every migration states preserved, transformed, weakened, and rejected semantics. | Migration manifest plus per-field coverage comparison. | Falsifier: removed semantic field has no loss disposition. |
| P4-REF-1 Refinement | Lossless migration preserves denotation; lossy migration targets an explicit weakening relation. | Round trip where claimed and migration certificate/report. | Serialization round trip alone does not prove semantic preservation. |
| P4-PROV-1 Provenance | Migration retains origin and records transformation provenance. | Source-map migration fixtures. | Falsifier: post-migration diagnostic cannot identify the legacy field. |
| P4-EVO-1 Evolution | Artifact families version and migrate independently with declared compatibility ranges. | Version graph and unsupported-edge diagnostics. | Avoid a global version number that falsely synchronizes all artifacts. |
| P4-EVO-2 Evolution | In-flight work and historical traces remain interpretable under pinned reducer/compiler versions. | Replay manifest and old-version fixtures. | A new reducer need not reinterpret old traces identically unless a migration claims it. |
| P4-OPS-1 Operational | Migration is deterministic, resumable or atomic, and recoverable. | Plan/apply separation, interruption fixture, rollback/backups for stateful migrations. | Pure document migration and live-state migration require different guarantees. |

## P5 — expressions, behavior, instructions, and context

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P5-SEM-1 Semantic | Behavior denotes typed inputs, outputs, effects, and contextual requirements—not a prompt string. | Behavior signature and substitution checks. | Model compliance is empirical; signature correctness cannot prove obedience. |
| P5-TYP-1 Type/effect | An implementation accepts supplied inputs, produces promised outputs, and requires no undeclared effect. | Schema variance checks, effect containment, negative fixtures. | Opaque programs may require attestation/sandboxing rather than static proof. |
| P5-SEM-2 Expressions | Portable analysis is applied only to defined expression dialect semantics. | Dialect envelope, portable core AST, type checker. | Opaque/native expressions yield unknown for dependent analyses, never success. |
| P5-CTX-1 Context | Context assembly is deterministic under a pinned state snapshot and explicit precedence. | Context/assembly plan, golden and permutation tests. | Retrieval/model tokenization may vary unless provider/version is pinned. |
| P5-EPI-1 Epistemic | Reported, observed, inferred, assumed, and verified information remain distinguishable. | Evidence-tagged context items and provenance display. | Falsifier: worker self-report is rendered as independent CI verification. |
| P5-SEC-1 Security | Instruction precedence is not treated as enforcement for privileged effects. | Tool/capability boundary separate from prompt assembler. | Falsifier: lower-priority prompt cannot override text but actor still has unrestricted credential. |
| P5-ORG-1 Organizational | Role behavior, actor identity, accountability, and runtime implementation remain separate. | Typed references and substitution scenarios. | Falsifier: replacing a model creates a new organizational actor automatically. |
| P5-ALG-1 Instruction algebra | Assembly defines order, identity, conflict, and idempotence only where valid. | Fragment IDs, partial order/linearization, conflict property tests. | Assembly is generally noncommutative; claiming set-union laws falsifies it. |
| P5-ADV-1 Adversarial | Untrusted messages/artifacts cannot acquire higher instruction authority through formatting. | Trust labels, quoting/encoding, injection corpus, capability isolation. | Prompt-injection resistance cannot be universally proved for an LLM. |

## P6 — substrate component and adapter manifests

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P6-DIST-1 Distributed | Each state facet declares authority, consistency, delivery, ordering, idempotency, and recovery. | Typed facet contracts and failure-schedule conformance tests. | Missing property is unknown, not the weakest convenient default. |
| P6-DIST-2 Distributed | Cross-provider bridges state how identity, causality, retries, and conflicts translate. | Bridge manifest and duplicate/reorder/partition fixtures. | Falsifier: two individually valid providers lose exclusivity when composed. |
| P6-SEC-1 Security/trust | Every guarantee names its enforcing principal and trust boundary. | Trust-zone and credential-flow manifest sections. | Product self-description is attestation until independently tested. |
| P6-OPS-1 Operational | Version, health, upgrade, rollback, capacity, and failure behavior are represented. | Config schemas and lifecycle conformance suite. | “Available” without a health criterion is not an operational guarantee. |
| P6-ECO-1 Economic | Cost/capacity declarations specify units, time basis, uncertainty, and attribution. | Typed quantities and pricing-version metadata. | Volatile price is an observation, not a timeless manifest fact. |
| P6-INT-1 Interoperability | Commands, observations, and interfaces use versioned schemas and explicit mappings. | Contract tests and supported-version matrix. | Wire compatibility does not imply semantic equivalence. |
| P6-ADV-1 Adversarial | Manifests and adapters are untrusted supply-chain inputs. | Signatures/digests, sandboxing, least privilege, malicious plugin fixtures. | A signed manifest proves origin, not truth of its claims. |
| P6-ADP-1 Adapter algebra | Direction, preconditions, postconditions, loss, and reversibility are explicit. | Per-adapter contract; round trip only when claimed. | A lifting adapter need not invert lowering; assuming symmetry falsifies the model. |

## P7 — compatibility assurance and constructive deployment solving

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P7-CSP-1 Constraint | Solver soundness: every emitted candidate independently satisfies all supported mandatory constraints. | Independent validator and exhaustive comparison on small registries. | Falsifier: emitted candidate fails revalidation. |
| P7-CSP-2 Constraint | Completeness is claimed only for a declared finite fragment and bound. | Search-domain declaration and exhaustive oracle tests. | Timeout/search exhaustion yields incomplete/unknown, never incompatible. |
| P7-CSP-3 Explanation | Incompatibility returns a valid unsatisfied core; minimality level is stated. | Core revalidation and deletion-based minimality tests. | “No provider” is insufficient when the true failure is global composition. |
| P7-REF-1 Refinement | Each selected realization discharges an atomic source obligation under explicit assumptions. | Obligation-to-witness relation and certificate checker where possible. | Feature-name equality alone is no witness. |
| P7-DIST-1 Distributed | Global authority, consistency, identity, ordering, and recovery constraints are solved jointly. | Cross-facet constraints and adversarial compositions. | Falsifier: pointwise coverage accepts split-brain work authority. |
| P7-SEC-1 Security | Trust zones, credential custody, isolation, and enforcement placement constrain candidates. | Security constraints and least-privilege comparison. | Cheapest candidate cannot win by weakening a mandatory boundary. |
| P7-ECO-1 Economic | Optimization is lexicographic or otherwise explicit after feasibility. | Deterministic objective vector and Pareto/cost fixtures. | Scalar cost must not silently trade away mandatory semantics. |
| P7-EPI-1 Assurance | Each witness records claim provenance and assurance status. | Assurance policy by risk; assumption acceptance identity/scope/expiry. | Unknown evidence cannot be promoted to native guarantee. |
| P7-DET-1 Determinism | Equal pinned inputs and objective policy produce stable candidate ordering. | Canonical tie-breaking and repeat tests. | External live prices/capacity must be versioned observations. |

## P8 — progressive lowering and preservation

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P8-SEM-1 Semantic | Each IR level has an assumption/guarantee contract and declared observations. | IR contract definitions and coverage ledger. | Syntax schemas alone do not define semantics. |
| P8-REF-1 Refinement | Under aligned assumptions, target guarantees preserve source safety and required progress. | Pass certificate/report and projected trace tests. | Trace inclusion alone does not prove liveness preservation. |
| P8-REF-2 Composition | Certificates compose only when intermediate contracts and observation maps align. | Checker for assumption discharge and map compatibility. | Falsifier: pass B assumes a guarantee pass A never provides. |
| P8-COMP-1 Compiler | Every atomic source obligation is mapped, weakened, rejected, or unresolved. | Machine coverage relation and fail-on-unaccounted rule. | Falsifier: policy vanishes from output and report. |
| P8-COMP-2 Solver interaction | Feasibility lowering may create obligations and trigger backtracking; executable emission requires closure. | Candidate/lowering fixed-point protocol and negative fixture. | A provisional candidate must not be emitted as executable. |
| P8-SEC-1 Security | Credentials, isolation, enforcement, and prompt rendering enter only below organization semantics. | Execution-plan types and boundary review. | Falsifier: Organization IR contains a GitHub token or Hermes process flag. |
| P8-PROV-1 Provenance | Generated enforcement and artifacts trace to all source obligations and selected providers. | Many-to-many source/witness maps. | Falsifier: a gate failure cannot identify the policy it enforces. |

## P9 — Hermes autonomous-coding vertical slice

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P9-DIST-1 Distributed | Restart, duplication, delay, worker loss, and partition preserve acknowledged effects and fenced ownership. | Fault injection, idempotency keys, leases/fencing, recovery traces. | Falsifier: restart repeats an acknowledged merge or two workers hold one exclusive claim. |
| P9-CTRL-1 Control | Every perpetual loop has progress measure, bounds, stable terminal/escalation states, and anti-oscillation policy. | Loop state machine, retry budget, cooldown/hysteresis, cycle monitor. | Falsifier: reachable positive-cost cycle has no progress or escalation. |
| P9-QUE-1 Queueing | Admission and concurrency respect worker/reviewer capacity and fairness. | Backpressure, queue metrics, overload scenario. | Liveness requires arrival/service assumptions; overload must degrade visibly. |
| P9-HCI-1 HCI | Slack utterances are classified/correlated as question, answer, mutation, command, or new work with recoverable ambiguity. | Conversation/work IDs, confirmation rules, user scenario tests. | Falsifier: asking status creates a duplicate job or answer resumes wrong attempt. |
| P9-SEC-1 Security | Slack principal, worker credentials, repository scope, and approvals are verified at technical boundaries. | Identity mapping, scoped credentials, artifact-bound approvals, adversarial tests. | Channel membership alone need not confer organizational authority. |
| P9-OPS-1 Operational | Health, pause, inspect, repair, upgrade, and recovery work without hidden manager memory. | Runbook and restart/upgrade traces. | Falsifier: only the original conversation context can recover work meaning. |
| P9-ECO-1 Economic | Token, compute, provider, and human-review costs attribute to goal/work/attempt and enforce limits. | Budget events and exhaustion test. | Estimated future cost and settled actual cost remain distinct. |
| P9-ADV-1 Adversarial | Forged worker completion, prompt injection, replayed Slack events, stale approvals, and malicious artifacts fail safely. | Attack corpus and boundary enforcement. | Model judgment alone cannot authenticate evidence. |
| P9-ORG-1 Organizational | Manager, accountable actor, assignee, claimant, executing worker, and reviewer remain distinct relations. | State/trace assertions and reassignment/review scenarios. | Falsifier: worker session identity becomes durable accountable actor by accident. |

## P10 — lifting, event materialization, and conformance

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P10-ALG-1 Algebraic | Successful materialization satisfies prefix composition. | Generated traces split at every prefix. | Error/repair semantics are separate and must not be inferred from successful folds. |
| P10-ALG-2 Concurrency | Independent concurrent events commute or invoke explicit arbitration. | Read/write-set or semantic commutativity checks over DAG topological orders. | Falsifier: two valid topological orders yield different state without conflict. |
| P10-TEMP-1 Temporal | Safety and liveness properties state bounds, clocks, and fairness assumptions. | Monitor/model-check definitions with counterexample traces. | Finite absence of violation cannot prove unbounded liveness. |
| P10-DIST-1 Distributed | Duplicate, reorder, correction, retraction, late arrival, and partition reconciliation semantics are versioned. | Fault-injection and replay corpus. | Wall-clock timestamps alone cannot establish causality or authority. |
| P10-EPI-1 Epistemic | Assertion, report, observation, inference, attestation, and verification are distinct event/evidence statuses. | Evidence provenance graph. | Falsifier: lifted worker message becomes verified completion. |
| P10-DB-1 Database/provenance | State is rebuildable from accepted history under pinned schema/reducer versions. | Full replay and snapshot equivalence tests. | External effects may not be replayable; their observations/evidence must be. |
| P10-SEC-1 Security | Event identity, issuer authorization, integrity, subject binding, and replay protection are validated. | Signed/authenticated envelopes where needed and forged-event fixtures. | Causally valid does not mean authorized or truthful. |
| P10-REF-1 Conformance | Native observations project to portable traces satisfying the organization contract or explicit gaps. | Adapter conformance and differential trace checks. | Absence of observable evidence yields gap/unknown, not success. |

## P11 — second dissimilar substrate

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P11-SEM-1 Semantic | Both deployments consume the identical canonical semantic payload and digest. | Pinned compiler inputs and digest comparison. | Profile specialization is a separate experiment and does not discharge this obligation. |
| P11-REF-1 Refinement | Each deployment independently satisfies the same organization contract under stated assumptions. | Per-deployment obligation ledgers and projected traces. | Cross-deployment traces need not be byte-equal; relevant observations must conform. |
| P11-INT-1 Interoperability | Organization IR gains no product command/state vocabulary to accommodate the second system. | Architecture diff and mapping residual audit. | Falsifier: adding a Paperclip/Hermes status enum to canonical work state. |
| P11-OPS-1 Operational | Recovery, upgrades, and observability are compared, not hidden behind happy-path equivalence. | Matched failure scenarios and operational residuals. | A system may be compatible under stronger assumptions; report the difference. |
| P11-ECO-1 Economic | Cost, latency, capacity, and human load use comparable units and uncertainty. | Normalized measurements and Pareto report. | Economic superiority is not semantic compatibility. |
| P11-FALS-1 Falsification | Every behavioral difference is assigned: irrelevant, permitted, approximation, incompatibility, or unresolved. | Zero-untriaged residual report. | An unexplained difference invalidates the portability conclusion. |

## P12 — deeper formal analyses

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P12-TYP-1 Type | Reference, schema, behavior, protocol, and effect checks state soundness domain. | Typed core and ill-typed counterexamples. | Opaque external code remains outside static soundness claims. |
| P12-GRA-1 Graph | Parent/dependency cycles, reachability, dead states, and structural cuts return witnesses. | SCC/reachability algorithms and minimal graphs. | Dynamic edges from opaque expressions yield unknown. |
| P12-TEMP-1 Temporal | Lifecycle safety/liveness results state finite bounds and fairness assumptions. | Model checker with counterexample traces/certificates. | Bounded success is not unbounded proof. |
| P12-LAT-1 Lattice | Capability delegation is monotone attenuating; information flows respect labels. | Partial-order containment and violating path witness. | Custom/opaque policy cannot be silently ordered. |
| P12-CTRL-1 Control | Retry/replan loops have ranking/progress functions or bounded escalation. | Cycle analysis and resource-weighted counterexample. | Environmental progress cannot be proved without assumptions. |
| P12-RES-1 Resource | Budget/capacity feasibility uses typed units, horizons, and arrival/service assumptions. | Constraint analysis and infeasible-core output. | Average capacity does not imply burst feasibility. |
| P12-VER-1 Verification | Every analysis result is proved, checked, bounded-tested, assumed, or unknown. | Result schema with model/version/bounds and optional certificate. | Falsifier: opaque predicate is treated as satisfiable proof. |
| P12-COMP-1 Composition | Analysis summaries compose only under declared interface assumptions. | Assume/guarantee summaries and composition checks. | Local deadlock freedom does not imply global deadlock freedom without boundary analysis. |

## P13 — ecosystem mappings

| ID / lens | Obligation | Mechanism and evidence | Boundary or minimal falsifier |
|---|---|---|---|
| P13-SEM-1 Semantic | Every mapping defines source/target semantic subsets and per-construct disposition. | Versioned mapping specification and coverage table. | Field-name similarity is not semantic equivalence. |
| P13-REF-1 Refinement | Export/import preserves claimed observations or reports exact loss. | Round trip where claimed and loss fixtures otherwise. | Noninvertible mappings cannot claim round-trip equivalence. |
| P13-INT-1 Interoperability | Wire compatibility, schema compatibility, behavioral compatibility, and semantic equivalence are separate claims. | Layered conformance matrix. | Passing protocol handshake proves none of the stronger layers alone. |
| P13-EVO-1 Evolution | Mapping support is version-ranged and unknown extensions are preserved safely or rejected. | Multi-version fixtures and extension round trips. | Silently dropping a future extension falsifies completeness. |
| P13-ADV-1 Adversarial | Imported specs, schemas, prompts, tools, and extensions are untrusted. | Resource limits, schema hardening, trust labels, malicious fixtures. | A valid external document can still request unsafe effects. |
| P13-STD-1 Standards | Adopt/embed/adapt/invent decisions are justified by semantic-domain comparison. | Decision record citing exact overlap and residuals. | Popularity or vendor authorship alone is not a semantic reason. |

## Audit closure rule

The lens audit closes for a checkpoint only when:

1. every required-lens row has an implementation owner;
2. every atomic obligation appears in the obligation ledger;
3. every affected language field appears in the semantic coverage ledger;
4. evidence records state model, version, bounds, environment, and provenance;
5. every assumption and unknown is visible to compatibility and compilation policy;
6. every falsifier has a negative test, generated counterexample, model-checking witness, or an explicit explanation
   of why it cannot yet be exercised;
7. no residual remains untriaged.

Passing this audit means the claims are completely accounted for. It does not mean every claim is proved; the
assurance status continues to state the actual strength of evidence.
