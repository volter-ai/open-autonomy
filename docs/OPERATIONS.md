# Operating Open Autonomy

> **The operator/maintainer how-to doc.**
>
> 1. [Install & operate](#install--operate) — the model: **runner ⟂ code host**, and the three setups.
> 2. [Local-runner quickstart](#local-runner-quickstart) — run the agents on your own machine (against
>    *either* code host: a local-git board, or auto-merging PRs on GitHub).
> 3. [GitHub production rollout](#github-production-rollout) — the checklist before enabling OA on a repo
>    with the **GitHub Actions** runner.
> 4. [Release process](#release-process) — cutting a versioned Open Autonomy release.
>
> Related: how OA *proves itself* lives in `docs/LIVE_TESTING_STRATEGY.md` + `docs/PROOF_LEDGER.md`;
> the field runbook is `docs/OSS_AGENT_RUNBOOK.md`; the model + substrate design is `docs/SPEC.md`.

---

## Install & operate

Installing OA is **two independent choices** — the runner is orthogonal to the code host (see
`docs/SPEC.md` → *"Runner vs code host"*):

- **Runner** — *where the agents execute*: **GitHub Actions** (hosted jobs) or **local** (your machine,
  via the termfleet SDK, using your own logged-in coding CLI).
- **Code host** — *where the code lives and how a change lands*: **GitHub** (the agent opens a PR; `ci` +
  an `agent-review` status gate **native auto-merge** — that reviewer is independently *enforced* only on
  the hosted/scoped-token runner; see the local safety note in step 5) or **local-git** (a tracker board on
  disk, PR-free — no GitHub at all).

A profile declares which combinations it supports (`targets` × `codeHost`). The three setups people use:

| Setup | Runner | Code host | Profile | Read |
|---|---|---|---|---|
| **Hosted** | GitHub Actions | GitHub | `self-driving` · `simple-gh-sdlc` | [GitHub production rollout](#github-production-rollout) |
| **Local agents → GitHub PRs** | local | GitHub | `simple-gh-sdlc` | [Local-runner quickstart](#local-runner-quickstart) → *GitHub code host* |
| **Fully local** | local | local-git | `simple-sdlc` (or `hello`) | [Local-runner quickstart](#local-runner-quickstart) → *local-git code host* |

The **runner steps are identical** for both local setups (prereqs → termfleet → compile → run the loop);
only **how you feed it work and how a change lands** differ by code host. That split is exactly steps 1–4
(shared) vs step 5 (per code host) below.

> Installing onto an **existing** repo is an *overlay*: `simple-gh-sdlc` / `simple-sdlc` ship only
> OA-specific files (`scripts/`, `.claude/skills/`, `scheduler/`, `.open-autonomy/`, `standards/`,
> `.github/workflows/merge.yml`), so `compile … .` is purely additive — it does **not** generate a
> `package.json`, `README`, or `.gitignore` over yours. You still merge the runner's deps into your repo
> (`npm install termfleet`, `npm install -D ztrack`) — step 1 below. The OA files are **committed** to the
> repo (the agents run in git worktrees, which only see committed files — it's how OA maintains itself).
>
> **Letting an agent do the install?** Point it at [`docs/INSTALL-AGENT.md`](./INSTALL-AGENT.md) — a
> guided detect → ask → execute → verify playbook addressed to the installing agent.

---

## Local-runner quickstart

Run the **agents on your own machine** — as local terminal sessions via
[termfleet](https://www.npmjs.com/package/termfleet), using *your own* logged-in coding CLI (Claude Code
or Codex) for model access (no bounded-token proxy, no sponsor budget — **you pay your model provider
directly**). This is the **local runner**. It works against **either code host**:

- **local-git** (`simple-sdlc`) — fully closed-source: work comes from a local
  [ztrack](https://github.com/volter-ai/ztrack) board on disk, a change is `done` PR-free, **no GitHub at
  all**. The path for a private project you won't push.
- **GitHub** (`simple-gh-sdlc`) — agents run on your machine, but a change lands as an **auto-merging PR
  on GitHub** gated by `ci` + an `agent-review` status (on local the agents share your token, so that
  status is *not* an independent reviewer — your CI is the real gate; see step 5's safety note). The path
  for a trusted repo whose agents you want on your own machine and model subscription.

**Steps 1–4 (prereqs → termfleet → compile → run) are identical** for both; only **step 5 — how you feed
work and how a change lands** — differs by code host. If you just want to *see the loop fire* with zero
tracker setup, use the `hello` profile (a single cron agent).

### 1. Prerequisites

Install these once, on the machine that will run the loop:

| What | Why | Install |
|---|---|---|
| **Node.js 22.18+** | runs the CLI, the loop driver, and termfleet; the installed ztrack `.mts` preset needs TS type-stripping (Node ≥ 22.18) | nodejs.org / your version manager |
| **tmux** | termfleet's local provider runs sessions in tmux | `brew install tmux` (macOS) / your package manager |
| **termfleet** | the local runner drives it through its **SDK** (a `node_modules` dependency, not a PATH binary) | in your repo: `npm install termfleet` (then `npx termfleet …` runs its console/provider CLI) |
| **A coding agent CLI, logged in** | the agent's model access | Claude Code (default) **or** Codex — see next step |
| **bun** (for `simple-sdlc`) | the orchestrator dispatches workers via `bun scripts/runner.ts launch …` | `curl -fsSL https://bun.sh/install \| bash` — not needed for the `hello` demo (Node-only) |

#### Sign in to your coding agent

The loop launches **Claude Code** by default. termfleet drives whatever CLI you point it at, and
that CLI must already be **installed on PATH and signed in** — the launch fails after ~45s against a
missing or logged-out CLI. So sign in *first*:

- **Claude Code (default):** run `claude`, then `/login` (or set `ANTHROPIC_API_KEY`). Verify with
  `claude --version`.
- **Codex (alternative):** run `codex login`. To use Codex instead of Claude, set
  `TERMFLEET_AGENT=codex` when you start the loop (step 4).

There is no separate "open-autonomy login" — the agent uses your coding CLI's own session, so your
local subscription/key is what's billed.

### 2. Start termfleet (console + a local provider)

The local runner (the termfleet SDK's `ProviderClient`) talks to a termfleet **console** + **provider**
running on your machine. Start both once (they stay up in the background); the open-autonomy runner
auto-discovers them via the SDK's `resolveDefaultProvider` — no URL config needed (set
`TERMFLEET_PROVIDER_URL` only to pin a specific one).

```bash
npx termfleet console serve --name dev --port 7373 &
npx termfleet provider serve --kind virtual-tmux --prefix dev --count 1 --port 7402 &
```

Sanity-check that a session can launch (this is the same call the loop makes):

```bash
npx termfleet claude new --prompt "say hello"
npx termfleet sessions recent --live
```

If that prints a session, termfleet + your agent CLI are wired correctly. Open
<http://127.0.0.1:7373> for the optional visual console.

> termfleet is loopback-only by default and makes no outbound requests unless you configure a
> registry — fine for a single closed-source machine. Keep the console/provider ports (7373/7402 above)
> bound to loopback: anyone who can reach the provider can launch terminal sessions **as your user**, so
> never bind or port-forward them to a non-local interface.

### 3. Compile a profile into your repo

From inside the repo you want the loop to maintain — pick the profile for your **code host**:

```bash
cd my-repo

# Minimal demo: one cron "greeter" agent, no tracker, no code host.
npx open-autonomy compile hello local .

# local-git code host — fully local, PR-free, no GitHub (the four-agent PM/draft/develop/review loop).
npx open-autonomy compile simple-sdlc local .

# GitHub code host — agents run locally, changes land as auto-merging PRs on GitHub.
npx open-autonomy compile simple-gh-sdlc local .
```

This is an **overlay**: it lays down `scheduler/` (the loop driver + schedule), `scripts/` (the local
runner), the agent skills under `.claude/skills/` + `.codex/skills/`, `standards/`, and `.open-autonomy/`
— and, for the GitHub code host, `.github/workflows/merge.yml` (the auto-merge reconcile). It generates
**no** `package.json` / `README` / `.gitignore`, so it's safe to run over an existing repo. No clone of
this repo is required — `npx open-autonomy …` runs the published CLI. (`self-driving` also compiles to
`local`; `simple-sdlc` is local-git only.)

### 4. Run the loop

```bash
node scheduler/run.mjs --once   # fire one tick, then exit — use this to verify end-to-end
node scheduler/run.mjs          # run continuously, sleeping between ticks
```

Each tick fires the cron agents in `scheduler/schedule.json` (for `simple-sdlc` that's the PM; the
PM then launches the workers). To use Codex instead of Claude Code:

```bash
TERMFLEET_AGENT=codex node scheduler/run.mjs
```

With the `hello` profile, the first `--once` tick launches a `greeter` session — you'll see it in
`termfleet sessions recent --live` and the console. That confirms the whole local path works.

### 5. Give the loop work — by code host

The `hello` greeter self-fires on cron and needs no input. A real loop needs a backlog. **How you feed
work and how a change lands depends on the code host** you compiled in step 3.

#### local-git code host (`simple-sdlc`) — PR-free, no GitHub

The agents read work from a local **ztrack** board on disk:

```bash
npm install -D ztrack                       # a PROJECT dep, not -g: the installed validation preset
                                            # `import`s `ztrack/preset-kit`, so it must resolve from the
                                            # repo — a global/npx install fails `ztrack check`.
npx ztrack init --preset simple-sdlc        # the PR-free dev preset (the `default`); no remote needed
npx ztrack issue create                     # add a work item (repeat for each task)
```

The `simple-sdlc` preset is **PR-free**: an issue is `done` once every AC is passed with commit-evidence
and the reviewer approves — no pull request, so it works on a private repo with no remote. On its next
tick the PM sweeps the board, enforces WIP, and **launches** the matching worker (draft/develop/review)
for the next eligible issue, moving it `draft → ready → in-progress → in-review → done`. The work item
reaches each worker as `$ZTRACK_ISSUE`. You add and inspect work entirely through `ztrack` — never GitHub.

> Using a different tracker? `simple-sdlc`'s agents are just skills that call `ztrack`. Fork the profile
> (`profiles/simple-sdlc/skills/*`), point the agents at your CLI, then compile your profile dir.

#### GitHub code host (`simple-gh-sdlc`) — auto-merging PRs, agents on your machine

Here the board is **GitHub issues** and a change lands as an **auto-merging PR**. Wire the gate **once**
(use your repo's package manager — `npm`/`bun`/`pnpm` — for the installs; examples show `npm`):

```bash
# a) the tracker, linked to GitHub Issues (GitHub is the source of truth)
npm install -D ztrack    # or: bun add -d ztrack
npx ztrack init --preset simple-gh-sdlc --sync github --repo <owner>/<repo>

# b) require the gate in branch protection (NOT auto-merge yet — that comes after a supervised first merge,
#    step d). The contexts are the CI check-run NAMES that run on PULL REQUESTS — read them from an OPEN PR (a
#    MERGED PR's head also carries push-run checks), excluding release-only/push-only/path-filtered jobs.
gh api -X PUT "repos/<owner>/<repo>/branches/<default-branch>/protection" --input - <<'JSON'
{ "required_status_checks": { "strict": false, "contexts": ["<pr-ci-check>", "agent-review"] },
  "enforce_admins": true, "required_pull_request_reviews": null, "restrictions": null }
JSON
# verify protection took (errors if it didn't — e.g. free private plan):
gh api "repos/<owner>/<repo>/branches/<default-branch>/protection/required_status_checks/contexts" --jq '.'

# c) add a Ready issue (open + `ready` label + assignee + ACs in the body), then sync
npx ztrack issue create   # ... ; then: gh issue edit <n> --add-label ready
```

Then run the loop and **watch the first PR merge under supervision** — once its gate is green, merge it
yourself (`gh pr merge <pr> --squash`). **Only after that supervised first merge**, arm native auto-merge so
later PRs land on their own:

```bash
# d) ongoing operation — arm auto-merge ONLY after you watched the first PR merge cleanly:
gh repo edit <owner>/<repo> --enable-auto-merge
```

> **You must have a CI check that runs on PRs.** If your repo has none, `contexts` would be just
> `["agent-review"]` — and on a local runner the agents share *your* token (no scoped split), so the
> reviewer's `agent-review` is **not independent** of the proposer. With no real CI in the gate you would
> be auto-merging agent-written code with no independent check at all. Add a real CI check first, or don't
> enable auto-merge. `enforce_admins:true` is deliberate: it binds the gate even to the admin identity the
> local agents run as (with it `false`, an agent could `gh pr merge --admin` / push to the branch and
> bypass the gate). See the safety section in [`INSTALL-AGENT.md`](./INSTALL-AGENT.md#the-merge-boundary-and-what-it-does-not-give-you-on-local).

On its next tick the PM sweeps GitHub, and for a `ready` issue **launches the developer in an isolated
worktree** (`runner.ts launch developer --ref <n> --branch agent/issue-<n>`). The developer commits, the
runner opens the PR, the **reviewer** posts `agent-review`, and once **your CI (`ci`/`build`/…) + `agent-review`**
are green the PR is mergeable — **merge the first one yourself** to prove the gate, then arm auto-merge (above)
so later PRs land via **native auto-merge**. With `enforce_admins:true` no agent bypasses the gate —
but **your CI is the real boundary**: on a local runner the agents share your token, so the reviewer's
`agent-review` is not independent of the proposer. **Require your real CI**; with only `agent-review`
required you'd be auto-merging on the agents' own (same-token) say-so.

> Identity: for a *technically enforced* independent reviewer, run on the hosted (scoped-token) substrate,
> or give the reviewer a **separate bot identity** (a GitHub App / dedicated account) — on local under one
> token, propose and review share the same credential, so `agent-review` self-blesses.

> **Installing with an agent?** [`docs/INSTALL-AGENT.md`](./INSTALL-AGENT.md) is a guided playbook
> addressed to the installing agent — detect the repo, ask the human only the judgment calls (the gate,
> identity, the first issue), run this overlay, and **verify the loop merges before declaring done**.

### What depends on the code host vs the runner

The agent loop is the same everywhere; a few controls vary by **axis** (runner ⟂ code host):

- **Native auto-merge** is a **GitHub code-host** feature — available on a **local runner** too
  (`simple-gh-sdlc local`), *not* a GitHub-Actions-only thing. A **local-git** code host (`simple-sdlc`)
  has no PRs: the `review` agent gates the change on the tracker board and you take the agent's branch.
- **`/agent` operator commands** (pause/resume/status/retry via issue comments) are a **GitHub
  code-host** control plane. On a local-git board you steer with termfleet directly
  (`termfleet sessions recent`, `termfleet <agent> get|wait`, kill from the console) and the board.
- **The bounded model-token proxy + sponsor budget** is a **GitHub-Actions runner** feature. On the
  **local runner** there is no spend cap from open-autonomy (either code host) — your model provider
  bills you; watch `termfleet sessions recent --live` and stop the loop to bound spend.

### Troubleshooting

- **`createAgentWindow returned no terminalId …`** — the console/provider (step 2) aren't running, or your
  agent CLI isn't installed/logged in (step 1). Re-run the `npx termfleet claude new --prompt "hi"`
  sanity check in isolation.
- **The loop does nothing each tick (`simple-sdlc`)** — there's no eligible work. Confirm
  `ztrack issue view` shows items and that they're in a state the PM can advance.
- **Wrong agent launches** — set `TERMFLEET_AGENT=claude` or `=codex` explicitly; the default is
  `claude`.
- **Pin a specific provider** — if auto-discovery picks the wrong one, set `TERMFLEET_PROVIDER_URL`
  to your provider's URL before running the loop.

---

## GitHub production rollout

Use this checklist before enabling open-autonomy on a repository.

### Required Configuration

Repository variables — this is the complete set the **emitted workflows actually read** (behavioral
knobs like sweep limits, retry budgets, and allowed paths are **not** variables anymore; they live in
the profile's `policy` box, compiled into `.open-autonomy/autonomy.yml`):

| Variable | Read by | Default when unset |
|---|---|---|
| `MODEL_PROXY_URL` | every agent job's mint/exchange steps — the model-proxy base URL | *(none — required)* |
| `MODEL_PROXY_OIDC_AUDIENCE` | the OIDC token exchange | `volter-agent-model-proxy` |
| `PUBLIC_AGENT_PROXY_HOST` | the harden-runner egress allowlist (must match `MODEL_PROXY_URL`'s host) | the maintainer's proxy host |
| `PUBLIC_AGENT_MODEL` | the per-run model allowlist minted for every agent | `deepseek/deepseek-v4-flash` |
| `PUBLIC_AGENT_TRIAGE_MODEL` | the preflight workflow's triage step | unset (skipped) |
| `PUBLIC_AGENT_MAX_USD_CENTS` | the per-run spend cap minted into the run token | `200` |
| `PUBLIC_AGENT_MAX_REQUESTS` | the per-run request cap (the binding cap in practice) | `250` |
| `PUBLIC_AGENT_CLAUDE_CODE_VERSION` | the coding-CLI version the agent job installs — **set this**; unset means `@latest` (a supply-chain surprise) | latest |
| `PUBLIC_AGENT_MAINTAINERS` | the human-approval gate's engage step (who gets assigned + review-requested) | the repo owner |
| `PUBLIC_AGENT_REPO_PAUSED` | every agent job's `if:` guard — `true` pauses the whole fleet (the repo-wide kill switch) | unset (running) |

Repository secrets:

- none required for model access: in-cell agents mint and exchange bounded
  per-run model tokens via GitHub OIDC; no admin token lives in the repo.

Model proxy deployment:

- Set provider API keys and model names.
- Set `MODEL_PRICES_JSON`.
- Choose production limits for global active runs, per-repo active runs,
  per-actor active runs, per-run spend, per-run request count, and daily spend.
- Verify `GET /admin/limits/status` responds (operator-run, with the admin
  token from the operator's local `.env`; there is no in-repo admin workflow).

GitHub repository:

- Branch protection requires **all three** status checks — `ci` + `agent-review` + `human-approval` —
  and native auto-merge lands reviewed PRs (no agent merges). Omitting `human-approval` makes the
  human gate decorative: PRs in `human_required_paths` scope would auto-merge with no human.
  `scripts/provision-target-repo.ts` provisions exactly this protection.
- Required CI check name matches `ci`.
- Actions artifact retention is long enough for operator audits.
- Workflow permissions stay capability-separated; do not use `write-all`.
- Workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

### First Public Rollout Policy

Start with a narrow allowed surface:

- trusted maintainers only for manual `/agent developer`
- a PM sweep limit of 1–3 issues and a conservative path scope — both are **profile policy**
  (`policy:` in the profile's ir.yml, compiled into `.open-autonomy/autonomy.yml`), not repo variables
- low per-run spend caps (`PUBLIC_AGENT_MAX_USD_CENTS` / `PUBLIC_AGENT_MAX_REQUESTS`)
- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows

Escalate to humans for security issues, broad architecture changes, unclear
requirements, repeated failures, merge conflicts, missing CI, stale CI, and
reviewer high-risk verdicts.

### Operator Drills

Before opening broader access, verify these in the target repo:

- `/agent pause` applies `agent-paused`.
- `/agent developer` on a paused issue stops before model minting.
- `/agent status` reports labels, open PR, active workflow runs, and active proxy
  runs.
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports no infrastructure retry when no failed run exists, or
  reruns failed jobs without posting a fresh `/agent developer`.
- `/agent cancel` cancels active public-agent workflow runs and revokes active
  proxy runs for the issue.
- `Model Proxy Admin` `status` shows active-run saturation and daily counters.

### Private Trial Evidence

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent developer` policy block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for operator controls: run `27633520672`.
- Push CI for production rollout checks: run `27633852289`.

### Go/No-Go

Go only when all of these are true:

- `bun run check` passes locally and in GitHub Actions.
- A fresh low-risk issue completes end to end.
- A paused issue does not dispatch new work.
- PM sweep on stale backlog launches no duplicate work.
- Proxy saturation causes skip/backpressure, not workflow failure.
- Risky or unclear issues produce human-required escalation instead of a PR.

---

## Release process

Open Autonomy releases are versioned by `VERSION` and
`.open-autonomy/version.json`.

Release checklist:

1. Update `VERSION`, `.open-autonomy/version.json`, and `CHANGELOG.md`.
2. Run `bun run check`.
3. Run planner and preflight workflows on `main`.
4. Compile into a clean directory (`bun bin/open-autonomy.ts compile profiles/self-driving gh-actions <dir>`)
   and run its `bun run check`.
5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md).
6. Tag the release as `vX.Y.Z`.
7. Record migration notes for template changes in the changelog.

Generated or upgraded repositories should keep their local
`.open-autonomy/version.json` so runs can record the Open Autonomy version and
profile used for each session.
