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

- **Trust / output mediation** — not a capability at all. Whether an agent's output is untrusted (and
  must be mediated before it touches the repo) is the **substrate's security responsibility, derived from
  how it runs the agent**: model-interpreted behavior → untrusted → the substrate mediates (github: a
  read-only agent emits a bundle → a separate trusted publisher validates and applies it); a deterministic
  implementation → direct. The IR can't run codex, so it can't mediate; declaring "untrusted" wouldn't
  change that the substrate must implement it. So trust is neither a capability nor an IR field. (If a
  profile ever needs to override it, that's a `config` key, not a capability — `commit`/`propose` were a
  wrong turn that conflated authority with trust.)
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

## How github realizes a model-interpreted agent — the wrapper

When github runs an agent's behavior **via a model** (untrusted output), it compiles to **trusted wrapper
jobs around the one untrusted agent job**. The wrapper is universal (identical for every such agent,
running injected-runtime scripts); only the agent's **behavior** varies. The trust boundary is correct
*by construction* — the agent never leaves its own read-only job, so wrapping only adds trusted jobs
around it. Which wrapper jobs appear is selected by capabilities:

```
control     (parallel)  operator verbs            always (agent:* lifecycle exposed to the operator)
setup       (pre)       decide + mint a token      always for a model agent
agent       (UNTRUSTED) codex + skill → bundle     always — persist-credentials:false, read-only perms,
                                                    OIDC→bounded token, emits .agent-run/out/bundle
publisher   (post)      validate + apply bundle    only when `artifact:author`
post-ci     (post)      run CI on the new change    only when `artifact:author`
post-review (post)      direct review               only when `artifact:author`
```

The trust split is keyed off **model-interpreted execution × `artifact:author`**: an untrusted model that
authors changes gets the read-only-agent → trusted-publisher split; a deterministic implementation that
authors changes writes directly. Execution mode is the substrate's choice; the split follows from it.

**Security wiring the realizer must preserve (load-bearing, not cosmetic):**
- agent job: `persist-credentials: false`; permissions `contents/issues/pull-requests: read` + `id-token: write` only; no `GH_TOKEN`/admin token in its env.
- the bundle is the *only* channel from agent → publisher (an artifact), never a shared filesystem.
- publisher binds the bundle to the run: `github-agent-publish --apply --expected-run-id <mint> --expected-repo <repo> --allowed-paths <policy>` — so a bundle can't be smuggled across runs/paths.
- model access is mint→exchange(OIDC)→bounded token→revoke; the admin secret rides only on mint/revoke.

Each wrapper job runs an **injected-runtime** script (`public-agent-decision.ts`, `github-agent-publish.ts`, `public-agent-ci.ts`, `public-agent-review.ts`, `model-proxy-*`); the substrate owns the wrapper, the profile owns only the skill. This is the realizer build for `launch` agents — provable once on any `artifact:author` agent (the wrapper is identical), with a live run (real codex → bundle → publish) as the final gate before it replaces the carried `public-agent.yml`.
