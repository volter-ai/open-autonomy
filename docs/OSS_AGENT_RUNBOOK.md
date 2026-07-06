# open-autonomy Runbook

This is the source-checkout path for the issue-driven self-building agent. The
full GitHub Actions and model-proxy architecture is documented in
`docs/ARCHITECTURE.md`.

## Local Checks

```bash
bun install
bun run check:public-agent
bun run check:agent-proxy
bun run check
```

`check:public-agent` runs the script unit tests and TypeScript checks for the
GitHub agent loop. `check:agent-proxy` validates the Cloudflare Worker model
proxy. `check` runs both.

## Manual Session Wrapper Smoke

Create an issue payload:

```bash
cat > /tmp/volter-issue.json <<'JSON'
{
  "number": 101,
  "title": "Add a verified public-agent artifact",
  "body": "Simulate an issue-triggered public agent session without real secrets."
}
JSON
```

Run the agent locally — the thin skill runner against the bounded model proxy (the same entrypoint
the credentialed agent job uses). It edits the working tree directly; the github job's effect step is
what turns that into an auto-merging PR.

```bash
OSS_AGENT_TASK_DIR=/tmp/agent-101 \
MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... \
bun scripts/claude-agent-run.ts \
  --skill .codex/skills/developer/SKILL.md \
  --issue /tmp/volter-issue.json
```

Inspect:

```bash
cat /tmp/agent-101/manifest.json
ls /tmp/agent-101/artifacts
```

Merged develop session evidence includes target, triage, develop, CI, and review decision records, so operators should review the full chain when checking evidence.
Merged session evidence includes a `run-receipt.json` file and a root `transcript.md` file.
The agent opens its own PR and queues native auto-merge; GitHub lands it once `ci` + `agent-review` are both green.
When bounded developer context is provided, the developer's session evidence also includes `context-sources.json`.

The agent command receives:

- `OSS_AGENT_TASK_DIR` — writable task directory
- `OSS_AGENT_ISSUE_PATH` — copied issue JSON

The command must write one terminal artifact in `artifacts/`:

- `result.json` for a successful machine-readable result
- `pr.md` for PR-ready text

(A blocked agent doesn't write a terminal artifact — it labels the issue
`agent-blocked`/`needs-info` on the tracker and the PM escalates on the SLA.)

## Live Workflow Smoke

1. Push changes to `main`.
2. Confirm `ci` passes.
3. Open or reuse a low-risk issue.
4. Comment `/agent developer`, or trigger the `pm` workflow.
5. Verify the run uses `scripts/claude-agent-run.ts`, exchanges GitHub OIDC for a
   bounded model token, edits code, and opens its own PR with auto-merge queued.
6. Verify the PR diff, the reviewer's `agent-review` status, and native auto-merge once `ci` + `agent-review` are green.
7. If active-run limits block PM or agent dispatch, inspect proxy saturation with the
   operator-run `GET /admin/limits/status` (admin token from your local `.env`; there is
   no in-repo admin workflow) and revoke stale run IDs via the admin API before retrying.
   On a CI or review failure the PR simply does not merge (the merge boundary holds);
   there is no automatic retry loop. On its next sweep the PM decides from the full
   issue/PR history — re-dispatch the developer with the failure as context (if
   addressable and under `max_develop_attempts`) or escalate `human-required`.

## Operator Controls

Use issue comments for day-to-day controls:

- `/agent pause` adds `agent-paused` to the issue. PM sweeps and direct develop
  starts wait while the label is present.
- `/agent resume` removes `agent-paused`.
- Repo-wide pause is a **repository variable**, not a comment verb: set
  `PUBLIC_AGENT_REPO_PAUSED=true` (`gh variable set …`) and every agent job
  skips; clear it to resume.
- `/agent status` comments the 5 most recent runs of that agent's workflow.
- `/agent cancel` cancels queued/in-progress runs of that agent's workflow. It
  does not revoke proxy run slots; an orphaned slot expires at token TTL (~2h).
- `/agent retry` relaunches this issue's agent workflow when its agent PR has a
  failed check — a fresh run (new model mint); otherwise it comments that there
  is nothing to retry.
- `/agent decide <decision>` / `/agent answer <answer>` resolve a human-blocked
  item (`human-required` / `needs-info`): they record the maintainer's typed
  decision/answer on the issue and clear the human-blocking labels so the PM
  re-triages and resumes the work. Maintainer-gated (OWNER/MEMBER/COLLABORATOR);
  this is the github realization of the human seam's `out` (resume on a recorded,
  authorized decision).

For repository-wide proxy saturation details or a manual run-id revoke, use the
proxy admin API directly (`GET /admin/limits/status`, `POST /admin/runs/revoke`)
with the admin token from your local `.env` — it is an operator/treasury
credential and never lives in the repo.

## Production Rollout

Before enabling the agent on a public backlog, work through the
[GitHub production rollout](./OPERATIONS.md#github-production-rollout).

## Secrets

The runner and published evidence must not contain real API keys, tokens,
cookies, private URLs, or customer data. The skill runner redacts common
secret-like patterns from the transcript it writes; the install holds no
provider secrets (model access is the OIDC-minted bounded token).
