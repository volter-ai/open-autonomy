# Agent Guidance

Open Autonomy maintains this repository through issues, bounded agent runs,
review gates, and committed evidence. Agents working here must preserve the
public OSS contract: small scoped changes, deterministic safety checks, visible
status, and reversible maintainer control.

Read these files before changing behavior:

- `docs/ARCHITECTURE.md` for the system model and document map.
- `docs/ROADMAP.md` for current direction and proof gates.
- `.open-autonomy/constitution.md` for non-negotiable operating principles.
- `.open-autonomy/policy.yml` for machine-readable autonomy limits.
- `.open-autonomy/review-rubric.yml` for review criteria.
- `.open-autonomy/standards/*.md` for code, docs, tests, and security rules.

Default to the existing TypeScript/Bun workflow and GitHub Actions patterns.
Do not introduce unrelated frameworks, hidden state, or silent no-op behavior.
