# Open Autonomy substrate SDK

Create a provider entirely outside core by defining a validated component manifest, directional adapters, closed compiler-pass declarations, exact-schema event lifters, migrations with field dispositions, executable health and lifecycle criteria, and conformance hooks. `defineProvider` rejects missing health, upgrade, rollback, teardown, or substrate-conformance contracts. `conformanceProvider` exposes the definition to the public black-box TCK without adding a product switch.

Provider credentials are opaque broker references; never place secret material in artifacts or traces. Use the deterministic fault scheduler, trace recorder, and scripted provider double to test recovery and evidence before running the TCK. `compatibilityManifest` advertises applicability only—it never turns a provider claim into a passing observation.

## Required provider surface

Call every builder before `defineProvider`; raw passes, lifters, and migrations are rejected. A definition has these fields:

- `id` and `version`: exactly equal the component manifest identity.
- `manifest`: a complete `ComponentManifestV2`, including interfaces, state semantics, trust, failure, topology, and evidence.
- `adapters`: `defineAdapter` results. Declare source/target versioned schemas; direction (`lowering`, `lifting`, `bridge`, or `enforcement`); interface mappings; identity, causality, retry, and conflict semantics; pre/postconditions; losses; reversibility; and evidence.
- `passes`: `defineLoweringPass(pass, accounting)` results. The pass names an audited `organization.lower` or `organization.emit` implementation, artifact levels/kinds, ambient capabilities, and readable/writable artifacts. Accounting must name source obligations and all known losses.
- `lifters`: `createNativeLifter` results. Match provider/schema/version exactly, declare every emitted portable event type, preserve the native provenance URI, and emit `autonomy.event.v2`.
- `migrations`: `defineMigration` results. Use distinct version endpoints and return a disposition for every removed or transformed JSON pointer. Undisclosed removal is rejected.
- `health`: executable check name, exact success criterion, positive timeout, and interval.
- `lifecycle`: descriptions plus exact upgrade precondition, rollback criterion, and teardown criterion.
- `operations`: async provision, health, upgrade, rollback, and teardown functions. Every result must repeat the operation's exact criterion, include evidence, and mark failed outcomes as requiring recovery.
- `conformance`: claimed levels, supported published operation ids, and an invocation hook returning observable output and evidence. Every provider must claim `substrate`; claims are tested, not trusted.

The returned definition is a frozen snapshot. The SDK captures callbacks and criteria at definition time, so later mutation of the caller's input cannot alter registered behavior.

## Test workflow

Convert the definition with `conformanceProvider`, load the published `ConformanceTestManifest`, and call the SDK-exported `runConformanceTck`. Filter mandatory cases to the levels the provider claims; all applicable cases must pass. Exercise lifecycle functions directly with `executeProviderOperation`, inject faults with `DeterministicFaultScheduler`, and retain bounded observations with `TraceRecorder`. See `@open-autonomy/substrate-toy` for a provider containing a real adapter, lowering pass, event lifter, migration, lifecycle implementation, and published-TCK hook while importing only this package.
