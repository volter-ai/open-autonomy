# Agent Guidance

Open Autonomy maintains this repository through issues, bounded agent runs,
review gates, and committed evidence. Agents working here must preserve the
public OSS contract: small scoped changes, deterministic safety checks, visible
status, and reversible maintainer control.

Read these files before changing behavior:

- `docs/ARCHITECTURE.md` for the system model and document map.
- `docs/ROADMAP.md` for current direction.
- `docs/CONSTITUTION.md` for non-negotiable operating principles.
- `.open-autonomy/review-rubric.yml` for review criteria.
- `docs/standards/*.md` for code, docs, tests, and security rules.
- `.codex/skills/open-autonomy-*/SKILL.md` for repo-local agent skills.
- `.open-autonomy/autonomy.yml` for docs, skills, agents, triggers,
  capabilities, and enforced policy.

Default to the existing TypeScript/Bun workflow and GitHub Actions patterns.
Do not introduce unrelated frameworks, hidden state, or silent no-op behavior.
