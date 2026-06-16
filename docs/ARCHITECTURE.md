# open-autonomy Architecture

`open-autonomy` makes a GitHub repository operate through visible issues,
bounded agent runs, deterministic write gates, reviewer checks, and maintainer
controls. The repository remains the source of truth: issues define executable
work, PRs carry proposed changes, committed/session evidence explains what
happened, and policy gates decide what automation may do.

## System Shape

```text
roadmap + repo standards + issues
  -> planner/PM triage
  -> visible /agent command
  -> trusted setup + target/policy/triage checks
  -> untrusted developer agent in GitHub Actions
  -> trusted publisher validates bundle and opens/updates PR
  -> CI + reviewer
  -> deterministic merge gate
  -> merge, retry, wait, or human-required escalation
```

The model can propose work. Deterministic code decides whether that work can be
published, retried, merged, or escalated.

## Repositories

- `open-autonomy`: canonical OSS implementation and first dogfooding target.
- `templates/self-driving-repo`: copyable starter for another self-driving repo.
- `examples/docs-only`: minimal cookbook repo.
- `examples/testbed`: disposable cookbook/test fixture.
- `open-autonomy-testbed`: live external repo used to prove behavior on GitHub.

Future target repositories should install the workflows/scripts/template, then
keep repo-specific direction and policy in their own committed files.

## Agent Roles

| Role | Purpose | Main inputs | Main output |
| --- | --- | --- | --- |
| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |
| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, policy | visible comment, labels, dispatch decision |
| Developer | Produces a bounded patch proposal | issue, acceptance criteria, repo guidance, prior decisions | publisher bundle |
| Publisher | Applies only policy-valid bundles | bundle, manifest, patch, policy | PR or rejected publish decision |
| Reviewer | Judges PR quality and risk | PR diff, CI, issue, rubric, standards, policy | structured review decision |
| Merge Gate | Makes final deterministic merge decision | publisher, CI, review, PR head SHA, blockers, retry budget | merge/retry/wait/human-required |
| Operator | Lets maintainers control the system | issue comments, labels, run/proxy state | pause/resume/status/cancel/retry effects |

Planner is directional. PM is operational. Developer and reviewer use model
judgment. Publisher and merge gate are deterministic enforcement points.

## Trust Boundaries

- The developer agent runs as an untrusted job with read-only repository access.
- Raw provider API keys are never passed to the agent job.
- The agent receives a bounded model token through the model proxy.
- The agent emits a bundle; it does not push to the repository.
- The trusted publisher validates the bundle before writing a branch or PR.
- The merge gate only merges when current CI, current review, current PR head,
  policy, and maintainer blockers all agree.

This split is the core safety model. Prose instructions guide agents; policy and
workflow code enforce limits.

## Documentation Map

| Document | Scope | Used by |
| --- | --- | --- |
| `README.md` | Product overview and quickstart | humans |
| `docs/ARCHITECTURE.md` | Master map of the system | humans, agents needing orientation |
| `docs/PUBLIC_AGENT_ACTIONS.md` | Detailed workflow/trust model and command architecture | maintainers, implementers |
| `docs/OSS_AGENT_RUNBOOK.md` | Local checks, live smoke tests, operator commands | maintainers/operators |
| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
| `docs/SELF_BUILDING_OSS_ROADMAP.md` | Long-form roadmap and proof gates | planner/maintainers |
| `docs/NEXT_PUBLIC_AGENT_ROADMAP.md` | Short near-term roadmap | maintainers |
| `examples/testbed/docs/TEST_MATRIX.md` | Live scenario catalog | testbed operators |
| `examples/testbed/docs/TEST_RUNS.md` | Live proof ledger | testbed operators, roadmap audit |

The roadmap should explain direction; issues should execute work; runbooks
should explain operation; decision records should prove what happened.

## Target Repo Control Files

The clean target shape is:

```text
AGENTS.md
.open-autonomy/
  constitution.md
  policy.yml
  roadmap.yml
  review-rubric.yml
  standards/
    code.md
    docs.md
    tests.md
    security.md
docs/
  ROADMAP.md
  COMMANDS.md
  OPERATIONS.md
  SECURITY.md
  TEST_MATRIX.md
  TEST_RUNS.md
```

- `AGENTS.md`: short always-loaded guidance shared across coding agents.
- `constitution.md`: non-negotiable principles and product standards.
- `policy.yml`: machine-readable hard limits for paths, budgets, retries, and
  autonomy levels.
- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof
  gates.
- `review-rubric.yml`: structured reviewer criteria.
- `standards/*`: scoped implementation guidance.

The current repo is still converging toward this shape. Until those structured
files exist, the roadmap, runbook, and action docs remain the canonical source.

## Evidence And State

Each autonomous path should leave visible evidence:

- issue comments and labels for user-visible state
- workflow artifacts for raw run output
- `agent-sessions/run_*/` for promoted session evidence
- `decisions/*` records for target, triage, develop, publish, CI, review, retry,
  merge-gate, and close decisions
- PR comments/body for reviewable human context

The durable end state should be a queryable decision index. Until then, the
session folders, decision records, issue/PR comments, and testbed ledger are the
audit trail.

## Operating Rules

- Work starts from issues, PR comments, or explicit maintainer commands.
- PM and planner actions must be visible; silent skips are only acceptable when
  a current visible status already exists.
- Risky, unclear, blocked, or repeatedly failing work escalates to humans.
- Publisher policy handles write safety; reviewer handles product/code quality;
  merge gate handles final merge safety.
- Live proof in the testbed is required before claiming roadmap completion.

