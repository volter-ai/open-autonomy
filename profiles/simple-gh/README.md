# simple-gh

A local, human-supervised GitHub profile with three scheduled roles and one declared human actor:

- **Manager** executes and lands approved roadmap work.
- **Planner** grows the product roadmap from declared direction versus code and runtime reality.
- **Kaizen** studies run history for recurring process failures and asks maintainers to resolve them.
- **Maintainer** is the human seam for triage, decisions, sensitive approval, and clarification.

`Manager` is the canonical name for the project-manager role; `pm` is not a second actor. Manager is the
only role that dispatches implementation/review subagents or merges ordinary work.

## Responsibility boundaries

| Layer | Owns | Must not know |
| --- | --- | --- |
| Substrate/Runner | schedules, fences, workspace isolation, actor launch/status/cancel/reap, generic lifecycle effects | task eligibility/storage, PR state, roadmap policy, role decisions |
| Manager | normalized ready tasks, implementation/review/landing, task transitions, human engagement | task persistence, roadmap discovery, Kaizen analysis |
| Planner | direction versus code/reality, product measurement, product-task publication | execution, transcripts/process retrospectives, task persistence |
| Kaizen | normalized session history plus durable outcomes, process findings | product-roadmap creation, execution, governance mutation, task persistence |
| Task service | lifecycle, task persistence/backing, identifiers, import, evidence validation | scheduling, sessions, branches, checks, merges |
| GitHub code host | branches, PRs, checks, reviews, merges | portable task lifecycle and roadmap policy |

The installed task service is ztrack. Its backing may be Markdown, GitHub Issues, or a synchronized
combination without changing the task API or turning the backing into a scheduler concern.

## Lifecycle

The profile maps portable states under `policy.box.taskStates`:

- Planner publishes proven proposals as `open`.
- An attributable Maintainer triages and promotes approved work to `ready`.
- Manager consumes only `ready`.
- Kaizen and ambiguous/sensitive Planner findings are `inputRequired`.
- Manager never promotes a task because of its filename, branch, namespace, or author.

Planner and Kaizen may use ztrack's plans-as-docs import. Manager never parses those documents; after
registration it sees normalized tasks through ztrack. Committed task changes land through ordinary
reviewed PRs with the same current-SHA review discipline as product changes.

## Planning and Kaizen

Planner performs incremental code-versus-vision review, a weekly connected consumer slice, and a
periodic exhaustive pass. It discovers the repository's product contracts, support matrices, targets,
tests, and audit commands instead of requiring product-specific filenames in the profile. When a
measurement is blind, Planner may propose a narrow failing-before improvement but may not merge it.
Each run retains only a compact reviewed audit receipt; raw inventories and command output remain
scratch.

Kaizen consumes normalized session history when available and reconciles it with durable task, git, PR,
CI, file, and test outcomes. A cross-harness tool such as Supercode is one realization, not a profile
requirement. Missing normalized history is reported as an observability gap rather than bypassed with
private-format parsing.
Kaizen likewise retains a compact reviewed report even when no finding qualifies, so its next review
has a durable cursor without accumulating raw transcript copies.

## Scheduling and safety

The local compiler emits a generic per-job schedule. Every job is fenced; a local target configuration
may assign separate execution and analysis fences without placing role logic in scheduler source.
`policy.maxConcurrent: 1` supplies scheduled backpressure.

Every landed PR requires all repository checks green and a fresh recorded
`oa-review: pass sha=<current-head>`. A later push invalidates the review. Never use an admin merge or
push directly to the protected default branch.

This profile targets `local` because Manager merges through the operator's local GitHub credential.
That single-credential reality means the recorded review is a fresh context, not an independent security
principal. Branch protection with the adopter's real required CI and `enforce_admins: true` is the
mechanical merge gate.

Model values are mandatory `research` and `implement` tiers. The active harness must realize both tiers
through its per-dispatch model routing; Manager fails closed before dispatch if either tier is unavailable.
It never substitutes a single model or silently changes the configured tier.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-gh local /tmp/simple-gh-kit
```

Use the local schedule-configuration option when an installation needs independent execution and
analysis fences.
