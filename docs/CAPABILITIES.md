# Capabilities — the agent authority model

A profile **declares** what each agent may do as substrate-agnostic capabilities. A capability is **not**
an instruction handed to a mediator — it **is a grant on the agent's own credential**. The substrate mints
the agent a credential scoped to exactly its capabilities, and the agent does its own reads and its own
writes **in-process**. Capabilities never name a substrate's resources (no `issue`, `pr`, `branch`,
`workflow`); they name only the universal things an agent acts on.

There are exactly **two guards**, and nothing else:

- **capabilities** — *what* the agent may do (its scoped credential).
- **budget** — *how much* it may spend (the bounded model token).

## The three nouns

An autonomy agent acts on exactly three things:

| noun | what it is | github | local (sketch) |
|---|---|---|---|
| **code** | the codebase under version control | the repo / branches | the working tree |
| **tasks** | units of work + their discussion | issues | a work-store |
| **agent** | the other agents + their lifecycle | workflow runs | the loop queue |

(`merge` is the tell: it's a version-control operation, so the noun is honestly **code**, not a vague
"artifact." That's substrate-agnostic at the *git* level — github and local are both git repos — not a
github leak.)

## The capabilities

| capability | meaning | github realization |
|---|---|---|
| `code:propose` | propose a change (write a feature branch, open a PR, queue auto-merge) | `contents: write` + `pull-requests: write` |
| `code:review` | **bless** a change for merge (post the verdict that gates landing) | `statuses: write` (posts the `agent-review` status) |
| `code:merge` | **land** a reviewed change onto the default branch | **never granted to anyone** — landing is native auto-merge (see the merge boundary) |
| `tasks:author` | create / update / label / set state of work | `issues: write` |
| `tasks:converse` | post comments / verdicts on work and changes | `issues: write` (comment scope) |
| `agent:launch` | start another agent | `actions: write` (dispatch) |
| `agent:list` | observe running agents | `actions: read` |
| `agent:update` | pause / resume / retry another agent | control plane |
| `agent:cancel` | stop another agent | `actions: write` + control plane |

`observe` (read the code and tasks) is **baseline** — every agent has it; it is not a declared
capability. Reads are bounded by the agent's sandbox + budget, never by a permission.

The `agent:*` axis is exactly the **Runner contract** (`core/runner.ts`: launch / list / update / cancel
over sessions) — the substrate-agnostic definition of the agent lifecycle.

**Scope (optional).** A capability may carry a resource scope: `code:propose@roadmap` = "propose changes
to roadmap files only" (the strategist's governance constraint, expressed as a scoped capability, not a
deterministic guard script). The constitution's `human_required_paths` / `topics` are the global
complement — the region **no** capability may ever reach.

## The trust model: agents are credentialed; only merge is gated

The agent runs with a credential **scoped to its capabilities** and acts directly. There is no
credential-less job, no bundle, no trusted publisher mediating its output. The one threat that justifies a
boundary is **prompt injection** via untrusted input (issue bodies, fetched pages, fork diffs) — and that
justifies a boundary only for the **irreversible, default-branch-affecting** power:

> **The single hard boundary: an agent can never merge.** `code:merge` is never grantable to an agent.

Everything an agent *can* do is recoverable, because the substrate is configured so a hijacked agent cannot
reach `main`, workflows, or secrets:

- **branch protection** on the default branch blocks direct push (a feature-branch PR is the only way in);
- the github **`workflows` permission** is never granted, so `.github/workflows` can't be edited even with `contents: write`;
- merging requires **two status checks — `ci` + `agent-review`** — and no single agent can produce both (see below);
- the install holds **no secrets** (the model token is OIDC-minted and bounded — that is the budget guard).

So a fully-hijacked `code:propose` + `tasks:converse` agent can, at worst, push junk to a feature branch
or post a bad comment — both reverted in seconds, neither touching `main`. (This is a deliberate, small
relaxation of the old "agent holds nothing" model; the cost is recoverable feature-branch/comment noise,
the gain is that agents are real agents instead of envelopes passed to a mediator.)

### The merge boundary — a permission split, no app, no merge job

Landing on the default branch is gated by **two non-overlapping permission sets**, so no single agent can
land unreviewed code — and the merge itself is **GitHub native auto-merge**, not a token or an app:

- **`code:review` = `statuses: write`** — the authority to *bless* a merge (post the `agent-review` verdict
  status). The reviewer holds this and **not** `contents: write`, so it can certify but cannot merge.
- **`code:propose` = `contents: write`** — the authority to push a branch / open a PR / queue auto-merge.
  Proposers hold this and **not** `statuses: write`, so they can push but cannot self-certify a review.

Branch protection requires `ci` + `agent-review` (0 approvals — so there's no self-approval problem and no
app is needed). The proposer enables auto-merge when it opens the PR; **GitHub** lands it the instant both
statuses are green. Consequences:

- a hijacked **proposer** can't post `agent-review` → can never land anything the reviewer didn't bless;
- a hijacked **reviewer** has no `contents: write` → can't merge or push at all;
- **no agent holds `code:merge`** — it isn't a token capability; the platform performs the merge.

`code:review` (bless) and the merge (perform) are deliberately separated; no agent holds both. That split —
not a dedicated app or a trusted gate job — *is* the merge boundary.

## The agent lifecycle (what replaced prepare / interpret)

```
provide            →     skill                    →     effect
(substrate hands the     (judges; emits result =        (the agent's own scoped
 trigger's subject in)    intent in capability terms)    actions — direct, in-process)
```

- **provide** — the substrate materializes the trigger's *subject* (a PR's diff+checks, an issue, …) into
  the sandbox. Generic; the only variable is which subject, declared by the trigger.
- **skill** — does the work and emits its typed `result`.
- **effect** — the agent invokes its own capabilities directly. There is no merge step to route to: the
  reviewer posts `agent-review` (`code:review`), the proposer queued auto-merge, and GitHub lands it.

There are no `prepare` / `interpret` scripts and no `config` hooks: "input gathering" is `provide`; "acting
on the result" is the agent using its own capabilities.

## github realization — the mapping is the whole story

The github substrate computes the agent job's `permissions:` block straight from its capabilities (the table
above). That is the entire realization: a normally-credentialed job, scoped. No wrapper of trusted jobs
around a credential-less core — the agent IS the job. There is no merge gate job and no app: landing is
native auto-merge gated by the `ci` + `agent-review` required checks, and the permission split keeps any one
agent from satisfying both.

`config.permissions` does not exist; gh permission blocks are *computed*, never written in the IR.

## The OA agents, declared in this model

| agent | capabilities |
|---|---|
| pm | `tasks:author`, `tasks:converse`, `agent:launch` |
| developer | `code:propose`, `tasks:converse` |
| reviewer | `code:review`, `tasks:converse` (posts `agent-review`; no `contents` → cannot merge) |
| strategy_reviewer | `code:review`, `tasks:converse` (blesses a roadmap proposal; cannot merge) |
| planner | `tasks:author`, `tasks:converse` |
| strategist | `code:propose@roadmap`, `agent:launch` |

No agent holds `code:merge`.

## What is NOT a capability

- **Observation** — baseline; reads are bounded by the sandbox + budget, not a permission.
- **Model access / budget** — the bounded model token (the budget guard), provisioned by the substrate; the
  IR declares the `budget`, not the credential.
- **Trust mediation** — no longer a concept. The old "untrusted agent → bundle → trusted publisher" design
  is replaced by scoped credentials + the merge boundary (the `code:review` / `code:propose` permission
  split + native auto-merge). There is no trusted mediator, no merge gate job, and no app.
