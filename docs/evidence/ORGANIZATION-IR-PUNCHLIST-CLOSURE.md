# Organization IR B0–P13 closure audit

Audit date: 2026-07-14. Branch: `experiment/organization-ir-v2`.

## Machine-accounted closure

- 199 exported public interfaces are field-matched to the semantic coverage registry by TypeScript AST.
- 110 formal lens obligations across B0 and P1–P13 are machine-matched to the lens-audit IDs.
- No obligation has an `unresolved` disposition.
- The audit residual registry is empty; its test requires exactly zero entries.
- The complete core gate passes: 344 tests, 2,206 expectations, zero failures; TypeScript and diff checks are clean.

## Cross-cutting gates

The P1–P4 foundation scenario resolves and normalizes a parameterized multi-module organization, checks deterministic
hashing/source projection and migration boundaries, and repeats byte-identically.

The P5–P10 vertical slice separates behavior/instruction semantics, component facets, constructive compatibility,
progressive lowering, a restartable Hermes-centered controller, and causal lifting/conformance. Its corpus includes
duplicate/reordered observations, restart and outbox replay, worker loss, lease fencing/reassignment, delayed human
answers, review rejection, retry/cost escalation, forged evidence, and unsupported lowering configurations. The
Hermes CLI observations are separately recorded in `P9-HERMES-LIVE-TRACE.md`.

P11 feeds identical canonical semantics through two dissimilar compositions and compares obligations, causal traces,
portable state, assumptions, losses, matched faults, and economics. P12 returns proved/violated/unknown bounded
analysis results with counterexamples and verifiable certificates. P13 declares versioned external subsets and exact
loss/extension behavior without conflating a descriptor with native wire conformance.

## Honest proof boundary

Closure means the written punch-list ACs have an implementation owner and passing falsification evidence at the
declared assurance level. It does not mean universal semantic preservation for every organization or provider,
unbounded liveness, complete native codecs for every external standard, production hardening, or theorem-prover
certification. Those stronger claims remain outside this punch list and are not residuals masquerading as failures of
the bounded claims.
