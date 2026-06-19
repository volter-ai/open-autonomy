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

github and local are the **same recipe**; only `provision` differs. (`templates/` is gone: "adopt
into my repo" = `compile(default-profile, github)`, not a hand-maintained starter — which also
deletes the upgrade-tool drift bug by construction.)

## Status

- **Done & proven:** the `packages/` engine (core + both substrate adapters) — typechecks strict,
  conformance core 6/6, round-trips stable, OA workflows byte-identical, legacy sweep clean.
- **Coordinated follow-up** (touches other actors' actively-edited files): relocating the github
  runtime (`public-agent-*`, `model-proxy-*`, `codex-agent-run`) into `substrate-github/src/runtime/`
  and repointing the emitted workflow paths; removing `templates/`; extracting profile recipes into
  `profiles/`; and the deep ztrack-strip of `AUTONOMY-IR.md`'s body.
