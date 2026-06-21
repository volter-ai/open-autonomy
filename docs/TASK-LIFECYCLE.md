# Task lifecycle — the cross-substrate state vocabulary

`tasks` is one of the three nouns (`docs/CAPABILITIES.md`). The IR already models *authority over* tasks
(capabilities) and *triggers on* tasks (events), but it did **not** model the **state** of a task. This
catalog adds that — a small, portable set of lifecycle states — so a trigger or a handoff can name *the
state a task is in* without reaching into a substrate's raw events or label strings.

It is a catalog, peer to `CAPABILITIES.md` and `TRIGGER-PARAMS.md`: purely additive, the profile depends
only on these names, each substrate maps them to its own machinery.

## The states

| state | meaning | github realization (reference) | local (sketch) |
|---|---|---|---|
| `open` | created, not yet triaged | issue opened, no triage label | work-store item, new |
| `ready` | triaged, ready for an actor to work | issue labeled ready (the agent-session label) | item marked ready |
| `working` | an actor is acting on it | an open agent PR / running session exists | item claimed |
| `in-review` | a change is proposed, awaiting review | PR opened (`pull_request_target`) | change submitted |
| `input-required` | blocked awaiting input from a named party (see below) | a `needs-info` / `human-required` label | item awaiting input |
| `blocked` | cannot proceed (policy / repeated failure / budget) | `agent-blocked` / a stop label | item blocked |
| `done` | completed | issue closed via merge | item completed |
| `rejected` | terminal, not done (duplicate / spam / wontfix / failed) | closed not-planned | item rejected |

`input-required` carries a **from** in the seam (who must supply the input): `requester` (OA's existing
`needs-info`) or `maintainer` (OA's existing `human-required`). The state is portable; the *who* is part
of the handoff payload, not a separate state.

These are not new inventions — they consolidate vocabulary OA already uses (`needs-info`,
`human-required`, `agent-blocked`, and the stop-states in `ROADMAP.md`) into a portable set.

## How a trigger uses it

A `task:` trigger fires when a task **enters** a state:

```yaml
triggers:
  - { task: ready }            # fire when a task becomes ready to work
  - { task: human-required }   # fire when a task needs a maintainer (input-required / from: maintainer)
```

The substrate maps the state to its firing context (github: a label transition / a PR event). This is the
portable form of a trigger; the substrate-native `event:` form remains as an escape hatch
(partial-support is first-class — see `AUTONOMY-IR.md`).

## How a handoff uses it

A handoff (a **seam**, see `docs/HANDOFFS.md`) is a typed edge over this lifecycle: an upstream actor's
work *produces* a state transition; a downstream actor's `task:` trigger *consumes* it. The lifecycle is
the shared vocabulary that makes the producing and consuming ends name the same thing across substrates.

New states are added here first, then realized by each substrate. Profiles depend only on this vocabulary,
never on a substrate's labels or event names.

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
but has no AC — that fabricates completion. (`scripts/autonomy-ratio.ts` enforces the measurement side:
an unanswered handoff is `humanPending`, and a flow is `complete` only when no handoff is left unresolved.)
