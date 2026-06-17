# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live testbed issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-audit` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
| `retry-ci-failure` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-control.test.ts`, direct review workflow parity tests | done |
| `pm-open-pr-review` | `scripts/public-agent-dispatcher.ts`, PM dispatcher tests for open PR review routing | done |
| `developer-context-review-fix` | `scripts/public-agent-context.ts`, developer-context tests with prior decisions and PR diff | done |
| `head-changed-before-merge` | `scripts/public-agent-merge-gate.ts`, merge-gate changed-head tests | done |
| `operator-pause-resume` | live testbed runs recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
| `five-issue-dogfood` | live testbed PM/develop/review/merge and operator scenarios recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-check` | `scripts/scaffold-target-repo.ts`, fleet preflight runs `27649190745` and `27649190743` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
| `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
