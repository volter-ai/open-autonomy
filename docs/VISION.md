# Open Autonomy — Vision: org-as-code

> **Status:** vision / category doc. Peer to `CONSTITUTION.md` (the north star, merit criteria, and
> method) and `docs/SPEC.md` (the spec). This doc says *what category this is*, *what the mission is*,
> and *the three pieces that carry it*. Tactical execution lives in `ROADMAP.md` /
> `.open-autonomy/roadmap.yml` — this doc defers to them and never duplicates their phases.

## What Open Autonomy is

**Open Autonomy is the system and spec for autonomous software organizations** — a substrate-neutral
standard for declaring a software-development org (its participants, their authority, when they act, the
policy they run under) and `compile`-ing it onto a substrate where it runs itself. That is the thing;
everything else is an instance of it. The generality is across **substrates** (github, local, gitlab, …),
not across domains — the work is always software.

**It dogfoods itself.** The canonical repository is one installation: the `self-driving` profile compiled
onto the **github** substrate, running and maintaining this very repo. The self-driving-repo-on-github is
not the definition — it is the *proof*. The definition is the spec; github is one substrate; `self-driving`
is one profile.

```
Open Autonomy        = the system + spec for autonomous software orgs    ← what it is
  substrate          = an implementation of the spec (github, local, …)
  profile            = a declared org (self-driving = a software-dev org)
  installation       = profile × substrate × a place to run
  the dogfood        = self-driving × github × this repo                 ← the proof, not the definition
```

**Infrastructure-as-code is the closest analogy:** you declare the org once and `compile` (apply) it onto
a substrate (provider), where it runs the work itself. IaC gives you *infrastructure* from a file; Open
Autonomy gives you the *workforce* — and the defining difference, the reason it needs constructs IaC never
did, is that **the provisioned resources have agency**: they decide, build, review, and launch each other.

## The mission is a search

The north star is a superlative — *the best self-driving org* — and a superlative implies a **search**.
You cannot find the best org by building one and hand-tuning it; you must be able to express, run,
measure, and compare *many*. That is why the system is general **by necessity, not ambition**: generality
is the precondition for "best."

The search runs at two nested levels, both anchored to the human-owned merit criteria:

- **Inner loop — the best org design.** Within a fixed system, vary the profile (the org's genome) and
  select the design that best satisfies the criteria.
- **Outer loop — the best autonomy system.** Vary the standard itself, its substrates, and the ideas
  absorbed from the wider field; keep what reaches a better frontier. This loop is human-directed.

What stops this from being infinite regress is the **fixed point**: the merit criteria are human-owned
and never searched (`CONSTITUTION.md`). Everything below them is searched; the measuring stick is not.
That single anchor keeps the whole machine falsifiable and safe.

So the mission, stated once:

> **Find and use the best autonomy system for self-driving software orgs** — where "best" is the
> human-owned merit criteria, "find" is a two-level human-supervised search that *absorbs the best ideas
> from the whole field*, and "use" means we dogfood whatever we find on ourselves, so discovery and
> deployment are one compounding loop.

This commits us to humility: the goal is to find the best system, **not** to make Open Autonomy win. If
the bench ever shows a different system reaches a better frontier, the mission obligates us to adopt it.

## The three pieces

The mission reduces to three pieces of machinery, plus the anchor above them:

| Piece | Role | What it is | Status |
|---|---|---|---|
| **Standards** | the **space** | the org-as-code system: IR, substrates, conformance | mature |
| **Bench** | the **fitness** | competitive bench workloads + the twin: which design/system is better | **underbuilt — the bottleneck** |
| **Dogfood** | the **engine** | running the best on ourselves: ground truth + the crank | live |
| *anchor* | the **objective** | the human-owned merit criteria (not a piece — never searched) | — |

They form a closed loop, and **dogfood drives all three**:

```
Standards  defines the space  ─▶  Bench  finds the best point in it  ─▶  Dogfood  runs it on us
    ▲                                                                          │
    └──────────  dogfooding reveals the gaps + generates the data  ◀──────────┘
                 (extends Standards, calibrates Bench)
```

- **Dogfood → Standards:** using it for real is what reveals what the spec lacks. (Seams,
  human-interpreted realizations, and state/reconcile were all found by *trying to use it*.)
- **Dogfood → Bench:** real runs produce the calibration data the twin needs and the realistic workloads
  that keep the benchmark from optimizing a toy.
- **Bench → Standards / Dogfood:** the bench says which standard features actually move the frontier (so
  the spec evolves on evidence, not taste) and which design is best (so dogfood knows what to adopt).

Applying our own Theory of Constraints to the mission: Standards is mature and Dogfood is live, so
**Bench is the constraint** — and the horizons that matter most are exactly the Bench leg.

---

## 1 · Standards — the space

The org-as-code system: what orgs can be expressed and run. `docs/SPEC.md` owns the spec; this is the
*why* and the model we are completing.

### Standard → implementations (already our structure)

`docs/SPEC.md` frames the IR as a **standard** with **substrates** as partial implementations (spec :
browsers). "Terraform : providers" is the identical structure — same idea, more familiar to the infra
audience. We use both; they do not compete.

```
IR (the standard / the HCL)        — what exists, precisely. Never how.
   ↓ compile(profile, substrate)        ↑ a substrate is a "provider"
installation                       — the provisioned, running org.
   ↕ reconcile                          ← keeps the model true (Horizon 2)
conformance                        — the support matrix across substrates.
```

| Terraform | Open Autonomy | Status |
|---|---|---|
| `.tf` desired state | `ir.yml` profile (four-slot agent + policy + resources) | ✅ have it |
| provider (aws, gcp) | substrate (github, local) | ✅ have it; few providers, no SDK |
| `apply` | `compile` + materialize | ✅ have it |
| `plan` (diff before apply) | `upgrade` plan (file diff) | ⚠️ files only — no *behavioral* plan (→ Bench) |
| **state + reconcile + drift** | — | ❌ central runtime gap (H2) |
| resource dependency graph | the **seam** graph (typed handoffs between participants) | ❌ implicit today |
| modules + registry | profiles + behaviors | ⚠️ one monolithic profile, no registry |
| policy-as-code | `policy.box` (+ `CONSTITUTION.md`) | ⚠️ declared; not fully enforced/tested |

**Where Terraform ends — and each break is one of the other pieces or the anchor:** the resources have
agency → a **constitution** (the anchor); humans are participants, not just operators → the **participant
model** (below); the org has performance → the **twin** (Bench); the desired state rewrites itself → the
**outer loop** (the search). The analogy makes the mechanism legible, then hands off to the rest.

### The model we are completing

**Participants — one unit (the actor), two kinds.** Still one unit, now named for what it is: the
**actor** (`behavior` + `capabilities` + `triggers` + `config`). An actor has a **kind** — `agent` (a
machine) or `human` (a person) — **intrinsic and declared, not a substrate choice** (a human task is a
human task on every substrate). Within `kind: agent`, *execution* stays the substrate's choice (a `.ts`
behavior runs deterministically; a prose skill model-interpreted); `kind: human` is realized by routing to
a person, plus the affordances people need (worklist + escalation + durable pause + structured payload —
see `docs/SPEC.md#handoffs`).

| | `kind: agent` | `kind: human` |
|---|---|---|
| realization | substrate runs it (deterministic / model-interpreted — its choice) | a real person (prod) or a simulator (test) |
| trust | derived from realization | trusted, but slow + scarce |

A human is a first-class **peer**, not a new noun and not "a kind of agent" — same four slots, different
kind. This makes the org's **true labor model visible**: today humans appear only as *negative space* (a
`human_required` path, a review nobody declared, a maintainer-run upgrade). Declaring them is what makes
measurement possible. (See `docs/SPEC.md#the-ir` for the actor/kind axis and `docs/SPEC.md#handoffs` for how
handoffs reach a human.)

**Seams — the typed handoff, and the org's dependency graph.** Every point where one participant hands to
another is a **seam**. Today the human seams are silent — a risk flag in `policy.box`. A seam should carry
a contract:

```yaml
seam:
  in:       what the upstream participant presents   # the handoff artifact
  decision: what is decided here                     # the type of the edge
  out:      what is returned to resume               # the resume payload
```

Typing a seam defines **both sides for free** (upstream postcondition, downstream precondition). The set
of seams **is** the org's dependency graph; quantified, it becomes the twin. Separate concern: *"this is
risky"* stays in `policy.box`; *"here is the declared participant who handles it"* becomes a participant.

**State + reconcile — keep the model true.** The constitution already requires every decision be visible
("comments, artifacts, committed decisions, or status reconstruction"). The generalization is a live,
reconciled **fleet-state**: what is actually running, converged against the profile. `check:dogfood`
detects drift in *files*; we extend it to *behavior* (stuck / looping / out-of-scope / blocked-on-human).
Without this the model is a one-time scaffold and decays to fiction; with it, the map cannot lie about the
territory.

---

## 2 · Bench — the fitness

The fitness function, made physical. If you cannot launch org-experiments and score them, "find the best"
is a slogan. This is the **bottleneck leg**.

**Proof vs. bench.** The conformance workload (`bun bin/bench.ts --live --workload self-driving-conformance`,
coverage-graded, plus the proof ledger) answers *"does this installation behave correctly?"* — pass/fail.
The mission needs the second question: *"how
**well** does this org design perform versus another?"* — a comparative **score with error bars** on the
merit criteria. Same machinery, different output; that repurposing is the work.

**An experiment is a cell:** `profile × substrate × workload`, provisioned disposably, run autonomously,
scored, torn down. The axes are the two loops: vary the *profile* (inner loop) or the *system* (outer
loop), against a **shared workload suite** so scores are comparable. That suite is a diverse, human-owned
**benchmark** — repos and task sets (docs, bug, feature, refactor, security, flaky test) — *SWE-bench
lifted one altitude: the subject under test is the org design, not the model.* Diversity is mandatory, or
you find the best org for *your* repo, not the best org.

**The twin and the live bench are a division of labor, not redundant:**

- **Twin = cheap, approximate fitness** → screen *many* candidates in simulation (a self-calibrating
  queueing model of the org: per-seam velocity *distributions*, yields, contention — not averages).
- **Live bench = expensive, ground-truth fitness** → confirm the *few* promising ones live.
- They feed each other: **live bench runs calibrate the twin; the calibrated twin decides which bench runs
  are worth spending on.** That loop is what makes search *affordable*.

From the twin: the **bottleneck** (Theory of Constraints → the *right* next automation, not the merely
expensive one), throughput/cycle-time prediction, and a **behavioral `plan`** ("simulate adding 3
developer agents" before spending). The bottleneck migrates to the human seams as agents get cheaper — so
the bench points, on its own, at what to automate next.

**Simulating humans.** Most org designs include human actors, so an experiment must substitute them with
**human simulators** — the profile is unchanged; the bench supplies a simulator realization for each
`kind: human` actor (a deterministic fixture for reproducible tests; a latency/decision *distribution* for
the twin; model-roleplay for rich scenarios), calibrated from real human-seam measurements. The seam's
typed payload + identity-decoupled redeem handle are what make this possible (`docs/SPEC.md#handoffs`). Without
it, no realistic org (autonomy ratio < 100%) can be benched at all — so human simulation is a precondition
for Bench, not a convenience.

**The headline metric is the autonomy ratio** — the share of the SDLC realized by agents vs humans, the
merit criterion **low human toil** turned from a value into a number. It is *defined over* Standards
constructs (participants + seams) and *measured by* Bench.

**Three disciplines, each a measurement-validity requirement:**
1. **Distributions, not points.** One run is a noisy sample (model nondeterminism + workload variance);
   repeat and treat statistically.
2. **Autonomous-only.** Our rule *act as human-in-the-loop, never hand-crank the autonomy* is not just
   hygiene — a hand-driven bench run has contaminated its own fitness reading. Set preconditions, let cron
   drive, measure what actually happens.
3. **Automate the harness, human-own the selection.** Launch/run/score may be automated; choosing which
   design to promote on the Pareto frontier is human (the measuring-stick rule).

The benching apparatus is itself an autonomous org — a **lab** whose product is *scored org designs*. That
is the operational form of "use OA to improve OA," and the engine of the outer loop.

---

## 3 · Dogfood — the engine

Running the best we have found on ourselves. The canonical repo *is* the dogfood: `self-driving × github
× this repo`. Dogfood is two things at once:

- **Ground truth.** A design or system is not "best" until it runs on us; theory that isn't used rots.
- **The crank.** Using it for real is what reveals what the standard lacks (→ Standards) and generates the
  calibration data and realistic workloads the bench needs (→ Bench). This is why dogfood *drives all
  three*.

Discovery and deployment are therefore one loop: we adopt the best-found design and system *by running
it*, and the running produces the next round of evidence.

---

## What we are NOT (anti-goals)

- **Not BPMN / a workflow engine.** We model each participant's *interface* (capability, triggers, seams)
  — never its *internals*. Behavior is opaque for humans and agents alike; org behavior *emerges* from
  participants + triggers + policy. (Same anti-DAG stance the IR already takes.)
- **Not an agent framework** (LangGraph / CrewAI / AutoGen). Those model one agent's internal flow; we are
  a full altitude up — the org *of* agents-and-humans. A framework-defined agent can be a `behavior`.
- **Not a coding harness** (Devin / Claude Code / OpenHands). Those are the layer below — we orchestrate
  them. A harness is one way a substrate realizes a model-interpreted behavior.
- **Not a self-judging optimizer.** Neither search loop may author the criteria that judge it. The org may
  *propose* its next automation; humans own the measuring stick.

## Horizons

Vision-level only; tactical phases, proof gates, and acceptance live in `ROADMAP.md` /
`.open-autonomy/roadmap.yml`. Each horizon is tagged by the piece it serves; the dependency order is the
spine.

- **H1 — Shape the boundary** *(Standards; cheapest stake)*. Promote `human_required` from a risk flag to
  a typed **seam** (over the `tasks` lifecycle); add the **`human` actor kind**. *Unlocks:* the autonomy
  ratio becomes definable; every handoff becomes a two-sided contract.
- **H2 — Make it true** *(Standards)*. Live **fleet-state + reconcile**; behavioral drift detection.
  *Unlocks:* a model that cannot decay into fiction.
- **H3 — Make flow measurable** *(Bench)*. Per-seam velocity, cost (tokens + human-minutes), first-pass
  yield, rework counts; the autonomy ratio; a **fleet treasury** (from per-agent caps). *Unlocks:* the
  inputs to the twin.
- **H4 — Model the throughput** *(Bench)*. The self-calibrating **twin**; Theory-of-Constraints bottleneck
  ranking; a **behavioral `plan`**; **competitive bench workloads** (proof → score). *Unlocks:* affordable search.
- **H5 — Optimize autonomy** *(the search closing the loop; frontier)*. The org proposes its next
  automation; the desired state becomes self-modifying — within the constitutional guardrail.

**Cross-cutting, now mission-core (not side-tracks):**
- **Standards:** harden `conformance` into a published spec + **test suite**, ship a **substrate SDK**, and
  prove the abstraction with a second real event substrate (GitLab — the forcing function that exposes
  GitHub-shaped leakage). Add **modules + a registry** so the search space is expressible. *Be a standard,
  not a tool.*
- **Bench:** the **benchmark/eval harness** — the shared instrument that scores *both* loops.
- **Absorb-from-the-field** (outer-loop search operator): Agent Spec as an optional `behavior` format;
  emit `AGENTS.md`; pass through MCP; emit A2A agent cards. Absorption, validated by the bench.

## How we know we hit it

In the spirit of the merit criterion **proof** — demonstrated, not asserted:

1. **Visible labor model.** For any installation, the autonomy ratio is computable: every SDLC step is
   attributable to a declared participant (agent or human). No silent human work.
2. **The model is true.** The running org and the declared profile never silently disagree; behavioral
   drift is detected and surfaced.
3. **It is a standard.** A third party can write a substrate and *prove* conformance against a published
   suite; the same profile runs on two genuinely different event substrates.
4. **The bench can rank.** Two org designs (or two system variants) are scored comparably on the same
   workload suite, with error bars — and the twin predicts the ranking before the spend, improving as data
   accrues.
5. **Autonomy is a gradient.** Moving the human/agent boundary is a measurable change in the ratio and the
   bottleneck, proposed by the system and ratified by a human.
6. **We use what we find.** The best-ranked design and system are the ones running on this repo — discovery
   and deployment are the same loop.
7. **Humans are simulatable.** An org with human actors can be benched without real humans — calibrated
   simulators fill each `kind: human` role through the same seam, and a real-human dogfood run is the
   ground truth that calibrates them.
