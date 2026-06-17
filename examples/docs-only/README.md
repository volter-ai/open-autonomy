# docs-only open-autonomy example

This is a minimal full repository shape for using open-autonomy on a
documentation-only project.

It is intentionally small:

- issues can request documentation edits
- the publisher can apply non-workflow docs changes
- CI runs the open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/docs-only/` into a new
GitHub repository, configure the model proxy URL, model names, budget variables,
and `MODEL_PROXY_ADMIN_TOKEN` secret used by the workflows, then run
`bun install` and `bun run check`.
