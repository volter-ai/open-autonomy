# Open Autonomy — working notes (canonical entry point)

> **Read this before touching anything.** This repo is **spec-first**: the design is written down in
> `docs/` and that is the source of truth. Do **not** reverse-engineer the model from code — find the
> owning doc in the directory below and read it first, then read the code. Most "surprises" in this
> codebase are answered by a doc you haven't opened yet.

## What this is

Open Autonomy is the **system + spec for autonomous software organizations** ("org-as-code"). You write a
**profile** (an `autonomy.ir.v1` IR describing actors, capabilities, triggers, policy), and
`compile(profile, substrate)` materializes a running installation onto a **substrate** (GitHub Actions, or a
local termfleet loop). This repo **dogfoods itself**: its own `main` *is* an installation of
`profiles/self-driving`. See `docs/VISION.md` (the why) and `docs/PROJECT.md` (the charter).

## Working agreement

- **Never wait for human approval on routine work. Push and merge; act with full agency** on any
  non-destructive, authorized change (commit to `main`, push, merge, deploy the proxy). Report what you did.
  **Develop directly on `main`** — never branch.
- **Spec-first, not code-first.** When something is unclear, open the owning doc (directory below) before
  grepping. I have repeatedly wasted effort by reverse-engineering what a doc already states.
- **`live proof` is the only proof.** A real run (testbed/dogfood) is what makes a feature "done"; unit tests
  and piecewise verification don't. Confirm CI is actually green — local-green can lie (ambient `node_modules`).
- **Distinguish DESIGNED vs BUILT.** Many capabilities are fully *specified* in `docs/` but only *partially
  built* (esp. the human seam — see "Built vs designed" below). Don't claim something exists because a doc
  describes it; don't rebuild something because you didn't find it in code. Check both layers.

## Scripts only for security — never script what an agent can do

The default executor is an **agent**, not a script. LLMs adapt; scripts can't. A deterministic script is
justified by **one thing only: security** — a boundary an agent must not control (minting/scoping run tokens,
the no-self-merge merge boundary, capability/permission enforcement, the repo-pause kill-switch, the
`human-approval` gate). Everything else — judgment, triage, decomposition, conflict resolution, "noticing" —
belongs to an agent. **Never script what an agent could do**; a missed action self-corrects next run. An
agent mistake is a **prompting or tools problem**, not a model-capability one — the fleet runs on DeepSeek v4
fast (stronger than last-gen frontier), so fix the prompt/tool, never route around the model. (Mirror in
`profiles/self-driving/AGENTS.md` for the fleet.)

---

## Directory — where everything lives (and what is authoritative)

### `docs/` — the spec layer (SOURCE OF TRUTH; read these first)

| Doc | Owns (authoritative for) |
|---|---|
| `docs/SPEC.md` | **The standard** (`autonomy.ir.v1`) — the one spec doc. Six sections: the IR (actor unit, four slots, four catalogs, conformance); **Capabilities** + **the merge boundary** (code:propose vs code:review; no agent merges); **Trigger params** (`subject.ref`, …); **Task lifecycle** (open→ready→…→done; "done is verified, not presumed"); **The Runner** (launch/list/get/update/cancel + the human realization); **Handoffs** (choreography over `tasks`, the typed seam, the human seam + its 4 affordances, simulators, the planned `maintainer` `kind:human` migration). Link sections by anchor, e.g. `docs/SPEC.md#capabilities`. |
| `docs/ARCHITECTURE.md` | The master map + the doc index + the **canonical vocabulary** glossary + source-repo layout (absorbed PROJECT-LAYOUT). Start here for orientation. |
| `docs/VISION.md` | Mission, merit criteria, the three pieces (Standards/Bench/Dogfood), horizons **H1–H5**. |
| `docs/CONSTITUTION.md` | North star + the 7 operating rules (human-owned; amended, never auto-edited). |
| `docs/PROJECT.md` | Charter (the mission-as-charter; shipped to installs). |
| `docs/ROADMAP.md` | Tactical phases + proof gates (vs VISION = strategy). |
| `docs/standards/*.md` | code / docs / tests / security standards agents must follow. |
| `docs/OPERATIONS.md` | Operating OA: local quickstart · GitHub production rollout · release process (absorbed LOCAL-QUICKSTART / PUBLIC_AGENT_PRODUCTION_ROLLOUT / RELEASE). |
| `docs/OSS_AGENT_RUNBOOK.md` | Field runbook: local checks, live smoke tests, operator commands. |
| `docs/LIVE_TESTING_STRATEGY.md`, `docs/PROOF_LEDGER.md` | How the live testbed proves features (eval doctrine); the machine-parsed proof ledger (`check:proof`). |

> `SPEC.md` is the consolidation of the former AUTONOMY-IR / CAPABILITIES / TRIGGER-PARAMS / TASK-LIFECYCLE /
> RUNNER / HANDOFFS docs (one tightly-coupled spec: the IR + its four catalogs + the seam/runner). The table
> is the index so you never have to guess which doc to open. `CONSTITUTION`/`VISION` anchor everything.

### `packages/` — the engine (substrate-neutral core + substrate compilers)

- **`packages/core/`** — the IR + the contract. `ir.ts` (types, `validateIR`, the merge-boundary checks),
  `runner.ts` (the Runner contract + `ExecRunner` for agents + **`HumanRunner`** — parks a human task, never
  auto-completes, external act marks done), `manifest.ts`, `upgrade.ts` (**`INSTALL_OWNED_PATHS`**, upgrade =
  re-compile + prune), `conformance.ts`, `materialize`/`compiledPaths`.
- **`packages/substrate-github/`** — **`emit.ts`** compiles the IR → GitHub workflows: the agent job wrapper,
  the **capability→permissions** map, the **effect step** (push branch → PR → arm auto-merge → dispatch
  ci+agent-review+human-approval, all retried), the control plane, the harden-runner egress lockdown, the
  model-token mint/revoke. `isHuman` → **declared, not job-realized**. `runner.ts` = `GithubRunner`
  (agent-only). **`src/runtime/`** = the vendored mirror of `scripts/` injected into installs.
- **`packages/substrate-local/`** — the termfleet/local substrate. Unlike GitHub, it **runs a scheduler loop**
  (`scheduler/run.mjs` ticks → calls runners per kind), so the local substrate is where `HumanRunner` is
  actually driven.

### `profiles/self-driving/` — the dogfood org (compiles to this repo's root)

- `ir.yml` — the **roster** (pm, developer, reviewer, planner, strategist, strategy_reviewer), their `kind`,
  capabilities, crons, review gates; the **policy box** (`risk.human_required_paths`/topics, merge rules,
  `maintainer_block_labels`, planner label prefixes); the **`resources:`** list (files carried verbatim).
- `skills/<agent>/SKILL.md` — each agent's doctrine (prose behavior).
- `.open-autonomy/` — compiled `autonomy.yml`, `roadmap.yml` (the two-layer roadmap), `review-rubric.yml`,
  `strategy-rubric.yml`, `strategist-sources.json`.
- `.github/workflows/` — hand-written profile workflows: `ci.yml`, `human-approval.yml`,
  `open-autonomy-preflight.yml` (the per-agent `developer.yml`/`pm.yml`/… are **generated**, not here).
- `AGENTS.md` — fleet-facing guidance (the agent-doctrine mirror of this file).

### `scripts/` + `bin/` — the runtime backend + CLIs

- **`scripts/`** = the runtime backend, **mirrored** into `packages/substrate-github/src/runtime/` via
  `bun bin/sync-runtime.ts` (enforced by `check:runtime-sync`). Groups: agent execution
  (`claude-agent-run.ts`, `agent.ts`, `transcript.ts`), model-token lifecycle
  (`model-proxy-mint/exchange/revoke.ts`), deterministic gates/sweeps (`reconcile-merged-issues.ts`,
  `rearm-auto-merge.ts`, `human-approval-gate.ts`), and dev-only/profile-owned tooling (NOT mirrored:
  `bench-*.ts`, `rotate-admin-token.ts`, `open-autonomy-upgrade-cli.ts`, `*.test.ts`).
- **`bin/`** — `autonomy-compile.ts`, `check-dogfood.ts`, `sync-runtime.ts`, `autonomy-upgrade.ts`,
  `autonomy-conformance.ts`, `bench.ts`.

### `services/agent-model-proxy/` — the Cloudflare Worker (repo-owned; edit directly, NOT dogfood-managed)

The model proxy that **gates all agent model spend** and serves the funding storefront (open-autonomy.org).
`src/`: `index.ts` (routes + `x-admin-token` admin), `anthropic.ts`/`openai.ts`/`pricing.ts` (provider
routing; deepseek/* via OpenRouter settles **cheap**, ~cents), `run-budget.ts` + `limit-ledger.ts` (Durable
Objects: per-run + global spend ledger, run slots, profiles, `recent_runs`), `github-sync.ts` (syncs a repo's
profile + roadmap rollup), `platform-html.tsx`/`project-docs.tsx`/`ui/` (server-rendered funding page).
Deploy with `bunx wrangler deploy`. **The proxy ledger's `consumed_usd_cents` is the authoritative cost — NOT
the CLI's `total_cost_usd`** (which mis-prices proxied models ~40×).

### `bench/` — the eval harness

Disposable funded testbed cells (`profile × substrate × workload`). `bun bin/bench.ts` →
`--live`/`--drive`/`--operate`/`--score`/`--teardown`. Human actors are simulated here (fixtures), which is
why human simulation is a precondition for Bench.

---

## The mental model (concise; depth in the docs above)

- **Unit = an actor** with `kind: agent | human` and four slots: behavior, capabilities, triggers, config.
  `kind` is **declared in the profile**; *realization* (script / model / real person / simulator) is the
  substrate's choice. (`SPEC.md#the-ir`, `SPEC.md#handoffs`)
- **Handoffs = choreography over `tasks`.** Actors don't call each other; they change a task's state and the
  next actor's trigger fires. `agent:launch` (the Runner) is the direct-dispatch escape hatch. (`SPEC.md#handoffs`)
- **Triggers:** `cron` + `dispatch` are portable; `event:` is the substrate-native escape hatch.
- **Capabilities → the merge boundary:** `code:propose` (contents:write — push/PR) and `code:review`
  (statuses:write — post `agent-review`) are **never on one agent**; no agent gets `code:merge`. Native
  auto-merge lands a PR once required checks pass. (`SPEC.md#capabilities`)
- **Substrates** realize the same IR differently (GitHub = events+workflows, no Runner loop; local =
  scheduler+runners). Realization is the substrate's job; the profile is substrate-agnostic.

---

## Editing shared control files (the three layers)

`profiles/self-driving/` is the SOURCE of this repo's github installation. There is no hand-maintained
template — the installation is `compile(profiles/self-driving, github)`.

1. **Profile (compiled to root):** skills (`.codex/skills/`, `.claude/skills/`), generated workflows
   (`.github/workflows/<agent>.yml`), `.open-autonomy/autonomy.yml`, profile `docs/*`. **Edit the file under
   `profiles/self-driving/`**, then regenerate root with `bun scripts/open-autonomy-upgrade-cli.ts` (or
   `bun bin/autonomy-compile.ts`). **Never hand-edit a generated copy** — `check:dogfood` will fail.
2. **Runtime (substrate-owned):** `scripts/*` — edit + test in `scripts/`, then `bun bin/sync-runtime.ts`
   to refresh the vendored mirror; `check:runtime-sync` enforces they match. `compileGithub` injects it.
3. **Repo-owned / install-owned** (`INSTALL_OWNED_PATHS` in `packages/core/src/upgrade.ts`): `package.json`,
   `bun.lock`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `.open-autonomy/roadmap.yml`, `docs/CONSTITUTION.md`,
   `docs/ARCHITECTURE.md`, `docs/PROJECT.md`, `docs/ROADMAP.md`, `.gitignore`, `.gitattributes` — **and this
   `CLAUDE.md`**. Seeded once, never overwritten by upgrade; edit directly. `services/*` is also repo-owned.

```
bun bin/autonomy-compile.ts profiles/self-driving github <dir>   # produce an installation
```

`check:dogfood` enforces OA root == `compile(profiles/self-driving, github)` for every managed file. Upgrade
is a re-compile (`packages/core/src/upgrade.ts`): regenerate derived, seed install-owned only if missing,
prune derived orphans. Run locally via `scripts/open-autonomy-upgrade-cli.ts`; it is a maintainer command,
not an autonomous agent (it can touch `.github/workflows`, a human-required path).

## Build / checks

`bun run check` runs all gates: `check:autonomy` (tsc), `check:core`, `conformance`, `check:runtime-sync`
(scripts == mirror), `check:compile` (profile compiles), `check:profiles`, `check:dogfood` (root == compile),
`check:provision`, `check:public-agent` (scripts tests+tsc), `check:agent-proxy` (the worker —
**installs its own deps first**, since it's a standalone package), `check:proof` (roadmap proof gates).
A standalone package outside the `packages/*` workspace must install its own deps in its check, or CI breaks
while local stays green.

## Load-bearing invariants / gotchas

- **No agent merges.** Branch protection on `main` requires `ci` + `agent-review` + `human-approval` status
  checks; the permission split is the boundary. `enforce_admins: false` → only human admins can direct-push
  (agents are forced through gated PRs); "require PR before merging" is on.
- **GITHUB_TOKEN anti-recursion:** a bot-opened PR does NOT fire `pull_request`/`pull_request_target`
  workflows — so `ci`, `agent-review`, and `human-approval` are **dispatched explicitly** by the proposer's
  effect step (with retries). Forget the dispatch → the required check never posts → the PR wedges.
- **`human-approval` gate** (`scripts/human-approval-gate.ts` + `.github/workflows/human-approval.yml`):
  ADDITIONAL required check. Routine PRs auto-pass (no human); PRs in `human_required_paths` scope or carrying
  the `human-required` label need a **maintainer Approve on the current head SHA** (per-SHA re-earn).
- **Cost authority:** the proxy ledger's `consumed_usd_cents` is real; the CLI `total_cost_usd` is a wrong
  estimate for proxied models. deepseek-v4-flash runs cost **cents**; the binding per-run cap is
  `--max-requests`, not `--max-usd-cents`.
- **Run slots leak** if a job dies after mint before revoke; auto-reaped at token TTL (~2h). Revoke is retried
  + non-fatal.
- **Roadmap status is DERIVED** from child issues (`roadmap:<id>` labels), never hand-written. Two layers:
  strategist writes/retires layer-1 intents; planner converts to issues (layer-2). A `DIRTY`/conflicting PR
  never auto-merges even when green — the PM must re-develop it.

## Built vs designed (so we stop conflating)

- **Built:** the IR + actor model (core); `HumanRunner` (core, driven by the *local* substrate); the merge
  boundary; the two-layer roadmap + strategist audit/retire + planner reap; the `human-approval` gate
  (github realization of the human *review* handoff, enforced).
- **Designed but NOT built (per `SPEC.md#handoffs`, ~H1):** the full human seam — a declared `maintainer`
  `kind:human` actor the PM `dispatch`es on `human-required`, with the 4 affordances (durable pause/redeem,
  worklist, **escalation/notify**, typed `in/decision/out` payload + receiver confirmation). On github,
  `kind:human` is **declared-only** (no job, no Runner loop); the `emit.test.ts` `test.todo` names exactly the
  unbuilt "block → escalate → resume" seam. Out-of-band escalation/notify is the missing piece (the org can go
  dark silently — roadmap `operator-observability`/health-monitor).
