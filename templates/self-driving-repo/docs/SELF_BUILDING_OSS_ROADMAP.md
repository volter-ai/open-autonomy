# Self-Building OSS Roadmap

This is the roadmap for turning the public agent workflow into a self-building
OSS project. The current system can turn a trusted trigger into a bounded agent
run and a policy-gated PR. The next system should develop, review, and merge
safe changes autonomously, escalating only when risk or ambiguity requires a
maintainer.

Core rule:

```text
Agents make judgments and artifacts. Deterministic gates grant authority.
```

## Target Loop

```text
issue/comment/PR comment
  -> PM agent triage
  -> deterministic dispatcher
  -> developer agent creates or updates PR
  -> deterministic publisher validates and pushes
  -> CI
  -> reviewer agent emits structured verdict
  -> deterministic merge gate merges, retries develop, or escalates
```

Human review is the exception path. The system should ask for a human only when
it can clearly explain why the change is risky, ambiguous, blocked, or outside
policy.

## Agents

### PM Agent

Purpose: operate the public backlog.

Capabilities:

- read issues, labels, comments, and related PRs
- comment on issues
- emit structured triage decisions
- surface urgent maintainer issues

No code-writing capability.

Responsibilities:

- classify issues: bug, docs, feature, question, duplicate, spam, security
- ask clarifying questions
- detect duplicates
- identify missing reproduction or acceptance criteria
- mark issues ready or blocked
- flag suspicious/security-sensitive input for maintainers
- recommend `develop`, `review`, `needs-info`, `duplicate`, or `human_required`

The PM agent operates through visible command comments. For reliability, the PM
workflow mirrors those comments into `workflow_dispatch`; the comment is the
auditable intent, and the dispatch is the transport.

Implemented first pass:

- scheduled/manual `Public Agent PM` workflow
- bounded `pm` model token purpose
- strict PM JSON parser
- deterministic dispatcher for `develop`, `needs_info`, duplicate, spam,
  human-required, wont-fix, and ignore recommendations
- PM context includes labels, comments, open canonical agent PR, and recent
  issue-addressed public-agent workflow runs
- PM starts agents by writing command comments such as `/agent develop` on the
  issue or `/agent review` on the open agent PR
- PM workflow then directly dispatches the matching workflow as a reliable
  transport for that visible command comment

Target capabilities not yet granted:

- add/remove a constrained set of labels
- close obvious duplicates/spam after explicit maintainer policy exists

### Developer Agent

Purpose: implement requested work.

Capabilities:

- read-only GitHub token
- workspace write inside the runner
- bounded model token from model proxy
- no repo write token
- no model provider keys
- no admin token

Responsibilities:

- create or update the canonical agent branch for an issue
- use issue, PR, comment, CI, and prior decision context
- run focused checks
- emit a publisher bundle with patch, manifest, artifacts, and transcript

The developer agent never publishes directly. The publisher applies only
mechanically safe `pr-ready` bundles.

### Reviewer Agent

Purpose: decide whether a PR is low-risk, needs more development, or needs a
human.

Capabilities:

- read-only repository/PR/CI context
- issue/PR comment permission for review output
- bounded model token
- no patch publishing
- no merge permission

Responsibilities:

- review diff, changed files, CI, tests run, comments, and prior decisions
- classify merge risk
- identify missing tests, risky behavior, security concerns, API changes,
  dependency/build changes, or unclear product choices
- emit strict JSON verdict plus a concise public comment

The reviewer agent may mark broad non-workflow code changes as low-risk. Path
alone is not the policy; actual risk is the policy.

## Deterministic Gates

### Dispatcher

Purpose: convert PM/reviewer command intent into allowed workflow starts.

Checks:

- budget and rate limits
- active run limits
- duplicate active PR/run detection
- actor/repo/issue cooldowns
- loop limits
- blocking labels
- whether the requested verb is allowed from this context

The dispatcher is not the product brain. It should be boring transport and
policy enforcement.

Currently implemented:

- render the PM's selected command into a public comment
- dispatch the matching workflow reliably
- refuse malformed or impossible review targets

Target behavior:

- render the PM's selected command into a public comment
- dispatch the matching workflow reliably
- enforce budgets, run limits, loop limits, and blocking labels
- refuse malformed or impossible commands
- record why a command was allowed or denied

### Publisher

Purpose: apply developer output only if mechanically safe.

Already implemented:

- requires `manifest.status === "pr-ready"`
- binds manifest run/repo/issue/actor to workflow context
- rejects path traversal and absolute paths
- rejects workflow edits
- rejects `.git` and `.gitmodules`
- rejects symlinks
- rejects binary patches
- rejects mode changes
- rejects file deletions
- enforces artifact count, per-file size, total size, extension, and regular
  file constraints
- rejects secret-looking strings as a backup check
- applies broad non-workflow repo changes by default

Publisher does not decide product risk. Reviewer and merge gate do.

### Merge Gate

Purpose: merge or escalate deterministically.

Auto-merge only if all are true:

- PR branch is the expected `agent/issue-N`
- publisher passed for the current PR head
- reviewer verdict is `pass`
- reviewer says `risk: "low"`
- reviewer says `human_required: false`
- required CI checks passed for the current PR head
- no maintainer-blocking label or comment exists
- loop/attempt/budget limits are within policy
- branch protection allows merge

Do not auto-merge if:

- reviewer is risky, uncertain, or blocked
- CI is missing, stale, or repeatedly failing
- a maintainer has applied a blocking label
- there is an unresolved maintainer request
- the PR branch is unexpected
- repeated develop/review loops hit stop conditions

The merge gate writes a structured decision record before merging or
escalating.

### Model Proxy

Purpose: bound model access.

Already implemented:

- admin mint/revoke
- bounded per-run tokens
- GitHub OIDC exchange for runner tokens
- run/repo/actor/workflow binding
- run id/run attempt binding when present
- per-run request and spend caps
- repo/actor/issue/global active and daily limits
- provider request metering
- `review` token purpose is distinct from `agent`
- `pm` token purpose is distinct from `agent`
- GitHub OIDC exchange only works for `agent` purpose runs

## Public Commands

Use two public verbs:

- `/agent develop`
- `/agent review`

Compatibility aliases may remain during migration:

- `/agent run` -> `/agent develop`
- `/agent continue` -> `/agent develop`
- `/agent retry` -> infrastructure retry only, or `/agent develop` while
  migrating

`develop` is target-aware:

- on an issue with no agent PR: create `agent/issue-N`
- on an issue with an existing agent PR: update `agent/issue-N`
- on an agent PR: update that branch
- on a PR or review comment: use that comment as the requested change

`review` is read-only:

- on a PR: review the diff, CI, and risk
- on a comment: answer that concern or include it in the verdict

Future issue-level review may assess agentability or produce a plan, but the
current review workflow is PR-oriented.

## CI Model

CI must be explicit so reviewer and merge gate can make deterministic
decisions.

Initial model:

```json
{
  "required_checks": ["ci"],
  "optional_checks": [],
  "stale_after_minutes": 60,
  "missing_required_check": "human_required",
  "failed_required_check": "develop_retry",
  "max_ci_fix_attempts": 2
}
```

Rules:

- missing required CI blocks auto-merge
- stale required CI blocks auto-merge
- failed required CI dispatches `develop` on the same PR until the retry cap
- repeated failure after the retry cap requires a human
- reviewer may recommend another develop run, but dispatcher enforces attempts

## Decision Audit

Existing GitHub history and Actions logs show what happened. The autonomous
system also needs structured records explaining why each decision was allowed.

Every autonomous stage emits a JSON decision record.

Common schema:

```json
{
  "schema": "volter.agent.decision.v1",
  "stage": "review",
  "issue": 42,
  "pr": 99,
  "run_id": "run_...",
  "actor": "agent-reviewer",
  "decision": "pass",
  "risk": "low",
  "subject": {
    "type": "pull_request",
    "number": 99,
    "head_sha": "abc123"
  },
  "attempt": {
    "kind": "review",
    "index": 1,
    "max": 2
  },
  "reason": "review passed with low risk and required CI passed",
  "failure_signature": null,
  "supersedes": [],
  "evidence": ["publisher:passed", "ci:passed", "review:low-risk"],
  "next_action": "merge",
  "created_at": "2026-06-16T04:00:00Z"
}
```

Stages:

- `pm_triage`
- `dispatch`
- `develop`
- `publish`
- `ci`
- `review`
- `merge_gate`
- `escalation`

Store records in:

- PR or issue comments for public visibility
- `agent-sessions/<run-id>/decisions/*.json` for durable repo history
- optional proxy/admin dashboard for operations

Storage caveat:

- decisions made before publishing can be promoted in the initial
  `agent-sessions/<run-id>/` commit
- post-publish decisions such as CI, review, retry, merge-gate, and issue-close
  happen after that commit exists, so they need one of:
  - a follow-up agent-session decision commit
  - a workflow artifact plus concise PR/issue comment
  - durable object storage mirrored by the model proxy
  - a later object store/dashboard
- Phase 1 must choose one durable path before Phase 2 depends on decision
  history for loop budgets

## Stop Conditions

Resource caps already exist in the model proxy. Autonomous loops also need
workflow caps.

Add deterministic limits for:

- max develop attempts per issue/PR
- max CI-fix attempts per PR
- max review/develop cycles per PR
- repeated same-failure detection
- stale `needs-info` timeout
- max open agent PRs per repo

Stop states:

- `needs-info`
- `human-required`
- `ci-repeated-failure`
- `risky-change`
- `merge-conflict`
- `budget-exhausted`
- `policy-blocked`

When stopped, the system comments with the exact reason and the next human
action needed.

## Trust And Abuse

The PM agent can surface suspicious issues and urgent maintainer problems, but
it is not the only abuse control.

Rules:

- public users may request review
- develop is authorized by trusted users or deterministic dispatcher policy
- agents cannot grant themselves authority by posting commands
- security-sensitive issues should be labeled and escalated, not developed
  automatically
- spam and duplicates should be labeled/commented, with closing automation
  added only after a conservative trial

## Current Implemented State

Done:

- GitHub Actions setup, runner, cleanup, publisher split
- target-aware `/agent develop` command
- compatibility aliases for `/agent run`, `/agent continue`, and `/agent retry`
- issue and PR target resolver
- canonical `agent/issue-N` branch reuse
- PR comments on existing agent PRs update that branch instead of opening
  duplicates
- deterministic rejection of fork/manual PR branches for autonomous
  development
- bounded model proxy with Durable Object run and limit state
- Codex custom provider through proxy `wire_api = "responses"`
- OIDC exchange for bounded runner model tokens
- Codex prompt receives resolved issue/PR target context
- no model/admin token handoff through job outputs
- issue/comment trigger with trusted comment author check
- deterministic GitHub Actions bot dispatch is allowed for CI retry comments
- publisher `pr-ready` enforcement
- publisher manifest identity binding
- broad non-workflow patch support
- workflow edit rejection
- binary patch, symlink, mode change, deletion rejection
- artifact limits and symlink rejection
- explicit CI reader with required check policy
- reviewer workflow for `/agent review` and canonical agent PR updates
- read-only reviewer model with strict JSON verdict
- merge gate that auto-merges only low-risk passing reviews with passing CI
- same-workflow post-publish read-only CI and review handoff, because PRs
  created with `GITHUB_TOKEN` do not trigger downstream PR workflows
- CI failure dispatches another bounded develop pass on the same PR up to 2
  attempts
- reviewer `develop_retry` verdicts dispatch another bounded develop pass up
  to the same retry cap
- successful low-risk merge closes the source issue explicitly
- public-agent session run names include the issue number so PM can see whether
  an issue has queued, running, successful, or failed agent work
- PM direct-dispatches `/agent develop` and `/agent review` after writing the
  corresponding visible command comment
- live self-hosting smoke tests for issue-to-PR flow
- live self-hosting smoke test for issue -> develop -> publish -> read-only CI ->
  reviewer pass -> merge gate -> merged PR
- live self-hosting smoke test for PM -> command comment/workflow dispatch develop
  -> publish -> read-only CI -> reviewer pass -> merge gate -> merged PR ->
  source issue closed

## Next Implementation Roadmap

The core loop is proven. The remaining work is to make the loop explainable,
bounded, observable, and maintainable under real public load.

Priority order:

1. Durable decision memory.
2. Unified loop budgets and stop conditions.
3. PM backlog/stuck-work policy.
4. Developer context expansion.
5. Review/merge parity and branch-protection compatibility.
6. Operator controls and observability.
7. Production rollout.

Why this order:

- Decision records create the memory every later phase should consume.
- Loop budgets need that memory to count attempts reliably.
- PM stuck-work policy depends on run state and prior decisions.
- Developer context depends on prior review/CI/PM decisions.
- Merge hardening needs reliable decisions and head-SHA binding.
- Operator controls are clearer once stop states and summaries exist.

### Phase 1: Durable Decision Memory

Goal: make every autonomous decision reconstructable without scraping free-form
logs.

Build:

- `scripts/public-agent-decision.ts`
  - shared writer for `volter.agent.decision.v1`
  - stable schema validation
  - stable decision IDs
  - evidence references to comments, PRs, run IDs, artifacts, and checks
- decision records for:
  - PM triage
  - PM command rendering
  - target resolution
  - triage approval/rejection
  - publish validation
  - CI gate
  - reviewer verdict
  - retry decision
  - merge gate
  - escalation
- durable storage:
  - `agent-sessions/<run-id>/decisions/*.json` for develop runs
  - issue/PR comments containing concise decision summaries
  - PM workflow artifacts for PM-only decisions that do not create a develop
    run

Acceptance criteria:

- A maintainer can answer "why did this issue get developed, retried, merged,
  or escalated?" from structured JSON alone.
- Decision records contain no secrets and do not include raw model tokens.
- Every auto-merge has a merge-gate decision record tied to the PR head.
- Every PM command comment has a corresponding PM decision and dispatch
  decision.

Tests:

- unit tests for schema validation and redaction
- workflow smoke that verifies decision files are promoted with an agent run
- live trial issue proving PM decision -> command comment -> dispatch ->
  develop -> review -> merge records are present
- schema fixture proving `subject.head_sha`, `attempt`, `reason`,
  `failure_signature`,
  and `supersedes` are available for loop-budget logic

### Phase 2: Unified Loop Budget And Stop Conditions

Goal: prevent runaway loops while allowing useful retries.

Build:

- one combined attempt counter per issue/PR covering:
  - PM-triggered develop
  - CI-fix develop
  - reviewer-requested develop
  - manual `/agent retry`
- repeated-failure signature detection:
  - same CI check failing with same summary
  - same reviewer finding repeated
  - patch-empty runs
  - merge conflicts
  - model/tool/runtime failures
- deterministic stop comments:
  - `needs-info`
  - `human-required`
  - `ci-repeated-failure`
  - `review-repeated-failure`
  - `merge-conflict`
  - `budget-exhausted`
  - `policy-blocked`
- policy variables:
  - `PUBLIC_AGENT_MAX_DEVELOP_ATTEMPTS`
  - `PUBLIC_AGENT_MAX_REVIEW_CYCLES`
  - `PUBLIC_AGENT_STALE_RUN_MINUTES`
  - `PUBLIC_AGENT_MAX_OPEN_AGENT_PRS`

Acceptance criteria:

- The system never starts a new develop run after the combined attempt budget
  is exhausted.
- Repeated identical failures stop with a clear human action request.
- PM can see stopped state and should not restart it unless a human adds new
  information or removes the blocker.

Tests:

- unit tests for attempt counting from comments, decisions, and run state
- synthetic CI-failure smoke proving retry then stop
- synthetic reviewer-failure smoke proving retry then stop

### Phase 3: PM Operations And Backlog Policy

Goal: make PM useful as a backlog operator, not just an auto-develop starter.

Build:

- PM context expansion:
  - recent issue comments with author and timestamps
  - open agent PR details
  - public-agent runs filtered by issue number
  - previous decision records
  - blocking labels
  - stale `needs-info` age
- PM guidance for:
  - queued/in-progress runs
  - failed runs
  - stale runs
  - open PR ready for review
  - human replies after `needs_info`
  - duplicate/spam/wont-fix handling
- issue ordering policy:
  - maintainer-priority labels first
  - stale ready issues next
  - newest clear low-risk issues next
  - stale `needs-info` for follow-up
- conservative label management:
  - add `needs-info`, `agent-blocked`, `human-required`, `duplicate`, `spam`
  - avoid closing duplicates/spam until a maintainer policy is explicit

Acceptance criteria:

- PM does not restart an issue with an active run.
- PM sends `/agent review` for an open agent PR when appropriate.
- PM notices a failed/stale run and either retries or escalates with a reason.
- PM asks one clear question for underspecified issues.

Tests:

- unit tests for PM prompt fixtures and dispatcher output
- trial issues for: ready docs issue, needs-info issue, open-PR review issue,
  failed-run retry issue, blocked label issue
- live trial PR proving PM sees an open canonical agent PR, comments
  `/agent review`, directly dispatches `public-agent-review.yml`, and the
  review completes

Required fixes from the live `open-autonomy-testbed` trials:

- PM must always move an issue toward a visible conclusion. Silent `skip`
  decisions are acceptable only when a prior visible status already exists and
  no newer human input is present; otherwise PM should comment, label, dispatch,
  or escalate with a reason.
- PM model mint/budget outages must produce a visible waiting status on the
  issue unless an equally current PM status already exists.
- PM `human_required`, `spam`, `duplicate`, and `wont_fix` outcomes must have
  deterministic label/comment behavior that can be audited from the issue.
- PM needs a conservative classification for test-harness/operator-control
  issues. It should not start `/agent develop` for issues whose requested work
  is to exercise controls such as pause/status/resume; those should be handled
  by explicit operator commands or marked human-required/test-only.
- PM must not repeat a stale `needs-info` comment, but after a human provides
  clarifying acceptance criteria it should remove or supersede the blocker and
  start an appropriate develop run.
- PM open-PR routing needs a live fixture: when a canonical `agent/issue-N` PR
  exists, PM should avoid duplicate develop and should route to `/agent review`
  when CI/review state allows it.
- PM artifacts should be promoted into durable repo evidence or a stable
  downloadable format so PM-only conclusions are as inspectable as develop
  sessions.

Implemented from live trials:

- visible PM comments for `ignore`, blocking labels, review-without-PR, active
  runs, and model-budget outages, with duplicate suppression
- deterministic issue labels for `needs-info`, `human-required`, `duplicate`,
  `spam`, and `manual-operator-test`
- PM handoff comments that clear stale `needs-info` labels on `develop` or
  `review`
- triage approval for PM-authored `/agent develop` handoffs after a maintainer
  clarification

### Phase 4: Developer Context And Patch Quality

Goal: give the developer agent enough context to make the right change without
large, speculative edits.

Build:

- include current PR diff when developing on an existing agent PR
- include relevant issue/PR/review comments
- include prior decision records and reviewer findings
- include latest CI failure summaries
- include explicit acceptance criteria from PM when available
- teach developer prompt to avoid repeating prior failed approaches

Acceptance criteria:

- A reviewer-requested develop pass receives the actual reviewer findings.
- A CI-fix pass receives the failed check names and failure summaries.
- A PM-triggered second develop after human feedback receives that newer human
  feedback.
- Patch bundle records which context sources were used.

Tests:

- unit tests for context assembly
- live trial where reviewer asks for a small fix and the next develop pass
  addresses it
- live trial where human adds follow-up info and PM starts a second develop

### Phase 5: Review And Merge Gate Parity

Goal: ensure all review paths have the same reliable behavior.

Build:

- direct-dispatch retry behavior in standalone `public-agent-review.yml`,
  matching the same-workflow post-publish review path
- explicit branch/head SHA binding for review decisions
- merge gate check that the reviewed head SHA equals the merged head SHA
- human-blocking signal detection:
  - labels
  - maintainer comments like "hold", "do not merge", "needs maintainer"
  - requested changes from maintainers
- branch protection strategy:
  - either require the same-workflow CI job as the policy source
  - or publish a named check/status suitable for branch protection

Acceptance criteria:

- Manual/direct `/agent review` can trigger a bounded develop retry without
  depending on comment-trigger side effects.
- Merge gate refuses if PR head changed after review.
- Merge gate refuses on maintainer-blocking labels/comments.
- Production branch protection and merge gate agree on required checks.

Tests:

- unit tests for head SHA mismatch and blocking comments
- trial PR where review passes, head changes, merge is refused
- trial PR with blocking label/comment, merge is refused

Required fixes from the live `open-autonomy-testbed` plan:

- Build synthetic CI-failure and reviewer-failure fixtures in the testbed so
  retry loops can be exercised without damaging real workflows.
- Record retry stop reasons as stable public comments and decision files:
  `ci-repeated-failure`, `review-repeated-failure`, `budget-exhausted`, or
  `human-required`.
- Add a live head-changed-before-merge fixture so the merge gate SHA binding is
  proven against an actual PR race.

Implemented:

- merge gate refuses auto-merge when the PR has maintainer blocking labels such
  as `do-not-merge`, `human-required`, `agent-blocked`, or `security`
- merge gate refuses auto-merge after a non-bot blocking comment such as
  "do not merge" or "hold", while allowing a later maintainer unblock comment
  such as "ok to merge"

### Phase 6: Observability And Operator Controls

Goal: make the autonomous system operable by maintainers.

Build:

- concise run summaries for:
  - PM decisions
  - develop results
  - review results
  - merge/escalation decisions
- issue/PR comment format that is stable enough for humans and parsers
- optional dashboard/export using model-proxy run state
- operational commands:
  - `/agent status`
  - `/agent stop`
  - `/agent resume`
  - `/agent summarize`
- cleanup policy for stale agent branches and abandoned PRs

Acceptance criteria:

- Maintainers can see active/stuck/blocked work without reading raw Actions
  logs.
- A maintainer can stop an issue from future autonomous action with one visible
  command or label.
- PM recognizes stopped/resumed state.

Tests:

- unit tests for status summarization
- self-hosting smoke for stop/resume behavior

Required fixes from the live `open-autonomy-testbed` trials:

- Add first-class testbed fixture labels, for example `testbed-control` or
  `manual-operator-test`, that exclude an issue from PM auto-develop while still
  allowing explicit `/agent pause`, `/agent status`, `/agent develop`, and
  `/agent resume` checks.
- Add a visible status path for skipped control issues so maintainers can tell
  whether PM intentionally ignored the issue because it is a manual operator
  test.
- Publisher policy rejections, such as blocked workflow edits, must post a
  stable issue/PR comment and decision record before the workflow exits failed.
- Add repo-pause smoke coverage proving scheduled PM sweeps and direct develop
  stop before model token minting while `PUBLIC_AGENT_REPO_PAUSED` is enabled.

### Phase 7: Production Rollout

Goal: move from self-hosting confidence to production-grade self-building OSS.

Build:

- production variables and secrets checklist
- branch protection compatibility checklist
- abuse-control checklist
- cost and rate-limit defaults
- emergency disable switch
- maintainer runbook
- versioned policy file committed to the repo

Rollout stages:

1. PM comments only, no dispatch, for dry-run/audit-only validation.
2. PM comment plus dispatch for broad non-workflow changes.
3. Reviewer/merge gate surfaces risky changes instead of publisher path policy
   deciding product risk.
4. Auto-merge low-risk reviewed changes.
5. Enable label management.
6. Consider duplicate/spam closure after a conservative trial.

Acceptance criteria:

- All production defaults are visible in docs or repo variables.
- Emergency disable path is tested.
- At least five trial issues have completed without manual repair across
  develop, review, merge, and issue closure.

## Open Design Choices

- Final structured schema for decision records.
- Whether merge gate should keep direct squash merge or switch to GitHub
  auto-merge when branch protection requires it.
- How to identify human-blocking labels and unresolved maintainer comments.
- Whether PM agent may close obvious duplicates/spam or only recommend closure.
- Whether raw artifacts should be mirrored to permanent object storage.
- Whether trusted maintainers can opt into workflow edits per run. Default is
  no.
