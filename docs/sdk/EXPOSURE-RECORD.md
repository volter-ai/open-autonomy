# R6 clean-room exposure record

Date: 2026-07-15

This is the cumulative exposure record for the initial assessment and the requested repeat assessment. No core implementation file was opened and no product code was edited. The only files created or updated by this reviewer are the two files listed at the end.

## Initial assessment exposure

1. Confirmed the working directory with `pwd`.
2. Used `rg --files -g 'AGENTS.md' -g '!node_modules' -g '!packages/sdk/src/**' . | head -50`. This exposed only the paths `./AGENTS.md` and `./profiles/self-driving/AGENTS.md`; neither file's contents were read.
3. Read `packages/sdk/README.md`.
4. Read `packages/sdk/src/index.ts`, the public SDK entry point and exported contracts.
5. Read `packages/sdk/package.json`.
6. Fixed the independent provider design before inspecting the toy package.
7. Listed the paths below `packages/substrate-toy`, exposing its package manifest, source, and test paths.
8. Read `packages/substrate-toy/package.json`, `packages/substrate-toy/src/index.ts`, and `packages/substrate-toy/src/index.test.ts`.
9. Ran `bun test packages/substrate-toy/src/index.test.ts`. The test process consumed `docs/conformance/tck-v1.json` only to run published compatibility; the JSON was not separately printed or used for provider design.
10. Created `docs/sdk/clean-room-author-feedback.md` and `docs/sdk/EXPOSURE-RECORD.md`.
11. Ran a path-scoped `git status --short` for those two documentation files.

The initial test reported 1 pass, 0 failures, and 6 expectations. The initial report found blockers because the then-current toy collections were empty and its test imported the TCK runner/type from core.

## Repeat assessment exposure

1. Re-read the updated `packages/sdk/README.md`, `packages/sdk/src/index.ts`, and `packages/sdk/package.json`.
2. Repeated the independent assessment against the original nontrivial provider design before inspecting the updated toy source.
3. Re-read `packages/substrate-toy/package.json`, `packages/substrate-toy/src/index.ts`, and `packages/substrate-toy/src/index.test.ts`.
4. Ran `bun test packages/substrate-toy/src/index.test.ts`. The test again consumed `docs/conformance/tck-v1.json` solely for published compatibility; the reviewer did not separately print or inspect it.
5. Read the existing contents of `docs/sdk/clean-room-author-feedback.md` and `docs/sdk/EXPOSURE-RECORD.md` to update the prior verdict accurately.
6. Updated only those two documentation files.

The repeat test used Bun 1.3.14 and reported 1 pass, 0 failures, and 10 expectations. It completed in approximately 3.11 seconds.

## Explicit non-exposure

- No file below `packages/core` was opened or searched for content.
- No repository test other than `packages/substrate-toy/src/index.test.ts` was opened or run.
- `docs/conformance/tck-v1.json` was consumed only by the compatibility test, not read for provider design.
- No SDK declaration beyond the public `packages/sdk/src/index.ts` entry point was read.
- No documentation below `docs/sdk` other than these two reviewer-owned assessment files was read.
- No network source was consulted.

## Files created or updated

- `docs/sdk/clean-room-author-feedback.md`
- `docs/sdk/EXPOSURE-RECORD.md`
