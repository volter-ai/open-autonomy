# small-app open-autonomy example

This is a minimal full repository shape for using open-autonomy on a small
TypeScript application.

It is intentionally small:

- issues can request bounded app and documentation edits
- the publisher can apply non-workflow docs changes
- CI runs app tests and open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/small-app/` into a new
GitHub repository, configure the variables and secrets from
`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, and run the smoke checklist.
