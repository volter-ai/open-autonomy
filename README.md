# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://volter-agent-model-proxy.aaron-0ed.workers.dev/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)

`open-autonomy` makes a repository drive its own maintenance work: work items become reviewed,
gated, merged changes, produced by bounded AI agents under **deterministic guardrails**.
It is **substrate-agnostic** — the same setup compiles onto **GitHub Actions** or onto a **local**
machine loop. The repo also runs open-autonomy against itself (it's its own first user).

**Want to run it on your own repo?** Jump to [**Run it on your repo**](#run-it-on-your-repo) — it
forks into **GitHub Actions** (public/team repos) and **fully local** (closed-source, your machine,
no GitHub). If you have a private codebase you won't push to GitHub, the local path is for you.

## The model

You write a **profile** (a recipe) and **compile** it onto a **substrate**, producing an
**installation** you run:

```
compile(profile, substrate) → installation
```

- **profile** — a substrate-agnostic recipe: which agents (skills), which workflows, which policy —
  expressed as an IR (`autonomy.ir.v1`).
- **substrate** — *where/how* it runs = a **trigger executor** (fires workflows) + a **runner**
  (runs agents), over a **box** (the agent's POSIX environment). `github` and `local` are peers.
- **installation** — the materialized files laid into a repo for one substrate.

Each agent is a **credentialed job** whose token is scoped to its capabilities; it acts directly
(edits code, pushes a branch, opens an auto-merging PR). The merge boundary is a **permission split**:
no single agent holds both `code:review` (statuses:write — blesses) and `code:propose` (contents:write
— pushes), so none can both write code and bless it. GitHub native auto-merge lands a PR once `ci` +
`agent-review` are both green. The agent gets bounded model access (no raw keys) and can never merge.

Read [`docs/SPEC.md`](./docs/SPEC.md) for the full model and conformance contract, and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the vocabulary and layout.

## Run it on your repo

Two **independent** choices (a profile compiles to any valid combination — install with one `npx`
command, no clone required):

- **Runner** — *where agents execute*: **GitHub Actions** (hosted jobs) or **local** (your machine,
  via [termfleet](https://github.com/volter-ai/termfleet), using your own logged-in Claude Code / Codex).
- **Code host** — *where code lives and how it merges*: **GitHub** (the agent opens a PR; CI + an
  independent reviewer gate **native auto-merge**) or **local-git** (a tracker on disk, PR-free — no GitHub).

The runner is orthogonal to the code host: you can run agents on your own machine and still land
auto-merging PRs on GitHub. Three setups people actually use:

| Setup | Runner | Code host | Profile | Best for |
|---|---|---|---|---|
| **Hosted** | GitHub Actions | GitHub | `self-driving` / `simple-gh-sdlc` | public/team repos — fully autonomous in the cloud, `/agent` issue-comment control, a bounded model-token proxy |
| **Local agents, GitHub PRs** | local | GitHub | `simple-gh-sdlc` | run the agents on *your* machine/IP & your own model subscription, but still get PRs + native auto-merge on GitHub |
| **Fully local** | local | local-git | `simple-sdlc` | closed-source — no GitHub at all; work comes from a local `ztrack` board, PR-free |

```bash
cd my-repo

# Hosted (GitHub Actions runner, GitHub code host):
npx open-autonomy compile self-driving gh-actions .   # then wire repo vars/secrets + branch protection

# Local agents → GitHub PRs (local runner, GitHub code host):
npx open-autonomy compile simple-gh-sdlc local .       # agents on your machine; PRs auto-merge on GitHub

# Fully local (local runner, local-git code host):
npx open-autonomy compile simple-sdlc local .          # no GitHub; or `hello` for a zero-tracker demo
```

Full step-by-step for every setup (termfleet console/provider, agent sign-in, the merge gate, feeding
the loop work) → [**`docs/OPERATIONS.md`**](./docs/OPERATIONS.md#install--operate). `self-driving` and
`simple-gh-sdlc` run on **either** runner; `simple-sdlc` is local-git (no code host). See
[the CLI](#the-open-autonomy-cli) for all verbs and options.

> **Installing with an agent?** Point it at
> [**`docs/INSTALL-AGENT.md`**](./docs/INSTALL-AGENT.md) — a guided **detect → ask → execute → verify**
> playbook: it reads your repo, asks you only the judgment calls (the merge gate, identity, the first
> issue), runs the overlay, and proves the loop merges a PR before calling it done.

## What it does (the GitHub substrate)

```text
issue or PM sweep -> developer (a credentialed skill agent, bounded model token)
  -> the agent edits code + opens its own PR with auto-merge queued
  -> CI + an independent reviewer post the required `ci` + `agent-review` statuses
  -> GitHub native auto-merge lands it (no agent can merge), or human-required escalation
```

Operators steer it with `/agent` issue comments (see Commands). The `local` substrate runs the same
loop with a scheduler loop + a termfleet runner instead of GitHub Actions.

## Repository layout

**The engine** — substrate-agnostic, reusable (`packages/`):

- `packages/core` — the IR, the **Runner contract**, the conformance battery, the compiler framework.
- `packages/substrate-local` — the **local** substrate: emit a local-loop installation + the termfleet runner.
- `packages/substrate-github` — the **github** substrate: emit the manifest + workflows + operator control plane + the github runner.
- `bin/autonomy-conformance.ts` — check any runner against the core contract.

**The GitHub app** — open-autonomy running on the github substrate (the complete, dogfooded substrate today):

- `scripts/` — the github runtime: the model-proxy mint/exchange/revoke clients, the credentialed skill runner (`scripts/claude-agent-run.ts`), the operator control handler (`.github/agent-control.mjs`), `runner.ts`, and the preflight/proof-audit tooling. Each agent is a skill run by Claude Code under a capability-scoped token.
- `services/agent-model-proxy/` — a Cloudflare Worker that mints bounded, revocable model tokens (no raw keys) and meters spend against a sponsor-funded budget ledger.
- `.open-autonomy/`, `.codex/skills/`, `.github/workflows/` — this repo's own installation (the dogfood).

**Recipes & demos:**

- `profiles/` — profiles (recipes) that compile to any substrate: `hello` (minimal) and
  `self-driving` (open-autonomy's own self-driving setup; the single source of every github installation).

Docs: [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (the github app's design + trust boundaries + canonical vocabulary + layout),
[`SPEC.md`](./docs/SPEC.md) (the substrate-agnostic model + the four catalogs),
[`ROADMAP.md`](./docs/ROADMAP.md).

## Develop on open-autonomy itself

This is **contributor setup** — clone this repo to hack on open-autonomy. You do **not** need it to
*use* open-autonomy on your own repo (for that, see [Run it on your repo](#run-it-on-your-repo)).

```bash
bun install
bun run check                  # typecheck + conformance + tests (proxy + runtime + examples)
bun run autonomy conformance exec   # check the Runner contract on the reference runner
```

## The `open-autonomy` CLI

One command is the front door — `open-autonomy <verb>` (alias `oa`):

```bash
open-autonomy compile <profileName|profileDir> <local|github> [outDir]   # compile a profile onto a substrate
open-autonomy conformance <exec|termfleet|github>                        # run the substrate conformance battery
open-autonomy upgrade --profile <dir> --target <dir> [--apply]           # re-compile an installation in place
```

The first argument is a **bundled profile name** (`self-driving`, `simple-sdlc`, `hello` — shipped with the
package) or a path to your own profile dir. No clone required once published — `npx open-autonomy <verb>`
(or `bunx open-autonomy <verb>`). The published package is a self-contained Node bundle, so plain Node works;
bun is not required to *use* it. From a clone (bun-native, runs TypeScript directly): `bun run autonomy <verb>`
or `bun bin/open-autonomy.ts <verb>`. The published bundle is produced by `bun run build`.

To adopt open-autonomy into your own repo, compile a profile into it — see
[**Run it on your repo**](#run-it-on-your-repo) for the runner ⟂ code-host setups and the follow-up
guides ([`OPERATIONS.md`](./docs/OPERATIONS.md#github-production-rollout) for the GitHub Actions runner,
[`OPERATIONS.md`](./docs/OPERATIONS.md#local-runner-quickstart) for the local runner). From a clone, a
profile *path* also works: `open-autonomy compile profiles/self-driving gh-actions ../my-repo`.

## Operator commands

These are the **GitHub code host's** control plane (issue comments). On a local-git board you steer the
fleet with termfleet directly and the tracker instead — see
[`docs/OPERATIONS.md`](./docs/OPERATIONS.md#local-runner-quickstart).

Operator commands work only for maintainers (repo OWNER/MEMBER/COLLABORATOR); a comment from anyone
else is ignored. To launch an agent by comment, name it: `/agent <agent>` (the workflow name).

- `/agent developer` — ask the developer to work on the issue.
- `/agent reviewer` — run the reviewer on an agent PR.
- `/agent pause` / `/agent resume` — pause or resume issue-level work.
- `/agent pause repo` / `/agent resume repo` — pause or resume the whole repo.
- `/agent status` — show issue agent state.
- `/agent retry` — rerun failed infrastructure jobs without a fresh develop pass.
- `/agent cancel` — cancel active workflow runs and revoke active proxy runs.
- `/agent decide <decision>` / `/agent answer <answer>` — resolve a `human-required` / `needs-info` item:
  records your decision/answer and clears the block so the PM re-triages and resumes (the human seam's `out`).

## Security

open-autonomy runs semi-untrusted agents and operates a model-token/funding proxy. See
[`SECURITY.md`](./SECURITY.md) for the trust model and **private** vulnerability reporting. Provided
AS-IS (Apache-2.0, no warranty) — if you deploy it, you own the secrets, spend, and access you grant.

## Why a funding platform lives here

`services/agent-model-proxy` is what makes autonomous runs safe and affordable: it mints bounded,
revocable model tokens so untrusted agent jobs get model access without raw provider keys, and meters
spend against a sponsor-funded budget. It is infrastructure for the agent loop, not a separate product.

## Commercial boundary

`open-autonomy` is the OSS implementation. `volter-autonomy` can build on it as a paid hosted product
with managed proxy infrastructure, dashboards, org policy, and support.

## License

Apache-2.0.
