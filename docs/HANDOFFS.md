# Handoffs — how actors trigger each other (and humans)

> **Status:** design note feeding H1 (`docs/VISION.md`). Grounded in established prior art, not invented.
> Defines how participant-to-participant handoff works in OA, and what is missing to make it explicit,
> typed, and substrate-neutral. Companion to `AUTONOMY-IR.md` (the spec), `TASK-LIFECYCLE.md` (the state
> catalog), and `CAPABILITIES.md` / `TRIGGER-PARAMS.md` (the other catalogs).

## The core fact: actors don't trigger each other — they trigger `tasks`

In OA an actor doesn't call another actor. It changes the state of a **task**, and the next actor's
trigger fires on that change. The profile already works this way: PM labels an issue → `developer`'s
trigger fires; `developer` opens a PR → `reviewer`'s trigger fires. Nobody named the developer or the
reviewer; the task state change is the handoff.

This is a named, well-studied model — **choreography** (no central conductor; each participant reacts to
state others leave), implemented as a **blackboard** (participants coordinate through shared state, never
by calling each other), whose formal semantics are a **Petri net** (a token in a place *enables* the next
transition). The task — the issue/PR and its lifecycle — is the token. The work-store you don't need to
invent is just `tasks`, made stateful (`TASK-LIFECYCLE.md`).

Consequence: **OA needs no agent-to-agent messaging, no orchestrator, no new protocol.** Handoffs flow
through the shared, visible `tasks` state, which is also the audit trail. `agent:launch` (the Runner
contract) remains the *orchestration escape hatch* for a direct, named transfer — used sparingly, as PM
already does (a visible command comment for audit + a direct dispatch for reliable delivery).

## The two axes (the whole design space)

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

## The unit: an actor (agent or human)

A handoff target may be a machine or a person, so the one unit is an **actor** with a `kind`
(`AUTONOMY-IR.md`). The four slots are identical for both:

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

## The seam: a typed edge over the lifecycle

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

## The human seam = the same seam + four affordances

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

## Testing actors / simulating humans

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

## What changes (and what doesn't)

**Doesn't change** — the mechanism is already right: choreography through `tasks`; `agent:launch` as the
escape hatch; `maxConcurrent`/`max_open_agent_prs` as pull/WIP backpressure; the four-slot unit, the
capability model, the trust/wrapper split.

**The real delta** — the substrate-coupled, untyped part is the *trigger* (today it names raw github
events: `event: issues`, `pull_request_target`). The changes make the handoff edge portable, typed, and
give the human edge a declared consumer:

1. **`tasks` lifecycle catalog** — state vocabulary the orchestrator reads (`TASK-LIFECYCLE.md`). *Additive.*
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

## The forks

1. Keep `event:` as a substrate-native escape hatch (recommended — partial support is first-class), with
   `cron` + `dispatch` as the portable path.
2. Payload *content* lives in the human behavior spec (opaque, like every behavior); only the `decision`
   *type* surfaces as a config key so the substrate routes approve vs consult vs inform.
3. *Holding* and reconciling task state (H2) and the producing-side seam graph (H4) are separate, later
   horizons — H1 needs only the lifecycle *vocabulary* + the `dispatch` trigger + the `kind: human` actor.

## Incremental proof

The `maintainer` actor ships as a `dispatch` `kind: human` actor: the orchestrator (PM) reads the
`human-required` state off a task and `launch`es the maintainer — the same portable seam on every
substrate (the `human` realization — worklist + escalation + durable-pause — is the new build). No
github-label-watching trigger is involved; task state is a property the orchestrator reads, not an event.
