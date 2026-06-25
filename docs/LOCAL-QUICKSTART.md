# Local quickstart — run the loop on your own machine

This is the step-by-step for adopting open-autonomy on the **local** substrate: the autonomous
loop runs on *your* machine against a repo on disk, with **no GitHub, no GitHub Actions, and no
hosted model proxy**. This is the path for a **closed-source** project you don't want to push to
GitHub.

How local differs from the GitHub substrate:

- Work runs in local terminal sessions (via [termfleet](https://github.com/volter-ai/termfleet)),
  not GitHub Actions jobs.
- Agents use **your own logged-in coding CLI** (Claude Code or Codex) for model access — there is
  no bounded-token proxy and no sponsor budget. **You pay your model provider directly.**
- Work items come from a **local tracker on disk** (e.g. [ztrack](https://github.com/volter-ai/ztrack)),
  not GitHub issues.

If you just want to *see the loop fire* with zero tracker setup, use the `hello` profile (a single
cron agent). For a real software-delivery loop (PM → draft → develop → review), use `simple-sdlc`.

---

## 1. Prerequisites

Install these once, on the machine that will run the loop:

| What | Why | Install |
|---|---|---|
| **Node.js 20+** | runs the CLI, the loop driver, and termfleet | nodejs.org / your version manager |
| **tmux** | termfleet's local provider runs sessions in tmux | `brew install tmux` (macOS) / your package manager |
| **termfleet** | the local runner drives it through its **SDK** (a `node_modules` dependency, not a PATH binary) | in your repo: `npm install termfleet` (then `npx termfleet …` runs its console/provider CLI) |
| **A coding agent CLI, logged in** | the agent's model access | Claude Code (default) **or** Codex — see next step |
| **bun** (for `simple-sdlc`) | the orchestrator dispatches workers via `bun scripts/runner.ts launch …` | `curl -fsSL https://bun.sh/install \| bash` — not needed for the `hello` demo (Node-only) |

### Sign in to your coding agent

The loop launches **Claude Code** by default. termfleet drives whatever CLI you point it at, and
that CLI must already be **installed on PATH and signed in** — the launch fails after ~45s against a
missing or logged-out CLI. So sign in *first*:

- **Claude Code (default):** run `claude`, then `/login` (or set `ANTHROPIC_API_KEY`). Verify with
  `claude --version`.
- **Codex (alternative):** run `codex login`. To use Codex instead of Claude, set
  `TERMFLEET_AGENT=codex` when you start the loop (step 4).

There is no separate "open-autonomy login" — the agent uses your coding CLI's own session, so your
local subscription/key is what's billed.

---

## 2. Start termfleet (console + a local provider)

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
> registry — fine for a single closed-source machine. See termfleet's `SECURITY.md` before exposing it.

---

## 3. Compile a profile into your repo

From inside the repo you want the loop to maintain:

```bash
cd my-closed-source-repo

# Option A — minimal demo: one cron "greeter" agent, no tracker needed.
npx open-autonomy compile hello local .

# Option B — a real four-agent SDLC loop (PM / draft / develop / review).
npx open-autonomy compile simple-sdlc local .
```

This lays down `scheduler/` (the loop driver + schedule), `scripts/` (the local runner), and the
agent skills under `.claude/skills/` and `.codex/skills/`. No clone of this repo is required —
`npx open-autonomy …` runs the published CLI. (`self-driving` is GitHub-only; on local use `hello`
or `simple-sdlc`, or your own profile dir.)

---

## 4. Run the loop

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

---

## 5. Give the loop work (`simple-sdlc`)

The `hello` greeter self-fires on cron and needs no input. A real loop needs a backlog. The
`simple-sdlc` agents read work from a local **ztrack** tracker on disk (no GitHub):

```bash
npm install -g ztrack                      # the tracker simple-sdlc's agents use
ztrack init --preset simple-sdlc           # the PR-free dev preset (the `default`); no remote needed
ztrack issue create                        # add a work item (repeat for each task)
```

The `simple-sdlc` ztrack preset is **PR-free**: an issue is `done` once every AC is passed with
commit-evidence and the reviewer approves — no pull request, so it works on a private repo with no
remote. On its next tick the PM sweeps the ztrack board, enforces WIP, and **launches** the matching
worker (draft/develop/review) for the next eligible issue, moving it `draft → ready → in-progress →
in-review → done`. The work item reaches each worker as `$ZTRACK_ISSUE`. You add and inspect work
entirely through `ztrack` — `ztrack issue view <id>`, `ztrack check` — never through GitHub.

> Using a different tracker? `simple-sdlc`'s agents are just skills that call `ztrack`. To use your
> own tooling, fork the profile (`profiles/simple-sdlc/skills/*`) and point the agents at your CLI,
> then compile your profile dir: `npx open-autonomy compile ./my-profile local .`.

---

## What's GitHub-only (not available locally)

The local substrate runs the same agent loop, but a few controls in the README are GitHub-specific:

- **`/agent` operator commands** (pause/resume/status/retry/cancel via issue comments) are a GitHub
  control plane. Locally you steer the fleet with termfleet directly — `termfleet sessions recent`,
  `termfleet <agent> get|wait`, kill a session from the console — and by editing the tracker board.
- **The bounded model-token proxy + sponsor budget** is GitHub-only. Locally there is no spend cap
  from open-autonomy; your model provider bills you for whatever the agents consume. Watch
  `termfleet sessions recent --live` and stop the loop (`Ctrl-C` / kill the agents) to bound spend.
- **CI + independent reviewer status checks → native auto-merge** is the GitHub merge boundary.
  Locally there is no auto-merge; the `review` agent gates a change in the tracker, and you decide
  what to do with the agent's branch/commits.

---

## Troubleshooting

- **`createAgentWindow returned no terminalId …`** — the console/provider (step 2) aren't running, or your
  agent CLI isn't installed/logged in (step 1). Re-run the `npx termfleet claude new --prompt "hi"`
  sanity check in isolation.
- **The loop does nothing each tick (`simple-sdlc`)** — there's no eligible work. Confirm
  `ztrack issue view` shows items and that they're in a state the PM can advance.
- **Wrong agent launches** — set `TERMFLEET_AGENT=claude` or `=codex` explicitly; the default is
  `claude`.
- **Pin a specific provider** — if auto-discovery picks the wrong one, set `TERMFLEET_PROVIDER_URL`
  to your provider's URL before running the loop.
