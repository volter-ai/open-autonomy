# Problem: the Roadmap panel on the funding page looks broken and reads as "permanently stuck"

You are iterating on the **Roadmap panel** of the Open Autonomy funding page. Your job is to make it both
**look good** and **tell the truth** about the project's progress. Cycle on it: change code → regenerate the
screenshots → look at them → improve → repeat, until the panel is something a visitor would find clear,
honest, and attractive.

## How to see it (the feedback loop)

```
cd services/agent-model-proxy
bun preview/roadmap-preview.ts
```

This writes `preview/out/roadmap-collapsed.png` and `preview/out/roadmap-expanded.png` (and `roadmap.html`).
**Open and actually look at those PNG files after every change** — this is a visual task, judge it with your
eyes, not by reading the code. The fixture in `preview/roadmap-preview.ts` is a faithful snapshot of the REAL
live state of `volter-ai/open-autonomy` (captured 2026-06-24), so what you see is the real problem.

## The symptom (what the user sees today)

The panel is a wall of near-identical rows that all say **"0/1"** with a red "in progress" node. The header
says "**9 in progress · 0 queued · 1 shipped**". Only one row (`Direction, Constitution, And Planning Loop`)
shows "1 done". Two real items are missing from the spine and instead collapsed into "**2 proposed**" at the
foot. The user's words: *"why is everything 1 issue, I can't uncollapse to see the issue, and why are they
all not done?"*

## Root causes (verified — these are the WHY)

1. **The planner created 1:1 self-referential umbrella stubs.** Each roadmap item got exactly ONE tracking
   issue whose title just restates the item (e.g. item `review-merge-parity` → issue `[roadmap:review-merge-parity]
   Review And The Merge Boundary`). So every item is `total:1, done:0`. Expanding a station reveals a single
   line identical to the station's own title — useless. And the item can **never reach "done"**, because the
   umbrella issue is never closed (it's not a real, completable unit of work). This is the same "frozen
   forever" failure the two-layer roadmap model was meant to end — just relocated from a hand-set `status:`
   to an umbrella-issue-that-never-closes.

2. **Mislabeled issues strand in phantom buckets.** Two items — `durable-decision-memory` (issue #4) and
   `durable-state-index` (#13) — have a tracking issue that carries only `roadmap:phase-1` / `roadmap:phase-10`
   and is **missing** the `roadmap:<item-id>` label. The rollup in `src/github-sync.ts` buckets by any
   `roadmap:*` label, so those counts land in phantom `phase-1` / `phase-10` buckets that match no roadmap
   item. Result: the real item shows **0 issues → not expandable** ("I can't uncollapse"), and falls back to
   "proposed". (The `roadmap:phase-N` label scheme also pollutes the `roadmap:<id>` rollup namespace; newer
   code uses a `phase:` prefix, but the live issues/labels were never migrated.)

3. **Net effect:** a flat, monotonous list of "0/1, in progress" that never completes and never visibly moves.
   Visually it's repetitive and joyless; semantically it's lying about being "in progress" when nothing is
   actually progressing.

## The two fronts to fix (do both)

### A. Rendering / robustness — `src/project-docs.tsx` + the `.rm-*` CSS in `src/platform-html.tsx`
Make the panel honest and attractive **even when the data is this degenerate**. Consider (use judgment, you
don't have to do all of these):
- A 1:1 umbrella item whose only child echoes its own title should NOT render as a pointless expand. Detect
  the self-referential single child and either collapse the redundancy or present the item as a single clear
  state, not a fake "0/1 → expand to one identical line".
- "0/1 in progress" on every row is meaningless — rethink how an undecomposed/umbrella item reads versus a
  genuinely multi-issue item that's truly part-done.
- Phantom `phase-N` buckets must never silently swallow an item's work — surface or fold them, but don't drop
  them. An item with stranded issues should not masquerade as "proposed".
- Improve the visual rhythm: less repetition, clearer hierarchy (shipped vs in-flight vs queued vs proposed),
  better use of the "now" frontier, the phase spine, progress bars, and the child-issue expansion.
- Keep it faithful to the page's existing design language (the `C` color tokens, Inter, the `.panel` card,
  coral accent, the warm light theme).

### B. Upstream data correctness (propose fixes; you can edit, but these need a live repo to fully verify)
- **Planner decomposition** lives in `profiles/self-driving/skills/planner/SKILL.md` (the source; OA compiles
  it to root — see `CLAUDE.md`, recompile with `bun bin/autonomy-compile.ts` and check `check:dogfood`). The
  policy is "large cohesive issues, default ONE substantial issue per item" — but a single umbrella issue that
  never closes makes "done" unreachable. Reconcile these: either the item's single issue IS the work and must
  be closeable (so the item can reach done), or items decompose into a few real completable issues. Write up
  the precise rule.
- **Label hygiene / reconcile** in `src/github-sync.ts` (rollup) and `scripts/reconcile-roadmap-issues.ts`:
  the rollup should ignore `roadmap:phase-*` (phase labels, not item ids) so phase labels can never form
  phantom buckets; reconcile should guarantee every planner issue carries its `roadmap:<item-id>` label.

## Constraints / guardrails
- The render functions in `project-docs.tsx` are **pure** (no network/DOM) and unit-tested. Keep them pure.
- After changes run the tests and typecheck from `services/agent-model-proxy`:
  `bun test test/project-docs.test.ts` and `bunx tsc --noEmit`. Keep them green (update tests if behavior
  legitimately changes, but don't weaken them to pass).
- This is OA's own repo: control files compile from `profiles/self-driving/` — if you touch the planner skill,
  edit it THERE and recompile, don't hand-edit the compiled root copy. Read `CLAUDE.md` first.
- **Do NOT commit, push, or open a PR.** Leave your work in the working tree for review. Do not touch issues
  on GitHub. The `preview/` dir and `preview/out/*.png` are scratch — fine to leave changed.
- Work in small cycles and after each, re-run the harness and look at the PNGs. End with a short summary of
  what you changed, before/after of the look, and the exact upstream (planner + label) fixes you recommend.
```
```
