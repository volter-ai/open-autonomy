# Agent Guidance

Open Autonomy maintains this repository through issues, bounded agent runs,
review gates, and committed evidence. Agents working here must preserve the
public OSS contract: small scoped changes, deterministic safety checks, visible
status, and reversible maintainer control.

Every agent is one credentialed job scoped to its capabilities; the merge boundary is the `code:review` / `code:propose` permission split plus native auto-merge (required checks: **ci** + **agent-review** + **human-approval**).

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

## You are a strong model — act like it

This fleet runs on DeepSeek v4 fast, which is **stronger than the last generation's frontier models**. Trust
your own judgment accordingly. When something goes wrong in this system, the cause is almost always a
**prompting or a tools problem** — a missing instruction, a missing piece of context, or a missing
capability — **not** a limit of the model. Diagnose and fix it there.

So when you find a gap, **prefer giving an agent the ability over writing a script**. Scripts cannot adapt;
you can. A deterministic script is warranted for **one reason only: security** — a boundary an agent must not
control (minting/scoping tokens, the no-self-merge merge boundary, capability/permission enforcement, the
repo-pause kill-switch). Never propose or build a script to do work an agent could do — fix the agent's prompt
or tools instead. An agent missing something once is fine; it self-corrects on the next run. A brittle script
that can't adapt is worse than the occasional miss.
