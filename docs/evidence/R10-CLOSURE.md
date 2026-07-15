# R10 closure

R10 closes only when identity, delegated authority, credential custody, revocation, replay, recovery, and emergency access are enforced as one independently testable security plane.

| Obligation | Constructive evidence |
|---|---|
| R10-SEC-1 | Tenant-composite namespaces distinguish human, service, provider, worker, and session identities. Signed provider-account links and signed ordered identity/link revocations are evaluated on every authorization. |
| R10-CAP-1 | Root authority requires externally verified evidence; children are structural subsets across every dimension; constraints are evaluated against request context; proofs bind request, audience, generation, key, nonce, and time. |
| R10-DIST-1 | Tenant-local sequences and watermarks prevent cross-tenant interference. Signed checkpoints retain nonce receipts, audits, revocations, tombstones, and custody outbox state. Ambiguous custody success and concurrent rotation converge through stable operation identities. |
| R10-OPS-1 | A workload-authenticated process-isolated store exercises issue, exchange, rotation, expiry, revocation, deletion, and tenant denial. Break-glass grants are root-authenticated, immediately nondelegable, short-lived, and require two independently signed full-statement approvals. |

Verification requires focused unit/integration tests, typecheck, the full core gate, ledger validation, and a final independent skeptical review with no unresolved acceptance-level blocker.
