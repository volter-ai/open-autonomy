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
  **generated** per-agent workflows + the injected runtime scripts (what the engine
  *derives* from the IR), the **code-host CI workflows carried as resources** (`ci`,
  `security`, `deploy`, … — copied verbatim, like the standards docs; not generated),
  the repo-local skills, and `.open-autonomy/*` control files. (Generated vs resource:
  the agent **runner** workflows are derived per-agent; the code-**host** CI/security/
  deploy workflows are resources, constant across runners — see
  `docs/CODE_HOST_RESOURCES.md`.)
- Meta side: this repository is also a target, so the source implementation is
  maintained by the same loop it ships.

Generated target files are not inert examples. They are the runnable autonomy
surface for that target repository. The target still owns its own project
direction, constitution, roadmap, standards, labels, secrets, and risk policy.

## Agent Roles

| Role | Purpose | Main inputs | Main output |
| --- | --- | --- | --- |
| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, labels | created/updated/prioritized issues |
| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, autonomy config | visible comment, labels, dispatch decision |
| Developer | Edits code and opens its own auto-merging PR | issue, acceptance criteria, repo guidance, control files | a pull request (its own scoped token) |
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

## Vocabulary (canonical)

open-autonomy is **one substrate-agnostic autonomy system**. You author a **profile** (a recipe) and
**compile** it to a **substrate** (`gh-actions`, `local`, …) to get an **installation** you run. A
substrate is the **agent runner** — *where the agents execute* — and is **not** the code host: `gh-actions`
(GitHub Actions) is one runner among peers; `local` (termfleet) is another. The runner is **orthogonal to the
code host**: a `local`-runner org can still use a github repo (PRs, CI, deploy) — see `docs/CODE_HOST_RESOURCES.md`.
(`github` is accepted as a back-compat alias for `gh-actions`, but it conflated runner with code host — don't use it.)

| term | definition |
|---|---|
| **IR** (`autonomy.ir.v1`) | the **standard** a profile is written in: `agents` + `policy` + `resources`. An **agent** = `behavior · capabilities · triggers(+params) · config`. There is no `workflow`/`launch`/`run`/`raw` — see `docs/SPEC.md#the-ir`. |
| **agent** | the one unit: behavior (what it does) + capabilities (authority) + triggers (when + params) + config (opaque misc). |
| **behavior** | what an agent does — instructions/spec; the substrate runs it (deterministic, or model-interpreted — its choice). |
| **profile** | a substrate-agnostic **recipe**: a composition of agents + policy + resources. Lives in `profiles/`. |
| **substrate** | a **partial implementation** of the IR standard = a **trigger executor** + a **runner**, over a **box** — i.e. *where/how agents run*, NOT the code host. `gh-actions` (GitHub Actions) and `local` (termfleet) are peers; each realizes the subset it supports. |
| **trigger executor** | fires an agent when its triggers say so + forwards the declared params (cron core, events expanded); decides *when*. |
| **runner** | runs agents + manages their lifecycle (`launch`/`list`/`cancel`…); does the *running*. |
| **box** | the env an agent runs in (POSIX fs + shell + git + a model endpoint + the installed files); the runner provisions it. The model endpoint is always present. |
| **installation** | `compile(profile, substrate)` → the configs + installed skills + resources + generated files laid into a repo. Substrate-specific. |
| **conformance** | the support matrix: which standard features (capabilities / param sources / config keys / Runner ops) each substrate implements. Partial support is first-class. |
| **tooling** | external tools an agent calls (`gh`/`npm`, or `ztrack`) — what the agent uses inside its box, never named by the IR. |

The whole grammar:

```
IR (the standard)  →  compile(profile, substrate)  →  installation        ;  runs on its substrate
a substrate is a partial implementation of the standard ; conformance reports what it supports
an agent's behavior calls tooling inside its box
```

Per-substrate internal terms are **scoped to their substrate**, not global: github's `control plane`
/ `model proxy` / native `auto-merge`; local's `loop` / `termfleet` / `evidence gate`. **There is no
`templates/` in the core.**

## Source repo layout

```
open-autonomy/                  # the substrate-agnostic autonomy system (also dogfoods itself)
├── packages/
│   ├── core/                   # @open-autonomy/core — IR + Runner contract + conformance + materialize (no substrate deps)
│   ├── substrate-local/        # @open-autonomy/substrate-local — loop + TermfleetRunner + emit/ingest + runner backend
│   └── substrate-github/       # @open-autonomy/substrate-github — Actions emit + GithubRunner + control plane + ingest
│       └── src/runtime/        #   the github runtime (vendored mirror of scripts/): public-agent loop, control plane, credentialed agent runner, proxy clients
├── bin/                        # CLIs: autonomy-compile, autonomy-conformance, sync-runtime, bench, check-dogfood
├── profiles/                   # profiles (recipes): self-driving (the dogfood org) + examples; compile to ANY substrate
├── bench/                      # the one live-eval harness (workloads + graders); proves behavior live
├── services/agent-model-proxy/ # the github-substrate model proxy + funding storefront (repo-owned)
├── docs/                       # SPEC.md (the standard) + this map + VISION/CONSTITUTION/ROADMAP/OPERATIONS/standards
└── .open-autonomy/ .github/    # open-autonomy's own installation (dogfood)
```

Dependency direction: `substrate-local` and `substrate-github` each depend on `core`; **core depends
on nothing** and never imports a substrate.

## Proving behavior live (bench)

To prove behavior live you run a **bench workload** — `bench/` is the one live-eval harness. A workload
provisions a disposable target and drives the standard lifecycle plus two substrate-scoped steps:

```
compile(profile, substrate) → installation → provision → seed → run → grade
```

- **provision** — substrate prereqs not in the installation (github: repo + secrets/vars/labels/branch-protection from `provision.json`; local: a dir + `git init` + termfleet + codex trust).
- **seed** — put work in (github: scenario issues; local: a seeded backlog), per the workload's `intake.mode`.
- **run** — github: Actions fires it; local: start the loop. **grade** — score against the workload's graders (coverage / rubric / autonomy).

The conformance workload stands a target up, seeds it, runs it, and coverage-grades it in one command:

```
bun bin/bench.ts --live --workload self-driving-conformance --profile self-driving   # provision → seed → run
bun bin/bench.ts --score --repo <owner/name> --workload self-driving-conformance      # coverage grader
```

`self-driving-greenfield` is the self-start variant (empty seed, the org bootstraps its own backlog).
github and local are the **same recipe**; only `provision` differs. "Adopt into my repo" =
`open-autonomy compile profiles/self-driving github <target>`, not a hand-maintained starter.

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
direction; issues should execute work; runbooks should explain operation; and
the audit trail (issue/PR comments, the `ci`+`agent-review` commit statuses, the
merged PR, the model-proxy run-ledger, run logs, and bench evidence) should prove
what happened.

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
.github/
  workflows/
    developer.yml … strategy_reviewer.yml      # GENERATED per agent (runner substrate)
    ci.yml  human-approval.yml  security.yml    # code-host RESOURCES (carried, like docs/standards)
    codeql.yml  deploy.yml  open-autonomy-preflight.yml
  zizmor.yml                                    # GENERATED (derived: the agent-workflow baseline)
  dependabot.yml                                # code-host RESOURCE
  agent-control.mjs                             # GENERATED (operator control plane)
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
- `.github/`: the per-agent workflows, `zizmor.yml`, and `agent-control.mjs` are **generated** by the runner
  substrate (derived from the IR); the `ci`/`human-approval`/`security`/`codeql`/`deploy`/`preflight`
  workflows and `dependabot.yml` are **code-host resources** carried by the profile (constant across runners
  — see `docs/CODE_HOST_RESOURCES.md`).

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
