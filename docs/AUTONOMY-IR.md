# Autonomy IR (`autonomy.ir.v1`) — the standard

> **Status:** finalized model; the codebase is being aligned to it. The terms `workflow`,
> `launch`, `run`, `raw`, `steps`, `box.model`, `skill|script`, `commit|propose` are **retired** — see
> "What this replaces" at the end. If the code still shows them, the code is mid-migration, not the spec.

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

## The one unit: an agent

There is no `workflow`, no `launch`/`run`/`raw`. There is one concept — an **agent** — with exactly four
slots:

```yaml
schema: autonomy.ir.v1
targets: [github, local]

agents:
  developer:
    behavior: skills/developer        # what it does — instructions/spec; the box runs it however
    capabilities: [artifact:author, tasks:converse]   # its authority (the standard's capability catalog)
    triggers:                          # when it fires + the params it forwards (subject.ref, …)
      - { event: issues, config: { types: [labeled] }, params: { ISSUE: subject.ref } }
      - { event: issue_comment }
    config: { timeout: 30 }            # opaque misc the substrate interprets (catalog below)

  planner:
    behavior: skills/planner
    capabilities: [tasks:author, tasks:converse]
    triggers: [{ cron: "17 6 * * *" }]
    config: {}

policy: { box: {} }                    # governance (merge/risk/…); substrate + agents read what they know
resources: [docs/standards/code.md]    # verbatim files; the standard never interprets them
```

| slot | what it is | who reads it |
|---|---|---|
| **behavior** | what the agent does — its instructions/spec | the substrate runs it (deterministic impl, or interpreted by a model — its choice) |
| **capabilities** | the agent's authority — from the capability catalog (`docs/CAPABILITIES.md`) | the substrate realizes each as permissions/mediation |
| **triggers** | when it fires + the **params** it forwards (the param-source catalog, `docs/TRIGGER-PARAMS.md`) | the substrate's trigger executor; only `cron` is portable, events are carried |
| **config** | opaque misc knobs (catalog below) | each substrate reads the keys it understands, ignores the rest |

`policy` (global governance) and `resources` (verbatim files) sit at the top level. That is the entire IR.

## The three catalogs (the standard's concrete vocabulary)

A profile depends **only** on these named vocabularies, never on a substrate's raw shapes. New entries
are added to a catalog first, then implemented by substrates — purely additive, never a restructure.

1. **Capabilities** (`docs/CAPABILITIES.md`) — the agent's *authority*, over three nouns:
   `artifact:author` · `tasks:author` · `tasks:converse` · `agent:launch|list|update|cancel`.
   Pure authority — capabilities do **not** encode trust (see below).
2. **Trigger param sources** (`docs/TRIGGER-PARAMS.md`) — what a trigger can forward to the agent:
   `subject.ref` · `subject.actor` · `subject.text` · `trigger.kind`. A trigger declares
   `params: { OPAQUE_NAME: source }`; the substrate resolves the source from its firing context.
3. **Config keys** — opaque misc the substrate interprets:

   | key | meaning | github | local |
   |---|---|---|---|
   | `timeout` | minutes before kill | job `timeout-minutes` | runner kill-after |
   | `concurrency` | serialization group | top-level `concurrency.group` | ignored |
   | `env` | extra env for the box | merged job `env` | exported to the agent |
   | `model.max_usd_cents` / `model.max_requests` | bounded model spend | mint bounds | local key budget |
   | `maxConcurrent` | per-agent cap | (realized via concurrency) | runner counts sessions |

   A substrate reads the keys it knows and ignores the rest; unknown keys round-trip but are inert.

## Trust, review, execution — three orthogonal things, none of them an IR slot

This is the distinction that took the longest to get right, so it is stated explicitly:

- **Execution** (deterministic vs model-interpreted) — the **substrate's choice** of how to run the
  agent's `behavior`. Not in the IR. The same agent may be a deterministic implementation on one
  substrate and model-interpreted on another.
- **Output trust** (does untrusted output need mediation before it touches the repo?) — the
  **substrate's security responsibility**, *derived* from execution: if it runs `behavior` via a model,
  output is untrusted → it mediates (github: a read-only agent emits a bundle → a separate trusted
  publisher validates and applies it); if it runs a deterministic implementation, direct. The IR can't
  run codex, so it can't mediate; declaring "untrusted" would not change that the substrate must
  implement it. So trust is **not** an IR field, and **not** a capability.
- **Change review** (does the resulting change get reviewed before merge?) — **policy** (`policy.box`:
  merge gate, reviewers, decision records).

If a profile ever needs to *override* trust (e.g. "mediate this even though it's deterministic"), that is
a **config key** — the open `config` slot absorbs it without any restructure.

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
event triggers; the operator control surface; trust mediation. Honored where present, declared
unsupported where not.

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

Every future change is *filling in the standard* — a new capability, param source, or config key, plus a
substrate realization. The four-slot agent and the standard/implementation/conformance split are the
invariant.
