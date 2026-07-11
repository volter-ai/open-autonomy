# profiles

**Profiles** are substrate-agnostic recipes — a composition of agents (skills) + workflows + policy +
resources, written as `autonomy.ir.v1` in an `ir.yml`. A profile is the *what*; a substrate is the
*how/where*. The same profile compiles to any substrate:

```
compile(profile, substrate) → installation
```

`autonomy.ir.v1` is a normative **standard**, not this repo's implementation detail — the full spec
(the actor model, the four catalogs, conformance) lives in [`docs/SPEC.md`](../docs/SPEC.md#the-ir).
This file is the practical, tutorial-voice counterpart: how to write a profile of your own. Where the
two disagree, SPEC.md wins — file the fix here.

This file bundles with the npm package (`profiles/` ships wholesale) but is **not** a profile resource
itself — no `ir.yml` lists it, so it never gets compiled into an installation. It is documentation, read
by a human authoring a profile, not carried by one.

## Writing your own profile

A profile is a directory with an `ir.yml`, a `skills/<name>/SKILL.md` per agent, and any resources it
declares. The compiler (`open-autonomy compile` / `bun bin/autonomy-compile.ts`) reads the `ir.yml`,
validates it, and emits a substrate-specific installation.

### The minimal working profile

[`profiles/hello/`](./hello/) is the smallest complete profile and is the recommended starting template
— copy it and grow it. Its **complete required file set**:

```
profiles/hello/
  ir.yml                     # the profile: one agent, no resources
  skills/greeter/SKILL.md    # the agent's behavior (frontmatter name == folder name == behavior)
```

(hello also carries three optional `resources:` — see below — but those aren't part of the *required*
set; a profile with zero resources is complete with just the two files above.)

Its `ir.yml` in full:

```yaml
schema: autonomy.ir.v1
targets: [local, gh-actions]
agents:
  greeter:
    behavior: greeter            # a prose skill → the substrate runs it via a model
    capabilities: [tasks:converse]
    triggers:
      - { cron: "*/30 * * * *" } # autonomous (no subject.ref) — fires on a schedule
policy:
  box: {}
resources:
  - .github/workflows/security.yml
  - .github/dependabot.yml
  - scripts/check-supply-chain.ts
```

Four things to get right, because each one is a documented, easy-to-hit trap:

1. **The top-level key is `agents:`, not `actors:`.** SPEC.md talks about "the actor model" in prose
   (`docs/SPEC.md#the-ir`) — the standard's *unit* is called an actor. But the IR's map key has not been
   renamed yet; `packages/core/src/ir.ts`'s `validateIR` is the ground truth. Write `agents:` — an
   `actors:` key is silently ignored (not merged, not an error by itself) and you get
   `invalid profile IR:\n  no agents (found "actors:" — the key is "agents:")`.
2. **`behavior:` is a bare skill name, never a path.** `behavior: greeter` — not `behavior: skills/greeter`.
   Both compilers (`gh-actions` and `local`) prepend `skills/<behavior>/SKILL.md` themselves; writing the
   prefix yourself makes them look for `skills/skills/greeter/SKILL.md`, which doesn't exist.
3. **`policy: { box: {} }` is required even when you have no governance data.** Omit `policy` or
   `policy.box` and you get `missing policy (add "policy: { box: {} }" — governance data every substrate
   + skill reads verbatim)` or `policy.box is required (...)`. An empty box is a completely valid,
   common case (hello's box is empty).
4. **`resources: []` is required, even if the list is empty.** Same reasoning: `missing resources (add
   "resources: []" if the profile carries no verbatim files)`.

### The SKILL.md contract

Every non-script `behavior` resolves to `skills/<behavior>/SKILL.md`. That file's frontmatter `name:`
**must equal the folder name** (which must equal the `behavior:` value) — both agent harnesses launch a
skill by that name (`/name` for Claude Code, `$name` for codex). A mismatch **compiles clean** and then
the launch trigger silently never resolves — this is checked separately from `validateIR`, by
`validateSkillFrontmatterIn` (`@open-autonomy/core`), which both `autonomy-compile` and `lint` run before
writing anything:

```yaml
---
name: greeter
description: A minimal demo agent — use when showing how a profile compiles and runs on a substrate.
---

# greeter

The smallest useful agent: when launched, ... (the prose IS the behavior — a model runs this skill).
```

The body is the agent's doctrine: what it does, when, and how it judges "done" — written for a model to
read and act on, not for a human audience. A `kind: human` actor's SKILL.md is the same contract, but its
body is the task spec a *person* is handed (situation / decision / result) instead of agent instructions
— see `profiles/self-driving/skills/maintainer/SKILL.md` for a worked example.

A `behavior` ending in `.ts`/`.mjs`/`.js` is a **script**, not a skill — it has no SKILL.md; it *is* the
behavior, run deterministically instead of by a model (`packages/core/src/ir.ts`'s `isScript`).

### Capabilities and the merge boundary

An agent's `capabilities:` list is its authority — a grant on its own scoped credential, not an
instruction to a mediator. Full semantics: `docs/SPEC.md#capabilities`.

| capability | one-line semantics |
|---|---|
| `code:propose` | propose a change (push a branch, open a PR, queue auto-merge, dispatch CI) |
| `code:review` | bless a change for merge (post the verdict that gates landing) |
| `code:merge` | land a reviewed change — **gate-only**, never grantable to an agent |
| `tasks:author` | create / update / label / set the state of work items |
| `tasks:converse` | post comments / verdicts on work and changes |
| `agent:launch` | start another agent |
| `agent:list` | observe running agents |
| `agent:update` | pause / resume / retry another agent |
| `agent:cancel` | stop another agent |

**The merge boundary** (`docs/SPEC.md#capabilities`, "the merge boundary" subsection): `code:propose` and
`code:review` may never be held by the same agent, and no agent may ever hold `code:merge`. This isn't
just a convention — `validateIR` rejects both: a `code:merge` capability on any agent fails with
`code:merge is gate-only — no agent may merge`, and an agent holding both `code:propose` and
`code:review` fails with `merge boundary — no agent may hold both code:review and code:propose`. Landing
is native platform auto-merge once the gated checks pass — no agent performs it.

A typo'd or made-up capability (e.g. `code:proposal`) is also rejected at validate time —
`unknown capability '<cap>' (catalog: ...)` — rather than silently compiling into a read-only agent.

### Triggers and trigger params

An agent's `triggers:` list says when it fires. Three forms:

- `{ cron: "<cron expr>" }` — autonomous, time-based; portable across substrates.
- `{ dispatch: true }` — fires when another actor launches it through the Runner (`agent:launch`,
  `docs/SPEC.md#the-runner`); portable across substrates.
- `{ event: "<name>", config: {...} }` — a substrate-native escape hatch (e.g. github's
  `issue_comment`); carried verbatim, only as portable as the substrate realizing it.

A trigger may also declare `params: { OPAQUE_NAME: source }` — an opaque name of your choosing, mapped
to a documented **source** the substrate resolves at fire time. Full contract: `docs/SPEC.md#trigger-params`.
The source catalog:

| source | resolves to |
|---|---|
| `subject.ref` | the id of the work item that fired the trigger (an issue/PR number, a work-store id) |
| `subject.actor` | who initiated it (the commenting/triggering user) |
| `subject.actorRole` | that actor's authority over the project (e.g. github's OWNER/MEMBER/COLLABORATOR `author_association`) — for gating privileged commands; empty if not applicable |
| `subject.text` | the text that fired it (a comment/issue body); empty if not applicable |
| `trigger.kind` | why it fired (the event name/action) |

An unrecognized source name is rejected at validate time —
`trigger param '<param>' has unknown source '<source>' (catalog: ...)` — rather than silently resolving
to an empty string at compile time. `profiles/simple-gh-sdlc/ir.yml`'s `reviewer` agent is a worked
multi-param example (`TARGET_REF: subject.ref`, `SUBJECT_TEXT: subject.text`,
`ACTOR_ROLE: subject.actorRole`).

### `policy.box`: governance data, read by name

`policy.box` is open-ended, per-profile governance **data** — the core (`packages/core`) never
interprets a single key in it; it validates only that `policy.box` exists and is an object, then carries
it verbatim into the compiled `.open-autonomy/autonomy.yml`. Everything under it is convention, not a
closed schema the standard defines.

The one rule the bundled profiles all follow, enforced by `bun run check:policy-consumers`: **every
`policy.box` key is a parameter with a reader, or it doesn't exist.** A key nothing reads *looks*
enforced (a skill can cite it, an operator can trust it) while nothing actually consumes it — that's
worse than not declaring it at all. A reader is either deterministic (engine/runtime code reads the key
from the compiled manifest) or agent-at-runtime (a SKILL.md instructs the agent to read the key from
`.open-autonomy/autonomy.yml`).

This isn't a fixed schema — it's the set of conventions the **bundled profiles** currently use. A new
profile is free to invent its own `policy.box` sections; just give each key a reader (a script that
consumes it, or a skill instruction that does). The keys below (grepped from `profiles/*/ir.yml`) are
what's shipped today, as a starting vocabulary, not a spec:

| box path | meaning | read by |
|---|---|---|
| `gh-actions.proxy_host` | model-proxy host fallback (`vars.PUBLIC_AGENT_PROXY_HOST`) | `packages/substrate-github/src/emit.ts` |
| `gh-actions.oidc_audience` | model-proxy OIDC audience fallback | `packages/substrate-github/src/emit.ts` |
| `gh-actions.model` | model fallback (`vars.PUBLIC_AGENT_MODEL`) | `packages/substrate-github/src/emit.ts` |
| `gh-actions.bot_name` / `bot_email` | git author identity for agent-proposed commits | `packages/substrate-github/src/emit.ts` |
| `gh-actions.propose_dispatch_checks` | extra required-check workflows the proposer must dispatch on a bot PR | `packages/substrate-github/src/emit.ts`, `scripts/agent-propose.ts` |
| `gh-actions.propose_dispatch_reviews` | extra reviewer workflows the proposer dispatches | `packages/substrate-github/src/emit.ts`, `scripts/agent-propose.ts` |
| `gh-actions.commit_signing` | commit-signing mode for agent commits (e.g. `verified-api`) | `packages/substrate-github/src/emit.ts`, `scripts/provision-target-repo.ts` |
| `gh-actions.private_egress_guard` | emit the runner-owned egress lockdown step + `scripts/egress-guard.sh` | `packages/substrate-github/src/emit.ts` |
| `autonomy.max_open_agent_prs` | WIP ceiling on concurrently open agent PRs | `packages/substrate-github/src/ingest-manifest.ts`, the pm skill |
| `autonomy.max_develop_attempts` | rework cap before the PM stops re-launching `develop` on an issue | the pm skill |
| `human.maintainers_var` | repo variable naming who to engage for a human-required item (falls back to the repo owner) | `scripts/human-approval-gate.ts`, `scripts/provision-deploy.ts`, the maintainer/pm skills |
| `human.sla_minutes` | how long a human-required item waits before the PM escalates | the pm/maintainer skills |
| `risk.human_required_paths` | glob/name list of paths that force human-approval scope | `scripts/human-approval-gate.ts`, the pm/reviewer/maintainer skills |
| `risk.human_required_topics` | topic list (auth, secrets, …) that force human-approval scope | the pm/reviewer skills |
| `merge.maintainer_block_labels` | the one hold-label vocabulary the auto-merge rearm sweep and the pm/reviewer skills consult | `scripts/rearm-auto-merge.ts`, `scripts/open-autonomy-preflight.ts`, the pm/reviewer skills |
| `planner.issue_origin_label_prefix` / `phase_label_prefix` / `priority_labels` | the planner's label conventions | the planner skill, `scripts/open-autonomy-preflight.ts` |
| `tracker.ztrackPreset` | the ztrack preset name (survives a fork renaming the profile directory) | `bin/ztrack-preset.ts` (used by `bin/autonomy-compile.ts`'s local next-steps print) |

`policy.maxConcurrent` (a sibling of `box`, not inside it) is the one typed policy field — the engine's
own fleet-wide concurrency cap, not a `box` convention.

### Validating and compiling

Three checks, cheapest first:

```bash
# 1. Lint: parse + compile to every substrate the profile declares (targets:) + check skill/folder
#    names — writes nothing. This is the fastest signal; run it after every ir.yml/SKILL.md edit.
open-autonomy lint profiles/my-profile
# (from a clone: bun bin/lint-profile.ts profiles/my-profile)

# 2. Dry-run compile: print the exact file list a substrate would produce, still nothing written.
open-autonomy compile profiles/my-profile gh-actions
open-autonomy compile profiles/my-profile local

# 3. Materialize: actually write the installation.
open-autonomy compile profiles/my-profile gh-actions /tmp/my-profile-gh
```

`lint` and the dry-run compile both validate copy-source existence (every `skills/` dir and `resources:`
entry a compile would copy must exist) and the SKILL.md name==folder contract **before** writing
anything — a missing file is reported as one clean error list, not an `ENOENT` partway through writing
14 files.

**Scaffold vs. overlay.** Compiling into an existing directory can go one of two ways, and it matters
which your profile is:

- **Overlay (additive)** profiles — `hello`, `simple-sdlc`, `simple-gh-sdlc` — carry only files that are
  new to a typical target repo (skills, workflows, standards docs). Compiling them into your existing
  repo is safe by construction: there's nothing of yours for them to collide with.
- **Scaffold (whole-repo)** profiles — `self-driving` — carry repo-identity files as resources
  (`README.md`, `package.json`, `.gitignore`, …) and are meant for a new/dedicated repo, not layered onto
  an existing one. Compiling one into a populated directory **refuses** if it would overwrite an
  existing file with *different* bytes, naming every collision; pass `--force` to proceed anyway
  (`bin/autonomy-compile.ts`'s clobber guard). If you're authoring a profile meant to carry files like
  these, expect the same guard to protect *your* adopters.

## Compile a profile (quick reference)

```bash
# dry run — list the installation a substrate would produce
bun bin/autonomy-compile.ts profiles/hello local
bun bin/autonomy-compile.ts profiles/hello gh-actions

# materialize it into a directory
bun bin/autonomy-compile.ts profiles/hello gh-actions /tmp/hello-gh
```

## Gallery

- **`hello/`** — the minimal runnable profile: one `greeter` agent on a cron trigger. Compiles to
  both `local` (a scheduler-loop installation) and `github` (manifest + workflow + control plane).
  Start here to see the whole path, and as the template for writing your own (see above).
- **`self-driving/`** — open-autonomy's own self-maintenance recipe (pm / developer / reviewer /
  planner / upgrade / strategist / strategy-reviewer). `compile(self-driving, github)` produces a
  complete self-driving installation; it is the **single source** of that installation (there is no
  hand-maintained template — `scaffold` and the upgrade workflow both compile this profile). The
  github runtime (`scripts/*`) is **not** in the profile — the substrate owns and injects it, the same
  way `substrate-local` injects its runner backend (`check:runtime-sync` + `check:compile` guard it).
- **`simple-sdlc/`** — a four-agent software-delivery loop (pm / draft / develop / review) ported from
  the ztrack `simple-sdlc` profile. The PM is the only autonomous trigger (a `cron` tick that enforces
  WIP); the three workers are **`dispatch`** agents — the PM reads the ztrack board, decides from each
  issue's state (a property it reads, not a trigger), and **launches** the matching worker through the
  Runner (`bun scripts/runner.ts launch develop --ref <id>`), delivering the work item as `$ZTRACK_ISSUE`.
  Targets **`local` only** — it is PR-free (review = the reviewer's verdict over commit-evidence), and
  github's merge boundary requires an auto-merging PR + `agent-review` it doesn't provide; the GitHub
  PR-based SDLC is `simple-gh-sdlc`'s job. Its agents use `ztrack` for tooling.
- **`simple-gh-sdlc/`** — the **github** counterpart of simple-sdlc (pm / draft / develop / reviewer).
  Same ztrack-tracked dispatch loop, but the merge boundary is GitHub's: `develop` (`code:propose`) lands
  its change as an auto-merging PR gated by an independent `reviewer` (`code:review` → `agent-review`) —
  the permission split, native auto-merge, done = merged PR (self-driving's merge model on a generic
  ztrack SDLC). Targets **`gh-actions` + `local`** (runner ⟂ code host — agents on Actions *or* your
  machine, auto-merging PRs on GitHub either way); uses the ztrack `simple-gh-sdlc` preset.
- **`simple-gh/`** — the **single-manager** GitHub PR loop. ONE **scheduled** agent (`manager`, `cron: */30
  * * * *`) — research/plan/review/implementation are harness-native **subagents** it dispatches in-session
  (per-dispatch `model` override + worktree isolation), not separate OA actors;
  `policy.box.models.{research,implement}` are abstract tier labels the SKILL.md maps to concrete models.
  Plans are **docs** registered as ztrack document sources, not hand-authored issues. The merge boundary
  drops the auto-merge/`agent-review` pair entirely: the manager itself opens and **merges** each PR
  (`code:propose` only — no `code:review`, no `code:merge`), but only once every required repo CI check
  is green **and** a freshly-dispatched review subagent has recorded a `pass` verdict on the current head
  SHA — twin's owner-decided landing model (a human merges every green PR by hand), agent-executed as the
  operator's deputy. A second declared agent, `audit`, is dispatch-only (no cron, ever) — a read-only
  conformance auditor of the install itself, filing a dated report PR under `docs/audits/` on demand; it
  does not add a second scheduled actor (`profiles/simple-gh/skills/audit/SKILL.md`). Targets **`local`
  only**, `codeHost: github`. Honesty (see
  `profiles/simple-gh/README.md`): on a shared local credential there is no independent reviewer identity,
  so the *deterministic* gate is branch protection (real CI required + `enforce_admins: true`), not agent
  independence; and the model tiering works only on the Claude Code harness — `TERMFLEET_AGENT=codex`
  degrades it to one model. Contrast with `simple-gh-sdlc`: that profile auto-merges behind an
  `agent-review` check (a self-check on local, but a real independent gate on `gh-actions`); `simple-gh`
  never auto-merges and never claims an independent review identity — it claims exactly the
  real-CI-plus-recorded-verdict gate it enforces, nothing more. Contrast with `soc2-baseline`: that
  profile is `simple-gh-sdlc` plus a full deterministic compliance control layer (SBOM, CodeQL, signed
  commits, per-SHA human approval); `simple-gh` carries none of that — it is deliberately the simplicity
  floor, not a compliance posture. `merge.yml` / `reconcile-merged-issues.ts` and the security/dependabot
  surface are deliberately not carried by default (GitHub-Issues-only machinery and adopter opt-in,
  respectively — see the profile README's re-add condition).
- **`soc2-baseline/`** — `simple-gh-sdlc` + a **deterministic SOC 2 control layer**. Same 4-agent PR loop,
  but every install ships the SOC 2-relevant controls baked in as CI / config / branch-protection / policy
  files (not agent behavior): the merge boundary + a per-head-SHA human-approval gate, `supply-chain` +
  `codeql` as blocking required checks on bot PRs, GitHub-Verified signed commits (`required_signatures`),
  SBOM, secret scanning, tamper-evident evidence collection, and a full install-owned policy set. TSC scope
  **Security + Confidentiality + Availability + Processing Integrity**. The honest framing: it makes an
  adopting repo **Type-I-ready by design — default-ready, not certified** (the org program + the Type II
  observation window remain the adopter's to run). See `profiles/soc2-baseline/README.md` and
  `docs/SOC2-BASELINE-PROFILE.md`.

Every profile in this directory is smoke-checked by `check:profiles` (parses + compiles to each
declared target). A profile's agents pick their own **tooling** (`ztrack`, or `gh` + `npm`); the core
and substrates never name a tool.
