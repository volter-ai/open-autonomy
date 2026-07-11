# OA One-Shot Agent-Assisted Install — Implementation Task List (builder-ready)

**For the implementer.** This is the sequenced build plan for the one-shot, agent-assisted OA install designed in `OA-AGENT-ASSISTED-INSTALL-DESIGN.md` (same directory; call it **DESIGN**). Each task is self-contained: **scope · acceptance (live proof) · provenance (DESIGN section + OA `file:line`) · deps/order**. You should not need to re-derive the design. Read DESIGN §Q0 (the two-layer architecture), §Q1 (the per-profile maturity ladders), and §Q3 (the seven-phase flow) once for orientation, then execute tasks in dependency order.

**Two-layer shape (read first — it organizes every track).** The install system is **one common scaffold that specializes per profile via a declarative `SetupPack`** (DESIGN §Q0). Do **not** build three installers.
- **Layer 1 — common scaffold (profile-agnostic):** Track S (the `SetupPack` interface), Track D (recommender), Track B (`oa maturity` composer + `install.json`), Track C (audit shell), Track G (provider bring-up), Track E (the phase-spine install agent), Track F (M6 signal), plus the distribution/vision-gate enablers (Track 0 / TA.1). These read the pack; they never branch on profile name.
- **Layer 2 — per-profile setup packs (Track P):** one `SetupPack` per profile supplying `{targets, codeHost, roster, landing_mode, required_checks, enforce_admins, labels, board_seed_recipe, direction_spec, human_gates, maturity_signals, extra_rungs, terminal_stage}`. **Each profile's setup system and maturity ladder IS its pack.** The one field that must be *declared* (not reverse-engineered) is `landing_mode ∈ {auto-merge, manual-after-review, pr-free}`.
Evidence that this is viable (not forced): `findings-G-common-scaffold.md` — the substrate machinery is already profile-blind and pr-141 performed the doctrinal convergence (`profiles/self-driving/ir.yml:8-12`#pr-141).

**Handoff context.** The implementer is the `supercode-oa-selfdev-study` session (built PRs #137–#141), which has the deepest OA context. This list assumes that background but stays explicit.

**Conventions.**
- Repo: `volter-ai/open-autonomy`. Build on feature branches off `main`; one PR per task (or per small task cluster). OA doctrine: agents propose via gated PRs; `bun run check` must pass; `check:dogfood` enforces root == `compile(self-driving)` — regenerate root via `bun scripts/open-autonomy-upgrade-cli.ts` after any `profiles/self-driving/**` edit, never hand-edit generated copies (`CLAUDE.md`).
- **Live proof required per task** (OA rule: "live proof is the only proof"). Unit tests are necessary but not sufficient where a task has a runtime surface — drive the real command against a real compiled install.
- Env trap: `export NODE_ENV=development` before `bun install`/tests (production trips the ztrack/tooling no-op; `bin/preflight.ts:66-68`).
- Where a task's home is the `@volter/oa` CLI (`packages/local-runner-cli/`, from #140) or the `documents.roles` IR (from #138), that PR must be merged first — noted per task.

**Legend.** `⟶` = depends-on. `[BUILT-ON]` = requires an in-flight PR merged. `[JUDGMENT]` = agent/skill (prose), not a deterministic script — per `CLAUDE.md` "never script what an agent can do; scripts justified only by security."

---

## Track 0 — Preconditions (not code you write; verify/unblock first)

### T0.1 — Fix distribution: publish `open-autonomy` 0.4.2 **and** resolve `@volter/oa`  `[owner/release-gated, human_required]`
- **Scope:** Two distribution gaps. (a) `latest` npm dist-tag is `0.4.1`, which crashes on `compile` (missing `dist/egress-guard.sh`); `0.4.2` is only an in-repo bump (#131), never `npm publish`ed. (b) **`@volter/oa` (the CLI Phases 4–6 call as `oa …`) is `"private": true`, v0.0.0, unpublished** — publishing `open-autonomy` does NOT ship it. Resolve (b) by publishing/vendoring `@volter/oa` **or** pinning the **source-checkout** path as canonical (which every real install actually used).
- **Acceptance:** `npm view open-autonomy version` ≥ `0.4.2` and `npx open-autonomy@latest compile hello local /tmp/oa-smoke` exits 0; AND `oa --help` resolves from the chosen distribution (published bin or a documented source-checkout invocation).
- **Provenance:** DESIGN build-plan #1 + hardening #6; `OA-SETUP-FEASIBILITY.md` Critical Caveat; `README.md:7-9`; `findings-E` (`@volter/oa` private/unpublished); verified `npm view open-autonomy dist-tags` → `{latest:0.4.1}`.
- **Order:** FIRST. Blocks every task whose acceptance invokes `npx open-autonomy` or `oa …`. A source-checkout path (`bun bin/autonomy-compile.ts` + `bun packages/local-runner-cli/src/bin/oa.ts`) can proceed for dev/proof, but the shipped install agent must not depend on the broken registry.

### T0.2 — Land #137–#141 on `main`
- **Scope:** The design builds on: #138 (`documents.roles` IR + auto-gate + preflight file-check), #140 (`@volter/oa` CLI incl. `eligibility.ts`, `oa doctor/status`), #137 (simple-gh `audit` skill), #139 (planners), #141 (self-driving on the sdlc core + its `provision.json`). These are OPEN PRs at time of writing.
- **Acceptance:** `git grep -l "documents" packages/core/src/ir.ts` shows the role map; `packages/local-runner-cli/` exists on main; `profiles/simple-gh/skills/audit/SKILL.md` exists; `profiles/self-driving/provision.json` exists.
- **Provenance:** `findings-E-prs-137-141.md`.
- **Order:** Before Tracks A/B/C/E tasks marked `[BUILT-ON …]`.

---

## Track S — The two-layer seam (the `SetupPack` interface + per-profile packs)  `[build early; Tracks B/D/E all read it]`

### TS.1 — Define + validate the `SetupPack` schema (common scaffold's input contract)
- **Scope:** Add a `packages/core`-validated schema `SetupPack = {targets, codeHost, roster:[...], landing_mode: 'auto-merge'|'manual-after-review'|'pr-free' (exactly 3 — human-approval is a required_check, NOT a mode), required_checks?:[...], check_realizations?:[{check, via:'propose_dispatch_checks'|'authored-workflow'|'native'}], enforce_admins?:bool, labels?:[...], board_seed_recipe:{originator_skill, promotion_fence:'label'|'state'|'upstream-ratified', import_verb, landing_path:'direct'|'board-pr-carveout'}, direction_spec:{mode:'none'|'operator'|'documents.roles', templates?}, human_gates:[...], maturity_signals:{m3_tool:'doctor'|'gh-preflight', m4_predicate:'ztrack'|'gh-issues', m4_allowlist_label?, m6_signal:'per-issue'|'pr-close'|'roadmap-rollup'}, extra_rungs:[...], terminal_stage:'M5'|'M6'}`. **GitHub-only fields are OPTIONAL** (simple-sdlc ships no provision.json). Derive most fields as a **view** over `ir.yml`/`provision.json`; three fields are new/hand-authored: **`landing_mode`** (implied today by `agent-review` presence + `merge_policy` + `codeHost`), **`check_realizations`** (names don't self-realize — `security` posts via `propose_dispatch_checks:[security-gate.yml]` `profiles/simple-gh-sdlc/ir.yml:72`; `ci` needs an authored workflow (TA.3); `human-approval` via its gate workflow), and the `board_seed_recipe`/`maturity_signals`/`extra_rungs`/`terminal_stage` prose-mirrors.
- **Acceptance (live):** `getSetupPack(profileDir)` returns a validated pack for each of the 4 profiles; unit tests assert `landing_mode` = `manual-after-review`(simple-gh, from `ir.yml:54`), `auto-merge`(simple-gh-sdlc **and** self-driving), `pr-free`(simple-sdlc); self-driving's `human-approval` appears in `required_checks` not as a mode; simple-gh's `board_seed_recipe.landing_path='board-pr-carveout'`; self-driving's `promotion_fence='upstream-ratified'`; a missing/invalid `landing_mode` fails validation; GitHub fields absent for simple-sdlc validate OK. Round-trips through compile without changing `check:dogfood`.
- **DRIFT GUARD (required):** extend the `check:policy-consumers` precedent (`package.json`) with a `check:setup-pack` that fails CI when a pack's hand-authored field contradicts the profile's SKILL/ir prose (e.g. pack says `auto-merge` but ir.yml has no `agent-review`).
- **Provenance:** DESIGN §Q0 (SetupPack, 3-value landing_mode, check_realizations, landing_path, drift guard); `findings-G` §C; third-skeptic fixes #1/#4/#5; `profiles/simple-gh/ir.yml:10-13,54`+`README.md:63-79`; `skills/manager/SKILL.md:157-187` (§7 carve-out); `pr-141:profiles/self-driving/skills/pm/SKILL.md:38-43` (ready-from-birth); `eligibility.ts:3-9`#pr-140.
- **Deps/order:** ⟶ T0.2. **Build before Track B/D/E consumers.**

### TS.2 — Wire consumers to read the pack (no profile-name branching)
- **Scope:** Recommender (TD.1), `oa maturity` (TB.2/TB.3), and the install agent phases (TE.*) read `getSetupPack()` instead of re-deriving parameters. Enforce a lint/test that no scaffold code branches on a literal profile name.
- **Acceptance:** grep/test shows scaffold code paths key off pack fields, not `if (profile === 'self-driving')`; each consumer's tests pass against all 4 packs.
- **Provenance:** DESIGN §Q0 Layer 1; §Q3 ("one install agent, parameterized by the pack").
- **Deps/order:** ⟶ TS.1, and the respective consumer tasks.

## Track P — Per-profile setup packs (Layer 2; one deliverable per profile)
> Each pack = that profile's *entire* specialized setup+maturity definition. Author + prove one at a time; simple-gh-sdlc first (the core the others derive from), then simple-gh, then self-driving (most rungs), then simple-sdlc.

### TP.1 — `simple-gh-sdlc` pack  ·  ### TP.2 — `simple-gh` pack  ·  ### TP.3 — `self-driving` pack  ·  ### TP.4 — `simple-sdlc` pack
- **Scope (each):** Populate the `SetupPack` for the profile and its **maturity ladder** exactly as DESIGN §Q1 specifies: **TP.1** auto-merge / `ci+agent-review+security` (+`check_realizations:security→propose_dispatch_checks`) / gh-issues+`ready` / direction_spec `operator` / terminal M5(M6 observable); **TP.2** manual-after-review / real-check-names (replace `["ci"]` placeholder) / plans-as-docs+ztrack-import, **`landing_path:board-pr-carveout`** / direction_spec `operator` (anchor only if repo lacks positioning — see TE.3) / terminal M5; **TP.3** auto-merge with `human-approval` **as a required_check (not a 4th mode)** / `enforce_admins:false` / board_seed `promotion_fence:upstream-ratified` / `documents.roles`×3 + REPLACE templates / **extra_rungs: [proxy-ready (M3.p), direction-present (M4.d = REPLACE-markers-absent), human-seam-wired (M4.h)]**; **`M4.b` pre-unpause = a maintainer-seeded `ready` issue** (`pr-141:skills/pm/SKILL.md:33`), NOT the strategist ratification loop (that needs the loop running → proven at M6) / m3_tool gh-preflight (hosted) / m6 roadmap-rollup / terminal "stops at M3/M4 without proxy"; **TP.4** pr-free / no GitHub fields / ztrack+`oa-approved` allowlist / m6 AC-evidence.
- **Acceptance (live, each):** `oa maturity` driven against a real compiled install of that profile walks *its* ladder correctly (TP.3 reports "M3 blocked: proxy not allowlisted" on a hosted self-driving with no proxy, and M4.b satisfied by a maintainer-seeded ready issue *without* requiring a running strategist loop; TP.2 never demands `agent-review` and seeds board state via the carve-out path; TP.4 never demands branch protection); the pack passes the TS.1 drift guard.
- **Provenance:** DESIGN §Q1 per-profile ladders + §Q0; third-skeptic fixes #1/#2/#3; `findings-G` table (simple-gh landing `skills/manager/SKILL.md:120-138,157-187`; self-driving `provision.json:20-21`#pr-141, proxy `ir.yml:184-201`#pr-141, direction `ir.yml:27-30`#pr-141, ready-by "draft/planner/maintainer" `skills/pm/SKILL.md:33`#pr-141).
- **Deps/order:** ⟶ TS.1; each consumes TA.1/TA.2/TB.*/TC.*/TF.1 for its rungs. **Author order TP.1 → TP.2 → TP.3 (derivation-sound), but prove TP.4 (simple-sdlc — the easiest one-shot) early/in-parallel** so the simplest end-to-end path is validated first.

---

## Track A — Foundational building blocks

### TA.1 — Vision/constitution content gate (WARN on unedited template)  `[BUILT-ON #138]`
- **Scope:** #138 hard-FAILs preflight if a declared `documents.roles.vision` file is *missing*, but a file that still contains the profile's `<!-- REPLACE THIS … -->` seed passes every check. Add a **WARN** (not FAIL — content quality is a judgment call OA deliberately left to agents) when a declared `vision`/`constitution` file still contains a `REPLACE THIS` marker. Emit it in both the local `preflight` and the gh-side `open-autonomy-preflight` JSON.
- **Acceptance (live):** `bun bin/autonomy-compile.ts profiles/self-driving github /tmp/sd && cd /tmp/sd && <preflight>` emits `WARN: docs/CONSTITUTION.md is an unedited template (REPLACE THIS marker present)`; after replacing the markers with real text, the warning is gone; a profile that declares no `documents` block emits neither warn nor fail.
- **Provenance:** DESIGN build-plan #2, §Q2; `packages/core/src/ir.ts:137-163`#pr-138; `scripts/open-autonomy-preflight.ts:37-45`; `profiles/self-driving/docs/CONSTITUTION.md:5,12`.
- **Deps/order:** ⟶ T0.2 (#138).

### TA.2 — `hasDispatchableWork(profile)` — deterministic board-readiness predicate  `[BUILT-ON #140]`
- **Scope:** #140's `eligibility.ts` computes the dispatchable set behind `eligibility: "ztrack" | "gh-issues"` with identity defaults (manager→ztrack, pm→gh-issues). Expose a reusable predicate that returns "≥1 actionable item?" for a given profile, **correctly honoring** (a) simple-sdlc's `oa-approved` allowlist and (b) the profile's actual board type (a ztrack-board `pm` must not be defaulted to gh-issues).
- **Acceptance (live):** unit tests over fixtures for each profile (empty board → false; one `ready`/`oa-approved` item → true; a `ready` item with an open `agent/issue-<n>` branch → false); a real run against a seeded simple-sdlc install returns true only after `oa-approved` is applied.
- **Provenance:** DESIGN §Q1 M4 row, §Q2; `packages/local-runner-cli/src/eligibility.ts:15-55`#pr-140; `profiles/simple-sdlc/ir.yml:80-83`.
- **Deps/order:** ⟶ T0.2 (#140).

### TA.3 — Minimal CI-workflow scaffolding for bare-repo GitHub profiles
- **Scope:** A required check with no workflow behind it wedges every PR forever. simple-gh's `provision.json` requires `ci`, and pr-141 *strips* `ci.yml` from self-driving's resources (`pr-141:profiles/self-driving/ir.yml:150`). Build a step that, on a GitHub profile whose required checks name a workflow the repo lacks, **authors a minimal CI workflow** (or halts with an explicit "author CI first" blocker). This precedes the probe-PR check-name discovery (TE.4), which can only *read* contexts where CI already runs.
- **Acceptance (live):** on a bare repo assigned a GitHub profile, after this step a CI workflow exists and a probe PR reports a real `ci` context; without it, the step halts with the named blocker rather than provisioning a protection rule that will wedge.
- **Provenance:** DESIGN build-plan #7 + hardening #5; `profiles/simple-gh/provision.json` (`ci` required); `pr-141:profiles/self-driving/ir.yml:150`.
- **Deps/order:** ⟶ T0.2; consumed by TE.4.

---

## Track B — The maturity validator (`oa maturity`)

### TB.1 — IMM deterministic signal library
- **Scope:** Implement each deterministic readiness signal (findings-F Part A: A1 generated.json valid, A2 compile-clean, A3 autonomy.yml parse, A4 paused seeded, A6 harness-committed, A8/A10 doctor pass, A11 preflight pass, A12 gh-preflight ready, A13 provision==live-protection, A14 via TA.2) as a pure function `signal() → {present:bool, evidence:string}`. No judgment signals here.
- **Acceptance (live):** unit tests over a fixture compiled install captured at each stage (fresh compile; after `git add/commit`; after `rm paused`) show the expected signal flips; every function returns cited evidence.
- **Provenance:** `findings-F` Part A; DESIGN §Q1 signal table.
- **Deps/order:** ⟶ TA.2.

### TB.2 — `oa maturity` verb + `.open-autonomy/install.json` durable record
- **Scope:** Compose TB.1 signals (+ per-profile set from TB.3) into an **IMM stage verdict** (M0…M6) and write a durable `.open-autonomy/install.json` (`{stage, signals:[{id,present,evidence}], profile, substrate, ts-omitted-deterministic}`). This is a legitimately *mechanical* readiness probe (precedent: `oa doctor`, `reconcile-merged-issues.ts` "mechanical wiring, not judgment") — the judgment rungs (direction quality, philosophy) are delegated to the audit agent (Track C), not computed here. **M3 must treat branch-protection-applied (A13) and, for hosted, proxy-reachable as HARD signals** — provisioning silently continues on a failed non-admin protection PUT (`scripts/provision-target-repo.ts:305`) and gh-preflight passes with zero protection (`scripts/open-autonomy-preflight.ts:189-194`), so `oa maturity` must independently confirm live protection via `gh api branches/<b>/protection` rather than trust the provisioning exit. Home: `packages/local-runner-cli/`.
- **Acceptance (live):** compile a profile, then `oa maturity` reports **M2/SCAFFOLDED**; after committing the harness → **M3/INSTALLED**; after seeding a `ready` item + `rm paused` → **M4→M5**; each verdict is mirrored in `.open-autonomy/install.json`. Blocked rungs are named ("M4 blocked: vision file present but WARN unedited-template; board empty").
- **Provenance:** DESIGN build-plan #3, §Q1 framing ("no durable stage record today — unpause/arm leave no trace", `packages/substrate-local/src/emit.ts:602-612`).
- **Deps/order:** ⟶ TB.1, TB.3, T0.2 (#140).

### TB.3 — Per-profile signal-set configuration
- **Scope:** Declare which IMM rungs apply per profile: simple-sdlc has no GitHub (skip A12/A13) and no vision rung; simple-gh/-sdlc add A12/A13; self-driving's **gh-actions target has no `doctor`** (M3 proven by gh-preflight + a first workflow run) while its **local target does** (`targets:[gh-actions,local]`). The maturity verdict must select the right set from the compiled `autonomy.yml` + target.
- **Acceptance:** for each profile, `oa maturity` uses the correct signal set (a simple-sdlc install never reports "M3 blocked: branch protection missing"; a hosted self-driving install never calls `doctor`).
- **Provenance:** DESIGN §Q1 per-profile matrix; `bin/doctor-checks.ts:1040`; `profiles/self-driving/ir.yml:17`#pr-141.
- **Deps/order:** ⟶ TB.1.

---

## Track C — Conformance/completion validator (generalize the audit agent)  `[JUDGMENT]`

### TC.1 — Generalize the simple-gh `audit` skill to all profiles  `[BUILT-ON #137]`
- **Scope:** Lift `profiles/simple-gh/skills/audit/SKILL.md` (nine checks) into a shared skill usable by simple-sdlc/simple-gh-sdlc/self-driving, with profile-aware checks (e.g. skip GitHub-protection checks for local-git simple-sdlc; add proxy-allowlist check for hosted self-driving). Keep it read-only, dispatch-only, report-emitting.
- **Acceptance (live):** `oa dispatch audit` (or the profile's equivalent) on each profile produces `docs/audits/oa-audit-<date>.md` with per-check PASS/FAIL/N-A and terminates `OUTCOME: audited p/f/n-a`.
- **Provenance:** DESIGN build-plan #4; `profiles/simple-gh/skills/audit/SKILL.md:64-144`#pr-137.
- **Deps/order:** ⟶ T0.2 (#137).

### TC.2 — Add a *setup-completion* mode (distinct from *drift* mode)
- **Scope:** The shipped audit assumes a *running* install (check 9 assumes a populated board; check 6 a live schedule). Add a setup-completion mode that checks: direction filled (consumes TA.1 — vision non-placeholder), board seeded with ≥1 draft (TA.2), provision matches live protection, and a first-tick smoke succeeded. It must be able to run against a *paused, pre-first-tick* install.
- **Acceptance (live):** on a deliberately incomplete install (placeholder vision + empty board + wrong required-check names) the setup-completion audit FAILs naming each blocker; on a complete one it PASSes.
- **Provenance:** DESIGN §Phase 5, §Q2 ("audit aimed at drift, not setup completion"); `findings-E` (audit assumes populated board/live schedule).
- **Deps/order:** ⟶ TC.1, TA.1, TA.2.

### TC.3 — Auto-trigger the audit (end-of-install + cron)
- **Scope:** Wire the install agent (TE.5) to dispatch the setup-completion audit at end-of-install, and add a low-frequency cron for ongoing drift. Do not auto-fix; report only.
- **Acceptance:** after a completed install, an audit report exists without a human dispatching it; a scheduled entry appears in the profile's schedule.
- **Provenance:** DESIGN build-plan #7-missing ("no auto post-install audit trigger").
- **Deps/order:** ⟶ TC.2, TE.5.

---

## Track D — Profile recommender/selector

### TD.1 — `recommendProfile(repoFacts)` function
- **Scope:** Implement the DESIGN §Phase-1 / findings-F Part-C decision tree as a pure function. Inputs (all mechanically readable): each candidate profile's `ir.yml` `targets`/`codeHost`, presence of `provision.json`, `resources:` containing repo-shell files (⇒ whole-repo scaffold ⇒ new-repo-only), `policy.box.gh-actions.proxy_host` presence; plus repo facts: on-GitHub?, new/empty vs populated, `gh` admin?, can-fund-a-proxy? Output: `{profile, substrate, reasons[]}`.
- **Acceptance (live):** unit tests over repo-shape fixtures reproduce the decision tree — fully-local→simple-sdlc; existing repo + hosted→simple-gh-sdlc@gh-actions; existing repo + own machine + no-auto-merge→simple-gh@local; new dedicated repo + fundable proxy→self-driving; overrides (demo→hello, SOC2→soc2-baseline). Also runs against the real `profiles/*/ir.yml` and picks correctly.
- **Provenance:** DESIGN §Phase 1, build-plan #5, `findings-F` Part C; scaffold clobber guard `bin/autonomy-compile.ts:239-257`.
- **Deps/order:** none (no in-flight dep). Can start immediately.

### TD.2 — Recommender skill (explain + validate a pre-picked choice)  `[JUDGMENT]`
- **Scope:** A thin skill wrapping TD.1 that explains the recommendation in prose and, when the user pre-picked a profile, validates it against the repo (e.g. warns/blocks self-driving on a populated repo because the scaffold clobber guard will refuse).
- **Acceptance (live):** given a populated repo + user-picked `self-driving`, the skill surfaces "self-driving is a whole-repo scaffold; it will refuse on this populated repo (bin/autonomy-compile.ts:239-257) — pick simple-gh-sdlc or use a dedicated repo."
- **Provenance:** DESIGN §Phase 1 (G1).
- **Deps/order:** ⟶ TD.1.

---

## Track E — The install agent (orchestrator skill) + phases  `[JUDGMENT]`

> The install agent is a **skill**, not a wizard-script (per `CLAUDE.md`; #140 pointedly ships no `oa init`). It calls the existing verbs (`compile`, `provision-target-repo`, `oa …`, TB.2, TC.2, TD.1) as tools and pauses only at the four human gates G1–G4.

### TE.1 — Phase 0 DETECT
- **Scope:** Read repo/language/build files, git remote, empty-vs-populated, `gh auth status` + admin + visibility/plan, existing `.open-autonomy/` (re-install?), and tool presence (node≥22.18, tmux, **bun**, ztrack, termfleet, signed-in CLI — mirror `oa doctor`'s env checks). Never ask for what it can read. **Surface two prerequisites the agent can detect but not perform: (i) CLI sign-in** — if the coding CLI is unauthenticated, `doctor` hard-FAILs and sign-in is an interactive OAuth the human must clear (`bin/doctor-checks.ts:622-657`) — a fifth latent human gate; **(ii) non-admin `gh`** — if the token lacks repo-admin, branch-protection provisioning cannot succeed and must be flagged as a human gate (hardening #4/#8).
- **Acceptance (live):** on a fixture repo, produces a correct detect report (language, remote, admin?, tool gaps incl. bun, CLI-signin state).
- **Provenance:** DESIGN §Phase 0 + hardening #8; `docs/INSTALL-AGENT.md:84-139`; env checks `bin/doctor-checks.ts:382-489,622-657`.
- **Deps/order:** none.

### TE.2 — Phase 1 RECOMMEND / CONFIRM PROFILE (G1) + **instantiate the SetupPack**
- **Scope:** Call TD.1/TD.2; if the user pre-picked, validate; else present the recommendation and **ask once**. On confirmation, **load the chosen profile's `SetupPack` (TS.1)** — this is the instantiation point where the common scaffold binds to Layer 2; every later phase reads the pack (not the profile name).
- **Acceptance (live):** end-to-end on two fixtures (one recommend, one validate-a-pre-pick) yields the right profile+substrate, exactly one user question, and a loaded pack whose `landing_mode`/`maturity_signals` match the chosen profile.
- **Provenance:** DESIGN §Phase 1, G1; §Q0 (instantiation seam); §Q3 ("at Phase 1 it instantiates the chosen profile's setup pack").
- **Deps/order:** ⟶ TD.2, TE.1, TS.1.

### TE.3 — Phase 2 CAPTURE DIRECTION (G2) — **CONDITIONAL + existing-doc-first** (not a forced vision on every profile)
- **Scope:** *(Corrected by the third skeptic — do NOT force a vision doc on the operator-as-direction profiles.)* Behavior depends on the pack's `direction_spec.mode`: **(a) `documents.roles` (self-driving)** — fill the shipped REPLACE-THIS templates (required); **(b) `operator` (simple-gh/-sdlc/simple-sdlc)** — capture direction **only when the repo lacks readable positioning** (empty/sparse repo). When needed, **prefer role-mapping an existing doc** (README/AGENTS.md via `direction_spec`) over authoring a new `docs/VISION.md`; declaring `documents.roles.vision` on these profiles hard-FAILs preflight on a missing file and auto-gates the path into `human_required_paths` (`packages/core/src/ir-yaml.ts:36-46`#pr-138), silently mutating their risk surface — so do it only if positioning is genuinely absent. The invariant to satisfy before TE.5's planner dispatch: **some readable positioning exists** (found or, if truly absent, authored). The mission is the user's; agent proposes, never decides.
- **Acceptance (live):** self-driving — templates filled, TA.1 emits no unedited-template WARN. Operator profiles on a repo WITH positioning — no new vision file created, no `human_required_paths` mutation, and the planner (TE.5) still produces ≥1 draft by reading existing positioning (`pr-139:.../planner/SKILL.md:24-31`). Operator profiles on an EMPTY repo — an anchor is created/role-mapped and the planner then produces ≥1 draft (not "nothing to do").
- **Provenance:** DESIGN §Phase 2, G2 + hardening #3 (refined); third-skeptic fix #3; `pr-139:.../planner/SKILL.md:24-31` (planner handles anchor-less); `profiles/simple-gh/README.md` (operator-as-direction).
- **Deps/order:** ⟶ TA.1, TE.2. **Blocks TE.5 planner-seeding.**

### TE.4 — Phase 3 AUTHORIZE (G3, batched) — incl. the probe-PR check-name discovery
- **Scope:** Ask, in one batch: spend cadence + WIP; harness-commit consent; for GitHub — admin/branch-protection consent + identity (own token vs bot reviewer); for self-driving — the model-proxy decision. **Fix carried from DESIGN:** do NOT guess required-check names on a PR-less repo (a wrong guess deadlocks every PR); instead open a **throwaway probe PR**, read the actual check contexts GitHub reports, then close it.
- **Acceptance (live):** on a test repo with CI configured, the agent discovers the real check context names via a probe PR (not a guess) and records them for provisioning.
- **Provenance:** DESIGN §Phase 3, G3; `docs/INSTALL-AGENT.md:92-94,120`; `docs/OPERATIONS.md:520-522`.
- **Deps/order:** ⟶ TE.3.

### TE.5 — Phase 4 EXECUTE + Phase 5 VALIDATE
- **Scope:** In dependency order ("commit the harness first, wire the gate last"): install deps → `compile` → write filled vision (TE.3 output) → **commit harness** → bring up the termfleet console+provider on repo-unique ports with a pinned `TERMFLEET_PROVIDER_URL` (see TG.1) → for GitHub, ensure a CI workflow exists (TA.3) then run `provision-target-repo` with the probe-discovered check names → **seed the board with *drafts only*** (dispatch the profile's planner against the now-populated vision from TE.3; do **not** self-apply `ready`/`oa-approved`). **Provisioning is not fire-and-forget:** `provision-target-repo` continues on a failed non-admin protection PUT (`scripts/provision-target-repo.ts:305`), so after it runs, **verify live protection via `gh api branches/<b>/protection`** and treat a missing/partial result as a hard blocker (a non-admin token → route to the human gate, don't proceed). Then VALIDATE: run `oa maturity` (TB.2, with protection/proxy as hard M3 signals) + setup-completion audit (TC.2) + gh-preflight; **block advancement to G4 on any hard fail**; emit the IMM stage report.
- **Acceptance (live):** a full run against a real test repo reaches **M4/ARMED** per `oa maturity`, with the board holding drafts (not `ready`), the fence still armed, and **live branch protection confirmed present**; a deliberately broken run (undeployed proxy / placeholder vision / protection-not-applied) is **blocked at VALIDATE** with named blockers (not waved through).
- **Provenance:** DESIGN §Phase 4, §Phase 5 + hardening #4; `docs/INSTALL-AGENT.md:203`; seed-drafts-not-ready `profiles/simple-sdlc/ir.yml:80-83`; provisioning-continues-on-failure `scripts/provision-target-repo.ts:305`; gh-preflight-passes-zero-protection `scripts/open-autonomy-preflight.ts:189-194`.
- **Deps/order:** ⟶ TE.4, TA.1, TA.2, TA.3, TB.2, TC.2, TG.1.

### TE.6 — Phase 6 HAND-OFF, split into G4a (in-session) + G4b (async) + substrate variants
- **Scope:** G4a/G4b are hours apart and cannot be held in one session. **G4a (in-session):** human promotes the first item to `ready`/`oa-approved`; then go-live. **Go-live is substrate-specific:** local runner = `oa resume` + `oa start` under tmux/nohup; **hosted (gh-actions) has no `paused` file** — go-live = remove the `agent-paused` label / enable the agent workflows (findings-F A5) — write this hosted path explicitly (it does not exist today). **G4b (async babysit protocol):** watch the first full draft→develop→review→PR cycle, approve the first merge, *then* arm native auto-merge — documented as a separate follow-up, not an in-session step.
- **Acceptance (live):** after G4a, `oa maturity` reports **M5/RUNNING** (local: paused absent + a profile-agent session per `oa status`; hosted: agent workflow fired on schedule); the G4b protocol is a written runbook the operator can follow to the first supervised merge.
- **Provenance:** DESIGN §Phase 6, G4a/G4b + hardening #2/#7; `docs/OPERATIONS.md:513-519`; hosted analogue `scripts/open-autonomy-preflight.ts:83`.
- **Deps/order:** ⟶ TE.5.

### TE.7 — Phase 7 PROVE ADVANCING (M6)
- **Scope:** Watch the first wave; call the mission-advancing signal (TF.1). If a gate-passed, vision/roadmap-linked merged PR closed a work item → declare **M6/ADVANCING**; else report the specific missing rung (e.g. "ticked but board only had drafts").
- **Acceptance (live):** on a seeded install, after one real develop→review→merge cycle on a mission-linked issue, `oa maturity` reports M6; on a docs-only or wontfix close, it does NOT.
- **Provenance:** DESIGN §Phase 7.
- **Deps/order:** ⟶ TE.6, TF.1.

---

## Track F — Real mission-advancing signal

### TF.1 — Gate-and-linkage-aware M6 signal
- **Scope:** Today `reconcile-merged-issues` closes an issue on *any* merged `agent/issue-<n>` PR (a docs PR counts) and the hosted roadmap rollup counts *any* closed roadmap issue (wontfix increments `done`). Build a **profile-specific** M6 check: for **PR-based profiles** (simple-gh/-sdlc/self-driving) — a closed item whose merged PR (a) **passed the profile's required gates** and (b) is **linked to the vision/roadmap** (`roadmap:<id>` label or AC linkage); for **PR-free simple-sdlc** — a `done` item whose **ztrack AC-evidence** trace is green (no merged PR exists there; A15/A16 don't apply, so the old Phase-7 text would never terminate on this profile). Port to non-hosted boards so M6 is provable on every profile.
- **Acceptance (live):** PR profile — a real merged mission-linked gated PR → signal true; a docs-only PR merge or wontfix close → false. simple-sdlc — a `done` item with green AC-evidence → true; a closed-without-evidence item → false.
- **Provenance:** DESIGN build-plan #7, §Q2; `scripts/reconcile-merged-issues.ts:25-29`; `services/agent-model-proxy/src/github-sync.ts:111-124`.
- **Deps/order:** independent of the install agent; ⟶ nothing, but TE.7 consumes it.

---

## Track G — Provider bring-up helper (removes a real stall)

### TG.1 — Deterministic unique-port provider bring-up
- **Scope:** A helper that picks repo-unique, unused ports (never 7373/7402/7620/7621 defaults), starts the termfleet console+provider, pins `TERMFLEET_PROVIDER_URL` durably (compile `--provider-url` into `scheduler/schedule.json`), and verifies the provider answers as termfleet (not a foreign occupant). This removes the biggest documented local stall (twin/supercode both recorded no provider port; ports are box-specific human knowledge today).
- **Acceptance (live):** on a box with the default ports occupied, the helper brings up a provider on fresh ports and `oa doctor` provider check PASSes; re-running is idempotent.
- **Provenance:** DESIGN §Phase 4; `docs/OPERATIONS.md:189-258`; provider check `bin/doctor-checks.ts:538-617`; real-consumer gap (twin `scheduler/schedule.json` `env:{}`).
- **Deps/order:** ⟶ T0.2 (#140 for `oa doctor`); consumed by TE.5.

---

## Sequencing / critical path

```
T0.1 (distribution: 0.4.2 + @volter/oa, owner) ─┐
T0.2 (#137-141 merged) ──────────────────────────┼──► TS.1 (SetupPack schema + landing_mode) ─► TS.2 (wire consumers)
                                                  │        └─► TP.1 (sdlc pack) ─► TP.2 (gh) ─► TP.3 (self-driving) ─► TP.4 (sdlc-local)
                                                  ├──► TA.1 (vision gate) ─► TE.3
                                                  ├──► TA.2 (board predicate) ─► TB.1 ─► TB.3 ─► TB.2 (oa maturity, reads pack, hard protection/proxy)
                                                  ├──► TA.3 (CI-workflow scaffold) ─► TE.4/TE.5
                                                  ├──► TG.1 (provider bring-up)
                                                  └──► TC.1 (audit generalize) ─► TC.2 (completion mode) ─► TC.3
TD.1 (recommender fn, reads pack) ─► TD.2 ─► TE.2
TF.1 (M6 signal) ── build BEFORE the agent ──────────────► TE.7
TE.1 DETECT ─► TE.2 SELECT+instantiate pack ─► TE.3 (unconditional direction) ─► TE.4 ─► TE.5 (needs TA.1,TA.2,TA.3,TB.2,TC.2,TG.1) ─► TE.6 (G4a/G4b) ─► TE.7 (needs TF.1)
```
**Critical path:** T0.2 → **TS.1** → TB.2 (via TA.2→TB.1→TB.3) → (TC.2) → **TP.1** → TE.3 → TE.5 → TE.6 → TE.7. **Parallelizable early:** TD.1, TA.1, TA.3, TG.1, TF.1; the four TP packs are authored serially (TP.1→TP.4) but each proves independently. **Two-layer discipline:** TS.1 lands before any consumer; scaffold code reads the pack, never branches on profile name (TS.2 enforces). **Terminal-claim discipline:** the in-session flow ends at **M5/RUNNING** (G4a); **M6/ADVANCING is an async follow-up** proven by TF.1 + a scheduled `oa maturity`/audit — do not gate the "install done" report on M6; self-driving's terminal without a proxy is honestly **M3/M4**, not M5.

## Per-profile coverage matrix (which tasks each profile needs to reach its terminal stage)

| Task | simple-sdlc | simple-gh | simple-gh-sdlc | self-driving |
|---|---|---|---|---|
| **Pack (Track P)** | TP.4 | TP.2 | TP.1 | TP.3 |
| **`landing_mode`** | **pr-free** | **manual-after-review** | **auto-merge** | **auto-merge + human-approval** |
| TA.1 vision gate | — | only if anchor authored | only if anchor authored | **required** (shipped templates) |
| TE.3 direction capture | operator; anchor only if empty repo | **operator; existing-doc-first, author only if no positioning** | operator; existing-doc-first | `documents.roles`; fill templates |
| TA.2 board predicate | **required** (+`oa-approved`) | required (ztrack) | required (gh-issues) | required (gh-issues) |
| TB.* maturity (its ladder) | no GH rung | +protection rung | +checks rung | **+proxy/direction/human-seam rungs; hosted: no doctor** |
| TC.* audit completion | required | required | required | **required** (+proxy-allowlist) |
| TD.* recommender | applies | applies | applies | applies |
| TE.4 provision | — (no GitHub) | required (real check names) | required | required (+`human-approval`) |
| TG.1 provider bring-up | required (local) | required (local) | required (local target) | only on local target |
| TF.1 M6 signal | AC-evidence trace | per-issue (manager flips) | +merged-PR link | **roadmap:<id> rollup** |
| **Proxy sub-project** | no | no | only on gh-actions target | **YES — deploy+fund+allowlist** |

**Honest terminal reachability** (see DESIGN §Q3 asterisks): simple-sdlc / simple-gh(-sdlc)-on-local are genuinely "~4 gates → running". **self-driving is not a one-shot** in the same sense — its G3 "proxy" line is a deploy-and-fund sub-project; the install agent should detect the proxy prerequisite and, if unmet, stop at M3/M4 with a clear "hosted self-driving needs a funded, allowlisted model proxy" blocker rather than pretending to reach M5.

---

*Companion: `OA-AGENT-ASSISTED-INSTALL-DESIGN.md` (design), `OA-SETUP-FEASIBILITY.md` (feasibility), and `findings-{A..F}-*.md` (evidence) in the study workdir.*
