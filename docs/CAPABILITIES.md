# Capabilities — the agent authority model

A profile **declares** what each agent may do as substrate-agnostic capabilities. A capability is **not**
an instruction handed to a mediator — it **is a grant on the agent's own credential**. The substrate mints
the agent a credential scoped to exactly its capabilities, and the agent does its own reads and its own
writes **in-process**. Capabilities never name a substrate's resources (no `issue`, `pr`, `branch`,
`workflow`); they name only the universal things an agent acts on.

There are exactly **two guards**, and nothing else:

- **capabilities** — *what* the agent may do (its scoped credential).
- **budget** — *how much* it may spend (the bounded model token).

## The three nouns

An autonomy agent acts on exactly three things:

| noun | what it is | github | local (sketch) |
|---|---|---|---|
| **artifact** | the thing being built | the repo / contents | the working tree |
| **tasks** | units of work + their discussion | issues | a work-store |
| **agent** | the other agents + their lifecycle | workflow runs | the loop queue |

## The capabilities

| capability | meaning | github realization |
|---|---|---|
| `artifact:author` | propose a change (write a feature branch, open a PR) | `contents: write` + `pull-requests: write` |
| `artifact:merge` | **land** a reviewed change onto the default branch | **never granted to an agent** — see the merge boundary |
| `tasks:author` | create / update / label / set state of work | `issues: write` |
| `tasks:converse` | post comments / verdicts on work and changes | `issues: write` (comment scope) |
| `agent:launch` | start another agent | `actions: write` (dispatch) |
| `agent:list` | observe running agents | `actions: read` |
| `agent:update` | pause / resume / retry another agent | control plane |
| `agent:cancel` | stop another agent | `actions: write` + control plane |

`observe` (read the artifact and tasks) is **baseline** — every agent has it; it is not a declared
capability. Reads are bounded by the agent's sandbox + budget, never by a permission.

The `agent:*` axis is exactly the **Runner contract** (`core/runner.ts`: launch / list / update / cancel
over sessions) — the substrate-agnostic definition of the agent lifecycle.

**Scope (optional).** A capability may carry a resource scope: `artifact:author@roadmap` = "propose changes
to roadmap files only" (the strategist's governance constraint, expressed as a scoped capability, not a
deterministic guard script). The constitution's `human_required_paths` / `topics` are the global
complement — the region **no** capability may ever reach.

## The trust model: agents are credentialed; only merge is gated

The agent runs with a credential **scoped to its capabilities** and acts directly. There is no
credential-less job, no bundle, no trusted publisher mediating its output. The one threat that justifies a
boundary is **prompt injection** via untrusted input (issue bodies, fetched pages, fork diffs) — and that
justifies a boundary only for the **irreversible, default-branch-affecting** power:

> **The single hard boundary: an agent can never merge.** `artifact:merge` is never grantable to an agent.

Everything an agent *can* do is recoverable, because the substrate is configured so a hijacked agent cannot
reach `main`, workflows, or secrets:

- **branch protection** on the default branch blocks direct push (a feature-branch PR is the only way in);
- the github **`workflows` permission** is never granted, so `.github/workflows` can't be edited even with `contents: write`;
- **required checks + required review** gate every merge;
- the install holds **no secrets** (the model token is OIDC-minted and bounded — that is the budget guard).

So a fully-hijacked `artifact:author` + `tasks:converse` agent can, at worst, push junk to a feature branch
or post a bad comment — both reverted in seconds, neither touching `main`. (This is a deliberate, small
relaxation of the old "agent holds nothing" model; the cost is recoverable feature-branch/comment noise,
the gain is that agents are real agents instead of envelopes passed to a mediator.)

### The merge boundary

Merge is the only action that lands on the default branch irreversibly, so it is **never performed by an
agent**. It is performed by exactly one of:

1. a **human** (a maintainer merges, or approves so branch-protection auto-merge fires), or
2. **one thin trusted system gate** — not an agent — that merges when a reviewer's verdict says pass AND
   branch protection is satisfied (required CI green, head stable, not blocked).

A reviewer agent therefore **judges** (`tasks:converse` to post its verdict) but cannot merge; its verdict
is an input to the gate. That gate is the single surviving piece of trusted "effect" machinery in the whole
system — there is no per-agent mediator.

## The agent lifecycle (what replaced prepare / interpret)

```
provide            →     skill                    →     effect
(substrate hands the     (judges; emits result =        (the agent's own scoped
 trigger's subject in)    intent in capability terms)    actions — direct, in-process)
```

- **provide** — the substrate materializes the trigger's *subject* (a PR's diff+checks, an issue, …) into
  the sandbox. Generic; the only variable is which subject, declared by the trigger.
- **skill** — does the work and emits its typed `result`.
- **effect** — the agent invokes its own capabilities directly. The **only** exception is `artifact:merge`,
  which routes to the merge gate above.

There are no `prepare` / `interpret` scripts and no `config` hooks: "input gathering" is `provide`; "acting
on the result" is the agent using its own capabilities.

## github realization — the mapping is the whole story

The github substrate computes the agent job's `permissions:` block straight from its capabilities (the table
above). That is the entire realization: a normally-credentialed job, scoped. No wrapper of trusted jobs
around a credential-less core — the agent IS the job. The lone trusted extra is the system merge gate.

`config.permissions` does not exist; gh permission blocks are *computed*, never written in the IR.

## The OA agents, declared in this model

| agent | capabilities |
|---|---|
| pm | `tasks:author`, `tasks:converse`, `agent:launch` |
| developer | `artifact:author`, `tasks:converse` |
| reviewer | `tasks:converse` (judges; the merge gate lands it — the reviewer never merges) |
| strategy_reviewer | `tasks:converse` (judges a roadmap proposal; the gate lands it) |
| planner | `tasks:author`, `tasks:converse` |
| strategist | `artifact:author@roadmap`, `agent:launch` |

No agent holds `artifact:merge`.

## What is NOT a capability

- **Observation** — baseline; reads are bounded by the sandbox + budget, not a permission.
- **Model access / budget** — the bounded model token (the budget guard), provisioned by the substrate; the
  IR declares the `budget`, not the credential.
- **Trust mediation** — no longer a concept. The old "untrusted agent → bundle → trusted publisher" design
  is replaced by scoped credentials + the merge boundary. The only trusted actor is the merge gate.
