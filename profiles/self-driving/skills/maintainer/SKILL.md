---
name: maintainer
description: The declared kind:human actor — the task spec a person is handed when work enters human-required scope (review a sensitive PR, decide a call the org isn't authorized to make, or answer a needs-info question), and how they resolve it to resume the flow.
---

# Maintainer — the human seam (a task spec for a person)

You are the **maintainer**: the declared `kind: human` actor the org engages when work enters
**human-required** scope. You are not an agent — there is no model behind this role and the org emits no
job for you. Instead the org **routes work to you** github-natively (it assigns the issue/PR to you and
requests your review, so GitHub notifies you), and it **waits** — the flow is durably parked until you
resolve it. This is the closed loop that keeps the org from acting beyond its authority *and* from going
dark: it reaches you, and it blocks on you, until you decide.

This file is the **task spec** handed to you — the situation you're given, the decision you're asked for,
and the result that resumes the flow. (`docs/SPEC.md#handoffs` is the model; `docs/SPEC.md#capabilities`
is the merge boundary you uphold.)

## When you are engaged

The org engages you when a task enters human-required scope — either of:

- a **PR** that touches a `human_required_path` (workflows, `autonomy.yml`, the constitution, the
  architecture invariants, skills, `bun.lock` — the declared list in
  `policy.risk.human_required_paths`; `services/**` is deliberately NOT gated, see below) or carries
  the `human-required` label. The `human-approval` gate parks it: beyond
  `ci` + `agent-review` it needs **your Approve on the current commit** before it can merge.
- an **issue** the PM routed to `human-required` (out-of-scope, risky, or repeatedly failing) or to
  `needs-info` (it needs a clarification only a human can give).

You'll know because the item is **assigned to you** and you have a **review request / @mention** — and,
if it sits too long, an **escalation** comment re-pings you (the SLA in `policy.human.sla_minutes`,
read from `.open-autonomy/autonomy.yml`).

Your live worklist is just GitHub: `is:open assignee:@me label:human-required` (and `label:needs-info`).

## The decision you're asked for (the `decision` type)

Each engagement carries one of these ask types (`policy.human.decision_types`):

| type | what you do | how you resolve (the `result`) |
|---|---|---|
| **approve** | review a human-required PR for safety/intent | **Approve** the PR on its current head SHA (the gate verifies a maintainer Approve per-commit; re-approve after any new push). A reject = request changes / apply a block label. |
| **decide** | make a judgment call the org isn't authorized to make (scope, architecture, risk acceptance) | `/agent decide <your decision>` on the issue — records your decision and clears the block so the PM re-triages. |
| **answer** | supply a clarification the agent needs (`needs-info`) | reply with the answer (a normal comment), or `/agent answer <…>`; the PM re-triages once you've replied. |
| **inform** | a notification only — no decision needed | nothing required; it does not block and does not count as a decision. |

## The result that resumes the flow

The org **cannot infer** that you're done — completion is never presumed from a timer or a sent
notification. The flow resumes **only** on an explicit, authorized act by you (a maintainer:
OWNER / MEMBER / COLLABORATOR):

- a native **Approve** on the current head SHA (for `approve`), which the `human-approval` gate turns into
  the `human-approval=success` status so native auto-merge can land it; or
- an **`/agent decide …` / `/agent answer …`** command (for `decide` / `answer`), which records the
  typed result and clears the human-required / needs-info state.

Until then the task stays parked and is escalated on the SLA. You are an untrusted, opaque actor like any
agent: the org verifies your **effect** (the Approve / the recorded decision), never the claim. Uphold the
merge boundary — your Approve is the human bless; you never bypass `ci` + `agent-review`.
