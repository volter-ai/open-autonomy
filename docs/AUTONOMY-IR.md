# Autonomy IR (`autonomy.ir.v1`) — the standard

> **Status:** finalized model; the codebase is being aligned to it. The terms `workflow`,
> `launch`, `run`, `raw`, `steps`, `box.model`, `skill|script`, `commit|propose` are **retired** — see
> "What this replaces" at the end. If the code still shows them, the code is mid-migration, not the spec.
>
> **Actor model (current):** the one unit is the **actor** (`kind: agent | human`), and triggers gain a
> portable `{ task: <state> }` form (`docs/TASK-LIFECYCLE.md`). These supersede the agent-only framing
> where they differ; the code (`ir.ts`, the profile, the github substrate) is mid-migration to them.

## The shape of the whole thing

The IR is a **standard**. It concretely defines one unit (the *agent*) and three catalogs (capabilities,
trigger-param sources, config keys). A **substrate** (github, local, …) is a **partial implementation**
of that standard — it realizes the subset it supports, its own way. **Conformance** reports the support
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

## The one unit: an actor (agent or human)

There is no `workflow`, no `launch`/`run`/`raw`. There is one concept — an **actor** — with exactly four
slots. An actor has a **kind**: `agent` (a machine participant) or `human` (a person). The four slots are
identical for both; `kind` (the **role**) is **intrinsic and declared in the profile**, while
*realization* (how the role is filled — a script, a model, a real person, or a **simulator** in test) is
the substrate's/environment's choice. `kind: agent` is the default, so existing profiles are
unchanged. The slots:

```yaml
schema: autonomy.ir.v1
targets: [github, local]

actors:
  developer:                           # kind: agent (the default)
    behavior: skills/developer        # what it does — a SKILL (prose); run as a credentialed job
    capabilities: [code:propose, tasks:converse]   # its authority (the standard's capability catalog)
    triggers:                          # when it fires; three forms — cron | event | task (lifecycle)
      - { task: ready, params: { ISSUE: subject.ref } }   # portable: fire when a task enters `ready`
      - { event: issue_comment }                          # substrate-native escape hatch
    timeout: 30                        # a run-time bound (minutes) — the only non-capability field

  maintainer:                          # kind: human — a person; intrinsic, not a substrate choice
    kind: human
    behavior: humans/maintainer-review # the task spec the person is handed (situation / decision / result)
    capabilities: [tasks:converse, code:review]
    triggers: [{ task: human-required }]   # fire when a task needs a maintainer

  planner:
    behavior: skills/planner
    capabilities: [tasks:author, tasks:converse]
    triggers: [{ cron: "17 6 * * *" }]

policy: { box: {} }                    # governance (merge/risk/…); substrate + agents read what they know
resources: [docs/standards/code.md]    # verbatim files; the standard never interprets them
```

| slot | what it is | who reads it |
|---|---|---|
| **behavior** | what the actor does — a SKILL (prose); a `kind: human` actor's is the task spec a person is handed | the substrate *realizes* it: `kind: agent` → a credentialed job runs the skill via a model; `kind: human` → a real person (prod) or a simulator (test) |
| **capabilities** | the actor's authority — from the capability catalog (`docs/CAPABILITIES.md`); realized as the agent's own scoped token | the substrate realizes each as a permission on that token |
| **triggers** | when it fires + the **params** it forwards. Three forms: `cron`, substrate-native `event`, and the portable `task: <state>` (the task-lifecycle catalog, `docs/TASK-LIFECYCLE.md`) | the substrate's trigger executor; `cron` and `task` are portable, `event` is carried |
| **timeout** | optional run-time bound (minutes) — the only non-capability field | the substrate's job timeout |

An actor also carries a **kind** (`agent` | `human`, default `agent`) — a discriminator, not a fifth slot.
`kind` (the role) is the profile's; *realization* (how the role is filled — model/person/simulator) is the
substrate's (see Kind/realization below). `policy`
(global governance) and `resources` (verbatim files) sit at the top level. That is the entire IR.

## The four catalogs (the standard's concrete vocabulary)

A profile depends **only** on these named vocabularies, never on a substrate's raw shapes. New entries
are added to a catalog first, then implemented by substrates — purely additive, never a restructure.

1. **Capabilities** (`docs/CAPABILITIES.md`) — the agent's *authority*, over three nouns (code · tasks ·
   agent): `code:propose` · `code:review` · `code:merge` (gate-only) · `tasks:author` · `tasks:converse` ·
   `agent:launch|list|update|cancel`. A capability IS a grant on the agent's own scoped token.
2. **Trigger param sources** (`docs/TRIGGER-PARAMS.md`) — what a trigger can forward to the agent:
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

4. **Task lifecycle** (`docs/TASK-LIFECYCLE.md`) — the portable states a task can be in (`open` · `ready`
   · `working` · `in-review` · `input-required` · `blocked` · `done` · `rejected`). A `task: <state>`
   trigger fires when a task enters a state; a **handoff** (a seam, `docs/HANDOFFS.md`) is a typed edge
   over these states — an upstream actor's work produces a transition, a downstream actor's `task:`
   trigger consumes it. The substrate maps each state to its own events/labels.

## Kind, realization, trust, review — orthogonal axes (only `kind` is in the IR)

This is the distinction that took the longest to get right, so it is stated explicitly:

- **Actor kind** (`agent` vs `human`) — the **role**: intrinsic, declared in the profile (the one of
  these that *is* an IR field — the `kind` discriminator). You cannot turn a human *role* into a permanent
  script; that would be a *different org design*. `kind` says *who* the actor is — a different axis from
  realization (*how* the role is filled).
- **Realization** (how the role is filled) — the **substrate's/environment's choice**, not in the IR. For
  `kind: agent`: a credentialed job runs the skill via a model. For `kind: human`: a **real person** in
  production, or a **simulator** in a testbed — *same profile, different environment*. Filling the same
  role differently per environment is what makes an org with human actors **testable** (`docs/HANDOFFS.md`).
- **Safety** (can a hijacked agent do harm?) — the **capability/permission split**, not mediation. The
  agent acts directly with a token scoped to its capabilities; the one irreversible power — merge — is
  withheld from every agent (`code:review` = bless via status, `code:propose` = push, never both), so no
  agent can land unreviewed code (`docs/CAPABILITIES.md`). There is no credential-less job, no bundle, no
  trusted publisher. Safety is capabilities + budget — not an IR trust field.
- **Change review** (does the resulting change get reviewed before merge?) — the `code:review` status +
  branch protection (`ci` + `agent-review` required); native auto-merge lands it.

## The substrate: a trigger executor + a runner, over a box

A substrate factors into two implementables over one shared environment:

1. **Trigger executor** — fires an agent when its triggers say so and forwards the declared `params`.
   Decides *when*. Only `cron` is portable; events are carried and fired where supported.
2. **Runner** — runs agents and manages their lifecycle (the Runner contract, below), launching each into
   a box.

over

3. **The box** — the environment an agent runs in: POSIX fs + shell + git + **a model endpoint** + the
   installed files. The model endpoint is **always** part of the box (a deterministic agent simply never
   calls it) — there is no "does it get a model" knob.

On **local** the two are separate (the loop fires; termfleet runs). On **github** one platform fills both
(Actions `on:` fires; the Actions job runs). An agent never sees the trigger executor — from its seat
there is only the runner and the box.

### The Runner contract

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
operator always holds the full contract over a running agent (the control plane).

## What is NOT an agent

Not everything in an installation is an IR agent. Three kinds sit outside the standard:

- **Repo-owned files** (`ci.yml`, README, package.json, docs) — `resources`. The IR never models repo CI.
- **Substrate infrastructure** (github's model-proxy admin, the injected runtime, the control handler) —
  provided by the substrate, not declared in the profile.
- **Agents** (developer, planner, pm, reviewer, preflight, …) — the IR.

This is also why there is no `raw`: ingest maps a recognized agent to an agent, and anything else is a
repo-owned resource — never an escape hatch in the IR.

## Conformance — the support matrix

A substrate implements a **core** contract (required — any core-conformant substrate runs any IR) and an
**expanded** set it advertises. `scripts/autonomy-conformance.ts` drives the real runner against its real
backend and reports `supported`/`unsupported` per feature — extended, under this model, to the whole
standard (capabilities, param sources, config keys), not just Runner ops. `compile` warns when a profile
uses a feature its target does not support: **partial support is first-class, not failure.**

**Runner core (MUST):** `launch` / `list` / `cancel`, ids received (not invented), params passed verbatim.
**Trigger core (MUST):** fire `cron` and launch the agent. PM-on-cron is the universal dispatcher, so cron
alone yields a working fleet.
**Expanded (MAY):** `get`/`update`; enforce `maxConcurrent`/`timeout`/model-bounds/permissions; isolation;
event triggers; the operator control surface; the merge boundary (the capability/permission split +
native auto-merge). Honored where present, declared unsupported where not.

## Validation — by running it for real, not by tests

There are **no unit tests** of behavior. The only real confidence is running the actual app, with real
AI, on a real project. The conformance battery is the one deterministic harness (the substrate seam is
mechanical). Live-proven to date: the github agent wrapper (privilege-separated, OIDC-minted, trust
boundary intact) running a real codex agent end-to-end and opening a PR from a declared trigger param —
work resolved purely from `subject.ref`, no implicit event reach-in.

## What this replaces (and why)

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
