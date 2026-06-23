# Security Standards

- Never print secrets, bearer tokens, model proxy tokens, or private keys.
- Treat workflow, auth, deployment, dependency trust, and secret-handling changes
  as human-required unless explicitly approved by maintainers.
- The capability/permission split owns write safety: code:review (bless) and code:propose
  (perform) are never held by one agent, so no agent can land unreviewed code.
