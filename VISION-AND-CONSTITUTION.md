# Open Autonomy — Vision & Constitution (distilled)

**Status:** distilled north star + hard invariants, derived from `ARCHITECTURE-REVIEW.md` (2026-07-05, second pass — re-verified by five independent evidence sweeps).
**Relationship to existing docs:** this is the *reconciled* statement. It supersedes nothing by fiat — `docs/CONSTITUTION.md` remains the human-owned, amendment-only anchor and `docs/VISION.md` the long-form rationale. This document distills both against the evidence trail and makes explicit the judgment calls where the stated pitch and the lived reality diverge. Every claim is traceable to a file, commit, or resolved run cited in the review.

**How to read it:** Part A is the Vision (the real north star, corrected where evidence demands). Part B is the Constitution (the hard invariants, sorted by *how they are actually enforced* — code, gate, doctrine, or aspiration). Part C maps both onto the real `autonomy.ir.v1` structure, so this document can inform a compilable profile rather than float beside it.

---

## Part A — The Vision

### A.1 The north star (unchanged, and confirmed by evidence)

> **Build the best self-driving repository: an autonomy loop that maintains itself and installs the same loop into other repositories** — and, because "best" is a moving frontier, keep searching for a better one. (`docs/CONSTITUTION.md:5-10`)

This is the real vision, and the evidence supports keeping it broad rather than narrowing it. The generality is **across substrates, not across domains** — the work is always software (`docs/VISION.md:10-14`). The self-driving-repo-on-GitHub is *the proof, not the definition* (`docs/CONSTITUTION.md:27`).

**Judgment call #1 — the vision is genuinely broad, not secretly SOC2.** A reasonable reader of the recent git history (the last ~1.5 days and 46 commits are almost all SOC2) might conclude the project has pivoted into autonomous compliance. The evidence says otherwise: only 7 of the 46 SOC2 commits touch the engine (`packages/` — which has ~175-207 lifetime commits); `docs/VISION.md` (last edited 3.9 days *before* SOC2 work began, `1c47650`) describes the general platform with zero SOC2 mentions; and the one thing actually running autonomously — `self-driving` — has had no SOC2 work at all. **SOC2 is a vertical built *with* the platform, not the platform's redefinition.** (Review §I.0, §I.3.)

**Judgment call #1b — but the *method* has a second identity problem the first draft under-called: the two lanes.** The org's declared method is the gated pipeline (strategist → planner → fleet → gated PR). Its actual dominant lane since 2026-06-20 is Claude-mediated operator work **direct-pushed to `main` with no gates at all** — including all of SOC2 and the proof-ledger commits. The vision's identity ("self-driving") is currently carried by the lane that produces the least. This is not hypocrisy — the roadmap itself contains `develop-oa-through-oa` ("close the manual loophole") — but that item is `proposed: true`, unratified. The Vision must treat closing the loophole as identity-critical, not backlog. (Review §I.3.)

### A.2 What is actually true today (the honest status)

The Vision's own three-piece framing (`docs/CONSTITUTION.md:36-44`) is the right lens. Corrected against evidence:

| Piece | Vision's claim | Evidence-corrected reality |
|---|---|---|
| **Standards** — the org-as-code system (IR, substrates, conformance) | "mature" | **Real and clean, but "stabilizing," not mature** — the runner/realization seam was still being reworked-and-reverted as late as 06-20/21, one substrate is exercised in anger (GitHub), `substrate-local` has one recorded run ever *and mis-realizes `kind:human` actors as AI-launchable prompts* (`HumanRunner` is dead code — review §4.4). Substrate-neutrality is a sound design with a single proven substrate. |
| **Dogfood** — running the best on ourselves | "live" | **Machinery live and independently verified; throughput thin.** The gated loop works end-to-end (18 agent PRs merged 06-20→25; two more 07-05, with a merge→issue-close chain timed at 21s). But: zero fleet merges for the 10 days 06-25→07-05, all merges docs-only, PM cadence ~60min against a declared 30, four PRs wedged 10+ days unnoticed, and the org's real output flowed through the ungated operator lane. The moat is the machinery; the depth is not yet there — and until Bench exists, the depth has no number. |
| **Bench** — the fitness (testbeds + the twin) | "underbuilt — the bottleneck" | **Not "underbuilt" — pre-built, and unallocated.** The autonomy ratio, twin, and human simulators are vocabulary (`CLAUDE.md:200-207` marks them NOT built); `bench/` untouched since 06-24 while energy went to SOC2. The one correction in the project's favor: the crude autonomy ratio is computable *today* from existing labels — this review computed **8/16 = 50%** of closed roadmap-planner issues bot-closed. |

**Judgment call #2 — Bench is the real work, and its first deliverable is a single number.** The Vision is right that Bench is the constraint. The correction is that "Bench" does not require the twin or the simulators to begin: the **autonomy ratio over a real dogfood window** is computable today, and shipping that one honest number (with its volume-weighted companion, which is currently ~0%) does more for the proof's credibility than any further self-driving. Until it exists, every claim about the *degree* of autonomy is unfalsifiable. (Review §I.2, §I.4.)

### A.3 The one epistemic commitment that everything rests on

The project's deepest bet is **"live proof is the only proof"** (`CLAUDE.md:23-24`, Constitution Rule 7). It is a genuinely good bet and the culture lives it — where the ledger's claims are checkable they are true (7 of 8 spot-checked run IDs resolve exactly as claimed, including the intended failures), and a skeptic panel caught and corrected a real overclaim (`9369f93`). But the Vision must absorb the review's central finding, now sharper than the first draft: **the doctrine is honored in practice and not in tooling.** `check:proof` is a string-presence check (`/^\d{8,}$/`, no network call anywhere in the repo); 7 of the 12 audited gates cite only file paths; the 18 SOC2 evidence rows are orphaned from the audit entirely; and evidence *rots* — one cited testbed repo is already deleted, making its ledger line permanently unauditable. The vision-level commitment for the next phase is therefore precise: **mechanize the proof doctrine — resolution, red-team fixture, and durable artifacts — so the machine, not the operator's honesty, is what guarantees it.** (Review §I.1.)

### A.4 The horizons, re-anchored

Keep the H1–H5 framing (`docs/VISION.md:264-284`) — it is coherent — but re-anchor the near term to what the review shows actually matters:

- **H1 — Shape the boundary** (typed human seam, `kind:human` actor): **built and live-proven on GitHub; broken on local.** The github realization (declare-don't-realize, the human-approval gate, PM engage/escalate) is real. The local realization is a false "built" claim — `HumanRunner` is dead code and `compileLocal` is kind-blind. Ratify the GitHub half as done; re-open the local half explicitly (review §4.4).
- **H2 — Make it true** (live fleet-state, reconcile, drift, health monitor): the **health monitor** (#66/#67) is the concrete next hardening, now with live evidence of need: a 10-day zero-merge window, wedged PRs, and a dead strategist run, all invisible to 170 "green" PM runs.
- **H3 — Make flow measurable** (the autonomy ratio): **promote to the immediate priority.** The crude version is a query, not a project (A.2, judgment #2).
- **H4 — Model the throughput** (the twin, simulators, seam graph): the deep Bench work; unblocked once H3 exists.
- **H5 — Optimize autonomy** (the org proposes its own next automation): the frontier; unchanged.

### A.5 What the Vision must now decide (the two-lanes question)

The review's sharpest structural finding: **the org's real output flows through a lane its governance never sees** (Review §I.3) — Claude-mediated direct pushes to `main`, of which the SOC2 vertical is the largest instance (46 commits, zero pipeline involvement, zero roadmap presence, 18 unaudited proof rows). The Vision has to resolve this deliberately rather than by omission:

- **Ratify `develop-oa-through-oa`** (proposed → planned, dated proof gate): the operator lane gets an explicit, narrow charter (bootstrap/emergency, evidence-cited), and canonical features ship through the pipeline;
- **Either** ratify SOC2 as a first-class roadmap vertical — layer-1 intents in `roadmap.yml`, proof gates under `check:proof`, next controls driven *through* the fleet (which would make it a far stronger proof of the platform than building it beside the pipeline by hand);
- **Or** declare it an out-of-tree product built *on* Open Autonomy (the `volter-autonomy` boundary `README.md:191-194` gestures at — currently rhetoric with no enforcement) and move it to its own repo.

The one position the Vision cannot hold is the current one: the most active lane in the repository, accountable to none of the repository's rules.

### A.6 Anti-goals (kept, from `docs/VISION.md:246-256`)

Not a BPMN/workflow engine. Not an agent framework. Not a coding harness. Not a self-judging optimizer — **humans own the merit criteria; an optimizer may never author the measuring stick that judges it** (`docs/CONSTITUTION.md:18-20`). Add one, learned from the history (Review §I.5): **not an abstraction ahead of a proven need** — earn the generalization with a live run first. The history teaches this five times over (the 215-file v0 kit, the steps/ABI model, the agents package, the publisher cluster, two sub-30-minute micro-reverts).

---

## Part B — The Constitution

The seven rules in `docs/CONSTITUTION.md:57-72` are the human-owned anchor and are **not** restated-to-replace here — they remain authoritative and amendment-only. This part organizes the *full* set of hard invariants (the seven plus the ones the review surfaced as load-bearing) by **how they are actually enforced today**, because an invariant enforced in code and an invariant enforced by hope are different objects, and the project should know which is which.

### B.1 Enforced in code (structural — the machine refuses violations)

These are real invariants in the strongest sense: `validateIR` or the substrate compiler rejects a profile that breaks them.

1. **No agent can merge.** `code:merge` is never grantable to an agent; the base capability check rejects it, `@scope` suffixes stripped first so scoping cannot evade it (`packages/core/src/ir.ts:101-106`). *(= Constitution Rule 3.)*
2. **The capability split is total.** No single agent may hold both `code:propose` and `code:review` (`ir.ts:107-111`); a `review:` edge must name an *independent* agent that actually holds `code:review` (`ir.ts:115-127`). This is the merge boundary made structural — and the GitHub token's permissions are *derived from* the declared capabilities (`emit.ts:254-277`), so the org model and the permission model are one artifact.
3. **A human actor is declared, never job-realized — on GitHub.** `kind:human` serializes into the manifest with no `workflowFile` (`manifest.ts:19,60,64`; `emit.ts:474-476`). **Caveat (review §4.4):** on the *local* substrate this invariant is silently violated — `compileLocal` is kind-blind and would realize a human as an AI-launchable prompt; the fix (`HumanRunner`) exists but is dead code. On local, this invariant currently belongs in B.4.
4. **The installation equals its source.** `check:dogfood` enforces OA root == `compile(profiles/self-driving)` for all 57 managed files (verified passing), and the runtime mirror is sync-checked. Hand-editing a generated file is a build failure, not a preference.

### B.2 Enforced by gate / substrate (operational — a workflow blocks violations at runtime)

5. **Risky changes require a human on the current SHA.** `human-approval` is a required check; PRs touching `policy.box.risk.human_required_paths` or carrying `human-required` need a maintainer Approve on the head SHA, verified by repo permission (not `author_association`), re-earned per SHA (`scripts/human-approval-gate.ts:82-95`). *(= Constitution Rule 4.)* **Demonstrated debt (review §4.7):** the risk paths live in an untyped `policy.box` — a typo resolves to `[]` with no error and the gate then **auto-passes every PR**. B.1-strength validation of the keys themselves is a roadmap item.
6. **No agent grants itself authority.** The control plane runs commands only from verified maintainers; a bot-opened PR does not fire the gated workflows, so `ci`/`agent-review`/`human-approval` are dispatched explicitly by the proposer. **Demonstrated debt (review §4.6):** on live `main`, `agent-review` is not app-pinned (`app_id: null`) — any `statuses:write` token can post the AI half of the boundary; `ci` and `human-approval` are pinned. Pinning is a roadmap item.
7. **No agent re-architects.** `.open-autonomy/architecture-invariants.yml` (schema `open-autonomy.architecture-invariants.v1`) is a human-owned, machine-readable invariant set the reviewer enforces on every change: violations → `agent-review=failure`; amendments/ambiguity → `human-required`. The structural trilogy: no agent merges, no agent deploys, no agent re-architects. *(This mechanism was missed by the first draft of this document; it is one of the project's best ideas.)*
8. **Deploy is human-cut.** The proxy deploys via a human-cut `deploy-v*` tag + required-reviewer environment; no agent deploys. *(= part of Rule 4.)*
9. **Retry loops are bounded.** Attempt budgets and stable failure signatures cap loops (`policy.box.autonomy.max_*`); failure handling is PM judgment, never an auto-loop (`roadmap.yml`, `unified-loop-budget`). *(= Constitution Rule 5.)*
10. **Model spend is economically fenced.** Server-side clamps on client-declared caps, atomic Durable-Object reservations, per-repo/actor/issue caps, purpose-clamped OIDC minting — adversarially reviewed, no bypass found (`services/agent-model-proxy/src/{index,run-budget,limit-ledger}.ts`).

### B.3 Enforced by doctrine (prose — an agent *should* obey; not mechanically caught)

11. **Done is verified, not presumed.** A task reaches `done` only when its acceptance criteria are *checked*; there is no `presumed-done` transition (`docs/SPEC.md`).
12. **Every meaningful decision is visible.** Comments, artifacts, committed decisions, or status reconstruction (`docs/CONSTITUTION.md:61-62`). *(= Rule 2.)*
13. **Scripts only for security.** The default executor is an agent; a deterministic script is justified only by a security boundary an agent must not control (`CLAUDE.md:29-38`) — and the history shows the rule self-correcting (`reconcile-roadmap-issues.ts` deleted within a day: "creating tracking issues is the planner's job, not a script").
14. **Roadmap status is derived, never written.** Execution status is computed from child-issue labels (`rollupRoadmapStatus`); `roadmap.yml` carries no hand-written `done`.
15. **User and maintainer intent is authoritative** (`docs/CONSTITUTION.md:59-60`). *(= Rule 1.)*
16. **Cost authority is the proxy ledger**, not the CLI estimate (which mis-prices proxied models ~40×).

### B.4 Aspirational / not-yet-enforced (the invariant is stated but the mechanism is missing)

These are the honest gaps — invariants the project *believes* but does not yet *enforce*. Naming them here is the point.

17. **Live proof is the only proof — but the proof gate must resolve its evidence.** Constitution Rule 7 is stated; `check:proof` is a string-presence check, 7 of 12 audited gates cite only file paths, and cited evidence has already rotted once (a deleted testbed repo). **Until `check:proof` resolves run IDs, a red-team fixture makes a fabricated ID fail, and disposable-cell evidence is required durable, this invariant is doctrine, not enforcement.** The P0 of the roadmap. (Review §I.1.)
18. **All proven work is under the proof gate.** The 18-row SOC2/W12 block (`PROOF_LEDGER.md:23-58`) is not in `roadmap.yml`, so `check:proof` never audits the project's most-cited evidence. (Review §I.1/§I.3.)
19. **Canonical work ships through the pipeline (the two-lanes rule).** *Acknowledged but unratified:* `develop-oa-through-oa` ("close the manual loophole") exists in the roadmap as `proposed: true` — audit-exempt, undated. Meanwhile the ungated operator lane carried the repo's entire recent output (46 SOC2 commits + the 06-20→06-29 middle regime, all Claude-mediated direct pushes). Either the pipeline is the way work happens, or it isn't. Ratification is a P0 decision. (Review §I.3.)
20. **The boundary as deployed is as strong as the boundary as compiled.** Four demonstrated soft spots between `validateIR`'s guarantees and the running system: the unpinned `agent-review` check (§4.6), the typo-disarmable policy keys (§4.7), the decorative `@scope` suffixes (§4.8), and the fail-open private-repo egress default (§4.9). Each is an invariant the profile *reads as* enforced that the realization does not enforce.
21. **Earn the abstraction** — prove a capability is needed by a live run before building the generalization. Learned by revert **five** times in week one (the v0 OSS-kit's 215 files; steps/ABI `b664b86`; the agents package `53f71e4`; the publisher cluster `9397236`; two sub-30-minute micro-reverts), never yet written down. The general principle of which "scripts only for security" is the special case. (Review §I.5.)
22. **One canonical direction artifact, and a spec that agrees with itself.** `docs/ROADMAP.md` (legacy) and `roadmap.yml` disagree on what is done; `SPEC.md` contradicts itself on the config slot, the Runner contract, and the `actors:` rename; the Built-vs-designed ledger has a false entry (`HumanRunner`). The invariant "the map compiles into the territory" is violated in the map itself. (Review §I.6.)

### B.5 The amendment rule (unchanged, and it protects itself)

The Constitution and merit criteria are **human-owned and change only by amending `docs/CONSTITUTION.md`** (`docs/CONSTITUTION.md:9-10, 19-20, 48-49`). This is self-protecting by construction: `docs/CONSTITUTION.md` is in `policy.box.risk.human_required_paths`, so an agent editing it trips the human-approval gate (B.2 #5), and `architecture-invariants.yml` extends the same protection to the architecture (B.2 #7). The measuring stick cannot be moved by the thing being measured — *provided* the B.4 #20 soft spots are closed, since a disarmed human gate would disarm this protection too.

---

## Part C — How these map onto the real `autonomy.ir.v1` structure

The point of this whole exercise is that these documents must *correspond to* the compilable profile, not float beside it. The mapping (from the IR-schema study; every artifact has a real on-disk home except SDLC, which is emergent):

| Artifact | Real OA concept | Field-level correspondence |
|---|---|---|
| **Vision** | `docs/VISION.md` + `docs/CONSTITUTION.md` §North Star/§Method — prose, carried as a `resources:` entry. Not modeled in the IR type at all. | The only IR touchpoint is `AutonomyIR.resources: string[]` — the Vision ships to installs as a carried file, nothing more. It is direction, not machinery. |
| **Constitution** | `docs/CONSTITUTION.md` (human-owned, `INSTALL_OWNED_PATHS`, never auto-edited) **+** its *enforcement surfaces*: `validateIR`'s merge-boundary checks (`ir.ts:101-127`, code-enforced), `policy.box.risk.*`/`merge.*` (gate-enforced), **and `.open-autonomy/architecture-invariants.yml`** (reviewer-enforced, human-ratified — the machine-readable constitution fragment the first draft missed). | The prose Constitution *governs*; the code check + the risk/merge policy keys + the invariants file *enforce*. `policy.box` is untyped `Record<string,unknown>` — **which is exactly why B.4 #20 matters: the safety-relevant keys must graduate from convention to validated schema, because a typo currently disarms the gate silently.** The Constitution's own edit-protection is a `human_required_paths` entry pointing at itself. |
| **Roadmap** | `.open-autonomy/roadmap.yml` (`schema: open-autonomy.roadmap.v2`), two-layer: 23 layer-1 items (`id`/`phase`/`priority`/`proposed\|planned`/`title`/`proof_gate`/`acceptance`/`intent`) → layer-2 GitHub issues (`origin:roadmap-planner` + `roadmap:<id>`), status derived by `rollupRoadmapStatus`. The strategist loop demonstrably feeds it (the three newest items cite OpenHands/SWE-agent/DGM sources). | Each item's **`proof_gate`** field is the bridge from Roadmap to the live-proof doctrine (Rule 7 / B.4 #17): it names the gate `check:proof` must pass before the item is real — which is why mechanizing `check:proof` is the keystone. The distilled roadmap (companion) is authored to slot straight into this schema. |
| **SDLC** | No single file — it is the *emergent behavior* of `compile(profiles/self-driving, gh-actions)`: the `agents:` map (behavior + capabilities + `review:` edges) + `policy.box` + the task lifecycle, realized by `emit.ts`'s effect step (push→PR→dispatch ci/agent-review/human-approval→auto-merge). | The SDLC *is* the fields: `IRAgent.capabilities` (the merge split), `IRAgent.review` (reviewer wiring), `Trigger` (cron for the PM poll, dispatch for workers, event for GitHub-native), `AutonomyIR.codeHost` (PR-based vs local-git). The "SDLC doc" is therefore best written as *a description of the compiled installation*, pointing at `ir.yml`. The honest report on this installation as it actually runs — including the two lanes and the throughput reality — is the companion `SDLC-ASSESSMENT.md`. |

**The through-line:** Vision → a carried `resources:` document (direction). Constitution → prose + the `validateIR` checks + the policy safety keys + the invariants file (governance, partly enforced). Roadmap → `roadmap.yml`'s two layers, gated by `proof_gate` (work). SDLC → the compiled `agents:` graph (execution). Each distilled doc in this effort is written to inform its real counterpart, and the roadmap's top items (Part B.4) are precisely the gaps between what these documents *assert* and what the IR *enforces*.
