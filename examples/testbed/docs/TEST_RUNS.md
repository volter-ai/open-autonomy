# Test Runs

Live-run ledger for the `volter-ai/open-autonomy-testbed` repository. Each row records the issue,
PR, and workflow-run evidence for a `TEST_MATRIX.md` scenario, its final state, and any gaps.

Repository: <https://github.com/volter-ai/open-autonomy-testbed> (private).
Provisioned reproducibly with `bun run testbed:provision` (`scripts/provision-target-repo.ts` +
`examples/testbed/provision.json`). Preflight `ready`:
<https://github.com/volter-ai/open-autonomy-testbed/actions/runs/27706032520>.

State legend matches `TEST_MATRIX.md`: `done`, `needs-info`, `human-required`, `blocked`,
`in-progress`.

## PM And Issue Triage

| Scenario | Evidence | Final state |
| --- | --- | --- |
| `pm-clear-docs` | Clear docs issues developed, reviewed, and merged: issues #29-#33 → PRs #34-#38, merged by the deterministic merge gate. Merge sessions e.g. `27701701974`, `27701873576`, `27702036215`, `27702212582`. <https://github.com/volter-ai/open-autonomy-testbed/pull/38> | `done` |
| `pm-needs-info` | PM asked one concrete question and applied `needs-info`: <https://github.com/volter-ai/open-autonomy-testbed/issues/7>, <https://github.com/volter-ai/open-autonomy-testbed/issues/13>. PM sweep run `27704877795`. | `needs-info` |
| `pm-follow-up-after-needs-info` | Full follow-up loop: PM `needs-info` → maintainer clarifies → PM posts `/agent develop` → PR #12 merged → issue closed. <https://github.com/volter-ai/open-autonomy-testbed/issues/11>, <https://github.com/volter-ai/open-autonomy-testbed/pull/12>. | `done` |
| `pm-human-required-risky-workflow` | PM escalated a workflow-bypass request as `human-required` + `agent-blocked`. <https://github.com/volter-ai/open-autonomy-testbed/issues/4>. PM sweep run `27704877795`. | `human-required` |
| `pm-open-pr-review` | PARTIAL — PM sweep `27706265371` ran with open PR #39 present; PM chose target-aware `/agent develop` to update the existing `agent/issue-17` PR rather than routing to `/agent review`. A clean routing demonstration is blocked by a transient reviewer-model outage (PR #39 review returned "Reviewer model call failed"); retry when the model path is healthy. <https://github.com/volter-ai/open-autonomy-testbed/issues/17>, <https://github.com/volter-ai/open-autonomy-testbed/pull/39>. | _pending (model outage)_ |

## Operator Controls

| Scenario | Evidence | Final state |
| --- | --- | --- |
| `operator-pause-resume` | Pause → status → develop-blocked → resume on a manual fixture issue: <https://github.com/volter-ai/open-autonomy-testbed/issues/5> (visible comments: `/agent develop`, PM `human required`, "Agent pause enabled", `/agent status` summary, develop refused `policy_blocked`). Public Agent Session runs `27701483508`, `27704897971`. | `human-required` (manual fixture) |
| `operator-retry-no-failure` | `/agent retry` on a clean fixture issue posted "Agent retry did not find a failed infrastructure run for this issue. No develop pass was started." <https://github.com/volter-ai/open-autonomy-testbed/issues/40>, run `27706255267`. | `done` (manual fixture) |
| `repo-pause` | Issue-pause and repo-pause both gate develop before model minting, then clear: <https://github.com/volter-ai/open-autonomy-testbed/issues/14> (comments: "Agent pause enabled" → develop `policy_blocked` → "pause cleared" → "Agent repo pause enabled" → develop "waiting: repo-level agent pause" → "repo pause cleared"). | `done` (manual fixture) |

## Review, Retry, And Merge Gate

| Scenario | Evidence | Final state |
| --- | --- | --- |
| `review-low-risk-merge` | Low-risk docs PRs reviewed low-risk with passing CI and auto-merged by the merge gate, closing the source issue: PRs #34-#38. <https://github.com/volter-ai/open-autonomy-testbed/pull/36>. Merge session `27702036215`. | `done` |
| `review-human-block` | Maintainer-hold blocking label keeps the merge gate / PM from proceeding: <https://github.com/volter-ai/open-autonomy-testbed/issues/10> (`human-required`, `agent-blocked`, `agent-maintainer-hold`; PM "waiting. blocking label present"). | `human-required` |
| `retry-ci-failure` | PENDING — needs a synthetic required-CI-failure fixture on an agent PR to exercise one bounded develop retry then `ci-repeated-failure`/`budget-exhausted` stop. | _pending_ |
| `retry-review-failure` | PENDING — needs a reviewer fixture returning `develop_retry` for a stable finding to exercise retry then `review-repeated-failure` stop. | _pending_ |
| `head-changed-before-merge` | PENDING — needs a PR whose head changes after the review decision but before the merge gate, to prove SHA-binding refusal. | _pending_ |
| `publisher-policy-rejection` | PENDING — needs an explicit maintainer-triggered develop fixture whose bundle attempts a forbidden workflow edit, to prove publisher rejection + visible comment + rejected-publish decision. | _pending_ |

## Notes

- All autonomous outcomes above (triage, develop, review, merge, pause/hold reactions) were driven by
  the system itself — the scheduled `Public Agent PM` sweep (cron `*/30 * * * *`), the agent sessions,
  the publisher, and the deterministic merge gate. The human-in-the-loop actions were limited to
  filing issues, answering `needs-info`, applying maintainer labels, and typing operator commands
  (`/agent retry` on #40).
- `pm-clear-docs`, `pm-follow-up-after-needs-info`, and `review-low-risk-merge` together constitute
  the Phase 7 `five-issue-dogfood`: five low-risk issues (#29-#33) ran through PM/develop/review/merge
  without manual repair (PRs #34-#38).
- `pm-open-pr-review` is awaiting a clean scheduled sweep once the transient reviewer-model outage
  clears; the human precondition (an open `agent/issue-17` PR, #39) is already in place.
- The four fixture-dependent scenarios (`retry-ci-failure`, `retry-review-failure`,
  `head-changed-before-merge`, `publisher-policy-rejection`) need synthetic CI/reviewer/head-race/
  forbidden-edit fixtures built into the testbed before they can be demonstrated live. Their
  deterministic gate behavior is already covered by unit tests (`scripts/public-agent-loop-budget.ts`,
  `scripts/public-agent-merge-gate.ts`, `scripts/github-agent-publish.ts` and matching `*.test.ts`);
  the rows above track the remaining *live* demonstrations.
