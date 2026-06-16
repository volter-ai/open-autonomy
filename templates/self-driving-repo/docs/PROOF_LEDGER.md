# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to local,
verifiable evidence. Evidence may be deterministic tests, committed scripts,
workflow wiring, or local release artifacts.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
| `retry-ci-failure` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-control.test.ts` | done |
| `pm-open-pr-review` | `scripts/public-agent-dispatcher.ts`, `scripts/public-agent-control.test.ts` | done |
| `developer-context-review-fix` | `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `head-changed-before-merge` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-control.test.ts` | done |
| `operator-pause-resume` | `scripts/public-agent-control.test.ts`, `docs/PUBLIC_AGENT_ACTIONS.md` | done |
| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
| `planner-creates-proof-gate-issues` | `scripts/public-agent-planner.ts`, `scripts/public-agent-planner.test.ts` | done |
| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
| `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `docs/RELEASE.md` | done |
