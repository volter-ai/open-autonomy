# Capabilities — the agent authority model

A profile **declares** what each agent is allowed to do as substrate-agnostic capabilities. A substrate
**realizes** each one through its own machinery (github: the permissioning/control wrapper) — or ignores
it. Capabilities never name a substrate's resources (no `issue`, `pr`, `branch`, `workflow`); they name
only the universal things an agent acts on.

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
| `artifact:author` | make changes to the artifact | contents + pull-requests: write (+ trust split, below) |
| `tasks:author` | create / update / label / set state of work | issues: write |
| `tasks:converse` | post comments / verdicts on work and changes | issues + pull-requests: write (comment scope) |
| `agent:launch` | start another agent | actions: write (dispatch) |
| `agent:list` | observe running agents | actions: read |
| `agent:update` | pause / resume / retry another agent | the operator control plane (labels, …) |
| `agent:cancel` | stop another agent | actions: write + control plane |

`observe` (read the artifact and tasks) is baseline — every agent has it; it is not a declared capability.

The `agent:*` axis is exactly the **Runner contract** (`core/runner.ts`: launch / list / update / cancel
over sessions) — the system's substrate-agnostic definition of the agent lifecycle. The operator always
holds the full Runner contract over a running agent, so the **control plane is part of the universal
envelope** on every launchable agent, not gated behind a capability; `agent:*` on an agent is *its*
authority over *other* agents.

## What is NOT a capability

- **Trust posture** — derived, not declared. An untrusted model (`launch`) authoring changes is realized
  with the substrate's trust split (github: a read-only runner emits a bundle → a separate trusted
  publisher validates and applies it); a trusted script (`run`) authoring changes writes directly. So
  `launch`-vs-`run` × `artifact:author` determines the trust machinery — there is no `proposes:bundle`
  knob (that was github leaking into the IR).
- **Review / merge enforcement** — policy, not capability. A reviewer *records* a verdict via
  `tasks:converse`; the merge gate (`require_low_risk_review`, decision records) *enforces* it. There is
  no `artifact:review` capability.
- **Model access** — provided by the box (the substrate gives the agent a model endpoint, bounded as it
  sees fit); the IR does not declare it.

## The seven OA agents, declared in this model

| agent | capabilities |
|---|---|
| pm | `tasks:author`, `tasks:converse`, `agent:launch` |
| developer | `artifact:author`, `tasks:converse` |
| reviewer | `tasks:converse`, `agent:launch` |
| strategy_reviewer | `tasks:converse`, `agent:launch` |
| planner | `tasks:author`, `tasks:converse` |
| upgrade | `artifact:author` |
| strategist | `artifact:author` |

Every current github-noun capability re-maps with nothing left over:
`issue:comment` → `tasks:converse`; `issue:label/create/update` → `tasks:author`;
`pr:open/update`, `branch:write` → `artifact:author`; `pr:comment` → `tasks:converse`;
`pr:review` → `tasks:converse` (+ policy); `workflow:dispatch` → `agent:launch`.
