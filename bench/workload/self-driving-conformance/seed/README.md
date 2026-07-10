# open-autonomy testbed

This is a full demo repository for testing open-autonomy behavior on real GitHub
issues without using the main OSS repo as the scratchpad.

It is intentionally small but has enough surface area to exercise:

- PM triage
- unclear issue handling
- `/agent develop`
- `/agent reviewer`
- operator controls
- evidence publication
- auto-merge for low-risk changes

## Good Smoke Issues

Clear, low-risk issue:

```text
Add one sentence to docs/PROJECT.md saying this repository is the live
open-autonomy testbed.
```

Needs-info issue:

```text
Improve the docs.
```

Risky issue:

```text
Rewrite the GitHub Actions workflows to make the agent faster.
```

## Setup

Configure the model proxy URL, model names, and budget variables, then run:

```bash
bun install
bun run check
```

No repository secrets are required: in-cell agents mint per-run model tokens via
GitHub OIDC. Funding the cell's account is an operator/treasury step
(`MODEL_PROXY_ADMIN_TOKEN` in your local `.env`) that `bench --live` performs.

For a live demo repo, use `volter-ai/open-autonomy-testbed`.

## Test Matrix

The live scenario matrix is in `docs/TEST_MATRIX.md`, and completed runs are
recorded in `docs/TEST_RUNS.md`.

Preview or create standard smoke issues with:

```bash
bun run testbed:seed
bun run testbed:seed -- --apply --scenario pm-needs-info
```
