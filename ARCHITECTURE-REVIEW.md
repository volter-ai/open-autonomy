# Open Autonomy — External Architecture Review

**Reviewer:** external consultant (no involvement in prior design decisions)
**Date:** 2026-07-05 (second pass — this revision re-verified every load-bearing claim with five independent evidence sweeps, including one reviewer deliberately blinded to the first draft; where the first pass was wrong, this version says so rather than papering over it)
**Scope:** full repository read at branch `vision-constitution-roadmap` (off `main`, HEAD `e5e0ae5`): the `autonomy.ir.v1` core + two substrate compilers, the five profiles, the runtime scripts, the model proxy, the bench harness, the full docs corpus, and the *entire* 558-commit git history (2026-06-16 → 2026-06-29). Live-run claims were independently re-verified against the canonical `volter-ai/open-autonomy` repo (workflow runs, branch protection, PR/issue timelines) and the external SOC2 proof repos via `gh api` and unauthenticated `curl`, as of 2026-07-05/06.

Every claim below cites a file (with line numbers where they matter), a commit hash, or a resolved run/PR. Line numbers are anchors as of this commit; treat them as such given the repo's velocity — this is a **14-day-old codebase**.

**Companion documents:** the distilled north star and hard invariants live in `VISION-AND-CONSTITUTION.md`; the concrete gap-closing plan, tracked as a burnable backlog, lives in the ztrack store (`.volter/tracker/`) with a human-readable index in `ROADMAP-DISTILLED.md`; the honest state of the SDLC-as-compiled lives in `SDLC-ASSESSMENT.md`. This document is the *why*; those are the *what, in what order*.

---

## 1. Executive summary

Open Autonomy is a **standard, a proof, and a product wearing one repository.** The standard is `autonomy.ir.v1` (`packages/core/src/ir.ts`): a substrate-neutral IR that declares a software org — actors with a `kind` (agent/human), capabilities, triggers, and a policy box — which `compile(profile, substrate)` materializes into a running installation on GitHub Actions (`packages/substrate-github`) or a local scheduler loop (`packages/substrate-local`). The proof is `profiles/self-driving`: this repo's own `main` *is* a compiled installation of that profile, gated by a merge boundary that is a **hard structural check in code** (`ir.ts:101-111`), and the fleet has genuinely authored, reviewed, and auto-merged its own commits — 18 agent PRs in 2026-06-20→25 and two more on 2026-07-05, all independently resolved. The product is `profiles/soc2-baseline`: an autonomous SOC2-compliance vertical that is the project's most intense recent work.

That is a real and unusual foundation. But the second pass sharpened the picture in ways the first draft got wrong or under-weighted, and the honest summary is now this:

1. **The project's entire epistemology rests on "live proof is the only proof," but the gate that enforces it is a string-presence check that never touches the network.** `check:proof` (`scripts/open-autonomy-proof-audit.ts:77-117`) counts a proof gate as satisfied if the ledger row contains a backtick-quoted token matching `/^\d{8,}$/` — a fabricated eight-digit number passes identically to a real green run, and nothing anywhere in `scripts/`, `bin/`, or `.github/workflows/` resolves a cited run against the GitHub API (grep-confirmed). Of the 12 audited gates, **7 cite only file paths** — for those, "proven" reduces to "the doctrine is written down" — and only 5 cite resolvable run evidence. Where claims *are* checkable they are true (I re-resolved 7 of 8 spot-checked run IDs exactly as claimed), but one cited testbed repo has already been torn down, so its ledger line is now unauditable by an outsider: **live-proof evidence rots**, and the tooling neither prevents fabrication nor preserves resolvability (§I.1).

2. **The repo runs two lanes, and only one of them is governed.** This is the finding the first draft framed too narrowly as "SOC2 bypassed the pipeline." The truth from commit forensics: genuinely hand-typed commits end 2026-06-20; the bot fleet was landing gated, auto-merged PRs from day one (06-16); and everything else — including all 46 SOC2 commits and `e5e0ae5` itself — is Claude-mediated operator work **direct-pushed to `main` with no PR, no CI gate, no review, and no human-approval check** (`enforce_admins: false` permits it; the co-author trailers prove the mediation). The *gated fleet lane* merged zero commits for the 10 days 06-25→07-05, then two docs-only fixes; the *ungated operator lane* carried the project's entire recent output. The org's governance is real for the lane that produces the least, and absent for the lane that produces the most (§I.3). The roadmap even knows this: `develop-oa-through-oa` ("close the manual loophole") exists — but as `proposed: true`, unratified and audit-exempt (`.open-autonomy/roadmap.yml:166-175`).

3. **The merge boundary is real at compile time but has four soft spots in its deployed realization.** (a) On live `main`, the required `agent-review` status check is **not app-pinned** (`app_id: null`, vs `ci` and `human-approval` pinned to the Actions app) — any actor with `statuses:write` could post the AI half of the boundary. (b) A typo in `policy.box.risk.human_required_paths` **silently disarms the human-approval gate for every PR** — traced end-to-end: the untyped box resolves to `[]` with no error (`emit.ts:522-523`), and the gate then auto-passes (`human-approval-gate.ts:130-135`). (c) Capability `@scope` suffixes (`code:propose@roadmap` on the strategist) are **decorative** — every consumer strips them and grants full `contents:write` (`emit.ts:264-266`), and the effect script stages `git add -A` unconditionally (`agent-propose.ts:83`). (d) The egress lockdown **fails open on private repos by default** — the enforced fallback is opt-in and only `soc2-baseline` opts in (§4.6–4.9).

4. **The thing the Vision names as the bottleneck is the thing that isn't built — but its first deliverable is computable today, and the crude first number is ~50%.** `VISION.md:89-90` concludes "Bench is the constraint"; `bench/` has been untouched since 06-24 and the autonomy ratio, twin, and human simulators are vocabulary, not implementation. Yet the ratio's crude form falls straight out of existing labels: of the 16 closed `origin:roadmap-planner` issues, **8 were closed by the bot and 8 by a human**. By recent commit *volume* the ratio is far lower. Publishing that honest number would do more for the proof's credibility than any further self-driving (§I.4).

5. **The doc layer has drifted from the code systemically — including inside single documents — in a project whose whole pitch is that the doc compiles into the system.** `SPEC.md` contradicts *itself* on the config slot (removed at `:119-130`, still taught at `:710-720`), on the Runner's sync/async contract (`:195-206` vs `:604-610`), and shows the unshipped `actors:` rename as current (`:72`). `CLAUDE.md:121` and `ARCHITECTURE.md:109-110` still teach the retired four-slot model. Three docs cite the deleted `AUTONOMY-IR.md`. The two roadmap artifacts disagree on what is done. And the "Built vs designed" ledger — the project's own honesty mechanism — is itself wrong in one place: it marks `HumanRunner` as built and "driven by the local substrate," but `HumanRunner` is **dead code** (imported only by its own test) and the local substrate **mis-realizes `kind:human` actors as AI-launchable prompts** (§I.6, §4.4).

6. **Premature abstraction is a demonstrated, recurring failure mode — bigger than the first draft knew.** Beyond the three known wholesale reverts (steps/ABI, the agents package, the publisher cluster), the second pass found the largest arc: the **entire v0 "OSS-kit" architecture** (templates, three example repos, the default profile — 215 files) was built 06-16→19 and dismantled by 06-22, plus two build-to-revert cycles of *21 and 28 minutes*, and one script deleted within a day *because* "creating tracking issues is the planner's job, not a script." The team keeps re-learning "prove necessity live before generalizing" and has never written it down (§I.5).

None of these are fatal, and two things deserve equal emphasis: the compile-time boundary and the honesty culture are real (the skeptic-panel self-correction `9369f93`, the `architecture-invariants.yml` "no agent re-architects" mechanism — §7). But items 1–3 compound fastest precisely because the fleet is designed to scale its own throughput: an unmechanized proof gate, an ungated fast lane, and an unpinned review check are cheap to fix at 14 days and expensive to fix once more profiles and installations inherit them.

---

# Part I — Holistic assessment: the bets, the split identity, and the epistemics

This part evaluates the decisions that don't live in any one file. Each is a judgment call the team has implicitly made; my job is to make it explicit, price it, and say what I'd do.

## I.0 The organizing thesis: a standard, a proof, and a product — and the proof is the moat

The right way to read this repository — and the yardstick most of Part I measures against — is as three distinct things that happen to share a git root:

- **The standard** — `autonomy.ir.v1`: the IR, the actor model, the capability catalog, the two substrate compilers, conformance. This is the *thing* per the Vision's own words: "everything else is an instance of it" (`VISION.md:10-14`). It is the most mature leg (`VISION.md:66-71` marks Standards "mature" — an assessment §I.5's revert history says is still optimistic at the runner/realization seam).
- **The proof** — `profiles/self-driving`: the claim that the standard is real because the repo runs *itself* on it. Marked "live" (`VISION.md:66-71`); the machinery of that claim survives independent verification, but its throughput and labor share need honest qualification (§I.2).
- **The product** — `profiles/soc2-baseline`: a vertical application built *with* the standard. Not mentioned in the Vision at all, but the dominant recent effort (§I.3).

The most important strategic fact this framing surfaces: **the proof is the moat, not the standard.** A substrate-neutral IR for declaring an org is a reasonable idea, but it is an idea others can have. "This repository's agent fleet opens, reviews, gates, and merges its own PRs behind a mechanically-enforced no-agent-merge boundary, and here are the resolvable run IDs" is a demonstration very few can make. The architecture should protect and deepen the proof leg above all — because it is the part with a defensible story, the part that validates the standard, and the part that is *already partly true* rather than designed.

Three things follow, and they are the spine of this review:

1. The proof leg's credibility rests entirely on the proof *tooling*, and that tooling is currently a string check whose evidence also rots (§I.1). Fixing it is the single highest-leverage move available.
2. The repo's real output flows through an ungated operator lane the governance never sees, which both weakens the governance claim and forfeits the chance to make that work a dogfood proof point (§I.3).
3. The Bench leg — the part that would let the project *measure* how self-driving it is — is unbuilt, so the proof's *depth* is asserted at the same fidelity as its *existence*. The crude first number is computable today (§I.4).

## I.1 "Live proof is the only proof" is honored in practice but not in tooling — the gate is a string-presence check, and evidence rots

This is the most consequential architectural fact about Open Autonomy, because the project stakes its entire epistemology on it. The doctrine is stated everywhere — `CLAUDE.md:23-24` ("`live proof` is the only proof… unit tests and piecewise verification don't"), Constitution Rule 7 ("Testbed proof is part of done"), `SPEC.md:248-254` ("There are **no unit tests** of behavior"). The culture *lives* it: the history is full of live run IDs, and a skeptic panel caught and corrected a real overclaim (`9369f93`, below). The doctrine is not lip service.

But look at the machine that is supposed to enforce it. `check:proof` runs `scripts/open-autonomy-proof-audit.ts`, and `auditProofLedger` (`:47-66`) marks a gate `present` iff a ledger table row for that gate id is textually `done` *and* `validatedEvidence` returns something non-empty. `validatedEvidence` (`:77-95`) accepts a backtick-quoted token as real evidence when `isRunId` matches it — and `isRunId` (`:115-117`) is exactly `/^\d{8,}$/`. **There is no `fetch`, no `gh api`, no network call anywhere in the file — nor anywhere else**: grepping all of `scripts/`, `bin/`, `packages/*/src`, and `.github/workflows/` for anything that resolves a proof-ledger run ID against the API returns only the regex literal in the audit's own test fixture. A hallucinated eight-digit number, a run ID from a deleted run, or a run whose conclusion was `failure` all pass identically to a real, green run. The one exception is a narrow guard that a cited `TEST_RUNS.md` file actually contains a run-URL-shaped string (`:97-107`) — which still never checks that the URL resolves.

The gap is not academic, and the precise numbers are worse than they first look:

- The entire SOC2/W12 proof block — 18 ledger rows, `PROOF_LEDGER.md:23-58`, the subject of ~30 of the last commits — **is not in `.open-autonomy/roadmap.yml` at all** (zero-hit grep), so `check:proof` never even sees the project's most-cited evidence.
- Of the 23 roadmap gates, 11 are `proposed: true` and exempt by design, leaving 12 audited. Of those 12, **7 cite only doc/skill file paths** (`retry-ci-failure`, `pm-open-pr-review`, `developer-context-review-fix`, `head-changed-before-merge`, `quality-review-repair`, `governance-maintainer-hold`, `release-dogfood`) — for a majority of the audited gates, "proven" means "the prose exists." Only 5 gates cite resolvable run IDs.
- The prose itself is outgrowing the machinery: `soc2-W12-executive-assist` is a **single ~1,200-word table cell** (`PROOF_LEDGER.md:41`) of narrative claims, caveats, and corrections — a ledger being *argued with*, not computed.

To the team's enormous credit, **where the claims are checkable, they are true.** I independently re-resolved 8 cited run IDs across the canonical repo and four external SOC2 repos: 7 of 8 resolve *exactly* as the ledger claims — including the runs the ledger says failed by design (the Semgrep-catches-injection proofs). The public/private visibility of the five flipped repos matches `e5e0ae5`'s claim precisely. The correction in `9369f93` is real: it caught an overclaim ("11/13 controls proven end-to-end") that had conflated drafter-stage honest-degrades with merged, signed proof, and rewrote it honestly. That is exactly the immune system the doctrine is supposed to grow.

But the 8th spot-check exposes a second gap the first draft missed: `operator-pause-resume` cites runs on `volter-ai/open-autonomy-testbed` — **a repo that no longer exists** (404). Testbed cells are disposable by design, so their evidence is *inherently perishable*: a ledger line that was true and checkable when written is now unauditable by anyone. An immune system made of one skeptical operator plus perishable citations is not an architecture. **The doctrine's guarantee today is "a human wrote something run-ID-shaped and, if you check soon enough, it usually resolves" — not "the run happened, was green, and stays verifiable."**

**Recommendation** (the P0 of the roadmap): make `check:proof` resolve its evidence. Call `gh api` for each cited run ID/URL; confirm the run exists, belongs to the claimed repo, and concluded `success` (with the step-level nuance the ledger already documents). Bring the SOC2/W12 gates *into* `roadmap.yml` so they are audited at all. Add a red-team fixture: a ledger row citing a fabricated run ID must make `check:proof` *fail*. And handle perishability: for disposable-cell evidence, require a durable artifact (archived run log, committed transcript) at ledger-write time, so proof does not rot with the infrastructure that produced it. Until the red-team fixture exists, the project cannot claim its proof doctrine is mechanized — only that its operator is honest.

## I.2 The dogfood machinery is real; the dogfood throughput is thin — and the honest verdict needs both halves

The first draft called the dogfood "genuinely, verifiably self-driving" with the PM "firing on its cron to the minute." Both halves of that need correcting against the live data (all independently resolved, 2026-07-05/06):

**What is real.** The full gated pipeline demonstrably works end-to-end with no human in the loop: `pm` (cron) → developer dispatch → PR → `ci` + `agent-review` + `human-approval` → native auto-merge. Eighteen agent-authored PRs merged this way 2026-06-20→25; two more (#117, #118) on 2026-07-05, with planner-issue #115 closed 21 seconds after #117's merge — a direct causal chain through the machinery. The roadmap-status-is-derived doctrine holds (`roadmap.yml` carries no hand-written `done`; status computed by `rollupRoadmapStatus`, `services/agent-model-proxy/src/github-sync.ts:107-135`). The crons are all alive: 593 workflow runs in the 6.9-day window, `pm` 167/170 success, the Merge/reconcile sweeps 194/194.

**What is thin.** Between 06-25 and 07-05 the fleet merged **nothing** — ten straight days of zero throughput while `pm` ran "green" ~170 times. What landed on 07-05 was two docs-only fixes. Four dependabot PRs (#109/#110/#112/#113) have sat `BLOCKED` since 06-25 — 10-11 days — with no fleet remediation attempt; `developer` fired only 4 times in 8 days (2 of them failures); the weekly `strategist` run failed (06-29) with nothing noticing. And the PM's cadence is not "to the minute": against a declared `*/30` cron, the actual mean inter-run gap is **59.5 minutes** (median 55.4, max 134.5) — GitHub Actions skips roughly two of every three scheduled ticks under load. None of this is a crash; the #114/#115 stall traces to doctrine-consistent behavior (the PM defers to planner phase-gating, logged on nearly every sweep, until it reclassified the issue on 07-05 and resolved it within one cycle). But "the loop is alive and green" and "the loop produces" are different claims, and for ten days only the first was true.

**Why the gap was invisible: the org cannot see its own idleness.** A PM that runs successfully 170 times while the backlog sits still, wedged PRs age, and the strategist dies silently is precisely the "org health" gap the project has already named (issues #66/#67, both still open, both `human-required`). Escalation depends on the PM; nothing watches the watcher. The wedged dependabot PRs are the live demonstration.

**The narrowness now has a number — two, actually.** Crude autonomy ratio over the fleet's labeled work: of 16 closed `origin:roadmap-planner` issues, **8 closed by the bot, 8 by a human — 50%**. Weighted by recent commit volume the ratio collapses: essentially all of the last week's output is operator-lane (§I.3). Every autonomous merge to date is a low-risk docs/spec fix. That is the right place for a young fleet to start, and the merge boundary is what makes even that safe — but "the fleet drives the repo" and "the fleet lands docs fixes at 50% of labeled issues and ~0% of recent volume" are very different claims, and only a built Bench (§I.4) can track which one is becoming true.

## I.3 The two lanes: the governed pipeline produces the least; the ungoverned lane produces the most

The single sharpest structural finding of this review, sharpened further by commit forensics the first draft lacked. The repo's commits arrive by two lanes:

- **The gated fleet lane:** agent-authored PR → `ci` + `agent-review` + `human-approval` → auto-merge. Every safety property the project advertises applies here. Throughput: 18 merges 06-20→25, zero for ten days, 2 on 07-05 — all low-risk.
- **The ungated operator lane:** direct push to `main` by the admin identity. `enforce_admins: false` permits it by design ("only human admins can direct-push"). No PR, no CI gate, no review, no human-approval, no roadmap linkage.

The forensics: genuinely hand-typed commits (the `Aaron Yuan` identity, no AI trailer) end **2026-06-20**. From then on, the operator lane is itself Claude-mediated — 462 of 560 commits repo-wide carry a `Co-Authored-By: Claude` trailer, including `e5e0ae5` and all 46 SOC2 commits (100% operator-authored, 0 bot, dated 06-28/29). So the composition of recent history is: an *agent-assisted human* pushing directly to `main` at high volume through the lane with no gates, while the *governed* agents idled in the lane with all the gates. The most safety-relevant fact about the repo's actual change flow — that its dominant lane is the ungated one — appears in no governance artifact.

The SOC2 vertical is the largest instance, and it also shows what the lane bypass costs:

- None of its ~46 commits went through strategist → planner → fleet; "soc2" appears zero times in `roadmap.yml`, `ROADMAP.md`, `VISION.md`, `CONSTITUTION.md`, or `CLAUDE.md` (all zero-hit greps). Its 18 proof rows are orphaned from `check:proof` (§I.1). It has zero bench integration.
- Yet it is engineered with real rigor — semver 1.0.0→1.3.3, a per-release adversarial skeptic panel finding actual bugs (`profiles/soc2-baseline/CHANGELOG.md`) — and it is the only profile whose script gates the root check (`package.json:46`).

I want to be careful about what this does and doesn't mean. It is **not** evidence the engine has narrowed into SOC2: only 7 of the 46 SOC2 commits touch `packages/` (vs ~175-207 lifetime commits touching `packages/`), and `VISION.md` — last modified 3.9 days *before* the first SOC2 commit — still describes the general platform. The narrowing is of *recent operator energy*, not of the engine. And the project is not blind to the loophole: roadmap item `develop-oa-through-oa` ("close the manual loophole — a canonical-repo feature is authored by the develop agent… not hand-written in a chat") says exactly the right thing. But it is `proposed: true` — unratified, audit-exempt, aspirational. The org knows, and hasn't yet decided.

But it is a real architectural problem, because it demonstrates that **the org's governance is bypassable by the one person most able to bypass it** — and governance the founder routes around under deadline pressure is governance that will not hold when a contributor, or the fleet itself, is under the same pressure. It also forfeits the single best opportunity the project has: SOC2-compliance-drafting is an *ideal* dogfood workload (high-stakes, well-specified controls, a clear "done"), and running it *through* the pipeline would be a far stronger proof of the platform than building it beside the pipeline by hand.

**Recommendation:** make the decision the docs currently make by omission — and make it two-sided. (1) Ratify `develop-oa-through-oa` (flip it to `planned`, give it a real proof gate) so the manual loophole has a closing date; the ratified version should define what the operator lane is *for* (emergency/bootstrap) and require even bootstrap work to cite live-run evidence, which the item's own acceptance criteria already sketch. (2) Decide SOC2's home: either ratify it as a first-class roadmap vertical — layer-1 intents, proof gates under `check:proof`, next controls driven through the fleet — or declare it an out-of-tree product built *on* OA (the `volter-autonomy` boundary `README.md:191-194` gestures at, currently rhetorical) and move it to its own repo. The one thing not to do is leave the most active lane in the repository accountable to none of the repository's rules.

## I.4 Bench is named the constraint, and the constraint is a glossary — but its first number is computable today

`VISION.md:89-90` is admirably direct: applying Theory of Constraints to the mission, "Standards is mature and Dogfood is live, so **Bench is the constraint.**" I agree with the diagnosis. The problem is that the constraint is also the least-built leg, and practice is not allocating to it: `bench/` (30 commits, all 06-21→24) has been untouched since June 24 while the SOC2 vertical absorbed the operator's entire energy.

What Bench is supposed to deliver (`VISION.md:174-227`, `:264-284`, H3/H4): per-seam velocity, cost, yield, rework; the **autonomy ratio**; a self-calibrating **twin**; **model-roleplay human simulators** so a human-in-the-loop org can be benched unattended; competitive scoring with error bars. What is actually built, by the docs' own ledger (`CLAUDE.md:200-207`): essentially none of it. The harness that exists (`bench/`, `bin/bench.ts`) provisions disposable funded cells and can drive/score conformance workloads pass/fail; the *measurement layer* that would turn a run into an autonomy number does not exist. `bench-autonomy-ratio` sits in the roadmap as `proposed: true`.

This matters beyond tidiness because of §I.2: **without Bench, the project cannot measure how good its own proof is.** And the excuse is gone — the crude ratio falls out of data the fleet already emits. This review computed it in an afternoon from issue-timeline actors: **8 of 16 closed roadmap-planner issues closed by the bot (50%)**; near-zero of recent commit volume. Those two honest numbers, published weekly in the proof ledger, would (a) make §I.2's thinness a measured fact instead of a reviewer's observation, (b) give the fleet a target that resists narrative inflation, and (c) force the labeling/attribution hygiene the full H3 metric will need anyway.

**Recommendation:** treat the autonomy ratio over a real dogfood window as the first Bench deliverable and the forcing function for the rest. Ship the label-based crude version first (it needs no twin and no simulators); let its known blind spots (volume-weighting, risk-weighting) motivate H3 properly.

## I.5 Premature abstraction is the recurring failure mode — and it is bigger than three reverts

Read the first week of history and one pattern dominates: an abstraction shipped before its necessity was proven, then torn out. The full inventory (second pass; the first draft knew only the middle three):

- **The v0 "OSS-kit" architecture — the largest arc, previously uncounted.** The entire pre-IR system: `templates/`, three `examples/` repos, the `default` profile, `public-agent-triage`, the admin workflow. Built from the repo's first day (`feb112e`, 06-16), progressively dismantled 06-19→06-22, culminating in "retired the rung" (`7c0147c`/`30d508e`, 215 files). The file-touch statistics are dominated by its teardown (`examples/` leads the whole repo at 1,119 touches in 57 commits).
- **The IR "steps/ABI + universal envelope" model** — built across 11 commits in one evening (`3bde06f`…`a03c966`, 06-19), reverted wholesale ~26 minutes after the last one landed: `b664b86` "Revert the steps/ABI over-encoding (wrong premise)."
- **The `@open-autonomy/agents` package** — shipped `cf9699c` 18:37, fully un-shipped by 19:38 the same day across three reverts (`53f71e4`: "agents were never a separate thing").
- **The bundle/publisher dispatch cluster** — excised in a seven-commit "salt the legacy" wave (`9397236` + six, 06-22).
- **Two micro-cycles:** the owner-account spend fallback, shipped and reverted in **21 minutes** (`13dd284`→`8a09c6d`, "a shared pool gives no blast-radius isolation"); inline-skill-text-as-launch-prompt, **28 minutes** (`cfd1b4d`→`30ef275`, "feeding the raw SKILL.md as the launch prompt does not make the agent act").
- **One doctrine-driven deletion that shows the principle working:** `reconcile-roadmap-issues.ts`, a script added 06-23 and deleted 06-24 *because* "creating tracking issues is the planner's job, not a script" — the "scripts only for security" rule self-correcting in real time.

The "salt the legacy" ritual is itself a second-order signal: docs drifted out of sync with deleted subsystems often enough that the team named a recurring cleanup for it — the same pathology as §I.6, seen from the code side. And the churn reaches the core: the runner/realization seam was reworked and rolled back as late as 06-20/21, which is why "Standards: mature" (`VISION.md:68`) should read "stabilizing."

The team already holds the right instinct in one specific form: "scripts only for security — never script what an agent can do" (`CLAUDE.md:29-38`), and the reconcile-script deletion proves they apply it. But that is the *special case*. The general principle this history keeps teaching — **prove a capability is needed by a live run before you build the abstraction that generalizes it** — is not written anywhere. Stating it (call it "earn the abstraction") would convert five expensive re-learnings into one written invariant, and it is the kind of hard-won constraint a Constitution exists to hold.

## I.6 The doc layer has drifted from the code — systemically, and the map is the product

Open Autonomy's entire pitch is that the declarative artifact *compiles into* the running system — the map *is* the territory. That makes doc drift not hygiene but a category error against the project's own thesis. The first draft found one big instance; the second pass found the drift is systemic, including *within* single documents:

- **`SPEC.md` contradicts itself three ways.** The config slot: `:119-130` states, correctly per the code, "There is **no** `config` box… leaks… removed" — while the Handoffs table at `:710-720` still teaches a `config` slot row with fields (`model`, `assignee`, `sla`, `escalation`) that exist nowhere in `IRAgent` (`ir.ts:31-46`). The Runner: `:195-206` shows a synchronous `launch(...): Session` while `:604-610` and the actual code (`runner.ts:29-35`, "the contract is ASYNC") are async. The rename: the example at `:72` uses `actors:` as the top-level key while the code and every profile still use `agents:` (`ir.ts:30` admits "mid-migration"). Plus: `review?` and `result?` — real, `validateIR`-enforced, production-used fields — are absent from SPEC's "that is the entire IR" section (`:61-106`); `codeHost` is absent from SPEC *and* from `docs/CODE_HOST_RESOURCES.md`, the doc the code points readers to for exactly that concept; and `:361-362` describes an auto-merge arming flow that `CODE_HOST_RESOURCES.md:75-79` (and the code) superseded on 06-26.
- **The summary docs teach the retired model.** `CLAUDE.md:121` ("four slots: behavior, capabilities, triggers, config") and `ARCHITECTURE.md:109-110` ("`config` (opaque misc)") both contradict SPEC's own removal note and the code.
- **Dead references.** `CONSTITUTION.md:26`, `PROJECT.md:7`, and `VISION.md:96,101` cite `AUTONOMY-IR.md`, which was merged into `SPEC.md`; `OSS_AGENT_RUNBOOK.md:113` links to a rollout doc absorbed into `OPERATIONS.md`. `ARCHITECTURE.md`'s own "Documentation Map" lists 8 of the 15 files actually in `docs/` — missing, among others, `VISION.md`, `CONSTITUTION.md`, and `PROOF_LEDGER.md`, i.e. the direction layer itself.
- **The two roadmaps disagree.** `docs/ROADMAP.md` (45KB, 1,131 lines, the legacy "Phase 1–13" paradigm; never mentions seams, the twin, the autonomy ratio, or actor-`kind`) says at `:722-725` that the four Section-4 proof fixtures "do not exist yet"; `LIVE_TESTING_STRATEGY.md:257-267` lists the same four as "Built and committed," with coverage rows at `:118-141`. Both files are current on disk. A project that ships installs cannot carry two roadmaps that disagree — `ROADMAP.md` is in `INSTALL_OWNED_PATHS`, so every installation inherits the contradiction.
- **The honesty ledger has a false entry.** `CLAUDE.md:191-193` marks `HumanRunner` built and "driven by the *local* substrate." It is not: `HumanRunner` (`runner.ts:93-140`) is imported nowhere but its own test, and `substrate-local`'s compiler never reads `agent.kind` — a `kind:human` actor compiles into an AI-launchable skill + prompt like any agent (§4.4). The one mechanism the project maintains specifically to prevent built/designed conflation has itself conflated them.
- **The public pitch undercounts.** `README.md:119-121,148` names 4 profiles; there are 5 (`soc2-baseline` is real, CI-exercised, and root-gated). The "commercial boundary" (`README.md:191-194`) is prose only.

The fix is not to rewrite everything — it is to **retire and reconcile**: delete or stamp `docs/ROADMAP.md` "superseded" (one canonical direction artifact: `roadmap.yml`), sweep SPEC's internal contradictions in one pass, fix the four-slot summaries, correct the `HumanRunner` ledger line, and make the doc map generated or checked. This is a direct input to the distilled roadmap.

---

# Part II — Implementation-level findings

## 2. Architecture overview — the system as it actually exists

### 2.1 The IR and the compile pipeline

The core contract is small and clean. `AutonomyIR` (`ir.ts`) is `{ schema: 'autonomy.ir.v1'; targets: string[]; codeHost?: 'github'|'local-git'; agents: Record<string,IRAgent>; policy: IRPolicy; resources: string[] }`. An `IRAgent` is `{ behavior, capabilities, triggers, kind?, timeout?, review?, result? }` — there is **no per-agent `config`** (the type comment says so explicitly), only the profile-level `policy.box`. `compile(profile, substrate)` (`bin/autonomy-compile.ts`) parses the IR, branches to `compileGithub` or `compileLocal`, and `materialize`s a `CompileOutput = { generated: Record<path,content>; copies: {from,to}[] }` — an installation is exactly "files derived from the IR" plus "profile files copied verbatim." `check:dogfood` enforces OA root == `compile(self-driving)` for all 57 managed files (verified passing), and the runtime mirror is in sync (13 files, `sync-runtime --check` verified).

### 2.2 The actor model and the merge boundary

`behavior` names a SKILL folder (prose doctrine), `capabilities` is pure authority (the core "never interprets what a capability does"), `triggers` is cron|event|dispatch (only cron portable/interpreted), `kind` is agent|human. The **merge boundary is enforced in code** (`ir.ts:101-127`): no `code:merge` on any agent; no agent holding both `code:propose` and `code:review`; a `review:` edge must name an *independent* agent actually holding `code:review`. The check strips `@scope` suffixes before comparing, so scoping cannot evade it. The GitHub realization (`substrate-github/src/emit.ts`) maps capabilities → workflow permissions (`:254-277`), emits the effect step (push → PR → arm auto-merge → dispatch ci+agent-review+human-approval, all retried — necessary because a bot-opened PR fires no `pull_request` events), and injects the vendored runtime. `kind:human` → declared, never job-realized on GitHub (`manifest.ts:19,60,64`; `emit.ts:474-476`).

### 2.3 The policy box

`IRPolicy = { maxConcurrent?; box: Record<string,unknown> }` (`ir.ts:61-67`) — deliberately untyped, "governance DATA the core carries verbatim and never interprets." In `self-driving/ir.yml` the box mixes hard governance (`risk.human_required_paths`, `merge.*`), operational tuning (`autonomy.max_ci_retries`), and runtime infra (`gh-actions.proxy_host`, `model`). Every sub-key is per-profile convention read by agreement, not schema — and the safety consequences are concrete (§4.7).

### 2.4 The two-layer roadmap and derived status

`.open-autonomy/roadmap.yml` (schema `open-autonomy.roadmap.v2`): a `direction:` prose anchor plus 23 `items:` each carrying `id`, optional `phase`, `priority`, a mutually-exclusive `proposed:true`|`planned:true` lifecycle flag (11 proposed / 12 planned), `title`, `proof_gate`, `acceptance:`, and newer items an `intent:` paragraph. Layer-1 items become layer-2 GitHub issues (`origin:roadmap-planner` + `roadmap:<id>` labels); execution status is *derived* at runtime (`rollupRoadmapStatus`), never stored. The three newest items cite OpenHands/SWE-agent/DGM sources — live evidence the strategist research loop produces real items. There is no TS schema for roadmap items; it is prose-interpreted YAML.

### 2.5 The control plane and the invariants file

The proxy (`services/agent-model-proxy/`, a Cloudflare Worker; 79 commits spanning the entire history — a continuous workstream, not a blitz) gates all model spend. Its budget layer held up under adversarial code review: client-declared caps are clamped server-side (`index.ts:395-406`), reservations are atomic inside a Durable Object (`run-budget.ts:77-107`), per-repo/actor/issue caps layer on top, and OIDC minting clamps `purpose` so a fleet repo cannot self-elect the trusted lane. (One nit: the `x-admin-token` compare is non-constant-time, `index.ts:495-498`.) Its `consumed_usd_cents` is the authoritative cost, not the CLI's ~40×-wrong estimate.

Separately — and missed by the first draft — `.open-autonomy/architecture-invariants.yml` is a human-owned "architectural immune system": machine-readable invariants (substrate-is-runner-only, ir-is-the-standard, …) that the reviewer enforces on every change, with `on_change: human-required`. It is the third structural sibling of "no agent merges / no agent deploys": **no agent re-architects.** A genuinely sophisticated governance idea, already wired into the review rubric.

## 3. Inconsistencies

**3.1 The four-slot/config model — doc vs doc vs code.** `CLAUDE.md:121` and `ARCHITECTURE.md:109-110` teach a per-agent `config` slot; `SPEC.md` both denies it (`:119-130`) and teaches it (`:710-720`); `ir.ts` has none. One fact, four tellings, three wrong.

**3.2 Two roadmaps that disagree on what is done.** `docs/ROADMAP.md:722-725` vs `LIVE_TESTING_STRATEGY.md:118-141,257-267` on the same four fixtures (§I.6).

**3.3 The proof doctrine vs the proof tooling.** "Live proof is the only proof" (culture) vs a string-presence audit, 7/12 path-only gates, 18 orphaned SOC2 rows, and perishable citations (§I.1).

**3.4 Governance-by-pipeline vs the operator direct-push lane.** The org's stated method is strategist→planner→fleet; its dominant lane is ungated direct-push (§I.3). Acknowledged in-roadmap only as an unratified `proposed` item.

**3.5 `SPEC.md` vs `runner.ts` on the Runner contract** (sync shown, async real) and **vs the shipped auto-merge arming flow**; `actors:` example vs `agents:` reality (§I.6).

**3.6 "Built" vs actually-dead: `HumanRunner`.** `CLAUDE.md:191-193` vs zero non-test imports and a kind-blind local compiler (§4.4).

**3.7 Bench status: "underbuilt" vs "not built."** `VISION.md` vs the Built-vs-designed ledger; the practice (untouched since 06-24) matches the harsher reading (§I.4).

**3.8 `soc2-baseline` declares the human gate without the human.** It wires `policy.box.human` + ships `human-approval.yml` but declares no `kind:human` actor — unlike `self-driving`, which pairs the same policy with an explicit `maintainer`. The gate exists without a declared consumer in the IR.

**3.9 README profile count and the commercial boundary.** 4 of 5 profiles named; `volter-autonomy` boundary is prose with no enforcement (§I.6).

## 4. Gaps

**4.1 No network verification in the proof gate** (§I.1) — the highest-priority gap; the audit cannot distinguish a real green run from a fabricated ID, and 7 of 12 audited gates cite no run at all.

**4.2 The SOC2 proof block is unaudited** — 18 ledger rows not in `roadmap.yml`; `check:proof` never sees the project's most-cited evidence (§I.1/§I.3).

**4.3 No autonomy ratio / measurement layer** — computable today (crude form: 50% of labeled issues, ~0% of recent volume) but not computed by the system (§I.4).

**4.4 The local substrate mis-realizes `kind:human`, and `HumanRunner` is dead code.** `compileLocal` never reads `agent.kind` (grep-confirmed): it generates launch prompts and copies SKILL.md for human actors exactly as for agents, so compiling `self-driving` (`targets: [gh-actions, local]`, `maintainer: kind: human`) to `local` would produce an AI-launchable "maintainer." `HumanRunner` (`runner.ts:93-140`) — the designed fix — is imported only by its own test. `check-profiles.ts` compiles the profile but asserts only structure, so CI cannot see this. The declared-not-realized principle, correct on GitHub, is silently violated on the substrate CLAUDE.md says drives it.

**4.5 No standalone health monitor** — escalation depends on the PM; the org cannot notice its own idleness. Live demonstration: four dependabot PRs BLOCKED for 10-11 days, a failed weekly strategist run, and a 10-day zero-merge window, all invisible to 170 "successful" PM runs (issues #66/#67, both open, both `human-required`) (§I.2).

**4.6 The `agent-review` required check is not app-pinned on live `main`.** `gh api …/branches/main/protection` shows `ci` and `human-approval` pinned to `app_id: 15368` but `agent-review` at `app_id: null` — any token with `statuses:write` can post the AI half of the merge boundary. The provisioning script (`provision-target-repo.ts:291`, `strict: false`, no app binding) propagates the gap to every install. Pin the check to the Actions app or document why the permission split alone suffices.

**4.7 The safety-relevant policy keys are unvalidated, and a typo silently disarms the human gate.** Traced end-to-end: `emit.ts:522-523` reads `policy.box.risk.human_required_paths` with a fallback to `[]`; a misspelled key produces an empty globs file with no error; `human-approval-gate.ts:52-63,130-135` then auto-passes every PR "no human-required scope." B.1-strength validation of `risk.*`/`merge.*` is missing.

**4.8 Capability `@scope` is unenforced.** `code:propose@roadmap` (strategist, `ir.yml:67,82`) grants full `contents:write` (`emit.ts:264-266`); the effect stages `git add -A` (`agent-propose.ts:83`). The profile's own comments present the scope as a real restriction; it is enforced only by the skill's good behavior.

**4.9 Egress lockdown fails open on private repos by default.** harden-runner's block mode is public-repo-only (Community tier); the enforced fallback (`egressGuard`, `emit.ts:176-184`) is gated behind `policy.box.gh-actions.private_egress_guard`, which only `soc2-baseline` sets. A private-repo install of `self-driving`/`simple-gh-sdlc` gets audit-only egress on credentialed agent jobs.

**4.10 Bench measurement (H3) and simulators/twin (H4)** — the named bottleneck, unbuilt and unallocated (§I.4).

**4.11 Single substrate proven in anger; single production profile.** `substrate-local` has one recorded run ever (2026-06-17); only `self-driving` has fleet-merged commits (`simple-*` are hand-run portability proofs, `hello` a demo, `soc2-baseline` proven outside the harness). Substrate-neutrality and multi-profile are design claims with n=1 each. The Vision's GitLab forcing-function is unstarted.

## 5. Technical debt / risk hotspots

**5.1 `scripts/open-autonomy-proof-audit.ts` gives false assurance.** The enforcement point of the project's core doctrine verifies syntax, not facts (§I.1). Debt here is worse than absence, because a passing `check:proof` *reads* as "the runs are real."

**5.2 The `policy.box` grab-bag.** Hard invariants and cosmetic config share one untyped `Record<string,unknown>`; the failure mode is now demonstrated, not hypothesized (§4.7).

**5.3 `docs/ROADMAP.md` (45KB) is superseded but live and install-inherited** (§I.6).

**5.4 The SOC2 vertical wired into the root gate.** `check:soc2-register` runs on every `bun run check` (`package.json:46`; the line's stray 2-space indent is the physical trace of the hand-splice) — a single profile's script gating the monorepo.

**5.5 The dispatch web.** Because bot PRs fire no events, six retry loops in `agent-propose.ts:137-171` hand-dispatch every required check; each added check (SOC2 added three) widens the silent-wedge surface CLAUDE.md already flags. The wedged dependabot PRs show what an undispatched/failed check looks like in practice.

**5.6 Strategist reliability.** The weekly sweep's most recent scheduled run failed (06-29), unnoticed — the top of the roadmap-generation funnel has no watchdog (§4.5).

**5.7 Process risk visible in the history.** Five built-then-reverted arcs (incl. a 215-file architecture) and a named "salt the legacy" ritual in week one — velocity is high and the abstraction-discipline is learned-by-revert, not yet stated (§I.5).

**5.8 Doc-drift velocity.** Eras change fast enough that even `SPEC.md` disagrees with itself within one file, and the doc map misses half the corpus (§I.6). Without a drift check, the spec layer of a spec-first project decays in days, not months.

## 6. Room for improvement — concrete, prioritized

**P0 — Mechanize the proof doctrine (§I.1).** `check:proof` resolves every cited run ID/URL via `gh api` (exists + repo-match + `success`, with documented step-level exceptions); a red-team fixture where a fabricated ID *fails*; the SOC2/W12 gates brought into `roadmap.yml`; durable-artifact requirement for disposable-cell evidence so proof cannot rot. *The one change that converts the project's central value from asserted to enforced.*

**P0 — Decide the two-lane question (§I.3).** Ratify `develop-oa-through-oa` (proposed → planned, with a dated proof gate) to close the manual loophole; scope the operator lane to declared bootstrap/emergency use; decide SOC2's home (ratify into the roadmap + fleet, or spin out). Do not leave the dominant lane ungoverned.

**P1 — Ship the autonomy ratio over a real window (§I.4/§I.2).** The label-based crude version is computable today (this review got 8/16 = 50%); publish it in the proof ledger weekly, volume- and risk-weight it later. Makes the proof's *depth* measurable.

**P1 — Close the boundary's deployed soft spots (§4.6–4.9).** Pin `agent-review` to the Actions app (and fix `provision-target-repo.ts` so installs inherit the pin); validate `risk.*`/`merge.*` policy keys at compile (a typo must fail, not disarm); either enforce `@scope` in the effect step or delete the suffix from profiles (a fake restriction is worse than none); default the private-repo egress guard on.

**P1 — Reconcile the doc layer in one sweep (§I.6).** Retire/stamp `docs/ROADMAP.md`; fix SPEC's three self-contradictions; fix the four-slot summaries in CLAUDE.md/ARCHITECTURE.md; correct the `HumanRunner` "built" entry; fix dead refs and the doc map. One canonical direction artifact.

**P2 — Stand up the health monitor (§4.5, #66/#67).** The org must notice its own idleness: wedged-PR age, cron-gap, zero-merge windows, strategist failures. Escalation must not depend on the PM being alive.

**P2 — Fix or delete the local human seam (§4.4).** Either drive `HumanRunner` from `substrate-local` (make `compileLocal` kind-aware) or remove it and mark the capability designed-not-built. A dead "built" claim is the expensive kind.

**P2 — State the "earn the abstraction" invariant (§I.5).** Fold the general "prove necessity live before generalizing" rule into the Constitution alongside "scripts only for security."

**P2 — Exercise a second substrate or second production profile (§4.11).** Drive `substrate-local` continuously (which forces §4.4) or take a second profile to fleet-merged.

## 7. What's genuinely good

- **The merge boundary is enforced in code, not convention** (`ir.ts:101-127`), scope-stripping included — and the least-privilege GitHub token is *derived from* declared capabilities (`emit.ts:254-277`), so the permission model and the org model are the same artifact.
- **The dogfood machinery is real and independently verifiable** — agent-authored PRs opened, reviewed, gated, and auto-merged with resolvable run IDs, including a merge→issue-close causal chain timed at 21 seconds. Most projects this age have nothing like it (§I.2).
- **`architecture-invariants.yml` — "no agent re-architects."** A human-owned, machine-readable invariant set the reviewer enforces on every change, completing the trilogy with no-agent-merges and no-agent-deploys. This is a genuinely novel governance mechanism and the first draft of this review missed it entirely.
- **Intellectual honesty is a cultural asset with teeth:** the `9369f93` skeptic-panel self-correction, the Built-vs-designed ledger, ⚠️/❌ gap-marking in VISION's own Terraform table, honest-degrade proofs where the agent *refuses to fabricate* a real-world act, and disclosed constraints ("accepted constraint" rows in the ledger). The gap in §I.1 is that this honesty isn't yet *mechanized* — but its existence is why mechanizing it will stick.
- **The proxy's budget layer survived adversarial review:** server-side clamps, atomic DO reservations, layered caps, purpose-clamped OIDC minting. The economic kill-switch is real.
- **"Declared vs realized"** for `kind:human` on GitHub (manifest entry, no job) is a clean, correct separation — the local-substrate gap (§4.4) is a realization bug, not a design flaw.
- **Derived-not-stored roadmap status** and **cost authority discipline** (proxy ledger over CLI estimate) are the right instincts, correctly implemented — and the strategist research loop demonstrably produces sourced roadmap items (the OpenHands/SWE-agent/DGM citations in `roadmap.yml`).

## Appendix: scope and method (as reviewed)

- **History:** 558 commits, 2026-06-16 → 2026-06-29 (14 days) + origin/main through 2026-07-05; authorship-regime forensics via co-author trailers and identity analysis; all revert arcs enumerated.
- **Core:** `packages/core/src/{ir,manifest,runner,upgrade,conformance}.ts` (read in full).
- **Substrates:** `packages/substrate-github/src/emit.ts` (540 lines, full read incl. permissions map, effect step, harden-runner), `packages/substrate-local` (kind-blindness grep-verified).
- **Profiles:** `hello` (7 commits), `self-driving` (102, flagship), `simple-sdlc` (17), `simple-gh-sdlc` (29), `soc2-baseline` (35, ungoverned vertical). All five `ir.yml`s conformance-checked.
- **Runtime/gates:** `open-autonomy-proof-audit.ts`, `human-approval-gate.ts`, `agent-propose.ts`, `provision-target-repo.ts`, the check chain; runtime mirror sync verified.
- **Proxy:** `index.ts`, `run-budget.ts`, `limit-ledger.ts` — budget/authz adversarially reviewed, no exploit found.
- **Proof:** `PROOF_LEDGER.md` (12 + 18 rows), 8 run IDs re-resolved via `gh api`/`curl` (7 exact, 1 rotted); public-flip visibility re-checked.
- **Live state:** 593 workflow runs, branch protection (app-pinning), PR/issue timelines on `volter-ai/open-autonomy`, 2026-07-05/06; PM cadence computed from 173 scheduled runs.
- **Method note:** this second pass ran five independent evidence sweeps — history, code, docs, live state, and a reviewer deliberately blinded to the first draft — and reconciled them. Where they disagreed with the first draft (packages/ commit count, evidence split 7/5 not 5/5, PM cadence, the "last human commit" framing, `HumanRunner`), this document follows the evidence.
