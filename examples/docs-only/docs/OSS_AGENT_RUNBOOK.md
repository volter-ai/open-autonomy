# open-autonomy Runbook

This is the source-checkout path for the issue-driven self-building agent. The
full GitHub Actions and model-proxy architecture is in
[`PUBLIC_AGENT_ACTIONS.md`](./PUBLIC_AGENT_ACTIONS.md).

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

Run the session wrapper with a simple local command:

```bash
bun scripts/github-agent-session.ts \
  --issue /tmp/volter-issue.json \
  --run-id run_local_101 \
  --out /tmp/public-agent-101 \
  --repo volter-ai/open-autonomy \
  --actor local \
  -- \
  node -e 'const fs=require("node:fs"),p=require("node:path"); const d=process.env.OSS_AGENT_TASK_DIR; fs.mkdirSync(p.join(d,"artifacts"),{recursive:true}); fs.writeFileSync(p.join(d,"artifacts","result.json"),"{\"ok\":true}\\n"); fs.writeFileSync(p.join(d,"artifacts","pr.md"),"# PR\\n")'
```

Inspect:

```bash
cat /tmp/public-agent-101/bundle/manifest.json
ls /tmp/public-agent-101/bundle/artifacts
```

Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
Merged session evidence includes a `run-receipt.json` file and a root `transcript.md` file.
The workflow waits for GitHub to report the evidence commit as the PR head before SHA-bound auto-merge.
When bounded developer context is provided, developer bundles also include `context-sources.json`.

The agent command receives:

- `OSS_AGENT_TASK_DIR` — writable task directory
- `OSS_AGENT_ISSUE_PATH` — copied issue JSON

The command must write one terminal artifact in `artifacts/`:

- `result.json` for a successful machine-readable result
- `pr.md` for PR-ready text
- `blocked.md` when it cannot continue and needs a human answer

## Live Workflow Smoke

1. Push changes to `main`.
2. Confirm `ci` passes.
3. Open or reuse a low-risk issue.
4. Comment `/agent develop`, or trigger `Public Agent PM`.
5. Verify the run uses `scripts/codex-agent-run.ts`, exchanges GitHub OIDC for a
   bounded model token, and emits a publisher bundle.
6. Verify publisher output, reviewer verdict, and merge-gate behavior.
7. If active-run limits block PM or agent dispatch, use the manual `Model Proxy Admin`
   workflow to inspect proxy saturation and revoke stale run IDs before retrying.
   The post-publish retry path uses deterministic retry-budget evaluation for CI
   and reviewer `develop_retry` retries.

## Operator Controls

Use issue comments for day-to-day controls:

- `/agent pause` adds `agent-paused` to the issue. PM sweeps and direct develop
  starts wait while the label is present.
- `/agent resume` removes `agent-paused`.
- `/agent pause repo` sets `PUBLIC_AGENT_REPO_PAUSED=true`; `/agent resume repo`
  clears it.
- `/agent status` posts labels, blocking labels, open agent PR, active workflow
  runs, and active proxy runs for the issue.
- `/agent cancel` cancels queued/in-progress public-agent workflow runs for the
  issue and revokes matching active proxy runs visible in `/admin/limits/status`.
- `/agent retry` reruns failed jobs from the latest failed infrastructure run for
  the issue. It does not create a new `/agent develop` command.

Use `Model Proxy Admin` with `status`, `run-status`, or `revoke` when you need
repository-wide proxy saturation details or a manual run-id revoke.

## Production Rollout

Before enabling the agent on a public backlog, work through
[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

## Secrets

The runner and published evidence must not contain real API keys, tokens,
cookies, private URLs, or customer data. The session wrapper scans the bundle
patch, session, decision files, and promoted artifacts for common real-looking
secret patterns before publisher validation.
