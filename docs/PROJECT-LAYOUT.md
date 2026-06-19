# Project layout & vocabulary

open-autonomy is **one substrate-agnostic autonomy system**. You author a **profile** (a recipe) and
**compile** it to a **substrate** (github, local, …) to get an **installation** you run. github is
not the product — it is one substrate among peers; local is another. Same profile, run on GitHub
*or* on a laptop.

## Vocabulary (canonical)

| term | definition |
|---|---|
| **IR** (`autonomy.ir.v1`) | the substrate-agnostic representation a profile is written in (agents · workflows · resources · policy). |
| **agents** / **skill** | the atomic agent content — a `skill` is one agent's instructions + the standards/scripts it uses. No collective noun. |
| **profile** | a substrate-agnostic **recipe**: a composition of agents + workflows + policy + resources. Lives in `profiles/`. |
| **substrate** | an execution platform = a **trigger executor** + a **runner**, over a **box**. `github` and `local` are peers. |
| **trigger executor** | fires a workflow when its triggers say so (cron core, events expanded); decides *when*. |
| **runner** | runs agents + manages their lifecycle (`launch`/`list`/`cancel`…); does the *running*. |
| **box** | the env an agent runs in (POSIX fs + shell + git + a model endpoint + the installed files); the runner provisions it. |
| **installation** | `compile(profile, substrate)` → the configs + installed skills + resources + generated files laid into a repo. Substrate-specific. |
| **tooling** | external tools an agent calls + the gate behind a `run:` (`gh`/`npm`, or `ztrack`) — a swappable adapter axis, not the IR. |

The whole grammar:

```
compile(profile, substrate) → installation        ;  installation runs on its substrate
a profile's agents call tooling
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
├── examples/                   # generated installations into demo targets (cookbooks)
├── services/agent-model-proxy/ # a github-substrate service
├── docs/                       # AUTONOMY-IR.md (spec) + this file
└── .open-autonomy/ .github/    # open-autonomy's own installation (dogfood)
```

Dependency direction: `substrate-local` and `substrate-github` each depend on `core`; **core depends
on nothing** and never imports a substrate.

## Making a testbed

A testbed is a disposable target you stand up to prove behavior live — the standard lifecycle plus
two substrate-scoped steps:

```
compile(profile, substrate) → installation → provision → seed → run → proctor
```

- **provision** — substrate prereqs not in the installation (github: repo + secrets/vars/labels/branch-protection from `provision.json`; local: a dir + `git init` + termfleet + codex trust).
- **seed** — put work in (github: scenario issues; local: a seeded backlog).
- **run** — github: Actions fires it; local: start the loop. **proctor** — score coverage.

github and local are the **same recipe**; only `provision` differs. "Adopt into my repo" =
`compile(self-driving, github)`, not a hand-maintained starter.

## Status

- **Done & proven:** the `packages/` engine (core + both substrate adapters) — typechecks strict,
  conformance core 6/6, round-trips stable, OA workflows byte-identical, legacy sweep clean.
- **Done & proven:** the github runtime (`public-agent-*`, `model-proxy-*`, `codex-agent-run`, …) now
  lives in `substrate-github/src/runtime/` and is **injected** by `compileGithub` (the substrate owns
  its runtime, as `substrate-local` owns its runner; the vendored mirror is tied to `scripts/` by
  `check:runtime-sync`). `profiles/self-driving` is OA's setup as a profile.
- **Done:** `templates/` is **deleted**. The installation is now produced solely by
  `compile(profiles/self-driving, github)`. Its consumers were migrated: `scaffold-target-repo`
  compiles the profile; the upgrade workflow (`open-autonomy-upgrade.yml`) clones open-autonomy and
  compiles the profile to get the canonical installation to diff against (verified behavior-preserving:
  identical upgrade plan except the upgrade workflow itself). `check:compile` guards that the profile
  compiles to a complete installation.
- **Done:** OA's own root installation is now sourced from the profile too — `check:dogfood` asserts
  `compile(profiles/self-driving, github)` == OA's root for every **managed** file (workflows,
  skills, runtime, standards, rubrics, version); repo-owned + seed-only files (package.json, README,
  roadmap, autonomy.yml, CONSTITUTION, dev docs) legitimately differ and are excluded. This caught a
  fork-escalation security fix that was live in OA's workflow but missing from the profile.
- **Done:** `substrate-local` is now a *generic* local substrate (no `ztrack.profile.v1`, no
  `ztrack-*` skill names, no `wip` work-states) — ztrack is a profile's tooling, carried opaquely, never
  the substrate. `AUTONOMY-IR.md` was genericized to match (substrate = local/github; tooling = a
  profile's choice). Any profile compiles to any substrate.
- **Done:** the scenario testbed is profile-derived too — `bootstrap-testbed` scaffolds the
  installation by compiling `profiles/self-driving` and overlays only a 12-file seed (constitution,
  roadmap, scenarios, `provision.json`, the issue seeder). `examples/testbed` was stripped from a
  64-file vendored installation (with badly-drifted runtime) down to that seed, so it can't drift.
- **Remaining:** the small `examples/{small-app,library,docs-only}` are still vendored upgrade
  fixtures (deliberately older, to exercise the upgrade tool).
