# Open Autonomy — External Architecture Review

**Reviewer:** external consultant (no involvement in prior design decisions)
**Date:** 2026-07-05
**Scope:** full repository read at branch `vision-constitution-roadmap` (off `main`, HEAD `e5e0ae5`): the `autonomy.ir.v1` core + two substrate compilers, the five profiles, the runtime scripts, the model proxy, the bench harness, the full docs corpus, and the *entire* 558-commit git history (2026-06-16 → 2026-06-29). Live-run claims were independently re-verified against the canonical `volter-ai/open-autonomy` repo and the external SOC2 proof repos via `gh api` and unauthenticated `curl`.

Every claim below cites a file (with line numbers where they matter), a commit hash, or a resolved run/PR. Line numbers are anchors as of this commit; treat them as such given the repo's velocity — this is a **14-day-old codebase** that has, since 2026-06-29, been merging its own commits unattended.

**Companion documents:** the distilled north star and hard invariants live in `VISION-AND-CONSTITUTION.md`; the concrete gap-closing plan, tracked as a burnable backlog, lives in the ztrack store (`.volter/tracker/`) with a human-readable index in `ROADMAP-DISTILLED.md`. This document is the *why*; those are the *what, in what order*.

---

## 1. Executive summary

Open Autonomy is a **standard, a proof, and a product wearing one repository.** The standard is `autonomy.ir.v1` (`packages/core/src/ir.ts`): a substrate-neutral IR that declares a software org — actors with a `kind` (agent/human), capabilities, triggers, and a policy box — which `compile(profile, substrate)` materializes into a running installation on GitHub Actions (`packages/substrate-github`) or a local scheduler loop (`packages/substrate-local`). The proof is `profiles/self-driving`: this repo's own `main` *is* a compiled installation of that profile, and — the single most impressive fact in the codebase — it is genuinely, verifiably self-driving. The product is `profiles/soc2-baseline`: an autonomous SOC2-compliance vertical that is the project's most intense recent work.

What this codebase does exceptionally well is rare and worth naming. **The dogfood is not aspirational.** The last human commit on `main` is `e5e0ae5` (2026-06-29); every commit landed since — PRs #117, #118, and the closes of planner-issues #114/#115 — was opened, reviewed, gated, and auto-merged by the fleet, with `pm` firing on its `*/30` cron to the minute and the full `ci` + `agent-review` + `human-approval` chain executing end-to-end (verified via `gh run list` and two resolved merge commits authored by `github-actions[bot]` co-authored by `volter-agent`). The merge boundary that makes this safe is not a convention but a **hard structural check in code** (`ir.ts:101-111`: no agent may hold `code:merge`, and no agent may hold both `code:propose` and `code:review`). The architectural intent is written down next to the code, the actor/kind model is clean, and the "declared vs realized" separation (a `kind:human` actor is declared in the manifest but emits no workflow job — `manifest.ts`) is a genuinely good idea, executed.

What would concern me most, advising this team — at the level of the *project*, not the code:

1. **The project's entire epistemology rests on "live proof is the only proof," but the gate that enforces it is a string-presence check that never touches the network.** `check:proof` (`scripts/open-autonomy-proof-audit.ts:77-117`) counts a proof gate as satisfied if the ledger row contains a backtick-quoted token matching `/^\d{8,}$/` — a fabricated eight-digit number passes identically to a real run ID. The doctrine's honesty is real but is currently **load-bearing on the prose author, not the tooling** (§I.1). This is the highest-leverage gap in the review: it is the one place the project's core value is asserted rather than mechanized.

2. **The repo is two projects, and only one is governed by the org's own machinery.** The org-as-code platform runs itself through strategist → planner → issue → fleet-PR (§I.2, and it demonstrably works). The SOC2 vertical — the last ~1.5 days and ~46 commits of the project's life — was built entirely *outside* that pipeline: every one of those commits is hand-authored by the operator, none went through the roadmap, none are exercised by bench, and the word "soc2" appears zero times in `CLAUDE.md`, `VISION.md`, `CONSTITUTION.md`, or `.open-autonomy/roadmap.yml` (§I.3). The most active part of the project is invisible to the project's own governance.

3. **The thing the Vision names as the bottleneck is the thing that isn't built.** `VISION.md:89-90` applies Theory of Constraints and concludes "Bench is the constraint." Bench is also, by the docs' own admission (`CLAUDE.md:200-207`, `VISION.md:113-122`), the leg with almost nothing built: the autonomy ratio, the self-calibrating twin, and the model-roleplay human simulators (H3/H4) exist as vocabulary, not implementation. Half the horizon roadmap is a glossary (§I.4).

4. **The doc layer has drifted off the code, and the two halves of the roadmap disagree with each other.** `docs/ROADMAP.md` (45KB) is a superseded "Phase 1–13" execution paradigm that never mentions seams, the twin, the autonomy ratio, or the actor-`kind` model; `.open-autonomy/roadmap.yml` + `VISION.md` are the current vocabulary, and the two artifacts disagree on what is "done" (§I.6). The map has diverged from the territory in a project whose entire pitch is that the map *compiles into* the territory.

5. **Premature abstraction is a demonstrated, recurring failure mode — and the project has already learned the lesson three times without stating it as a rule.** Inside week one, three whole subsystems shipped and were reverted wholesale: the IR "steps/ABI" model (`b664b86` "Revert the steps/ABI over-encoding (wrong premise)"), the `@open-autonomy/agents` package (`53f71e4` "agents were never a separate thing"), and the bundle/publisher dispatch cluster (`9397236`, plus a seven-commit "salt the legacy" cleanup ritual). The "scripts only for security" doctrine is the *special case* of a general principle — *prove necessity live before generalizing* — that the history keeps re-teaching but no doc yet states (§I.5).

None of these are fatal. The dogfood loop is real and the safety boundary is real; that is a stronger foundation than most projects this age have. But items 1–4 compound, and they compound *fastest* precisely because the fleet is now landing its own commits — an ungoverned fast lane and an unmechanized proof gate are cheap to fix at 14 days and expensive to fix once more profiles and more autonomous throughput are built on top of them.

---

# Part I — Holistic assessment: the bets, the split identity, and the epistemics

This part evaluates the decisions that don't live in any one file. Each is a judgment call the team has implicitly made; my job is to make it explicit, price it, and say what I'd do.

## I.0 The organizing thesis: a standard, a proof, and a product — and the proof is the moat

The right way to read this repository — and the yardstick most of Part I measures against — is as three distinct things that happen to share a git root:

- **The standard** — `autonomy.ir.v1`: the IR, the four-slot actor model, the capability catalog, the two substrate compilers, conformance. This is the *thing* per the Vision's own words: "everything else is an instance of it" (`VISION.md:10-14`). It is the most mature leg (`VISION.md:66-71` marks Standards "mature").
- **The proof** — `profiles/self-driving`: the claim that the standard is real because the repo runs *itself* on it. Marked "live" (`VISION.md:66-71`), and — uniquely among the three — that claim survives independent verification (§I.2).
- **The product** — `profiles/soc2-baseline`: a vertical application built *with* the standard. Not mentioned in the Vision at all, but the dominant recent effort (§I.3).

The most important strategic fact this framing surfaces: **the proof is the moat, not the standard.** A substrate-neutral IR for declaring an org is a reasonable idea, but it is an idea others can have. "This repository has merged N commits to its own default branch with no human in the loop for a week, behind a mechanically-enforced no-agent-merge boundary, and here are the resolvable run IDs" is a demonstration very few can make. The architecture should protect and deepen the proof leg above all — because it is the part with a defensible story, the part that validates the standard, and the part that is *already true* rather than designed.

Three things follow, and they are the spine of this review:

1. The proof leg's credibility rests entirely on the proof *tooling*, and that tooling is currently a string check (§I.1). Fixing it is the single highest-leverage move available.
2. The product leg (SOC2) is being built outside the proof leg's own governance, which both weakens the governance claim and forfeits the chance to make SOC2 itself a dogfood proof point (§I.3).
3. The Bench leg — the part that would let the project *measure* how good the proof is (autonomy ratio, throughput) — is unbuilt, so "how self-driving is it, really?" currently has no number (§I.4).

## I.1 "Live proof is the only proof" is honored in practice but not in tooling — the gate is a string-presence check

This is the most consequential architectural fact about Open Autonomy, because the project stakes its entire epistemology on it. The doctrine is stated everywhere — `CLAUDE.md:23-24` ("`live proof` is the only proof… unit tests and piecewise verification don't"), Constitution Rule 7 ("Testbed proof is part of done"), `SPEC.md:248-254` ("There are **no unit tests** of behavior"). The whole culture is built on it, and the culture *lives* it: the git history is full of live run IDs, and a skeptic panel caught and corrected a real overclaim (`9369f93`, see below). The doctrine is not lip service.

But look at the machine that is supposed to enforce it. `check:proof` runs `scripts/open-autonomy-proof-audit.ts`, and `auditProofLedger` (`:47-66`) marks a gate `present` iff a ledger table row for that gate id is textually `done` *and* `validatedEvidence` returns something non-empty. `validatedEvidence` (`:77-95`) accepts a backtick-quoted token as real evidence when `isRunId` matches it — and `isRunId` (`:115-117`) is exactly `/^\d{8,}$/`. **There is no `fetch`, no `gh api`, no network call anywhere in the file.** A hallucinated eight-digit number, a run ID from a deleted run, or a run whose conclusion was `failure` all pass identically to a real, green run. The one exception is a narrow guard that a cited `TEST_RUNS.md` file actually contains a run-URL-shaped string (`:97-107`) — which still never checks that the URL resolves.

The gap is not academic, and the recent history proves it. The entire SOC2/W12 proof block — `PROOF_LEDGER.md:23-58`, the subject of ~30 of the last commits — **is not in `.open-autonomy/roadmap.yml` at all** (`grep soc2 .open-autonomy/roadmap.yml` → zero hits), so `check:proof` never even sees it. And of the 23 gates that *are* in the roadmap, 11 are `proposed: true` and exempt by design, leaving 12 audited; of those, 5 (`retry-ci-failure`, `developer-context-review-fix`, `quality-review-repair`, `governance-maintainer-hold`, `release-dogfood`) cite only doc/skill *file paths*, so "proven" reduces to "the doctrine is written down." The honest, verifiable core is more like the five gates that cite resolvable run IDs (`operator-pause-resume`, `five-issue-dogfood`, `planner-creates-proof-gate-issues`, `scaffold-install-check`, `human-approve-merges-live`) — which I independently resolved and which do check out.

To the team's enormous credit, **where the claims are checkable, they are true.** I re-verified the W12 block independently: run IDs resolve on the external repos, the public/private visibility of the five flipped repos matches `e5e0ae5`'s claim exactly (with `soc2-noghas-proof` correctly still private), and the 5-merged-vs-6-open PR split in the "doctrine breadth" row matches the live GitHub API to the number. The correction in `9369f93` is real: it caught an overclaim ("11/13 controls proven end-to-end") that had conflated *drafter-stage honest-degrades* (PRs that correctly refuse to fabricate a real-world act, and so never merge) with *actually-merged, signed* proof, and rewrote it to "5 closed the full loop; 6 are drafter-stage degrades." That is exactly the immune system the doctrine is supposed to grow.

But an immune system made of one skeptical operator is not the same as an architecture. **The doctrine's guarantee today is "a human wrote something run-ID-shaped and, if you check, it usually resolves" — not "the run happened and was green."** For a project whose north star is being trusted to run itself, that is the load-bearing gap.

**Recommendation** (this is the P0 of the roadmap): make `check:proof` resolve its evidence. It should call `gh api` (or fetch) for each cited run ID / URL, confirm the run exists, belongs to the claimed repo, and concluded `success` (with the step-level nuance the ledger already documents — a run whose only failing step is the out-of-scope `GH013` effect step should be classifiable, not silently "failure"). Bring the SOC2/W12 gates *into* `roadmap.yml` so they are audited at all (this is also §I.3's fix). And add a red-team fixture to the audit's own test suite: a ledger row citing a fabricated run ID must make `check:proof` *fail*. Until that fixture exists, the project cannot claim its proof doctrine is mechanized — only that its operator is honest.

## I.2 The dogfood is real — protect it, and make its narrowness a measured fact, not a hidden one

The self-driving fleet genuinely drives this repo. I want to state that plainly because it is unusual and it is the project's best asset. The evidence (all independently resolved, not taken from the prose): `pm` runs every ~30 minutes to the minute on 2026-07-05/06 (its `cron: */30 * * * *`, `ir.yml:39`), each `success`; `developer` fires via `workflow_dispatch` from the PM's Runner seam; `reviewer`, `ci`, and `human-approval` all execute in the same window; two commits landed on `main` on 2026-07-05 (#117, #118) authored by `github-actions[bot]`; and two planner-originated roadmap issues (#114, #115) were closed by that pipeline the same day. The roadmap-status-is-derived doctrine holds: `roadmap.yml` carries no hand-written `done`, and status is computed at runtime from issue labels (`rollupRoadmapStatus`, `services/agent-model-proxy/src/github-sync.ts:107-135`).

Two caveats keep this honest, and both are architecture signals rather than nitpicks:

**The loop is real but not flawless.** In the observed window, `developer` had 2 failures out of 3 dispatches (2026-07-05 23:29), and the most recent *scheduled* `strategist` run (weekly cron) `failed` (2026-06-29). The loop recovers by doctrine (PM re-develop/escalate), but there is no standalone health monitor — the project's own open gap, issues #66/#67, "operator-observability" (`CLAUDE.md:205-207`). Escalation currently depends on the PM, so a PM outage is a single point of failure for the org's ability to notice it is stuck. This is the correct next hardening target for the proof leg.

**The loop is real but *narrow*, and its narrowness is invisible.** Every autonomous merge I found is a low-risk docs/spec fix (#117 "consistent catalog count in docs/SPEC.md"; #118 an `ir-developer` change). That is the right place to start, and the merge boundary is what makes even that safe. But "the fleet drives the repo" and "the fleet lands one-line doc fixes" are very different claims, and the architecture currently has no way to tell them apart — which is precisely the missing **autonomy ratio** (§I.4). The most valuable thing the proof leg could produce is not "it's self-driving" but "it autonomously closed X% of roadmap issues at risk-level Y this week, and here is the number." Right now that number cannot be computed, so the proof's *depth* is asserted at the same fidelity as its *existence*. Fixing that is a Bench task, and it is the reason Bench matters (§I.4).

## I.3 The repo is two projects; the SOC2 vertical is a governance escape hatch

The single sharpest structural finding of this review: **Open Autonomy's most active workstream is built outside Open Autonomy's own governance.** The org-as-code platform governs its work through the two-layer roadmap — strategist proposes layer-1 intents, planner decomposes them into `origin:roadmap-planner` issues, the fleet closes them, status is derived (this is real and observed, §I.2). The SOC2 vertical bypassed all of it:

- Every one of the ~46 SOC2 commits (2026-06-28/29) is hand-authored by the operator; `git log -i --grep=soc2 --format=%an | sort | uniq -c` → 46 `yueranyuan`, 0 `github-actions[bot]`. None went through strategist → planner → fleet.
- The word "soc2" appears **zero times** in `.open-autonomy/roadmap.yml`, `docs/ROADMAP.md`, `VISION.md`, `CONSTITUTION.md`, or `CLAUDE.md` (all confirmed zero-hit greps). The vertical is invisible to every governance and direction artifact the project owns.
- It has **zero bench integration** (`grep -rl soc2-baseline bench/` → nothing), so it is exercised by neither the fleet nor the eval harness — its proof lives entirely in the un-audited ledger section (§I.1) against ad-hoc external repos.
- Yet it is engineered with real rigor: disciplined semver 1.0.0 → 1.3.3 with a per-release adversarial "skeptic panel" finding actual bugs (`profiles/soc2-baseline/CHANGELOG.md`), and it is the *only* profile whose script is wired unconditionally into the root gate (`package.json:46`, `check:soc2-register` runs on every `bun run check`).

I want to be careful about what this does and doesn't mean. It is **not** evidence that the engine has narrowed into SOC2 — the core (`packages/`) took only 7 SOC2-driven commits versus ~220 lifetime touches, and `VISION.md` (last touched three days *before* SOC2 began) still describes the general H1–H5 platform. The narrowing is of *recent operator energy and doc volume*, not of the engine.

But it is a real architectural problem, because it demonstrates that **the org's governance is bypassable by the one person most able to bypass it** — and governance that the founder routes around under deadline pressure is governance that will not hold when the fleet, or a contributor, is under the same pressure. It also forfeits the single best opportunity the project has: SOC2-compliance-drafting is an *ideal* dogfood workload (high-stakes, well-specified controls, a clear "done"), and running it *through* the strategist/planner/fleet pipeline would be a far stronger proof of the platform than building it beside the pipeline by hand.

**Recommendation:** make a deliberate decision the docs currently make by omission. Either (a) ratify SOC2 as a first-class roadmap vertical — give it layer-1 intents in `roadmap.yml`, bring its proof gates under `check:proof`, and drive its next controls through the fleet — or (b) explicitly declare it an out-of-tree product built *on* Open Autonomy (the `volter-autonomy` commercial boundary `README.md:191-194` gestures at) and move it to its own repo so it stops being an ungoverned fast lane inside the platform. The one thing not to do is leave it where it is: the most active code in the repo, accountable to none of the repo's rules.

## I.4 Bench is named the constraint, and the constraint is a glossary

`VISION.md:89-90` is admirably direct: applying Theory of Constraints to the mission, "Standards is mature and Dogfood is live, so **Bench is the constraint.**" I agree with the diagnosis. The problem is that the constraint is also the least-built leg, and the gap between its vocabulary and its implementation is the widest in the project.

What Bench is supposed to deliver (`VISION.md:264-284`, H3/H4): per-seam velocity, cost, yield, rework, and an **autonomy ratio**; a self-calibrating **twin** that models throughput; **model-roleplay human simulators** so a human-in-the-loop org can be run unattended in the harness; competitive bench workloads. What is actually built, by the docs' own "Built vs designed" ledger (`CLAUDE.md:200-207`): essentially none of it — "the distributional/model-roleplay human simulators + the calibrated twin (H3/H4)" and "the producing-side typed seam graph (H4)" are marked "Still designed / NOT built." The bench harness that exists (`bench/`, `bin/bench.ts`) provisions disposable funded testbed cells and can drive/score them, but the *measurement layer* that would turn a run into an autonomy number does not exist.

This matters beyond tidiness because of §I.2: **without Bench, the project cannot measure how good its own proof is.** "Self-driving" is currently a binary the dogfood demonstrates; the interesting quantity — *how much* of the org's work is autonomous, at *what* risk level, with *how much* rework — is exactly what H3's autonomy ratio would compute, and it is unbuilt. The project has correctly identified its bottleneck and correctly declined to fake past it (the honesty is real), but the roadmap should reflect that Bench is not "underbuilt," it is *pre-built* — and that until it exists, every claim about the *degree* of autonomy (as opposed to its *existence*) is unfalsifiable.

**Recommendation:** treat the **autonomy ratio over a real dogfood window** as the first Bench deliverable and the forcing function for the rest. It is computable today from data the fleet already emits (issues closed by `github-actions[bot]` vs. by humans, labeled by risk via the existing `phase:`/`priority:`/`human-required` labels) — it does not need the twin or the simulators first. Shipping one honest number ("last 7 days: N of M roadmap issues closed autonomously, K at human-required risk") would do more for the proof leg's credibility than any amount of further self-driving, and it would make §I.2's narrowness a measured fact instead of a reviewer's observation.

## I.5 Premature abstraction is the recurring failure mode — name the principle the history keeps teaching

Read the first week of history and one pattern dominates the reverts: an abstraction shipped before its necessity was proven, then torn out. Three distinct subsystems, all inside days:

- **The IR "steps/ABI + universal envelope" model** — built over multiple commits (`3bde06f`…`a03c966`), then reverted wholesale: `b664b86` "Revert the steps/ABI over-encoding (wrong premise)," replaced by the simpler capability-vocabulary approach.
- **The `@open-autonomy/agents` package** — a whole package extracted so "compile reads agents from the package," shipped (`cf9699c`) and un-shipped inside roughly a day across three reverts culminating in `53f71e4` "remove the @open-autonomy/agents package — agents were never a separate thing."
- **The bundle/publisher dispatch cluster** — an early orchestration model excised in a seven-commit "salt the legacy" cleanup wave (`9397236` "delete the orchestration + bundle/publisher cluster," `f1990a9`, `4c34ff1`, `cabe759`, `a80af9b`, `507e0fe`, `4bb1946`).

The "salt the legacy" ritual is itself a second-order signal: docs and specs drifted out of sync with deleted subsystems often enough that the team named a recurring cleanup for it — which is the same doc-drift pathology as §I.6, seen from the code side.

The team already holds the right instinct in one specific form: "scripts only for security — never script what an agent can do" (`CLAUDE.md:29-38`). But that is the *special case*. The general principle the three reverts teach is broader: **prove a capability is needed by a live run before you build the abstraction that generalizes it.** The steps/ABI model, the agents package, and the publisher cluster were all abstractions built ahead of a proven need. Stating the general rule — call it "earn the abstraction" or fold it into the live-proof doctrine — would convert three expensive re-learnings into one written invariant, and it is the kind of hard-won constraint a Constitution exists to hold.

## I.6 The doc layer has drifted from the code, and the map is the product

Open Autonomy's entire pitch is that the declarative artifact *compiles into* the running system — the map *is* the territory. That makes doc drift not hygiene but a category error against the project's own thesis, and there is a clear instance of it.

`docs/ROADMAP.md` (45KB, 1131 lines) is written in a "Phase 1 → Phase 13" execution paradigm (Durable Decision Memory → Public OSS Readiness) with a `volter.agent.decision.v1` record schema. It **never mentions** seams, the twin, the autonomy ratio, human simulators, the H1–H5 horizons, or the actor-`kind` model — i.e., none of the current vocabulary of `VISION.md` and `SPEC.md`. Meanwhile `.open-autonomy/roadmap.yml` (the machine-readable roadmap the planner actually consumes, schema `open-autonomy.roadmap.v2`) largely mirrors the old phase numbering with newer H1/H3-aligned items grafted on (`actor-model-human-handoffs`, `bench-autonomy-ratio`). The two roadmap artifacts **disagree on what is done**: `ROADMAP.md:710-728` lists proof scenarios (`retry-ci-failure`, `head-changed-before-merge`, `workflow-edit-forbidden`) as outstanding, while `LIVE_TESTING_STRATEGY.md:116-143` treats the same scenarios as designed fixtures with full coverage rows.

The fix is not to rewrite `ROADMAP.md` — it is to **retire it.** There should be one canonical direction artifact (`.open-autonomy/roadmap.yml`, since it is the one the machine reads), with `VISION.md`/`CONSTITUTION.md` above it as the human-owned anchor, and the legacy `ROADMAP.md` either deleted or explicitly stamped "superseded — see roadmap.yml." A project that ships an install to other repos cannot carry two roadmaps that disagree; the drift will be inherited by every installation. This is a direct input to the distilled roadmap (the companion doc): reconcile the direction layer to a single source.

---

# Part II — Implementation-level findings

## 2. Architecture overview — the system as it actually exists

### 2.1 The IR and the compile pipeline

The core contract is small and clean. `AutonomyIR` (`ir.ts`) is `{ schema: 'autonomy.ir.v1'; targets: string[]; codeHost?: 'github'|'local-git'; agents: Record<string,IRAgent>; policy: IRPolicy; resources: string[] }`. An `IRAgent` is `{ behavior, capabilities, triggers, kind?, timeout?, review?, result? }` — note the docs' "four slots (behavior, capabilities, triggers, config)" is aspirational: there is **no per-agent `config`** (the type comment says so explicitly), only the profile-level `policy.box`. `compile(profile, substrate)` (`bin/autonomy-compile.ts`) parses the IR, branches to `compileGithub` or `compileLocal`, and `materialize`s a `CompileOutput = { generated: Record<path,content>; copies: {from,to}[] }` — an installation is exactly "files derived from the IR" plus "profile files (resources + skills) copied verbatim." `check:dogfood` enforces OA root == `compile(self-driving)` for all 57 managed files (verified: passes in this worktree).

### 2.2 The actor model and the merge boundary

The four-actor-slot model is realized as: `behavior` names a SKILL folder (prose doctrine), `capabilities` is pure authority (the core "never interprets what a capability does" — `SPEC.md:55-57`), `triggers` is cron|event|dispatch (only cron is portable/interpreted), and `kind` is agent|human. The **merge boundary is the one hard invariant enforced in code** (`ir.ts:101-127`): no `code:merge` on any agent; no agent holding both `code:propose` and `code:review`; and a `review:` edge must name an *independent* agent that actually holds `code:review`. The GitHub realization (`substrate-github/src/emit.ts`) maps capabilities → workflow permissions, emits the effect step (push → PR → arm auto-merge → dispatch ci+agent-review+human-approval, all retried), and injects the vendored `scripts/*` runtime.

### 2.3 The policy box

`IRPolicy = { maxConcurrent?; box: Record<string,unknown> }` (`ir.ts:61-67`) — deliberately untyped, "governance DATA the core carries verbatim and never interprets." In `self-driving/ir.yml` the box mixes concerns that should be distinguished: hard governance (`risk.human_required_paths`/`_topics`, `merge.*`), operational tuning (`autonomy.max_ci_retries`, `stale_needs_info_minutes`), and pure runtime infra (`gh-actions.proxy_host`, `model`, `bot_email`). Every sub-key is per-profile convention read by agreement, not schema — `simple-sdlc` omits `human`/`merge`/`planner`/`autonomy` entirely.

### 2.4 The two-layer roadmap and derived status

`.open-autonomy/roadmap.yml` (schema `open-autonomy.roadmap.v2`): a `direction:` prose anchor plus `items:` each carrying `id`, optional `phase`, `priority`, a mutually-exclusive `proposed:true`|`planned:true` lifecycle flag (no `status` field), `title`, `proof_gate`, `acceptance:`, and newer items an `intent:` paragraph. Layer-1 (strategist-owned) items become layer-2 GitHub issues (`origin:roadmap-planner` + `roadmap:<id>` labels, 1→many); execution status is *derived* at runtime by `rollupRoadmapStatus` (`github-sync.ts:107-135`), never stored. There is no TS schema for roadmap items — it is prose-interpreted YAML.

### 2.5 Control plane

The proxy (`services/agent-model-proxy/`, a Cloudflare Worker) gates all model spend (Durable Objects: per-run + global ledger, run slots), serves the funding storefront, and syncs the roadmap rollup. Its `consumed_usd_cents` is the authoritative cost, not the CLI's `total_cost_usd` (which mis-prices proxied models ~40×). deepseek-v4-flash runs cost cents; the binding per-run cap is `--max-requests`.

## 3. Inconsistencies

**3.1 "Four slots / config" — doc vs type.** `SPEC.md` and `CLAUDE.md` describe a per-agent `config` slot; `ir.ts` has none (only `timeout`/`kind`/`review`/`result` and the profile-level `policy.box`). The doc names a field that does not exist.

**3.2 Two roadmaps that disagree.** `docs/ROADMAP.md` (Phase 1–13 legacy) vs `.open-autonomy/roadmap.yml` (v2, current) — different vocabulary, different "done" claims (§I.6).

**3.3 The proof doctrine vs the proof tooling.** "Live proof is the only proof" (culture) vs a string-presence audit with no network verification (`open-autonomy-proof-audit.ts`, §I.1).

**3.4 Governance-by-pipeline vs the SOC2 hand-lane.** The org's stated method is strategist→planner→fleet; its most active workstream used none of it (§I.3).

**3.5 `targets` naming churn.** The substrate was renamed `github`→`gh-actions` with an alias kept (`c0bb771`/`d637284`); docs and `ir.yml` mix the two (`self-driving/ir.yml` uses `gh-actions`, prose often says "github"). The runner-vs-codeHost distinction (`codeHost` orthogonal to `targets`) is correct in code but easy to conflate in the docs.

**3.6 Bench status: "underbuilt" vs "not built."** `VISION.md` calls Bench "underbuilt — the bottleneck"; the "Built vs designed" ledger marks its H3/H4 core "NOT built." Those are different claims about the same leg (§I.4).

## 4. Gaps

**4.1 No network verification in the proof gate** (§I.1) — the highest-priority gap; the audit cannot distinguish a real green run from a fabricated ID.

**4.2 The SOC2 proof block is unaudited** — `PROOF_LEDGER.md:23-58` is not in `roadmap.yml`, so `check:proof` never sees ~30 commits' worth of the project's most-cited evidence (§I.1/§I.3).

**4.3 No autonomy ratio / measurement layer** — the project cannot compute how autonomous it actually is (§I.2/§I.4).

**4.4 No standalone health monitor** — escalation depends on the PM; a PM outage is a single point of failure for the org noticing it is stuck (issues #66/#67, `CLAUDE.md:205-207`).

**4.5 Bench measurement (H3) and simulators/twin (H4)** — the named bottleneck is unbuilt (§I.4).

**4.6 Single substrate proven in anger.** `substrate-local` has exactly one recorded run ever (`agent-sessions/run_793dd0df-…`, 2026-06-17, a one-off smoke test); all real driving is GitHub Actions. Substrate-neutrality is a design claim with one substrate actually exercised. The Vision's "prove against a second real substrate (GitLab)" is unstarted.

**4.7 Only one profile is fleet-exercised.** `self-driving` is the only profile with autonomous fleet-merged commits; `simple-sdlc`/`simple-gh-sdlc` are portability proofs run by hand, `hello` is an intentional demo, `soc2-baseline` is proven outside the harness. "Many profiles" is currently one production profile plus samples.

## 5. Technical debt / risk hotspots

**5.1 `scripts/open-autonomy-proof-audit.ts` (134 lines) is a security-relevant gate that gives false assurance.** It is the enforcement point for the project's core doctrine, and it verifies syntax, not facts (§I.1). Debt here is worse than absence, because a passing `check:proof` *reads* as "the runs are real."

**5.2 The `policy.box` is a typeless grab-bag.** Hard invariants (`risk.human_required_paths`) and cosmetic config (`bot_email`) share one untyped `Record<string,unknown>`. A typo in a risk path silently disables a human-required gate with no validation error. This is the layer most in need of at least a validated sub-schema for the safety-relevant keys.

**5.3 `docs/ROADMAP.md` (45KB) is superseded but live.** It is in `INSTALL_OWNED_PATHS`, so every installation inherits a legacy roadmap that contradicts the current one (§I.6).

**5.4 The SOC2 vertical wired into the root gate.** `check:soc2-register` runs on every `bun run check` for the whole monorepo (`package.json:46`) — a single profile's demo script gating the entire repo's CI, coupling core build health to a vertical's internals.

**5.5 Strategist reliability.** The weekly strategy sweep's most recent scheduled run `failed` (2026-06-29); the cadence is real but its unattended reliability is unproven, and it is the top of the roadmap-generation funnel.

**5.6 Process risk visible in the history.** Three built-then-reverted subsystems and a seven-commit cleanup ritual in week one (§I.5) — velocity is high and the abstraction-discipline is learned-by-revert, not yet stated.

## 6. Room for improvement — concrete, prioritized

**P0 — Mechanize the proof doctrine (§I.1).** Make `check:proof` resolve every cited run ID/URL via `gh api`, assert existence + repo-match + `success` conclusion (with documented step-level exceptions), and add a red-team test that a fabricated ID *fails* the audit. Bring the SOC2/W12 gates into `roadmap.yml` so they are audited at all. *This is the one change that converts the project's central value from asserted to enforced.*

**P0 — Decide the SOC2 vertical's governance (§I.3).** Either ratify it into `roadmap.yml` and drive its next controls through the fleet, or spin it out to its own repo as a product built on OA. Do not leave the most active workstream ungoverned.

**P1 — Ship one autonomy-ratio number over a real window (§I.4/§I.2).** Compute it from data the fleet already emits; publish it in the proof ledger. Makes the proof's *depth* measurable, not just its *existence*.

**P1 — Reconcile to one roadmap (§I.6).** Retire or stamp `docs/ROADMAP.md` "superseded"; make `.open-autonomy/roadmap.yml` the single direction source; fix the "done" disagreements.

**P1 — Validate the safety-relevant policy keys (§5.2).** A sub-schema (or `validateIR` extension) for `risk.*` and `merge.*` so a mistyped human-required path fails compile instead of silently disarming a gate.

**P2 — Stand up the health monitor (§I.2/#66/#67).** So escalation does not depend on the PM being alive.

**P2 — State the "earn the abstraction" invariant (§I.5).** Fold the general "prove necessity live before generalizing" rule into the Constitution alongside "scripts only for security."

**P2 — Exercise a second substrate or a second production profile (§4.6/4.7).** Either drive `substrate-local` continuously, or take a second profile to fleet-merged, to make substrate-neutrality and multi-profile more than a design claim.

## 7. What's genuinely good

- **The dogfood is real and independently verifiable** — a week of agent-authored merges behind a mechanically-enforced boundary is the project's moat and most projects this age have nothing like it (§I.2).
- **The merge boundary is enforced in code, not convention** (`ir.ts:101-127`) — the one hard invariant that matters most is the one they hardened structurally.
- **"Declared vs realized"** — a `kind:human` actor declared in the manifest with no emitted job (`manifest.ts`) is a clean, correct separation that makes human simulation and the human seam coherent.
- **The IR core is small and disciplined** — it validates spec-validity and wires, and refuses to interpret capabilities; that restraint is why the actor model stays clean.
- **Intellectual honesty is a cultural asset** — the `9369f93` skeptic-panel self-correction, the explicit "Built vs designed" ledger, and the ⚠️/❌ gap-marking in `VISION.md` show a team that flags its own overclaims. The gap in §I.1 is that this honesty isn't yet *mechanized* — but that it exists at all is the reason the mechanization is worth building.
- **Derived-not-stored** roadmap status and the cost-authority discipline (proxy ledger over CLI estimate) are the right instincts, correctly implemented.

## Appendix: scope inventory (as reviewed)

- **History:** 558 commits, 2026-06-16 → 2026-06-29 (14 days); eras A–L reconstructed from `git log --reverse`.
- **Core:** `packages/core/src/{ir,manifest,runner,upgrade,conformance}.ts`.
- **Substrates:** `packages/substrate-github/src/emit.ts` (540 lines), `packages/substrate-local`.
- **Profiles:** `hello` (7 commits, demo), `self-driving` (102, flagship/live), `simple-sdlc` (17, local portability), `simple-gh-sdlc` (29, soc2 base), `soc2-baseline` (35+, ungoverned vertical).
- **Runtime/gates:** `scripts/open-autonomy-proof-audit.ts`, `bin/{autonomy-compile,check-dogfood}.ts`, `package.json` check chain.
- **Proof:** `docs/PROOF_LEDGER.md` (58 rows), `docs/LIVE_TESTING_STRATEGY.md`; run IDs / PR states re-resolved via `gh api` + `curl`.
- **Docs:** VISION, CONSTITUTION, PROJECT, ARCHITECTURE, SPEC, ROADMAP, standards/*, SOC2-*.
- **Live state:** `gh run list` on `volter-ai/open-autonomy` and the external SOC2 proof repos, 2026-07-05/06.
