# Agent Guidance

Open Autonomy maintains this repository through issues, bounded agent runs,
review gates, and committed evidence. Agents working here must preserve the
public OSS contract: small scoped changes, deterministic safety checks, visible
status, and reversible maintainer control.

Every agent is one credentialed job scoped to its capabilities; the merge boundary is the `code:review` / `code:propose` permission split plus native auto-merge (required checks: **ci** + **agent-review**).

Operator commands (`/agent launch`, `/agent pause`, etc.) are maintainer-only (OWNER/MEMBER/COLLABORATOR); launch an agent by name, e.g. `/agent developer`.

Read these files before changing behavior:

- `docs/ARCHITECTURE.md` for the system model and document map.
- `docs/ROADMAP.md` for current direction.
- `docs/LIVE_TESTING_STRATEGY.md` for how the live testbed proves every feature
  without fakery (setup, coverage, and the proctor playbook).
- `docs/CONSTITUTION.md` for non-negotiable operating principles.
- `.open-autonomy/review-rubric.yml` for review criteria.
- `docs/standards/*.md` for code, docs, tests, and security rules.
- `.codex/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` for repo-local agent skills.
- `.open-autonomy/autonomy.yml` for docs, skills, agents, triggers,
  capabilities, and enforced policy.

Default to the existing TypeScript/Bun workflow and GitHub Actions patterns.
Do not introduce unrelated frameworks, hidden state, or silent no-op behavior.
