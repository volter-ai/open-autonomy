# IR workflows — the program model (step/ABI + universal envelope)

Status: **design** (driving the `raw → 0` migration of `profiles/self-driving`). Grounded in decomposing
OA's own workflows (`open-autonomy-planner.yml`, `open-autonomy-strategist.yml`, …).

## The thesis (VM framing)

The IR is a **program**; OA is the **virtual machine**; a substrate (`github`, `local`) is a **computer**
it compiles down to. Today OA's workflows are the program hand-written as one computer's **machine code**
(github Actions YAML + `gh`) and parked in `raw`. `raw` is the IR's **inline assembly** — legitimate only
for genuinely one-computer artifacts, never as the default. For a profile like `self-driving`, `raw`
should trend to **zero**.

## What's universal vs program (from the decomposition)

Decomposing the real workflows, every one is the same shape:

```
[universal envelope]  on/permissions/env/runs-on/timeout · checkout+bun · (model mint→revoke if needed) ·
                      upload-artifact · (launch: + control plane + concurrency)
[program pipeline]    step → step → step   (each step is a logic script reading/writing via the ABI)
```

- **planner** = `gather`(open issues, `label:origin:roadmap-planner`) → `run`(`public-agent-planner.ts`)
  → `apply`(create/update issues + labels). Deterministic — no model.
- **strategist** = `gather`(research signals) + `gather`(prior proposals) → `run`(`public-agent-strategist.ts`,
  **needs a model**) → `apply`(open a roadmap-proposal PR, dispatch the strategy reviewer).

The *envelope* is identical across all of them (and where OA hand-wrote it, it **drifted** — the codex
sandbox-relax and the operator control plane each appear in only 1 of 6 agent workflows; a compiler
applies them uniformly, which is a correctness win, not just DRY).

## The model

A workflow = `triggers[]` + `steps[]`. The **compiler** wraps the steps in the universal per-substrate
envelope; each **step** is a small primitive the substrate implements (the **ABI**). The IR names the
pipeline + its data; the substrate renders it.

### Universal envelope (the compiler injects, uniformly)

- `on:` from `triggers` (+ the `apply` dry-run/apply dispatch-input convention)
- `permissions:` from `capabilities`
- `env` / `runs-on` / `timeout-minutes` (from config)
- checkout + setup-bun + `bun install` + codex sandbox-relax
- **model envelope** — if any step `needsModel`, wrap the run with substrate model access
  (github: `model-proxy-mint` → token → `model-proxy-revoke`; local: the local key, directly)
- `upload-artifact` of `.agent-run/<name>` on `always()`
- for `launch:` (interactive agent) workflows: the operator control plane (`agent-control` + `issue_comment`)
  and the control-aware concurrency group

### Steps = the substrate ABI

A step is a logic script (injected runtime) that reads/writes the world only through an injected
**substrate client** — never raw `gh`/git. The substrate provides the client implementation:

| ABI op | github | local |
|---|---|---|
| `listWork(query)` | `gh issue/pr list --search …` | local work-store read |
| `createWork` / `updateWork` | `gh issue/pr create/edit`, labels | local work-store write |
| `openChange` (branch+commit+PR) | git + `gh pr create` | git + local review |
| `dispatch(workflow, inputs)` | `gh workflow run` | enqueue on the loop |
| `model.complete` | proxy token (bounded) | local key |
| `launch(agent, params)` | the Actions job (the Runner) | termfleet (the Runner) |

So the bespoke bash in today's workflows (signal-gathering loops, PR-body formatting) becomes logic in
scripts that call the client; the client is the only substrate-specific surface, implemented once per
computer.

## Build sequence (`raw → 0`)

1. **Harden the envelope** in `compileGithub.workflowYml` — hoist the universal bits OA hand-wrote so
   every generated workflow gets them. **Done so far:** `upload-artifact` (always) and the Node-24
   JS-actions opt-in (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`) are now compiler-injected uniformly.
   **Remaining:** the model mint/revoke wrapper for `steps` (arrives with the strategist migration),
   uniform sandbox-relax, and uniform control plane.
2. **Define the step/ABI model** in the IR (`steps[]` + the verb/`with` client interface) + implement
   the github client. **Done:** `IRStep {name, uses, with, applyOnly, needsModel}` in `core`; the
   github client renders `gather` (`gh issue list`), `run` (`bun <script>`), and `apply` (apply a
   work-mutation plan via `gh`) in `substrate-github/src/emit.ts`. The local client (work-store +
   termfleet) is the remaining half, needed when a `steps` profile targets local.
3. **Regenerate one workflow** (planner — deterministic, simplest) from the IR; verify behaviorally
   equivalent to the hand-authored one. **Done:** `profiles/self-driving` carries planner as a
   `gather → run → apply` pipeline (no `raw`); `compile` generates it and OA's own root planner *is*
   the generated workflow (`check:dogfood` + the production-readiness tests pass). Behavioral deltas
   are envelope normalizations only (job name, `.agent-run` artifact scope, default label color).
4. **Migrate `self-driving` off `raw`**, one workflow at a time (planner ✅ → strategist → review →
   strategy-review → pm → public-agent). Relocate `model-proxy-admin` into the **github substrate**
   (it's substrate infra, not profile `raw`).
5. End state: `self-driving` has **zero `raw`**, compiles to github *and* local, and the same program
   runs on both computers — which is what the IR was for.

`raw` survives only for true one-computer artifacts (and even those are usually better modeled as
substrate infra). The amount of `raw` in a profile is an inverse measure of how well the VM is doing
its job.
