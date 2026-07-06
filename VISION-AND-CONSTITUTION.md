# Open Autonomy — Vision & Constitution (distilled)

**Status:** distilled north star + hard invariants, derived from `ARCHITECTURE-REVIEW.md` (2026-07-05).
**Relationship to existing docs:** this is the *reconciled* statement. It supersedes nothing by fiat — `docs/CONSTITUTION.md` remains the human-owned, amendment-only anchor and `docs/VISION.md` the long-form rationale. This document distills both against the evidence trail and makes explicit the judgment calls where the stated pitch and the lived reality diverge. Every claim is traceable to a file, commit, or resolved run cited in the review.

**How to read it:** Part A is the Vision (the real north star, corrected where evidence demands). Part B is the Constitution (the hard invariants, sorted by *how they are actually enforced* — code, doctrine, or aspiration). Part C maps both onto the real `autonomy.ir.v1` structure, so this document can inform a compilable profile rather than float beside it.

---

## Part A — The Vision

### A.1 The north star (unchanged, and confirmed by evidence)

> **Build the best self-driving repository: an autonomy loop that maintains itself and installs the same loop into other repositories** — and, because "best" is a moving frontier, keep searching for a better one. (`docs/CONSTITUTION.md:5-10`)

This is the real vision, and the evidence supports keeping it broad rather than narrowing it. The generality is **across substrates, not across domains** — the work is always software (`docs/VISION.md:10-14`). The self-driving-repo-on-GitHub is *the proof, not the definition* (`docs/CONSTITUTION.md:27`).

**Judgment call #1 — the vision is genuinely broad, not secretly SOC2.** A reasonable reader of the recent git history (the last ~1.5 days and ~46 commits are almost all SOC2) might conclude the project has pivoted into autonomous compliance. The evidence says otherwise: the core engine took only 7 SOC2-driven commits versus ~220 lifetime touches; `docs/VISION.md` (last edited three days *before* SOC2 work began) describes the general platform with zero SOC2 mentions; and the one thing actually running autonomously — `self-driving` — has had no SOC2 work at all. **SOC2 is a vertical built *with* the platform, not the platform's redefinition.** (Review §I.0, §I.3.)

### A.2 What is actually true today (the honest status)

The Vision's own three-piece framing (`docs/CONSTITUTION.md:36-44`) is the right lens. Corrected against evidence:

| Piece | Vision's claim | Evidence-corrected reality |
|---|---|---|
| **Standards** — the org-as-code system (IR, substrates, conformance) | "mature" | **Real and clean**, but *one* substrate is exercised in anger (GitHub Actions); `substrate-local` has one recorded run ever (`agent-sessions/run_793dd0df…`, 2026-06-17). Substrate-neutrality is a sound design with a single proven substrate. |
| **Dogfood** — running the best on ourselves | "live" | **Live and independently verified** — the last human commit on `main` is `e5e0ae5` (2026-06-29); every merge since is agent-authored, gated by a code-enforced no-merge boundary, `pm` firing on cron to the minute. This is the moat. But it is *narrow*: every autonomous merge is a low-risk docs/spec fix, and there is no number saying how narrow. |
| **Bench** — the fitness (testbeds + the twin) | "underbuilt — the bottleneck" | **Not "underbuilt" — pre-built.** The autonomy ratio, the self-calibrating twin, and the model-roleplay human simulators (H3/H4) are vocabulary, not implementation (`CLAUDE.md:200-207` marks them "NOT built"). The project has correctly named its constraint; it has not yet started building it. |

**Judgment call #2 — Bench is the real work, and its first deliverable is a single number.** The Vision is right that Bench is the constraint. The correction is that "Bench" does not require the twin or the simulators to begin: the **autonomy ratio over a real dogfood window** is computable *today* from data the fleet already emits, and shipping that one honest number does more for the proof's credibility than any further self-driving. Until it exists, every claim about the *degree* of autonomy (versus its bare existence) is unfalsifiable. (Review §I.2, §I.4.)

### A.3 The one epistemic commitment that everything rests on

The project's deepest bet is **"live proof is the only proof"** (`CLAUDE.md:23-24`, Constitution Rule 7). It is a genuinely good bet and the culture lives it — the history is full of resolvable run IDs, and a skeptic panel caught and corrected a real overclaim (`9369f93`). But the Vision must absorb the review's central finding: **the doctrine is honored in practice and not yet in tooling.** `check:proof` (`scripts/open-autonomy-proof-audit.ts:77-117`) is a string-presence check — it accepts any backtick-quoted `/^\d{8,}$/` token as a "run ID" with no network call, so a fabricated number passes identically to a real green run. The vision-level commitment for the next phase is therefore precise: **mechanize the proof doctrine so the machine, not the operator's honesty, is what guarantees it.** (Review §I.1.)

### A.4 The horizons, re-anchored

Keep the H1–H5 framing (`docs/VISION.md:264-284`) — it is coherent — but re-anchor the near term to what the review shows actually matters:

- **H1 — Shape the boundary** (typed human seam, `kind:human` actor): *largely built and live-proven* (`CLAUDE.md:191-199`). Ratify it as done, not in-progress.
- **H2 — Make it true** (live fleet-state, reconcile, drift, health monitor): the **health monitor** (issues #66/#67) is the concrete next hardening — escalation currently depends on the PM, a single point of failure.
- **H3 — Make flow measurable** (the autonomy ratio): **promote to the immediate priority.** This is the Bench beachhead (A.2, judgment #2).
- **H4 — Model the throughput** (the twin, simulators, seam graph): the deep Bench work; unblocked once H3 exists.
- **H5 — Optimize autonomy** (the org proposes its own next automation): the frontier; unchanged.

### A.5 What the Vision must now decide (the two-projects question)

The review's sharpest structural finding is that **the most active workstream in the repo is invisible to the repo's own governance** (Review §I.3). The Vision has to resolve this deliberately rather than by omission:

- **Either** ratify SOC2 as a first-class roadmap vertical — give it layer-1 intents in `.open-autonomy/roadmap.yml`, bring its proof gates under `check:proof`, and drive its next controls *through* the strategist→planner→fleet pipeline (which would make it a far stronger proof of the platform than building it by hand beside the pipeline);
- **Or** declare it an out-of-tree product built *on* Open Autonomy (the `volter-autonomy` boundary `README.md:191-194` already gestures at) and move it to its own repo.

The one position the Vision cannot hold is the current one: the most active code in the repository, accountable to none of the repository's rules.

### A.6 Anti-goals (kept, from `docs/VISION.md:246-256`)

Not a BPMN/workflow engine. Not an agent framework. Not a coding harness. Not a self-judging optimizer — **humans own the merit criteria; an optimizer may never author the measuring stick that judges it** (`docs/CONSTITUTION.md:18-20`). Add one, learned from the history (Review §I.5): **not an abstraction ahead of a proven need** — earn the generalization with a live run first.

---

## Part B — The Constitution

The seven rules in `docs/CONSTITUTION.md:57-72` are the human-owned anchor and are **not** restated-to-replace here — they remain authoritative and amendment-only. This part organizes the *full* set of hard invariants (the seven plus the ones the review surfaced as load-bearing) by **how they are actually enforced today**, because an invariant enforced in code and an invariant enforced by hope are different objects, and the project should know which is which.

### B.1 Enforced in code (structural — the machine refuses violations)

These are real invariants in the strongest sense: `validateIR` or the substrate compiler rejects a profile that breaks them.

1. **No agent can merge.** `code:merge` is never grantable to an agent; the base capability check rejects it (`packages/core/src/ir.ts:101-106`). *(= Constitution Rule 3.)*
2. **The capability split is total.** No single agent may hold both `code:propose` and `code:review` (`ir.ts:107-111`); a `review:` edge must name an *independent* agent that actually holds `code:review` (`ir.ts:115-127`). This is the merge boundary made structural.
3. **A human actor is declared, never job-realized.** `kind:human` serializes into the manifest with no `workflowFile` (`packages/core/src/manifest.ts`) — the org can declare a human in the loop without the substrate ever trying to run a person as a script.
4. **The installation equals its source.** `check:dogfood` enforces OA root == `compile(profiles/self-driving)` for all 57 managed files (verified passing). Hand-editing a generated file is a build failure, not a preference.

### B.2 Enforced by gate / substrate (operational — a workflow blocks violations at runtime)

5. **Risky changes require a human on the current SHA.** `human-approval` is a required check; PRs touching `policy.box.risk.human_required_paths` or carrying `human-required` need a maintainer Approve on the head SHA (`scripts/human-approval-gate.ts`, `CLAUDE.md:177-179`). *(= Constitution Rule 4.)* **Debt:** the risk paths live in an untyped `policy.box`, so a typo silently disarms the gate (Review §5.2) — B.1-strength enforcement of the *keys themselves* is a roadmap item.
6. **No agent grants itself authority.** The control plane runs commands only from an author-association allowlist; a bot-opened PR does not fire the gated workflows, so `ci`/`agent-review`/`human-approval` are dispatched explicitly by the proposer (`CLAUDE.md:174-176`). *(supports Rule 1.)*
7. **Deploy is human-cut.** The proxy deploys via a human-cut `deploy-v*` tag + required-reviewer environment; no agent deploys (`docs/SPEC.md:371-388`). *(= part of Rule 4.)*
8. **Retry loops are bounded.** Attempt budgets and stable failure signatures cap loops (`policy.box.autonomy.max_*`). *(= Constitution Rule 5.)*

### B.3 Enforced by doctrine (prose — an agent *should* obey; not mechanically caught)

These are real and mostly honored, but a violation would not be *caught* by a gate — they live in skills/CLAUDE.md.

9. **Done is verified, not presumed.** A task reaches `done` only when its acceptance criteria are *checked*; there is no `presumed-done` transition (`docs/SPEC.md:553-559`).
10. **Every meaningful decision is visible.** Comments, artifacts, committed decisions, or status reconstruction (`docs/CONSTITUTION.md:61-62`). *(= Rule 2.)*
11. **Scripts only for security.** The default executor is an agent; a deterministic script is justified only by a security boundary an agent must not control (`CLAUDE.md:29-38`).
12. **Roadmap status is derived, never written.** Execution status is computed from child-issue labels (`rollupRoadmapStatus`, `github-sync.ts:107-135`); `roadmap.yml` carries no hand-written `done`.
13. **Develop on `main`; the fleet acts with agency on authorized non-destructive work** (`CLAUDE.md:16-20`).
14. **User and maintainer intent is authoritative** (`docs/CONSTITUTION.md:59-60`). *(= Rule 1.)*
15. **Cost authority is the proxy ledger**, not the CLI estimate (`CLAUDE.md:180-182`).

### B.4 Aspirational / not-yet-enforced (the invariant is stated but the mechanism is missing)

These are the honest gaps — invariants the project *believes* but does not yet *enforce*. Naming them here is the point.

16. **Live proof is the only proof — but the proof gate must resolve its evidence.** Constitution Rule 7 is stated; the tooling that enforces it (`check:proof`) is a string-presence check with no network verification (Review §I.1). **Until `check:proof` resolves run IDs and a red-team fixture makes a fabricated ID fail, this invariant is doctrine, not enforcement.** This is the P0 of the roadmap.
17. **All proven work is under the proof gate.** The SOC2/W12 block (`PROOF_LEDGER.md:23-58`, ~30 commits) is not in `roadmap.yml`, so `check:proof` never audits it (Review §I.2, §I.3). An invariant that "everything proven is audited" is currently false by omission.
18. **The org's own governance is not bypassable.** Stated nowhere, violated in practice: the SOC2 vertical was built entirely outside the strategist→planner→fleet pipeline (Review §I.3). Either the pipeline is the way work happens, or it isn't.
19. **Earn the abstraction** — prove a capability is needed by a live run before building the generalization. Learned by revert three times in week one (steps/ABI `b664b86`; `@open-autonomy/agents` `53f71e4`; publisher cluster `9397236`), never yet written down (Review §I.5). The general principle of which "scripts only for security" is a special case.
20. **One canonical direction artifact.** `docs/ROADMAP.md` (legacy Phase 1–13) and `.open-autonomy/roadmap.yml` (v2) disagree on what is done (Review §I.6). The invariant "there is one roadmap" is violated.

### B.5 The amendment rule (unchanged, and it protects itself)

The Constitution and merit criteria are **human-owned and change only by amending `docs/CONSTITUTION.md`** (`docs/CONSTITUTION.md:9-10, 19-20, 48-49`). This is self-protecting by construction: `docs/CONSTITUTION.md` is itself listed in `policy.box.risk.human_required_paths`, so an agent editing it trips the human-approval gate (B.2 #5). The measuring stick cannot be moved by the thing being measured.

---

## Part C — How these map onto the real `autonomy.ir.v1` structure

The point of this whole exercise is that these documents must *correspond to* the compilable profile, not float beside it. The mapping (from the IR-schema study; every artifact has a real on-disk home except SDLC, which is emergent):

| Artifact | Real OA concept | Field-level correspondence |
|---|---|---|
| **Vision** | `docs/VISION.md` + `docs/CONSTITUTION.md` §North Star/§Method — prose, carried as a `resources:` entry. Not modeled in the IR type at all. | The only IR touchpoint is `AutonomyIR.resources: string[]` — the Vision ships to installs as a carried file, nothing more. It is direction, not machinery. |
| **Constitution** | `docs/CONSTITUTION.md` (human-owned, `INSTALL_OWNED_PATHS` in `upgrade.ts`, never auto-edited) **+** its *enforcement surfaces*: the merge-boundary check in `validateIR` (`ir.ts:101-127`, the one code-enforced invariant) and `policy.box.risk.human_required_paths`/`_topics` + `policy.box.merge.*` (the gate-enforced ones). | The prose Constitution *governs*; the code check + the risk/merge policy keys *enforce*. `policy.box` is the closest thing to a machine-readable constitution, but it is an untyped `Record<string,unknown>` — **which is exactly why B.4 #16 and §5.2 matter: the safety-relevant policy keys should graduate from untyped convention to validated schema.** The Constitution's own edit-protection is a `human_required_paths` entry pointing at itself. |
| **Roadmap** | `.open-autonomy/roadmap.yml` (`schema: open-autonomy.roadmap.v2`), two-layer: layer-1 items (`id`/`phase`/`priority`/`proposed\|planned`/`title`/`proof_gate`/`acceptance`/`intent`) → layer-2 GitHub issues (`origin:roadmap-planner` + `roadmap:<id>`), status derived by `rollupRoadmapStatus`. | Each item's **`proof_gate`** field is the bridge from Roadmap to the live-proof doctrine (Constitution Rule 7 / B.4 #16): it names the gate that `check:proof` must pass before the item is real. The distilled roadmap (companion) is authored to slot straight into this schema. |
| **SDLC** | No single file — it is the *emergent behavior* of `compile(profiles/self-driving, gh-actions)`: the `agents:` map (behavior + capabilities + `review:` edges) + `policy.box` + the task lifecycle (`open→ready→working→in-review→done`, `docs/SPEC.md`), realized by `emit.ts`'s effect step (push→PR→dispatch ci/agent-review/human-approval→auto-merge). | The SDLC *is* the fields: `IRAgent.capabilities` (the merge split), `IRAgent.review` (reviewer wiring), `Trigger` (cron for the PM poll, dispatch for workers, event for GitHub-native), `AutonomyIR.codeHost` (PR-based vs local-git). The "SDLC doc" is therefore best written as *a description of the compiled installation*, pointing at `ir.yml` — not as a standalone spec. The SDLC assessment (companion, `SDLC-ASSESSMENT.md`) reports on this installation as it actually runs. |

**The through-line:** Vision → a carried `resources:` document (direction). Constitution → prose + the `validateIR` merge check + the `policy.box` safety keys (governance, partly enforced). Roadmap → `roadmap.yml`'s two layers, gated by `proof_gate` (work). SDLC → the compiled `agents:` graph (execution). Each distilled doc in this effort is written to inform its real counterpart, and the roadmap's top items (Part B.4) are precisely the gaps between what these documents *assert* and what the IR *enforces*.
