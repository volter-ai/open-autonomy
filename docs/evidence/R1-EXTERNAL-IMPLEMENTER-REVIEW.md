# R1 external implementer review

Checkpoint: R1 — Normative Organization IR v2 specification  
Review mode: independent, read-only clean-room review by a separate agent  
Review target: specification, field appendix, generated machine grammar, parser, semantic validator, and executable examples

## Initial review and dispositions

The initial review rejected closure. The following findings were treated as blockers rather than documentation
suggestions:

| Finding | Disposition and evidence |
|---|---|
| Grammar delegated circularly to TypeScript | Resolved: the field appendix is normative, TypeScript is explicitly non-normative, and a generated closed JSON Schema is published. |
| Appendix omitted per-field type, optionality, default, order, reference sort, and unknown-field behavior | Resolved by the generated field table and closed-schema drift tests. |
| YAML values were cast without structural validation | Resolved by `validateOrganizationStructure` before semantic validation; malformed scalar and unknown-member falsifiers execute in `organization-spec.test.ts`. |
| YAML subset and duplicate/alias behavior were unspecified | Resolved normatively and enforced by the closed YAML reader; duplicate, anchor/alias, and non-finite fixtures execute. |
| Instruction normalization and conflict behavior were underdefined | Resolved in specification sections 4 and 6, including precedence, role mapping, priority, IDs, and unsupported `most-restrictive`. |
| Imports, visibility, and optional-import failure were underdefined | Resolved in section 6 and cross-checked by the module resolver suite. |
| Canonicalization and annotation digest status were underdefined | Resolved in section 5 with algorithm/domain framing and semantic/nonsemantic annotation rules. |
| Reference and graph checks were incomplete | Resolved for behavior I/O, relation/goal constraints, measure types, context compaction, budget and behavior cycles, and duplicate graph edges. |
| Protocol and lifecycle coherence were structurally weak | Resolved with state, role, message, transition, initial, terminal, and duplicate checks. |
| Authority/effect validity was not defined | Resolved in section 7 and cross-checked by behavior-contract/assignment tests; conditional or opaque containment does not become a grant. |
| Positive/negative examples were too narrow | Resolved with executable wrong-sort, malformed structure, graph, reference, YAML-boundary, module, instruction, canonicalization, and authority falsifiers. |

## Re-review

The first re-review again rejected closure. Its nine blockers were dispositioned as follows:

| Re-review blocker | Disposition |
|---|---|
| Appendix/prose default contradiction | Regenerated defaults for root catalogs, imports, instructions, layers, priority, and initial state. |
| Duplicate lifecycle transitions accepted | Defined edge identity as `(from,to,event)`, implemented expansion/deduplication, and added a falsifier. |
| Conditional/scoped grants allowed invocation | Invocation now blocks every conditional authority result unless a future explicit authorization step discharges it. |
| Reversibility ignored | Defined absent-as-wildcard/equal-when-present compatibility and implemented/tested it. |
| Digest projection irreproducible | Added complete normative qualification, elaboration, stripping, projection, framing, and idempotence procedure. |
| Imported logical identity unverifiable | Added `ImportDecl.module` and loader mismatch rejection; omission is explicitly implementation-defined and nonportable. |
| Namespace grammar implementation-only | Added the exact normative grammar and document-reader validation. |
| Behavior cycles implementation-only | Added behavior composition to the normative acyclic graphs. |
| Protocol coherence implementation-only | Added normative role/message/session rules matching the validator, including duplicate endpoints. |

The final targeted independent verdict follows.

A second targeted audit found four residual blockers. All were resolved and assigned executable falsifiers:

- omitted instruction and initial-state defaults now normalize identically to explicit defaults;
- duplicate behavior-composition edges now reject;
- duplicate effective import namespaces now reject at the public reader boundary;
- equal-layer/equal-priority `higher-precedence` conflicts now reject instead of selecting by incidental array order.

A final cross-language audit found that “JSON spelling” and “lexical key order” were not unique across languages.
`oa-c14n-v1` now normatively adopts RFC 8785/JCS, rejects lone surrogates, and has exponent-boundary plus
astral/BMP UTF-16 ordering conformance vectors.

Final verdict: **PASS**. The independent reviewer reran 46 targeted R1 tests, including the adversarial cases above,
and found no remaining ambiguity allowing two conforming readers to assign incompatible portable meaning within R1
scope. This verdict followed three prior rejection rounds; the intermediate failures are retained above as evidence
that the review acted as a falsifier rather than a ceremonial approval.
