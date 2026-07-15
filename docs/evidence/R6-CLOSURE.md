# R6 closure

R6 is closed only after the substrate SDK, nontrivial SDK-only provider, clean-room authoring evidence, published-TCK execution, adversarial review, typecheck, pack inspection, and full core gate passed.

| Obligation | Constructive evidence |
|---|---|
| R6-EXT-1 | `packages/sdk/src/index.ts`, `packages/substrate-toy/src/index.ts`, and the clean-room author feedback demonstrate registration without a core product switch. |
| R6-REF-1 | `StableCompilerPass.accounting` participates in sizing/cache identity and is projected into artifact obligations; the toy asserts exact retained obligations and declared loss. Migration removal is disposition-checked. |
| R6-OPS-1 | Executable bounded health and lifecycle contracts, deterministic faults, bounded JSON trace recording, monotonic opaque credentials, test doubles, and direct-operation validation have adversarial tests. |
| R6-DIR-1 | Core imports neither SDK nor provider; the toy source and TCK test import only the public SDK. |

Verification summary:

- Focused SDK/toy gate: 7 tests, 121 assertions.
- Compiler + SDK + toy gate after accounting promotion: 21 tests, 189 assertions.
- Full `bun run check:core`: pass.
- `bunx tsc -p tsconfig.json --noEmit`: pass.
- SDK `bun pm pack --dry-run`: exactly package manifest, README, and public index source.
- Independent clean-room repeat: pass; 3 applicable mandatory published TCK cases pass.
- Sixth skeptical review: PASS with all earlier counterexamples closed.
- Residuals: zero; non-blocking author-experience suggestions remain recommendations, not untriaged correctness claims.
