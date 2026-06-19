# Code Standards

- Prefer existing Bun and TypeScript helpers over new dependencies.
- Keep scripts deterministic and CLI-testable.
- Validate structured inputs and write structured outputs.
- Do not hide failed decisions behind successful exits unless a later step makes
  the state visible.
