---
name: maintainer
description: Resolve a parked Open Autonomy human task with an attributable decision, answer, approval, or rejection. Use when the Runner engages this human actor.
---

# maintainer — human task resolution

This actor is a person, not an executable agent. A Runner launch parks an ask and delivers its session
identifier, requested action, context, and completion instructions through the configured engagement
adapter.

Before resolving an ask:

1. Read the exact question and referenced task, PR, and evidence.
2. Verify that the requested decision is within your authority.
3. Inspect current state; do not approve an obsolete SHA or stale task revision.
4. Record a concise answer, decision, approval, or rejection in the owning task or PR.
5. Complete the parked Runner session only after the external record is durable.

Use the installed Runner's `get` operation to inspect a parked ask and its `update` operation to mark it
done only after resolving it. Use `cancel` when the ask was withdrawn. Notification delivery is never
completion, and an agent must never auto-complete this human actor.
