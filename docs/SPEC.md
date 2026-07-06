# The Autonomy Standard (`autonomy.ir.v1`)

> **This is the single spec doc.** It defines the standard a profile is written in: the **actor**
> unit, the **four catalogs** (capabilities, trigger-param sources, task lifecycle, config), the
> **Runner** control seam, and **handoffs** (choreography over tasks + the human seam). It was
> consolidated from six separate docs — AUTONOMY-IR, CAPABILITIES, TRIGGER-PARAMS, TASK-LIFECYCLE,
> RUNNER, HANDOFFS — which are now the sections below. Cross-references between them are intra-doc
> anchors. Strategy/why lives in `docs/VISION.md`; the rules in `docs/CONSTITUTION.md`.

**Sections**

1. [The IR](#the-ir) — the actor model, the four slots, the four catalogs, conformance.
2. [Capabilities](#capabilities) — the authority model + the merge boundary.
3. [Trigger params](#trigger-params) — the cross-substrate param-source vocabulary.
4. [Task lifecycle](#task-lifecycle) — the state vocabulary the orchestrator reads.
5. [The Runner](#the-runner) — the universal actor-control seam.
6. [Handoffs](#handoffs) — choreography over tasks + the human seam.

---

## The IR

`autonomy.ir.v1` — the standard.

> **Status:** finalized model; the codebase is being aligned to it. The terms `workflow`,
> `launch`, `run`, `raw`, `steps`, `box.model`, `skill|script`, `commit|propose` are **retired** — see
> "What this replaces" at the end. If the code still shows them, the code is mid-migration, not the spec.
>
> **Actor model (current):** the one unit is the **actor** (`kind: agent | human`). Triggers are
> `cron` | `event` | `dispatch` — the two PORTABLE kinds are `cron` (time) and `dispatch` (on-demand via
> the Runner, [§The Runner](#the-runner)); `event` is the substrate-native escape hatch. There is **no `task:`
> trigger**: a task is a work ITEM whose lifecycle state is a property the orchestrator READS when deciding
> what to dispatch ([§Task lifecycle](#task-lifecycle)), never a trigger the substrate watches.

### The shape of the whole thing

The IR is a **standard**. It concretely defines one unit (the *agent*) and four catalogs (capabilities,
trigger-param sources, task lifecycle, config keys). A **substrate** (`gh-actions`, `local`, …) — the agent **runner**, NOT
the code host — is a **partial implementation** of that standard, realizing the subset it supports its own way.
(`github` is a back-compat alias for `gh-actions`; it conflated the runner with the github code host — prefer
`gh-actions`. Runner ⟂ code host: see §"Runner vs code host" and `docs/CODE_HOST_RESOURCES.md`.) **Conformance** reports the support
matrix. It is exactly the relationship a web standard has to browsers: the spec is complete and concrete;
each implementation supports part of it; a profile using a feature works to the degree its target
supports it.

```
IR (the standard)        — what exists, precisely. Never how.
   ↓ compile(profile, substrate)
substrate (an impl)      — how, for the subset it supports. Declares the rest unsupported.
   ↓
installation             — what runs.
conformance              — the support matrix across substrates.
```

The core (the standard) **only validates spec-validity and wires** — it never interprets what a
capability *does*, where a trigger param is *sourced*, or what a config key *means*. The substrate is the
only thing that knows codex, `gh`, PRs, termfleet.

### The one unit: an actor (agent or human)

There is no `workflow`, no `launch`/`run`/`raw`. There is one concept — an **actor** — with exactly four
slots. An actor has a **kind**: `agent` (a machine participant) or `human` (a person). The four slots are
identical for both; `kind` (the **role**) is **intrinsic and declared in the profile**, while
*realization* (how the role is filled — a script, a model, a real person, or a **simulator** in test) is
the substrate's/environment's choice. `kind: agent` is the default, so existing profiles are
unchanged. The slots:

```yaml
schema: autonomy.ir.v1
targets: [gh-actions, local]

# The top-level key is `agents:` TODAY (packages/core/src/ir.ts) — the rename to `actors:` described
# above is mid-migration and NOT yet accepted by the parser; `actors:` here fails with `invalid profile
# IR: no agents`. Compile this example verbatim once you see `agents:`.
agents:
  developer:                           # kind: agent (the default)
    behavior: developer               # what it does — a SKILL (prose); run as a credentialed job. Bare
                                       # name: both compilers resolve it under `skills/<name>/SKILL.md`
                                       # themselves — do NOT write `skills/developer` here (ENOENT).
    capabilities: [code:propose, tasks:converse]   # its authority (the standard's capability catalog)
    triggers:                          # when it fires; three forms — cron | event | dispatch
      - { dispatch: true, params: { ISSUE: subject.ref } }  # portable: launched on demand by the orchestrator
      - { event: issue_comment }                            # substrate-native escape hatch
    timeout: 30                        # a run-time bound (minutes) — the only non-capability field

  maintainer:                          # kind: human — a person; intrinsic, not a substrate choice
    kind: human
    behavior: maintainer-review        # the task spec the person is handed (situation / decision /
                                       # result) — same bare-name rule as above: resolves to
                                       # `skills/maintainer-review/SKILL.md`
    capabilities: [tasks:converse, code:review]
    triggers: [{ dispatch: true }]     # engaged on demand when the orchestrator routes work to a person

  planner:
    behavior: planner
    capabilities: [tasks:author, tasks:converse]
    triggers: [{ cron: "17 6 * * *" }]

policy: { box: {} }                    # governance (merge/risk/…); substrate + agents read what they know
resources: [docs/standards/code.md]    # verbatim files; the standard never interprets them
```

| slot | what it is | who reads it |
|---|---|---|
| **behavior** | what the actor does — a SKILL (prose); a `kind: human` actor's is the task spec a person is handed | the substrate *realizes* it: `kind: agent` → a credentialed job runs the skill via a model; `kind: human` → a real person (prod) or a simulator (test) |
| **capabilities** | the actor's authority — from the capability catalog ([§Capabilities](#capabilities)); realized as the agent's own scoped token | the substrate realizes each as a permission on that token |
| **triggers** | when it fires + the **params** it forwards. Three forms: `cron` (time), the portable `dispatch` (on-demand via the Runner — [§The Runner](#the-runner)), and the substrate-native `event` | the substrate's trigger executor; `cron` and `dispatch` are portable, `event` is carried |
| **timeout** | optional run-time bound (minutes) — the only non-capability field | the substrate's job timeout |

An actor also carries a **kind** (`agent` | `human`, default `agent`) — a discriminator, not a fifth slot.
`kind` (the role) is the profile's; *realization* (how the role is filled — model/person/simulator) is the
substrate's (see Kind/realization below). `policy`
(global governance) and `resources` (verbatim files) sit at the top level. That is the entire IR.

### The four catalogs (the standard's concrete vocabulary)

A profile depends **only** on these named vocabularies, never on a substrate's raw shapes. New entries
are added to a catalog first, then implemented by substrates — purely additive, never a restructure.

1. **Capabilities** ([§Capabilities](#capabilities)) — the agent's *authority*, over three nouns (code · tasks ·
   agent): `code:propose` · `code:review` · `code:merge` (gate-only) · `tasks:author` · `tasks:converse` ·
   `agent:launch|list|update|cancel`. A capability IS a grant on the agent's own scoped token.
2. **Trigger param sources** ([§Trigger params](#trigger-params)) — what a trigger can forward to the agent:
   `subject.ref` · `subject.actor` · `subject.text` · `trigger.kind`. A trigger declares
   `params: { OPAQUE_NAME: source }`; the substrate resolves the source from its firing context.
3. **Agent fields** (no opaque config box) — the only non-capability field is `timeout`:

   | field | meaning | github | local |
   |---|---|---|---|
   | `timeout` | minutes before kill | job `timeout-minutes` | runner kill-after |

   There is **no** `config` box. Everything the box once carried is now either a capability (authority),
   substrate-DERIVED (the workflow filename = `<agent>.yml`; the model endpoint is provisioned for every
   skill agent), or simply gone (the trust/credential knobs — trust is the capability/permission split,
   below). The model budget is the bounded mint (a substrate concern, not an IR field). Substrate-specific
   github knobs (`workflowFile`/`persistCredentials`/`permissions`/`env`/`concurrency`) were leaks and are
   removed: a github permission set is *computed* from capabilities, never written in the IR.

4. **Task lifecycle** ([§Task lifecycle](#task-lifecycle)) — the states a work item can be in (`open` · `ready`
   · `working` · `in-review` · `input-required` · `blocked` · `done` · `rejected`). This is vocabulary the
   **orchestrator reads** off a work item to decide what to dispatch — **not** a trigger. A task's state is
   a property; the PM (on `cron`) reads it and `launch`es the matching worker (a `dispatch` agent). A
   **handoff** (a seam, [§Handoffs](#handoffs)) is a typed edge over these states — an upstream actor's work
   produces a transition the orchestrator observes and acts on. No substrate watches task state.

### Kind, realization, trust, review — orthogonal axes (only `kind` is in the IR)

This is the distinction that took the longest to get right, so it is stated explicitly:

- **Actor kind** (`agent` vs `human`) — the **role**: intrinsic, declared in the profile (the one of
  these that *is* an IR field — the `kind` discriminator). You cannot turn a human *role* into a permanent
  script; that would be a *different org design*. `kind` says *who* the actor is — a different axis from
  realization (*how* the role is filled).
- **Realization** (how the role is filled) — the **substrate's/environment's choice**, not in the IR. For
  `kind: agent`: a credentialed job runs the skill via a model. For `kind: human`: a **real person** in
  production, or a **simulator** in a testbed — *same profile, different environment*. Filling the same
  role differently per environment is what makes an org with human actors **testable** ([§Handoffs](#handoffs)).
- **Safety** (can a hijacked agent do harm?) — the **capability/permission split**, not mediation. The
  agent acts directly with a token scoped to its capabilities; the one irreversible power — merge — is
  withheld from every agent (`code:review` = bless via status, `code:propose` = push, never both), so no
  agent can land unreviewed code ([§Capabilities](#capabilities)). There is no credential-less job, no bundle, no
  trusted publisher. Safety is capabilities + budget — not an IR trust field.
- **Change review** (does the resulting change get reviewed before merge?) — the `code:review` status +
  branch protection (`ci` + `agent-review` required); native auto-merge lands it.

### The substrate: a trigger executor + a runner, over a box

A substrate factors into two implementables over one shared environment:

1. **Trigger executor** — fires an agent when its triggers say so and forwards the declared `params`.
   Decides *when*. Only `cron` is portable; events are carried and fired where supported.
2. **Runner** — runs agents and manages their lifecycle (the Runner contract, below), launching each into
   a box.

over

3. **The box** — the environment an agent runs in: POSIX fs + shell + git + **a model endpoint** + the
   installed files. The model endpoint is **always** part of the box (a deterministic agent simply never
   calls it) — there is no "does it get a model" knob.

On **local** the two are separate (the loop fires; termfleet runs). On **gh-actions** one platform fills both
(Actions `on:` fires; the Actions job runs). An agent never sees the trigger executor — from its seat
there is only the runner and the box.

**Substrate config lives in the box, not the engine.** A substrate reads its installation config from
`policy.box.<substrate>` (e.g. `policy.box.gh-actions`: the model-proxy host, OIDC audience, model, bot git
identity — keyed by the runner name, not the github code host). The engine bakes in **no** org identity — a profile supplies these and the compiler emits them as
the install's `vars.*` defaults. Likewise `policy.box.risk.human_required_paths` is materialized **verbatim**
for the human-approval gate to enforce: the substrate *carries* policy, it never authors or augments it.

**Runner vs code host.** The substrate is the agent *runner* — where the fleet executes — and it is
orthogonal to the **code host** (github: where the repo lives and `ci` / `security` / `deploy` run). A
local-substrate org still has a github code host, so those CI/security/deploy workflows are **code-host
resources** carried by the profile (constant across runners, like the standards docs); only the per-agent
workflows are *generated* by the runner substrate. See `docs/CODE_HOST_RESOURCES.md`.

#### The Runner contract

The runner knows only **agents and their lifecycle** — no work, issues, or domain. `launch` carries
**opaque params** through to the agent (the system never interprets them; the agent's tooling does).

```ts
type SessionStatus = 'running' | 'paused' | 'cancelled' | 'done' | 'failed';
type LaunchParams = Record<string, string>;   // opaque pass-through
interface Session { id: string; agent: string; status: SessionStatus; ref?: string; params?: LaunchParams }

interface Runner {
  launch(agent: string, params?: LaunchParams): Session;            // C
  get(id: string): Session | undefined;                            // R (one)
  list(): Session[];                                               // R (running)
  update(id: string, patch: { status?: SessionStatus }): boolean;  // U
  cancel(id: string): boolean;                                     // D
}
```

The `agent:*` capability axis **is** this contract — an agent with `agent:launch` may launch others; the
operator always holds the full contract over a running agent (the control plane). Full detail in
[§The Runner](#the-runner).

**Isolation is requested explicitly, and the runner stays code-host-blind.** A worker that produces an
isolated change is launched with a `--branch <name>` runner-control param; the runner runs it in that branch's
own workspace (a local runner: a git worktree; a gh-actions runner: the job's fresh checkout, which makes
`--branch` a no-op). No `--branch` ⇒ the trunk workspace. The runner derives this from neither a capability nor
the work item — the caller (the PM) names the branch — and it injects **no** code-host identity: an agent that
needs its repo or PR resolves them through its own code-host tool (e.g. `gh api repos/{owner}/{repo}/…`, which
`gh` fills from the remote). So the runner never names a code host, on any substrate.

### What is NOT an agent

Not everything in an installation is an IR agent. Three kinds sit outside the standard:

- **Repo-owned files** (`ci.yml`, README, package.json, docs) — `resources`. The IR never models repo CI.
- **Substrate infrastructure** (github's model-proxy admin, the injected runtime, the control handler) —
  provided by the substrate, not declared in the profile.
- **Agents** (developer, planner, pm, reviewer, preflight, …) — the IR.

This is also why there is no `raw`: ingest maps a recognized agent to an agent, and anything else is a
repo-owned resource — never an escape hatch in the IR.

### Conformance — the support matrix

A substrate implements a **core** contract (required — any core-conformant substrate runs any IR) and an
**expanded** set it advertises. `bin/autonomy-conformance.ts` drives the real runner against its real
backend and reports `supported`/`unsupported` per feature — extended, under this model, to the whole
standard (capabilities, param sources, config keys), not just Runner ops. `compile` warns when a profile
uses a feature its target does not support: **partial support is first-class, not failure.**

**Runner core (MUST):** `launch` / `list` / `cancel`, ids received (not invented), params passed verbatim.
**Trigger core (MUST):** fire `cron` and launch the agent. PM-on-cron is the universal dispatcher, so cron
alone yields a working fleet.
**Expanded (MAY):** `get`/`update`; enforce `maxConcurrent`/`timeout`/model-bounds/permissions; isolation;
event triggers; the operator control surface; the merge boundary (the capability/permission split +
native auto-merge). Honored where present, declared unsupported where not.

### Validation — by running it for real, not by tests

There are **no unit tests** of behavior. The only real confidence is running the actual app, with real
AI, on a real project. The conformance battery is the one deterministic harness (the substrate seam is
mechanical). Live-proven to date: the github agent wrapper (privilege-separated, OIDC-minted, trust
boundary intact) running a real codex agent end-to-end and opening a PR from a declared trigger param —
work resolved purely from `subject.ref`, no implicit event reach-in.

### What this replaces (and why)

| retired | replaced by | why |
|---|---|---|
| `workflow` as a separate noun | the **agent** (carries its own triggers) | "the system's entire knowledge is agents" |
| `launch` vs `run` | one agent; execution is the substrate's choice | the split manufactured leaks (issue-driven, always-publisher) |
| `raw` | agent, or a repo-owned resource | the IR is a standard; non-agents are files, not escape hatches |
| `steps` / an "ABI" of work/change/model | nothing — that logic lives in the agent's behavior | the IR must not know issues, PRs, or models |
| `box.model` / `skill` vs `script` | nothing — the box always has a model; execution is the substrate's | those leaked the box's execution model into the IR |
| `commit` / `propose` on capabilities | trust = substrate security (derived); review = policy | capabilities are pure authority |
| `agent` as the sole unit | the **actor** (kinds: `agent`, `human`) | a person is a first-class participant, not negative space |

Every future change is *filling in the standard* — a new capability, param source, config key, or
task-lifecycle state, plus a substrate realization. The four-slot **actor** (genus; kinds `agent` and
`human`) and the standard/implementation/conformance split are the invariant.

---

## Capabilities

The agent authority model.

A profile **declares** what each agent may do as substrate-agnostic capabilities. A capability is **not**
an instruction handed to a mediator — it **is a grant on the agent's own credential**. The substrate mints
the agent a credential scoped to exactly its capabilities, and the agent does its own reads and its own
writes **in-process**. Capabilities never name a substrate's resources (no `issue`, `pr`, `branch`,
`workflow`); they name only the universal things an agent acts on.

There are exactly **two guards**, and nothing else:

- **capabilities** — *what* the agent may do (its scoped credential).
- **budget** — *how much* it may spend (the bounded model token).

### The three nouns

An autonomy agent acts on exactly three things:

| noun | what it is | github | local (sketch) |
|---|---|---|---|
| **code** | the codebase under version control | the repo / branches | the working tree |
| **tasks** | units of work + their discussion | issues | a work-store |
| **agent** | the other agents + their lifecycle | workflow runs | the loop queue |

(`merge` is the tell: it's a version-control operation, so the noun is honestly **code**, not a vague
"artifact." That's substrate-agnostic at the *git* level — github and local are both git repos — not a
github leak.)

### The capabilities

| capability | meaning | github realization |
|---|---|---|
| `code:propose` | propose a change (write a feature branch, open a PR, queue auto-merge, dispatch CI) | `contents: write` + `pull-requests: write` + `actions: write` |
| `code:review` | **bless** a change for merge (post the verdict that gates landing) | `statuses: write` (posts the `agent-review` status) |
| `code:merge` | **land** a reviewed change onto the default branch | **never granted to anyone** — landing is native auto-merge (see the merge boundary) |
| `tasks:author` | create / update / label / set state of work | `issues: write` |
| `tasks:converse` | post comments / verdicts on work and changes | `issues: write` (comment scope) |
| `agent:launch` | start another agent | `actions: write` (dispatch) |
| `agent:list` | observe running agents | `actions: read` |
| `agent:update` | pause / resume / retry another agent | control plane |
| `agent:cancel` | stop another agent | `actions: write` + control plane |

`observe` (read the code and tasks) is **baseline** — every agent has it; it is not a declared
capability. Reads are bounded by the agent's sandbox + budget, never by a permission.

The `agent:*` axis is exactly the **Runner contract** (`core/runner.ts`: launch / list / update / cancel
over sessions) — the substrate-agnostic definition of the agent lifecycle ([§The Runner](#the-runner)).

**Scope (optional).** A capability may carry a resource scope: `code:propose@roadmap` = "propose changes
to roadmap files only" (the strategist's governance constraint, expressed as a scoped capability, not a
deterministic guard script). The constitution's `human_required_paths` / `topics` are the global
complement — the region **no** capability may ever reach.

### The trust model: agents are credentialed; only merge is gated

The agent runs with a credential **scoped to its capabilities** and acts directly. There is no
credential-less job, no bundle, no trusted publisher mediating its output. The one threat that justifies a
boundary is **prompt injection** via untrusted input (issue bodies, fetched pages, fork diffs) — and that
justifies a boundary only for the **irreversible, default-branch-affecting** power:

> **The single hard boundary: an agent can never merge.** `code:merge` is never grantable to an agent.

Everything an agent *can* do is recoverable, because the substrate is configured so a hijacked agent cannot
reach `main`, workflows, or secrets:

- **branch protection** on the default branch blocks direct push (a feature-branch PR is the only way in);
- the github **`workflows` permission** is never granted, so `.github/workflows` can't be edited even with `contents: write`;
- merging requires **two status checks — `ci` + `agent-review`** — and no single agent can produce both (see below);
- the install holds **no secrets** (the model token is OIDC-minted and bounded — that is the budget guard).

So a fully-hijacked `code:propose` + `tasks:converse` agent can, at worst, push junk to a feature branch
or post a bad comment — both reverted in seconds, neither touching `main`. (This is a deliberate, small
relaxation of the old "agent holds nothing" model; the cost is recoverable feature-branch/comment noise,
the gain is that agents are real agents instead of envelopes passed to a mediator.)

#### The merge boundary — a permission split, no app, no merge job

Landing on the default branch is gated by **two non-overlapping permission sets**, so no single agent can
land unreviewed code — and the merge itself is **GitHub native auto-merge**, not a token or an app:

- **`code:review` = `statuses: write`** — the authority to *bless* a merge (post the `agent-review` verdict
  status). The reviewer holds this and **not** `contents: write`, so it can certify but cannot merge.
- **`code:propose` = `contents: write`** — the authority to push a branch / open a PR / queue auto-merge.
  Proposers hold this and **not** `statuses: write`, so they can push but cannot self-certify a review.

Branch protection requires `ci` + `agent-review` (0 approvals — so there's no self-approval problem and no
app is needed). The proposer enables auto-merge when it opens the PR; **GitHub** lands it the instant both
statuses are green. Consequences:

- a hijacked **proposer** can't post `agent-review` → can never land anything the reviewer didn't bless;
- a hijacked **reviewer** has no `contents: write` → can't merge or push at all;
- **no agent holds `code:merge`** — it isn't a token capability; the platform performs the merge.

`code:review` (bless) and the merge (perform) are deliberately separated; no agent holds both. That split —
not a dedicated app or a trusted gate job — *is* the merge boundary.

#### The deploy boundary — the merge boundary's sibling, at the production edge

Merge guards what reaches `main`; **deploy** guards what reaches *production*, and the same principle holds
one step out: **no agent deploys.** Deploy is not an agent job and not a capability any agent holds — it is a
human-promoted, gated effect realized by the **code host** (github CI), independent of which substrate runs
the agents (a local-substrate org still deploys via its github repo — deploy is a code-host concern, not a
runner one). The realization:

- deploy fires only on a **human-cut promotion tag** (e.g. `deploy-v*`), restricted by repo ruleset to admins
  — the fleet's `contents: write` cannot create it;
- the deploy job runs in a **required-reviewer environment** (a maintainer approves each deployment;
  admin-bypass off);
- the deploy *workflow itself is a code-host resource* carried by the profile (like `ci.yml` — not engine
  output, see `docs/CODE_HOST_RESOURCES.md`), and the worst case is bounded **outside** the trust loop
  (provider-side spend caps + instant rollback), since the agents are funded by what they could deploy.

So merge and deploy are the two production boundaries: an agent may propose code and an agent may bless a
review, but **no agent lands on `main` and no agent ships to production** — each requires the human/native gate.

#### Contract constants vs tunable policy — which names belong to the standard

Two kinds of names cross the seam, and conflating them has produced both failure modes: hardcoding org
policy into substrate machinery (a runtime script shipping its own copy of an org's hold-label list into
every install), and the temptation to parameterize the seam itself (which would let one install silently
rename the thing every component must agree on).

- **Contract constants** — names independent components must agree on **at author time** for the seam to
  function: the proposer dispatches checks by name, branch protection requires them by name, the control
  plane applies/clears labels by name, the human gate reads them by name. They are part of `autonomy.ir.v1`'s
  realization; renaming one is a **spec change** coordinated across components, never a per-org knob.
  - status contexts: `ci`, `agent-review` (the merge boundary above), and `human-approval` — the
    additional required check shipped by gate-carrying profiles, re-earned **per head SHA**;
  - labels: `human-required` and `agent-develop-only` (the human-approval gate's scope triggers),
    `agent-paused` (the control plane's pause-verb marker), `needs-info` and `agent-blocked` (the
    human-block labels the control plane's `decide`/`answer` resolutions clear);
  - the agent branch prefix `agent/`.
- **Tunable policy** — a `policy.box` parameter **with a reader** (a declared key nothing reads doesn't
  exist — `check:policy-consumers` makes that state unrepresentable): `merge.maintainer_block_labels`,
  `risk.human_required_paths` / `human_required_topics`, `human.sla_minutes` / `maintainers_var`, the
  planner's label prefixes. Declared per profile, read at **runtime** from the compiled
  `.open-autonomy/autonomy.yml`; an org tunes them per install and no component changes.

The rule for a new name: **if a component must know it at author/compile time** (baked into a script, a
workflow expression, branch protection), it is a contract constant — record it here, export it as a code
constant where machinery needs the list (preflight seeds its expected labels from that export plus the
install's declared policy), and treat renames as spec changes. **If every consumer can read it at runtime
from the manifest**, it is policy — declare it under `policy.box` and wire the reader. One question decides;
both misfilings are bugs.

### The agent lifecycle (what replaced prepare / interpret)

```
provide            →     skill                    →     effect
(substrate hands the     (judges; emits result =        (the agent's own scoped
 trigger's subject in)    intent in capability terms)    actions — direct, in-process)
```

- **provide** — the substrate materializes the trigger's *subject* (a PR's diff+checks, an issue, …) into
  the sandbox. Generic; the only variable is which subject, declared by the trigger.
- **skill** — does the work and emits its typed `result`.
- **effect** — the agent invokes its own capabilities directly. There is no merge step to route to: the
  reviewer posts `agent-review` (`code:review`), the proposer queued auto-merge, and GitHub lands it.

There are no `prepare` / `interpret` scripts and no `config` hooks: "input gathering" is `provide`; "acting
on the result" is the agent using its own capabilities.

### github realization — the mapping is the whole story

The github substrate computes the agent job's `permissions:` block straight from its capabilities (the table
above). That is the entire realization: a normally-credentialed job, scoped. No wrapper of trusted jobs
around a credential-less core — the agent IS the job. There is no merge gate job and no app: landing is
native auto-merge gated by the `ci` + `agent-review` required checks, and the permission split keeps any one
agent from satisfying both.

`config.permissions` does not exist; gh permission blocks are *computed*, never written in the IR.

### The OA agents, declared in this model

| agent | capabilities |
|---|---|
| pm | `tasks:author`, `tasks:converse`, `agent:launch` |
| developer | `code:propose`, `tasks:converse` |
| reviewer | `code:review`, `tasks:converse` (posts `agent-review`; no `contents` → cannot merge) |
| strategy_reviewer | `code:review`, `tasks:converse` (blesses a roadmap proposal; cannot merge) |
| planner | `tasks:author`, `tasks:converse` |
| strategist | `code:propose@roadmap`, `agent:launch` |

No agent holds `code:merge`.

### What is NOT a capability

- **Observation** — baseline; reads are bounded by the sandbox + budget, not a permission.
- **Model access / budget** — the bounded model token (the budget guard), provisioned by the substrate; the
  IR declares the `budget`, not the credential.
- **Trust mediation** — no longer a concept. The old "untrusted agent → bundle → trusted publisher" design
  is replaced by scoped credentials + the merge boundary (the `code:review` / `code:propose` permission
  split + native auto-merge). There is no trusted mediator, no merge gate job, and no app.

---

## Trigger params

The cross-substrate contract.

A trigger fires an agent and **forwards params to it** — the producing end of the Runner contract's
`launch(agent, params)` (opaque `LaunchParams`). This is how an agent learns *what to act on* —
explicitly, from declared config, **never** by reaching into a substrate's implicit event context.

### The shape

In the IR, a trigger may declare `params`:

```yaml
triggers:
  - event: issues
    config: { types: [labeled] }
    params: { ISSUE: subject.ref }       # opaque name  ->  documented source
```

- **Param name** (`ISSUE`) — the profile's choice. **The core never interprets it**; it only wires it
  through to `launch(agent, params)`.
- **Source** (`subject.ref`) — drawn from the **documented vocabulary below**. Every substrate MUST be
  able to resolve each documented source from its own firing context.

The agent receives the resolved params (github: as job env; local: as `AUTONOMY_FORWARD` env) and its
**tooling** interprets them (`gh` on github, ztrack on local). The substrate's own runtime may also use
a resolved source for its realization (github fetches the `subject.ref` work item to bundle/PR it) — but
that is the substrate reading the *documented* source, not implicit event magic.

### The source vocabulary (every substrate must implement these)

| source | meaning | github resolves from | local resolves from |
|---|---|---|---|
| `subject.ref` | id of the work item that fired the trigger | `event.issue.number` / `event.inputs.issue_number` / `event.pull_request.number` | work-store item id |
| `subject.actor` | who initiated it | `event.sender.login` / `github.actor` | requester |
| `subject.actorRole` | the actor's authority over the project (for gating privileged commands); empty if N/A | `event.comment.author_association` (OWNER/MEMBER/COLLABORATOR/…) | requester's role |
| `subject.text` | the text that fired it (comment/body); empty if N/A | `event.comment.body` / `event.issue.body` | queued message |
| `trigger.kind` | why it fired | `event.action` / `event_name` | queue event kind |

A source a substrate cannot resolve for a given trigger resolves to empty — the agent's tooling decides
what to do with that. New sources are added here first, then implemented by each substrate; profiles
depend only on this vocabulary, never on a substrate's raw event shape.

### How github realizes it (reference)

`compileGithub` unions an agent's declared trigger params, resolves each source via the table above into
the `setup` and agent job env (keyed by the opaque param name), and the agent fetches its work item from
the `subject.ref` param via `gh` — replacing the old implicit `$GITHUB_EVENT_PATH` reach-in. The run id
is deterministic per run, so no params are threaded between jobs.

---

## Task lifecycle

The cross-substrate state vocabulary.

`tasks` is one of the three nouns ([§Capabilities](#capabilities)). The IR already models *authority over* tasks
(capabilities) and *triggers on* tasks (events), but it did **not** model the **state** of a task. This
catalog adds that — a small, portable set of lifecycle states — so a trigger or a handoff can name *the
state a task is in* without reaching into a substrate's raw events or label strings.

It is a catalog, peer to [§Capabilities](#capabilities) and [§Trigger params](#trigger-params): purely additive. The state lives in
the profile's **tracker** (a github issue, a ztrack item) and is **read by the orchestrator** — it is not
realized per substrate, because no substrate watches it.

### The states

| state | meaning |
|---|---|
| `open` | created, not yet triaged |
| `ready` | triaged, ready for an actor to work |
| `working` | an actor is acting on it |
| `in-review` | a change is proposed, awaiting review |
| `input-required` | blocked awaiting input from a named party (see below) |
| `blocked` | cannot proceed (policy / repeated failure / budget) |
| `done` | completed |
| `rejected` | terminal, not done (duplicate / spam / wontfix / failed) |

A profile maps these to its tracker's own state names (e.g. ztrack's `Ready` / `In Progress` /
`In Review` / `Done`); the orchestrator reads them there.

`input-required` carries a **from** in the seam (who must supply the input): `requester` (OA's existing
`needs-info`) or `maintainer` (OA's existing `human-required`). The state is portable; the *who* is part
of the handoff payload, not a separate state.

These are not new inventions — they consolidate vocabulary OA already uses (`needs-info`,
`human-required`, `agent-blocked`, and the stop-states in `ROADMAP.md`) into a portable set.

### How the orchestrator uses it

A task's state is a **property the orchestrator reads** — it is **not** a trigger. There is no `task:`
trigger and no substrate that watches task state ([§The Runner](#the-runner)). The dispatcher (the PM, on `cron`)
reads each work item's state off the tracker and `launch`es the matching worker (a `dispatch` actor)
through the Runner:

```
PM tick (cron) → read board → issue is `ready` → launch the developer (dispatch) with the item as --ref
```

This is why the lifecycle is portable without any substrate machinery: the only primitives the substrate
must provide are `cron` (time) and `launch` (the Runner) — both universal. The substrate-native `event:`
form remains as an escape hatch (partial-support is first-class — see [§The IR](#the-ir)).

### How a handoff uses it

A handoff (a **seam**, see [§Handoffs](#handoffs)) is a typed edge over this lifecycle: an upstream actor's
work *produces* a state transition; the orchestrator *reads* it and dispatches the downstream actor. The
lifecycle is the shared vocabulary that makes the producing and consuming ends name the same thing.

New states are added here first. A profile's skills depend only on this vocabulary (mapped to their
tracker's own states, e.g. ztrack), never on a substrate's labels or event names.

### Done is verified, not presumed

A task — agent or human — reaches `done` only when its **acceptance criteria (AC)** are *verified*, by a
**deterministic check and/or an AI-judge check** (the reviewer agent is OA's existing AI-judge for agent
work). There is **no `presumed-done` transition**: an elapsed timer or a sent notification never makes a
task `done`. A triggered task with no verified result is `pending` (or `blocked`/`failed`/escalated),
never `done` — otherwise a task with no result is silently counted complete.

This applies to humans too: a human is an untrusted, opaque actor (like a model agent), so the *claim*
"I did it" is validated by a check on the **effect**, not taken on faith. The check verifies the effect;
it cannot verify diligence (a human can rubber-stamp, an agent can be right by luck) — that residue is
covered by **accountability** (an attributable, on-record decision), not verification.

A human touchpoint is therefore exactly one of two things:

- **Verified task** — has an AC + check (deterministic and/or judge). Reliable outcome → it *can block*
  the flow (resume on verified done) → it *counts* as human work → it *reduces autonomy* (the org waited
  on a person). The resolution must be an **explicit, authorized act** (e.g. an `/agent approve` command
  gated by `subject.actorRole`, or a native review) — a closed loop, not a value inferred from prose.
- **Notification** — no AC (`presumed-done`). No reliable outcome ⇒ it is **fire-and-forget**: it *must*
  be non-blocking, must *not* be counted as completed work, and does *not* reduce autonomy. This is a
  legitimate, declared mode — "as good as a notification" — you just may not pretend it is more.

The **ask type** decides which is required: `inform` → notification (no AC); `do` / `decide` / `approve`
→ outcome required → AC + check mandatory. The forbidden middle is a task that gates or counts on a human
but has no AC — that fabricates completion. (The lifecycle rule: an unanswered handoff is `humanPending`,
and a flow is `complete` only when no handoff is left unresolved.)

---

## The Runner

The universal actor-control seam.

The Runner is the one seam through which the system **runs, lists, and stops actors**. It is the agent
graph's control plane: an orchestrator (e.g. the PM) never reaches into `gh`, `termfleet`, Slack, or a
person directly — it calls `run` / `list` / `stop` and the Runner realizes them. This is peer to
[§Capabilities](#capabilities) (authority over the nouns) and [§Task lifecycle](#task-lifecycle) (the work-item state vocabulary).

### The nouns, kept distinct

- **task** — a *work item* (a github issue, a ztrack item). Its lifecycle (`ready`/`in-review`/… —
  [§Task lifecycle](#task-lifecycle)) is a **property of the task**, read by the orchestrator. It is **not** a trigger.
- **actor** — `agent | human` (the IR unit, [§The IR](#the-ir)). What *does* the work.
- **action / run** — *an actor working a task*. The thing you observe "right now" ("a `develop` agent is
  running on #5"; "a `maintainer` approval is pending on #3"). An action is what `list` returns.

### The interface (`packages/core/src/runner.ts`)

All verbs are **async** (return `Promise`s) — a backend may talk to a provider over the network:

```
launch(agent, params?) -> Promise<Session>     # C — start/engage an action; returns a Session
get(id)                -> Promise<Session?>     # R — one
list()                 -> Promise<Session[]>    # R — in-flight
update(id, {status})   -> Promise<boolean>      # U — apply a status transition
cancel(id)             -> Promise<boolean>      # D — stop / retract
```

`Session = { id, agent, status, ref?, params? }`; `params` is opaque pass-through (the runner never
interprets it). Agent realizations may additionally stream logs (a `watch`); human realizations cannot.

Completion is **not the runner's call to invent** — `done` is reached only by an `update` carrying a
**verified** result (an AC + a deterministic and/or AI-judge check), never presumed from a timer or a sent
notification ([§Task lifecycle](#task-lifecycle), "done is verified, not presumed"). Until then a session is `running`; it
may end `cancelled` or `failed`, never silently `done`.

### One interface, realized by (actor kind × substrate)

| realization | launch | list | update / cancel | watch |
|---|---|---|---|---|
| **agent × github** | `gh workflow run` (workflow_dispatch) | `gh run list` | `gh run cancel` | run logs |
| **agent × local** | termfleet SDK `createAgentWindow` | `snapshot().windows` | `closeWindow` | tail |
| **human × any** | **engage** (record the action; an optional black-box backend notifies a person) | **in-flight asks** | `update` = apply the verified resolution / `cancel` = retract | **— none —** |

The orchestrator calls the same verbs regardless of kind; the actor's `kind` selects the realization (and,
for agents, the substrate selects the backend).

### The human runner is a black box

You cannot *execute* or *watch* a person, so the human realization is the Runner's degenerate twin: it
implements the same `launch`/`get`/`list`/`update`/`cancel` but **has no `watch`** — you can't look over
someone's shoulder; the only progress you ever observe is the **completion boundary**, applied via
`update(id, {status:'done'})` by an authorized verified act (e.g. `/agent approve` gated by `actorRole`, a
native review, or supplied info a check validates). The no-op floor (`HumanRunner` with no `engage`) is pure
**bookkeeping**: `launch` records the parked action and it stays `running` forever — it never sets `done`
itself. How the ask is delivered and the reply detected — Slack, github issue comments, email, an agentic
notifier — is an **opaque, swappable `engage` backend**; the runner only ever exposes the five verbs +
session status, never the channel.

### Consequences

- **`dispatch`** is the IR trigger meaning "this actor is invoked on demand through the Runner" (vs the
  autonomous `cron`/`event` triggers); `kind` picks agent-execution vs human-engagement.
- There is **no `task:` trigger** — `task` is the work item; a lifecycle state is its property, which the
  orchestrator reads when deciding what to `launch`.
- There is **no separate ledger or steward** — the "ledger" is `list()`; the orchestrator (the PM) is the
  single place that launches agents, engages humans, and resumes on either's verified completion, applying
  capacity / retry / backpressure uniformly because every dispatch flows through it.

### Status

- One `Runner` contract (`packages/core/src/runner.ts`): `launch`/`get`/`list`/`update`/`cancel`.
- Agent realizations: `ExecRunner` (reference), Termfleet (local), Github — built + conformance-tested.
- Human realization: `HumanRunner` — **built** as the no-op (bookkeeping) floor that conforms to the same
  contract; a notifying `engage` backend and PM wiring are the `actor-model-human-handoffs` next steps.

---

## Handoffs

How actors trigger each other (and humans).

> **Status:** design note feeding H1 (`docs/VISION.md`). Grounded in established prior art, not invented.
> Defines how participant-to-participant handoff works in OA, and what is missing to make it explicit,
> typed, and substrate-neutral. Companion to [§The IR](#the-ir), [§Task lifecycle](#task-lifecycle),
> [§Capabilities](#capabilities), and [§Trigger params](#trigger-params).

### The core fact: actors don't trigger each other — they trigger `tasks`

In OA an actor doesn't call another actor. It changes the state of a **task**, and the next actor's
trigger fires on that change. The profile already works this way: PM labels an issue → `developer`'s
trigger fires; `developer` opens a PR → `reviewer`'s trigger fires. Nobody named the developer or the
reviewer; the task state change is the handoff.

This is a named, well-studied model — **choreography** (no central conductor; each participant reacts to
state others leave), implemented as a **blackboard** (participants coordinate through shared state, never
by calling each other), whose formal semantics are a **Petri net** (a token in a place *enables* the next
transition). The task — the issue/PR and its lifecycle — is the token. The work-store you don't need to
invent is just `tasks`, made stateful ([§Task lifecycle](#task-lifecycle)).

Consequence: **OA needs no agent-to-agent messaging, no orchestrator, no new protocol.** Handoffs flow
through the shared, visible `tasks` state, which is also the audit trail. `agent:launch` (the Runner
contract) remains the *orchestration escape hatch* for a direct, named transfer — used sparingly, as PM
already does (a visible command comment for audit + a direct dispatch for reliable delivery).

### The two axes (the whole design space)

Every system studied — microservices, actors, Kanban, workflow engines, classical MAS, LLM frameworks —
sits in a 2×2:

- **Axis A — who decides the next actor: orchestration vs choreography.** Central command to a *named*
  target (visible flow, but coupling / a "god service" risk) vs decentralized reaction to *state/events*
  (decoupled, but the flow is implicit). *(Richardson, Newman, Fowler.)* OA is choreography by default —
  and choreography's usual weakness (invisible flow) does not bite, because the flow lives in visible
  `tasks` and **typing the seams makes the otherwise-implicit graph explicit.**
- **Axis B — who initiates: push vs pull.** Upstream shoves work down (no backpressure; queues blow up as
  utilization → 1, per Little's Law / Kingman) vs downstream *claims* when it has capacity, gated by a
  token. **Pull is the only mode with intrinsic backpressure.** *(Hopp & Spearman, TPS/Kanban.)* OA's
  `maxConcurrent` + `max_open_agent_prs` + PM-sweeps-when-capacity-allows is already pull + WIP limits —
  lean into it as the stability mechanism.

Four archetypes fall out; OA uses two: **choreography + token-enabled** (default, over `tasks`) and
**directed command** (the `agent:launch` escape hatch). For *content*, OA follows the declarative lineage:
**typed task, not whole-context** (Contract Net's announcement, A2A's `Task`, LangGraph's
`Command(update, goto)`) — not the LLM-framework habit of shipping the whole transcript.

### The unit: an actor (agent or human)

A handoff target may be a machine or a person, so the one unit is an **actor** with a `kind`
([§The IR](#the-ir)). The four slots are identical for both:

| slot | `kind: agent` | `kind: human` |
|---|---|---|
| behavior | script / skill | a task spec for a person (situation / decision / result) |
| capabilities | artifact/tasks/agent authority | *same vocabulary* — what the person may do |
| triggers | cron / event / `dispatch` | *same* — the person is `dispatch`ed (engaged on demand) when the orchestrator routes work to them |
| config | timeout, model, … | assignee/candidates, escalation, sla, decision (RACI) |
| realization | substrate runs it (deterministic / model-interpreted) | a real person (prod) or a **simulator** (test); notifies + escalates + blocks until the token is redeemed |

`kind` (the **role**) is **intrinsic and declared** in the profile; *realization* (how the role is filled
— script, model, real person, or a **simulator** in test) is the substrate's/environment's choice. (This
corrects the earlier "human-interpreted = a third execution mode" framing — `human` is a kind;
person/simulator are realizations of it.)

### The seam: a typed edge over the lifecycle

A **seam** is the typed handoff between an upstream actor's output and a downstream actor, mediated by the
orchestrator reading the task lifecycle:

```
upstream actor  ──produces──▶  task enters state S  ──orchestrator reads S──▶  dispatches the downstream actor
```

The seam carries a typed payload — validated by the structured-handoff research (clinical SBAR / I-PASS):

- **in** — what the upstream presents (situation + background + assessment).
- **decision** — what is asked (the RACI/DACI type: do-the-work / decide / approve / consult / inform).
- **out** — what is returned to resume, **with receiver confirmation** (I-PASS "synthesis by receiver":
  the handoff is not complete until the receiver confirms — a closed loop).

For agent→agent, the producing side is often implicit today (the behavior sets the state); typing it
explicitly is later work (the seam graph that the twin reads). For the human seam it is essential.

### The human seam = the same seam + four affordances

Triggering a human is triggering an actor **plus** the things humans need because they have unbounded
latency and no polling loop. Each maps to a clean piece of prior art:

1. **Durable, indefinite pause + redeem handle** — the flow blocks until the human redeems a token.
   *Analog: AWS Step Functions `waitForTaskToken` / Temporal Signals.*
2. **A worklist they pull from + a push path** — offer-to-many → claim. *Analog: BPM candidate-group +
   claim / Camunda external-task fetch-and-lock; van der Aalst resource patterns (offer vs allocate,
   push vs pull).*
3. **An escalation policy** — notify → ack-or-timeout → escalate → rotate to whoever is on-call now →
   repeat. Two axes: escalate if not **acknowledged**, re-trigger if not **resolved**. *Analog: PagerDuty
   / Opsgenie escalation policies.*
4. **A structured payload + closed loop** — the seam's `in`/`decision`/`out` + receiver confirmation.
   *Analog: SBAR / I-PASS; RACI/DACI for the decision type.*

The seam is identical; the `kind: human` realization adds these. A2A's `input-required` task state is the
model for "needs more info mid-task," including when that info comes from a person.

### Testing actors / simulating humans

An org with human actors must be testable **without** real humans — otherwise the Bench leg can't run on
any realistic org (autonomy ratio < 100% always). So human simulation is a *precondition* for Bench, not a
convenience. The actor model makes it work because the **seam is the substitution boundary**: anything
that honors a seam can fill the role. The *same profile* runs in production with people and in a testbed
with **simulators** — only the substrate's *realization* of `kind: human` actors differs (realization is
the substrate's/environment's concern, not the profile's).

Three properties make a human actor simulatable, and the design already provides them:

- **A typed, machine-producible payload.** A simulator must consume `in` and produce `out`. A free-form
  prose handoff is not simulatable — so testability is an *independent* reason the seam payload is typed
  (`in`/`decision`/`out`), not just human-readable.
- **A redeem handle decoupled from identity.** The flow blocks on a token *anyone holding it* can redeem
  (the Step Functions `waitForTaskToken` model). A person or a simulator resumes the flow identically.
- **Realization supplied by the environment.** The testbed is a test realization of the substrate; it
  supplies simulators for `kind: human` actors via a testbed-level fixtures file (`actor → simulated
  behavior`). The profile stays environment-agnostic.

Human simulators come in tiers, by use:

- **Fixture** — deterministic ("maintainer approves after 1h unless the diff touches workflows"); for
  reproducible proof/unit tests.
- **Distributional** — samples latency + approve/reject from a distribution; feeds the **twin** (which
  needs distributions, not averages).
- **Model-roleplay** — a model plays the role per a persona/rubric; for rich bench scenarios.

Simulators are **calibrated from real human-seam measurements** (H3), and the twin↔testbed division
applies to humans too: the **simulator is the cheap screen; the real human in dogfood is the ground
truth** that calibrates it. Two cautions: an *optimistic/uncalibrated* human sim yields fitness numbers
that don't reflect reality (same trap as averages-not-distributions); and optimizing an org against a
predictable simulator invites **Goodhart** (designs that exploit the sim). So: sims for screening,
real-human dogfood for truth.

This is distinct from hand-driving the autonomy: a deterministic simulator *substitutes a human input* so
the autonomy runs unattended and reproducibly — it does not drive the autonomy. A deterministic sim is in
fact *better* for measurement validity than a real operator, which would contaminate the run.

### What changes (and what doesn't)

**Doesn't change** — the mechanism is already right: choreography through `tasks`; `agent:launch` as the
escape hatch; `maxConcurrent`/`max_open_agent_prs` as pull/WIP backpressure; the four-slot unit, the
capability model, the trust/wrapper split.

**The real delta** — the substrate-coupled, untyped part is the *trigger* (today it names raw github
events: `event: issues`, `pull_request_target`). The changes make the handoff edge portable, typed, and
give the human edge a declared consumer:

1. **`tasks` lifecycle catalog** — state vocabulary the orchestrator reads ([§Task lifecycle](#task-lifecycle)). *Additive.*
2. **The `dispatch` trigger form** — an actor invoked on demand through the Runner (`{ dispatch: true; params? }`);
   `cron` + `dispatch` are the portable kinds, `event:` stays as the escape hatch. The orchestrator (PM)
   reads a task's state and `launch`es the matching actor — no substrate watches task state.
3. **The actor model** — `kind: agent | human` on the unit; `kind` declared, not inferred. The
   `kind: human` realization (worklist + escalation + durable-pause + payload) is the main new substrate
   build.
4. **Migrate `human_required` from a risk flag to a declared consumer** — `policy.box.risk.*` stays the
   *producer rule* that transitions a task to `human-required`; add a `maintainer` actor of `kind: human`
   that the orchestrator `dispatch`es when it reads that state, whose `out` (approve/reject, confirmed)
   resumes the merge gate. The side-effect becomes an explicit, typed handoff.

**Later (H4, the twin):** declare the *producing* side too, so the seam graph is explicit and measurable.

### The forks

1. Keep `event:` as a substrate-native escape hatch (recommended — partial support is first-class), with
   `cron` + `dispatch` as the portable path.
2. Payload *content* lives in the human behavior spec (opaque, like every behavior); only the `decision`
   *type* surfaces as a config key so the substrate routes approve vs consult vs inform.
3. *Holding* and reconciling task state (H2) and the producing-side seam graph (H4) are separate, later
   horizons — H1 needs only the lifecycle *vocabulary* + the `dispatch` trigger + the `kind: human` actor.

### Incremental proof

The `maintainer` actor ships as a `dispatch` `kind: human` actor: the orchestrator (PM) reads the
`human-required` state off a task and `launch`es the maintainer — the same portable seam on every
substrate (the `human` realization — worklist + escalation + durable-pause — is the new build). No
github-label-watching trigger is involved; task state is a property the orchestrator reads, not an event.
