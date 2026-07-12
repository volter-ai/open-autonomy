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
  --skill .codex/skills/develop/SKILL.md \
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
4. Comment `/agent develop`, or trigger the `pm` workflow.
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

## Phase 6 Hand-Off — G4b async babysit protocol

G4a (above) lifts the fence and constructs the go-live launch. What happens next — the first full
draft -> develop -> review -> PR cycle — takes **hours to days**, not one CLI call. This is a runbook for
a human to follow across that window, not something an agent session executes start-to-finish.

### 1. Confirm the loop actually started

```bash
oa status
```

Expect `fence: unpaused` and, once the first tick has fired, a live session line
(`sessions: N live (<agent>:<status>, ...)`). If sessions stays `none live` for longer than one
reconcile period (~20s heartbeat locally; the next cron tick on gh-actions), re-check `oa doctor` and the
provider (`oa provider status`) before assuming the loop is stuck.

### 2. Watch the first PR appear and go green

```bash
gh pr list --search "is:open is:pr"
gh pr checks <pr-number>
```

Wait for all three required checks (`ci`, `agent-review`, and — where the profile has it —
`human-approval`) to post. A `DIRTY`/conflicting PR never auto-merges even when green; re-dispatch is the
PM's own doctrine, not an operator action.

### 3. Review the first PR yourself (this is the "babysit" step)

Read the diff. This is the one PR in the whole lifecycle a human reads end-to-end before trusting the
fleet's own `agent-review` gate. If the profile carries a `human-approval` required check, approve it on
GitHub (a maintainer Approve on the current head SHA); otherwise merge directly once `ci`+`agent-review`
are green:

```bash
gh pr merge <pr-number> --squash
```

### 4. Confirm the merge actually landed

```bash
gh pr view <pr-number> --json state,mergedAt
oa maturity
```

`oa maturity` (TB.2) recomputes the IMM stage from real, install-scoped evidence — after a genuine merge
+ a subsequent tick, expect it to progress toward M6/ADVANCING (mission-advancing signal); it will report
the stage HONESTLY (never a fabricated M6 off a single merge alone — see `missionAdvancingSignal`,
packages/local-runner-cli/src/m6-signal.ts).

### 5. Only THEN arm native auto-merge

Never before step 4 completes — auto-merging before you've watched one PR land under supervision means the
first real proof of the review gate's independence never happens under human eyes.

```bash
gh repo edit <owner>/<repo> --enable-auto-merge
```

(Local-substrate installs have no native auto-merge concept — the PM's own merge doctrine performs the
merge each tick once required checks are green; there is nothing to "arm" locally.)

### 6. Ongoing supervision

- `oa status` / `gh pr checks <n>` — spot-check periodically, not continuously.
- `oa maturity --json` — machine-readable stage + blockers, safe to script into a periodic check.
- Escalation still routes through the human seam (`human-required` label, `needs-info`, `agent-blocked`) —
  `docs/OPERATIONS.md`'s Operator Controls section is the full reference.

> This section is mirrored verbatim (`bin/install-handoff.ts`'s `G4B_RUNBOOK` constant, kept in sync by
> `bin/install-handoff.test.ts`'s own content-sanity test) so the TE.6 install unit's runbook artifact and
> this human-facing doc never drift apart.

## Production Rollout

Before enabling the agent on a public backlog, work through the
[GitHub production rollout](./OPERATIONS.md#github-production-rollout).

## Secrets

The runner and published evidence must not contain real API keys, tokens,
cookies, private URLs, or customer data. The skill runner redacts common
secret-like patterns from the transcript it writes; the install holds no
provider secrets (model access is the OIDC-minted bounded token).
