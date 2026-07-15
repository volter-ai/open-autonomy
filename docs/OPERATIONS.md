# Operating Open Autonomy

> Documentation for **open-autonomy v0.4** — the doc-version marker (machine-checked by
> `bun run check:release-consistency`). npm `0.4.0`/`0.4.1` are known-broken on `compile` (OA-01/F-1);
> install `0.4.2+` once published. Older docs: read them at their version tag, e.g. `blob/v0.4.0/`.

> **The operator/maintainer how-to doc.**
>
> 1. [Install & operate](#install--operate) — the model: **runner ⟂ code host**, and the three setups.
> 2. [Local install checklist](#local-install-checklist) — the **canonical, ordered** path to run the
>    agents on your own machine (against *either* code host: a local-git board, or auto-merging PRs on
>    GitHub). `README.md` and `docs/INSTALL-AGENT.md` link into this checklist rather than duplicate it.
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
  the hosted/scoped-token runner; see the local safety note in step 6) or **local-git** (a tracker board on
  disk, PR-free — no GitHub at all).

A profile declares which combinations it supports (`targets` × `codeHost`). The three setups people use:

| Setup | Runner | Code host | Profile | Read |
|---|---|---|---|---|
| **Hosted** | GitHub Actions | GitHub | `self-driving` (new/dedicated repo) · `simple-gh-sdlc` (your existing repo) | [GitHub production rollout](#github-production-rollout) |
| **Local agents → GitHub PRs** | local | GitHub | `simple-gh-sdlc` | [Local install checklist](#local-install-checklist) → *GitHub code host* |
| **Fully local** | local | local-git | `simple-sdlc` (or `hello`) | [Local install checklist](#local-install-checklist) → *local-git code host* |

The **runner steps are identical** for both local setups (prereqs → termfleet → compile → commit → run the
loop); only **how you feed it work and how a change lands** differ by code host. That split is exactly
steps 1–5 (shared) vs step 6 (per code host) below.

> Installing onto an **existing** repo is an *overlay*: `simple-gh-sdlc` / `simple-sdlc` / `hello` ship
> only OA-specific files (`scripts/`, `.claude/skills/`, `.claude/settings.json`, `scheduler/`,
> `.open-autonomy/`, `standards/`, `.github/workflows/merge.yml`), so `compile … .` is purely additive — it
> does **not** generate a `package.json`, `README`, or `.gitignore` over yours. You still merge the runner's
> deps into your repo (`npm install termfleet` in step 1; `npm install -D ztrack@1.0.0` in step 6 — pin the
> version this open-autonomy release is tested against); npm may rewrite **existing** dependency ranges
> while doing so — review the diff it leaves. The OA files are
> **committed** to the repo (the agents run in git worktrees, which only see committed files — it's how OA
> maintains itself) — see quickstart [step 4, "Commit the harness"](#4-commit-the-harness).
> `.claude/settings.json` wires a Claude Code Stop hook that runs in **every** Claude Code session in this
> repo, including your own interactive ones — see [step 3's callout](#claude-settings) before you compile.
>
> **`self-driving` is the opposite: a whole-repo SCAFFOLD**, not an overlay — it carries
> README.md/package.json/.gitignore/CHANGELOG.md as resources (this repo's own dogfood setup). It's for a
> **new or dedicated** repo, not an adopt-in-place onto something you already have: compiling it into a
> directory with existing, DIFFERENT copies of those files **refuses** with a clear error listing them
> (`--force` to overwrite anyway). Adopting into an existing repo → use `simple-gh-sdlc` above instead.
>
> **Letting an agent do the install?** Point it at [`docs/INSTALL-AGENT.md`](./INSTALL-AGENT.md) — a
> guided detect → ask → execute → verify playbook addressed to the installing agent.

---

<a id="local-runner-quickstart"></a>
## Local install checklist

> **The canonical, ordered path — start here, follow it top to bottom.** Every load-bearing fact for a
> local install (deps, ports/pin, the commit step, the tracker, the stop-conditions, the teardown) has
> exactly one home in this checklist; `README.md` and `docs/INSTALL-AGENT.md` link into specific steps
> below rather than repeating them. Read [Stop-conditions before you start](#stop-conditions-before-you-start)
> first — each one is a reason to stop, not to proceed.

> **`oa install` now automates most of this checklist end-to-end for local-substrate profiles**
> (`simple-sdlc`, `hello`, `simple-gh-sdlc`/`self-driving` on `local`). This is exactly what's automated,
> read from `bin/install.ts` + `bin/install-execute.ts` + `bin/install-handoff.ts` directly, not assumed:
>
> - **Automated for real:** installing the `ztrack`/`termfleet` deps (step 1's npm installs — not the
>   sign-in/`gh auth`/tmux prereqs, see below), compiling the profile (step 3), committing the harness
>   (step 4, `checkUncommittedHarness`-verified both before and after), and bringing up the local termfleet
>   provider (step 2's port/pin, `bringUpProvider`, reused verbatim).
> - **Automated for real, GitHub code host only (either substrate — `simple-gh-sdlc` on `local` counts, not
>   just `gh-actions`), and only given `--owner-repo`:** CI-scaffold + **branch-protection provisioning**
>   (step 6b — `scripts/provision-target-repo.ts`), independently re-verified against GitHub's *live*
>   protection state (the exact hard signal `oa maturity` uses for M3) — a present:false verdict of any
>   kind is a named blocker, never a silent pass. Also dispatches the profile's planner once to seed the
>   board with **draft** items only (never `ready`).
> - **Go-live is split, not uniformly construct-only:** once G4a's readiness check confirms you already
>   promoted a board item to `ready`, `oa resume` (local) — a single safe, reversible fence-removal, no
>   process spawn — **is performed automatically, for real**. Only `oa start` (local) or, for hosted, the
>   `PUBLIC_AGENT_REPO_PAUSED` clear — the halves that would actually launch/unblock a real agent session —
>   stay **constructed, never executed**: G4a prints the exact command for **you** to run — the same human
>   act step 6 below already requires ("watch the first PR merge under supervision" before arming anything).
> - **NOT automated — still exactly the manual steps below:** `npx ztrack init --sync github --repo
>   <owner>/<repo>` (step 6a — the compile step only *prints* this as a next-step suggestion, for either
>   manual `compile` or `oa install`'s own compile step; neither runs it); opening an actual
>   `ready`-labeled issue (step 6c — by design: EXECUTE only ever seeds drafts, promoting the first item to
>   ready IS the G4a human act); **arming native auto-merge** (`gh repo edit --enable-auto-merge`, step 6d)
>   — `oa install` provisions branch protection + the required CI checks automatically (previous bullet),
>   but does **not** arm native auto-merge: that stays a deliberate, separate, manual step, run only after
>   a supervised first merge, exactly as step 6d above describes. Verified against
>   `scripts/provision-target-repo.ts`'s `armAutoMerge` option (off by default, TE.10) and
>   `bin/install-execute.ts`'s `stepCiAndProvision` (the real EXECUTE call site), which never passes
>   `--arm-auto-merge`; and every
>   [GitHub production rollout](#github-production-rollout) repo variable/secret plus the model-proxy
>   Worker deployment itself (`oa install`'s G3 only *records* your deploy-own-vs-get-allowlisted decision,
>   it never runs `wrangler deploy` or touches a repo variable/secret).
> - **Phase-0 prerequisites (step 1's sign-in, `gh auth`, tmux/node/git on PATH) are read, never
>   installed** — DETECT reports `gh auth status` and coding-CLI sign-in state so a blocked gate names the
>   fix, but `oa install` doesn't run `gh auth login` or install tmux for you.
> - **Source-checkout only today:** `bun bin/install.ts <repoDir> [options]` from a clone of this repo —
>   the *published* `npx open-autonomy install` / `oa install` looks for `bin/install.ts` in the current
>   working directory (i.e. you must run it from inside a source checkout of this repo), finds nothing in
>   the npm tarball, and exits 1 with an explicit "clone the repo" message (verified live) rather than
>   silently doing less than advertised.
>
> `bun bin/install.ts --help` lists every gate-answer flag. Keep reading — this checklist is still the
> canonical phase-by-phase reference for what each step means and why, and the only path for a plain `npx`
> no-clone install today.

Run the **agents on your own machine** — as local terminal sessions via
[termfleet](https://www.npmjs.com/package/termfleet), using *your own* logged-in coding CLI (Claude Code
or Codex) for model access (no bounded-token proxy, no sponsor budget — **you pay your model provider
directly**). This is the **local runner**. It works against **either code host**:

- **local-git** (`simple-sdlc`) — fully closed-source: work comes from a local
  [ztrack](https://github.com/volter-ai/ztrack) board on disk, a change is `done` PR-free, **no GitHub at
  all**. The path for a private project you won't push.
- **GitHub** (`simple-gh-sdlc`) — agents run on your machine, but a change lands as an **auto-merging PR
  on GitHub** gated by `ci` + an `agent-review` status (on local the agents share your token, so that
  status is *not* an independent reviewer — your CI is the real gate; see step 6's safety note). The path
  for a trusted repo whose agents you want on your own machine and model subscription.

**Steps 1–5 (prereqs → termfleet → compile → commit → run) are identical** for both; only **step 6 — how
you feed work and how a change lands** — differs by code host. If you just want to *see the loop fire*
with zero tracker setup, use the `hello` profile (a single cron agent).

### Stop-conditions before you start

Check these **before step 1** — each is a reason to stop and resolve first, not to proceed:

- **No `package.json` in the target repo.** The runner needs JS deps (`termfleet`, `ztrack`); a repo with
  no `package.json` (e.g. a pure Go/Python/Rust repo) can't host it as-is.
- **A shared or lived-in box.** A termfleet provider can launch terminal sessions **as your user,
  box-wide** — before you start your own (step 2), check whether one is already running (step 1's
  `preflight`, step 2's `/healthz` probe), and always pin `TERMFLEET_PROVIDER_URL` (step 2, "Pin the
  provider").
- **A public repo.** Anyone who can open an issue or comment can put text in front of the agents — a
  prompt injection runs with your own token (push, secrets, PRs). Don't install onto a public repo where
  outside contributors can reach the agents unless issue/comment authorship is restricted to maintainers,
  or you run the scoped-token **hosted** substrate instead (see [Install & operate](#install--operate)).
- **GitHub code host, no CI that runs on PRs.** On the local runner the agents share your token, so
  `agent-review` alone is **not** an independent gate — with no real CI in the required-checks list you'd
  be auto-merging on the agents' own say-so. Add a real CI check that runs on pull requests first, or
  don't enable auto-merge (step 6's GitHub-flavor gate).
- **Not a repo admin, or a private repo on a free plan.** Classic branch protection (step 6's GitHub
  flavor) needs `administration:write`; a free private plan's API rejects the protection `PUT`. Have an
  org owner set it up, use GitHub rulesets, or upgrade the plan.

### 1. Prerequisites

Install these once, on the machine that will run the loop:

| What | Why | Install |
|---|---|---|
| **Node.js 22.18+** | runs the CLI, the loop driver, and termfleet; the installed ztrack `.mts` preset needs TS type-stripping (Node ≥ 22.18) | nodejs.org / your version manager |
| **tmux** | termfleet's local provider runs sessions in tmux | `brew install tmux` (macOS) / your package manager |
| **termfleet** | the local runner drives it through its **SDK** (a `node_modules` dependency, not a PATH binary) | in your repo: `npm install termfleet` (then `npx termfleet …` runs its console/provider CLI) |
| **A coding agent CLI, logged in** | the agent's model access | Claude Code (default) **or** Codex — see next step |
| **bun** (for `simple-sdlc`) | the orchestrator dispatches workers via `bun scripts/runner.ts launch …` | `curl -fsSL https://bun.sh/install \| bash` — not needed for the `hello` demo (Node-only) |
| **gh** (for the GitHub code host) | `simple-gh-sdlc`'s agents and the merge reconcile shell out to the GitHub CLI (step 6's `gh api` / `gh pr` calls) | `brew install gh`, then `gh auth login` — not needed for `hello` / `simple-sdlc` |

Right after installing `termfleet`, run the **`preflight`** CLI verb once — it verifies termfleet's PTY
native module loads under your Node (rebuilding only if needed; termfleet's `virtual-tmux` provider would
otherwise crash at launch) and checks your `package-lock.json` against your CI's Node version (desync there
passes locally but fails your CI's `npm ci` on the first agent PR):

```bash
npm install termfleet  &&  npx --yes open-autonomy preflight
```

> **`npm install termfleet` can rewrite EXISTING dependency ranges, not just add the new one.** npm
> re-resolves the whole tree when adding a dep, and may re-save ranges for pre-existing direct deps it
> re-places (tree-shape/npm-version dependent — e.g. an existing `@termfleet/core` range was bumped
> `^0.2.0`→`^0.2.1` in one observed install). Review `git diff package.json package-lock.json` before you
> commit (step 4, "Commit the harness") — don't let an unreviewed range bump ride into the "install open-autonomy" commit.

> **npm workspaces / package-name collisions.** If your repo uses **npm workspaces** (a root `package.json`
> with a `workspaces` field), check that neither the repo root nor any workspace member is named
> `termfleet`, `@termfleet/core`, `ztrack`, `open-autonomy`, or anything in termfleet's own dependency tree
> (e.g. `ws`) — npm workspaces symlink `node_modules/<name>` to that member's own source, silently
> **shadowing** the published package the runner needs (there is no supported way to prefer the registry
> copy over a workspace link — `--install-links` only helps `file:` deps). Naming your **root** package
> `termfleet` is worse: Node's ESM self-reference resolution can bind the runner's bare `import 'termfleet'`
> to your own repo instead of the installed one, even with a genuine copy sitting in `node_modules/`.
> `preflight` (above) and `open-autonomy compile` both detect every form of this — self-reference, a
> colliding workspace member, and any workspace member shadowing a *transitive* dependency of termfleet's —
> and refuse loudly, naming the exact package and the fix, before anything breaks several process-hops deep.
> See `docs/adoption-fixes/OA-04-workspace-name-collision-detection.md` for the failure modes this guards
> against.

#### Sign in to your coding agent

The loop launches **Claude Code** by default. termfleet drives whatever CLI you point it at, and
that CLI must already be **installed on PATH and signed in** — the launch fails after ~45s against a
missing or logged-out CLI. So sign in *first*:

- **Claude Code (default):** run `claude`, then `/login` (or set `ANTHROPIC_API_KEY`). **Verify with a
  real sign-in probe — never the bare `--version` flag**, which prints the installed binary's version and
  exits `0` identically whether you're signed in or not (it performs no credential read, no API call).
  Instead check the CLI's own auth-status introspection (free, offline, no model call) and honor the
  API-key alternative:
  ```bash
  claude auth status --json | grep -Eq '"loggedIn"[[:space:]]*:[[:space:]]*true' || test -n "$ANTHROPIC_API_KEY" \
    || echo "NOT signed in — run: claude /login"
  ```
  Parse the `loggedIn` JSON field, not the exit code — the signed-out exit code isn't a stable contract
  across CLI versions, but the field is. (The `-E` whitespace-tolerant pattern also matches compact JSON,
  where the CLI may print `"loggedIn":true` with no space.)
- **Codex (alternative):** run `codex login`. To use Codex instead of Claude, set
  `TERMFLEET_AGENT=codex` when you start the loop (step 5). Verify sign-in with the codex analogue of the
  probe above:
  ```bash
  codex login status || echo "NOT signed in — run: codex login"
  ```
  (`codex login status`'s exact exit/output contract was not independently verified against a pinned codex
  CLI for this check — if your installed codex CLI reports differently, confirm with `codex login --help`.)

There is no separate "open-autonomy login" — the agent uses your coding CLI's own session, so your
local subscription/key is what's billed.

### 2. Start termfleet (console + a local provider)

The local runner (the termfleet SDK's `ProviderClient`) talks to a termfleet **console** + **provider**
running on your machine. **termfleet already runs as machine-wide infrastructure on many dev boxes** — the
box's own provider may already hold the doc-default ports, and a second `serve` on a bound port fails
*silently* behind `&`. Check first, and use a **repo-unique prefix + a free port pair**, never the box
defaults:

```bash
# pick a repo-unique prefix and a free port pair — NOT the box defaults 7373/7402
TF_PREFIX="$(basename "$PWD")-oa"; TF_CONSOLE=7573; TF_PROVIDER=7602
npx termfleet console serve --name "$TF_PREFIX" --port "$TF_CONSOLE" &
npx termfleet provider serve --kind virtual-tmux --prefix "$TF_PREFIX" --count 1 --port "$TF_PROVIDER" &
export TERMFLEET_PROVIDER_URL="http://127.0.0.1:$TF_PROVIDER"   # pin it — see "Pin the provider" below
```

**Is a port really free?** Probe `/healthz` and read the BODY SHAPE — never the root path:

```bash
curl -sS "http://127.0.0.1:$TF_PROVIDER/healthz"
```

- `{"ok":true,"provider":"<kind>",...}` → an existing termfleet **provider** already holds that port.
- `{"ok":true,"service":"console"}` → an existing termfleet **console** already holds it.
- *any other* HTTP answer (including a plain 404 on `/`) → **something else** is occupying it.
- only a **connection refused** means free.

`curl -fsS http://127.0.0.1:$PORT/` (the `-f` + root-path form) **cannot** tell these apart: `-f` treats a
provider's 404-on-`/` as failure too, so it reads an *occupied* port as *free* and a second `serve` on the
same port then fails silently behind `&`. `npx --yes open-autonomy preflight` (step 1) runs this
classification for you automatically, naming whatever it finds (kind + instance, or the occupying
pid/command).

Sanity-check that a session can launch (this is the same call the loop makes):

```bash
npx termfleet claude new -y --prompt "say hello"
# -y auto-approves the panel-review prompt that fires once any panel already exists
# (true after your very first launch, and always true on a shared provider)
```

`termfleet sessions recent` is **user-global** — it lists every project's sessions on this box (it reads
the coding harness's own `~/.claude/projects` transcript index), not just yours. Filter to what you
started, and use `--live` for the real-time view:

```bash
npx termfleet sessions recent --live --prefix "$TF_PREFIX"
```

Open `http://127.0.0.1:7573` (or whichever `$TF_CONSOLE` port you chose) for the optional visual console.

#### Pin the provider

`TERMFLEET_PROVIDER_URL` is not just a tiebreaker for an ambiguous auto-discovery — on a **shared or
lived-in box it is required**. A termfleet provider can launch terminal sessions **as your user, box-wide**;
an unpinned loop resolves its provider through a chain that can silently pick up someone else's: `--url`
flag → `TERMFLEET_PROVIDER_URL` → a machine-global `termfleet use` context in `~/.termfleet/current.json`
(set by **any** project on the box) → zero-config auto-discovery over every advertised local provider
(`~/.termfleet/providers/*.json`). Export the pin as above, or make it **durable** — survives new shells,
supervisors, and re-runs — by compiling it into the schedule:

```bash
npx open-autonomy compile simple-sdlc local . --provider-url "$TERMFLEET_PROVIDER_URL"
```

This writes the pin into `scheduler/schedule.json`'s `env`, so every tick (and every session it launches)
carries it. An ambient `TERMFLEET_PROVIDER_URL` still **overrides** the compiled pin at runtime (the
documented TERMFLEET_* override doctrine, unchanged) — and both the loop driver and the runner backend
print one line naming the **effective provider URL and its source** (`env` / `schedule` / `current-context`
/ `auto-local`) on the first tick, so a misattachment is visible immediately instead of silent.

> termfleet is loopback-only by default and makes no outbound requests unless you configure a
> registry — fine for a single closed-source machine. Keep the console/provider ports bound to loopback:
> anyone who can reach the provider can launch terminal sessions **as your user**, so never bind or
> port-forward them to a non-local interface.

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

# Human-supervised GitHub loop — Manager executes, Planner grows product work, Kaizen studies process.
npx open-autonomy compile simple-gh local .
```

This is an **overlay**: it lays down `scheduler/` (the loop driver + schedule), `scripts/` (the local
runner), the agent skills under `.claude/skills/` + `.codex/skills/`, `.claude/settings.json` (see the
callout just below), `standards/`, and `.open-autonomy/` — and, for the GitHub code host,
`.github/workflows/merge.yml` (the auto-merge reconcile). It generates **no** `package.json` / `README` /
`.gitignore`, so it's safe to run over an existing repo. No clone of this repo is required — `npx
open-autonomy …` runs the published CLI. (`self-driving` also compiles to `local`; `simple-sdlc` is
local-git only.)

For a local installation that needs independent fences or retry timing, keep the substrate-owned data
in a separate JSON file rather than adding scheduler fields to profile policy. Example
`.open-autonomy/local-schedule-config.json`:

```json
{
  "schema": "open-autonomy.local-schedule-config.v1",
  "defaults": { "fence": ".open-autonomy/paused", "retrySeconds": 300 },
  "agents": {
    "planner": { "fence": ".open-autonomy/audits-paused", "retrySeconds": 3600 },
    "kaizen": { "fence": ".open-autonomy/audits-paused", "retrySeconds": 3600 }
  }
}
```

Compile it with:

```bash
npx open-autonomy compile simple-gh local . \
  --local-schedule-config .open-autonomy/local-schedule-config.json
```

The compiler rejects unknown agents, unsafe fence paths, unknown keys, and invalid retry values. The
configuration affects only generic local jobs. It cannot declare task eligibility, publication policy,
review methodology, or role behavior. Every job remains fenced; omitted values retain the conservative
`.open-autonomy/paused` default.

If any of these paths **already exist and differ**, the compile refuses by name instead of silently
overwriting (`--force` to override) — except `.claude/settings.json`, handled specially next.

<a id="claude-settings"></a>
> **`.claude/settings.json` — a Claude Code Stop hook that runs in every session, including yours.**
> `simple-sdlc` and `simple-gh-sdlc` both carry this file: it wires a `hooks.Stop` command (the ztrack
> "drive-to-green" loop gate) that Claude Code runs at the end of **every session in this repo — agent
> *and* human interactive sessions alike** (Claude Code project settings aren't scoped to the loop's own
> sessions). The command self-guards — it no-ops unless `node_modules/ztrack/plugins/ztrack/hooks/
> stop-loop.sh` exists — so it's inert until you install ztrack, but it fires every time either way.
>
> - **If you already have a `.claude/settings.json`** (most repos with Claude Code do): the compile does a
>   **structured merge**, not a clobber — it parses both files as JSON and appends the Stop hook entry onto
>   your existing `hooks.Stop` array (only if an identical command isn't already there); every other key
>   (your `permissions`, other hook events, …) is left untouched. The printed receipt reports
>   `merged: .claude/settings.json (+1 Stop hook)`. Re-running never duplicates the entry. If your existing
>   file **isn't valid JSON**, the compile refuses by name instead of guessing — fix or move it aside, then
>   re-run.
> - **The Stop hook is install-managed.** Simply deleting the `hooks.Stop` entry — or the whole file — is
>   **not** a durable opt-out: the next `compile` re-appends the entry (append-if-absent), and `upgrade`
>   re-seeds a deleted file. That is deliberate (it's how hook fixes reach every install), but it means a
>   naive delete gets silently re-armed on the next routine re-compile/upgrade.
> - **To opt out durably**, keep `.claude/settings.json` and add the sentinel key
>   `"_openAutonomyStopHookOptOut": true` at its top level (you may also remove the `hooks.Stop` entry). Both
>   `compile` and `upgrade` honor it — they will **never** re-add OA's Stop hook while the sentinel is
>   present, and they leave the rest of your file untouched. This is the one opt-out that survives every
>   re-compile and upgrade. (Claude Code ignores the unknown key, so it has no other effect.)
> - `simple-gh-sdlc` ships the **same** file (byte-identical hook command) — the callout applies to both
>   the local-git and GitHub code-host setups.

### 4. Commit the harness

The agents run in **git worktrees, which only see committed files** — an uncommitted harness produces
workers that die at launch with `Unknown command: /develop`. Commit everything the compile wrote before
the first tick:

```bash
git add scripts/ scheduler/ .claude/ .codex/ .open-autonomy/ standards/
git commit -m "Install the open-autonomy harness"
```

The list above is the `simple-sdlc` footprint — the exact set **varies by profile** (`hello`, for example,
emits no `standards/`, and a pathspec matching nothing makes `git add` fail without committing anything).
The compile prints the correct command for *your* profile in its next-steps output, and the authoritative
list of what it wrote is `.open-autonomy/generated.json` — this form is always correct:

```bash
git add $(node -p "JSON.parse(require('fs').readFileSync('.open-autonomy/generated.json','utf8')).files.join(' ')")
```

If any harness path is matched by your `.gitignore`, plain `git add` refuses it — use `git add -f` for
those paths (or un-ignore them): a gitignored harness file stays untracked, so worktrees won't contain it
either, and the loop refuses to start until every harness file is committed. Note `.claude/settings.json`
is part of the harness (the ztrack drive-to-green Stop hook) and is included above. Re-run this step after
every re-compile/upgrade. **No push is required:** on the local-git code host, worktrees base on your
**local** trunk — committing locally is sufficient. GitHub code host installs (`simple-gh-sdlc`)
additionally push as part of their normal PR flow.

For a GitHub code-host install, do not start the scheduler from an unmerged feature branch. Fresh
isolated workspaces intentionally base on the remote default branch, because that is the reviewed
deployment state. Merge and push the harness there first. The Runner compares an anonymous isolated
launch's skill with the control checkout and refuses before model spend when their contents differ; this
prevents a feature-branch scheduler or stale trunk from silently executing older same-named doctrine.

**Deleted a harness file on purpose?** (e.g. you don't want `.github/workflows/security.yml`.) A
**re-compile refuses** instead of silently re-creating it — it names the path and explains it was listed in
a prior `.open-autonomy/generated.json` but is now gone from disk; `--force` re-creates it (reported as
`resurrected:`). State/install-owned paths are exempt from this guard — most notably `.open-autonomy/paused`
(step 5): `rm .open-autonomy/paused` is the intended unpause, never flagged or undone.

> **Scope: this deletion guard is `compile`-only.** `upgrade` is a *re-compile of the derived set* — by
> design it **re-creates** any derived file you deleted (it has no refusal/`--force` model), so a deletion
> you want to persist across upgrades must be re-applied after each `upgrade`, or removed at the source
> (drop it from the profile / fork). The one exception is the Stop hook, which has the durable sentinel
> opt-out above (`upgrade` honors it too). Install-owned/state paths — `.open-autonomy/paused`, your
> roadmap/constitution — are seed-once and never reverted by either path.

### 5. Run the loop

**A fresh compile starts PAUSED.** Step 3 seeded `.open-autonomy/paused` (every local profile, `hello`
included) so a repo with an existing backlog is never dispatched before you've reviewed it — the very
first `--once` below is expected to print a `PAUSED` message and exit nonzero, not launch anything. Once
you've looked at your board (see step 6's `policy.dispatch` allowlist for a populated tracker), unpause
with one command:

```bash
rm .open-autonomy/paused
```

This is durable: a re-compile/upgrade of the same install never re-writes or re-adds the marker, so
unpausing is a one-time decision. `touch .open-autonomy/paused` re-arms it at any time — the running loop
notices on its next check and idles, no restart needed (your local kill-switch; see the stopping note
below). Two scope notes: pausing fences **new dispatch** only — a session already running keeps running
(and its finished worktree's propose effect still completes); and in continuous mode an unpause takes
effect at the next tick boundary, so the first tick after `rm` can lag up to one `intervalSeconds`.

```bash
node scheduler/run.mjs --once   # fire one tick, then exit — use this to verify end-to-end
node scheduler/run.mjs          # run continuously, sleeping between ticks
```

Each tick fires the cron agents in `scheduler/schedule.json` (for `simple-sdlc` that's the PM; the
PM then launches the workers). To use Codex instead of Claude Code:

```bash
TERMFLEET_AGENT=codex node scheduler/run.mjs
```

With the `hello` profile, the first **unpaused** `--once` tick launches a `greeter` session — you'll see
it in `termfleet sessions recent --live` and the console. That confirms the whole local path works.

**Keeping it running (unattended):** a backgrounded `node scheduler/run.mjs &` **dies on terminal close,
logout, or reboot** — so does the termfleet console/provider from step 2. For a loop that survives, run it
under a supervisor that restarts it: a `launchd` plist (macOS), a `systemd --user` unit (Linux), or at
minimum `nohup node scheduler/run.mjs >> ~/oa-loop.log 2>&1 &` inside a persistent `tmux`, plus a liveness
check that the process is up. `docs/INSTALL-AGENT.md`'s
["Durable operation, observability & re-runs"](./INSTALL-AGENT.md#durable-operation-observability--re-runs)
has the fuller treatment (feeding the backlog, worktree housekeeping, idle spend).

**Stopping the loop:** `Ctrl-C` the scheduler (or `kill` its PID if you backgrounded it). The
termfleet console/provider from step 2 are separate background processes — stop them with `kill %1 %2`
in the shell that started them (or `pkill -f "termfleet (console|provider)"`). Stopping the scheduler
stops new launches; a worker session already running in tmux finishes on its own (kill it from the
termfleet console if you need it gone now). On the local runner this is also your spend stop — there
is no proxy cap, so a stopped loop is what bounds model billing. (This same stop sequence is the first
step of a full [Stop & teardown](#stop--teardown) below.)

### 6. Give the loop work — by code host

The `hello` greeter self-fires on cron and needs no input. A real loop needs a backlog. **How you feed
work and how a change lands depends on the code host** you compiled in step 3.

#### local-git code host (`simple-sdlc`) — PR-free, no GitHub

The agents read work from a local **ztrack** board on disk:

```bash
npm install -D ztrack@1.0.0                 # a PROJECT dep, not -g: the installed validation preset
                                            # `import`s `ztrack/preset-kit`, so it must resolve from the
                                            # repo — a global/npx install fails `ztrack check`.
                                            # PINNED — the version this open-autonomy release is tested
                                            # against; a floating `npx ztrack` may fetch a different major
                                            # than your repo's pin (see package.json's own devDependency).
                                            # NODE_ENV=production / npm omit=dev makes this a silent no-op
                                            # (exits 0, installs NOTHING) — use: npm install -D ztrack@1.0.0 --include=dev
                                            # (works on every omit source; NODE_ENV=development only helps when
                                            # NODE_ENV is the cause)
npx ztrack init --preset simple-sdlc        # the PR-free dev preset (the `default`); no remote needed
```

> **Already has `.volter/`?** (a repo with prior tracker history.) `ztrack init` is a **silent no-op** when
> `.volter/` already exists — it prints "Already initialized" and changes nothing, even if the existing
> config uses a different preset. Inspect `.volter/tracker-config.json`: if the installed preset is not `simple-sdlc`,
> decide deliberately (migrate the board, or fork the profile to match your preset) **before** running the
> loop — don't assume the bare `init` above did anything. New issues may also mint a different team key
> (e.g. `LOCAL-`) beside an existing scheme (e.g. `TF-`) — a ztrack behavior; see its docs.

```bash
# a conforming work item: the preset REQUIRES an assignee, and the body needs "## Acceptance Criteria"
# with each AC line carrying a version marker (`dev/01 v1 …`, per standards/issue-and-evidence.md's
# grammar — omitting it fails `ztrack check`'s wellformed_shape gate even with an assignee set).
# (an unassigned/AC-less issue is still created but flagged non-conforming — issue_missing_assignee — and
# the loop's gates key on conformance; see standards/issue-and-evidence.md)
cat > issue.md <<'MD'
## Acceptance Criteria
- [ ] dev/01 v1 <one observable, testable outcome>
  - status: pending
MD
npx ztrack issue create --title "Wire the widget" --assignee <your-login> --body-file issue.md --label oa-approved
```

> `issue_missing_assignee` means exactly what it says: the preset requires every non-canceled issue to
> carry an assignee (`standards/issue-and-evidence.md`), and the loop's gates key on conformance — an
> unassigned issue is created but never eligible for dispatch. Already created one without `--assignee`?
> Fix it in place: `npx ztrack issue edit <id> --assignee <your-login>`. (`--label oa-approved` pre-clears
> `policy.dispatch`'s allowlist below — drop the flag if your install predates it.)

The `simple-sdlc` preset is **PR-free**: an issue is `done` once every AC is passed with commit-evidence
and the reviewer approves — no pull request, so it works on a private repo with no remote. On its next
tick the PM sweeps the board, enforces WIP, and **launches** the matching worker (draft/develop/review)
for the next eligible issue, moving it `draft → ready → in-progress → in-review → done`. The work item
reaches each worker as `$ZTRACK_ISSUE`. You add and inspect work entirely through `ztrack` — never GitHub.

> Using a different tracker? `simple-sdlc`'s agents are just skills that call `ztrack`. Fork the profile
> (`profiles/simple-sdlc/skills/*`), point the agents at your CLI, then compile your profile dir.

**A pre-existing board?** `simple-sdlc` ships `policy.dispatch: { mode: allowlist, allow_label:
oa-approved }` in `.open-autonomy/autonomy.yml` — with `mode: allowlist`, the PM only develops a `ready`
issue that also carries the `oa-approved` label; every other `ready` issue is reported `fenced (no
oa-approved)` in tick output, never dispatched. On a repo whose tracker already has a backlog, label the
items you want the loop to work (`ztrack issue edit <id> --add-label oa-approved`, or add the label when
you `ztrack issue create`) before unpausing; on a fresh/empty board, set `policy.dispatch.mode: open` (or
label as you create). This is a second, independent layer from the pause above: the pause is a global
go/no-go the operator flips once, the allowlist is a per-issue opt-in for the long tail of old work. The
PM also now reads the full body of any issue it's about to dispatch — an explicit do-not-dispatch /
deferred / blocked-by / on-hold note in the prose makes it ineligible regardless of `ready` state (prose
wins over state; see `profiles/simple-sdlc/skills/pm/SKILL.md`).

#### GitHub code host (`simple-gh-sdlc`) — auto-merging PRs, agents on your machine

Here the board is **GitHub issues** and a change lands as an **auto-merging PR**. Wire the gate **once**
(use your repo's package manager — `npm`/`bun`/`pnpm` — for the installs; examples show `npm`):

```bash
# a) the tracker, linked to GitHub Issues (GitHub is the source of truth)
npm install -D ztrack@1.0.0    # or: bun add -d ztrack@1.0.0   (pinned to the version this release is tested against)
                         # NODE_ENV=production / npm omit=dev makes this a silent no-op (exits 0, installs
                         # NOTHING) — use: npm install -D ztrack@1.0.0 --include=dev (works on every omit source)
npx ztrack init --preset simple-gh-sdlc --sync github --repo <owner>/<repo>

# b) require the gate in branch protection (NOT auto-merge yet — that comes after a supervised first merge,
#    step d). The contexts are the CI check-run NAMES that run on PULL REQUESTS — read them from an OPEN PR (a
#    MERGED PR's head also carries push-run checks), excluding release-only/push-only/path-filtered jobs.
#    `security` ships with the profile (the zizmor + supply-chain scan): security.yml posts it for a
#    human-authored PR, and its dispatched, blocking realization (.github/workflows/security-gate.yml) posts
#    it for an agent-authored PR (a bot PR fires no pull_request, so the proposer effect kicks the gate with
#    the head SHA) — one context, populated by whichever path the PR took.
gh api -X PUT "repos/<owner>/<repo>/branches/<default-branch>/protection" --input - <<'JSON'
{ "required_status_checks": { "strict": false, "contexts": ["<pr-ci-check>", "agent-review", "security"] },
  "enforce_admins": true, "required_pull_request_reviews": null, "restrictions": null }
JSON
# verify protection took (errors if it didn't — e.g. free private plan):
gh api "repos/<owner>/<repo>/branches/<default-branch>/protection/required_status_checks/contexts" --jq '.'

# c) add a Ready issue (open + `ready` label + assignee + ACs in the body), then sync
npx ztrack issue create --title "Wire the widget"   # --title is required; then: gh issue edit <n> --add-label ready
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

On its next tick the PM sweeps GitHub, and for a `ready` issue **launches `develop` in an isolated
worktree** (`runner.ts launch develop --ref <n> --branch agent/issue-<n>`). The develop agent commits, the
runner opens the PR, the **local shared-credential reviewer path** posts `agent-review`, and once **your CI (`ci`/`build`/…) + `security` +
`agent-review`** are all green the PR is mergeable — **merge the first one yourself** to prove the gate, then
arm auto-merge (above) so later PRs land via **native auto-merge**. With `enforce_admins:true` no agent
bypasses the gate — but **your CI is the real boundary**: on a local runner the agents share your token, so
the reviewer's `agent-review` is not independent of the proposer (the `security` gate's zizmor + supply-chain
scan IS independent — it runs deterministically, not on the agents' own say-so). **Require your real CI**;
with only `agent-review` required you'd be auto-merging on the agents' own (same-token) say-so.

> Identity: for a *technically enforced* independent reviewer, run on the hosted (scoped-token) substrate,
> or give the reviewer a **separate bot identity** (a GitHub App / dedicated account) — on local under one
> token, propose and review share the same credential, so `agent-review` self-blesses.

> **Installing with an agent?** [`docs/INSTALL-AGENT.md`](./INSTALL-AGENT.md) is a guided playbook
> addressed to the installing agent — detect the repo, ask the human only the judgment calls (the gate,
> identity, the first issue), run this overlay, and **verify the loop merges before declaring done**.

### 7. Human-in-the-loop on the local runner

A profile can declare a `kind: human` actor (`docs/SPEC.md#handoffs` — the human seam) alongside your
agents. On the local runner this needs **no termfleet, no coding CLI, no login** — a person cannot be
executed or watched, so `bun scripts/runner.ts launch <human-actor> …` just **parks** the ask and never
completes it itself. The flow is: **park → engage → operator acts → update done → resume**.

```bash
npx open-autonomy compile hello-human local .   # the minimal example: one script "requester" +
                                                 # a declared human "approver"
bun scripts/request-approval.ts                 # PARKS an ask (agent:launch -> the human route)
```

That prints the ask to the console and appends it to a well-known **attention file** — tail it (or point
your own alerting at it) to see outstanding asks:

```bash
cat .open-autonomy/runner-state/human-attention.md
```

As the **operator**, resolve the ask once you've actually done what it asks — this is the *only* path to
`done` (never presumed, always verified, per `docs/SPEC.md#handoffs`):

```bash
bun scripts/runner.ts update <id> --status done
```

Re-running the requester (or the PM's own polling) now **observes** the resolution and resumes:

```bash
bun scripts/request-approval.ts                 # "resolved: status=done — proceeding"
```

`bun scripts/runner.ts get <id>` and `list <actor>` work the same way for a parked human session as for a
termfleet one — `list` surfaces only sessions still `running`, so a PM's WIP/dedup check and the
escalate-on-SLA doctrine see an outstanding ask instead of relaunching it. **Engage** defaults to
console + the attention file; set `AUTONOMY_HUMAN_ENGAGE_CMD` to a command that receives the parked
session as JSON on stdin for a real notification path (Slack/email/paging/whatever) — entirely optional,
black-box, never required.

`profiles/hello-human/` is the full worked example (`ir.yml`, the `requester` script, the `approver`
skill/doctrine) — fork it as the starting point for your own human-required step.

### 8. Verify the install

Everything between `compile` and the first surviving worker used to be verified by nothing — a broken
publish, a missing `NODE_ENV`, a workspace-shadowed dependency, a wrong provider port, a logged-out CLI, an
uncommitted or origin-stale harness, and a mismatched skill name all failed *silently*, visible only inside
a `tmux` window (or not at all). **`doctor`** walks that exact failure chain, in order, and refuses to bless
an install that would produce a zombie loop:

```bash
npx open-autonomy doctor            # read-only: no session launch, no model call, no spend
```

It reports `PASS | FAIL | WARN | SKIP` for seven checks — `self` (the CLI itself runs from its installed
artifact), `env` (toolchain, devDeps, the pty module, workspace shadowing), `provider` (the configured port
is reachable and speaks termfleet — doctor surfaces the provider's self-reported kind/instance so you can
confirm it's *yours*, since a bare URL pin can't prove ownership), `auth` (the coding CLI is actually signed
in, never just `--version`), `harness` (every compile-owned file is committed **and** visible from a real,
freshly-created agent worktree — the load-bearing check), `skills` (that worktree resolves every agent's
launch skill), and `live` (see below). Exit code is `0` iff nothing `FAIL`ed; add `--json` for a
machine-parseable `{ checks: [...], verdict }` (what `docs/INSTALL-AGENT.md`'s verify phase gates on).

**Read-only:** the only *lasting* filesystem change doctor makes is a throwaway probe worktree/branch under
`.worktrees/`, removed on exit — including on a `FAIL`, a `Ctrl-C`, or a kill signal — and it restores
`.git/info/exclude` verbatim and removes the `.worktrees/` container it created, so a clean run leaves your
`git status` untouched. (On a **github-code-host** install, the harness probe does one best-effort read-only
`git fetch` — the same network op a real dispatch would; a fully local `simple-sdlc` install does no network
at all.)

Before leaving the loop **unattended** (`node scheduler/run.mjs &`, no one watching), spend the one real
tick doctor's `--live` flag buys you: it launches a single doctor-owned session through the install's **own
dispatch chain** — `scripts/run-agent.mjs` → `scripts/autonomy-runner.mjs launch` — exactly the path a PM
dispatch takes, delivering a `DOCTOR-OK` prompt via `AUTONOMY_PROMPT_DIR` and letting the runner **inherit**
your `TERMFLEET_PROVIDER_URL` (so it proves the pin actually propagates to child launches, not just to
doctor). It then polls the install's own `runner list` for survival, captures the terminal on failure, and
always cancels through `scripts/autonomy-runner.mjs cancel` — the local-runner equivalent of "verify the
loop merges before declaring done" (`docs/INSTALL-AGENT.md`'s Phase 4). This is the one doctor invocation
that spends money on a metered account:

```bash
npx open-autonomy doctor --live     # one real session, cancelled either way — costs money, run it once
```

### Stop & teardown

**Pausing (not uninstalling):** to stop the loop without backing OA out, use the stop sequence in
[step 5, "Stopping the loop"](#5-run-the-loop) (`Ctrl-C`/`kill` the scheduler + `kill %1 %2` the termfleet
console/provider) — that's also your spend stop on the local runner. The softer, same-tick kill-switch is
`touch .open-autonomy/paused` (step 5): it fences new dispatch without killing the process.

**Full teardown (how you back OA out entirely):** there is no one-command uninstall; reverse what the
install armed, in order:

```bash
# 1. stop the loop + termfleet
pkill -f scheduler/run.mjs ; pkill -f 'termfleet (console|provider)'

# 2. GitHub code host only (simple-gh-sdlc) — disarm the gate; skip for local-git, which has no gate
gh repo edit <owner>/<repo> --enable-auto-merge=false
gh api -X DELETE "repos/<owner>/<repo>/branches/<default-branch>/protection"

# 3. remove the harness commit + runtime scratch
git revert --no-edit <install-commit>   # or git rm the overlay paths; then push if you're on the GitHub code host
git worktree prune ; rm -rf .worktrees .open-autonomy/runner-state

# 4. (optional) uninstall the runner deps
npm remove termfleet ztrack
```

Step 3's `git worktree prune` + removing `.worktrees` also clears the merged-issue worktrees the loop
leaves behind under `.worktrees/agent/issue-*` — the running loop does not auto-prune these on its own, so
do this periodically even short of a full teardown.

### Fact-to-step completeness map

The sync contract for future edits: every load-bearing fact below has **exactly one** home in this
checklist. If you add or change one of these facts, edit the step it lives in — don't add a second copy in
README or `docs/INSTALL-AGENT.md`; make them link here instead.

| # | Load-bearing fact | Lives in |
|---|---|---|
| 1 | Commit the overlay — worktrees only see committed files | [Step 4, "Commit the harness"](#4-commit-the-harness) |
| 2 | Repo-unique ports/prefix + check-the-port-first (never the box defaults) | [Step 2, "Start termfleet"](#2-start-termfleet-console--a-local-provider) |
| 3 | Provider pinning (`TERMFLEET_PROVIDER_URL`) | [Step 2 → "Pin the provider"](#pin-the-provider) |
| 4 | Teardown / how to back OA out | [Stop & teardown](#stop--teardown), above |
| 5 | Stop-conditions (no `package.json`; shared box; public repo; no-PR-CI ⇒ never auto-merge; admin/plan) | [Stop-conditions before you start](#stop-conditions-before-you-start), above step 1 |
| 6 | Durability/observability (loop dies on terminal close/logout/reboot; daemonize with nohup+tmux / systemd / launchd; worktree pruning; idle spend) | [Step 5, "Keeping it running (unattended)"](#5-run-the-loop) → fuller: [`INSTALL-AGENT.md#durable-operation-observability--re-runs`](./INSTALL-AGENT.md#durable-operation-observability--re-runs) |
| 7 | Verify before declaring done | [Step 8, "Verify the install"](#8-verify-the-install) |

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
  agent CLI isn't installed/logged in (step 1). Re-run the `npx termfleet claude new -y --prompt "hi"`
  sanity check in isolation (`-y` is required here too — the panel-review guard fires once any panel exists,
  which it will after the first sanity check).
- **The loop does nothing each tick (`simple-sdlc`)** — there's no eligible work. Confirm
  `ztrack issue view` shows items and that they're in a state the PM can advance.
- **Wrong agent launches** — set `TERMFLEET_AGENT=claude` or `=codex` explicitly; the default is
  `claude`.
- **Pin a specific provider (required on a shared/lived-in box)** — set `TERMFLEET_PROVIDER_URL` to your
  own provider's URL before running the loop, or make it durable across shells/supervisors/re-runs with
  `npx open-autonomy compile <profile> local . --provider-url <url>` (lands in `scheduler/schedule.json`).
  The loop driver and the runner backend print the effective provider + its source (`env` / `schedule` /
  `current-context` / `auto-local`) on the first tick — check that line first if you suspect misattachment.
- **`preflight` names a foreign occupant on 7373/7402** — a pre-existing termfleet (or anything else) may
  already hold the doc-default ports on this box; `npx --yes open-autonomy preflight` classifies each
  candidate port (free / termfleet provider / termfleet console / foreign service) and prescribes a
  repo-unique port + pin.

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

- trusted maintainers only for manual `/agent develop`
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
- `/agent develop` on a paused issue stops before model minting.
- `/agent status` comments the 5 most recent runs of that agent's workflow (id, status,
  conclusion, started-at).
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports that there is nothing to retry when the issue's agent PR has no failed
  check, and relaunches the agent workflow when one exists — a relaunch is a **fresh agent run**
  (new model mint, new spend).
- `/agent cancel` cancels queued/in-progress runs of that agent's workflow. It does **not** revoke
  the run's proxy slot — an orphaned slot is reaped when the run token expires (~2h).
- Setting `PUBLIC_AGENT_REPO_PAUSED=true` (repository variable) makes every agent job skip; clearing
  it resumes the fleet.
- Proxy saturation and daily counters: operator-run `GET /admin/limits/status` with the admin token
  from the operator's local `.env` (there is no in-repo admin workflow).

### Private Trial Evidence

> Maintainer history — run IDs from the canonical project's own private trials, kept as the record of
> when each capability was first proven. As an adopter you don't need (and can't access) these; your
> equivalent evidence is your own repo's first supervised runs.

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent develop` policy block before model minting, `/agent status`, and
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

`package.json`'s `.version` field is the **authority** — it is what npm publishes. `VERSION` and
`.open-autonomy/version.json` are **enforced mirrors** of it (`bun run check:release-consistency`,
`bin/check-release.ts`): `version.json` is load-bearing — it ships into every compiled install so runs
can record the Open Autonomy version and profile used for each session (see below), so it must always
tell the truth instead of freezing at a stale number. `CHANGELOG.md`'s top `## X.Y.Z` entry and the
"Documentation for **open-autonomy vX.Y**" stamp near the top of this doc, `README.md`, and
`docs/INSTALL-AGENT.md` must also agree with `package.json`. The checker fails the build the moment any
of these drift, naming exactly what's stale — this is the ONE release process; `RELEASING.md` is a
pointer here, not a second procedure.

### Prerequisites

- An npm auth token with publish rights for the `open-autonomy` name (owner: volter). The full-publish
  token lives in `~/.npmrc` + Keychain `npm-publish-token` — never print or commit it.
- A clean, green tree: `bun run check` must pass (the in-memory conformance battery `conformance exec`,
  `check:release-consistency`, and `check:pack-smoke` among its gates). The **live** GitHub conformance
  bench (`bun bin/bench.ts`) is a separate maintainer eval — it provisions real repos and spends via the
  proxy, so it is NOT part of release gating; run it manually for a full end-to-end signal.

### Checklist (ordered — do not skip or reorder steps 5/6)

1. **Write the CHANGELOG entry:** a new `## X.Y.Z` heading in `CHANGELOG.md`, with migration notes for
   any compiled-install changes.
2. **Bump the version everywhere, in one shot:** `package.json`, `VERSION`, `.open-autonomy/version.json`
   (and its dogfood mirror, `profiles/self-driving/.open-autonomy/version.json`), and the "Documentation
   for **open-autonomy vX.Y**" stamp in `README.md`, `docs/OPERATIONS.md` (this doc), and
   `docs/INSTALL-AGENT.md`.
3. **`bun run check`** — transitively includes `check:release-consistency` (asserts all of the above
   agree) and `check:pack-smoke` (OA-01: build → `npm pack` → install the tarball → run every CLI verb
   under plain `node`, from the packed artifact, never the source tree).
4. **`npm publish`** (irreversible + public — confirm intent first). Its `prepublishOnly` re-runs
   `bun run build`, `check:release-consistency`, and `check:pack-smoke`, so a stale, broken, or
   undocumented artifact cannot ship even by someone bypassing step 3.
5. **Verify from the registry, BEFORE any tag or announcement.** In a clean temp dir, under plain
   `node`, against the actual registry (catches registry-side problems `npm pack` can't: bad publish
   contents, dist-tag mistakes, provenance/token mishaps):
   ```bash
   npx --yes open-autonomy@X.Y.Z --help
   npx --yes open-autonomy@X.Y.Z compile simple-sdlc local .
   npx --yes open-autonomy@X.Y.Z compile self-driving gh-actions .
   ```
   If any of these fail: fix, publish a patch, repeat. The tag and docs must never point at a version
   this step didn't pass.
6. **Tag the release** — only after step 5 passes: `git tag vX.Y.Z && git push --tags`; cut the GitHub
   release with the changelog entry. (Tagging before publish would let a failed registry verification
   leave a tag pointing at a version that was never healthy; verifying then tagging costs only a
   minutes-wide window where the freshest install's doc link 404s.)
7. **Keep the existing gates going:** run planner and preflight workflows on `main`; verify the
   committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md).

### Gotchas (learned the hard way — keep the packed-artifact smoke test)

- **npm strips `.gitignore`.** A file literally named `.gitignore` is omitted from every npm package,
  even under a `files` whitelist. The `self-driving` profile therefore stores it as `gitignore` (no dot)
  and the github compiler emits it to `.gitignore` in the installation
  (`packages/substrate-github/src/emit.ts`). If you add another `.gitignore` resource to a profile, apply
  the same mapping.
- **`compile` takes a profile NAME or a path.** `npx open-autonomy compile self-driving github .`
  resolves the bundled `profiles/self-driving` via `import.meta.url` (→ `dist/` when installed, `bin/` in
  dev). A bare name that isn't a bundled profile and isn't a path errors with the list of bundled
  profiles.
- **The source tree lies about packaging.** Running from a clone always finds `profiles/` and dotfiles,
  so a packaging bug (like the `.gitignore` strip) only shows up against a `npm pack`ed install. Always
  run `check:pack-smoke` (step 3/4 above) before publishing — never trust a source-tree smoke test alone.

### Deprecation follow-up (owner action, post-merge — NOT run by an automated build)

When a fixed release ships superseding a broken one (e.g. `0.4.2` superseding `0.4.0`/`0.4.1`'s broken
`compile`, OA-01), run `npm deprecate "open-autonomy@<=0.4.1" "0.4.0/0.4.1 crash on compile — upgrade to
>=0.4.2"`. This closes the loop: `latest`, the docs stamp, and the newest working package become the
same number, and anyone who lands on a broken version is told so by npm itself. This is a real-network,
owner-run, post-publish action — it is never executed by an autonomous build (see
`docs/adoption-fixes/OA-15-version-doc-skew-release-process.md` §5).

Generated or upgraded repositories should keep their local `.open-autonomy/version.json` so runs can
record the Open Autonomy version and profile used for each session — now enforced
(`check:release-consistency`) to actually be current at every release, not merely present.
