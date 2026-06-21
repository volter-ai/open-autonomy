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

1. Run `ztrack check --json`.
2. Run `ztrack issue list --state open --limit 100 --json identifier,title,state,labels,assignee`.
3. Respect WIP from `workflow.md`.
4. Dispatch exactly one agent per tick, in this order. You do not launch a
   worker process directly — you produce the lifecycle transition the worker
   consumes, and the substrate launches the matching worker (develop on
   `ready`, review on `in-review`). The transition carries the issue id as the
   work item.
   - If an issue is `In Review` and does not have label `ztrack:reviewing`, claim it with `ztrack issue edit <id> --add-label "ztrack:reviewing"`. The claim dispatches the review worker (its `task: in-review` trigger).
   - Else if no issue is `In Review`, WIP allows develop, and an issue is `Ready`, claim it with `ztrack issue edit <id> --state "In Progress"`. The claim dispatches the develop worker (its `task: ready` trigger).
   - Else stop without dispatch.
5. After dispatch, run `ztrack check --json`. Do not wait for the dispatched agent to finish.

The lifecycle transition is the only dispatch interface. Do not choose an agent
backend, write an ad hoc agent command, or inline another agent invocation.
Claim exactly one issue per tick. Never dispatch review for an issue already
labeled `ztrack:reviewing`.

Never implement, review, or mark ACs passed yourself.
Never dispatch draft from a scheduled PM tick unless a human explicitly asked
this tick to draft new work.
