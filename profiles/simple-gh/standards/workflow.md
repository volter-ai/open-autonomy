# Workflow Standard

Read this from the manager skill.

## Single-manager loop

`manager`, on a `cron: */30 * * * *` trigger, is the only scheduled agent that **dispatches or lands**
anything. `AUTONOMY_SINGLETON` dedups overlapping ticks, so a tick always runs to completion (or to
"nothing eligible") before the next one starts. Every worker in the loop (research/plan, implementation,
review) is a harness-native **subagent** the manager dispatches inside that one tick — never a separate
scheduled actor. The profile also declares a second scheduled agent, `planner`
(`skills/planner/SKILL.md`), whose sole output is docs-only plan-doc PRs on its own `plan/<date>`
branches — it never dispatches, never lands, and never promotes anything to `ready`, so the
single-manager claim above holds for everything that executes or merges work.

## Tick cadence

Every 30 minutes, the manager:

1. Checks `.open-autonomy/paused` — if present, does nothing this tick.
2. Reads `policy.box` fresh from `.open-autonomy/autonomy.yml` (never a cached copy).
3. Reads the board (`npx ztrack issue list --state ready`, `--blocked`) to see what's dispatchable.
4. Takes **at most one wave** of action (see WIP below), then stops.

## WIP = 1 wave per tick

At most one implementation subagent is in flight at a time, and at most one PR is being landed at a
time. The manager does not fan out multiple issues in parallel within a tick — `policy.maxConcurrent: 1`
is the enforced ceiling; this doctrine is what keeps a single tick's dispatch inside it. A tick that finds
an issue already mid-flight (an open PR, a running worktree) works that issue's next step (land, rework,
or wait) rather than starting a second one.

## The dispatch-only-ready doctrine

**The dispatch set is issues in `ready` state ONLY** — `npx ztrack issue list --state ready`. The
`--actionable` frontier (every not-done, unblocked issue) is **advisory context, not the dispatch set** —
it is status-blind, so treating it as dispatchable would let the manager pick up anything unblocked
regardless of whether a human or a prior research pass actually scoped it for this wave. Only an issue a
human or the manager's own research-and-plan step has explicitly moved to `ready` may be picked up for
implementation this tick.

## Worktree rules

- One implementation subagent per worktree, for the life of that dispatch — never two file-mutating
  agents sharing a tree.
- Never `git stash` inside a worktree (the stash is shared repo-wide); commit instead if work must be
  shelved.
- Dispatch implementation subagents with `isolation: "worktree"`; research/plan/review subagents are
  read-only and need no worktree isolation.

## Respect the pause fence

`.open-autonomy/paused` is the operator's kill switch. Its presence means: no new dispatch of any kind
this tick, full stop — not "finish the current wave and then stop," but "do not start anything." An
already-open PR sits untouched (no merge, no rework) until the fence is removed.

## Landing

See `standards/risk-and-review.md` and the manager SKILL.md §5 for the full land/merge doctrine (green
required checks + a recorded review verdict, both current on the PR's head SHA, before any merge).
