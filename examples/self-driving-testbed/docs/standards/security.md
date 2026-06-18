# Security Standards

- Never print secrets, bearer tokens, model proxy tokens, or private keys.
- Treat workflow, auth, deployment, dependency trust, and secret-handling changes
  as human-required unless explicitly approved by maintainers.
- Publisher policy owns write safety. Reviewer risk judgment is additive and
  cannot override deterministic publisher rejection.
