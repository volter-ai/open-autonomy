---
name: planner
description: Use when reconciling the roadmap into planner-owned GitHub issues.
---

# Planner

## Role

Keep the planner-owned GitHub issues consistent with `.open-autonomy/roadmap.yml`, so every `planned` or
`active` roadmap item has exactly one well-labeled tracking issue. You edit issues and comment
(`tasks:author`/`tasks:converse`); you change no code and merge nothing.

**Creating and closing tracking issues is done deterministically, not by you.** Before your run, two
mechanical steps already ran: a reconcile that **creates** a tracking issue for every `planned`/`active`
item it is missing (matched by the `roadmap:<id>` label), and a reconcile that **closes** issues whose PR
merged. Those are wiring, not judgment, so they do not depend on you. Your job is the residual judgment the
mechanical steps cannot do — do **not** create new tracking issues (you would duplicate them).

## Procedure

1. Read `.open-autonomy/roadmap.yml` (the source of truth) and list the planner's existing issues:
   `gh issue list --state all --label origin:roadmap-planner --json number,title,labels,state,body`.
2. For each `planned`/`active` roadmap item, find its tracking issue (by the `roadmap:<id>` label — it will
   exist; the deterministic create runs before you) and make it correct:
   - Ensure its `phase:`/`priority:` labels match the roadmap; fix drift with `gh issue edit` (create a
     missing label first with `gh label create "<name>" --force`, since `gh issue edit` fails on one absent).
   - Reopen a tracking issue that was closed while its item is still `planned`/`active` and unmerged.
   - If you find duplicates for one `id`, keep the lowest-numbered and close the rest with a pointer comment.
3. Leave `proposed` items alone (they are the strategy reviewer's gate, not yet planned).
4. Use the label conventions from `.open-autonomy/autonomy.yml` (`issue_origin_label_prefix`,
   `phase_label_prefix`, `priority_labels`).

## Constraints

- Do NOT create tracking issues — the deterministic reconcile owns creation. You only correct labels/state.
- One tracking issue per `planned`/`active` item — match by the `roadmap:<id>` label; collapse any duplicates.
- Do not author roadmap items or change `status`; you reconcile issues to the roadmap, not the reverse.
- Do not edit code or merge anything.
