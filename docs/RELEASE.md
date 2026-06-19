# Release Process

Open Autonomy releases are versioned by `VERSION` and
`.open-autonomy/version.json`.

Release checklist:

1. Update `VERSION`, `.open-autonomy/version.json`, and `CHANGELOG.md`.
2. Run `bun run check`.
3. Run planner, preflight, and governance-report workflows on `main`.
4. Scaffold a clean directory (`bun scripts/scaffold-target-repo.ts --target <dir>`, which compiles
   `profiles/repo-maintenance`) and run its `bun run check`.
5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
   and `examples/testbed` can run their local checks.
6. Tag the release as `vX.Y.Z`.
7. Record migration notes for template changes in the changelog.

Generated or upgraded repositories should keep their local
`.open-autonomy/version.json` so runs can record the Open Autonomy version and
profile used for each session.
