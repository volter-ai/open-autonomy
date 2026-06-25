# Code-host resources — what the engine emits vs what the profile carries

> Reached through the deploy-design discussion (2026-06-25). The chain: deploy is the same on every
> substrate → it's not substrate (substrate = runners) → it's a resource → a github CI script installed
> as a resource → **and resources are part of the IR, like the standards docs.**

## The principle

`compileGithub` was doing two jobs. Separate them by what *generates* the file:

- **Emit** — only what the engine **derives from the IR**:
  - the agent-runner workflows (`developer.yml`, … — derived from `ir.agents`; vanish on the local substrate)
  - security **DATA** materializations: `.github/zizmor.yml` (the guarded agent-workflow names) and
    `.open-autonomy/human-required-paths.json` (`policy.box.risk.human_required_paths`). Not authored logic —
    the IR projected into a runtime-readable form.
- **Resource** — every github **CI *workflow***, carried verbatim by the profile, **exactly like
  `docs/standards/*.md`**: `ci`, `human-approval`, `security`, `dependabot`, `codeql`, `deploy`, `preflight`.
  Resources are an essential part of the IR; a github-CI workflow is one.

The earlier mistake (twice): treating "shared" as "engine-owned." Shared resources are still **resources**
(IR layer). Sharing across profiles is a future concern (a base/standard resource set) — with only a
handful of profiles, each carries its own copy, the same way each carries its own standards docs today.

## What's a code-host resource, and why it's not substrate

The agent **runner** (github events | local termfleet) is where the fleet executes. The code **host**
(github) is where the repo lives and CI/deploy run. They're orthogonal: a local-substrate org still has a
github repo with `ci`/`security`/`deploy`. So these workflows are **constant across runners** — code-host
resources, carried by the profile, independent of which substrate runs the agents.

Deploy is one of them. The only IR-level fact about deploy beyond the resource itself is the **boundary
invariant: no agent deploys** (the sibling of "no agent merges"), realized by the admin-only tag + the
required-reviewer environment.

## Where each file lives (current, after the split)

**Emitted (derived from the IR):**
- `developer/pm/planner/reviewer/strategist/strategy_reviewer.yml`, `.github/agent-control.mjs`
- agent-runtime scripts: `claude-agent-run.ts`, `model-proxy-*`, `runner.ts`, `transcript.ts`, …
- `.github/zizmor.yml`, `.open-autonomy/human-required-paths.json` (derived data)

**Profile resources (carried, IR layer):**
- `ci.yml`, `human-approval.yml`, `security.yml`, `dependabot.yml`, `codeql.yml`, `deploy.yml`,
  `open-autonomy-preflight.yml` — the github CI scaffolding, per github-targeting profile

**Done in this pass:** `security.yml` + `dependabot.yml` moved from engine emission → resources across the
three github profiles (`self-driving`, `hello`, `simple-gh-sdlc`); `zizmor.yml` + `human-required-paths.json`
stay as derived data; the engine now emits only agent workflows + that derived data. Deploy was already a
resource, so the original question ("first-class IR vs profile?") is answered: **it's a resource.**

## Open / deferred

- The gate **scripts** `human-approval-gate.ts` and `check-supply-chain.ts` are still injected as *runtime*
  (agent-substrate). They're code-host logic, not agent execution — arguably resources too. Left as runtime
  for now (they work; the WORKFLOWS were the live issue). Revisit if it causes friction.
- A **base/standard resource set** so github profiles don't each copy `security.yml`/`dependabot.yml`.
  Deferred — not worth it at the current profile count.
- The deploy **provisioning** (environment + ruleset) is still imperative `gh api`. Making it a reproducible
  setup step is the remaining deploy work (separate from this layering fix).
