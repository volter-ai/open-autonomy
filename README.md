# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://volter-agent-model-proxy.aaron-0ed.workers.dev/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)

`open-autonomy` makes a repository drive its own maintenance work: issues become reviewed,
gated, merged pull requests, produced by bounded AI agents under **deterministic guardrails**.
It is **substrate-agnostic** — the same setup compiles onto **GitHub Actions** or onto a **local**
machine loop. The repo also runs open-autonomy against itself (it's its own first user).

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

An agent only *proposes* changes; **deterministic gates** (the publisher and the merge gate) decide
whether they are published, reviewed, and merged. The agent runs untrusted, gets bounded model
access (no raw keys), and can only emit a proposed change — never push directly.

Read [`docs/AUTONOMY-IR.md`](./docs/AUTONOMY-IR.md) for the full model and conformance contract, and
[`docs/PROJECT-LAYOUT.md`](./docs/PROJECT-LAYOUT.md) for the vocabulary and layout.

## What it does (the GitHub substrate)

```text
issue or PM sweep -> /agent develop -> policy + triage
  -> bounded Codex run through the model proxy
  -> trusted publisher opens/updates a PR
  -> CI + reviewer -> deterministic merge gate
  -> merge, or human-required escalation
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

- `scripts/` — the github runtime: PM / triage / policy / dispatch / review / CI / merge-gate / control, the Codex runner, the publisher bundle, and the strategy loop.
- `services/agent-model-proxy/` — a Cloudflare Worker that mints bounded, revocable model tokens (no raw keys) and meters spend against a sponsor-funded budget ledger.
- `.open-autonomy/`, `.codex/skills/`, `.github/workflows/` — this repo's own installation (the dogfood).

**Recipes & demos:**

- `profiles/` — profiles (recipes) that compile to any substrate: `hello` (minimal) and
  `self-driving` (open-autonomy's own self-driving setup; the single source of every github installation).
- `examples/` — demo target repos the loop drives (`docs-only`, `library`, `small-app`, `testbed`).

Docs: [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (the github app's design + trust boundaries),
[`AUTONOMY-IR.md`](./docs/AUTONOMY-IR.md) (the substrate-agnostic model),
[`PROJECT-LAYOUT.md`](./docs/PROJECT-LAYOUT.md) (vocabulary + layout),
[`ROADMAP.md`](./docs/ROADMAP.md).

## Quickstart

```bash
bun install
bun run check                  # typecheck + conformance + tests (proxy + runtime + examples)
bun run autonomy conformance exec   # check the Runner contract on the reference runner
```

## The `open-autonomy` CLI

One command is the front door — `open-autonomy <verb>` (alias `oa`):

```bash
open-autonomy compile <profileDir> <local|github> [outDir]   # compile a profile onto a substrate
open-autonomy conformance <exec|termfleet|github>            # run the substrate conformance battery
open-autonomy upgrade --profile <dir> --target <dir> [--apply]   # re-compile an installation in place
```

No clone required once published — `npx open-autonomy <verb>` (or `bunx open-autonomy <verb>`). The
published package is a self-contained Node bundle, so plain Node works; bun is not required to *use* it.
From a clone (bun-native, runs TypeScript directly): `bun run autonomy <verb>` or
`bun bin/open-autonomy.ts <verb>`. The published bundle is produced by `bun run build`.

To adopt into your own repo, scaffold an installation by compiling a profile, then follow
[`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md):

```bash
open-autonomy compile profiles/self-driving github ../my-repo   # GitHub substrate
open-autonomy compile profiles/simple-sdlc local ../my-repo     # local-loop substrate
```

## Operator commands

- `/agent develop` — ask the agent to work on an issue.
- `/agent review` — run the reviewer on an agent PR.
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
