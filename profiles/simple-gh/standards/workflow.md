# Workflow Standard

Read this from Manager, Planner, and Kaizen.

## Layer boundaries

The substrate schedules, fences, launches, observes, and reaps actor sessions. It does not read tasks,
PRs, roadmap documents, task persistence, or role-specific metadata.

- **Manager** executes and lands the approved roadmap.
- **Planner** grows and prioritizes the product roadmap from vision versus repository reality.
- **Kaizen** studies run history and creates maintainer-facing process work.

No role acts as a fallback for another. Manager never replenishes the roadmap; Planner never performs
process retrospectives; Kaizen never files product capability work.

## Task API versus persistence

Agents access the board only through the configured task service. Its backing is independent of the
execution substrate. Markdown plan documents and committed tracker stores are persistence/import formats,
not coordination APIs.

GitHub owns branches, PRs, checks, reviews, and merges. A task service using GitHub Issues as a backing
does not make raw GitHub Issues a parallel task interface.

Planner and Kaizen may publish task documents through the task tool. Manager consumes normalized tasks
and never reconstructs one from a persistence path, index, or owning document. When task changes are
committed, their proposals land through ordinary reviewed PRs. Lifecycle state is the only dispatch
signal.

Portable task states are mapped in `.open-autonomy/autonomy.yml` under `policy.taskStates`:

- Planner publishes fully evidenced proposals as `open`; a Maintainer promotes approved work to `ready`.
- Manager dispatches only `ready`.
- Kaizen publishes process findings as `inputRequired`.
- Ambiguous, risky, or authority-blocked work is `inputRequired`, never silently executable.

## Generic scheduling

The installed local schedule consists of generic jobs with a stable name, interval, retry interval,
fence, workspace mode, and opaque command. The scheduler may launch, retry, apply concurrency limits,
reap sessions, and invoke generic lifecycle effects. It must not contain task queries, PR queries, role
decisions, roadmap namespaces, provenance markers, or product-audit logic.

Every scheduled actor is fenced. An installation may configure independent execution and analysis
fences as local target data; role names and fence paths never appear in scheduler source.

## Manager execution wave

Each Manager tick performs at most one wave:

1. reconcile one task proposal/state PR;
2. otherwise reconcile one working task or implementation PR;
3. otherwise query the mapped `ready` state;
4. dispatch one implementation, perform one rework, land one eligible PR, close one task, engage a
   Maintainer, or wait; and
5. stop.

Only `ready` is dispatchable. An empty ready queue is a successful tick. One implementation subagent
owns one worktree; never share mutating worktrees or use the repository-wide stash for handoff.

## Planner and Kaizen

Planner reads direction, code, tests, public surfaces, product measurements, and the task API. It uses
helpers as evidence but independently traces outcomes. It publishes product proposals as `open` and
never promotes them to `ready`.

Kaizen reads normalized session history and reconciles transcript claims with durable task, git, PR, CI,
file, and test outcomes. Its findings are `inputRequired` maintainer tasks, not a special namespace or
scheduler route.

## Landing and human boundary

All landed PRs require green repository checks and a fresh `oa-review: pass` for the current SHA. Never
admin-merge or push directly to the protected default branch.

Any configured protected path, semantic human-required topic, governance/measurement change, ambiguous
decision, or missing authority moves work to `inputRequired`. Agents never weaken their own gate.
