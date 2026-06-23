# open-autonomy Production Rollout

Use this checklist before enabling open-autonomy on a repository.

## Required Configuration

Repository variables:

- `MODEL_PROXY_URL`
- `MODEL_PROXY_OIDC_AUDIENCE`
- `PUBLIC_AGENT_MODELS`
- `PUBLIC_AGENT_MODEL`
- `PUBLIC_AGENT_TRIAGE_MODEL`
- `PUBLIC_AGENT_PM_MODEL`
- `PUBLIC_AGENT_REVIEW_MODEL`
- `PUBLIC_AGENT_MAX_USD_CENTS`
- `PUBLIC_AGENT_TRIAGE_MAX_USD_CENTS`
- `PUBLIC_AGENT_PM_MAX_USD_CENTS`
- `PUBLIC_AGENT_REVIEW_MAX_USD_CENTS`
- `PUBLIC_AGENT_MAX_REQUESTS`
- `PUBLIC_AGENT_MAX_DEVELOP_ATTEMPTS`
- `PUBLIC_AGENT_MAX_OPEN_AGENT_PRS`
- `PUBLIC_AGENT_STALE_NEEDS_INFO_MINUTES`
- `PUBLIC_AGENT_PM_LIMIT`
- `PUBLIC_AGENT_ALLOWED_PATHS`
- `PUBLIC_AGENT_REPO_PAUSED`

Repository secrets:

- none required for model access: in-cell agents mint and exchange bounded
  per-run model tokens via GitHub OIDC; no admin token lives in the repo.
- `PUBLIC_AGENT_TRIGGER_TOKEN` if PM-triggered comments must use a token with
  enough permissions to trigger follow-on workflows.

Model proxy deployment:

- Set provider API keys and model names.
- Set `MODEL_PRICES_JSON`.
- Choose production limits for global active runs, per-repo active runs,
  per-actor active runs, per-run spend, per-run request count, and daily spend.
- Verify `GET /admin/limits/status` responds (operator-run, with the admin
  token from the operator's local `.env`; there is no in-repo admin workflow).

GitHub repository:

- Branch protection requires ci + agent-review; native auto-merge lands reviewed PRs (no agent merges).
- Required CI check name matches `ci`.
- Actions artifact retention is long enough for operator audits.
- Workflow permissions stay capability-separated; do not use `write-all`.
- Workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

## First Public Rollout Policy

Start with a narrow allowed surface:

- trusted maintainers only for manual `/agent developer`
- PM sweep limit of 1-3 issues
- conservative `PUBLIC_AGENT_ALLOWED_PATHS`
- low per-run spend caps
- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows

Escalate to humans for security issues, broad architecture changes, unclear
requirements, repeated failures, merge conflicts, missing CI, stale CI, and
reviewer high-risk verdicts.

## Operator Drills

Before opening broader access, verify these in the target repo:

- `/agent pause` applies `agent-paused`.
- `/agent developer` on a paused issue stops before model minting.
- `/agent status` reports labels, open PR, active workflow runs, and active proxy
  runs.
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports no infrastructure retry when no failed run exists, or
  reruns failed jobs without posting a fresh `/agent developer`.
- `/agent cancel` cancels active public-agent workflow runs and revokes active
  proxy runs for the issue.
- `Model Proxy Admin` `status` shows active-run saturation and daily counters.

## Private Trial Evidence

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent developer` policy block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for operator controls: run `27633520672`.
- Push CI for production rollout checks: run `27633852289`.

## Go/No-Go

Go only when all of these are true:

- `bun run check` passes locally and in GitHub Actions.
- A fresh low-risk issue completes end to end.
- A paused issue does not dispatch new work.
- PM sweep on stale backlog launches no duplicate work.
- Proxy saturation causes skip/backpressure, not workflow failure.
- Risky or unclear issues produce human-required escalation instead of a PR.
