# OA Setup Feasibility — Could a fresh agent stand up a brand-new OA repo against a profile?

**Question.** Handed a new/empty repo plus the Open Autonomy (OA) tooling and *no prior context*, could a fresh agent correctly bootstrap OA to a state that runs against a chosen profile (simple-gh / simple-gh-sdlc / self-driving / simple-sdlc)? What exactly does that setup require, and where are the gaps?

**Method.** Four serialized deep reads (model: Fable‑5) across the canonical sources, followed by two adversarial skeptic passes. Sources, cloned side by side under `/workspace/oa-setup-study`:
- `volter-ai/open-autonomy` @ v0.4.2 — the product: profiles, the `open-autonomy` CLI, governance gates, validators, docs. *Primary source.*
- `volter-ai/supercode` branch `research/oa-self-dev-study` — the ~132 KB frozen architecture doc `docs/oa-self-dev-architecture/OA-SELF-DEV-ARCHITECTURE.md` (+ `EXECUTION-PLAN.md`). *The map.*
- `volter-ai/supercode` @ `main` — the LIVE self-driving install + the `oa:*` local-runner substrate.
- `volter-ai/twin` — a real repo wired up as an OA consumer.

Two adversarial **Fable‑5 skeptic passes** then challenged the assembled conclusions (one attacking the "feasible for local profiles" verdict, one verifying every claimed gap against the live repos). Their corrections are folded in and marked *(skeptic)* where they changed a conclusion — most importantly the **published-npm-path-is-dead** finding and the **agent-not-human per-item ratification** nuance.

Citations are `path:line` relative to each repo root; the repo is named where ambiguous. Backing evidence lives in the four `findings-*.md` companion files in the study workdir.

---

## TL;DR verdict

**There is no setup agent, and no single `init` verb.** OA setup is a **manual, human‑judgment‑heavy, multi‑toolchain choreography** whose only mechanical step is `open-autonomy compile <profile> <substrate> .`. Vision, constitution, and the task board **all bottom out in a human** on every profile. A fresh agent can get *some* profiles to a runnable-but-paused state with a human at several consent points; it cannot autonomously reach a *running, mission-advancing* state for any profile.

> ⚠️ **CRITICAL CAVEAT — which "OA tooling" the fresh agent is handed decides the answer.** The verdicts below are true of a **source checkout at HEAD** (v0.4.2, unpublished) — which is exactly how both real installs studied (supercode, twin) were actually built. They are **false of the published npm path the docs themselves prescribe**: npm `latest` is 0.4.1, whose tarball **crashes on `compile`** (missing `dist/egress-guard.sh`, F-1) and **ships no `doctor` verb at all**; the only npm version that compiles cleanly (0.3.1) predates *every* safety fix relied on below (the paused fence + `oa-approved` allowlist [OA-07], the "fully-local" no-push fix [F-2], collision detection [OA-04], preflight false-fail fix [F-5], and `doctor` [OA-18]). The README's own warning is still live ("npm 0.4.0/0.4.1 known-broken … install 0.4.2+ once published", `README.md:7-9`). **A fresh agent that does what INSTALL-AGENT.md says — `npx open-autonomy compile …` then `npx open-autonomy doctor` (`docs/INSTALL-AGENT.md:232,350`) — is hard-stuck at step one until 0.4.2 ships.** No adopter has ever succeeded via npm; the source-checkout escape hatch is documented only in `docs/OSS_AGENT_RUNBOOK.md:3`, addressed to OA's *own* self-building agent, and needs `bun` (the CLI shebang is `#!/usr/bin/env bun`, `bin/open-autonomy.ts:1`) which the playbook's Phase-0 tool check omits.

| Profile / substrate | Fresh-agent bootstrap verdict (from a **source checkout at HEAD**) |
|---|---|
| **simple-sdlc** (fully local, PR‑free) | **Feasible to "installed + paused" with a human at ~3–4 consent points** — easiest path (no admin, no branch protection, no proxy). Hidden hard prereq: `bun` (dispatch runs `bun scripts/runner.ts`, `docs/OPERATIONS.md:127`). Still needs a human to author the first issue and to unpause. |
| **simple-gh-sdlc** (local runner, GitHub PRs) | **Feasible ~90%, human-in-the-loop by design** — there is an agent *playbook* (`docs/INSTALL-AGENT.md`) but it deliberately reserves ~4–6 judgment calls for a human (unpause, uncapped-spend consent, gate/check-name confirmation, harness-commit consent), and on a repo with no open PR the required-check names are an explicit *best guess* whose wrong value "DEADLOCKS every PR" (`docs/INSTALL-AGENT.md:120,129-132`). Also needs `bun`. |
| **simple-gh** (lean, single manager) | Feasible mechanically; work-entry (plans-as-docs) and required-check names need human/operator input. |
| **self-driving** (hosted / gh-actions) | **NOT autonomously bootstrappable** — requires a deployed+funded Cloudflare model proxy with an OIDC allowlist, human-authored product identity (constitution/roadmap/strategist-sources), no agent playbook, no hosted `doctor`. Note: `compile self-driving` *is* a whole-repo **scaffolder** (`bin/open-autonomy.ts:38-39`) — but scaffolding files is not the same as authoring identity or standing up the proxy. |

The honest short answer to the owner's bottom-line question: **from a source checkout, a fresh agent could get simple-sdlc / simple-gh-sdlc‑on‑local to "installed + paused," but not to "self-driving against the profile," and not without a human making decisions that are, by design, not the agent's to make — and via the published npm path it cannot even compile today.** The single biggest missing artifact is a real **install/bootstrap agent (skill) plus a whole-install validator**; the single biggest *operational* blocker is that **0.4.2 is unpublished, so the documented commands fail.** Both are named/recorded in OA's own docs.

---

## Q1 — What does OA REQUIRE to run at all?

OA's model is `compile(profile, substrate) → installation` (open-autonomy `README.md:26-34`). Two independent axes: **runner** (`local`/termfleet vs `gh-actions`/hosted) ⟂ **code host** (GitHub PRs vs local‑git ztrack board) (`docs/OPERATIONS.md:24-33`).

**Universal prerequisites (every setup):**
- **A profile, chosen at compile time** — `open-autonomy compile <profileName|profileDir> <local|gh-actions> [outDir]` (`bin/open-autonomy.ts:24`; `bin/autonomy-compile.ts:3`). Bundled profiles: hello, hello-human, self-driving, simple-gh, simple-gh-sdlc, simple-sdlc, soc2-baseline (`bin/bundled-profiles.ts:19-27`).
- **A JS repo with `package.json`** — a repo without one is a hard stop for the local runner (`docs/OPERATIONS.md:99-100`; `docs/INSTALL-AGENT.md:143`).
- **The harness committed to git** — agents run in worktrees that only see committed files; the scheduler *refuses to start* on an uncommitted harness (`docs/OPERATIONS.md:320-329`; guard `packages/substrate-local/src/emit.ts:269-332`; override `AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1`).

**Local runner (the termfleet substrate):** Node ≥ 22.18, tmux, `termfleet` + `@termfleet/core` installed *in the repo* (the emitted backend bare-imports `@termfleet/core/local-providers.js`, `docs/INSTALL-AGENT.md:208-211`), a **signed-in** coding CLI (Claude Code default; Codex via `TERMFLEET_AGENT=codex`), `gh` for the GitHub code host (`docs/OPERATIONS.md:117-128`); and **`bun`** — a hidden hard prerequisite the docs under-scope to simple-sdlc but which both local SDLC profiles need at dispatch time (`docs/OPERATIONS.md:127` PM dispatches via `bun scripts/runner.ts`; `bin/doctor-checks.ts:398`; `profiles/simple-gh-sdlc/skills/pm/SKILL.md:43`), installed via a `curl | bash` step the playbook's Phase-0 tool check omits; a running termfleet **console + provider** on **repo-unique** ports with `TERMFLEET_PROVIDER_URL` pinned (`docs/OPERATIONS.md:189-258`); `ztrack` as a pinned devDependency + `ztrack init --preset <preset>` (`docs/OPERATIONS.md:421-431`). **No OA secrets** — model access is your own logged-in CLI / `ANTHROPIC_*` env; no OA spend cap on local (`docs/OPERATIONS.md:165-187,688-690`).

**GitHub code host (either runner):** `gh` authenticated as a repo **ADMIN** with `repo` scope (`docs/INSTALL-AGENT.md:70-72`); branch protection with required checks = your real PR CI + `agent-review` (+ `security` for simple-gh-sdlc; + `human-approval` for self-driving), `enforce_admins:true` on local (`docs/OPERATIONS.md:501-506,753-756`); native auto-merge armed **only after** a supervised first merge (`docs/OPERATIONS.md:513-519`). No CI on PRs ⇒ stop condition (`:109-112`).

**gh-actions runner (hosted) additionally:** repo **variables** — `MODEL_PROXY_URL` is required with no default (`docs/OPERATIONS.md:726-727`) plus `PUBLIC_AGENT_*` (`:723-735`); **zero repo secrets** — agents mint bounded per-run model tokens via GitHub OIDC (`:737-740`); and **a deployed model proxy** (Cloudflare Worker `services/agent-model-proxy/`) holding provider API keys, prices, and limits, with the consumer repo in the proxy's **OIDC workflow allowlist** (`services/agent-model-proxy/src/index.ts:347-357`). This is the single biggest hosted prerequisite: deploy+fund your own proxy, or get allowlisted on the maintainer's (its host is baked into `profiles/self-driving/ir.yml:128`). The termfleet substrate is local-only; the hosted runner never needs it (`README.md:52-57`).

**Develop‑vs‑run.** The `.open-autonomy/` install *develops* a repo; it is categorically not "how you run" that repo's product (arch `OA-SELF-DEV-ARCHITECTURE.md:26-36`). No single in-repo sentence states this — a fresh agent could not read it anywhere; it is established only by disjointness analysis (`:160-163`).

---

## Q2 — Where do VISION and CONSTITUTION come from?

**Authored by a human, once, at install — and mechanically NOT required.**

- **OA's own (dogfood)** live at open-autonomy `docs/CONSTITUTION.md` + `docs/VISION.md` (human-owned, "amended, never auto-edited"); root `VISION-AND-CONSTITUTION.md:4` is a distilled restatement that "supersedes nothing."
- **The consumer TEMPLATE ships only with `self-driving`**, as `resources:` (`profiles/self-driving/ir.yml:221-223`): `docs/CONSTITUTION.md` carries literal `<!-- REPLACE THIS for your project. -->` markers (`profiles/self-driving/docs/CONSTITUTION.md:5,12`); `docs/PROJECT.md` is a REPLACE-THIS stub; `docs/ROADMAP.md` points at `.open-autonomy/roadmap.yml` whose seed is `items: []` (`profiles/self-driving/.open-autonomy/roadmap.yml:8`). These are seed-once — `upgrade` never overwrites them (`packages/core/src/upgrade.ts:19-44`, `INSTALL_OWNED_PATHS`).
- **simple-* / hello profiles carry NO vision or constitution** — governance is `standards/*.md` + `policy.box` (`profiles/simple-gh-sdlc/ir.yml:140-155`). The canonical simple-gh manager SKILL has *no MISSION section*; its direction anchor is the operator.
- **Required before the loop runs? NO — and nothing validates it.** The strategist is *told* to read the north star (`profiles/self-driving/skills/strategist/SKILL.md:27`), but **no lint/preflight/doctor/compile check reads `docs/CONSTITUTION.md` at all** — not its content (the REPLACE markers), and not even its *existence*: it is not in the gh-preflight `REQUIRED_FILES` list (`scripts/open-autonomy-preflight.ts:37-45`, which lists AGENTS.md / autonomy.yml / roadmap.yml / review-rubric.yml / upgrade-cli / VERSION). `scripts/open-autonomy-config.ts:19-25` hardcodes a constitution *path* but validates nothing about it. The arch doc names this exactly: "the genuine gap is on the **vision** side: nothing today requires or protects the one document OA definitionally needs" (arch `:1428-1430`). A `documents:` role-map with a required `vision:` was *proposed* (arch `:1470-1502`) but **did NOT land**: a `documents` key exists in the manifest (`packages/core/src/manifest.ts:77`) yet carries only `resources` — no `vision:` role and no required-check. *(Verified by skeptic pass.)*

**Real-world corroboration:** twin had to *write its own* `docs/CONSTITUTION.md` "because the OA simple-gh-sdlc profile ships no constitution at all" (twin `docs/CONSTITUTION.md:5-8`); supercode declares its vision as **AGENTS.md** (a *filename that doesn't say "vision"*) and ships **no** CONSTITUTION.md or roadmap.yml at all. So "where the vision lives" is not even a fixed contract — it's per-install human declaration.

---

## Q3 — Where do the TASKS for the board come from? ("nothing" → actionable board)

Every path bottoms out in a human seeding the first work; the automated generators only *amplify* what a human ratifies.

- **hello**: no board; a `greeter` cron agent self-fires (`profiles/README.md:42-57`).
- **simple-sdlc** (local‑git): a **human** runs `ztrack init --preset simple-sdlc` then `ztrack issue create … --label oa-approved`, with the body carrying a `## Acceptance Criteria` block with version-markered AC lines and an assignee (`docs/OPERATIONS.md:441-459`). A cron PM then *launches* draft/develop/review. Two day-one fences: fresh installs seed `.open-autonomy/paused`, and `policy.dispatch: {mode: allowlist, allow_label: oa-approved}` (`profiles/simple-sdlc/ir.yml:78-83`).
- **simple-gh-sdlc** (GitHub board): board = GitHub Issues mirrored by ztrack; dispatchable iff open + **`ready`** label + assignee + conforming AC body (`profiles/simple-gh-sdlc/skills/pm/SKILL.md:18-24`). The PM never drafts unprompted; the `draft` agent runs only when a human explicitly asks (`:92-93`).
- **simple-gh**: **plans-as-docs** — the manager dispatches a research subagent whose deliverable is a plan doc under `docs/plans/<topic>.md` in ztrack document grammar, registered via `npx ztrack import … --register`; only `ready`-state issues dispatch (`profiles/simple-gh/skills/manager/SKILL.md:57-79`).
- **self-driving**: a two-layer roadmap — the **strategist** (weekly cron) proposes items into `.open-autonomy/roadmap.yml` via an auto-merging PR blessed by `strategy_reviewer`; the **planner** (daily cron) converts ratified items into GitHub issues (`profiles/self-driving/skills/{strategist,planner}/SKILL.md`). **But a fresh install starts at `items: []`** — day-one work is the human's first manual issue (`profiles/self-driving/README.md:19-31`).

**The perpetual-goal theorem (arch doc's own proof).** Both fleet boards were found *empirically drained*: supercode 80/100 done with **zero `ready`**; twin 105/107 done, roadmap exhausted (arch `:1577-1582`). The fix — a **planner** that keeps deriving the board from the vision — was *not built at the doc's freeze* (arch `:1639-1705`). It has since landed in the live installs (supercode S4 planner + tick-time intake sweep + `docs/interop/TARGETS.md`; twin planner T3), **but it has never fired**: supercode's `docs/plans/` holds only `.gitkeep`, the paused fence has been armed since 2026-07-09, and exactly one supervised cycle ever ran (findings-D). Twin's generators are similarly incomplete: the seeder defaults to a *fixture* world repo (`volter/twin-loop`), and the spec-drift detector, though it now fetches, is **unwired** (nothing invokes it) (twin `scripts/seed-conformance-issues.ts:74`, `scripts/spec-drift.ts` — findings-C).

**Bottom line for Q3:** "nothing → board" is **circular at bootstrap** — the arch doc's own EXECUTION-PLAN notes the planner's *first run must be a manual dispatch* because "the paused driver fires nothing" (PLAN `:109,112`). A human seeds the vision and the first issue; only then does any generator have anything to amplify.

> **Nuance (skeptic correction):** the human floor is at **install-time authoring**, not per-item ratification. Once the constitution and `strategist-sources.json` are filled, self-driving's roadmap loop is mechanically *agent*-ratified, not human-ratified: `.open-autonomy/roadmap.yml` is **not** in `human_required_paths` (`profiles/self-driving/ir.yml:152-172`), the strategist's proposal PRs are blessed by the *agent* `strategy_reviewer` and auto-merged, and the human-approval gate **auto-passes** out-of-scope PRs (`scripts/human-approval-gate.ts:183-185`). Maintainer `/agent ratify` is a human *override*, "outside the agent's authority" (`ir.yml:90-92`), not a required step. So a *filled-in* self-driving install could self-seed its board without a human in the per-item loop — but the seeds it ships are empty/placeholder (`roadmap.yml` `items: []`; `strategist-sources.json` all `repos: []` with its own "REPLACE these" note), so cold-start still bottoms out in human authoring.

---

## Q4 — What questions MUST be answered at setup, per profile?

**Common to every local install** (`docs/OPERATIONS.md` checklist; compile's printed next-steps `bin/autonomy-compile.ts:331-353`): package manager; repo-unique termfleet prefix + ports (never 7373/7402) + provider pin; harness (`TERMFLEET_AGENT` claude vs codex); tick interval / WIP = *spend consent* (default `*/15`, WIP 1); accept the ~40-file committed harness incl. the `.claude/settings.json` Stop hook; keep/drop `dependabot.yml`/`security.yml`; and **the unpause decision — "a judgment call, not yours to default"** (`docs/INSTALL-AGENT.md:360-371`).

**simple-gh-sdlc** (INSTALL-AGENT Phase 1 detects / Phase 2 asks, `docs/INSTALL-AGENT.md:84-198`): the exact PR-gating CI **check names** (wrong names deadlock every PR); default branch; the human's assignable login; admin + plan; visibility; merge-gate confirmation (contexts + `enforce_admins:true` + no required human review); identity (own token vs a separate bot reviewer); the first issue; and when to arm auto-merge. Provision default: `required_checks:["ci","agent-review","security"]`, `enforce_admins:true` (`profiles/simple-gh-sdlc/provision.json:8-12`).

**simple-sdlc**: the ztrack preset key; `policy.dispatch.mode` allowlist-vs-open; per-issue assignee + AC grammar (`docs/OPERATIONS.md:441-459`). No GitHub decisions.

**simple-gh**: replace the placeholder `required_checks:["ci"]` with real PR check names (`profiles/simple-gh/provision.json:2,8-12`); maintain the tier→model map (`profiles/simple-gh/skills/manager/SKILL.md:39-51`); `manager.merge_policy` + `max_rework_attempts`.

**self-driving (hosted)**: fill north star + merit criteria + PROJECT.md (Q2); seed the roadmap / first issues (Q3); set the variables table, above all `MODEL_PROXY_URL`; deploy/point at a model proxy + get allowlisted; branch protection = `ci`+`agent-review`+`human-approval` ("omitting human-approval makes the human gate decorative", `docs/OPERATIONS.md:753-756`); a fork must replace the volter proxy/bot fallbacks in `policy.box.gh-actions` (`ir.yml:127-132`).

**Naming traps a fresh agent will hit** (arch `:201-221`): there is **no ztrack preset literally named `simple-gh`**, so the lean profile must explicitly declare `ztrackPreset: simple-gh-sdlc` or silently select a nonexistent preset; and a *third* name (`simple-sdlc`) can be the live validation preset — twin deliberately runs `installedFrom: simple-sdlc` while declaring `simple-gh-sdlc` for ledger compatibility (twin `.volter/tracker-config.json:8`). And box-specific quirks a fresh agent *cannot know* surface only on failure — e.g. supercode's `CC=gcc` cargo doctrine (PLAN `:37,109`) and the `NODE_ENV=production` install trap (supercode `OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md:32`).

---

## Q5 — What VALIDATES that a setup is correct/complete? Does it fail closed?

**A strong mechanical ladder exists for LOCAL, but it is advisory (nothing forces it), and hosted/content validation is weak.**

Validator ladder (open-autonomy `profiles/README.md:203-222`):
1. **`lint <profileDir>`** — parses IR, compiles to every declared target in memory, checks copy-source existence + SKILL.md name==folder; writes nothing (`bin/lint-profile.ts:35-49`).
2. **`compile` gates** — missing copy-sources / skill mismatch / namespace collision / deletion-resurrection / clobber guards abort *before writing*; writes the authoritative `.open-autonomy/generated.json` (`bin/autonomy-compile.ts:172-266`).
3. **`preflight`** (env-level, local) — devdeps, workspace collisions, PTY load probe, port/provider classification, `npm ci` under the CI Node, CLI sign-in via `claude auth status --json`; exit 1 on hard warn (`bin/preflight.ts`).
4. **`doctor [--live]`** (install-level, local) — 7 ordered checks: self/env/provider/auth/**harness** (every generated file committed AND visible from a real probe worktree)/**skills** (probe worktree resolves each launch prompt)/`live` (one real dispatched session, spends money). Exit 1 on any FAIL (`bin/doctor.ts:33-41`; `bin/doctor-checks.ts`). This is the closest thing to a whole-install proof, **but it is weaker than "proves the install" implies**: without `--live`, check 7 is SKIPped under an explicit spend guarantee, so **dispatch is never actually proven** (`bin/doctor-checks.ts:1162-1168`); `--live` spends money and needs a signed-in CLI (`:60-61`); **a WARN never fails the verdict** (`bin/doctor.ts:34`) — e.g. an unverifiable-harness-auth WARN exits 0 on a possibly signed-out box (`doctor-checks.ts:633`); and doctor checks **nothing GitHub-side**, so it passes on an install whose mis-named required checks will wedge every PR. And on the published path it does not exist at all (see Critical Caveat).
5. **`conformance <substrate>`** — the Runner-contract battery (`bin/autonomy-conformance.ts`).
6. **gh installs** — the profile-carried `scripts/open-autonomy-preflight.ts` (run by a workflow) checks required files, agent workflow files, `MODEL_PROXY_URL`, labels, and branch-protection-includes-`ci`; exit 78 when blocked — **but env/label/protection checks only WARN; only missing FILES fail** (`:161-194`).
7. **`provision-target-repo.ts`** reconciles repo/vars/labels/protection from `provision.json`, but **missing secrets are reported MANUAL, never set** (`:108-113`).

**Fail-closed behavior that DOES exist:** fresh local installs start **PAUSED** (first tick exits nonzero, `packages/substrate-local/src/emit.ts:110-120`); the scheduler refuses an uncommitted harness; a mis-set merge gate **wedges PRs rather than merging them** (deadlock, not wrong merge); the live driver's session-probe and eligibility legs fail closed (supercode `run.mjs:486-491,355-357`).

**Where it does NOT fail closed / is missing:**
- **Nothing validates the constitution/vision templates were filled** (Q2). A self-driving install can run its strategy loop against a literal placeholder north star.
- **The merge gate is doctrinal, not mechanical, until a human admin applies branch protection.** The arch doc records a *negative control*: a deliberately red commit merged successfully because protection was absent (arch `:486-492`; supercode `install-notes.md:54`).
- **No hosted `doctor`; the gh-side preflight only warns** on the very things (proxy URL, protection) that make a hosted install work.
- **No whole-install "conformance audit" agent** — the arch doc proposes an OA self-audit skill and states "this entire study was a manual execution of exactly that audit" (arch `:1511-1525`). On live supercode it still does not exist as a skill/verb — only as commit-message prefixes on hand-driven repair PRs (findings-D).

---

## Q6 — What SHOWS the setup steps? Is the runbook accurate/complete?

**There are runbooks, of varying scope and accuracy; none is a complete, generic, followable "empty repo → running" guide.**

- **`docs/OPERATIONS.md#local-install-checklist`** (open-autonomy) is the canonical, ordered local checklist with a self-declared "fact-to-step completeness map" sync contract (`:70-76,663-676`), plus a `#github-production-rollout` section for hosted. This is the best single artifact.
- **`docs/INSTALL-AGENT.md`** is an agent-executable detect→ask→execute→verify playbook — but **scoped to simple-gh-sdlc on local only** (`:13-16`).
- **`README.md` + `profiles/README.md`** cover the three setups and profile-authoring (with four documented traps).
- **Accuracy caveats.** The repo carries its own brutal 2026-07-06 cold-adopter audit: "Not currently reasonable for a cold adopter" with the happy path broken at three points (`OA-INSTALL-AUDIT-FINDINGS.md:12-15`, F-1…F-17). The current tree shows a systematic fix trail, **but** README still stamps "npm 0.4.0/0.4.1 known-broken … install 0.4.2+ once published" (`README.md:7-9`), and `profiles/self-driving/README.md:12-13` still references a `public-agent.yml` workflow that does not ship — a stale doc that would actively mislead a fresh agent. On the live installs, the operator runbook was a *dangling reference* at the arch-doc freeze (`run.mjs` cited a nonexistent `docs/OPERATIONS.md`), created only later as plan item S6; supercode's own OPERATIONS.md still contains a stale "S9 not yet landed" paragraph after S9 landed (findings-D).
- **The one-shot install specs are not reusable guides.** supercode's `docs/oa-install/OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md` is a "frozen build contract" pinned to 2026-07-09 box facts; twin's governing `MIGRATION-SPEC.md` is cited by ~10 files but **isn't even in the repo** (findings-C).

---

## Q7 — Is there an AGENT that helps with setup/bootstrap?

**No shipped setup/onboarding/scaffolder agent exists.** What exists:
- **A playbook, not a product**: `docs/INSTALL-AGENT.md` is *addressed to* an agent ("installing OA onto someone's repo for them", `:8-11`) — you bring your own agent. It runs detect→ask→execute→verify and is genuinely agent-executable, but it deliberately reserves ~6 judgment calls for the human (gate confirmation, spend consent, harness-commit consent, identity, first issue, the unpause go-ahead) and forbids auto-merge without real CI. Its own last line: "It can graduate into a published OA skill (`install`) so a fleet can onboard the next repo itself" (`:523`) — **that skill does not ship.**
- **Deterministic helpers, not agents**: `scripts/provision-target-repo.ts` reconciles GitHub repo/vars/labels/protection from `provision.json` (secrets left MANUAL) — but **only simple-gh / simple-gh-sdlc / soc2-baseline ship a `provision.json`; self-driving ships none** (`PROFILE-CONFIG-AUDIT.md`). `open-autonomy harness-push` pushes harness updates past `enforce_admins`.
- **On the live installs**, the only meta-agent OA *proposes* is a conformance **auditor** over an already-existing install — it verifies, it does not install (arch `:1511-1518`). No install/bootstrap agent is even in the design frame; the arch doc never lists its absence as a gap.

Every real install was hand-driven: twin and supercode were each stood up by a supervising agent *session* executing a bespoke, box-pinned spec, leaving an `install-notes.md` **provenance record** (explicitly "not a how-to") behind.

---

## Q8 — BOTTOM LINE: could a fresh agent bootstrap OA on its own?

**No — not to a running, mission-advancing state, on any profile, without a human. Yes — to "installed + paused" on the local profiles, with a human at a handful of unavoidable consent points.**

**What a fresh agent GETS for free (real, and better than the arch-doc freeze implied):**
- One mechanical compile step with strong pre-write guards, and an authoritative `generated.json` manifest.
- A hardened, fail-closed local driver: paused fence, uncommitted-harness guard, dependency-collision probe, fail-closed singleton, wait-aware eligibility, crash-loop backoff (supercode `run.mjs`).
- Six `oa:*` operator verbs and a followable `docs/OPERATIONS.md` on the live substrate.
- The `docs/INSTALL-AGENT.md` playbook for simple-gh-sdlc-on-local, and a strong local validator ladder (`lint`→`compile` guards→`preflight`→`doctor`).

**Concrete blockers / manual-only / judgment-only steps that stop full autonomy (ranked by severity):**
1. **[P0] The documented published path is dead.** npm `latest` (0.4.1) crashes on `compile` and has no `doctor`; 0.4.2 is unpublished; the only npm version that compiles (0.3.1) predates every safety fix. INSTALL-AGENT.md's own commands (`:232,350`) fail. A fresh agent must instead take a **source checkout at HEAD** — an escape hatch documented only for OA's self-building agent — and install `bun`. Every real install (supercode, twin) was built this way, from source. *(Fatal first step; recorded verbatim in `OA-INSTALL-AUDIT-FINDINGS.md`.)*
2. **[P0] Product identity is human-authored and unvalidated.** Vision/constitution/roadmap/strategist-sources are REPLACE-THIS or empty templates (self-driving) or absent (simple-*); **no gate reads the constitution at all** — not content, not existence. A fresh agent has no way to know the North Star, and nothing stops the loop running against a placeholder.
3. **[P0/P1] The first task is human-seeded everywhere.** Boards provably drain to zero; the planner's first run is itself a manual dispatch; cold-start bottoms out in human authoring even though the *per-item* self-driving loop is agent-ratified once seeded.
4. **[P1] Hosted (self-driving) needs a deployed, funded, allowlisted model proxy** — provider keys and funding are inherently human, and there is no agent playbook, no `provision.json`, and no hosted `doctor` for this path.
5. **[P1] `bun` is an unlisted hard prerequisite** for both local SDLC profiles' dispatch, absent from the Phase-0 tool check — a silent failure a fresh agent hits only at first dispatch.
6. **[P1] `doctor` cannot prove dispatch without spending money**, WARNs pass the verdict, and it checks nothing GitHub-side — so "green doctor" ≠ "working install."
7. **[P1] The mechanical merge gate depends on a human admin applying branch protection** — proven bypassable when absent (a deliberately red commit merged); provisioning secrets is always MANUAL.
8. **[P2] Deliberately human consent points** (spend, harness-commit, identity, unpause, arming auto-merge) — tooling does not block an agent from skipping them, but the doctrine forbids it, and skipping them is exactly the failure mode ("closes issues without advancing the mission").
9. **[P2] Non-reproducible live installs & silent box traps** — `run.mjs` is a hand-fork no compile regenerates; `generated.json` goes stale; box quirks (`CC=gcc`, `NODE_ENV=production` silently no-ops ztrack, bespoke ports, ztrack npm `latest` 1.2.0 drifted past the doc-pinned 1.0.0) surface only on failure.

**What SHOULD exist and doesn't:**
- A published **`install` / bootstrap skill** (OA's own docs say it should graduate into one).
- A **whole-install validator / conformance-audit agent** that reads the install as a whole — including a **templates-filled-in check** for vision/constitution.
- A **hosted `doctor`** and **hard-fail** (not warn) gh-side preflight on `MODEL_PROXY_URL` and branch protection.
- A **self-driving `provision.json`** and **INSTALL-AGENT variants** for the hosted and fully-local paths.
- A stable, single `open-autonomy init` verb that orchestrates the npm/ztrack/termfleet/gh choreography instead of leaving it as ordered prose.

**Net:** From a **source checkout**, OA is *operable* by a fresh agent and *installable* by a strong agent with a human supervisor; it is **not autonomously bootstrappable**, and via the **published npm path it is not installable at all today**. Per OA's own frozen study, that human floor is partly by design (fresh installs land paused; the machinery a setup agent would touch is fenced under `human_required_paths`; the per-item ratification loop is intentionally agent-run once seeded) and partly a genuine, named tooling gap (no setup agent, no vision gate, no whole-install validator, an unpublished release).

---

## Appendix — key setup-critical files (open-autonomy unless noted)

| File | Role |
|---|---|
| `bin/open-autonomy.ts` | CLI front door: compile/lint/preflight/doctor/harness-push/conformance/upgrade |
| `bin/autonomy-compile.ts` | compile + pre-write guards + printed local next-steps |
| `bin/preflight.ts`, `bin/doctor.ts`, `bin/doctor-checks.ts` | env readiness + 7-check install proof (`--live`) |
| `bin/lint-profile.ts`, `bin/autonomy-conformance.ts` | profile validation, substrate conformance battery |
| `scripts/provision-target-repo.ts` | declarative GitHub provisioning; secrets left MANUAL |
| `scripts/open-autonomy-preflight.ts` | gh-install readiness (warns on vars/labels/protection) |
| `packages/substrate-local/src/emit.ts` | scheduler, paused marker, uncommitted-harness guard |
| `profiles/*/{ir.yml,provision.json,skills,standards}` | per-profile decision surface |
| `profiles/self-driving/docs/{CONSTITUTION,PROJECT,ROADMAP}.md` | consumer vision/constitution/roadmap TEMPLATES |
| `docs/OPERATIONS.md`, `docs/INSTALL-AGENT.md` | canonical local checklist / installing-agent playbook |
| `OA-INSTALL-AUDIT-FINDINGS.md`, `PROFILE-CONFIG-AUDIT.md` | OA's own honest gap record |
| `services/agent-model-proxy/` | hosted model-token proxy (deploy + OIDC allowlist prereq) |
| supercode `scheduler/run.mjs`, `package.json` (`oa:*`), `docs/OPERATIONS.md` | live local-runner substrate + operator verbs |
| supercode `.open-autonomy/install-notes.md`, `docs/oa-install/OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md` | one-shot install provenance/contract (not reusable guides) |
| twin `profiles/twin-sdlc/`, `docs/CONSTITUTION.md`, `duties.json`/`roadmap.json`/`spec-sources.json` | a real consumer's bespoke, hand-authored install artifacts |

*Companion evidence: `findings-A-open-autonomy.md`, `findings-B-arch-doc.md`, `findings-C-twin.md`, `findings-D-supercode-substrate.md` (study workdir).*
