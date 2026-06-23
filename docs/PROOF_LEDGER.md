# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live bench workload issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-audit` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
| `retry-ci-failure` | `.codex/skills/reviewer/SKILL.md`, `docs/CAPABILITIES.md` (CI gating + re-trigger in the credentialed skill model) | done |
| `pm-open-pr-review` | `.codex/skills/pm/SKILL.md` (PM sweep + backpressure + launch routing) | done |
| `developer-context-review-fix` | `.codex/skills/developer/SKILL.md` (reads issue/CI/review context; escalates) | done |
| `head-changed-before-merge` | `docs/CAPABILITIES.md` (native auto-merge: required checks re-run on the current head) | done |
| `operator-pause-resume` | live `self-driving-conformance` run, issue [#5](https://github.com/volter-ai/open-autonomy-testbed/issues/5) (pause/status/develop-blocked/resume), Public Agent Session runs `27701483508` and `27704897971` | done |
| `five-issue-dogfood` | live `self-driving-conformance` run, issues #29-#33 → merged PRs #34-#38 with merge-gate sessions `27701701974`, `27702036215`, and `27702212582` | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-check` | `open-autonomy compile profiles/self-driving github <target>`, fleet preflight runs `27649190745` and `27649190743` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
| `quality-review-repair` | `.codex/skills/reviewer/SKILL.md`, `.codex/skills/developer/SKILL.md` (review verdict → developer re-attempt) | done |
| `governance-maintainer-hold` | `docs/CAPABILITIES.md`, `.codex/skills/reviewer/SKILL.md` (block labels + the merge boundary) | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
