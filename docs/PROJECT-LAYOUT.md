# Project layout & vocabulary

open-autonomy is **one substrate-agnostic autonomy system**. You author a **profile** (a recipe) and
**compile** it to a **substrate** (github, local, …) to get an **installation** you run. github is
not the product — it is one substrate among peers; local is another. Same profile, run on GitHub
*or* on a laptop.

## Vocabulary (canonical)

| term | definition |
|---|---|
| **IR** (`autonomy.ir.v1`) | the **standard** a profile is written in: `agents` + `policy` + `resources`. An **agent** = `behavior · capabilities · triggers(+params) · config`. There is no `workflow`/`launch`/`run`/`raw` — see `docs/AUTONOMY-IR.md`. |
| **agent** | the one unit: behavior (what it does) + capabilities (authority) + triggers (when + params) + config (opaque misc). |
| **behavior** | what an agent does — instructions/spec; the substrate runs it (deterministic, or model-interpreted — its choice). |
| **profile** | a substrate-agnostic **recipe**: a composition of agents + policy + resources. Lives in `profiles/`. |
| **substrate** | a **partial implementation** of the IR standard = a **trigger executor** + a **runner**, over a **box**. `github` and `local` are peers; each realizes the subset it supports. |
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

Per-substrate internal terms are **scoped to their substrate**, not global: github's `publisher
bundle` / `gates` / `model proxy`; local's `loop` / `termfleet` / `evidence gate`. `bundle` only
ever means the github publisher bundle. **There is no `templates/` and no "bundle" in the core.**

## Layout

```
open-autonomy/                  # the substrate-agnostic autonomy system (also dogfoods itself)
├── packages/
│   ├── core/                   # @open-autonomy/core — IR + Runner contract + conformance + materialize (no substrate deps)
│   ├── substrate-local/        # @open-autonomy/substrate-local — loop + TermfleetRunner + emit/ingest + runner backend
│   └── substrate-github/       # @open-autonomy/substrate-github — Actions emit + GithubRunner + control plane + ingest
│       └── src/runtime/        #   (coordinated follow-up) the github runtime: public-agent loop, gates, publisher bundle, proxy clients
├── bin/autonomy-conformance.ts # CLI wiring concrete runners across substrates
├── profiles/                   # example profiles (recipes): compile to ANY substrate
├── examples/                   # small hermetic cookbooks / upgrade fixtures: small-app, library, docs-only
├── bench/                      # the one live-eval harness (workloads + graders); proves behavior live
├── services/agent-model-proxy/ # a github-substrate service
├── docs/                       # AUTONOMY-IR.md (spec) + this file
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

## Status

- **Done & proven:** the `packages/` engine (core + both substrate adapters) — typechecks strict,
  conformance core 6/6, round-trips stable, OA workflows byte-identical, legacy sweep clean.
- **Done & proven:** the github runtime (`public-agent-*`, `model-proxy-*`, `claude-agent-run`, …) now
  lives in `substrate-github/src/runtime/` and is **injected** by `compileGithub` (the substrate owns
  its runtime, as `substrate-local` owns its runner; the vendored mirror is tied to `scripts/` by
  `check:runtime-sync`). `profiles/self-driving` is OA's setup as a profile.
- **Done:** `templates/` is **deleted**. The installation is now produced solely by
  `compile(profiles/self-driving, github)`. Its consumers were migrated: adopting into a repo is now
  `open-autonomy compile profiles/self-driving github <target>`; the upgrade is a maintainer-run local command
  (`scripts/open-autonomy-upgrade-cli.ts`, vendored into every installation) that clones open-autonomy,
  compiles the profile to get the canonical installation, and applies the diff to the working tree —
  the maintainer reviews, commits, and pushes (so workflow changes, a human_required path the CI token
  cannot push, go in with their own credentials). `check:compile` guards that the profile compiles to a
  complete installation.
- **Done:** OA's own root installation is now sourced from the profile too — `check:dogfood` asserts
  `compile(profiles/self-driving, github)` == OA's root for every **managed** file (workflows,
  skills, runtime, standards, rubrics, version); repo-owned + seed-only files (package.json, README,
  roadmap, autonomy.yml, CONSTITUTION, dev docs) legitimately differ and are excluded. This caught a
  fork-escalation security fix that was live in OA's workflow but missing from the profile.
- **Done:** `substrate-local` is now a *generic* local substrate (no `ztrack.profile.v1`, no
  `ztrack-*` skill names, no `wip` work-states) — ztrack is a profile's tooling, carried opaquely, never
  the substrate. `AUTONOMY-IR.md` was genericized to match (substrate = local/github; tooling = a
  profile's choice). Any profile compiles to any substrate.
- **Done:** the scenario testbed is now a **bench workload**, profile-derived too — `bun bin/bench.ts
  --live --workload self-driving-conformance --profile self-driving` compiles `profiles/self-driving` and
  overlays only the workload's `seed/` (constitution, roadmap, scenarios, `provision.json`, the issue
  seeder, under `bench/workload/self-driving-conformance/seed/`). The seed was stripped from a 64-file
  vendored installation (with badly-drifted runtime) down to just that seed, so it can't drift. The
  self-start variant is `self-driving-greenfield`. Bench is the one live-eval harness; `examples/` stays as
  the separate hermetic CI-fixture rung.
- **Remaining:** the small `examples/{small-app,library,docs-only}` are still vendored upgrade
  fixtures (deliberately older, to exercise the upgrade tool).
