# R22 Benchmark-Campaign Acquisition Skeptical Review

Scope: causal acquisition, custody, and exact campaign assembly. No external benchmark, human study,
identity validation, consent process, or independent execution was performed.

## Claims that survive review

- A signed registration fixes raters, items, randomized trials, and the exact criterion, enrollment,
  trial, custody-attack, rater-item, and trial-cost domains before their evidence is requested.
- Registration, collector, five criterion, every rater, trial-custodian, and attack-custodian keys are
  globally distinct by cryptographic fingerprint.
- Requests bind the campaign manifest, exact descriptor and ordinal, assigned signer, and causal
  predecessor response digests. Enrollment follows privacy approval; trials and attacks follow all
  criteria; ratings follow enrollment; costs follow both cost approval and the referenced trial.
- Criterion, enrollment, rating, and cost fragments retain their domain signatures. Acquisition
  envelopes add request/fragment binding and reject substitution, forgery, or authority reuse.
- Analysis is unavailable until every induced cell is accepted. The collector then signs the exact
  campaign consumed by the R22 verifier.
- Persisted state rederives requests and domains and revalidates every signature, join, prerequisite,
  final candidate, and assembled digest.
- The complete 60-trial, 6-attack, 60-rating, 300-cost fixture reconstructs exactly and passes the real
  R22 campaign verifier.

## Exercised attacks

Tests reject missing predecessors and cells, cell substitution, wrong authority, forged signatures,
equivocation, duplicate cryptographic identities, and pending-request mutation across restart. CLI
issuance is durable before request exposure.

## Residual limitations

1. Signed custody does not prove that a criterion, observation, identity, consent, rating, or cost is
   true. The trust module and final R22 verifier remain authoritative for semantic validity.
2. The end-to-end fixture is synthetic and establishes no independent workload, environment, human,
   scorer, privacy, cost, trial, or attack authority.
3. One CLI writer is assumed per state path; already issued immutable cell requests may execute in
   parallel.
4. R22 remains blocked on closed dependencies and a genuine externally administered campaign.

## Decision

The causal exact-cell protocol is ready to acquire a real R22 campaign but proves no R22 closure by
itself.
