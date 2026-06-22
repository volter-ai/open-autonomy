# Live Testing Strategy

This document defines how open-autonomy proves itself in a live, disposable
testbed repository with **no fakery**. It is part of the canonical direction:
the agents, planner, and any human or AI operator should read it before running
or extending live tests.

The bar is strict: by the end of a ~60 minute session, **every open-autonomy
feature has been demonstrated end-to-end in a real GitHub repository**, driven by
the real autonomy (real model calls, real workflows, real merge gate), with the
only human inputs being the kinds of inputs a real maintainer would provide.

## 1. No-fakery contract

A live test only counts if the autonomous system did the autonomous work. The
operator (human or the AI "proctor" defined below) may only take actions a real
maintainer/user could take.

Allowed operator actions (these are the *human-in-the-loop* inputs the system is
designed to consume):

- file issues as a user or maintainer would
- answer `needs-info` questions with real clarifying comments
- apply or remove maintainer labels (`do-not-merge`, `human-required`,
  `agent-blocked`, `agent-maintainer-hold`, `manual-operator-test`)
- type operator commands a human owns: `/agent pause`, `/agent resume`,
  `/agent pause repo`, `/agent resume repo`, `/agent status`, `/agent retry`,
  `/agent cancel`, and an explicit maintainer `/agent develop` or `/agent review`
- review and approve or merge a PR that the system has deliberately routed to
  `human-required` (a maintainer decision the system asked for)
- edit a PR branch as a maintainer (e.g. to create a head-change condition)

Forbidden (these fake the autonomy and invalidate the evidence):

- `gh workflow run` on the PM scheduler to force a sweep — the scheduled cron must
  fire on its own cadence
- merging a low-risk PR that the merge gate is supposed to auto-merge
- writing patches, reviews, or decisions on behalf of the developer/reviewer agent
- stubbing, disabling, or mocking model calls, CI, or any gate
- hand-editing decision records, `TEST_RUNS.md` run IDs, or proof evidence

If a line cannot be unblocked by an allowed human action, it is **not** proven —
record it as a gap, never paper over it.

## 2. Roles

- **The autonomy** (must drive itself): scheduled PM triage, the dispatcher,
  developer agent, publisher, CI gate, reviewer agent, merge gate, planner,
  upgrade, decision memory.
- **The proctor** (human-in-the-loop, played by a maintainer or an AI agent acting
  as one): sets up preconditions, supplies human inputs that unblock new lines,
  assesses progress qualitatively and quantitatively, and records evidence. The
  proctor never does the autonomy's job.

### Simulating the human (deterministic / bench runs only)

The proctor above is a **real** human-in-the-loop — that is what a no-fakery proof requires (Section 1):
when the system routes a task to a person, a real maintainer (or an AI proctor acting as one) makes the
actual decision. **Do not use the simulator below in a no-fakery proof run** — a simulated decision is not
a real maintainer decision, and counting it as one would be fakery.

For a *different* purpose — **reproducible, unattended** runs (regression tests, and Bench scoring of an
org design) — a human task can instead be fulfilled by a **deterministic human simulator**
(`scripts/human-sim.ts`). It is a **test double**: it exercises the human-seam *mechanism* (a `HumanTask`
is created → notified → resolved → measured) with no person, reproducibly and without contamination. It is
explicitly **not** a model of real human behavior — a behavior-calibrated simulator is *derived from a
recorded real run* (real-run-first), never hand-authored.

- `approve` / `reject` → a verified resolution (recorded as `human:<sim>`), so the flow completes and the
  autonomy ratio (`scripts/autonomy-ratio.ts`) counts it as resolved human work.
- `abandon` → a non-responsive human: no resolution, so the handoff stays **pending** and the flow is
  **not** `complete` — exercising the no-presumed-done / escalation path.

The two modes must not be conflated: **real proctor = proof; simulator = reproducible test/bench.** Any
Bench number produced with the simulator carries the "simulated, not calibrated" caveat until a real run
calibrates it.

## 3. Pillar 1 — Hands-free setup of a new testbed repo

A fresh testbed must reach "ready, seeded, and self-driving" from one command,
with the single unavoidable manual step (a secret) reported explicitly.

`bun run testbed:bootstrap --repo <owner/name>` chains, each step idempotent:

1. `provision-target-repo.ts` — create the repo (private) and reconcile variables,
   labels, and branch protection from `examples/testbed/provision.json`.
2. report the required secret (`MODEL_PROXY_ADMIN_TOKEN`); the proxy must already
   trust the repo's `public-agent.yml` workflow for OIDC
   (`services/agent-model-proxy/wrangler.toml`).
3. set the testbed PM cron to a fast cadence (`*/5 * * * *`) so a 60 minute session
   sees many sweeps. This is testbed-only; production stays at `*/30`.
4. `testbed-seed-issues.ts --apply --all` — seed every scenario issue and fixture.
5. run `Open Autonomy Preflight`; exit ready, or print exactly what is missing.

The only manual action is pasting the proxy admin token once. Everything else is
scripted and re-runnable.

## 4. Pillar 2 — The testbed contains everything needed to test everything

The seed (`examples/testbed/scripts/testbed-seed-issues.ts`) plus a small set of
**testbed-only fixtures** must cover every feature. Fixtures are explicit,
labelled `manual-operator-test`, and never touch real production behavior.

Fixtures (implemented as testbed-only mechanisms — the testbed runs its own copies
of the scripts/workflows, so these never touch canonical production code). Each
creates a **real** condition keyed off a per-PR sentinel file the develop agent
actually writes, so there is no model/CI stubbing:

- **CI-failure** — `.github/workflows/ci.yml` fails when `.testbed/force-ci-failure`
  is present. The `retry-ci-failure` seed issue asks the agent to add that file, so
  the required check really fails and the CI-retry loop + `ci-repeated-failure` /
  `budget-exhausted` stop run live.
- **Reviewer `develop_retry`** — `scripts/public-agent-review.ts` returns a stable
  `develop_retry` verdict when the PR diff adds `.testbed/force-review-retry`
  (`forcedReviewRetryVerdict`). The `retry-review-failure` seed issue asks for that
  marker, exercising the review-retry loop + `review-repeated-failure` stop.
- **Forbidden-edit** — `scripts/github-agent-session.ts`
  (`maybeApplyPublisherRejectionFixture`) injects a real `.github/workflows/ci.yml`
  edit into the bundle for the `publisher-policy-rejection` fixture issue, so the
  publisher rejects a genuine forbidden edit.
- **Head-change** — a proctor procedure (no code): push a commit to a reviewed PR
  before the merge gate to prove SHA-binding refusal.

### Coverage map (feature → live scenario → human unblock → proof)

| Feature / capability | Scenario id | Human unblock action (if any) | Final state |
| --- | --- | --- | --- |
| PM triage → develop on clear issue | `pm-clear-docs` | none (file the issue) | `done` |
| PM asks one question | `pm-needs-info` | none | `needs-info` |
| PM follow-up after clarification | `pm-follow-up-after-needs-info` | answer the question | `done` |
| PM escalates risky workflow request | `pm-human-required-risky-workflow` | none | `human-required` |
| PM routes open agent PR to review | `pm-open-pr-review` | ensure an open agent PR exists | `done`/`in-progress` |
| PM visible no-op / duplicate suppression | (seeded broad issue) | none | `needs-info`/`blocked` |
| Dispatcher budget / loop / blocking-label enforcement | observed across lines | apply blocking label | n/a |
| Developer creates/updates agent PR | every develop line | none | n/a |
| Publisher rejects forbidden workflow edit | `publisher-policy-rejection` | maintainer `/agent develop` fixture | `blocked` |
| CI required-check gate + retry then stop | `retry-ci-failure` | CI-failure fixture marker | `human-required` |
| Reviewer low-risk pass → auto-merge | `review-low-risk-merge` / dogfood | none | `done` |
| Reviewer `develop_retry` then stop | `retry-review-failure` | reviewer fixture marker | `human-required` |
| Reviewer/merge rubric + constitution enforcement | `governance-maintainer-hold` | none | `human-required` |
| Merge gate refuses maintainer hold | `governance-maintainer-hold` / `review-human-block` | apply hold label/comment, then clear | `human-required` → `done` |
| Merge gate refuses changed head | `head-changed-before-merge` | push to reviewed PR | `blocked` |
| Operator pause/status/resume (issue) | `operator-pause-resume` | `/agent pause`, `/agent status`, `/agent resume` | manual fixture |
| Operator repo pause/resume | `repo-pause` | `/agent pause repo`, `/agent resume repo` | manual fixture |
| Operator retry with no failed run | `operator-retry-no-failure` | `/agent retry` | manual fixture |
| Operator cancel active run | `operator-cancel` | `/agent cancel` while active | `blocked` |
| Planner creates proof-gate issues + dedupe | `planner-creates-proof-gate-issues` | none (let planner run) | `in-progress` |
| Decision memory reconstructs state | `decision-memory-smoke` | none | `done` |
| Five low-risk issues end-to-end | `five-issue-dogfood` | answer any questions | `done` |
| Fleet: scaffold / provision / preflight / upgrade / version recorded | `scaffold-install-check`, `fleet-*` | run preflight/upgrade | `done` |
| Governance develop-only / risky-approval | `governance-develop-only`, `governance-risky-approval` | approve the human-required PR | `human-required` → `done` |

Each row maps to a `TEST_MATRIX.md` row and a `.open-autonomy/roadmap.yml` proof
gate; results are recorded in `examples/testbed/docs/TEST_RUNS.md` with run IDs.

## 5. Pillar 3 — The proctor playbook

The proctor runs on an interval (default **every 5 minutes**) for ~60 minutes. The
testbed PM cron is also `*/5`, so each proctor tick lands just after a sweep.

### Each tick: assess, then act

**Quantitative assessment** (record the numbers):

- issues by state (open/closed) and by label (`needs-info`, `human-required`,
  `agent-blocked`, holds)
- open vs merged agent PRs; PRs awaiting review vs human decision
- workflow runs since last tick by conclusion (success/failure/skipped)
- scenarios proven vs pending vs failed (against the coverage map)
- model budget consumed vs caps (PM/triage/review/agent)

**Qualitative assessment** (record the judgment):

- Is the autonomy making correct decisions (right triage class, right risk, right
  escalation)? Cite the visible comment/decision record.
- Anything stuck, looping, or repeating a stale status? That is a finding, not a
  thing to hand-fix.
- Which lines are blocked specifically *waiting on a human*? Those are the
  proctor's action items this tick.

**Act** — take only the allowed human actions that unblock new lines:

- answer outstanding `needs-info` questions
- review and merge/approve PRs the system routed to `human-required`
- apply a maintainer hold to a ready PR (to test refusal), then clear it next tick
- push a commit to a reviewed PR to create a head-change condition
- run operator commands for the pause/resume/retry/cancel lines
- file the next fresh issue to start a new clean line (keep the dogfood flowing)
- trigger maintainer-only fixtures (forbidden-edit develop, fixture markers)

Then record every new outcome (issue/PR/run URL, final state) in `TEST_RUNS.md`.

### Illustrative 60-minute schedule

Times are relative; adjust to the live cadence. Let the scheduled sweep do the
work between proctor ticks.

- **T+0 — Bootstrap & seed.** Run `testbed:bootstrap`; confirm preflight ready and
  all scenarios seeded. Take no autonomous action.
- **T+5 — First sweep triage.** Observe PM classify clear/needs-info/risky/duplicate.
  Human action: none yet.
- **T+10 — Unblock follow-ups.** Answer `needs-info` questions (`pm-needs-info`,
  `pm-follow-up-after-needs-info`). Observe develop start on clear docs issues.
- **T+15 — First merges.** Observe develop→publish→CI→review→merge close clear
  issues (`pm-clear-docs`, `review-low-risk-merge`). Begin the five-issue dogfood.
- **T+20 — Retry loops.** Activate CI-failure and reviewer-failure fixtures; observe
  one bounded retry then the visible `ci-repeated-failure` /
  `review-repeated-failure` / `budget-exhausted` stop.
- **T+25 — Merge-gate refusals.** Apply a maintainer hold to a ready PR
  (`governance-maintainer-hold` / `review-human-block`); confirm the merge gate
  refuses with a reason. Create a head-change on a reviewed PR
  (`head-changed-before-merge`); confirm SHA-binding refusal.
- **T+30 — Publisher policy.** Trigger the forbidden-workflow-edit develop fixture
  (`publisher-policy-rejection`); confirm visible rejection + rejected-publish
  decision before the job fails.
- **T+35 — Operator controls.** `/agent pause` → `/agent status` → maintainer
  `/agent develop` (blocked) → `/agent resume` (`operator-pause-resume`).
  `/agent pause repo` → confirm PM/develop stop → `/agent resume repo`
  (`repo-pause`). `/agent retry` on a clean issue (`operator-retry-no-failure`).
  `/agent cancel` on an active run (`operator-cancel`).
- **T+40 — Unblock governance.** Clear the hold from T+25; confirm the merge gate now
  merges. Review and merge any `human-required` / develop-only PR
  (`governance-develop-only`, `governance-risky-approval`).
- **T+45 — Planner & memory.** Let the planner run; confirm it creates missing
  proof-gate issues and dedupes (`planner-creates-proof-gate-issues`). Confirm the
  decision index reconstructs state (`decision-memory-smoke`).
- **T+50 — PM open-PR routing.** With an open agent PR present, let the scheduled
  sweep route it to `/agent review` (`pm-open-pr-review`).
- **T+55 — Fleet & upgrade.** Run preflight and the upgrade workflow; confirm version
  is recorded in session evidence (`scaffold-install-check`, `fleet-version-recorded`).
- **T+60 — Coverage report.** Produce the final report: every coverage-map row marked
  proven (with run IDs) or an honest gap with the reason.

### Stop / escalate rules for the proctor

- If a scenario loops or repeats a stale status, stop driving it and record the
  finding; do not hand-fix.
- If model budget trips or the model path errors, record a transient-outage gap and
  retry that line on a later tick — never stub the model.
- End the session with a written coverage verdict; "green" requires real run-ID
  evidence for every feature, not a passing audit alone.

## 6. Evidence and reporting

- Per-scenario rows in `examples/testbed/docs/TEST_RUNS.md`: issue URL, PR URL, run
  URL, final state, decision-artifact/session path, gaps.
- The proof audit (`scripts/open-autonomy-proof-audit.ts`) only accepts a
  `TEST_RUNS.md`-backed gate when the ledger records at least one real run, so live
  evidence cannot be faked by an empty template.
- The 60-minute coverage report is the qualitative+quantitative summary the proctor
  writes at T+60.

## 7. Tooling

Built and committed:

- `bun run testbed:bootstrap` (`scripts/bootstrap-testbed.ts`) — provision → secret
  check → seed-all → preflight, idempotent.
- `bun run testbed:provision` (`scripts/provision-target-repo.ts`) — repo, variables,
  labels, branch protection from `examples/testbed/provision.json`.
- `bun run testbed:proctor` (`scripts/testbed-proctor-report.ts`) — the quantitative
  snapshot + coverage classification the proctor records each tick.
- The four Section-4 fixtures and the expanded seed (`operator-retry-no-failure`,
  `repo-pause`, `operator-cancel`, `governance-develop-only`,
  `governance-risky-approval`).
- The testbed PM cron is `*/5` so a 60-minute session sees frequent sweeps.

Still operational, not code:

- The proctor itself — a maintainer or an AI agent running Section 5 on an interval
  (e.g. via `/loop`), taking the allowed human actions and writing the T+60 report.
