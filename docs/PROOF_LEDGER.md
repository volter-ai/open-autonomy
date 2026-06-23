# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live bench workload issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `retry-ci-failure` | `.codex/skills/pm/SKILL.md` (PM decides a failed PR from history — re-develop-with-context under `max_develop_attempts`, else escalate; no auto-loop), `docs/CAPABILITIES.md` (ci gates the merge) | done |
| `pm-open-pr-review` | `.codex/skills/pm/SKILL.md` (PM sweep + backpressure + launch routing) | done |
| `developer-context-review-fix` | `.codex/skills/developer/SKILL.md` (reads issue/CI/review context; escalates) | done |
| `head-changed-before-merge` | `docs/CAPABILITIES.md` (native auto-merge: required checks re-run on the current head) | done |
| `operator-pause-resume` | live `self-driving-conformance` run, issue [#5](https://github.com/volter-ai/open-autonomy-testbed/issues/5) (pause/status/develop-blocked/resume), Public Agent Session runs `27701483508` and `27704897971` | done |
| `five-issue-dogfood` | live `self-driving-conformance` run, issues #29-#33 → merged PRs #34-#38 with native auto-merge sessions `27701701974`, `27702036215`, and `27702212582` | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-check` | `open-autonomy compile profiles/self-driving github <target>`, fleet preflight runs `27649190745` and `27649190743` | done |
| `quality-review-repair` | `.codex/skills/pm/SKILL.md` (PM feeds the reviewer's findings to a re-dispatched developer, or escalates — PM-directed, not an auto-repair loop), `.codex/skills/reviewer/SKILL.md` | done |
| `governance-maintainer-hold` | `docs/CAPABILITIES.md`, `.codex/skills/reviewer/SKILL.md` (block labels + the merge boundary) | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
