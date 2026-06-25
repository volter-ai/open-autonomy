# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live bench workload issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `retry-ci-failure` | `.codex/skills/pm/SKILL.md` (PM decides a failed PR from history — re-develop-with-context under `max_develop_attempts`, else escalate; no auto-loop), `docs/SPEC.md` (ci gates the merge) | done |
| `pm-open-pr-review` | `.codex/skills/pm/SKILL.md` (PM sweep + backpressure + launch routing) | done |
| `developer-context-review-fix` | `.codex/skills/developer/SKILL.md` (reads issue/CI/review context; escalates) | done |
| `head-changed-before-merge` | `docs/SPEC.md` (native auto-merge: required checks re-run on the current head) | done |
| `operator-pause-resume` | live `self-driving-conformance` run, issue [#5](https://github.com/volter-ai/open-autonomy-testbed/issues/5) (pause/status/develop-blocked/resume), Public Agent Session runs `27701483508` and `27704897971` | done |
| `five-issue-dogfood` | live `self-driving-conformance` run, issues #29-#33 → merged PRs #34-#38 with native auto-merge sessions `27701701974`, `27702036215`, and `27702212582`; canonical repo issue [#10](https://github.com/volter-ai/open-autonomy/issues/10) — first low-risk docs fix on canonical repo (fix incomplete sentence in `docs/OSS_AGENT_RUNBOOK.md`), all checks green (41 tests, 173 expectations, conformance pass, TypeScript clean) | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-check` | `open-autonomy compile profiles/self-driving github <target>`, fleet preflight runs `27649190745` and `27649190743` | done |
| `quality-review-repair` | `.codex/skills/pm/SKILL.md` (PM feeds the reviewer's findings to a re-dispatched developer, or escalates — PM-directed, not an auto-repair loop), `.codex/skills/reviewer/SKILL.md` | done |
| `governance-maintainer-hold` | `docs/SPEC.md`, `.codex/skills/reviewer/SKILL.md` (block labels + the merge boundary) | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/OPERATIONS.md`, manifest version tests, and the committed release checklist in `docs/OPERATIONS.md` | done |
| `human-approve-merges-live` | live on the canonical repo: bot-authored PR #106 (human-required scope — `services/agent-model-proxy/wrangler.toml`) reached `done` only after a maintainer **Approve**, detected autonomously by the gate (`scripts/human-approval-gate.ts`) via the `pull_request_review` payload + repo-permission check, flipping `human-approval` to success so native auto-merge landed it (merge commit b5de40f). Runs `28152511853` (developer authored the PR) and `28153509570` (gate posted human-approval=success). The actor model + maintainer `kind:human` declaration is `docs/SPEC.md` + `profiles/self-driving/ir.yml`. | done |
