# open-autonomy Architecture

`open-autonomy` makes a GitHub repository operate through visible issues,
bounded agent runs, deterministic write gates, reviewer checks, and maintainer
controls. The repository remains the source of truth: issues define executable
work, PRs carry proposed changes, committed/session evidence explains what
happened, and committed autonomy config plus workflow gates decide what
automation may do.

## System Shape

```text
roadmap + repo standards + issues
  -> planner/PM triage
  -> visible /agent command
  -> developer: a credentialed skill-agent job (token scoped to its capabilities)
  -> the agent edits code + opens its own PR with auto-merge queued
  -> CI + an independent reviewer post `ci` + `agent-review`
  -> native auto-merge (no agent can merge)
  -> merge, retry, wait, or human-required escalation
```

The model can propose work. Deterministic code decides whether that work can be
published, retried, merged, or escalated.

## Repositories

- `open-autonomy`: canonical OSS implementation and first dogfooding target.
- `profiles/self-driving`: the self-driving recipe; `compile(…, github)` is the starter installation.
- `bench/`: the live-eval harness. Live autonomy behavior is proven by the `self-driving-conformance` workload (graded by the coverage grader) and self-start by `self-driving-greenfield`.

Future target repositories should install by compiling the profile, then keep
repo-specific direction, policy, and standards in their own committed files.

## Template Versus Runtime

Open Autonomy has a source side and a target side.

- Source side: this repository contains the reusable implementation, examples,
  model proxy, the `bench/` live-eval harness, and the `profiles/` recipes (compiled into installations).
- Target side: a repository that has installed Open Autonomy contains the
  generated workflows, scripts, repo-local skills, and `.open-autonomy/*`
  control files.
- Meta side: this repository is also a target, so the source implementation is
  maintained by the same loop it ships.

Generated target files are not inert examples. They are the runnable autonomy
surface for that target repository. The target still owns its own project
direction, constitution, roadmap, standards, labels, secrets, and risk policy.

## Agent Roles

| Role | Purpose | Main inputs | Main output |
| --- | --- | --- | --- |
| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |
| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, autonomy config | visible comment, labels, dispatch decision |
| Developer | Edits code and opens its own auto-merging PR | issue, acceptance criteria, repo guidance, prior decisions | a pull request (its own scoped token) |
| Reviewer | Judges PR quality and risk; posts the `agent-review` status | PR diff, CI, issue, rubric, standards | the `agent-review` commit status (cannot merge) |
| Merge | Native auto-merge once `ci` + `agent-review` are green | the two required status checks + branch protection | merged PR (no agent performs the merge) |
| Operator | Lets maintainers control the system | issue comments, labels, run/proxy state | pause/resume/status/cancel/retry effects |

Planner is directional. PM is operational. Every agent uses model judgment (each is a skill). The
enforcement is structural: the capability/permission split + branch protection + native auto-merge.

## Entry Points

There are two normal ways work starts:

- Maintainer-directed: a maintainer comments `/agent <agent>` to launch one by name
  (`/agent developer`, `/agent reviewer`) or `/agent pause`, `/agent status`, etc. Only a
  maintainer (OWNER/MEMBER/COLLABORATOR) can drive these; other commenters are ignored.
- PM-directed: the scheduled or manual PM workflow sweeps eligible issues,
  writes a visible status or command comment, and dispatches the matching
  workflow only when the issue is clear enough.

If PM asks for `needs-info`, that is not a failed dispatch. It is the expected
outcome for broad, risky, or underspecified work. The next useful step is a
human clarification, after which PM can reconsider the issue.

## Trust Boundaries

- The agent runs as a credentialed job whose token is scoped to its capabilities (least privilege).
- Raw provider API keys are never passed to the agent job.
- The agent receives a bounded model token through the model proxy (the budget guard).
- The agent acts directly with a token scoped to its capabilities; it opens its own PR.
- No agent can merge: `code:review` (statuses:write) blesses, `code:propose` (contents:write)
  proposes, never both — so no agent lands unreviewed code.
- GitHub native auto-merge lands a PR only once `ci` + `agent-review` are both green.

This split is the core safety model. Prose instructions guide agents; the
policy section of `autonomy.yml` and workflow code enforce limits.

## Documentation Map

| Document | Scope | Used by |
| --- | --- | --- |
| `README.md` | Product overview and quickstart | humans |
| `docs/ARCHITECTURE.md` | Master map of the system | humans, agents needing orientation |
| `docs/SPEC.md` | The standard (`autonomy.ir.v1`): actor model + the four catalogs + Runner + handoffs | humans, agents, substrate authors |
| `docs/OSS_AGENT_RUNBOOK.md` | Local checks, live smoke tests, operator commands | maintainers/operators |
| `docs/OPERATIONS.md` | Operating OA: local quickstart, GitHub production rollout, release process | maintainers/operators |
| `docs/ROADMAP.md` | Continuous roadmap, proof gates, and expanded product direction | planner/maintainers |
| `bench/README.md` | Live-eval harness: workloads, graders, running a cell | bench operators |
| `bench/workload/self-driving-conformance/` | Live conformance scenario catalog (coverage-graded) | bench operators, roadmap audit |

`docs/ROADMAP.md` is the only canonical roadmap. The roadmap should explain
direction; issues should execute work; runbooks should explain operation;
decision records should prove what happened.

## Target Repo Control Files

The clean target shape is:

```text
AGENTS.md
.codex/
  skills/
    developer/SKILL.md
    pm/SKILL.md
    reviewer/SKILL.md
    planner/SKILL.md
    strategist/SKILL.md
    strategy-reviewer/SKILL.md
.open-autonomy/
  autonomy.yml
  roadmap.yml
  review-rubric.yml
docs/
  CONSTITUTION.md
  PROJECT.md
  ROADMAP.md
  ARCHITECTURE.md
  standards/
    code.md
    docs.md
    tests.md
    security.md
```

- `AGENTS.md`: short always-loaded guidance shared across coding agents.
- `.codex/skills/*/SKILL.md`: repo-local Codex skills for each agent role.
- `autonomy.yml`: Open Autonomy index of docs, skills, agents, triggers, and
  capabilities, plus machine-readable path, retry, budget, autonomy, and merge
  policy.
- `docs/CONSTITUTION.md`: non-negotiable principles and product standards.
- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof
  gates.
- `review-rubric.yml`: structured reviewer criteria.
- `docs/standards/*`: scoped implementation guidance.

## Evidence And State

Each autonomous path should leave visible evidence:

- issue comments and labels for user-visible state
- workflow run logs and artifacts for raw run output
- the `ci` and `agent-review` commit statuses on each PR (the merge boundary)
- the model-proxy run-ledger (one bounded record per agent run)
- PR comments/body for reviewable human context

The durable end state should be a queryable decision index built from the run-ledger
(roadmap: durable-decision-memory). Until then, the run logs, commit statuses,
issue/PR comments, and bench run evidence are the audit trail.

## Operating Rules

- Work starts from issues, PR comments, or explicit maintainer commands.
- PM and planner actions must be visible; silent skips are only acceptable when
  a current visible status already exists.
- Risky, unclear, blocked, or repeatedly failing work escalates to humans.
- The capability/permission split handles write safety; reviewer handles product/code quality;
  native auto-merge (branch protection: `ci` + `agent-review`) handles final merge safety.
- Live proof from a bench workload (e.g. `self-driving-conformance`) is required before claiming roadmap completion.
