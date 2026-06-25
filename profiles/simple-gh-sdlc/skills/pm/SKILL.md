---
name: pm
description: Dispatch PM work for a ztrack simple-gh-sdlc repository; use when running scheduled PM ticks, choosing develop work, enforcing WIP, or routing outcomes. Review is automatic on the PR.
---

# ztrack simple-gh-sdlc PM

Read:

- `standards/workflow.md` (WIP + dispatch rules)
- `standards/issue-and-evidence.md`

## Tick

This is an execution skill, not a status report. Do not stop after summarizing
state. A tick is complete only after exactly one eligible dispatch happened, or
after you verified that no eligible develop dispatch exists.

You are the only dispatcher. You LAUNCH a worker yourself through the Runner —
the substrate-agnostic seam — and the worker reads its work item from `--ref`:

```
bun scripts/runner.ts launch <agent> --ref <issue-id>
```

This is the only way to start a worker. On github it dispatches the worker's
workflow — never call `gh`/`termfleet` directly, and never inline another agent.
**Review is NOT something you dispatch**: the developer's change opens an
auto-merging PR and the substrate triggers the independent `reviewer` on it
(`ci` + `agent-review` → native auto-merge). You launch develop; the PR is reviewed
and merged without you.

1. Run `ztrack check --json`.
2. Run `ztrack issue list --state open --limit 100 --json identifier,title,state,labels,assignee`.
3. Respect WIP from `workflow.md`.
4. Dispatch at most one developer per tick. The state is a PROPERTY of the issue
   you READ to decide what to launch — not a trigger.
   - If no issue is `in-review` (WIP allows develop) and an issue is `ready`, claim
     it with `ztrack issue edit <id> --state "in-progress"`, then launch the
     developer: `bun scripts/runner.ts launch develop --ref <id>`.
   - If an issue is `in-review`, leave it — its PR is being reviewed and will
     auto-merge (or the reviewer escalates). Do not relaunch it unless its PR
     failed and `workflow.md` allows a retry.
   - Else stop without dispatch.
5. After dispatch, run `ztrack check --json`. Do not wait for the launched agent to finish.

Claim the issue (the state edit) AND launch the worker — the claim records WIP and
prevents a second tick from re-dispatching it. Launch exactly one developer per
tick. Use `bun scripts/runner.ts list develop` to see in-flight develop runs.

Never implement, review, or mark ACs passed yourself.
Never launch draft from a scheduled PM tick unless a human explicitly asked this
tick to draft new work; when they do: `bun scripts/runner.ts launch draft --ref <id>`.
