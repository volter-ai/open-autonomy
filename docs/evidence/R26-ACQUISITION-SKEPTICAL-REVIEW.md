# R26 Candidate-Certificate Acquisition Skeptical Review

Scope: exact candidate-product custody and certificate assembly. No live governance, security, rollout,
budget, assessment, or validator authority participated.

## Claims that survive review

- A manifest-custodied atomic input fixes the accepted R25 reference, baseline, candidates, objectives,
  constraints, and complete signed candidate manifest.
- The manifest induces exactly four approval cells and one assessment cell per candidate. No candidate,
  authority kind, approval, or assessment can be added after manifest acceptance.
- Manifest, assessment, governance, security, rollout, budget, and validator keys are globally distinct.
  Approval and evaluation domain signatures are retained inside independently bound envelopes.
- The validator decision is unavailable until every induced approval and assessment exists. Its signature
  covers the exact certificate assembled from those products.
- Persisted state rederives domains, descriptors, requests, signer assignments, predecessors, embedded
  signatures, validator signature, and final assembly digest.
- The complete two-candidate fixture reconstructs byte-semantically and passes the production verifier.

## Exercised attacks

Tests reject stage skipping, unregistered candidates, candidate or approval-kind substitution, authority
changes, forged envelopes and approvals, equivocation, cryptographic identity aliases, and persisted
request mutation. CLI issuance is durable before request exposure.

## Residual limitations

1. Custody signatures do not prove causal identification, held-out truth, or institutional authority.
2. The complete fixture is synthetic and executes no recommended patch.
3. One CLI writer is assumed per state path; issued immutable requests may execute concurrently.
4. This acquisition artifact is not itself engineering closure. Engineering closure still requires closed R7 and
   R25 pins plus a complete certificate evaluated inside their closed twin-conformant world. Real institutional
   authorities, independently administered assessment, and safe execution of a recommendation remain additive
   `external-validation` or downstream rollout evidence rather than being silently inferred here.

## Decision

The protocol is ready to acquire either scoped `twin-conformant-engineering` evidence or additive
`external-validation` evidence, but proves no R26 closure by itself and never turns simulated approvals or assessments
into claims about real institutional authority.
