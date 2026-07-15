# R6 clean-room provider-author feedback

Date: 2026-07-15

## Verdict

**The prior R6 blockers are closed.** The updated public SDK material and SDK-only toy provider are sufficient to implement and test a nontrivial provider without editing core or importing core directly.

The SDK README now describes the required semantics for every provider collection, the public entry point exports both `runConformanceTck` and `ConformanceTestManifest`, and the toy provider supplies compileable examples with a nonempty adapter, lowering pass, native event lifter, and migration. Both provider and test import only `@open-autonomy/sdk`. The published compatibility test passes.

This verdict is scoped to the R6 extensibility claim demonstrated in the repository. More API reference material would improve usability, and an external published-package installation test would strengthen distribution confidence, but neither is a blocker to authoring the demonstrated nontrivial provider through the public SDK surface.

## Repeat independent assessment

Before re-reading the updated toy provider, I assessed the updated `packages/sdk/README.md`, `packages/sdk/src/index.ts`, and `packages/sdk/package.json` against the same provider design used in the initial clean-room review:

1. An identity-matched component manifest with interfaces, facets, state, trust, failure, topology, and evidence.
2. A directional adapter with versioned endpoints and explicit identity, causality, retry, conflict, loss, reversibility, and evidence semantics.
3. An audited organization lowering pass with artifact/capability declarations and source-obligation/loss accounting.
4. An exact-schema native lifter declaring portable types and preserving provenance in an `autonomy.event.v2` event.
5. A distinct-endpoint migration with dispositions for removed or transformed JSON pointers.
6. Bounded lifecycle operations returning exact criteria and evidence.
7. A substrate conformance hook run through the published TCK from the SDK entry point.

The README now states each of these requirements and identifies the builders and validation behavior. The exported builder signatures provide the callback contracts, while the SDK re-exports the structural TypeScript types required for compile-time authoring. The remaining field-level details can be followed from the referenced SDK-only toy example without consulting a core source file.

## Prior blocker closure

| Initial blocker | Updated evidence | Status |
| --- | --- | --- |
| Toy provider had empty adapters, passes, lifters, and migrations | Toy now registers `toy-work-bridge`, `toy-lower`, `toy-event-lifter`, and `toy-config-1-to-2` through SDK builders | Closed |
| TCK runner and manifest type required direct core imports | SDK now exports `runConformanceTck` and `ConformanceTestManifest`; toy test imports both from `@open-autonomy/sdk` | Closed |
| README did not explain the nontrivial contracts | `Required provider surface` documents adapter, pass, lifter, migration, lifecycle, and conformance requirements | Closed for R6 |
| No complete SDK-only authoring example | `packages/substrate-toy/src/index.ts` constructs every required nontrivial element with imports only from the SDK | Closed |
| No demonstrated compatibility workflow | README documents the workflow and the toy test loads the published manifest, invokes the SDK-exported runner, and checks applicable mandatory cases | Closed |

## Concrete result

Command:

```text
bun test packages/substrate-toy/src/index.test.ts
```

Result: 1 test passed, 0 failed, with 10 expectations. The test verifies nonempty adapter, pass, lifter, and migration registration; exercises health and teardown through public SDK adapters; runs the published TCK; and reports all three applicable mandatory observations passing.

## Remaining non-blocking guidance opportunities

- Add a standalone field-by-field API reference for the re-exported structural types. Today the toy example is necessary to see exact literals and nested shapes.
- Explain migration disposition coverage with rename, removal, arrays, and escaped JSON-pointer examples. The toy demonstrates preservation/transformation but not those edge cases.
- Publish typed conformance operation request/output mappings. `ProviderConformanceHook` still uses `string` and `unknown`, so operation schema mistakes are detected by the TCK rather than TypeScript.
- Add direct tests that execute the example adapter, lowering pass, lifter, and migration behavior, not only their registration/presence. This would increase behavioral confidence beyond the R6 authorability proof.
- Add an installation test from a package outside the workspace if `@open-autonomy/sdk` is intended for external registry consumption. Its current package metadata remains private and workspace-linked.

## R6 acceptance assessment

R6 should pass for the repository-scoped requirement: a provider author can build a nontrivial provider through the public SDK, with no core edit or direct core import, and run published compatibility through the SDK. The evidence now matches the closure test proposed in the initial review: nonempty adapter/pass/lifter/migration collections, SDK-only imports, and an SDK-owned TCK entry point.
