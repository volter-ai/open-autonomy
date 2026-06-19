# Autonomy IR (`autonomy.ir.v1`) — a substrate-agnostic format

> **Status:** the system is domain-free (it knows only agents, running agents, and
> triggers). Proven by running the real app with real AI on a real project — no unit
> tests. See §12.
> **Home:** open-autonomy is the host format. A *substrate* is local vs github (where it runs); a
> profile's *tooling* (what its agents call, e.g. ztrack or gh) is swappable and never named by the
> core (§7). ztrack is one such tooling, used by a downstream profile in a separate repo — not a
> dependency.

## Vocabulary

The canonical terms used throughout this doc and the codebase:

| term | definition |
|---|---|
| **IR** (`autonomy.ir.v1`) | the substrate-agnostic intermediate representation a profile is written in (agents · workflows · resources · policy). |
| **agents** / **skill** | the atomic agent content — a `skill` is one agent's instructions plus the standards/scripts it uses. The agents have **no collective noun**; they're just "the agents". |
| **profile** | a substrate-agnostic **recipe**: a composition of agents + workflows + policy + resources, expressed as IR. Premade ones live in `profiles/`. |
| **substrate** | the execution platform = a **trigger executor** + a **runner**, over a **box** (§4). e.g. `local`, `github`. |
| **trigger executor** | fires a workflow when its triggers say so (cron is core, events expanded) and dispatches its action. Decides *when*. |
| **runner** | runs agents and manages their session lifecycle (`launch`/`list`/`cancel`…), launching each into a box. Does the *running*. |
| **box** | the environment an agent runs in: POSIX fs + shell + git + a model endpoint + the installed files. The runner provisions it. |
| **installation** (*install*) | the materialized output of `compile(profile, substrate)` — the configs, installed skills, resources, and generated files laid into a repo. **Substrate-specific.** |
| **tooling** | the tools an agent calls + the gate behind a `run:` (ztrack vs. gh + npm) — a swappable adapter axis (§5), not part of the IR. |

The one relation that ties them together:

```
compile(profile, substrate) → installation
```

> **Deprecated: "bundle".** It conflated the *profile* (recipe), the *tooling*, and the
> *installation* (compiled output). Use the precise term.

## 1. Thesis

A local self-driving setup and a GitHub Actions one are not two systems that resemble each other —
they are **one control-plane design serialized against two execution substrates**. (The observation
that started this: a hand-rolled local profile and the open-autonomy github manifest had independently
grown a `humanRequiredPaths` / `humanRequiredTopics` pair with near-identical contents.)

This doc extracts the shared machine into one intermediate representation (IR) that **compiles** a
single profile to any substrate — a local-loop setup, a GitHub Actions setup, or both in the same
repo — and can **ingest** an existing setup back into it.

## 2. Design principle: interpret the minimum, carry the rest

The IR understands the **bare minimum every target shares** and treats everything
else as an opaque value that a consumer (a compile-time adapter, or the runner at
runtime) may or may not read.

> **Litmus:** if swapping a tool, harness, or substrate changes a value, it is
> **not** interpreted by the IR — it belongs to an adapter or to a `config` box.
> The interpreted parts of the IR contain zero `.claude` / `.codex` / `ztrack` /
> cron-DSL / `gh` tokens.

What the IR genuinely reasons about:

- which **agents** exist and their skill folders,
- how many may run at once (`maxConcurrent`, per-agent and global),
- which **triggers** run what (launch an agent, or run a script) — only `cron` is interpreted,
- which **files** to copy.

Everything else — tool capabilities, edit-blocking, sensitive topics, merge rules,
human-required paths — is either **prose in a skill prompt** or a value in a
**`config` box** (per-agent, per-workflow, or global). Boxes are opaque to the
*format*; their keys are read by whichever consumer understands them.

## 3. The reduction — what is *not* a primitive

| Candidate | Verdict | Why |
|---|---|---|
| Standards docs | **resources** | The format never interprets them; an agent cites them. Dumb copy. |
| Where work lives | **not a concept** | The system has no notion of work, issues, or states. Whatever an agent or script reads/writes is entirely theirs; the system only launches agents. |
| Gate (`ztrack check`) | **a workflow** | A cron that `run`s a script. Not a slot. |
| Direction / roadmap | **whatever an agent reads** | A file an agent chooses to read. The system never sees it. |
| Capabilities | **`config` box** | `pr:open` means something on github, nothing locally. Passthrough. |
| Domain (issues, "ready"/"done", what "pm" means) | **agents + scripts** | Lives entirely in prompts/skills/scripts. The system knows none of it. |
| a tool the agents use (e.g. ztrack) | **a profile's tooling** | An evidence gate + whatever tools the agents call. Swappable, opaque, carried by the profile — never part of the core or a substrate. |

What survives is **four nouns over two substrate primitives, across three adapter
axes.**

## 4. The substrate: trigger executor + runner, over a box

A **substrate** is the concrete platform the system runs on. It factors into two executors you
implement, over one shared environment:

1. **The workflow trigger executor** — fires a workflow when its triggers say so and dispatches its
   action (`launch` / `run` / `raw`). It decides *when*. (Contract: §13.2.)
2. **The runner** — runs agents and manages their session lifecycle, launching each into a box. It
   does the *running*, and is the *one* behavioral seam between a laptop loop and GitHub Actions —
   it knows agents and their lifecycle, nothing about what they do. (Contract: §13.1.)

over

3. **The box** — the environment an agent runs in: a POSIX filesystem + shell + git + a model
   endpoint in env + the copied files on PATH. Docker, laptop, GHA runner, Firecracker microVM all
   satisfy the same interface; the agent cannot tell which it is in. **Whatever tools an agent uses
   live here.** The box is the runner's responsibility — `launch()` decomposes into "acquire a box,
   provision it to the image spec, start the agent," so a `Session` is *(a box) + (an agent process)*.

**The two executors layer.** A `launch: pm` workflow on cron = the trigger executor fires → dispatches
→ `runner.launch(pm)` into a box. A `run:` workflow needs no runner at all — the executor just runs
the script.

**Whether they are one component or two is a substrate detail:**

- **local** — they are **separate**: the `run.mjs` loop (trigger executor) calls the runner (termfleet).
- **github** — one platform fills **both**: Actions `on:` is the trigger executor, the Actions job is the runner.

**An agent never sees the trigger executor.** From a worker agent's seat there is only ever the
**runner** (its lifecycle) and the **box** (its environment) — triggers don't exist to it, it is
simply launched. That is why §13 conforms two contracts (runner + trigger executor) while this
agent's-eye view names only runner + box. Adding a substrate = implementing those two contracts over
a box-source.

### 4.1 The Runner contract

The system knows only **agents** and **running agents**. `launch` starts one;
`get`/`list` observe; `update`/`cancel` transition. `launch` carries arbitrary
**opaque params** through to the agent — the system never interprets them (a
the tooling/runner may give one meaning, e.g. `issue`). There is no notion of work,
issues, or domain states anywhere in this contract.

```ts
type SessionStatus = 'running' | 'paused' | 'cancelled' | 'done' | 'failed';
type LaunchParams = Record<string, string>;   // opaque pass-through; the system never reads them
interface Session { id: string; agent: string; status: SessionStatus; ref?: string; params?: LaunchParams }

interface Runner {
  launch(agent: string, params?: LaunchParams): Session;            // C
  get(id: string): Session | undefined;                            // R (one)
  list(): Session[];                                               // R (running)
  update(id: string, patch: { status?: SessionStatus }): boolean;  // U
  cancel(id: string): boolean;                                     // D
}
```

The runner reads **per-agent `maxConcurrent`** and **global `policy.maxConcurrent`**
and enforces the binding one (the min). A substrate can be onboarded with `launch`
alone (a runaway-but-working fleet with relaunch-on-interval recovery), then grow
`list`/`cancel`/`continue` exactly as you turn on each guardrail.

The runner is one of two things you implement to add a substrate (the other is the
**workflow substrate** that fires triggers, §5). **§13 is the full conformance
contract** — the core vs expanded feature set for each, every parameter's meaning, and
a checklist for adding a substrate.

### 4.2 The Box (Environment)

"It's just a VM" holds only if every box is provisioned identically — same tools,
same files, same env on PATH. The substrate is `Runner` + an **image spec**, and
`launch` guarantees it (the `--setup-command` `run-agent.mjs` already carries).

The box is **agent-uniform** but **operator-different** on two axes the agent never
sees, so they are *operator dials*, not IR fields:

- **Trust** — laptop = your real key, full blast radius; GHA = bounded proxy + scoped
  token. Same `MODEL_URL` to the agent.
- **Isolation** — laptop is a shared working tree (this is *why* `maxConcurrent: 1`
  exists); Docker/GHA give each session its own checkout.

## 5. The three adapter axes

The IR's interpreted parts carry zero tokens from any of these. Each axis owns its
tokens.

| axis | examples | owns |
|---|---|---|
| **substrate driver** | local-loop / github-actions | trigger transport, runner glue, cron→loop/Actions, termfleet/proxy |
| **harness adapter** | claude / codex | skill install path & filename, skill format |
| **tooling** | ztrack / gh | whatever tools the agents call, the gate command behind `run` |

`launch: pm` resolves to a prompt via the **harness** adapter (which also picks
`.claude/skills` vs `.codex/skills`). `run: scripts/gate.sh` becomes `ztrack check`
or `npm test` via the **tooling** adapter. `cron` becomes a loop interval or an
Actions `on: schedule` via the **substrate** driver. None of those tokens appear in
the IR.

## 6. The IR (`autonomy.ir.v1`)

Four nouns. Three the compiler *reasons about*; one it just *carries*.

```yaml
schema: autonomy.ir.v1
targets: [local, github]

agents:                          # agent → skill folder + config (only maxConcurrent is interpreted)
  pm:      { skill: skills/pm,      maxConcurrent: 1, config: { capabilities: [issue:comment, workflow:dispatch], editBlocking: true } }
  develop: { skill: skills/develop, maxConcurrent: 1, config: { capabilities: [branch:write, pr:open] } }
  review:  { skill: skills/review,  maxConcurrent: 1, config: {} }

workflows:                       # triggers[] → exactly one of launch | run (+ optional config box)
  - { name: pm-tick,         triggers: [{ cron: "*/15 * * * *" }], launch: pm }
  - { name: recover-develop, triggers: [{ cron: "*/15 * * * *" }], run: scripts/recover-develop.mjs }
  - { name: gate,            triggers: [{ cron: "*/15 * * * *" }], run: scripts/gate.sh }
  # carried (substrate-rendered) event triggers ride alongside cron:
  - { name: reviewer-tick,   triggers: [{ event: pull_request_target }, { event: issue_comment }], launch: reviewer }

resources:                       # dumb copy — the loose remainder nothing else references
  - standards/workflow.md
  - standards/risk-and-review.md

policy:
  maxConcurrent: 3               # global fleet cap; the runner enforces min(per-agent, global)
  box: {}                        # opaque grab-bag for targets that want more
```

| section | compiler | meaning |
|---|---|---|
| `agents` | reasons | agent → skill folder; per-agent `maxConcurrent`; `config` is an opaque box |
| `workflows` | reasons | `triggers[]` (≥1; only `cron` is interpreted, the rest carried) + exactly one of `launch`(agent) / `run`(script); optional `config` box |
| `policy` | reasons | global `maxConcurrent`; `box` is opaque |
| `resources` | carries | verbatim copy of files referenced only inside skills/scripts |

### Rules

- **Reference implies copy.** Anything the IR names is copied by virtue of being
  named. So the **copy set** = (skill folders from `agents`) ∪ (scripts from
  `workflows.run`) ∪ (`resources`). `resources` lists only the *unreferenced*
  remainder — no double-encoding.
- **`workflows` actions are three keys, not a DSL.** Exactly one of `launch` (an agent
  name that must exist in `agents`), `run` (a script path), or `raw` (a substrate-specific
  workflow body carried VERBATIM — a hand-authored github workflow the IR doesn't model;
  emitted as-is, skipped on substrates that don't own it). `raw` is how the core stays
  lossless over bespoke executable artifacts — the symmetric twin of a copied `run:` script.
- **Triggers are a carried list; only cron is interpreted.** A workflow has `triggers[]`.
  The local loop needs an interval, so `cron` is the one trigger the IR reasons about.
  Every other trigger (`{event: issue_comment}`, `pull_request_target`,
  `workflow_dispatch`, …) is carried verbatim and left to the substrate's workflow
  implementation to fire — github renders each as `on: <event>`; the local loop skips
  what it can't honor (the agent stays launchable). The IR never models event semantics.
- **Boxes are opaque to the format, read by consumers.** A compile-time adapter reads
  what it understands (github maps `config.capabilities` → workflow `permissions:`);
  the **runner** reads what *it* understands at runtime (concurrency, edit-blocking).
  Nothing in a box is required of every target — only `maxConcurrent` is.
- **No leaked tokens.** Destinations (`.claude` vs `.codex`), CLIs (`ztrack` vs
  `gh`), and cron rendering all live in adapters, never in the interpreted fields.

## 7. The tooling axis (gate + agent tools)

**Tooling** is the one thing a profile picks that the core never names: the tools its agents call,
and the gate command behind a `run:` workflow. The IR guarantees a **gate workflow, not gate rigor** —
it reserves the slot; the profile fills it. Universality buys tool-agnosticism at the cost of
opinionatedness — a deliberate trade.

Tooling is two things, neither of which the IR knows about:

- **Agent tooling** — whatever the agents call to do their work; entirely the profile's concern. The
  system never sees it (it only launches agents and passes opaque params, e.g. via `AUTONOMY_FORWARD`).
- **Evidence gate** — a command behind a `run:` in a gate workflow. Because it's just a `run:` script,
  it's the *same command* on both substrates.

Two real examples, neither privileged:

- **`gh` + `npm test`** — a lightweight gate; the agents use the GitHub CLI + the repo's own tests.
- **ztrack** — a *rigorous* evidence gate ("close on evidence, not prose"), used by a downstream
  profile (the `ztrack-simple-sdlc` profile, in a separate repo). `ztrack check` sits behind a `run:`.

Swap the tooling and the IR is unchanged — and **the substrate is unchanged too**. ztrack is not
"the local substrate" and `gh` is not "the github substrate"; either tooling runs on either substrate.

## 8. Worked compile: one IR → both targets

`compile(ir, target)` picks the substrate driver + harness adapter + tooling for
`target`, then renders the three substrate-specific categories and copies the files.

| IR construct | **local** | **github** |
|---|---|---|
| `agents.pm.skill` | harness copies to `.claude/skills/x-pm` + `.agents/skills/x-pm` | harness copies to `.codex/skills/open-autonomy-pm` |
| `agents.*.config.capabilities` | ignored | adapter → workflow `permissions:` + tokens in `autonomy.yml` |
| `agents.*.maxConcurrent` / `policy.maxConcurrent` | runner counts termfleet sessions (`list`) and holds at the limit | runner counts `gh run list` / open PRs and holds |
| `workflows.launch: pm` | `schedule.json` entry → `run.mjs` loop → `run-agent.mjs` → `autonomy-runner.mjs` (the vendored runner) → termfleet `new` | `pm.yml` `on: schedule` → `workflow_dispatch` of the session job |
| `workflows.run: scripts/gate.sh` | loop tick runs the script (its command is the profile's tooling, e.g. `npm test` or `ztrack check`) | a required-status-check workflow runs the same script |
| `cron: "*/15 * * * *"` | converted to the loop interval | emitted verbatim as `on: schedule` |
| `resources/*` | copied (mirrored) | copied (mirrored) |

```
# bun …/autonomy-compile.ts profiles/x local    # bun …/autonomy-compile.ts profiles/x github
profiles/x/scheduler/schedule.json  (loop cfg)   .open-autonomy/autonomy.yml      (emitted manifest)
profiles/x/scheduler/scripts/run.mjs  (loop)     .github/workflows/pm.yml         (cron)
profiles/x/scheduler/scripts/pm-tick.mjs         .github/workflows/<gate>.yml     (run: gate)
profiles/x/scripts/run-agent.mjs (adapter)       scripts/…                        (injected runtime)
profiles/x/scripts/autonomy-runner.mjs (runner)  .codex/skills/open-autonomy-pm/SKILL.md
profiles/x/scripts/prompts/<harness>/*.txt       docs/standards/…
.claude/skills/x-pm/SKILL.md
.agents/skills/x-pm/SKILL.md
profiles/x/standards/…
```

Same `ir.yml`, same skills, same `maxConcurrent`, same gate command. What differs is
only the substrate-specific categories: **trigger transport** (loop vs `on:`), **runner
glue** (termfleet vs proxy+dispatch), and on github an **emitted manifest** + the
**injected runtime** (`scripts/*`). The local installation has no `profile.json` — the
loop reads `schedule.json`; any tool config a profile's tooling needs (e.g. ztrack's) is
a carried resource, not something the substrate emits.

**The runner backend is the substrate primitive, emitted verbatim.** Local compile
writes the domain-free runner (`autonomy-runner.mjs`) from its single source, plus a
thin `run-agent.mjs` adapter and per-harness skill prompts (`$skill` for codex,
`/skill` for claude). The adapter reads `AUTONOMY_AGENT` and forwards env names listed
in `AUTONOMY_FORWARD` (comma-separated) to the runner as opaque `--key value` params;
the runner exports them verbatim into the launched agent. A profile's tooling gives those
params meaning — e.g. a ztrack-using profile declares `ZTRACK_ISSUE` via `AUTONOMY_FORWARD`,
so its skills get their context while every launch still flows through the identical
vendored runner.

### Both in one repo

`targets: [local, github]` runs both drivers over one source. They write to disjoint
paths (`profiles/` + `.claude` + `.agents` vs `.github/workflows/` + `.open-autonomy/`
+ `.codex` + `scripts/`), so they coexist; the skill *content*, `maxConcurrent`, and gate
command are single-sourced. Edit the profile once, regenerate both.

## 9. Round-trip check

Lossless for the shared core; the substrate-specific extras survive by riding in the
`config` boxes (the IR is the superset, each emitter projects down). The `profile.json` column shows
how a downstream **ztrack-format** adapter maps to the IR — that adapter lives in the ztrack repo (the
local substrate here is generic and emits no `profile.json`); it is shown to demonstrate the IR is the
superset of both serializations.

| IR field | from `profile.json` (ztrack, downstream) | from `autonomy.yml` | note |
|---|---|---|---|
| `agents[].skill` | `skills[role].source` | `skills[role]` | clean |
| `agents[].config.capabilities` | absent → empty box | `agents[role].capabilities` → box | overflow rides the box; emitter defaults missing caps least-privilege |
| `agents[].maxConcurrent` / `policy.maxConcurrent` | `policy.wip.*` | `policy.autonomy.*` | union into concurrency |
| `workflows` | `scheduler.scripts[]` (cron/loop) | `agents[].triggers.*` | a `<role>-tick` entry recovers as `launch: <role>` (regenerable launcher); other scripts stay opaque `run:`. Triggers are a carried list: `schedule`→cron, every other key→a carried event. Events round-trip in the manifest and render into github `on:`; the local loop just skips them (the agent stays launchable). |
| gate `workflow` | `preset` via `ztrack check` | `merge` + `review-rubric` + CI | preset canonical; `merge` rides `config.box`, github-only |
| human-required / topics | `policy.humanRequired*` → box / prose | `policy.risk.*` → box / prose | carried opaque, or in reviewer skill |
| `resources` | `standards[]` | `documents`/`standards` | clean |

## 10. Schema (`autonomy.ir.v1`)

```ts
import { z } from 'zod';

const Box = z.record(z.string(), z.unknown());   // opaque; consumers read what they understand

const Agent = z.object({
  skill: z.string(),                                       // folder, relative to profile root
  maxConcurrent: z.number().int().positive().default(1),
  config: Box.default({}),
});

const Trigger = z.union([
  z.object({ cron: z.string() }),                          // interpreted by the local loop
  z.object({ event: z.string(), config: Box.optional() }), // carried; the substrate renders it
]);

const Workflow = z.object({
  name: z.string(),
  triggers: z.array(Trigger).min(1),                       // ≥1; only cron is interpreted, rest carried
  launch: z.string().optional(),                           // agent name
  run: z.string().optional(),                              // script path
  config: Box.default({}),
}).refine(w => (w.launch ? 1 : 0) + (w.run ? 1 : 0) === 1, 'exactly one of launch | run');

const Policy = z.object({
  maxConcurrent: z.number().int().positive().optional(),   // global fleet cap
  box: Box.default({}),
});

export const AutonomyIR = z.object({
  schema: z.literal('autonomy.ir.v1'),
  targets: z.array(z.string()),
  agents: z.record(z.string(), Agent),
  workflows: z.array(Workflow),
  resources: z.array(z.string()).default([]),
  policy: Policy.default({ box: {} }),
}).strict();
```

## 11. Non-goals / open questions

- **Not** merging the two repos. The IR + Runner contract live here; ztrack stays a
  separate package shipping its own tooling + adapter.
- **Where does the IR live in a repo?** Proposal: `.open-autonomy/ir.yml` as the
  source of truth, with `profile.json` / `autonomy.yml` becoming *emitted artifacts*.
- **Resource placement** is a driver convention (mirror); with categories removed,
  matching a target's legacy layout (e.g. `docs/standards/`) means either a uniform
  greenfield location or a per-driver remap of conventional folder names.
- **Decision/audit trail** is currently substrate-specific (ztrack `.audit.jsonl` vs
  `volter.agent.decision.v1`). Left out of the IR for now; may want a thin contract.

## 12. Validation — by running it for real, not by tests

There are **no unit tests**. Deterministic tests give imaginary confidence; the only real
confidence is running the actual app, with real AI, on a real project. The framework
(`scripts/autonomy-*.ts`, dependency-free TS + `Bun.YAML`) is proven by live runs.

| file | role |
|---|---|
| `autonomy-ir.ts` | IR types (agents · workflows · resources · policy), `validateIR`, `CompileOutput` |
| `autonomy-ingest-{profile,autonomy,github}.ts` | format → IR (`github` carries hand-authored workflow files verbatim as `raw` workflows) |
| `autonomy-emit-{local,github}.ts` | IR → manifests, and `compile{Local,Github}` → full file tree |
| `autonomy-runner.ts` | the domain-free runner: `ExecRunner`, `TermfleetRunner`, `Runner` contract |
| `autonomy-runner-backend.mjs` | the emittable local-loop runner backend (`TermfleetRunner` + `runCli` in plain JS); `compileLocal` writes it verbatim into the profile as `autonomy-runner.mjs` |
| `autonomy-cli.ts` / `autonomy-runner-{exec,termfleet}.ts` | `runCli` + the concrete pre-made runner entrypoints |
| `autonomy-materialize.ts` | write a `CompileOutput` to disk |

**Proven by real runs:**

- **Domain-free end to end, with real AI.** `compileLocal({ runner: 'termfleet' })` →
  materialized to a real git repo → the loop launched a real `claude` PM agent → which launched
  a real `claude` developer via the domain-free runner → the developer wrote working code
  (`math.js`, `add(2,3)=5`) and updated the agents' own backlog. The system carried no notion of
  the task, the backlog, or its states — those lived only in the prompts and the agents' file.
- **The runner CRUD against real termfleet:** `launch`/`list`/`get`/`cancel` exercised live with
  real claude sessions (`[] → new → list → kill → []`).
- **Opaque params pass through:** `launch develop --issue T1 --priority high` reached the agent as
  env, recorded on the session — the system never interpreted them.
- **Local compile produces a complete generic local installation** — `schedule.json` + the `run.mjs`
  loop + the vendored `autonomy-runner.mjs` + a `run-agent` adapter + per-harness prompts + skills,
  with no tool baked in (`hello` compiles and materializes to both local and github).
- **ztrack cut over to the runner, proven with real AI.** The ztrack `simple-sdlc` profile now
  launches every agent through the vendored `autonomy-runner.mjs` (this `compileLocal` emits it
  byte-identical to the runner proved here). On a real ztrack repo with real `codex` (gpt-5.5), a
  full **PM → develop → review → Done** lifecycle ran: PM was launched via the runner (session id =
  termfleet `terminalId`, *received* not invented), PM dispatched develop and review through the
  unchanged dispatch interface, the issue rode as the opaque `ZTRACK_ISSUE` param the runner
  exported (the unchanged develop/review skills read `$ZTRACK_ISSUE`), the developer committed a
  real `/health` endpoint with evidence, and review moved the issue to **Done** with `ztrack check`
  green. No skill, scheduler, or PM change was needed — only the launch adapter + the vendored runner.
- **Carried config is interpreted by whichever consumer understands it, whenever it suits.** The
  box holds declarative intent; compile-time adapters and the runtime runner each read the keys they
  understand. Proven: pm's `capabilities` (carried in `config`) render into a real github
  `permissions: { contents: write, id-token: write, issues: write, actions: write }` at compile time
  — the same value a local runner would read at runtime. Compile-time vs runtime is a substrate
  choice, not an IR boundary; representability is bounded only by per-substrate interpreter coverage.
  The structural job knobs ride the same way: `config.timeout` → `timeout-minutes:`, `config.concurrency`
  → top-level `concurrency.group`, `config.env` → merged job `env:` (all proven rendering, and they
  round-trip through the manifest content-identical).
- **Operator control is mandatory on github — the github surface of the Runner contract.** Every
  generated launch workflow emits a `control` job + an `issue_comment` trigger + a control-exempt
  concurrency group + the `.github/agent-control.mjs` handler. `/agent cancel|pause|resume|status|retry`
  map to the Runner ops (`cancel`→`gh run cancel`, `status`→`gh run list`+comment, `retry`→`gh workflow
  run`, `pause/resume`→toggle the `agent-paused` label the agent job honors). Proven: renders into the
  workflow, parses as valid YAML, and the handler dispatches each verb correctly (exercised with a
  stubbed `gh`). It is deliberately **absent on local** — there the runner CLI (`autonomy cancel|update|
  get|list`) already IS the operator's control surface, so the same contract needs no workflow. The
  one concern still left in `raw` is policy gating (attempts/triage-approve), the same lift when wanted.
- **Lossless github round-trip.** The full open-autonomy checkout decompiles and recompiles
  losslessly — its `autonomy.yml` round-trips content-identical and **all 11 hand-authored
  `.github/workflows/*.yml` recompile byte-identical** (carried as `raw` workflows, with `on:` parsed
  into triggers for awareness). This is the symmetric design: the IR interprets the declarative manifest
  and carries the executable artifacts verbatim. Bespoke workflows the IR doesn't model survive
  untouched; lifting a concern out of `raw` into interpreted config (capabilities, triggers, timeout, …)
  is then opt-in, one concern at a time. (The ztrack-profile↔IR round-trip moved downstream with the
  ztrack-format adapter; the local substrate here is generic.)
- **Triggers round-trip (events no longer drop).** Ingesting the real `autonomy.yml`, pm's full
  trigger set `[{cron}, {event: workflow_dispatch}, {event: issue_comment}]` survives the IR and
  re-emits to a manifest **identical** to the original; the compiled `pm-tick.yml` renders all three
  into `on:`. The local loop honors only the cron and skips events (the agent stays launchable). The
  IR shape is stable under ingest∘emit∘ingest for both `profile.json` and `autonomy.yml`.

**Still unproven (needs a live GitHub remote):** end-to-end execution on real Actions — a scheduled
run firing, and an `/agent` control comment actually driving `gh` against a live run. The github
runner (Actions + bounded model proxy) and the control handler are proven by rendering + local
dispatch (stubbed `gh`); only their live firing on a real repo is outstanding. Also unproven under
real load: concurrency/WIP, recovery, and failure modes.

## 13. Implementing a substrate (the conformance contract)

A *substrate* is two implementable things over a shared environment:

- a **runner** — runs agents (their session lifecycle), and
- a **workflow substrate** — fires triggers (runs a workflow on time or event),

both over a **Box** (§4.2): a POSIX fs + shell + git + a model endpoint in env + the copied installation
files on PATH. To add a substrate you implement a **core** contract (required — the IR targets only
this, so any core-conformant substrate runs any IR) and, optionally, an **expanded** set
(capabilities your substrate can enforce; honored where present, ignored where not). Litmus for
"optional": if a substrate that ignores the feature still runs the fleet correctly — just with one
guardrail off — it is expanded, not core.

### 13.1 Runner — runs agents

**Core (MUST):**

| op | meaning |
|---|---|
| `launch(agent, params) → Session` | start `agent`; pass `params` into the agent's environment **verbatim** (never interpret them). The backend ASSIGNS the session id; the runner RECEIVES and returns it — it never invents one. |
| `list() → Session[]` | the currently-running agents. |
| `cancel(id) → bool` | stop session `id`. |

`Session = { id, agent, status, ref?, params? }`, `status ∈ running|paused|cancelled|done|failed`.
With `launch`+`list`+`cancel` you have a controllable fleet; `get` is derivable from `list`.

**Expanded (MAY):**

| feature | meaning | if unsupported |
|---|---|---|
| `get(id)` | one session by id | filter `list` |
| `update(id,{status})` | transition a session (pause/resume) | no pause |
| enforce `maxConcurrent` | refuse `launch` past the per-agent / global cap (count `list`) | the tooling enforces WIP agent-side (a ztrack profile's PM skill does this today) |
| enforce `budget` | a metered/revocable spend ceiling on the agent's model calls | unbounded (full-trust box) |
| enforce `timeout` | kill a session after N minutes | runs to completion |
| scope `permissions` | restrict the agent's blast radius (token / sandbox) | full box access |
| isolation | a private checkout per session | shared tree (this is *why* `maxConcurrent: 1` exists) |

### 13.2 Workflow substrate — runs triggers

**Core (MUST):** fire a workflow on its **cron** trigger and dispatch the workflow's action —
`launch` an agent, `run` a script, or emit `raw`. cron is the one trigger the IR interprets;
PM-on-cron is the universal dispatcher, so cron alone yields a working system.

**Expanded (MAY):**

| feature | meaning | if unsupported |
|---|---|---|
| event triggers | fire on `issue_comment` / `issues.labeled` / `pull_request_target` / `workflow_dispatch` | skipped; the agent stays launchable on cron or by another agent |
| manual dispatch | run-now with inputs | use cron / CLI |
| operator control surface | `/agent cancel\|pause\|resume\|status\|retry` → the runner ops (13.3); mandatory **on github** because the operator has no CLI there | the runner CLI **is** the control surface (local) |
| concurrency groups | serialize / exempt runs (e.g. control commands not queued behind the run they target) | runs may overlap |

### 13.3 The parameters — meaning, tier, who interprets each

**IR fields**

| field | tier | meaning · consumer |
|---|---|---|
| `agents{}` | core | the agents a runner can launch |
| `agents.*.skill` | core | skill folder (profile-root-relative); the harness installs/locates it |
| `agents.*.maxConcurrent` | expanded | per-agent cap; runner enforces if supported |
| `agents.*.config` | optional box | per-agent expanded keys (below) |
| `workflows[].name` | core | workflow id / filename stem |
| `workflows[].triggers[]` | core=`{cron}`, expanded=`{event,config?}` | when to fire (13.1/13.2); only cron is interpreted, events are carried |
| `workflows[].launch` | core | dispatch action: start this agent |
| `workflows[].run` | core | dispatch action: run this script |
| `workflows[].raw` | expanded | a verbatim substrate body the IR doesn't model; emit as-is, skip elsewhere |
| `workflows[].config` | optional box | per-workflow expanded keys |
| `resources[]` | core | files copied verbatim |
| `policy.maxConcurrent` | expanded | global fleet cap; runner enforces `min(per-agent, global)` |
| `policy.box` | optional | global expanded keys |

Exactly one of `launch` / `run` / `raw` per workflow.

**`config` box keys (the expanded params we define renderers for)**

| key | on github (compile-time render) | on local |
|---|---|---|
| `capabilities: string[]` | → job `permissions:` (`issue:*`→issues, `pr:*`/`branch:write`→pull-requests, `workflow:dispatch`→actions; launch baseline `contents`+`id-token`) | ignored (full-trust box) |
| `timeout: number` (minutes) | → job `timeout-minutes:` | runner kill-after (if supported) |
| `concurrency: string` | → top-level `concurrency.group` (else a default control-exempt group) | ignored |
| `env: {k: v}` | → merged into job `env:` | exported into the agent |
| `humanRequiredPaths` / `humanRequiredTopics` (in `policy.box`) | carried; enforced by the **agent skill** (soft) | same |

A consumer reads only the keys it understands and ignores the rest; the IR requires none beyond
core. Unknown keys are preserved across a round-trip but inert.

**launch params (opaque)**

Arbitrary `--key value` pairs on `launch`. The system NEVER interprets them; the tooling assigns
meaning (ztrack maps `ZTRACK_ISSUE`). A core runner MUST pass them into the agent's environment
verbatim — that pass-through is the entire mechanism by which the tooling hands an agent its context.

**operator control verbs → runner ops** (13.2 expanded)

| `/agent …` | runner op |
|---|---|
| `cancel` | `cancel(id)` |
| `pause` / `resume` | `update(id,{status})` |
| `status` | `get(id)` / `list()` |
| `retry` | `launch(agent, params)` |

### 13.4 Who enforces what

- **Runner** — the domain-free boundaries it supports (concurrency, budget, timeout, permissions). Hard, substrate-bound.
- **Agent** (its skill + the scripts it calls) — domain boundaries the runner can't see (eligibility, attempt limits, triage, human-required paths). Soft; backed by the review/merge gate.
- There is **no third layer.** If a boundary is neither runner-enforceable nor agent-enforced, it is simply not hard-enforced on that substrate — acceptable by design (full-trust local; bounded github).

### 13.5 Checklist — adding a substrate

1. **Runner core:** implement `launch`/`list`/`cancel` over your box-source; receive (don't invent) the session id; export `params` into the agent verbatim.
2. **Workflow core:** fire `cron` → dispatch the workflow's `launch`/`run`/`raw` action.
3. **Expanded, as your substrate allows:** enforce `maxConcurrent`/`timeout`/`budget`/`permissions`; honor `config` keys (`capabilities`/`concurrency`/`env`); add event triggers and the control surface.
4. **Whatever you can't enforce** → leave to the agent skill, or accept it unenforced.
5. **Prove it by running a real agent** end to end — no unit tests (§12).

### 13.6 Conformance battery

`scripts/autonomy-conformance.ts` plugs any runner into a deterministic check of the core contract
(§13.1) and profiles its expanded support:

```
bun scripts/autonomy-conformance.ts <exec|termfleet|github> [probeAgent]
```

It drives the **real** runner against its **real** backend with a trivial probe agent — no AI, no
mocks — launching / listing / cancelling and asserting: `launch` returns a running session; ids are
distinct per launch (received, not invented); params pass through verbatim; `list` shows them;
`cancel` removes them. **Exit 0 iff all core checks pass.** Expanded features (`get`/`update`, and the
`enforce-*` set a runner advertises via an optional `supports` list) are *reported, not required*.

This is the one deterministic test the design admits — the substrate seam is mechanical, unlike agent
behavior, which only real runs prove (§12). It is a conformance *harness*, not a unit test of
framework internals. Proven: **ExecRunner** (reference, deterministic) and **TermfleetRunner** (live
provider) both pass core 6/6.
