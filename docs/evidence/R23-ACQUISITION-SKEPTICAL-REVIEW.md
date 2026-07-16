# R23 Autonomy-Accounting Acquisition Skeptical Review

Scope: exact product-domain acquisition and assembly. No live provider account, invoice, compute meter,
human participant, identity check, or consent administration was used.

## Claims that survive review

- Registration fixes work, attempts, providers, humans, tasks, horizons, dependencies, and accounting
  digests. It induces exactly eight evidence domains totaling 33 cells in the full fixture.
- Registration, collector, privacy, event, normalization, every provider, and every human key are
  cryptographically distinct. Attempt provider selection is explicit at issuance, limited to the
  registered provider set, and immutable after persistence.
- Work records follow all attempts for that work. Invoices follow normalization and all attempts.
  Allocations follow their exact attempt, invoice dimension, and normalization registry. Human timing
  follows enrollment and terminal work; interruption and escalation records follow terminal work.
- Every fragment retains its domain signature and is additionally bound to its immutable request,
  descriptor, signer, predecessor response digests, and campaign manifest.
- Summary submission is collector-custodied because R23 defines no independent analysis authority.
  It is not trusted directly: the final collector signature covers the exact campaign, and the R23
  verifier deterministically recomputes all 17 metrics, transfer statistics, and accounting totals.
- Persisted state rederives every domain, request, signer selection, prerequisite, candidate digest,
  embedded signature, and final assembly digest.
- The complete fixture reconstructs byte-semantically and is accepted by the production verifier.

## Exercised attacks

Tests reject missing causal predecessors, absent or unregistered attempt providers, fragment
substitution, authority changes, forged signatures, equivocation, duplicate cryptographic identities,
and immutable provider-assignment mutation across restart. CLI issuance is durable before exposure.

## Residual limitations

1. Signatures prove custody, not invoice, usage, timing, consent, or event truth.
2. The end-to-end campaign is synthetic and establishes no independent provider or human authority.
3. One CLI writer is assumed per state path; issued immutable requests may execute concurrently.
4. R23 remains blocked on closed dependencies and genuine external execution.

## Decision

The protocol is ready to acquire a real R23 campaign but proves no R23 closure by itself.
