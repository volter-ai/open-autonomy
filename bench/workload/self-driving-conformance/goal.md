# Self-driving conformance

This is a **smoke/coverage** workload, not an open-ended goal. Its intake is a battery of
`[oa-test:<id>]` scenario issues (seeded by `seed/scripts/testbed-seed-issues.ts`), each designed to
exercise one wired capability of the self-driving profile end-to-end on real GitHub:

- PM triage (clear docs → PR, needs-info, follow-up, human-required risky workflow, open-PR review)
- operator control (pause/resume, repo-pause, cancel, retry-no-failure)
- the workflow-edit capability boundary, retry on CI/review failure, head-changed-before-merge
- review low-risk merge, governance (maintainer hold, develop-only, risky approval)
- planner proof-gate issues

It is graded by the **coverage** grader (`scripts/bench-coverage.ts`): for each scenario, did the live
issue/PR/run state prove the capability fired correctly? "Done" = every scenario proven. This replaces
the former standalone testbed (`bootstrap-testbed` + `testbed-proctor-report`).
