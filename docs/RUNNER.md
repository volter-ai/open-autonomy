# The Runner — the universal actor-control seam

The Runner is the one seam through which the system **runs, lists, and stops actors**. It is the agent
graph's control plane: an orchestrator (e.g. the PM) never reaches into `gh`, `termfleet`, Slack, or a
person directly — it calls `run` / `list` / `stop` and the Runner realizes them. This is peer to
`CAPABILITIES.md` (authority over the nouns) and `TASK-LIFECYCLE.md` (the work-item state vocabulary).

## The nouns, kept distinct

- **task** — a *work item* (a github issue, a ztrack item). Its lifecycle (`ready`/`in-review`/… —
  `TASK-LIFECYCLE.md`) is a **property of the task**, read by the orchestrator. It is **not** a trigger.
- **actor** — `agent | human` (the IR unit, `docs/AUTONOMY-IR.md`). What *does* the work.
- **action / run** — *an actor working a task*. The thing you observe "right now" ("a `develop` agent is
  running on #5"; "a `maintainer` approval is pending on #3"). An action is what `list` returns.

## The interface

```
run(actor, task, params)   -> handle     # start an action; returns a ref (a session id / an ask id)
list(actorOrClass)         -> action[]   # the actions in flight, with status — this IS the "ledger"
stop(handle)               -> void       # cancel an in-flight action
watch(handle)              -> stream      # OPTIONAL — live progress, only where the realization has it
```

Completion is **not a verb** — it is the `status` that `list`/`get` reports. An action is `done` only on a
**verified** result (an AC + a deterministic and/or AI-judge check), never presumed from a timer or a sent
notification (`TASK-LIFECYCLE.md`, "done is verified, not presumed"). Until then it is `pending`/`running`;
it may end `cancelled` (via `stop`) or `blocked` (timeout/policy), never silently `done`.

## One interface, realized by (actor kind × substrate)

| realization | run | list | stop | watch |
|---|---|---|---|---|
| **agent × github** | `gh workflow run` (workflow_dispatch) | `gh run list` | `gh run cancel` | run logs |
| **agent × local** | termfleet session | termfleet list | termfleet kill | tail |
| **human × any** | **engage the ask** (assign the task, set its human-required state, notify with the ask + AC) | **open asks** (by actor class) | **retract** (un-assign, clear the state) | **— none —** |

The orchestrator calls the same three verbs regardless of kind; the actor's `kind` selects the realization
(and, for agents, the substrate selects the backend).

## The human runner is a black box

You cannot *execute* a person, so the human realization is the Runner's degenerate twin: it has `run`,
`list`, `stop` but **no `watch`** — you can't look over someone's shoulder; the only progress you ever
observe is the **completion boundary** (the verified authorized act, e.g. `/agent approve` gated by
`actorRole`, a native review, or supplied info a check validates). A human action is largely **bookkeeping**:
the system records *that* a human of some class is expected to act and *which* task, so it knows the flow is
parked, on whom, and can reconcile + resume on the verified close, or escalate on staleness (→ `blocked`).

How the ask is delivered and the reply detected — Slack, github issue comments, email, an agentic
notifier — is an **opaque, swappable backend behind the interface.** The system reasons only about
`run`/`list`/`stop` + completion status; it never knows the channel.

## Consequences

- **`dispatch`** is the IR trigger meaning "this actor is invoked on demand through the Runner" (vs the
  autonomous `cron`/`event` triggers); `kind` picks agent-execution vs human-engagement.
- There is **no `task:` trigger** — `task` is the work item; a lifecycle state is its property, which the
  orchestrator reads when deciding what to `run`.
- There is **no separate ledger or steward** — the "ledger" is `list()`; the orchestrator (the PM) is the
  single place that runs agents, books humans, and resumes on either's verified completion, applying
  capacity / retry / backpressure uniformly because every dispatch flows through it.

## Status

- Agent realizations: github (gh-actions) and local (termfleet) — built.
- Human realization: the interface above is the spec; a concrete black-box backend is the
  `actor-model-human-handoffs` roadmap item.
