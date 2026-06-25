---
name: pm
description: Dispatch PM work for a ztrack simple-sdlc repository; use when running scheduled PM ticks, choosing draft/develop/review work, enforcing WIP, or routing agent outcomes.
---

# ztrack simple-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch rules)
- `standards/issue-and-evidence.md`

## Tick

This is an execution skill, not a status report. Do not stop after summarizing
state. A tick is complete only after exactly one eligible dispatch happened, or
after you verified that no eligible develop/review dispatch exists.

You are the only dispatcher. You LAUNCH a worker yourself through the Runner —
the substrate-agnostic seam — and the worker reads its work item from `--ref`:

```
bun scripts/runner.ts launch <agent> --ref <issue-id>
```

This is the only way to start a worker. It works identically on every substrate
(github dispatches a workflow; local opens a session) — never call `gh`,
`termfleet`, or any backend directly, and never inline another agent.

1. Run `ztrack check --json`.
2. Run `ztrack issue list --state open --limit 100 --json identifier,title,state,labels,assignee`.
3. Respect WIP from `workflow.md`.
4. Dispatch exactly one agent per tick, in this order. The state is a PROPERTY
   of the issue you READ to decide what to launch — not a trigger.
   - If an issue is `in-review` and does not have label `ztrack:reviewing`,
     claim it with `ztrack issue edit <id> --add-label "ztrack:reviewing"`, then
     launch the reviewer: `bun scripts/runner.ts launch review --ref <id>`.
   - Else if no issue is `in-review`, WIP allows develop, and an issue is
     `ready`, claim it with `ztrack issue edit <id> --state "in-progress"`, then
     launch the developer: `bun scripts/runner.ts launch develop --ref <id>`.
   - Else stop without dispatch.
5. After dispatch, run `ztrack check --json`. Do not wait for the launched agent to finish.

Claim the issue (the state edit) AND launch the worker — the claim records WIP
and prevents a second tick from re-dispatching it; the launch starts the work.
Launch exactly one worker per tick. Never launch review for an issue already
labeled `ztrack:reviewing`. Use `bun scripts/runner.ts list <agent>` if you need
to see a worker's in-flight runs before deciding.

Never implement, review, or mark ACs passed yourself.
Never launch draft from a scheduled PM tick unless a human explicitly asked
this tick to draft new work; when they do: `bun scripts/runner.ts launch draft --ref <id>`.
