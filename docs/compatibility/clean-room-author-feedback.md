# R4 clean-room Python author feedback

This independent implementation demonstrates that the normative prose, generated field appendix, and generated JSON Schemas are sufficient to build a useful minimal interoperable reader without consulting the TypeScript implementation.

## Supported subset

The standard-library-only CLI in `independent/python/r4.py` accepts bounded JSON requests and supplies:

- `check`: stable diagnostic classes for request/schema, required field, structure, unknown top-level member, identifier, reference-sort/missing-reference, duplicate-edge, graph-cycle, and numeric-range failures.
- `canonical`: deterministic JSON text/UTF-8 bytes with UTF-16 object-key ordering and the specified `oa-c14n-v1`/domain NUL framing for SHA-256.
- `normalize`: a closed single-module subset. It validates first, materializes absent Organization IR catalogs, defaults `ImportDecl.required`, and supplies instruction precedence/conflict defaults. Imports are retained but are not fetched, linked, visibility-filtered, or reference-rewritten.
- `migrate-v1-v2`: the registered legacy shape is mapped into valid-shaped v2 actors, prompt behaviors, and placeholder capability declarations. The full source is retained in a namespaced extension and every known non-round-trip field family is emitted as an authorization-required loss.

The checker does not claim complete generated-schema validation, lifecycle/protocol analysis, effect and authority coverage, imported-module closure, or package resolution. The normalizer likewise does not claim closed-graph semantic normalization or cross-loader portable semantic digests.

## Specification feedback

The canonicalization prose is clear about UTF-16 order, negative zero, framing, and excluded annotations. A language-neutral conformance vector set should additionally pin difficult IEEE-754 spellings around `1e-6`, `1e21`, subnormal values, and halfway cases; Python's standard library has no direct ECMAScript number formatter. The clean-room implementation consequently uses Python's shortest-round-trip digits and mechanically adjusts decimal placement and exponent spelling at the ECMAScript thresholds; its local regression vectors document this boundary.

The migration section correctly requires registered edges and explicit losses, but the permitted v1→v2 mapping is not normatively described in the inspected sources. A migration-edge table should specify target names, trigger translation, legacy policy/resource meaning, and whether source retention in an extension satisfies provenance requirements.

Diagnostic class names and JSON request/response envelopes are not normative. Publishing a small language-neutral protocol and expected diagnostic-class taxonomy would make independent TCK adapters much less speculative.

## Deprecation and compatibility window

The v2 specification says deprecation retains meaning until a declared compatibility window ends, but the inspected materials do not state a duration or end release/date for `autonomy.ir.v1`. This implementation therefore treats v1 migration as experimental compatibility with no inferred sunset date. It never silently discards the source and requires authorization for the reported non-round-trip loss. A normative registry should publish the edge identifier, introduction release, minimum support window, and sunset criteria.
