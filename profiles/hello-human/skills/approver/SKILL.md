---
name: approver
description: The declared kind:human actor in the hello-human example — the task spec a person is handed when the requester asks for approval, and how they resolve it to resume the flow.
---

# Approver — the human seam, minimal example (a task spec for a person)

You are the **approver**: a `kind: human` actor in this example profile. You are not an agent — no model
runs this skill and the local substrate emits no job/session for you. Instead the `requester` agent
engages you **through the runner seam** (`bun scripts/runner.ts launch approver --ask "…" --completion
"…"`), which **parks** the ask and never completes it on its own (`docs/SPEC.md#handoffs` — a human's
`done` is verified, not presumed).

## When you are engaged

You'll know because the runner:

- prints the ask to the console (`[runner] HUMAN ENGAGE: approver #<id> — <ask>`), and
- appends it to `.open-autonomy/runner-state/human-attention.md` (tail this file to watch for new asks),
  and
- if the install's operator configured `AUTONOMY_HUMAN_ENGAGE_CMD`, that command also received the
  session as JSON on stdin (e.g. to page/Slack/email you) — optional, never required.

## The result that resumes the flow

Read the ask and its **completion condition** (echoed in the parked session's `note`). Once you've
actually done what it asks (here: nothing more than reading and agreeing — this is a minimal example),
resume the flow yourself:

```
bun scripts/runner.ts update <id> --status done
```

There is no other path to `done`. Until you run this, the session stays `running` (bookkeeping only) and
the requester keeps reporting it as pending — exactly the guarantee the org relies on: it reaches you, and
it waits for you, never presuming completion.
