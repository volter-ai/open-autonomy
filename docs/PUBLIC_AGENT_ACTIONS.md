# open-autonomy Actions

This is the v1 architecture for public, issue-driven agent sessions using
GitHub Actions as the runner, a Cloudflare model proxy for bounded AI spend,
trusted publisher jobs for repository writes, and PR-committed session evidence.

## Goals

- Let maintainers request work from public issues or comments.
- Let the PM workflow dispatch clear, low-risk issues into `/agent develop`.
- Run Codex through the bounded model proxy.
- Never expose raw provider API keys to the agent process.
- Preserve normalized session history and structured decisions in the PR branch.
- Keep the untrusted agent job unable to push to the repository.
- Auto-merge only when deterministic facts and reviewer judgment agree.

## Trust Model

Use capability-separated jobs:

```text
setup job
  trusted setup
  resolves target
  performs triage
  mints the agent run record
  has model proxy admin token
  does not run Codex

agent-runner job
  untrusted
  contents: read
  issues: read
  id-token: write
  no repo write token
  no provider keys
  no model proxy admin token
  exchanges GitHub OIDC for one bounded model token
  emits an artifact bundle

complete-agent-run job
  trusted cleanup
  revokes/completes the bounded model run
  has model proxy admin token

publisher job
  trusted
  contents: write
  pull-requests: write
  issues: write
  validates bundle
  applies patch
  opens or updates PR
```

The agent can propose changes. It cannot publish them.

Do not use `permissions: write-all`. Do not pass raw provider keys to the
agent-runner job.

## Commands

Supported public commands:

- `/agent develop`
- `/agent review`
- `/agent pause`
- `/agent resume`
- `/agent cancel`
- `/agent retry`
- `/agent status`

Compatibility aliases:

- `/agent run` -> develop
- `/agent continue` -> develop

`/agent retry` is an operator control. It reruns failed jobs from a failed
infrastructure workflow run for the issue and does not dispatch a fresh
developer pass.

`/agent pause` and `/agent resume` default to issue scope. Add `repo`, for
example `/agent pause repo`, to set `PUBLIC_AGENT_REPO_PAUSED` for the whole
repository.

## Model Proxy

The worker lives in `services/agent-model-proxy`.

Important routes:

- `GET /healthz`
- `POST /admin/runs/mint`
- `POST /admin/runs/:run_id/revoke`
- `GET /admin/runs/:run_id`
- `GET /admin/limits/status`
- `POST /v1/runs/:run_id/exchange`
- `POST /openai/v1/responses`
- `POST /openai/v1/chat/completions`
- `POST /anthropic/v1/messages`

Admin routes require `X-Admin-Token: $MODEL_PROXY_ADMIN_TOKEN`. Model routes
require `Authorization: Bearer $MODEL_PROXY_TOKEN`.

The agent job gets `MODEL_PROXY_TOKEN` by exchanging GitHub OIDC with
`scripts/model-proxy-exchange.ts`. It must not receive `MODEL_PROXY_ADMIN_TOKEN`.

## Agent Runner

The develop workflow runs:

```bash
bun scripts/github-agent-session.ts \
  --issue .agent-run/issue.json \
  --run-id "$RUN_ID" \
  --out .agent-run/out \
  --repo "$GITHUB_REPOSITORY" \
  --actor "$GITHUB_ACTOR" \
  -- \
  bash -lc "${PUBLIC_AGENT_COMMAND:-bun scripts/claude-agent-run.ts}"
```

`github-agent-session.ts` creates an isolated task directory, copies the issue
payload, sets `OSS_AGENT_TASK_DIR` and `OSS_AGENT_ISSUE_PATH`, runs the command,
captures patch/session/artifacts, writes a develop decision, scans for
real-looking secrets, and emits a publisher bundle.

`claude-agent-run.ts` runs Claude Code headless, pointed at the model proxy over
the Anthropic Messages wire (the proxy routes the `deepseek/…` model id to
OpenRouter by slug). It sets the stock SDK env, with no provider key in the
sandbox:

```sh
ANTHROPIC_BASE_URL="$MODEL_PROXY_URL"      # native /v1/messages
ANTHROPIC_AUTH_TOKEN="$MODEL_PROXY_TOKEN"  # the minted, bounded run token
ANTHROPIC_MODEL="deepseek/deepseek-v4-flash"
```

## Bundle Contract

```text
bundle/
  manifest.json
  changes.patch
  session.json
  decisions/
    develop-dec_*.json
  artifacts/
    pr.md | blocked.md | result.json
```

Terminal statuses:

- `pr-ready`
- `blocked`
- `failed`

## Publisher Policy

The trusted publisher rejects bundles that fail policy:

- invalid manifest or decision records
- path traversal or absolute paths
- workflow edits
- `.git` and `.gitmodules`
- symlinks
- binary patches
- mode changes
- file deletions
- oversized or unsupported artifacts
- secret-looking strings
- patch that does not apply cleanly

Publisher does not decide product risk. Reviewer and merge gate do.

## Review And Merge

Auto-merge only if all are true:

- PR branch is the expected `agent/issue-N`
- publisher passed for the current PR head
- reviewer verdict is `pass`
- reviewer risk is `low`
- reviewer says `human_required: false`
- required CI checks passed for the current PR head
- no maintainer-blocking label or comment exists
- loop/attempt/budget limits are within policy
- GitHub reports the PR mergeable

The merge gate writes a structured decision before merging or escalating.

## Evidence

Committed evidence should be compact and reviewable:

- session JSON
- structured decision records
- normalized transcript / PR summary
- selected artifacts

Raw logs and large debug artifacts should stay in Actions artifacts unless a
small, sanitized copy is useful in the PR.
