# Self-Driving Repository Template

Copy this directory into a GitHub repository to enable open-autonomy.

## Setup

1. Copy these files to the target repo root.
2. Run `bun install`.
3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
4. Set the GitHub variables and secrets listed in
   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
5. Confirm `bun run check` passes.
6. Run the planner workflow in dry mode.
7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.
8. Run one low-risk `/agent develop`.

This template assumes the target repo keeps the agent scripts in `scripts/` and
the workflows in `.github/workflows/`.
