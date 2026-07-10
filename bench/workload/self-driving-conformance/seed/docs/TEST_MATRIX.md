# Test Matrix

This testbed tracks live behavior that should be visible on GitHub issues and
pull requests. Every scenario should end in one of these states:

- `done`: merged PR and closed issue
- `needs-info`: PM asked a concrete question
- `human-required`: PM, reviewer, or policy escalated to a maintainer
- `blocked`: agent stopped with a concrete reason
- `in-progress`: an active run or open PR exists and future work is gated

## PM And Issue Triage

| ID | Scenario | Trigger | Expected visible result |
| --- | --- | --- | --- |
| `pm-clear-docs` | Small, exact docs change | PM sweep or `/agent develop` | PR opens, CI passes, review passes, native auto-merge lands the PR and closes the issue |
| `pm-needs-info` | Broad request without acceptance criteria | PM sweep | PM comments with one question and applies `needs-info` |
| `pm-follow-up-after-needs-info` | Human clarifies a needs-info issue | PM sweep after human comment | PM may start `/agent develop`; it must not repeat stale needs-info before human input |
| `pm-human-required-risky-workflow` | Request to bypass workflow/review controls | PM sweep | PM escalates with `human-required` or an equivalent maintainer-facing comment |
| `pm-open-pr-review` | Issue already has an open canonical agent PR | PM sweep | PM does not start duplicate develop; it routes to review when appropriate |

## Operator Controls

| ID | Scenario | Trigger | Expected visible result |
| --- | --- | --- | --- |
| `operator-pause-resume` | Pause an issue, check status, try develop, resume | `/agent pause`, `/agent status`, `/agent develop`, `/agent resume` | Pause label gates develop before model minting; status shows pause state; resume clears the label |
| `operator-retry-no-failure` | Retry without failed infra run | `/agent retry` | Comment explains no failed infrastructure run was found |
| `repo-pause` | Pause the whole repo | `/agent pause repo` then PM/develop | PM/develop work is skipped until `/agent resume repo` |

## Review And The Merge Boundary

The merge boundary is GitHub-native: branch protection requires `ci` + `agent-review`, and native auto-merge
lands the PR once both are green. There is no separate merge-gate component, and no auto-retry loop — a failed
gate holds the PR, and the **PM decides from history** (re-dispatch-with-context or escalate).

| ID | Scenario | Trigger | Expected visible result |
| --- | --- | --- | --- |
| `review-low-risk-merge` | Low-risk docs PR | An independent reviewer blesses the PR | `agent-review`=success + `ci` green → native auto-merge lands the PR |
| `review-human-block` | Maintainer blocks PR | Maintainer block label before review | Reviewer posts `agent-review`=failure; the block label holds the merge |
| `retry-ci-failure` | Agent PR has a failed required `ci` check | A real CI failure on the PR head | The PR does not merge; the PM decides from history — re-dispatch-with-context or escalate (no auto-retry loop) |
| `retry-review-failure` | Agent PR has a failed `agent-review` | The reviewer rejects the change | The PR does not merge; the PM decides from history — re-dispatch-with-context or escalate |
| `head-changed-before-merge` | PR head changes after review | A new commit pushed to the reviewed branch | Required checks are per-SHA: the new head must re-earn `ci` + `agent-review`; a stale approval can't auto-merge |
| `workflow-edit-forbidden` | Develop run prompted toward a `.github/workflows/*` edit | Explicit maintainer-triggered develop fixture | The agent's token has no `workflows: write`, so no workflow change reaches a branch/PR; the agent escalates visibly |

## Evidence Rules

For every completed live scenario, record:

- issue URL
- PR URL, if any
- workflow run URL
- final state
- decision artifacts or agent session path
- gaps found

Use `docs/TEST_RUNS.md` as the ledger.
