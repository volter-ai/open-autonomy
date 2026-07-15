# R18 independent skeptical review

The portable event store was reviewed adversarially across algebraic replay, database isolation, privacy deletion, provenance, artifact authentication, crash recovery, and finite-resource behavior. The review exercised native authentication, tenant and authority separation, causal gaps, late and reordered events, exact replay, immutable snapshots, compaction, migrations and inverses, purge transactions, physical erasure, filesystem compare-and-swap, and tamper rejection.

The review found and drove fixes for unauthenticated capabilities and reducer/policy artifacts, mutable snapshots after purge, conflated logical redaction and physical-storage locations, non-idempotent external deletion, incomplete derivation closure, derivation artifacts not bound to the active reducer, missing aggregate byte bounds, ambiguous physical-verification status, and missing erase-before-local-commit recovery evidence. Those counterexamples remain regression tests.

The finite model is explicit: a tenant checkpoint admits at most 100,000 logical event positions, 1 MiB native envelopes, 10 MiB projections, 1,000 snapshots, and 64 MiB serialized authoritative state. Compaction authenticates a snapshot and removes redundant hot accepted payload copies; it does not advertise an unbounded archive tier or reset the logical event universe. Exceeding a declared bound is a typed rejection, not silent loss.

Evidence at closure:

- `bun test packages/core/src/organization-runtime-event-store.test.ts`: 19 passed, 65 assertions.
- `bunx tsc --noEmit`: passed.
- Independent exact-source re-review retracted stale authentication findings and found no correctness blocker after active-reducer binding and physical-status remediation.

No reproducible R18 falsifier remained within the declared finite model.
