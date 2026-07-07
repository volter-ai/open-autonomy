# Releasing `open-autonomy` to npm

See [`docs/OPERATIONS.md#release-process`](docs/OPERATIONS.md#release-process) for the full release
checklist (CHANGELOG entry → version bump everywhere → `bun run check` → `npm publish` →
**verify from the registry before tagging** → `git tag` → GitHub release) — including the npm-token
prerequisites and the hard-won gotchas (`.gitignore` stripping, `check:pack-smoke`, the source tree
lying about packaging), all folded in there so there is one release process, not two.
