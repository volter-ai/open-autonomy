# Repository Architecture

This repository is operated through Open Autonomy. Issues describe work, agent
runs prepare branches and pull requests, CI and review check the result, and the
merge gate only advances changes that satisfy the repo policy in
`.open-autonomy/autonomy.yml`.

## Repository Shape

```text
AGENTS.md
.codex/skills/
.github/workflows/
.open-autonomy/
  autonomy.yml
  roadmap.yml
  review-rubric.yml
  version.json
docs/
  CONSTITUTION.md
  PROJECT.md
  ROADMAP.md
  ARCHITECTURE.md
  standards/
scripts/
```

## Control Files

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Short repo guidance for coding agents. |
| `.open-autonomy/autonomy.yml` | The single Open Autonomy config: docs, skills, agents, triggers, capabilities, and enforced policy. |
| `.open-autonomy/roadmap.yml` | Planner-readable direction and active work areas. |
| `.open-autonomy/review-rubric.yml` | Reviewer criteria. |
| `.codex/skills/*/SKILL.md` | Repo-local instructions for each agent role. |
| `docs/CONSTITUTION.md` | Non-negotiable operating principles. |
| `docs/PROJECT.md` | Project scope and intent. |
| `docs/ROADMAP.md` | Human-readable roadmap. |
| `docs/standards/*` | Code, docs, security, and test standards. |

## Workflow

1. A maintainer or planner creates an issue.
2. PM triage decides whether to ask for more information, escalate, wait, or
   dispatch development.
3. The developer agent proposes a bounded patch through a publisher bundle.
4. The trusted publisher validates paths, secrets, and bundle shape before
   opening or updating a pull request.
5. CI and reviewer checks run on the pull request.
6. The merge gate merges, retries, waits, or escalates based on current CI,
   current review, current head SHA, labels, comments, and retry budgets.

## Evidence

The durable evidence lives in GitHub issues, pull requests, workflow artifacts,
and committed decision records under `agent-sessions/` when an autonomous run
publishes them. Long-form platform proof, release notes, and test matrices live
in the Open Autonomy implementation repository, not in target repositories.
