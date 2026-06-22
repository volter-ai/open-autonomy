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

## The interface (`packages/core/src/runner.ts`)

```
launch(agent, params?) -> Session     # C — start/engage an action; returns a Session
get(id)                -> Session?     # R — one
list()                 -> Session[]    # R — in-flight
update(id, {status})   -> boolean      # U — apply a status transition
cancel(id)             -> boolean      # D — stop / retract
```

`Session = { id, agent, status, ref?, params? }`; `params` is opaque pass-through (the runner never
interprets it). Agent realizations may additionally stream logs (a `watch`); human realizations cannot.

Completion is **not the runner's call to invent** — `done` is reached only by an `update` carrying a
**verified** result (an AC + a deterministic and/or AI-judge check), never presumed from a timer or a sent
notification (`TASK-LIFECYCLE.md`, "done is verified, not presumed"). Until then a session is `running`; it
may end `cancelled` or `failed`, never silently `done`.

## One interface, realized by (actor kind × substrate)

| realization | launch | list | update / cancel | watch |
|---|---|---|---|---|
| **agent × github** | `gh workflow run` (workflow_dispatch) | `gh run list` | `gh run cancel` | run logs |
| **agent × local** | termfleet session | termfleet list | termfleet kill | tail |
| **human × any** | **engage** (record the action; an optional black-box backend notifies a person) | **in-flight asks** | `update` = apply the verified resolution / `cancel` = retract | **— none —** |

The orchestrator calls the same verbs regardless of kind; the actor's `kind` selects the realization (and,
for agents, the substrate selects the backend).

## The human runner is a black box

You cannot *execute* or *watch* a person, so the human realization is the Runner's degenerate twin: it
implements the same `launch`/`get`/`list`/`update`/`cancel` but **has no `watch`** — you can't look over
someone's shoulder; the only progress you ever observe is the **completion boundary**, applied via
`update(id, {status:'done'})` by an authorized verified act (e.g. `/agent approve` gated by `actorRole`, a
native review, or supplied info a check validates). The no-op floor (`HumanRunner` with no `engage`) is pure
**bookkeeping**: `launch` records the parked action and it stays `running` forever — it never sets `done`
itself. How the ask is delivered and the reply detected — Slack, github issue comments, email, an agentic
notifier — is an **opaque, swappable `engage` backend**; the runner only ever exposes the five verbs +
session status, never the channel.

## Consequences

- **`dispatch`** is the IR trigger meaning "this actor is invoked on demand through the Runner" (vs the
  autonomous `cron`/`event` triggers); `kind` picks agent-execution vs human-engagement.
- There is **no `task:` trigger** — `task` is the work item; a lifecycle state is its property, which the
  orchestrator reads when deciding what to `launch`.
- There is **no separate ledger or steward** — the "ledger" is `list()`; the orchestrator (the PM) is the
  single place that launches agents, engages humans, and resumes on either's verified completion, applying
  capacity / retry / backpressure uniformly because every dispatch flows through it.

## Status

- One `Runner` contract (`packages/core/src/runner.ts`): `launch`/`get`/`list`/`update`/`cancel`.
- Agent realizations: `ExecRunner` (reference), Termfleet (local), Github — built + conformance-tested.
- Human realization: `HumanRunner` — **built** as the no-op (bookkeeping) floor that conforms to the same
  contract; a notifying `engage` backend and PM wiring are the `actor-model-human-handoffs` next steps.
