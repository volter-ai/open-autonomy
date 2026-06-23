# open-autonomy Roadmap

This is the roadmap for turning the public agent workflow into a self-building
OSS project. The current system can turn a trusted trigger into a bounded agent
run and a policy-gated PR. The next system should develop, review, and merge
safe changes autonomously, escalating only when risk or ambiguity requires a
maintainer.

This is the single continuous roadmap for the canonical repo. Short plans,
proof-gate notes, and expanded product direction should be folded into this
file instead of creating parallel roadmap documents.

Core rule:

```text
Agents make judgments and artifacts. Deterministic gates grant authority.
```

## Target Loop

```text
issue/comment/PR comment
  -> PM agent triage
  -> developer skill agent (credentialed, scoped token)
  -> the agent edits code + opens its own PR with auto-merge queued
  -> CI
  -> reviewer agent posts the agent-review status
  -> native auto-merge lands it (ci + agent-review green), retries develop, or escalates
```

Human review is the exception path. The system should ask for a human only when
it can clearly explain why the change is risky, ambiguous, blocked, or outside
policy.

## Agents and Gates

The agent roles, the capability model, and the merge boundary are canonical in
`docs/ARCHITECTURE.md` and `docs/CAPABILITIES.md`. In brief: every agent is a credentialed skill that
acts directly with a token scoped to its capabilities; no agent can merge — `code:review`
(statuses:write, bless) and `code:propose` (contents:write, push) are never held by one agent, and
GitHub native auto-merge lands a PR once `ci` + `agent-review` are green. There is no dispatcher,
publisher, or bundle.

## Public Commands

Use two public verbs:

- `/agent developer`
- `/agent reviewer`

Compatibility aliases may remain during migration:

- `/agent run` -> `/agent developer`
- `/agent continue` -> `/agent developer`
- `/agent retry` -> infrastructure retry only, or `/agent developer` while
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
- reviewer may recommend another develop run, but the PM enforces attempts

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
  "evidence": ["ci:passed", "review:low-risk"],
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
- develop is authorized by trusted users or PM policy
- agents cannot grant themselves authority by posting commands
- security-sensitive issues should be labeled and escalated, not developed
  automatically
- spam and duplicates should be labeled/commented, with closing automation
  added only after a conservative trial

## Current Implemented State

Done:

- `compile(profile, substrate)` — a substrate-free IR (`autonomy.ir.v1`: behavior(skill) +
  capabilities + triggers + timeout + result); the github substrate; the self-driving profile.
- Every agent is a credentialed **skill** (developer, pm, reviewer, strategist, strategy-reviewer,
  planner) run as one job whose token is scoped to its capabilities (least privilege).
- The agent acts directly: it edits code and opens its own PR with auto-merge queued; reviewers post
  the `agent-review` status; pm sweeps + launches; planner reconciles issues; strategist proposes roadmap.
- The merge boundary: `code:review` (statuses:write, bless) and `code:propose` (contents:write, push)
  are never held by one agent; no agent can merge; branch protection + native auto-merge land a PR once
  `ci` + `agent-review` are green.
- Bounded model proxy: OIDC-minted per-run tokens with spend/request caps (the budget guard); no
  provider/admin keys in any install.
- Operator control plane (`/agent pause|resume|status|cancel|retry`); decision records + governance
  report + the bench autonomy grader.
- Branch protection on the canonical repo; the model proxy trusts workflows by repo (OIDC).

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

Testbed proof plan:

- `decision-memory-e2e`
  - Trigger: PM or maintainer starts a low-risk docs issue.
  - Expected: issue closes through develop, publish, CI, review, and merge gate.
  - Evidence: issue URL, PR URL, run URL, session path, decision files for
    target, triage, develop, publish, CI, review, merge gate, and issue close.
  - Final state: `done`.
- `decision-memory-pm-only`
  - Trigger: PM sweep on an underspecified issue.
  - Expected: PM asks one question and writes a durable PM-only decision
    artifact or equivalent durable record.
  - Evidence: issue URL, PM run URL, visible comment, `needs-info` label,
    PM decision artifact.
  - Final state: `needs-info`.

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

Testbed proof plan:

- `retry-ci-failure`
  - Trigger: testbed fixture makes a required CI check fail on an agent PR.
  - Expected: first failure creates one bounded develop retry; repeated same
    failure stops with `ci-repeated-failure` or `budget-exhausted`.
  - Evidence: issue URL, PR URL, failing CI run, retry run, stop comment,
    retry/merge-gate decision records.
  - Final state: `human-required`.
- `retry-review-failure`
  - Trigger: reviewer fixture returns `develop_retry` for a stable finding.
  - Expected: first reviewer failure creates one bounded develop retry; repeated
    same finding stops with `review-repeated-failure` or `budget-exhausted`.
  - Evidence: issue URL, PR URL, review decision, retry run, stop comment,
    retry/merge-gate decision records.
  - Final state: `human-required`.

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
- PM sends `/agent reviewer` for an open agent PR when appropriate.
- PM notices a failed/stale run and either retries or escalates with a reason.
- PM asks one clear question for underspecified issues.

Tests:

- unit tests for PM prompt fixtures and triage output
- trial issues for: ready docs issue, needs-info issue, open-PR review issue,
  failed-run retry issue, blocked label issue
- live trial PR proving PM sees an open canonical agent PR, comments
  `/agent reviewer`, directly dispatches `reviewer.yml`, and the
  review completes

Testbed proof plan:

- `pm-clear-docs`
  - Trigger: PM sweep on a small exact docs issue.
  - Expected: PM posts `/agent developer`, workflow dispatch starts, PR opens,
    CI/review pass, merge gate closes the issue.
  - Evidence: issue URL, PR URL, PM run URL, develop run URL, session path.
  - Final state: `done`.
- `pm-needs-info`
  - Trigger: PM sweep on a broad issue without acceptance criteria.
  - Expected: PM asks one concrete question and applies `needs-info`.
  - Evidence: issue URL, PM run URL, visible comment, labels.
  - Final state: `needs-info`.
- `pm-follow-up-after-needs-info`
  - Trigger: maintainer clarifies a `needs-info` issue, then PM sweeps again.
  - Expected: PM does not repeat stale status; it starts `/agent developer` and
    clears or supersedes `needs-info`.
  - Evidence: issue URL, PM run URLs before/after clarification, develop run,
    final labels.
  - Final state: `done` or `in-progress`.
- `pm-open-pr-review`
  - Trigger: issue has an open canonical `agent/issue-N` PR.
  - Expected: PM does not start duplicate develop; it comments `/agent reviewer`
    on the PR and dispatches review.
  - Evidence: issue URL, PR URL, PM run URL, review run URL, review decision.
  - Final state: `done`, `human-required`, or `in-progress`.
- `pm-blocking-visible`
  - Trigger: PM sweep on a `manual-operator-test` or blocking-label issue.
  - Expected: PM posts a visible waiting/no-action status once, then suppresses
    duplicates until newer human input appears.
  - Evidence: issue URL, two PM run URLs, one visible status comment.
  - Final state: `human-required` or `blocked`.

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
  issues. It should not start `/agent developer` for issues whose requested work
  is to exercise controls such as pause/status/resume; those should be handled
  by explicit operator commands or marked human-required/test-only.
- PM must not repeat a stale `needs-info` comment, but after a human provides
  clarifying acceptance criteria it should remove or supersede the blocker and
  start an appropriate develop run.
- PM open-PR routing needs a live fixture: when a canonical `agent/issue-N` PR
  exists, PM should avoid duplicate develop and should route to `/agent reviewer`
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
- triage approval for PM-authored `/agent developer` handoffs after a maintainer
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
- The agent records which context sources it used.

Tests:

- unit tests for context assembly
- live trial where reviewer asks for a small fix and the next develop pass
  addresses it
- live trial where human adds follow-up info and PM starts a second develop

Testbed proof plan:

- `developer-context-review-fix`
  - Trigger: reviewer requests a specific small change on an agent PR.
  - Expected: follow-up develop run receives reviewer findings and changes the
    relevant file without unrelated churn.
  - Evidence: PR URL, review decision, context-sources artifact, retry run URL,
    updated diff.
  - Final state: `done` or `in-progress`.
- `developer-context-ci-fix`
  - Trigger: CI fixture fails with a known summary.
  - Expected: follow-up develop run receives failed check name/summary and
    applies a targeted fix.
  - Evidence: PR URL, CI decision, context-sources artifact, retry run URL,
    later passing CI.
  - Final state: `done`.
- `developer-context-human-clarification`
  - Trigger: human clarifies acceptance criteria after `needs-info`.
  - Expected: next develop run receives the newer human comment and implements
    the clarified acceptance criteria.
  - Evidence: issue URL, context-sources artifact, develop run URL, PR diff.
  - Final state: `done`.

### Phase 5: Review And Merge Gate Parity

Goal: ensure all review paths have the same reliable behavior.

Build:

- direct-dispatch retry behavior in standalone `reviewer.yml`,
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

- Manual/direct `/agent reviewer` can trigger a bounded develop retry without
  depending on comment-trigger side effects.
- Merge gate refuses if PR head changed after review.
- Merge gate refuses on maintainer-blocking labels/comments.
- Production branch protection and merge gate agree on required checks.

Tests:

- unit tests for head SHA mismatch and blocking comments
- trial PR where review passes, head changes, merge is refused
- trial PR with blocking label/comment, merge is refused

Testbed proof plan:

- `review-low-risk-merge`
  - Trigger: low-risk docs PR from an agent run.
  - Expected: CI passes, reviewer returns low risk, merge gate merges and
    closes the source issue.
  - Evidence: issue URL, PR URL, CI run, review decision, merge-gate decision.
  - Final state: `done`.
- `review-human-block`
  - Trigger: maintainer adds blocking label or comment before merge gate.
  - Expected: merge gate refuses auto-merge and explains the blocker.
  - Evidence: PR URL, blocker label/comment, merge-gate decision, visible
    comment.
  - Final state: `human-required`.
- `head-changed-before-merge`
  - Trigger: PR head changes after review decision but before merge gate.
  - Expected: merge gate refuses because reviewed SHA differs from current head.
  - Evidence: PR URL, reviewed head SHA, current head SHA, merge-gate decision.
  - Final state: `blocked` or `human-required`.
- `direct-review-retry`
  - Trigger: maintainer comments `/agent reviewer` on an agent PR where reviewer
    returns `develop_retry`.
  - Expected: standalone review workflow starts a bounded develop retry without
    relying on comment-trigger side effects.
  - Evidence: PR URL, review run URL, retry dispatch/comment, retry decision.
  - Final state: `in-progress` or `human-required`.

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

Testbed proof plan:

- `operator-pause-resume`
  - Trigger: `/agent pause`, `/agent status`, `/agent developer`, `/agent resume`
    on a manual fixture issue.
  - Expected: pause label gates develop before model minting; status explains
    labels/runs; resume clears the label.
  - Evidence: issue URL, pause/status/develop/resume run URLs, labels, visible
    comments.
  - Final state: `manual fixture` or `blocked`.
- `operator-repo-pause`
  - Trigger: `/agent pause repo`, then PM/develop, then `/agent resume repo`.
  - Expected: PM and direct develop stop before model minting while paused;
    resume clears the repo-pause variable or label fallback.
  - Evidence: issue URL, pause run, paused PM/develop run, resume run, labels
    or variable state.
  - Final state: `manual fixture`.
- `workflow-edit-forbidden`
  - Trigger: explicit maintainer `/agent developer` fixture prompted toward a
    `.github/workflows/*` edit.
  - Expected: the agent's scoped token has no `workflows: write`, so no workflow
    change reaches a branch or PR; the agent escalates with a visible comment.
  - Evidence: issue URL, run URL, escalation comment.
  - Final state: `blocked`.
- `operator-cancel`
  - Trigger: `/agent cancel` while an issue has active workflow/proxy runs.
  - Expected: active workflow runs are cancelled and matching active proxy runs
    are revoked.
  - Evidence: issue URL, cancel run URL, cancelled workflow run IDs, proxy
    status before/after.
  - Final state: `blocked` or `manual fixture`.

Required fixes from the live `open-autonomy-testbed` trials:

- Add first-class testbed fixture labels, for example `testbed-control` or
  `manual-operator-test`, that exclude an issue from PM auto-develop while still
  allowing explicit `/agent pause`, `/agent status`, `/agent developer`, and
  `/agent resume` checks.
- Add a visible status path for skipped control issues so maintainers can tell
  whether PM intentionally ignored the issue because it is a manual operator
  test.
- workflow-edit boundary blocks, such as blocked workflow edits, must post a
  stable issue/PR comment and decision record before the workflow exits failed.
- Add repo-pause smoke coverage proving scheduled PM sweeps and direct develop
  stop before model token minting while `PUBLIC_AGENT_REPO_PAUSED` is enabled.

Implemented:

- issue-level pause/status/resume commands operate before model token minting
- repo-level pause honors `PUBLIC_AGENT_REPO_PAUSED` when set externally and
  also supports an `agent-repo-paused` issue-label fallback that works with the
  default GitHub workflow token
- PM sweeps and direct develop both stop while the repo-pause label fallback is
  present
- workflow-edit boundary blocks now write a visible issue comment plus a rejected
  publish decision artifact before the workflow fails

Live proof status:

- Proven live via the `self-driving-conformance` bench workload and recorded with run IDs:
  issue-level pause/status/resume (#5),
  repo-level pause/resume through the label fallback (#14), PM visible
  wait/ignore/needs-info statuses, PM follow-up from `needs-info` into develop and
  merge (#11 → PR #12), risky-workflow escalation (#4), maintainer-hold block
  (#10), `/agent retry` with no failed run (#40), and the five-issue dogfood
  (#29-#33 → merged PRs #34-#38).
- The conformance repo is provisioned reproducibly by `bun bin/bench.ts --live --workload
  self-driving-conformance --profile self-driving` (`scripts/provision-target-repo.ts` +
  `bench/workload/self-driving-conformance/seed/provision.json`), not a one-off manual setup.
- Remaining live demonstrations require synthetic fixtures that do not exist yet:
  `retry-ci-failure`, `retry-review-failure`, `head-changed-before-merge`, and
  `workflow-edit-forbidden`. Their deterministic gate behavior is already
  covered by unit tests; only the *live* testbed demonstration is outstanding.
  `pm-open-pr-review` is awaiting a clean scheduled sweep after a transient
  reviewer-model outage.

Proof audit:

- `docs/PROOF_LEDGER.md` maps every `.open-autonomy/roadmap.yml` proof gate to
  evidence.
- `scripts/open-autonomy-proof-audit.ts` fails CI if a roadmap proof gate is not
  represented as `done` in the proof ledger. A live-run ledger
  (`TEST_RUNS.md`) only counts as evidence when it records at least one real
  workflow run, so an empty ledger template can no longer satisfy a live gate on a
  file-exists technicality.
- Planner, preflight, governance, CI, and template/example checks are all part
  of the completion bar.

Remaining live bench proof work:

- Build conformance-only synthetic fixtures so retry/merge edge cases can be driven
  live without damaging real workflows: a required-CI-failure toggle, a reviewer
  `develop_retry` toggle, a head-changed-before-merge race harness, and a
  maintainer-triggered forbidden-workflow-edit develop run.
- With those fixtures, let the scheduled autonomy drive `retry-ci-failure`,
  `retry-review-failure`, `head-changed-before-merge`, and
  `workflow-edit-forbidden` in the `self-driving-conformance` workload, then record
  run IDs and final states.
- Capture one clean scheduled `pm-open-pr-review` sweep once the reviewer-model
  path is healthy. The human-in-the-loop rule applies: set preconditions, then
  let the cron-driven PM/agents/merge gate run unattended.

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
3. Reviewer/merge gate surfaces risky changes instead of path policy
   deciding product risk.
4. Auto-merge low-risk reviewed changes.
5. Enable label management.
6. Consider duplicate/spam closure after a conservative trial.

Acceptance criteria:

- All production defaults are visible in docs or repo variables.
- Emergency disable path is tested.
- At least five trial issues have completed without manual repair across
  develop, review, merge, and issue closure.

Testbed proof plan:

- `production-preflight`
  - Trigger: run preflight against the testbed repository.
  - Expected: reports configured secrets/variables, labels, permissions, branch
    protection expectations, and missing items without starting agent work.
  - Evidence: workflow run URL, preflight report artifact, issue comment or
    summary.
  - Final state: `done`.
- `production-emergency-disable`
  - Trigger: enable emergency disable, then attempt PM sweep and direct develop.
  - Expected: both paths stop before model minting with a visible disable
    reason; disabling the switch resumes normal routing.
  - Evidence: issue URL, disable run, blocked PM/develop runs, resume run.
  - Final state: `blocked` then `manual fixture`.
- `production-branch-protection`
  - Trigger: run a low-risk agent PR under the configured branch protection
    strategy.
  - Expected: required checks and merge gate agree; auto-merge only happens
    after current CI/review/current head pass.
  - Evidence: PR URL, required checks, review decision, merge-gate decision,
    merge event.
  - Final state: `done`.
- `production-five-issue-trial`
  - Trigger: run five low-risk public issues through PM/develop/review/merge.
  - Expected: all five complete without manual repair, or each escalation has a
    stable reason.
  - Evidence: five issue URLs, PR/run URLs, final states in `TEST_RUNS`.
  - Final state: `done` or documented escalation.

## Open Design Choices

- Final structured schema for decision records.
- Whether merge gate should keep direct squash merge or switch to GitHub
  auto-merge when branch protection requires it.
- How to identify human-blocking labels and unresolved maintainer comments.
- Whether PM agent may close obvious duplicates/spam or only recommend closure.
- Whether raw artifacts should be mirrored to permanent object storage.
- Whether trusted maintainers can opt into workflow edits per run. Default is
  no.

## Expanded Roadmap After Current Proof Gates

Begin this expansion only after the remaining live testbed gaps above are
proven or explicitly marked as intentionally deferred.

### Phase 8: Direction, Constitution, And Planning Loop

Goal: make the repo self-driving from committed direction, not only reactive to
human-created issues.

Build:

- root `AGENTS.md` as the compatibility layer for coding agents
- `.codex/skills/open-autonomy-*/SKILL.md` for repo-local agent roles
- `.open-autonomy/autonomy.yml` for the Open Autonomy index of docs, skills,
  agents, triggers, capabilities, and machine-readable policy
- `docs/CONSTITUTION.md` for non-negotiable operating principles
- `.open-autonomy/roadmap.yml` for planner-readable phases, priorities,
  dependencies, proof gates, and acceptance criteria
- `.open-autonomy/review-rubric.yml` for structured reviewer criteria
- `docs/standards/` for scoped code, docs, tests, and security standards
- planner workflow that reads roadmap, policy, open issues, PRs, and decision
  evidence to create, update, prioritize, or defer GitHub issues
- issue-origin metadata for `human`, `roadmap-planner`, `testbed-seed`,
  `security-alert`, `dependency-update`, `ci-failure`, `reviewer-followup`,
  `pm-followup`, and `external-ticket`

Acceptance criteria:

- The architecture doc, roadmap, and target repo control files agree on one
  document model.
- Planner-created issues include phase, priority, origin, dependency, roadmap
  item, and acceptance criteria.
- Planner does not create duplicate issues for existing open/closed work.
- Develop prompts include relevant issue acceptance criteria, `AGENTS.md`,
  constitution, policy summary, matching standards, and prior decisions.
- Review verdicts explicitly evaluate constitution, policy, issue acceptance
  criteria, standards, tests, and scope.
- Maintainers can change direction by editing committed roadmap/constitution
  files, while hard permissions remain enforced by policy and workflow code.

Tests:

- unit tests for roadmap parsing, issue dedupe, and issue metadata rendering
- testbed fixture where planner creates missing proof-gate issues from
  `.open-autonomy/roadmap.yml`
- testbed fixture where edited roadmap priority changes PM issue ordering
- review fixture proving rubric/constitution failures produce
  `human_required` or `develop_retry`

Testbed proof plan:

- `planning-control-files-present`
  - Trigger: scaffold or update testbed with `AGENTS.md` and
    `.open-autonomy/*` files.
  - Expected: preflight validates required files and reports their role.
  - Evidence: PR URL, preflight run URL, validated file list.
  - Final state: `done`.
- `planner-creates-proof-gate-issues`
  - Trigger: planner scans `.open-autonomy/roadmap.yml` with missing proof
    gates.
  - Expected: planner creates or updates issues with phase, priority, origin,
    roadmap item, dependencies, and acceptance criteria.
  - Evidence: planner run URL, created/updated issue URLs, dedupe decision
    records.
  - Final state: `in-progress`.
- `planner-dedupes-existing-work`
  - Trigger: roadmap item already has an open or closed issue.
  - Expected: planner updates/linkbacks instead of creating a duplicate.
  - Evidence: planner run URL, existing issue URL, dedupe decision.
  - Final state: `done`.
- `review-rubric-enforcement`
  - Trigger: PR intentionally violates constitution/rubric while passing basic
    CI.
  - Expected: reviewer returns `human_required` or `develop_retry` with the
    rubric item named.
  - Evidence: PR URL, review decision, visible review comment.
  - Final state: `human-required`.

### Phase 9: Self-Hosted Repository Fleet

Goal: make open-autonomy easy to install, upgrade, and compare across many
repositories.

Build:

- installation command that installs workflows, scripts, docs, labels, and
  required repo variables (`open-autonomy compile profiles/self-driving github <target>`
  compiles the profile into the target; `scripts/provision-target-repo.ts` idempotently
  creates the GitHub repo and reconciles variables, labels, and branch protection from a
  committed `provision.json` manifest, reporting required secrets as manual
  follow-up)
- versioned policy/profile file so each repo can declare allowed paths,
  required checks, retry budgets, PM mode, and merge mode
- upgrade workflow that opens a PR when the open-autonomy template changes
- compatibility checks that report missing secrets, variables, labels, branch
  protection, and workflow permissions before autonomous work starts

Acceptance criteria:

- A fresh repo can be converted into a self-driving repo with a documented,
  repeatable command sequence.
- The testbed can verify both a new install and an upgrade from an older
  template revision.
- Each autonomous run records which open-autonomy version/profile it used.

Testbed proof plan:

- `fleet-fresh-install`
  - Trigger: scaffold open-autonomy into a clean throwaway repository.
  - Expected: workflows/scripts/docs/control files are installed, checks pass,
    and preflight reports ready or exactly what is missing.
  - Evidence: repo URL, scaffold output, CI run URL, preflight report.
  - Final state: `done`.
- `fleet-template-upgrade`
  - Trigger: testbed repo starts from an older template revision, then upgrade
    workflow runs.
  - Expected: upgrade opens a PR with template changes and migration notes.
  - Evidence: repo URL, upgrade run URL, PR URL, template version before/after.
  - Final state: `in-progress` or `done`.
- `fleet-missing-config`
  - Trigger: preflight runs in a repo with missing secret/variable/label/branch
    protection.
  - Expected: preflight blocks autonomous work and lists exact remediation.
  - Evidence: preflight run URL, report artifact, visible issue/summary comment.
  - Final state: `blocked`.
- `fleet-version-recorded`
  - Trigger: low-risk develop run in a scaffolded repo.
  - Expected: session evidence records open-autonomy version/profile.
  - Evidence: session path, manifest, decision record, PR URL.
  - Final state: `done`.

### Phase 10: Durable State And Audit Trail

Goal: make autonomous decisions queryable without scraping Actions logs.

Build:

- committed or published decision index keyed by issue, PR, run ID, and head SHA
- stable schema for PM, develop, publish, CI, review, retry, merge, pause, and
  close decisions
- artifact mirroring option for long-term retention outside GitHub Actions
- issue/PR status summary command that reads the durable index first

Acceptance criteria:

- A maintainer can answer why an issue was skipped, developed, retried, merged,
  or escalated from repo-visible evidence.
- Decision records survive Actions artifact expiration.
- The testbed has a scenario that rebuilds status from durable records only.

Testbed proof plan:

- `audit-index-build`
  - Trigger: build/update decision index after several PM/develop/review/merge
    runs.
  - Expected: index contains issue, PR, run, head SHA, decision, and evidence
    links for each run.
  - Evidence: index artifact or committed file, source session paths, summary.
  - Final state: `done`.
- `audit-status-from-index`
  - Trigger: `/agent status` or equivalent status command runs with Actions
    artifacts ignored.
  - Expected: status reconstructs current state from durable records.
  - Evidence: issue URL, status run URL, status comment, index source.
  - Final state: `done`.
- `audit-artifact-expiration-simulation`
  - Trigger: hide or omit raw workflow artifacts from status lookup in test.
  - Expected: durable records still answer why the issue stopped or merged.
  - Evidence: test run URL, status output, index records.
  - Final state: `done`.

### Phase 11: Agent Quality And Repair Loops

Goal: improve success rate without loosening safety gates.

Build:

- richer developer context from prior failed attempts, review findings, CI
  summaries, and relevant docs
- bounded repair plans that explain what changed between retry attempts
- evaluator fixtures for docs-only, code-only, test-fix, and refactor tasks
- regression detection for repeated failure signatures and low-value churn

Acceptance criteria:

- Retry attempts demonstrably use the previous failure evidence.
- Repeated bad approaches are stopped and escalated with a stable reason.
- Testbed fixtures cover successful repair, repeated failure, and human handoff.

Testbed proof plan:

- `quality-ci-repair`
  - Trigger: CI fixture fails due to a known small error.
  - Expected: retry uses failure summary and repairs the issue.
  - Evidence: failing run, retry run, context-sources artifact, passing CI.
  - Final state: `done`.
- `quality-review-repair`
  - Trigger: reviewer asks for a specific small fix.
  - Expected: retry uses reviewer finding and produces a targeted change.
  - Evidence: review decision, retry run, updated diff, later review pass.
  - Final state: `done`.
- `quality-repeated-bad-approach`
  - Trigger: fixture causes the agent to repeat the same failed approach.
  - Expected: repeated failure signature stops further retries and escalates.
  - Evidence: repeated failure decisions, stop comment, retry budget record.
  - Final state: `human-required`.
- `quality-human-handoff`
  - Trigger: repair loop reaches ambiguity or low-value churn.
  - Expected: system asks for a specific human decision instead of continuing.
  - Evidence: issue URL, stop comment, final decision record.
  - Final state: `human-required`.

### Phase 12: Maintainer Governance

Goal: give maintainers clear control over autonomy level and repository risk.

Build:

- per-label and per-path autonomy levels such as audit-only, PM-comment,
  develop-only, review-only, and auto-merge
- maintainer approval gates for risky classes such as workflow, security,
  dependency, release, or billing changes
- project/backlog policy for stale `needs-info`, duplicate/spam suggestions,
  and priority ordering
- safety reports showing cost, retry counts, skipped issues, and escalations

Acceptance criteria:

- Maintainers can change autonomy level without editing workflow code.
- Risky changes are routed to explicit human approval before merge.
- Weekly status can be generated from repository-visible data.

Testbed proof plan:

- `governance-audit-only`
  - Trigger: policy/profile sets a path or label to audit-only.
  - Expected: PM/reviewer may comment, but develop/publish/merge do not run.
  - Evidence: issue URL, PM/review comment, policy decision.
  - Final state: `human-required` or `blocked`.
- `governance-develop-only`
  - Trigger: policy/profile allows develop but not auto-merge.
  - Expected: PR opens and review runs, but merge gate stops for maintainer
    approval.
  - Evidence: PR URL, review decision, merge-gate human-required decision.
  - Final state: `human-required`.
- `governance-risky-approval`
  - Trigger: issue requests workflow, dependency, security, release, or billing
    change.
  - Expected: system routes to explicit maintainer approval before any merge.
  - Evidence: issue URL, policy decision, approval request comment.
  - Final state: `human-required`.
- `governance-weekly-report`
  - Trigger: scheduled report workflow.
  - Expected: report summarizes cost, retry counts, skipped issues, escalations,
    open PRs, and paused state from repo-visible data.
  - Evidence: report artifact or issue comment, source index.
  - Final state: `done`.

### Phase 13: Public OSS Readiness

Goal: make open-autonomy usable by external maintainers without private Volter
assumptions.

Build:

- clean OSS README with quickstart, architecture, threat model, and limitations
- cookbook examples for docs-only repo, small app repo, library repo, and the
  live testbed
- contribution guide for adding new policies, workflows, and test scenarios
- release process with changelog, migration notes, and template versioning

Acceptance criteria:

- A maintainer outside Volter can run the docs-only cookbook and understand the
  trust boundaries.
- The examples are self-contained repos or documented submodules that can be
  pushed independently.
- The canonical repo dogfoods the same released open-autonomy workflow it ships.

Testbed proof plan:

- `oss-docs-only-cookbook`
  - Trigger: external-style clean clone follows docs-only quickstart.
  - Expected: checks pass, one low-risk docs issue runs through PR/review/merge
    or documented manual merge gate.
  - Evidence: repo URL or local transcript, CI run URL, issue/PR URLs.
  - Final state: `done`.
- `oss-testbed-independent-push`
  - Trigger: create/push the testbed example as a standalone repository.
  - Expected: its workflows, seed script, test matrix, and checks work without
    relying on canonical repo state.
  - Evidence: repo URL, CI run URL, seeded issue URLs.
  - Final state: `done`.
- `oss-small-app-cookbook`
  - Trigger: scaffold and run the future small app example.
  - Expected: agent can make a bounded app change with tests and review.
  - Evidence: repo URL, issue URL, PR URL, CI/review decisions.
  - Final state: `done`.
- `oss-release-dogfood`
  - Trigger: canonical repo updates to use its released template/version.
  - Expected: self-hosted open-autonomy run records the release version and
    passes the same gates shipped to users.
  - Evidence: release tag, PR URL, session manifest, CI/review/merge decisions.
  - Final state: `done`.
