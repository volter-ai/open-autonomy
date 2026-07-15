# R17 independent skeptical review

The desired-state registry was reviewed adversarially across transaction, tenant-isolation, evolution, recovery, and information-preservation obligations. The review exercised concurrent revisions and promotions, ABA-safe generations, cross-tenant blob reachability, signed backup restoration, purge, point-in-time reconstruction, migration retries, and causal journal validation.

The reviewer found and repaired self-unrestorable post-purge backups, duplicate and unreachable blob injection, insufficient validation of purged journal revisions, non-monotonic event time, promotion after revocation, duplicate promotion approvers and roles, target mismatches, invalid branch sources, and purge-before-delete histories. Those counterexamples remain regression tests.

Evidence at closure:

- `bun test packages/core/src/organization-desired-state-registry.test.ts`: 16 passed, 53 assertions.
- `bunx tsc -p tsconfig.json --noEmit`: passed.
- `git diff --check`: passed for the scoped implementation.

No reproducible R17 blocker remained after remediation.
