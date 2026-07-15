# R8 closure

R8 is closed only after canonical rebuild, independent signature and provenance verification, operational promotion, live-instance traceability, standards counterexamples, typecheck, full core gate, and sixteen-cycle skeptical review passed.

| Obligation | Constructive evidence |
|---|---|
| R8-ALG-1 | Canonical locked inputs reproduce byte-identical content addresses; semantically ordered lists remain ordered while set-like inventories canonicalize by unique identity. |
| R8-SEC-1 | Closed shapes, exact inventory reconstruction, trust quorums, recursive secret rejection, SPDX 2.3 ownership and package verification codes, and SLSA v1 provenance fail closed under substitution. |
| R8-OPS-1 | Signed environment releases bind only declared secret references and promote immutable semantics without invoking compilation; migrations, probes, observations, and rollback references close. |
| R8-PROV-1 | Signed live attestations resolve an instance to the exact release, bundle, organization, compiler, component set, tenant, and environment. |

Verification summary:

- Focused deployment-bundle gate: 15 tests, 96 assertions.
- SPDX timestamps, URIs, creators, checksums, relationships, and package verification codes are validated against their standard meanings.
- SLSA subjects and resolved dependencies close exactly over native outputs and canonical inputs.
- Full `bun run check:core`: pass.
- `bunx tsc -p tsconfig.json --noEmit`: pass.
- Sixteenth skeptical review: PASS.
- Residuals: zero.
