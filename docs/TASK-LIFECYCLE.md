# Task lifecycle — the cross-substrate state vocabulary

`tasks` is one of the three nouns (`docs/CAPABILITIES.md`). The IR already models *authority over* tasks
(capabilities) and *triggers on* tasks (events), but it did **not** model the **state** of a task. This
catalog adds that — a small, portable set of lifecycle states — so a trigger or a handoff can name *the
state a task is in* without reaching into a substrate's raw events or label strings.

It is a catalog, peer to `CAPABILITIES.md` and `TRIGGER-PARAMS.md`: purely additive. The state lives in
the profile's **tracker** (a github issue, a ztrack item) and is **read by the orchestrator** — it is not
realized per substrate, because no substrate watches it.

## The states

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

## How the orchestrator uses it

A task's state is a **property the orchestrator reads** — it is **not** a trigger. There is no `task:`
trigger and no substrate that watches task state (`docs/RUNNER.md`). The dispatcher (the PM, on `cron`)
reads each work item's state off the tracker and `launch`es the matching worker (a `dispatch` actor)
through the Runner:

```
PM tick (cron) → read board → issue is `ready` → launch the developer (dispatch) with the item as --ref
```

This is why the lifecycle is portable without any substrate machinery: the only primitives the substrate
must provide are `cron` (time) and `launch` (the Runner) — both universal. The substrate-native `event:`
form remains as an escape hatch (partial-support is first-class — see `AUTONOMY-IR.md`).

## How a handoff uses it

A handoff (a **seam**, see `docs/HANDOFFS.md`) is a typed edge over this lifecycle: an upstream actor's
work *produces* a state transition; the orchestrator *reads* it and dispatches the downstream actor. The
lifecycle is the shared vocabulary that makes the producing and consuming ends name the same thing.

New states are added here first. A profile's skills depend only on this vocabulary (mapped to their
tracker's own states, e.g. ztrack), never on a substrate's labels or event names.

## Done is verified, not presumed

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
