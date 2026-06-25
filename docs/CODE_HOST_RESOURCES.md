# Code-host resources — separating the runner from the CI host (design)

> Status: proposal. Reached through the deploy-design discussion (2026-06-25). The trigger was: "deploy is
> the same on every substrate → it's not substrate (substrate = runners) → it's a resource script → it's a
> github CI script → just install the github workflow as a resource."

## The conflation

`compileGithub` is two compilers wearing one coat:

1. **github as agent *runner*** — emits the per-agent workflows (`developer.yml`, …) + the agent-execution
   runtime (`claude-agent-run.ts`, `model-proxy-*`). These are **derived from `ir.agents`** and exist *only
   when the fleet runs on github*. Swap to the local substrate and they vanish (termfleet runs the agents).
   This is the **substrate**. It varies.
2. **github as code *host* + CI** — `ci`, `security`, the gates, `deploy`. These are **static github CI
   scripts** that exist whenever the **repo lives on github**, independent of where agents run. A
   local-substrate org still has them. They are **constant**.

Today #2 is split awkwardly: some are hand-written **profile resources** (`ci`/`human-approval`/`codeql`/
`deploy`/`preflight`), some are **emitted** by the runner compiler (`security.yml`), and their logic scripts
(`human-approval-gate.ts`, `check-supply-chain.ts`) are injected as **agent-runtime** even though they have
nothing to do with running agents. For the dogfood it works only because runner and code-host are the same
github. A **local-substrate org with a github repo breaks it**: who emits its `ci`/`deploy`? Not its (local)
runner.

## The four categories of install content

| Category | What | Source | Varies by runner? |
|---|---|---|---|
| **Agent-runner** | per-agent workflows, `agent-control.mjs`, agent-execution runtime | emitted/injected by the substrate from `ir.agents` | **yes** |
| **Standard code-host resources** (NEW) | the github CI workflows + their gate scripts | shared, installed into every github-hosted install | no |
| **Profile config** | the org-specific bits the resources read | profile (`policy.box.*`, vars) | no |
| **Derived data** | values materialized from the IR | emitted (already) | — |

Deploy is a **standard code-host resource** (the workflow) + **profile config** (the target). The only
IR-level fact is the **boundary invariant: no agent deploys** — the deploy sibling of "no agent merges."

## File-by-file mapping

**Stay EMITTED (agent-runner — derived from `ir.agents`):**
- `developer/pm/planner/reviewer/strategist/strategy_reviewer.yml`
- `.github/agent-control.mjs`
- agent-execution runtime: `claude-agent-run.ts`, `agent.ts`, `transcript.ts`, `agent-visual-verify.ts`,
  `model-proxy-mint/exchange/revoke.ts`, `runner.ts`
- Derived data: `.open-autonomy/human-required-paths.json`, `.github/zizmor.yml` (baseline from agent names)

**Become STANDARD CODE-HOST RESOURCES (shared, installed regardless of runner):**
- workflows: `ci.yml`, `security.yml`, `human-approval.yml`, `codeql.yml`*, `open-autonomy-preflight.yml`,
  `dependabot.yml`
- gate scripts (recategorized from agent-runtime): `human-approval-gate.ts`, `check-supply-chain.ts`
- `deploy.yml` — as a **target-typed template** (e.g. cloudflare-worker) + profile config

**Per-org bits → CONFIG the resources read at runtime (not baked per profile):**
- maintainers (`PUBLIC_AGENT_MAINTAINERS`), the deploy target (`policy.box.deploy`), proxy host/model/etc.
  (`policy.box.github`, already done)

\* `codeql` is app-*code* scanning, so it may be **profile-opt-in** rather than a universal default.

## Borderline (decide during impl)

- `reconcile-merged-issues.ts`, `rearm-auto-merge.ts` — deterministic merge-boundary mechanics invoked *in*
  the agent effect step. Code-host logic, but runner-triggered. Lean: leave as agent-runner for now.
- `.github/zizmor.yml` baseline is derived from agent names. Either keep it emitted (a derived-data
  exception) or have `security.yml` discover the agent workflows at runtime so it can be fully static.

## Implementation slices

0. **Establish the category.** Add a `codeHostResources()` set to the engine (shared workflow+script files),
   installed into every github install — sibling to `runtimeFiles()`, but for code-host CI, not agent-runtime.
1. **Migrate `human-approval`** (workflow + `human-approval-gate.ts`) into it. Already thin → lowest risk;
   proves the pattern. Drop the profile-resource copies.
2. **Migrate `ci` + `security` + `check-supply-chain.ts`.** Make `security.yml` a static resource.
3. **Deploy as a code-host resource** (cloudflare-worker template) + `policy.box.deploy` config + the
   provisioning. ← the original goal, now a clean member of the set.
4. **`codeql` + `preflight`.** Empty out `profiles/self-driving/.github/` — the profile carries zero github YAML.

Throughout: enforce the boundary invariant (no agent deploys) in conformance; per-org values stay in config.

## The end state

`profiles/self-driving/.github/` is empty. The profile is pure declaration. The engine installs: the
agent-runner workflows it *derives*, and the standard code-host CI it *ships* — with deploy as one resource
in that set, configured by the profile, gated by the one IR invariant.
