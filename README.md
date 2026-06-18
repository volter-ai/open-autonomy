# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://volter-agent-model-proxy.aaron-0ed.workers.dev/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)

`open-autonomy` is an open-source kit for making a GitHub repository drive its
own maintenance work through issues, bounded agent runs, review gates, and
operator controls.

This repository is also the first demo target: the `open-autonomy` repo is wired
to run open-autonomy against itself.

## What This Repo Is

This repo has three jobs:

- It is the canonical OSS implementation of the self-driving repository loop.
- It is a template source for installing that loop into other repositories.
- It is itself a self-driving target, so changes to open-autonomy can be driven
  by open-autonomy issues, workflows, skills, and gates.

The important distinction is that open-autonomy is not only a template. The
same scripts, workflows, skills, and control files shipped here are also active
in this repository.

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

## How The Pieces Fit

- Direction lives in committed docs and `.open-autonomy/roadmap.yml`.
- Agent roles live as repo-local Codex skills in `.codex/skills/`.
- `.open-autonomy/autonomy.yml` indexes the docs, skills, agent capabilities,
  triggers, and enforced policy.
- GitHub Actions are the runtime that turns that config into PM, planner,
  develop, review, merge, preflight, and upgrade workflows.
- The model proxy gives agent jobs bounded model access without exposing raw
  provider keys.
- The publisher and merge gate are trusted deterministic code. The developer
  agent is untrusted and can only emit a proposed bundle.

## Repository Layout

- `.github/workflows/` - self-driving workflows for this repo.
- `.open-autonomy/` and `AGENTS.md` - planner-readable direction,
  constitution, policy, rubric, and standards.
- `scripts/public-agent-*` - command parsing, policy, PM dispatch, planner,
  review, CI, merge-gate, status, and control logic.
- `scripts/github-agent-session.ts` - session wrapper that emits publisher
  bundles and evidence.
- `scripts/codex-agent-run.ts` - Codex runner configured for the bounded model
  proxy.
- `services/agent-model-proxy/` - Cloudflare Worker for bounded model access.
- `templates/self-driving-repo/` - copyable starter for another self-driving
  repository.
- `examples/docs-only/` - minimal full-repo example.
- `examples/small-app/` - small TypeScript app cookbook.
- `examples/library/` - small TypeScript library cookbook.
- `examples/testbed/` - full demo repo for live PM/operator/develop testing.
- `docs/` - architecture, runbook, rollout, and the continuous roadmap.

Start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the master map
of the system, agent roles, trust boundaries, and how the docs fit together.
Use [`docs/ROADMAP.md`](./docs/ROADMAP.md) as the single source for roadmap,
proof-gate, and next-step planning.

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

`open-autonomy` is both the reusable kit and its own self-driving repo. To make
another self-driving repo, use `templates/self-driving-repo/` as the starting
point, then follow
[`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

The short version:

1. Copy the template into the target repository:
   ```bash
   bun run scaffold -- --target ../my-repo
   ```
2. Edit `AGENTS.md` and `.open-autonomy/*` for that repository's direction,
   policy, rubric, and standards.
3. Deploy or reuse the model proxy.
4. Set GitHub variables and secrets.
5. Run `bun run check`.
6. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.
7. Run the planner workflow in dry mode.
8. Create one low-risk issue with concrete acceptance criteria.
9. Prove both entry points:
   - comment `/agent develop` to test direct maintainer dispatch
   - run `Public Agent PM` with a small limit to test PM triage and dispatch

## Commercial Boundary

`open-autonomy` is the OSS implementation. `volter-autonomy` can build on it as
a paid hosted product with managed proxy infrastructure, dashboards, org policy,
and support.

## License

Apache-2.0.
