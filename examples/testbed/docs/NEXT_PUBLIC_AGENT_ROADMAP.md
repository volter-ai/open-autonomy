# Self-Driving Repository Roadmap

This repository uses open-autonomy to run bounded agent work from GitHub issues.

## Initial Checklist

- Configure repository variables and secrets.
- Confirm `bun run check` passes.
- Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
  `/agent resume`.
- Run one low-risk `/agent develop`.
- Review the generated PR evidence before enabling PM sweeps.

## Operating Goals

- Keep agent permissions least-privilege.
- Keep publisher policy deterministic.
- Keep all autonomous merges tied to current CI, current review, and current PR
  head SHA.
- Escalate unclear, risky, or repeatedly failing work to humans.
