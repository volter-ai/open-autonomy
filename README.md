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

Read [`docs/AUTONOMY-IR.md`](./docs/AUTONOMY-IR.md) for the full model and conformance contract, and
[`docs/PROJECT-LAYOUT.md`](./docs/PROJECT-LAYOUT.md) for the vocabulary and layout.

## Run it on your repo

Same profile, two substrates. Pick by **where you want the agents to run** — install with one
`npx` command (no clone required):

### GitHub Actions — public or team repos

Agents run as GitHub Actions jobs; CI + an independent reviewer gate **native auto-merge**; you steer
with `/agent` issue comments. Model access is bounded by a hosted token proxy. Best when your repo
already lives on GitHub.

```bash
cd my-repo
npx open-autonomy compile self-driving github .
```

Then wire it up with [`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md)
(repo variables/secrets, the model proxy, branch protection).

### Local — closed-source, on your machine

**No GitHub, no Actions, no hosted proxy.** Agents run as local terminal sessions via
[termfleet](https://github.com/volter-ai/termfleet), using *your own* logged-in Claude Code (or
Codex) CLI — so your model provider bills you directly. Work comes from a local tracker on disk, not
GitHub issues. Best for a private/closed-source repo.

```bash
cd my-repo
npx open-autonomy compile simple-sdlc local .   # or `hello` for a zero-tracker demo
node scheduler/run.mjs                           # after termfleet + CLI sign-in (see the guide)
```

Full step-by-step (termfleet console/provider, agent sign-in, feeding the loop work) →
[**`docs/LOCAL-QUICKSTART.md`**](./docs/LOCAL-QUICKSTART.md).

> `self-driving` (open-autonomy's own recipe) is GitHub-only; on local use `simple-sdlc`, `hello`,
> or your own profile dir. See [the CLI](#the-open-autonomy-cli) for all verbs and options.

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

Docs: [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (the github app's design + trust boundaries),
[`AUTONOMY-IR.md`](./docs/AUTONOMY-IR.md) (the substrate-agnostic model),
[`PROJECT-LAYOUT.md`](./docs/PROJECT-LAYOUT.md) (vocabulary + layout),
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
[**Run it on your repo**](#run-it-on-your-repo) for the GitHub vs local fork and the follow-up guides
([`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md) for GitHub,
[`LOCAL-QUICKSTART.md`](./docs/LOCAL-QUICKSTART.md) for local). From a clone, a profile *path* also
works: `open-autonomy compile profiles/self-driving github ../my-repo`.

## Operator commands

These are the **GitHub substrate's** control plane (issue comments). Running local? You steer the
fleet with termfleet directly and the tracker board instead — see
[`docs/LOCAL-QUICKSTART.md`](./docs/LOCAL-QUICKSTART.md).

Operator commands work only for maintainers (repo OWNER/MEMBER/COLLABORATOR); a comment from anyone
else is ignored. To launch an agent by comment, name it: `/agent <agent>` (the workflow name).

- `/agent developer` — ask the developer to work on the issue.
- `/agent reviewer` — run the reviewer on an agent PR.
- `/agent pause` / `/agent resume` — pause or resume issue-level work.
- `/agent pause repo` / `/agent resume repo` — pause or resume the whole repo.
- `/agent status` — show issue agent state.
- `/agent retry` — rerun failed infrastructure jobs without a fresh develop pass.
- `/agent cancel` — cancel active workflow runs and revoke active proxy runs.

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

<!-- ha workflow_dispatch test -->
