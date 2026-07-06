# OA-1 Open Autonomy — Distilled Roadmap (gap-closing backlog)

assignee: yueranyuan

**Status:** derived from `ARCHITECTURE-REVIEW.md` §6 (second pass, 2026-07-05) and `VISION-AND-CONSTITUTION.md` Part B.4.
**Tracking:** this file is a ztrack document source (materialized via `ztrack import`); the backlog is burnable via `ztrack` like the termfleet/volter-twin backlogs.
**Relationship to `.open-autonomy/roadmap.yml`:** each item below is written to slot into the real `open-autonomy.roadmap.v2` schema — the **roadmap.v2 slot** line names the layer-1 `id` and `proof_gate` it should carry when ratified into the machine roadmap. Until then this is the reviewer's recommended plan, not the org's ratified one (ratification is human, per the two-layer model).

Priorities: P0 = fix before building more on top; P1 = the next tranche; P2 = hardening/expansion.

---

## OA-2 Mechanize the proof doctrine: check:proof must resolve its evidence

assignee: yueranyuan

Priority: P0. Evidence: review §I.1; `scripts/open-autonomy-proof-audit.ts:77-117` (string-presence only, `/^\d{8,}$/`, no network call anywhere in the repo); 7 of 12 audited gates cite only file paths; `PROOF_LEDGER.md:23-58` (18 SOC2 rows orphaned from the audit); the `operator-pause-resume` citation already rotted (testbed repo 404).

The project's central value — "live proof is the only proof" — is currently guaranteed by the operator's honesty, not the tooling. Make the machine enforce it.

roadmap.v2 slot: id `proof-gate-mechanization`, proof_gate `proof-audit-resolves-evidence`.

### Acceptance Criteria

- [ ] dev/01 v1 `check:proof` resolves every cited run ID / run URL via the GitHub API and asserts: the run exists, belongs to the claimed repo, and concluded `success` (with a documented mechanism for step-level exceptions such as the out-of-scope GH013 effect step).
- [ ] dev/02 v1 A red-team fixture exists and runs in CI: a ledger row citing a fabricated (well-formed but nonexistent) run ID makes `check:proof` FAIL.
- [ ] dev/03 v1 The 18 SOC2/W12 ledger gates are represented in `.open-autonomy/roadmap.yml` (or an included gate list) so `check:proof` audits them at all.
- [ ] dev/04 v1 Evidence perishability is handled: a gate whose evidence lives on a disposable testbed cell must also cite a durable artifact (committed transcript/archived log), enforced at audit time.
- [ ] dev/05 v1 File-path-only evidence is downgraded: a non-proposed gate whose evidence cites only doc/skill paths is reported (warn or fail) so "the doctrine is written down" can no longer read as "proven."

## OA-3 Decide the two-lanes question: ratify develop-oa-through-oa and place SOC2

assignee: yueranyuan

Priority: P0. Evidence: review §I.3 (46 SOC2 commits, 100% operator, direct-pushed ungated; fleet lane 0 merges 06-25→07-05; `develop-oa-through-oa` at `.open-autonomy/roadmap.yml:166-175` is `proposed: true` — acknowledged, unratified); `README.md:191-194` (volter-autonomy boundary is prose only).

The org's real output flows through a lane its governance never sees. This is a decision item, not a build item — the docs currently decide by omission.

roadmap.v2 slot: ratify existing id `develop-oa-through-oa` (flip `proposed` → `planned`), proof_gate `oa-feature-shipped-by-pipeline`; plus a recorded SOC2 placement decision.

### Acceptance Criteria

- [ ] dev/01 v1 `develop-oa-through-oa` is ratified to `planned` in `.open-autonomy/roadmap.yml` with its proof gate live (a canonical-repo feature authored, reviewed, and merged by the pipeline end-to-end).
- [ ] dev/02 v1 The operator direct-push lane has a written charter (bootstrap/emergency scope, evidence-cited), stated in CLAUDE.md or the Constitution, so the lane is declared rather than implicit.
- [ ] dev/03 v1 A recorded decision places soc2-baseline: EITHER layer-1 SOC2 intents in `roadmap.yml` with gates under `check:proof` and the next control shipped through the fleet, OR the vertical moved out-of-tree with the commercial boundary made real.
- [ ] dev/04 v1 `check:soc2-register` no longer gates the whole monorepo root check unconditionally, OR the decision doc explicitly justifies why it should (`package.json:46`).

## OA-4 Ship the autonomy ratio over a real dogfood window

assignee: yueranyuan

Priority: P1. Evidence: review §I.4/§I.2; crude ratio already computed by this review: 8 of 16 closed `origin:roadmap-planner` issues bot-closed (50%); ~0% of recent commit volume; `bench-autonomy-ratio` exists as `proposed` (`roadmap.yml:156-165`).

The first Bench deliverable and the forcing function for H3. Computable today from labels and issue timelines — no twin, no simulators required.

roadmap.v2 slot: ratify existing id `bench-autonomy-ratio`, proof_gate `autonomy-ratio-from-live-run`.

### Acceptance Criteria

- [ ] dev/01 v1 A script/agent computes, over a stated window: issues closed autonomously vs by humans (timeline-actor based), PRs merged by lane (gated fleet vs operator direct-push), and commit volume by lane.
- [ ] dev/02 v1 The number is published in `docs/PROOF_LEDGER.md` (or a linked artifact) on a recurring cadence, with the computation cited so it is reproducible.
- [ ] dev/03 v1 The published metric distinguishes count-based and volume-weighted ratios, and labels risk level (human-required vs routine), so narrowness is visible rather than averaged away.

## OA-5 Close the merge boundary's deployed soft spots

assignee: yueranyuan

Priority: P1. Evidence: review §4.6-4.9 — `agent-review` unpinned on live main (`app_id: null` vs 15368 for ci/human-approval); policy.box typo → `emit.ts:522-523` → `[]` → `human-approval-gate.ts:130-135` auto-passes everything; `@scope` stripped by all consumers (`emit.ts:264-266`, `agent-propose.ts:83` stages `git add -A`); egress guard opt-in on private repos (only soc2-baseline sets `private_egress_guard`).

The boundary as deployed must be as strong as the boundary as compiled (`validateIR` is solid; the realization leaks).

roadmap.v2 slot: id `deployed-boundary-hardening`, proof_gate `boundary-softspots-closed`.

### Acceptance Criteria

- [ ] dev/01 v1 The `agent-review` required check is app-pinned on canonical `main`, and `provision-target-repo.ts` pins it for every new install (or a recorded decision documents why the permission split suffices without pinning).
- [ ] dev/02 v1 `validateIR` (or the compiler) validates the safety-relevant `policy.box` keys: a misspelled `risk.human_required_paths`/`merge.*` key fails compile instead of silently disarming the human-approval gate; a fixture proves the typo case fails.
- [ ] dev/03 v1 Capability `@scope` suffixes are either enforced (effect step refuses changes outside scope) or removed from profiles and docs — no fake restrictions.
- [ ] dev/04 v1 Private-repo installs get enforced egress by default (`private_egress_guard` default-on or harden-runner block-mode equivalent), or the fail-open behavior is loudly declared in the install output.
- [ ] dev/05 v1 soc2-baseline declares a `kind:human` actor to pair with its `policy.box.human` + human-approval gate, matching the self-driving pattern (review §3.8).
- [ ] dev/06 v1 The hold-label vocabulary has ONE source of truth (audit §1.1): `merge.maintainer_block_labels` is read by `rearm-auto-merge.ts` and injected into the pm/reviewer skills; the `agent-blocked`-on-a-green-PR case (declared block label, auto-merge re-armed anyway) is fixed and fixtured.
- [ ] dev/07 v1 `agent-develop-only` has a decided owner (audit §1.2 — cleanest: the human-approval gate treats it like `human-required`), the other two components (reviewer doctrine, bench scenario) are aligned to that decision, and the `governance-develop-only` scenario passes live.
- [ ] dev/08 v1 The human-approval gate's `author_association` fast path no longer lets a read-only COLLABORATOR's Approve qualify (audit §1.3) — maintainership is decided by the repo-permission lookup the gate already implements.

## OA-6 Reconcile the doc layer to one truth

assignee: yueranyuan

Priority: P1. Evidence: review §I.6 — `docs/ROADMAP.md:722-725` vs `LIVE_TESTING_STRATEGY.md:118-141,257-267` disagree on the same four fixtures; SPEC.md self-contradicts (config slot :119-130 vs :710-720; sync Runner :195-206 vs async :604-610; `actors:` :72 vs `agents:` in code); CLAUDE.md:121 + ARCHITECTURE.md:109-110 teach the retired four-slot model; dead refs to AUTONOMY-IR.md in CONSTITUTION/PROJECT/VISION; ARCHITECTURE.md doc map lists 8 of 15 docs; CLAUDE.md's Built ledger falsely marks HumanRunner built; README names 4 of 5 profiles.

A spec-first project whose spec disagrees with itself decays in days. One sweep, then a drift check.

roadmap.v2 slot: id `doc-layer-reconciliation`, proof_gate `one-canonical-direction-artifact`.

### Acceptance Criteria

- [ ] dev/01 v1 `docs/ROADMAP.md` is retired or stamped "superseded — see .open-autonomy/roadmap.yml" and removed from what installs inherit as live direction.
- [ ] dev/02 v1 SPEC.md's three internal contradictions are fixed (config slot, Runner sync/async, `actors:` example) and `review?`/`result?`/`codeHost` are documented in the IR section.
- [ ] dev/03 v1 CLAUDE.md and ARCHITECTURE.md no longer teach the four-slot/config model; the Built-vs-designed ledger's HumanRunner entry is corrected to designed/not-built (or the code is fixed first — see the local human seam item).
- [ ] dev/04 v1 Dead cross-references (AUTONOMY-IR.md, PUBLIC_AGENT_PRODUCTION_ROLLOUT.md) are fixed; ARCHITECTURE.md's doc map covers the actual docs/ contents; README names all five profiles.
- [ ] dev/05 v1 Doctrine cites only mechanisms that exist (audit §3): the `policy.box.human.*` paths in pm/maintainer skills match the flattened manifest (`policy.human.*`); strategist dedup keys on the `strategist/**` branch prefix instead of the never-applied `origin:strategist` label; the developer skill's provenance claim distinguishes compiled files from install-owned ones (`AGENTS.md` and top-level `docs/*` are NOT regenerated); the reviewer/maintainer `wrangler.toml` claim and the gate's "merge-sensitive defaults" comment are corrected; the strategy rubric's governance-respect wording admits retirements and planner edits.
- [ ] dev/06 v1 Every `policy.box` key is machine- or prompt-consumed or deleted (audit §2: 9 dead keys incl. the triplicated `human_required_topics`); the dead `skills/open-autonomy-upgrade/` dir is removed; the stale `AGENTS.md` profile seed is refreshed from root (it still ships the dead `open-autonomy-*` glob); the unshipped maintainer skill is shipped or its dangling manifest reference dropped (audit §4.3); self-driving ships a `provision.json` seed or the INSTALL_OWNED entry is annotated as optional (audit §4.4).

## OA-7 Stand up the org health monitor (the org must notice its own idleness)

assignee: yueranyuan

Priority: P2. Evidence: review §I.2/§4.5 — 10-day zero-merge window invisible to ~170 green PM runs; 4 dependabot PRs BLOCKED 10-11 days untouched; weekly strategist run failed 06-29 unnoticed; PM real cadence ~60min vs declared 30; issues #66/#67 open, human-required.

Escalation currently depends on the PM being alive and attentive; nothing watches the watcher.

roadmap.v2 slot: ratify existing id `operator-observability` extension (or new id `org-health-monitor`), proof_gate `health-monitor-detects-stall`.

### Acceptance Criteria

- [ ] dev/01 v1 A monitor independent of the PM detects and surfaces: wedged-PR age past threshold, zero-merge windows, failed scheduled runs (strategist/planner), and cron-gap anomalies.
- [ ] dev/02 v1 Detection produces an out-of-band signal a human actually receives (issue + notification path), proven by a live stall fixture.
- [ ] dev/03 v1 The wedged dependabot PRs (#109/#110/#112/#113 class) are triaged by the fleet or explicitly routed human-required — the current 10-day silent wedge cannot recur silently.

## OA-8 Fix or delete the local human seam (HumanRunner)

assignee: yueranyuan

Priority: P2. Evidence: review §4.4 — `HumanRunner` (`packages/core/src/runner.ts:93-140`) imported only by its own test; `packages/substrate-local/src/emit.ts` never reads `agent.kind`; compiling self-driving (`targets: [gh-actions, local]`, maintainer `kind:human`) to local would produce an AI-launchable "maintainer" prompt; `bin/check-profiles.ts` is structural-only so CI cannot see it.

A false "built" claim in the project's own honesty ledger. Either realize the design or retract the claim.

roadmap.v2 slot: id `local-human-seam`, proof_gate `local-kind-human-parked-not-launched`.

### Acceptance Criteria

- [ ] dev/01 v1 `compileLocal` is kind-aware: a `kind:human` actor produces no AI launch prompt and no AI-invocable skill copy; `HumanRunner` (park, never auto-complete, external act marks done) is actually driven by the local scheduler — or `HumanRunner` is deleted and CLAUDE.md's Built ledger is corrected.
- [ ] dev/02 v1 A check (unit or conformance) asserts the kind-aware behavior so the regression class is CI-visible.
- [ ] dev/03 v1 If fixed: proven by a local-substrate live run where a human task parks and resumes on an external act.

## OA-9 State the "earn the abstraction" invariant (human amendment)

assignee: yueranyuan

Priority: P2. Evidence: review §I.5 — five built-then-reverted arcs in week one: v0 OSS-kit (215 files, 06-16→22), steps/ABI (`b664b86`), agents package (`53f71e4`), publisher cluster (`9397236` + 6), plus 21- and 28-minute micro-reverts; the reconcile-script deletion showing the special case ("scripts only for security") already self-enforcing.

This is a Constitution amendment — human-owned, so this item is drafting + proposing, never auto-merging.

roadmap.v2 slot: id `earn-the-abstraction-invariant`, proof_gate `constitution-amendment-ratified`.

### Acceptance Criteria

- [ ] dev/01 v1 A proposed amendment to `docs/CONSTITUTION.md` states the general rule (prove a capability is needed by a live run before building the abstraction that generalizes it), citing the revert history as rationale.
- [ ] dev/02 v1 The amendment lands via the human-required path (maintainer approve on `docs/CONSTITUTION.md`), demonstrating the self-protecting amendment rule in the process.

## OA-10 Exercise a second substrate or a second production profile

assignee: yueranyuan

Priority: P2. Evidence: review §4.11 — substrate-local has one recorded run ever (2026-06-17); only self-driving has fleet-merged commits; the Vision's GitLab forcing-function (`VISION.md:279`) is unstarted.

Substrate-neutrality and multi-profile are n=1 design claims until a second instance runs in anger.

roadmap.v2 slot: id `second-substrate-or-profile`, proof_gate `second-instance-fleet-merged`.

### Acceptance Criteria

- [ ] dev/01 v1 EITHER substrate-local runs a profile continuously for a stated window (which forces the local human seam fix), OR a second profile reaches fleet-merged commits on a real repo.
- [ ] dev/02 v1 The run's evidence is recorded under the mechanized `check:proof` (this item deliberately depends on the P0).

## OA-11 Adopt ztrack as the typed tracker under the self-driving profile

assignee: yueranyuan

Priority: P1. Evidence: `ZTRACK-INTEGRATION.md` (the design); `SDLC-ASSESSMENT.md` §4 (no verification of done below the merge boundary — an issue's "done" is only "the PR merged"); review §I.1 / OA-2 (the proof layer needs exactly ztrack's evidence model); `architecture-invariants.yml` `substrate-is-runner-only` names ztrack as profile-layer methodology, which fixes the placement.

"Done is earned, not declared" at the issue layer: the planner writes checkable acceptance criteria, the developer must cite real commits + evidence, `ztrack check` gates the PR in ci, and the reviewer consumes the oracle instead of re-deriving it from prose. Profile layer ONLY (skills, ci.yml resource, policy.box, package.json seed) — zero ztrack in `packages/*`.

roadmap.v2 slot: id `ztrack-typed-tracker`, proof_gate `issue-done-earned-live`.

### Acceptance Criteria

- [ ] dev/01 v1 Phase 0 live proof on the testbed: one issue authored in the checkable grammar, one developer run drives it green through the shipped loop, and the red→green fixture (fabricated SHA → `ztrack check` exit 1 → real SHA → exit 0) is recorded as the gate's evidence.
- [ ] dev/02 v1 Phase 1 profile wiring lands via the gated lane: planner/developer/reviewer skill doctrine (author ACs in the grammar / `ztrack ac patch` + check green before finish / cite the oracle in the verdict), a `ztrack check` step in the profile's `ci.yml`, and ztrack as a dev-dep in the profile's `package.json` seed.
- [ ] dev/03 v1 The tracker runs in linked-sync mode — GitHub Issues remain the single source of truth, the tasks seam and `roadmap:<id>` choreography are unchanged, tracker runtime state stays gitignored.
- [ ] dev/04 v1 The preset is governed as a measuring stick: `.volter/tracker-config.json` + `.volter/tracker/validation/**` are added to `risk.human_required_paths`, so agents propose rule changes and a maintainer ratifies them.
- [ ] dev/05 v1 A recorded phase-3 decision (with the phase-1 live window's data) on arming `ztrack loop` for the developer job, based on whether PM re-dispatch cycles are the dominant waste.

