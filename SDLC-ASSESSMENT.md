# Open Autonomy — SDLC Assessment (assess-only)

**Status:** companion to `ARCHITECTURE-REVIEW.md` (second pass, 2026-07-05) and `VISION-AND-CONSTITUTION.md` Part C. This pass **assesses and reports**; it deliberately fixes nothing.
**What "the SDLC" means here:** Open Autonomy has no standalone SDLC config file. The SDLC *is* the emergent behavior of `compile(profiles/self-driving, gh-actions)` — the `agents:` roster + `policy.box` in `profiles/self-driving/ir.yml`, realized by `packages/substrate-github/src/emit.ts` into workflows, gates, and the effect step. Assessing the SDLC therefore means assessing (a) that compiled installation as designed, and (b) how it actually ran, verified live on `volter-ai/open-autonomy` (2026-07-05/06).

---

## 1. Verdict

**The self-driving profile genuinely drives this repository — at the level of machinery, not yet at the level of labor.**

- **Machinery: real, gated, independently verified.** The full pipeline works with no human in the loop: `pm` (cron) sweeps → dispatches `developer` → agent PR → `ci` + `agent-review` + `human-approval` (auto-pass for routine scope) → native auto-merge → planner issue closed. Eighteen agent PRs merged this way 2026-06-20→25 and two more on 2026-07-05; issue #115 closed **21 seconds** after PR #117's merge — a causal chain through the machinery, resolved from live timelines, not prose. The merge boundary underneath is enforced in code (`ir.ts:101-127`) and the human-approval gate verifies maintainer permission per head SHA (`human-approval-gate.ts:82-95`).
- **Labor: thin, and currently a minority share.** In the 6.9-day window ending 2026-07-06: 593 workflow runs produced **2 merged commits, both docs-only**, after a 10-day zero-merge stretch. Of 16 closed roadmap-planner issues lifetime, 8 were bot-closed (50%); by recent commit volume the autonomous share is ~0%, because the repo's dominant lane is the operator direct-pushing to `main` (46 SOC2 commits + the whole 06-20→06-29 middle stretch, all ungated). The fleet has never merged anything above low-risk docs/spec scope.

So: "is the self-driving profile actually driving anything today?" — **yes, provably, and the honest qualifier is that what it drives is small.** The system's own vocabulary for this is the autonomy ratio, which is exactly the unbuilt Bench deliverable (roadmap item OA-4).

## 2. How it ran, by component (live window 2026-06-29 → 07-06)

| Component | Declared | Observed | Assessment |
|---|---|---|---|
| `pm` (orchestrator) | cron `*/30`, sweeps + dispatch | 170 runs, 167 success; **real cadence ~59.5 min mean** (GitHub skips ticks); swept #114/#115 for 6.5 days logging "planner-managed, no action" before reclassifying and resolving both within one cycle | Alive and judgment-consistent; deferral doctrine can idle real backlog for days with no signal |
| `developer` | dispatch-only | 4 fires in 8 days; 2 failures | The scarce resource; failures un-analyzed by anything |
| `reviewer` | dispatch on proposal | 7 runs, 4 success, 2 cancelled | Works when fired |
| `planner` | cron daily | 8 runs, 7 success | Healthy; produced #114/#115/#116 |
| `strategist` | cron weekly | most recent scheduled run **failed** (06-29), unnoticed | Top of the funnel has no watchdog |
| `human-approval` gate | required check | 6/6 success; PR #106 precedent (human Approve → auto-merge) proven earlier | The human seam's GitHub half is real |
| Merge/reconcile sweeps | cron | 194/194 success | Solid |
| Dependabot intake | — | PRs #109/#110/#112/#113 `BLOCKED` **10-11 days**, zero fleet remediation | The "noticing" gap, live (roadmap OA-7) |

## 3. The SDLC-as-configured: what is well-built

- **The roster and its edges are coherent.** Six agents + a declared `kind:human` maintainer (`ir.yml:114-119`); `review:` edges enforce independent review at compile time; capabilities compile to least-privilege workflow permissions, so the org chart and the permission model are one artifact.
- **Three structural "no agent may…" boundaries:** no agent merges (code), no agent deploys (human-cut tag), no agent re-architects (`.open-autonomy/architecture-invariants.yml`, reviewer-enforced, human-ratified). The trilogy is the strongest part of the whole design.
- **Derived-not-stored status** (roadmap rollup from labels) and **PM-judgment-not-auto-loop** failure handling (`roadmap.yml` `unified-loop-budget` comments) encode real lessons.
- **The economics are fenced:** proxy budget layer survived adversarial review (server-side clamps, atomic reservations, purpose-clamped OIDC minting).

## 4. The SDLC-as-configured: honest gaps (assessed, not fixed)

1. **The proof gate doesn't verify** (`check:proof` string-presence; 7/12 gates path-only; 18 SOC2 rows unaudited; evidence rots) — review §I.1, roadmap OA-2.
2. **Two lanes:** the governed pipeline produced the least output; the ungated operator lane produced the most. Acknowledged in-roadmap only as unratified `develop-oa-through-oa` — review §I.3, roadmap OA-3.
3. **Deployed boundary soft spots:** `agent-review` check unpinned (`app_id: null`); a `policy.box` typo silently auto-passes the human gate; `@scope` decorative; private-repo egress fails open by default — review §4.6-4.9, roadmap OA-5.
4. **No health floor:** wedged PRs, dead strategist runs, and zero-merge windows are invisible to a "green" PM — review §4.5, roadmap OA-7.
5. **The local half of the SDLC is mis-realized:** `substrate-local` would launch a `kind:human` actor as an AI agent; `HumanRunner` is dead code despite the Built ledger — review §4.4, roadmap OA-8.
6. **The spec of the SDLC disagrees with itself** (SPEC config-slot/Runner/`actors:` contradictions; two roadmaps disagree on done) — review §I.6, roadmap OA-6.
7. **No measurement layer:** the SDLC cannot report its own autonomy ratio; this review computed the crude number by hand (50% of labeled issues, ~0% of volume) — review §I.4, roadmap OA-4.

## 5. Method note

Live claims verified against `volter-ai/open-autonomy` via `gh api` (workflow runs, branch protection, PR/issue timelines) and against four external SOC2 proof repos; 7 of 8 spot-checked proof-ledger run IDs resolved exactly as claimed, 1 pointed at a deleted testbed repo. Nothing in this pass modified the SDLC, the profile, the canonical repo, or the live fleet.
