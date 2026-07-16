# R21 Disaster-Campaign Acquisition Skeptical Review

Scope: acquisition custody and exact-domain assembly. No real multi-region deployment, provider
billing, disaster, KMS operation, or unfamiliar human recovery was performed.

## Claims that survive review

- The signed registration deterministically induces service×region×ramp/soak,
  fault×region, lifecycle×service, and per-service billing domains. Operator identities and billing
  assignments are externally registered, satisfy declared minimum cardinalities, and cannot be
  invented after collection starts.
- Registration, telemetry, fault, lifecycle, billing, operator, custodian, and collector keys are
  globally distinct by cryptographic fingerprint.
- Every immutable request binds its category, exact cell descriptor, ordinal, authority, campaign,
  and registration response. Responses from another category, billing authority, operator, or cell
  are rejected.
- Operator rows retain both the assigned operator signature and distinct custodian signature.
- Final collection is unavailable until all five exact domains are complete. The collector signs
  the exact category-ordered campaign consumed by the R21 verifier.
- Persisted state rederives all domains and requests, revalidates signatures and joins, and rejects
  omitted predecessors, substituted cells, forged responses, equivocation, or assembly drift.
- The complete 8-service, 2-region fixture was collected in reverse order within every category,
  reconstructed byte-semantically, and accepted by the real R21 verifier.

## Exercised attacks

Tests reject missing cells, nonregistered cells, category/cell substitution, wrong authorities,
forged signatures, duplicate cryptographic identities, and pending-request mutation across restart.
CLI issuance is durable before request exposure.

## Residual limitations

1. Acquisition authenticates custody, not telemetry or invoice truth. The final trust module and R21
   verifier remain authoritative for SLOs, costs, fault causality, recovery cuts, lifecycle changes,
   billing conservation, and operator chronology.
2. The end-to-end fixture is synthetic and does not establish independent services, regions,
   providers, KMS custody, or human unfamiliarity.
3. One CLI writer is assumed per state path; immutable category requests may execute concurrently.
4. R21 remains blocked on closed R20 evidence and genuine externally administered execution.

## Decision

The exact-cell acquisition protocol is ready to collect a real R21 campaign but proves no R21
closure by itself.
