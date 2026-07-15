# R0 phase-baseline closure evidence

R0 closed on 2026-07-15 after the initialized proof ledger, baseline manifest, threat/failure/economic inventory,
and two independent skeptical reviews were checked against all five formal R0 obligations.

## Reproducible commands and results

- `bun run runtime-ledgers:init`: generated the initial 121-obligation corpus, semantic/API fixture hashes, and the
  evidence-backed R0 closure corpus; validation returned no diagnostics.
- `bun test packages/core/src/organization-runtime-ledger.test.ts`: positive closure and minimal false-completion
  fixtures passed.
- `bun run check:core`: 865 passed, one declared live-only todo, zero failed.
- The exact remainder of root `bun run check`, resumed after the already-green core and conformance stages, passed:
  runtime sync; compile/profile/policy/setup-pack/no-profile-branching; CI/recommend/dispatch/doc/preflight/doctor;
  install detect/select/direction/authorize/execute/prove/handoff/full flow; dogfood/provision/supply-chain;
  public-agent/model-proxy/proof/SOC2/release; and packed-tarball smoke.
- `bunx tsc --noEmit` and `git diff --check` passed for the R0 implementation changes.

Two falsifiers discovered during the first full run were repaired and retained as regression evidence: the local CLI
is now compiled JavaScript instead of relying on optional Node TypeScript support, and TypeScript behavior resources
are executed with Bun while compiled control artifacts remain plain-Node compatible.

## Closure claim

The authoritative current state is `docs/runtime-ledgers/r0-closure.json`: R0 is `complete`, R1 is `ready`, all later
checkpoints remain `blocked`, every R0 obligation has semantic disposition, assurance, and evidence, and there are no
unowned R0 residuals. This does not discharge any R1–R28 obligation or claim that downstream threats are fixed.
