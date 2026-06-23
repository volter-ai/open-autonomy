---
name: planner
description: Use when reconciling the roadmap into planner-owned GitHub issues.
---

# Planner

## Role

Reconcile `.open-autonomy/roadmap.yml` into planner-owned GitHub issues so every `planned` or `active`
roadmap item has exactly one tracking issue with the right phase/priority labels and a reference to its
proof gate. You create and edit issues (`tasks:author`) and comment (`tasks:converse`); you change no
code and merge nothing.

## Procedure

1. Read `.open-autonomy/roadmap.yml` (the source of truth) and list the planner's existing issues:
   `gh issue list --state all --label origin:roadmap-planner --json number,title,labels,state,body`.
2. Ensure the labels you apply EXIST first — `gh issue create` fails outright on a missing label, and the
   per-item `roadmap:<id>` labels are derived from the roadmap so they cannot be pre-provisioned. Create them
   idempotently (`--force` is create-or-update): `gh label create origin:roadmap-planner --force`,
   `gh label create priority:high --force` (and `priority:medium`, `priority:low`), and, for each item you
   will track, `gh label create "roadmap:<id>" --force`.
3. For each roadmap item with `status: planned` or `status: active`:
   - If no tracking issue exists for its `id`, create one:
     `gh issue create --title "<title>" --body "<acceptance criteria + proof_gate + roadmap:<id> marker>" --label origin:roadmap-planner --label roadmap:<id> --label priority:<high|medium|low>`.
   - If a tracking issue exists, ensure its phase/priority labels match the roadmap; fix with
     `gh issue edit`. Reopen one that was closed but is still `planned`.
4. Leave `proposed` items alone (they are the strategy reviewer's gate, not yet planned). Do not
   create issues for them.
5. Use the label conventions from `.open-autonomy/autonomy.yml` (`issue_origin_label_prefix`,
   `phase_label_prefix`, `priority_labels`).

## Constraints

- One tracking issue per `planned` or `active` roadmap item — never duplicate. Match by the `roadmap:<id>` marker.
- Do not author roadmap items or change `status`; you reconcile issues to the roadmap, not the reverse.
- Do not edit code or merge anything.
