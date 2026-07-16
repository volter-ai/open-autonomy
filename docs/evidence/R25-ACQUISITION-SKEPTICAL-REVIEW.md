# R25 Calibration Acquisition Skeptical Review

Scope: leakage-safe evidence custody and exact calibration assembly. No external provider, population,
source, outcome, or estimator authority participated.

## Claims that survive review

- The acquisition registry freezes train-source, held-source, case, and parameter-path domains. Signed
  preregistration must exactly match those domains, the case manifest, dependency digests, and twin
  specification digest.
- Dependency, model, training-source, case, identifiability, preregistration, prediction, held-source,
  outcome, analysis, and disposition keys are cryptographically distinct.
- Specification, dependencies, training sources, cases, and parameter ledger precede identifiability;
  identifiability precedes preregistration; each prediction follows preregistration and its frozen case;
  each outcome follows both its prediction and referenced held-out source.
- Analysis is unavailable until all held sources, predictions, and outcomes exist. Disposition follows
  analysis and determines the exact closure/status fields assembled for the production verifier.
- Persisted state rederives every domain, request, signer, predecessor, signed fragment, and assembly
  digest. Signed response-envelope digests preserve causal binding without rehashing large fragments.
- The complete 20-case fixture reconstructs byte-semantically and passes the production verifier.

## Exercised attacks

Tests reject stage skipping, source and case substitution, authority changes, forged envelopes,
equivocation, cryptographic identity aliases, and pending-request mutation across restart. CLI issuance
is durable before request exposure.

## Residual limitations

1. Custody signatures do not establish source, population, trace, outcome, or estimator truth.
2. The end-to-end fixture is synthetic and cannot establish absence of external contamination.
3. One CLI writer is assumed per state path; issued immutable requests may execute concurrently.
4. R25 remains blocked on closed dependencies and genuine external execution.

## Decision

The protocol is ready to acquire a real R25 calibration but proves no R25 closure by itself.
