# Self-Driving Repository Template

Copy this directory into a GitHub repository to enable open-autonomy.

## Setup

1. Copy these files to the target repo root.
2. Run `bun install`.
3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
4. Set the repository variables and secrets listed in
   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
5. Confirm `bun run check` passes.
6. Run the planner workflow in dry mode.
7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.

## First Issue Flow

Use the first low-risk issue to prove the template works in the new repository:

1. Open a small docs-only issue with clear acceptance criteria.
2. Add the configured variables and secrets from
   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
4. Confirm the resulting PR or status comment reflects the issue context and
   the repository checks still pass.

This template assumes the target repo keeps the agent scripts in `scripts/` and
the workflows in `.github/workflows/`.
