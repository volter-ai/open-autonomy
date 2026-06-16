# open-autonomy

`open-autonomy` is an open-source kit for making a GitHub repository drive its
own maintenance work through issues, bounded agent runs, review gates, and
operator controls.

This repository is also the first demo target: the `open-autonomy` repo is wired
to run open-autonomy against itself.

## What It Does

```text
issue or PM sweep
  -> visible /agent develop
  -> GitHub Actions setup + policy + triage
  -> bounded Codex runner through the model proxy
  -> trusted publisher validates and opens/updates a PR
  -> CI + reviewer
  -> deterministic merge gate
  -> merge or human-required escalation
```

The agent can propose changes. Deterministic gates decide whether those changes
can be published, reviewed, and merged.

## Repository Layout

- `.github/workflows/` - self-driving workflows for this repo.
- `scripts/public-agent-*` - command parsing, policy, PM dispatch, review, CI,
  merge-gate, status, and control logic.
- `scripts/github-agent-session.ts` - session wrapper that emits publisher
  bundles and evidence.
- `scripts/codex-agent-run.ts` - Codex runner configured for the bounded model
  proxy.
- `services/agent-model-proxy/` - Cloudflare Worker for bounded model access.
- `templates/self-driving-repo/` - copyable starter for another self-driving
  repository.
- `examples/docs-only/` - minimal full-repo example.
- `examples/testbed/` - full demo repo for live PM/operator/develop testing.
- `docs/` - architecture, runbook, rollout, and roadmap.

Start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the master map
of the system, agent roles, trust boundaries, and how the docs fit together.

## Checks

```bash
bun install
bun run check:public-agent
bun run check:agent-proxy
bun run check
```

## Commands

- `/agent develop` - ask the agent to work on an issue.
- `/agent review` - run the reviewer on an agent PR.
- `/agent pause` and `/agent resume` - pause or resume issue-level work.
- `/agent pause repo` and `/agent resume repo` - pause or resume the whole repo.
- `/agent status` - show issue agent state.
- `/agent retry` - rerun failed infrastructure jobs without a fresh develop pass.
- `/agent cancel` - cancel active workflow runs and revoke active proxy runs.

## Setup Another Repo

Use `templates/self-driving-repo/` as the starting point, then follow
[`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

The short version:

1. Copy the template into the target repository:
   ```bash
   bun run scaffold -- --target ../my-repo
   ```
2. Deploy or reuse the model proxy.
3. Set GitHub variables and secrets.
4. Run `bun run check`.
5. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.
6. Run one low-risk `/agent develop`.

## Commercial Boundary

`open-autonomy` is the OSS implementation. `volter-autonomy` can build on it as
a paid hosted product with managed proxy infrastructure, dashboards, org policy,
and support.

## License

Apache-2.0.
