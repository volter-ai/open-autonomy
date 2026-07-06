# Code-host resources — what the engine emits vs what the profile carries

> Reached through the deploy-design discussion (2026-06-25). The chain: deploy is the same on every
> substrate → it's not substrate (substrate = runners) → it's a resource → a github CI script installed
> as a resource → **and resources are part of the IR, like the standards docs.**
>
> Extended to **merge** (2026-06-26) via the same chain: substrate = the actor runner (which box, how it's
> wrapped, the scoped token) — *nothing else*. A merge is neither an agent run nor a human run; it's a
> deterministic code-host event. So it's not substrate either — it's a resource, exactly like deploy. The
> only substrate fingerprint is *negative*: it scopes the agent so no agent can merge, and offers a human
> runner the profile may decline to route the merge through (this one does → the server auto-merges).

## The principle

`compileGithub` was doing two jobs. Separate them by what *generates* the file:

- **Emit** — only what the engine **derives from the IR**:
  - the agent-runner workflows (`developer.yml`, … — derived from `ir.agents`; vanish on the local substrate)
  - security **DATA** materializations: `.github/zizmor.yml` (the guarded agent-workflow names) and
    `.open-autonomy/human-required-paths.json` (`policy.box.risk.human_required_paths`). Not authored logic —
    the IR projected into a runtime-readable form.
- **Resource** — every github **CI *workflow***, carried verbatim by the profile, **exactly like
  `docs/standards/*.md`**: `ci`, `merge`, `human-approval`, `security`, `dependabot`, `codeql`, `deploy`,
  `preflight`. Resources are an essential part of the IR; a github-CI workflow is one.

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

Merge is its sibling. The IR-level fact is the **boundary invariant: no agent merges** — but note where that
boundary actually lives: **branch protection** (`ci` + `agent-review` required server-side, no bypass), NOT
the absence of a permission. The `merge.yml` resource *arms* native auto-merge on open agent PRs and
*reconciles* issues whose PR merged. Enabling auto-merge needs push access, so it holds **contents:write**
(+ pull-requests:write to manage the PR, issues:write to reconcile) — yet it still cannot land a red or
unreviewed PR, because branch protection refuses the merge regardless of the token. (A permission-only story —
"merge.yml has no contents:write so it can't merge" — is wrong twice: it *can't even arm* auto-merge without
push access, and contents:write wouldn't let it bypass the required checks anyway.) A bot-opened PR fires no
`pull_request` event (GITHUB_TOKEN anti-recursion), so the proposer **dispatches** `merge.yml` right after
opening its PR — exactly as it dispatches `ci`/`agent-review` — and `merge.yml`'s schedule re-runs as the
deterministic backstop. The arm/close logic used to be inline (the proposer's effect step armed — it already
held contents:write via `code:propose`; the tasks:author PM reconciled+re-armed), which was integration
leaking into the agent runners; it's now a resource, decoupled from any agent run.

## Where each file lives (current, after the split)

**Emitted (derived from the IR):**
- `developer/pm/planner/reviewer/strategist/strategy_reviewer.yml`, `.github/agent-control.mjs`
  - a `code:propose` agent's workflow materializes the actor's output (push the branch + open the PR) and
    then *dispatches* the code-host resources it can't fire itself (`ci`, `agent-review`, `human-approval`,
    `merge`) — it no longer arms auto-merge inline.
- agent-runtime scripts: `claude-agent-run.ts` + `agent.ts` (the credentialed skill runner),
  `model-proxy-*` (token mint/exchange/revoke), `runner.ts`, `transcript.ts`, `agent-visual-verify.ts`,
  `agent-propose.ts` — ONLY actor-execution machinery (the runner: which box, how it's wrapped, the
  scoped token). Nothing else rides the mirror.
- `.github/zizmor.yml`, `.open-autonomy/human-required-paths.json` (derived data)

**Profile resources (carried, IR layer):**
- `ci.yml`, `merge.yml`, `human-approval.yml`, `security.yml`, `dependabot.yml`, `codeql.yml`, `deploy.yml`,
  `open-autonomy-preflight.yml` — the github CI scaffolding, per github-targeting profile
- the gate **scripts** those workflows call: `rearm-auto-merge.ts` + `reconcile-merged-issues.ts`
  (merge.yml), `human-approval-gate.ts` (human-approval.yml), `check-supply-chain.ts` (security.yml) —
  carried by every profile whose workflows invoke them (self-driving: all four; soc2-baseline: all four;
  simple-gh-sdlc: merge pair + supply-chain; hello: supply-chain only). Shared standards: the copies must
  be byte-identical across carrying profiles (`check:profiles` enforces); they are developed + unit-tested
  in `scripts/` and excluded from the runtime mirror (`bin/sync-runtime.ts` CODE_HOST_RESOURCE set).

**Done (2026-06-25):** `security.yml` + `dependabot.yml` moved from engine emission → resources across the
three github profiles (`self-driving`, `hello`, `simple-gh-sdlc`); `zizmor.yml` + `human-required-paths.json`
stay as derived data. Deploy was already a resource, so the original question ("first-class IR vs profile?")
is answered: **it's a resource.**

**Done (2026-06-26):** `merge.yml` extracted — the proposer's inline auto-merge arm and the tasks:author PM's
reconcile+re-arm steps left the emitted agent workflows and became the `merge.yml` code-host resource (carried
by the proposer-bearing github profiles `self-driving` + `simple-gh-sdlc`). The proposer now dispatches
`merge.yml`; its schedule is the backstop. The engine emits only actor runners + the proposer's thin
"materialize output + kick resources" effect.

**Done (2026-07-06):** the gate **scripts** moved from runtime injection → profile resources (the deferred
half of this split). The friction the deferral waited for arrived: the 2026-07 boundary audit found the
substrate mirror hard-coding org *policy vocabulary* (§1.1 — `rearm-auto-merge.ts` shipping a hold-label
list every install inherited invisibly) and the gate's own qualification logic outside any profile's
human-gated scope (§1.5). Ruling ratified with the move: **the substrate owns no label vocabulary and no
code-host gate logic** — substrate = triggers/crons/agent-runners/credentials only; every gate script is a
profile-carried resource reading its parameters from the compiled `.open-autonomy/autonomy.yml`.
`bin/sync-runtime.ts`'s header ("the mirror holds only substrate machinery") is now true.
The **inverse** move landed the same day: `egress-guard.sh` (the `private_egress_guard` implementation) left
soc2-baseline's resources and became substrate-emitted alongside its job step — egress lockdown of the
credentialed box is RUNNER security ("which box, how it's wrapped"), the one thing the substrate does own.
The two moves are the same ruling applied in both directions.

**Recorded decision — `agent-propose.ts` stays vendored (2026-07-06):** it is the one script the *emitted*
effect step invokes (`emit.ts` writes `bun scripts/agent-propose.ts` into every `code:propose` agent's
generated workflow) — the runner-side realization of the `code:propose` capability (push branch → PR →
dispatch checks), identical for every profile and carrying **no policy vocabulary** (no labels, no paths,
no thresholds). Engine-emitted workflows may depend only on engine-shipped runtime, so it rides the mirror
with the skill runner. If it ever grows a policy parameter, that parameter moves to `policy.box` with a
reader — the script still doesn't move.

## Open / deferred

- A **base/standard resource set** so github profiles don't each copy `security.yml`/`dependabot.yml`
  (and now the gate scripts). Deferred — not worth it at the current profile count; `check:profiles`'
  byte-identity guard keeps the copies honest meanwhile.
- The deploy **provisioning** (environment + ruleset) is still imperative `gh api`. Making it a reproducible
  setup step is the remaining deploy work (separate from this layering fix).
