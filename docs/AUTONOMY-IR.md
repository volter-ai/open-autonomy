# Autonomy IR (`autonomy.ir.v1`) — a substrate-agnostic format

> **Status:** design sketch, for review. Nothing here is wired into code yet.
> **Home:** open-autonomy is the host format; ztrack is one *bundle* you plug in,
> not a dependency (§7).

## 1. Thesis

The ztrack profile (`profile.json`, `ztrack.profile.v1`) and the open-autonomy
manifest (`autonomy.yml`, `open-autonomy.autonomy.v1`) are not two systems that
resemble each other — they are **one control-plane design serialized against two
execution substrates**. The tell: both ship a `humanRequiredPaths` /
`humanRequiredTopics` pair with near-identical contents.

This doc extracts the shared machine into one intermediate representation (IR)
that can **ingest** either format and **compile** to any target — a local
self-driving setup, a GitHub Actions setup, or both in the same repo.

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
- which **cron** runs what (launch an agent, or run a script),
- which **files** to copy.

Everything else — tool capabilities, edit-blocking, sensitive topics, merge rules,
human-required paths — is either **prose in a skill prompt** or a value in a
**`config` box** (per-agent, per-workflow, or global). Boxes are opaque to the
*format*; their keys are read by whichever consumer understands them.

## 3. The reduction — what is *not* a primitive

| Candidate | Verdict | Why |
|---|---|---|
| Standards docs | **resources** | The format never interprets them; a skill cites them. Dumb copy. |
| Work store | **bundle-internal** | All reads/writes happen inside a skill or script via the box's CLI. The IR only passes an opaque `WorkRef`; it never models a store. |
| Gate (`ztrack check`) | **a workflow** | A cron that `run`s a script. Not a slot. |
| Direction / roadmap | **a resource input** | A file the PM reads from the box. |
| Capabilities | **`config` box** | `pr:open` means something on github, nothing locally. Passthrough. |
| Sensitive topics | **review-skill prose** | Advisory judgment the reviewer agent applies, not a typed field. |
| ztrack itself | **optional bundle** | One bundle providing a work store CLI + an evidence gate. Swappable. |

What survives is **four nouns over two substrate primitives, across three adapter
axes.**

## 4. The substrate: two primitives

From a worker agent's seat there is only ever:

1. **The Runner** — CRUD over sessions, and the **enforcement point for the
   guardrails it understands** (concurrency, and any `config` keys it reads). The
   *one* behavioral seam between a laptop loop and GitHub Actions.
2. **The Box** — a POSIX filesystem + shell + git + a model endpoint in env + the
   copied files on PATH. Docker, laptop, GHA runner, Firecracker microVM all satisfy
   the same interface. The agent cannot tell which it is in. **Everything tool-shaped
   — including the work-store CLI — lives here**, called from inside skills/scripts.

A `Session` is *(a box) + (an agent process running role R against target T)*, and
`launch()` decomposes into "acquire a box, provision it to the image spec, start the
agent." Adding a substrate = writing a Runner over a box-source.

### 4.1 The Runner contract

`launch` is the floor; the read/delete verbs exist so the runner can **enforce**
guardrails (`maxConcurrent` needs `list()`; pause/cancel needs `cancel()`). `target`
is an opaque `WorkRef` — the runner passes it to the session; the *skill* resolves it
against the box's work-store CLI. The runner never touches the store.

```ts
type SessionId = string;
interface WorkRef { id: string }   // opaque handle; the runner never interprets or resolves it
interface Session { id: SessionId; role: string; target: WorkRef; status: 'running'|'done'|'failed' }

interface Runner {
  launch(role: string, target: WorkRef): Promise<SessionId>;  // create — REQUIRED
  list(): Promise<Session[]>;                                 // read   — enables maxConcurrent
  cancel(id: SessionId): Promise<void>;                       // delete — enables pause / human-required
  continue?(id: SessionId): Promise<void>;                    // update — enables retry budgets
}
```

The runner reads **per-agent `maxConcurrent`** and **global `policy.maxConcurrent`**
and enforces the binding one (the min). A substrate can be onboarded with `launch`
alone (a runaway-but-working fleet with relaunch-on-interval recovery), then grow
`list`/`cancel`/`continue` exactly as you turn on each guardrail.

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
| **tooling / bundle** | ztrack / gh | work-store CLI, the gate command behind `run` |

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

workflows:                       # cron → exactly one of launch | run (+ optional config box)
  - { name: pm-tick,         cron: "*/15 * * * *", launch: pm }
  - { name: recover-develop, cron: "*/15 * * * *", run: scripts/recover-develop.mjs }
  - { name: gate,            cron: "*/15 * * * *", run: scripts/gate.sh }

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
| `workflows` | reasons | `cron` + exactly one of `launch`(agent) / `run`(script); optional `config` box |
| `policy` | reasons | global `maxConcurrent`; `box` is opaque |
| `resources` | carries | verbatim copy of files referenced only inside skills/scripts |

### Rules

- **Reference implies copy.** Anything the IR names is copied by virtue of being
  named. So the **copy set** = (skill folders from `agents`) ∪ (scripts from
  `workflows.run`) ∪ (`resources`). `resources` lists only the *unreferenced*
  remainder — no double-encoding.
- **`workflows` actions are two keys, not a DSL.** Exactly one of `launch` (an agent
  name that must exist in `agents`) or `run` (a script path). Nothing to parse.
- **Cron is the only default trigger.** PM-on-cron is the dispatcher; an event-driven
  triage trigger would launch PM, which the cron already does — it adds latency
  reduction, not capability, so it is not core. A substrate may add event triggers as
  an extra.
- **Boxes are opaque to the format, read by consumers.** A compile-time adapter reads
  what it understands (github maps `config.capabilities` → workflow `permissions:`);
  the **runner** reads what *it* understands at runtime (concurrency, edit-blocking).
  Nothing in a box is required of every target — only `maxConcurrent` is.
- **No leaked tokens.** Destinations (`.claude` vs `.codex`), CLIs (`ztrack` vs
  `gh`), and cron rendering all live in adapters, never in the interpreted fields.

## 7. ztrack as the reference bundle

Making ztrack optional means the IR guarantees a **gate workflow, not gate rigor.**
ztrack's "close on evidence, not prose" is the *rigorous* gate; another setup may
pick a weaker `run:` command. Universality buys tool-agnosticism at the cost of
opinionatedness — a deliberate trade.

ztrack ships as the recommended bundle providing two things via the **tooling** axis,
neither of which the IR knows about:

- **Work-store CLI** — the skills/scripts call it to read and mutate work items. The
  IR only ever passes an opaque `WorkRef`; the store is entirely behind the bundle.
- **Evidence gate** — `ztrack check`, behind a `run:` in a gate workflow.
  `action.yml` already runs exactly this inside GitHub Actions, so the gate is the
  *same command* on both substrates.

Swap ztrack out (e.g. `gh` + `npm test`) and the IR is unchanged.

## 8. Worked compile: one IR → both targets

`compile(ir, target)` picks the substrate driver + harness adapter + tooling for
`target`, then renders the three substrate-specific categories and copies the files.

| IR construct | **local** | **github** |
|---|---|---|
| `agents.pm.skill` | harness copies to `.claude/skills/x-pm` + `.agents/skills/x-pm` | harness copies to `.codex/skills/open-autonomy-pm` |
| `agents.*.config.capabilities` | ignored | adapter → workflow `permissions:` + tokens in `autonomy.yml` |
| `agents.*.maxConcurrent` / `policy.maxConcurrent` | runner counts termfleet sessions (`list`) and holds at the limit | runner counts `gh run list` / open PRs and holds |
| `workflows.launch: pm` | `schedule.json` entry → `run.mjs` loop → `run-agent.mjs` → termfleet `new` | `pm.yml` `on: schedule` → `workflow_dispatch` of the session job |
| `workflows.run: scripts/gate.sh` | loop tick; `run` binds to `ztrack check` | `ztrack.yml` required status check (`volter-ai/ztrack@v0`) |
| `cron: "*/15 * * * *"` | converted to the loop interval | emitted verbatim as `on: schedule` |
| `resources/*` | copied (mirrored) | copied (mirrored) |

```
# compile --target local                       # compile --target github
.volter/tracker-config.json                     .open-autonomy/autonomy.yml      (emitted manifest)
profiles/x/profile.json        (emitted)        .github/workflows/pm.yml         (cron)
profiles/x/scheduler/schedule.json              .github/workflows/public-agent.yml
profiles/x/scheduler/scripts/run.mjs  (loop)    .github/workflows/ztrack.yml      (gate)
profiles/x/scripts/run-agent.mjs (termfleet)    services/agent-model-proxy/…      (runner launch)
.claude/skills/x-pm/SKILL.md                    .codex/skills/open-autonomy-pm/SKILL.md
.agents/skills/x-pm/SKILL.md                    docs/standards/…
profiles/x/standards/…
```

Same `ir.yml`, same skills, same `maxConcurrent`, same gate command. What differs is
only the three generated categories: **trigger transport** (loop vs cron), **runner
glue** (termfleet vs proxy+dispatch), **emitted manifest** (`profile.json` vs
`autonomy.yml`).

### Both in one repo

`targets: [local, github]` runs both drivers over one source. They write to disjoint
paths (`profiles/` + `.volter/` + `.claude` vs `.github/workflows/` + `.open-autonomy/`
+ `.codex`), so they coexist; the skill *content*, `maxConcurrent`, and gate command
are single-sourced. Edit `autonomy/` once, regenerate both.

## 9. Round-trip check

Lossless for the shared core; the substrate-specific extras survive by riding in the
`config` boxes (the IR is the superset, each emitter projects down).

| IR field | from `profile.json` | from `autonomy.yml` | note |
|---|---|---|---|
| `agents[].skill` | `skills[role].source` | `skills[role]` | clean |
| `agents[].config.capabilities` | absent → empty box | `agents[role].capabilities` → box | overflow rides the box; emitter defaults missing caps least-privilege |
| `agents[].maxConcurrent` / `policy.maxConcurrent` | `policy.wip.*` | `policy.autonomy.*` | union into concurrency |
| `workflows` | `scheduler.scripts[]` (cron/loop) | `agents[].triggers.schedule` | github event triggers, if any, drop on local |
| gate `workflow` | `preset` via `ztrack check` | `merge` + `review-rubric` + CI | preset canonical; `merge` rides `config.box`, github-only |
| human-required / topics | `policy.humanRequired*` → box / prose | `policy.risk.*` → box / prose | carried opaque, or in reviewer skill |
| `resources` | `standards[]` | `documents`/`standards` | clean |

## 10. Schema (`autonomy.ir.v1`)

```ts
import { z } from 'zod';

const Box = z.record(z.string(), z.unknown());   // opaque; consumers read what they understand

const Agent = z.object({
  skill: z.string(),                                       // folder, relative to bundle root
  maxConcurrent: z.number().int().positive().default(1),
  config: Box.default({}),
});

const Workflow = z.object({
  name: z.string(),
  cron: z.string(),                                        // the one default trigger
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
  separate package shipping a bundle.
- **Where does the IR live in a repo?** Proposal: `.open-autonomy/ir.yml` as the
  source of truth, with `profile.json` / `autonomy.yml` becoming *emitted artifacts*.
- **Resource placement** is a driver convention (mirror); with categories removed,
  matching a target's legacy layout (e.g. `docs/standards/`) means either a uniform
  greenfield location or a per-driver remap of conventional folder names.
- **Decision/audit trail** is currently substrate-specific (ztrack `.audit.jsonl` vs
  `volter.agent.decision.v1`). Left out of the IR for now; may want a thin contract.

---

*Companion artifacts (not yet written): `ingest/{profile,autonomy}.ts` (format → IR,
with a round-trip proof like ztrack's `markdownPort`) and `emit/{local,github}.ts`
(IR → target).*
