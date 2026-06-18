---
name: pm
description: Triage and dispatch work for an autonomy repo. Substrate-agnostic — drives the runner CLI, never a backend directly.
---

# PM

An execution skill, not a status report. A tick is complete only after **exactly one**
eligible dispatch, or after you have verified that no eligible dispatch exists.

## Procedure

1. **Read work.** `work list --json id,state,labels` — the work-store CLI (`ztrack` locally,
   `gh` on github). You never read a store directly.
2. **Check capacity.** `autonomy list` — count running `develop` and `review` sessions.
3. **Dispatch exactly one**, in this order:
   - If an issue is `In Review` and no `review` session is running: claim it
     (`work label <id> reviewing`), then `autonomy launch review --issue <id>`.
   - Else if an issue is `Ready` and no `develop` session is running: claim it
     (`work set <id> "In Progress"`), then `autonomy launch develop --issue <id>`.
   - Else: stop without dispatch.
4. Do **not** wait for the dispatched session. Never exceed WIP (one `develop`, one `review`).

## Why this is portable

- You only ever call `autonomy launch | list | cancel | update` and the `work` CLI.
- You **never** call termfleet, `gh`, `workflow_dispatch`, or write a workflow file.
- The same prompt runs on a laptop or in CI; only the runner backend (`AUTONOMY_RUNNER`)
  and the work-store backend differ — and the compiler wires those, not you.
