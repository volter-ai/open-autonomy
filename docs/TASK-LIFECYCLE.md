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
