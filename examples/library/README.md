# library open-autonomy example

This is a minimal full repository shape for using open-autonomy on a small
TypeScript library.

This cookbook is a pushable standalone repo: copy `examples/library/` into a
new GitHub repository, keep the local docs in `docs/`, and follow the local
roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).

It is intentionally small:

- issues can request bounded library and documentation edits
- the publisher can apply non-workflow docs changes
- CI runs library tests and open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/library/` into a new
GitHub repository, configure the model proxy URL, model names, budget variables,
and `MODEL_PROXY_ADMIN_TOKEN` secret used by the workflows, then run
`bun install` and `bun run check`.
