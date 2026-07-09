# OA `simple-gh` + supercode install — the frozen MAXIMAL spec (U1–U15)

**Recorded:** 2026-07-09 · **Status:** frozen build contract, committed for durability. This document is the full, maximal form of `INSTALL-SPEC.md` (rev 3, post-skeptic: two default-refuted Fable-5 passes this session — 10 findings applied, delta-verified, the U7 dispatch-doctrine clause added last). Every unit U1–U15 is specified NOW, including the units that execute last. Where this document and the study disagree, this document wins (it carries the re-verified 2026-07-09 environment facts).

**Authorities, in order:**
1. `OA-SIMPLE-GH-PRESET-AND-SUPERCODE-INSTALL.md` (the greenlit study, 2026-07-08) — the design authority.
2. The canonical repos: `open-autonomy` (main @ `65d4399`; U1 work branch `simple-gh-profile` @ `d76a155`), `supercode` (main @ `add49ca`), `twin` (main @ `a0b2aad`, the reference install), `ztrack` (workflow backbone, pinned `1.0.0`).
3. The session brief: autonomy/escalation/concurrency rules — max-1-subagent spec phase, ≤2 in build; escalate only genuinely irreversible/external acts; stop cleanly if the weekly usage limit fires.

**Objective (owner-greenlit, "all 3"):**
- **G1** — author + land the `simple-gh` profile in open-autonomy via its governed main.
- **G2** — the adoption-ease dogfood (design-gap issues, release prep, findings report).
- **G3** — the real working install of OA into supercode via `simple-gh` on the local substrate, proven on a real board item.

**Provenance discipline of this document:** every `file:line` citation below was re-opened and re-verified on 2026-07-09 against the repo states named above; drifted line numbers from earlier revisions were corrected in place (the corrections are listed in [Appendix A](#appendix-a--citation-verification-log)). OA citations are against **main @ `65d4399`** unless marked `[branch]` (= `simple-gh-profile` @ `d76a155`).

---

## Environment facts (live-verified 2026-07-09, superseding the study where noted)

| Fact | Value | Consequence |
|---|---|---|
| open-autonomy HEAD | main `65d4399` (unchanged since study); U1 branch `simple-gh-profile` @ `d76a155` | study citations remain valid (re-verified in Appendix A: `ir.ts` merge boundary, `autonomy-compile.ts` `--provider-url`, copy-source validation, `human-required-paths.json`) |
| supercode HEAD | `add49ca` (moved from studied `c616803`; UX waves 6–10 + rust 1.96.1 CI hardening) | install-relevant facts RE-VERIFIED at `add49ca`: CI job display name `test + clippy + fmt` unchanged (`supercode/.github/workflows/ci.yml:12-13`); `package.json` = ztrack `1.0.0` only (`supercode/package.json:4`); tracker-config unchanged (`supercode/.volter/tracker-config.json`: backend `markdown`, teamKey `SUP`, validation installedFrom `simple-sdlc`) |
| GitHub identity | `otto-runhuman`; token scopes `gist, read:org, repo, workflow`; **push=true, admin=FALSE on both repos** (re-checked live via `gh api repos/.../{open-autonomy,supercode}` on 2026-07-09) | can branch/PR/merge; CANNOT read or PUT branch protection settings (G3-U11 becomes attempt→escalate) |
| OA main protection (read via `branches/main`, non-admin view; re-checked live 2026-07-09) | protected; required contexts **`ci`, `agent-review`, `human-approval`**; enforcement active for non-admins | the G1 PR must turn all three green; the brief's "ci/agent-review/security" was wrong — `security` runs but is NOT a required context |
| OA human-required scope | `open-autonomy/.open-autonomy/human-required-paths.json` (16 entries): `.github/workflows/**`, `.open-autonomy/autonomy.yml`, `docs/CONSTITUTION.md`, `.open-autonomy/architecture-invariants.yml`, `.codex/skills/**`, `.claude/skills/**`, `**/bun.lock`, 8 named gate scripts. **No `profiles/**` glob** | a `profiles/simple-gh/**` + `profiles/README.md`-only PR auto-passes `human-approval`; MUST NOT touch `bun.lock`, `.claude/skills/**`, or workflows |
| OA `agent-review` | posted by `open-autonomy/.github/workflows/reviewer.yml` — `pull_request_target` trigger (`:8`); job gate `vars.PUBLIC_AGENT_REPO_PAUSED != 'true'` + fires for same-repo or OWNER/MEMBER/COLLABORATOR PRs (`:34`); active as of PR #123 (2026-07-08) | an independent AI review gate we don't control; a FAIL verdict = rework the PR |
| supercode main protection | **NONE** (`protected: false`, re-checked live 2026-07-09) | harness commit can land direct to main (matches study §4 step 5, which commits pre-protection anyway); protection wiring = G3-U11 escalation |
| npm | `ENEEDAUTH` — not logged in (re-checked live 2026-07-09) | 0.4.2 publish (study NEXT STEPS 5) is BLOCKED on operator; clone-install is the canonical tool path for G3 (the study's own fallback), recorded as F-A evidence |
| claude CLI | signed in (claude.ai, chris@volter.ai, firstParty) | termfleet-launched manager sessions work; they share the SAME weekly usage pool that killed the prior session — usage is a live risk, budget the first cycle tightly |
| Box | `NODE_ENV=production` exported (the OA-06 trap — export `development` for all install steps); node 22.23.1; bun 1.3.14; tmux 3.3a; rustup with stable 1.85.0 (supercode is edition 2021 → builds; CI's 1.96.1 clippy is authoritative — `rustup update stable` before the first cycle if local clippy/CI skew bites) | |
| Concurrency | Edmund box shared with sessions 862+863; a peer box OOM'd at 6 heavy subagents | HARD CAP: 1 subagent at a time (spec phase), ≤2 in build (sequential builder→reviewer preferred); during the live loop (U13–U14) run NOTHING else |
| Prior session artifacts | study doc only; no pushed branches, no worktree dirt, no memory files | the build started from the study, zero code recovered |
| OA release state | `open-autonomy/VERSION` = `0.4.1`; `package.json:3` = `0.4.1`; git tags end at `v0.4.1`; npm `0.4.0`/`0.4.1` known-broken on `compile` (OA-01; banner `docs/INSTALL-AGENT.md:3-5` says "install 0.4.2+ once published") | F-A is live: the fixed release exists in source but was never cut — U5's whole reason to exist |

---

## STATUS ledger (as of recording, 2026-07-09)

| Unit | Status | Detail |
|---|---|---|
| **U1** | **BUILT @ `d76a155`** ("Add simple-gh profile: single-manager GitHub PR loop", branch `simple-gh-profile` in the OA clone) — **in review-fix** | Reviewer findings being applied before U3: (1) `provision.json` must carry the `required_secrets`/`variables`/`labels` keys (twin's manifest shape — `twin/profiles/twin-sdlc/provision.json:5-8`); (2) `agent-visual-verify.ts` added to the human-required set; (3) a Scope/untrusted-instructions section added to the manager SKILL.md; (4) `oa-review` verdicts must be sha-bound (verdict names the head SHA it certifies); (5) 4 minor findings. |
| U2 | pending | Gallery entry text exists on the branch; the AC (`bun run check` green wholesale) is uncertified until the review-fix lands. |
| U3–U15 | pending | All specified in full below; none started. |

---

# G1 — the `simple-gh` profile in open-autonomy

## U1. Author `profiles/simple-gh` (complete file set)

**Provenance.**
- Profile model, auto-discovery, and the copy-source contract: `open-autonomy/profiles/README.md:3-8` ("Profiles are substrate-agnostic recipes … `compile(profile, substrate) → installation`"); auto-discovery of any `profiles/<name>/ir.yml`: `open-autonomy/bin/bundled-profiles.ts:19-27`; every `resources:` entry must exist as a physical copy source — `lint`/`compile` validate existence before writing anything: `open-autonomy/profiles/README.md:219-222` + `open-autonomy/bin/autonomy-compile.ts:172-178` (pre-materialize `missingCopySourcesIn`, exit 1, "nothing written").
- The merge boundary the design works within: `open-autonomy/packages/core/src/ir.ts:118-129` (`code:merge` is gate-only — "no agent may merge"); `ir.ts:130-134` (no agent may hold both `code:review` and `code:propose`); `ir.ts:141-150` (a `review:` edge is validated only IF PRESENT — a propose-only agent is valid IR).
- The SKILL.md silent-dead trap (frontmatter `name` == folder == behavior): `open-autonomy/profiles/README.md:76-99`; enforced pre-write by `validateSkillFrontmatterIn` via `open-autonomy/bin/autonomy-compile.ts:180-186` and `bin/lint-profile.ts:1-14`.
- `policy.box` reader convention (every key has a reader or doesn't exist; agent-at-runtime readers legal): `open-autonomy/profiles/README.md:166-176`.
- Single-actor / model-tiering grounding: the local substrate has no per-agent model routing — `twin/scripts/runner-defaults.mjs:1-6` (only `{cli, harness, timeouts}`; default harness `claude`), `twin/scripts/run-agent.mjs:10` (harness selected only via `TERMFLEET_AGENT`); the gh substrate's model knob has no local counterpart (`open-autonomy/profiles/README.md:182`, `gh-actions.model`). Model tiering is realizable today only at the harness's subagent-dispatch seam (study §2.1 Decision 1).
- Landing model precedent: `twin/profiles/twin-sdlc/ir.yml:1-15` (fork header; "landing is OWNER-DECIDED … a human merges every green PR by hand; auto-merge stays disabled repo-wide"); `twin/profiles/twin-sdlc/ir.yml:197-200` (`rearm-auto-merge.ts` deliberately not carried).
- Deliberate merge.yml/reconcile omission grounding: `open-autonomy/profiles/simple-gh-sdlc/scripts/reconcile-merged-issues.ts:10-14` (hard-requires `GITHUB_REPOSITORY`, walks merged PRs via `gh`, closes GH issues — GitHub-Issues-only machinery; in `simple-gh` the board is the local ztrack store and the manager flips state itself); the `check:profiles` resource byte-identity guard only records resources from `gh-actions`-target compiles (`open-autonomy/bin/check-profiles.ts:56-62`, drift guard `:84-103`), so a local-only merge.yml variant would escape it — another reason not to carry one.
- ztrack preset declaration (BL-29): `open-autonomy/bin/ztrack-preset.ts:13` (`KNOWN_GOOD_ZTRACK = '1.0.0'`) and `:23-41` (`policy.box.tracker.ztrackPreset` wins if declared; basename fallback loud-degrades when not a bundled name); fork warning precedent `open-autonomy/profiles/simple-gh-sdlc/ir.yml:74-80`.
- Doctrine sources: `.open-autonomy/autonomy.yml` as the one policy source, mirroring `open-autonomy/profiles/simple-gh-sdlc/skills/pm/SKILL.md:26-28`; plans-as-docs via ztrack document sources `ztrack/README.md:309-345`; dispatch frontier vs dispatch set — `ztrack/README.md:107-112` (`--actionable` = the backlog-burndown door) with `--actionable` being status-blind (skeptic finding 2), hence the doctrine amendment below; PR-coupled done-discipline grammar `ztrack/boilerplates/presets/simple-gh-sdlc.ts:12-17` (lifecycle), `:560-567` (evidence-at-PR-head), `:582-594` (`review_requires_pr`, `done_requires_merged_pr`).
- Honesty-section grounding: single-token reality + branch-protection-is-the-real-gate `open-autonomy/docs/INSTALL-AGENT.md:25-33` (no independent reviewer on one token) and `:34-44` (the ranking: real CI in the gate #1, `enforce_admins:true` #2); Claude-harness-only tiering (default harness `claude`, `twin/scripts/runner-defaults.mjs:1-6`; `TERMFLEET_AGENT=codex` degrades to single-model, `twin/scripts/run-agent.mjs:10`).
- Study: §2.1 Decisions 1–4, §2.2 (the exact file set + ir.yml sketch + SKILL.md doctrine sketch + provision.json sketch), NEXT STEPS 1.

**Precondition:** `NODE_ENV=development bun install` in the OA clone (no `node_modules` exists on a fresh clone; every AC command imports `@open-autonomy/*` workspace packages).

**Contract.** Exactly the study §2.2 file set: `ir.yml`, `README.md`, `provision.json`, `skills/manager/SKILL.md`, `standards/{workflow,issue-and-evidence,risk-and-review}.md`, `.claude/settings.json` (physical copy source, ztrack Stop-hook wiring modeled on `simple-gh-sdlc`'s). `ir.yml` per the study sketch: `schema: autonomy.ir.v1`; `targets: [local]`; `codeHost: github`; ONE agent `manager` (`behavior: manager`, capabilities `[code:propose, tasks:author, tasks:converse]`, cron `*/30 * * * *`); `policy.maxConcurrent: 1`; `policy.box.tracker.ztrackPreset: simple-gh-sdlc`; `policy.box.models.{research: strongest, implement: capable}`; `policy.box.manager.{merge_policy: manual-after-review, max_rework_attempts: 2}`; `policy.box.risk.{human_required_paths, human_required_topics}` per the study; `resources: [.claude/settings.json, standards/workflow.md, standards/issue-and-evidence.md, standards/risk-and-review.md]` — deliberately NO merge.yml / reconcile-merged-issues.ts / security surface (the README documents the omission + the re-add condition per study §2.2: enabling `ztrack init --sync github` ⇒ re-add both, sourcing twin's no-arming merge.yml variant, never the auto-merge-arming one). `SKILL.md` frontmatter `name: manager` (== folder == behavior — the silent-dead trap). Doctrine = the study's 7 numbered points verbatim in intent (identity/fences, board, research-and-plan docs, worktree implement, land-after-green+review, close-with-PR-line, risk stops) — with one amendment to point 2 (skeptic finding 2 applied at the source): **the dispatch set is issues in `ready` state ONLY; `--actionable` is the advisory frontier, not the dispatch set** (ztrack `--actionable` is status-blind — any not-done unblocked issue qualifies). The README honesty section MUST state: the single-credential reality + branch-protection-is-the-gate; Claude-harness-only model tiering (codex degrades to single-model); the merge.yml omission + re-add condition; abstract model labels owned by SKILL.md. *(Review-fix additions now in flight — see STATUS ledger: provision.json manifest-shape keys, agent-visual-verify.ts in human-required, Scope/untrusted-instructions section, sha-bound `oa-review` verdicts.)*

**Acceptance criterion.** `bun bin/lint-profile.ts profiles/simple-gh` clean (incl. copy-source existence). `bun bin/autonomy-compile.ts profiles/simple-gh local /tmp/.../kit` materializes `scheduler/run.mjs`, `scripts/runner.ts`, `.claude/skills/manager/SKILL.md`, `.codex/skills/manager/SKILL.md`, `.open-autonomy/{autonomy.yml,generated.json,paused}`, the 3 standards, `.claude/settings.json` — and does NOT contain `merge.yml`/`reconcile-merged-issues.ts`. `node --check` passes on the emitted `scheduler/run.mjs`. `autonomy.yml` shows `codeHost: github`, the single manager, all box keys.

## U2. Repo gates + gallery

**Provenance.**
- `check:profiles` smoke-compiles every `profiles/<name>/ir.yml` to each declared target: `open-autonomy/profiles/README.md:283` ("Every profile in this directory is smoke-checked by `check:profiles`"); wired into `bun run check` via `open-autonomy/package.json:45,55`. This is what makes OA's governed CI genuinely test the install, not hollow green.
- `check:policy-consumers` (every `policy.box` key must have a reader): `open-autonomy/profiles/README.md:166-176`; `open-autonomy/package.json:46`.
- `check:provision` (forbids model-selection `variables` in provision manifests): `open-autonomy/bin/check-provision.ts:1-19` (`isModelSelectionVar` = `PUBLIC_AGENT_*_(MODEL|MODELS|PROVIDER)`); `open-autonomy/package.json:51`.
- Gallery + contrast-table shape: `open-autonomy/profiles/README.md:250-282` (main baseline: `hello`/`self-driving`/`simple-sdlc`/`simple-gh-sdlc` entries; `soc2-baseline` at `:273-282`); study §2.3 contrast table.
- Study: NEXT STEPS 2.

**Contract.** `bun run check` green wholesale on the branch — `check:profiles` (auto-discovers the new ir.yml and smoke-compiles it), `check:policy-consumers` (every new box key — `models.research`, `models.implement`, `manager.merge_policy`, `manager.max_rework_attempts` — literally read in `skills/manager/SKILL.md` prose; `tracker.ztrackPreset` already has readers), `check:provision` (the new provision.json declares no model-selection variables). Gallery entry appended to `profiles/README.md` with the honesty paragraph (single identity; real-CI-as-gate; manager-merges = twin's landing model, agent-executed; Claude-harness-only tiering) and the contrast row vs `simple-gh-sdlc`/`soc2-baseline`.

**Acceptance criterion.** `bun run check` exits 0 locally with `NODE_ENV=development`. Gallery entry present and cites the merge-flow difference.

## U3. Land via OA's governed main (the flow it encodes)

**Provenance.**
- Required contexts on OA main: `ci`, `agent-review`, `human-approval` (live-read via `gh api repos/volter-ai/open-autonomy/branches/main`, re-verified 2026-07-09).
- `human-approval` auto-passes for this file set: `open-autonomy/.open-autonomy/human-required-paths.json` has no `profiles/**` glob (verified — 16 entries, listed in the environment-facts table).
- `agent-review` fires for same-repo PRs and is not paused: `open-autonomy/.github/workflows/reviewer.yml:8` (`pull_request_target`), `:34` (gated on `vars.PUBLIC_AGENT_REPO_PAUSED != 'true'`; same-repo or OWNER/MEMBER/COLLABORATOR).
- The develop-on-main doctrine being deliberately overridden: `open-autonomy/CLAUDE.md:20` ("Develop directly on `main` — never branch"); precedent for the PR route: PR #123 (merged as `65d4399`), whose governed CI caught a real order-dependence bug pre-merge (commits `aac269d`, `134eb53`).
- Non-admin merge legality: push=true on the repo; merge allowed once required checks are green (admin=false forbids only protection administration and `--admin` bypass).
- Study: NEXT STEPS 3.

**Contract.** Branch `simple-gh-profile` → push → PR to `volter-ai/open-autonomy` main. PR body: notes the deliberate override of `CLAUDE.md:20` develop-on-main doctrine (PR #123 precedent), the merge.yml omission rationale, and the harness assumption. Wait for required contexts `ci` + `agent-review` + `human-approval` green. If `agent-review` FAILS: treat as a real review, rework (≤3 attempts), re-push. Merge via `gh pr merge --squash` (non-admin merge is legal once required checks are green). NEVER `--admin`, never direct-push main.

**Acceptance criterion.** Merged PR on OA main; `git pull` shows `profiles/simple-gh/` at main; the PR's checks tab shows the three required contexts SUCCESS, with `ci` = `bun run check` (which smoke-compiled the new profile — verified non-hollow by reading the run log for the `check:profiles` line).

---

# G2 — adoption dogfood

## U4. File the two design-gap issues on OA's board

**Provenance.**
- The gaps being filed: F-B (preset-migration story — `twin/profiles/twin-sdlc/ir.yml:10-14`: declared grammar `simple-gh-sdlc` vs installed tracker staying `simple-sdlc` "for ledger compatibility with 48 pre-existing done items"; the PR-coupled rules that make retro-validation fail: `ztrack/boilerplates/presets/simple-gh-sdlc.ts:582-594`) and F-E (landing-model vocabulary — the IR cannot declare who lands PRs; it can only stay silent: `open-autonomy/packages/core/src/ir.ts:118-129`).
- Board placement (skeptic finding 4): OA's self-driving PM dispatches any clear+scoped open GH issue regardless of labels — so the issues go on OA's ztrack LOCAL board (`open-autonomy/.volter/tracker`, the maintainers' planning board, not loop-dispatched; existing convention: `open-autonomy/ADOPTION-FIXES-BACKLOG.md:11-17` — the OA-NN catalog lives as `LOCAL-*` issues on that board).
- Because the LOCAL board lives IN the OA repo, landing the issues = a governed PR (same constraint as U3).
- Study: NEXT STEPS 4 (verbatim).

**Contract.** File on **OA's ztrack LOCAL board** (`open-autonomy/.volter/tracker`, teamKey `LOCAL`) as `ready` `LOCAL-*` issues in the board's grammar — NOT GitHub Issues. (a) **preset-migration story** (F-B) — a documented/ztrack-assisted path for switching a populated ledger's validation preset, canonicalizing twin's declared-grammar/installed-preset split; (b) **landing-model vocabulary** (F-E) — IR/manifest declaration of who lands PRs (`auto | operator | manager-deputy`). Each cites the study + this install as provenance, with ACs. Because the LOCAL board lives IN the OA repo, the issues land via a governed PR — fold them into U6's findings PR (execution therefore moves after G3; the unit stays defined here).

**Acceptance criterion.** Two `LOCAL-*` issues with ACs and provenance on OA main after U6 merges, valid under `ztrack check`.

## U5. Release 0.4.2 — prepare to the line, escalate the publish

**Provenance.**
- The release gap (F-A, "the fixes are real, the shipping is not"): `open-autonomy/VERSION` = `0.4.1`; `open-autonomy/package.json:3` = `0.4.1`; git tags end at `v0.4.1`; the doc banner "install 0.4.2+ once published" `open-autonomy/docs/INSTALL-AGENT.md:3-5`; the OA-01 DOA-publish catalog line `open-autonomy/ADOPTION-FIXES-BACKLOG.md:13`.
- The publish gate that now exists: `open-autonomy/package.json:40` (`prepublishOnly = build && check:release-consistency && check:pack-smoke`); `open-autonomy/scripts/pack-smoke.ts:1-15` (packs the tarball, installs it into a throwaway project, runs every CLI verb under plain node) and `:146-166` (compiles `simple-sdlc local .` from the packed tarball — the audit's exact failing command — and pins the version-stamped next-steps output).
- Release process: `open-autonomy/RELEASING.md` (exists at repo root; the OA-15 reconciled bump process).
- The blocker: npm `ENEEDAUTH` (live-verified 2026-07-09). The publish is the brief's one legal human-escalation.
- Study: NEXT STEPS 5 (incl. the from-registry smoke `npx --yes open-autonomy@latest compile hello local`).

**Contract.** npm auth is absent → the publish is the spec's ONE legal human-escalation. Prepare everything: release branch `release-0.4.2` off post-U3 main with `package.json` version, `VERSION`, and version stamps reconciled (RELEASING.md/OA-15 process), `bun run check` green, `npm pack` smoke: run the actual `prepublishOnly` gate (`scripts/pack-smoke.ts`, which compiles `simple-sdlc local` from the packed tarball) AND, as an extra step from the same tarball in a clean tmp dir, the study's `compile hello local` smoke. Open the PR but mark it **do-not-merge-until-publish-authority** in the body (bump-without-publish = version drift; OA-15). Escalation note in the final report: the exact operator commands (`npm login && npm publish && git tag v0.4.2 …`).

**Acceptance criterion.** Release PR open with green `ci`; pack-smoke output recorded; escalation block written. (If publish authority materializes mid-session, execute fully: publish, tag, `npx --yes open-autonomy@latest compile hello local` from-registry smoke, INSTALL-AGENT.md banner update.)

## U6. Findings report back into OA

**Provenance.**
- The docs convention target: `open-autonomy/docs/adoption-fixes/` (existing directory carrying the OA-01…OA-18 specs + proofs, per `ADOPTION-FIXES-BACKLOG.md:11-17`).
- The known stale doc text to fix in the same PR: the runner-deps line instructs `termfleet` only (`open-autonomy/docs/INSTALL-AGENT.md:209`) while the emitted backend bare-imports `@termfleet/core/local-providers.js` (`open-autonomy/packages/substrate-local/src/backend.mjs:8,16-17`) and twin explicitly added both deps (`twin@a0b2aad` commit message: "add termfleet + @termfleet/core runner deps") — F-C/OA-19 candidate.
- The guards whose live firing gets recorded: OA-06 NODE_ENV (`open-autonomy/bin/preflight.ts:7,73-160` — effective-omit detection), OA-07 paused fence (`open-autonomy/packages/substrate-local/src/emit.ts:106-122`), OA-09 provider pin/identity (`open-autonomy/bin/autonomy-compile.ts:12-15`, `bin/doctor-checks.ts:562-575`), OA-18 doctor (`open-autonomy/docs/INSTALL-AGENT.md:347-356`).
- Landing constraint: same governed flow as U3 (OA main protection, live-verified).
- Study: NEXT STEPS 10.

**Contract.** After G3 completes, write `docs/adoption-fixes/supercode-install-findings.md` (or per OA's existing docs convention) recording: which guards fired live (OA-06 NODE_ENV, OA-07 paused fence, OA-09 provider pin/identity, OA-18 doctor), which frictions materialized (F-A clone path used — release uncut; F-B preset-reality note applied; F-C both-deps + non-JS texture; F-D ztrackPreset declared; F-E landing vocabulary gap), timings, any NEW failure modes. Land via a second governed PR (same U3 flow). Where the walk exposed stale doc text (the `bun add termfleet`-only line, `INSTALL-AGENT.md:209`), fix the doc text in the same PR (doc fix = OA-19 candidate executed, not just filed). This PR also carries U4's two `LOCAL-*` issues.

**Acceptance criterion.** Merged PR on OA main containing the findings doc + the doc fix; every documented friction has a fix, an issue (U4), or an explicit accepted-as-is line.

---

# G3 — the supercode install

## U7. Adapted profile in supercode

**Provenance.**
- The adapt-don't-ship-generic doctrine: `twin/docs/INSTALLING-OA-PROFILES.md:56-70` ("ADAPT the governance to the TARGET's objectives … a required step, not optional polish"); the fork-header convention `twin/profiles/twin-sdlc/ir.yml:1-15`; twin's own-sensitive-surfaces / anti-self-blessing additions incl. `profiles/twin-sdlc/**` itself: `twin/profiles/twin-sdlc/ir.yml:157-187`.
- The real gate to bind: `supercode/.github/workflows/ci.yml:21-26` (`cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --all`); the required-check context = the job display name `test + clippy + fmt` (`ci.yml:12-13`).
- Board priority order: `supercode/.volter/tracker/markdown/BACKLOG-INDEX.md:9-13` (PARITY: 18 open correctness items; UX; SUP/TR legacy).
- The ztrack-preset-reality note (F-B): installed validation preset stays `simple-sdlc` (`supercode/.volter/tracker-config.json` — validation installedFrom `simple-sdlc`; ~100 items); precedent `twin/profiles/twin-sdlc/ir.yml:10-14`; the retro-failing rules a switch would trip: `ztrack/boilerplates/presets/simple-gh-sdlc.ts:582-594`.
- The dispatch-only-ready doctrine (skeptic finding 2, applied at both the OA source in U1 and the fork here): ztrack `--actionable` is status-blind (any not-done, unblocked issue qualifies — `ztrack/README.md:107-112`, the backlog-burndown door), so dispatch keys on STATUS.
- Provision manifest shape: `twin/profiles/twin-sdlc/provision.json:5-13` (`required_secrets`/`variables`/`labels` + `branch_protection` with `required_checks`, `enforce_admins: true`); consumed by OA's `scripts/provision-target-repo.ts`.
- Mission pointer: supercode `AGENTS.md`'s ranked priorities (study §4 step 1, "translate / emulate-continue / reduce").
- Study: §4 step 1, NEXT STEPS 6.

**Contract.** `supercode/profiles/simple-gh/` = fork of the U3-landed OA profile with: fork-point header (OA main post-U3 SHA); supercode `risk.human_required_paths` ADDITIONS: `AGENTS.md`, `CLAUDE.md`, `SPEC.md`, `.volter/tracker/validation/**`, `crates/core/tests/roundtrip_regression.rs`, `profiles/simple-gh/**` (anti-self-blessing, twin-style) on top of the base harness list; `standards/workflow.md` bound to the real gate `cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test --all` and the board priority order (PARITY correctness first, then UX), and carrying — **in both `standards/workflow.md` and the manager SKILL.md** — the dispatch doctrine: "dispatch ONLY `ready`-state issues; the frontier list (`--actionable`) is advisory, not the dispatch set" (U13 merely verifies this is present); `standards/issue-and-evidence.md` with the **ztrack preset reality** note (installed validation preset STAYS `simple-sdlc` for ledger compatibility with ~100 items; PR-line + merged-PR-for-done discipline enforced by manager doctrine — twin `ir.yml:10-14` precedent, F-B); `provision.json` `required_checks: ["test + clippy + fmt"]`, `enforce_admins: true`, private; manager skill mission section pointing at supercode `AGENTS.md`'s ranked priorities.

**Acceptance criterion.** `bun /workspace/oasc/open-autonomy/bin/lint-profile.ts profiles/simple-gh` clean from the supercode root; dry-run `autonomy-compile.ts profiles/simple-gh local` (no outDir) lists the expected kit; the dispatch-only-ready doctrine text present in both `standards/workflow.md` and the manager SKILL.md.

## U8. Deps + preflight (+ the tracker no-op, made explicit)

**Provenance.**
- Both deps required: the emitted runner backend bare-imports `@termfleet/core/local-providers.js` (`open-autonomy/packages/substrate-local/src/backend.mjs:16-17`; the header at `:8` says the install "must have `termfleet` (+ `@termfleet/core`) in node_modules"); twin added both (`twin@a0b2aad` commit message); the docs' `termfleet`-only instruction (`open-autonomy/docs/INSTALL-AGENT.md:209`) is the F-C doc gap U6 records and fixes.
- Lockfile-diff discipline (OA-17): `open-autonomy/docs/INSTALL-AGENT.md:246-248,258` (surface pre-existing pin rewrites before committing).
- Preflight incl. the OA-06 NODE_ENV/effective-omit check and the PTY probe: `open-autonomy/bin/preflight.ts:7,73-160`; this box exports `NODE_ENV=production` — the exact OA-06 trap (environment-facts table).
- Clone tool path = F-A evidence: study NEXT STEPS 7 ("tool selection is conditional on step 5"; registry `0.4.2` does not exist — npm ENEEDAUTH live-verified).
- Tracker no-op: `ztrack init` is a silent no-op with `.volter/` present (`open-autonomy/docs/INSTALL-AGENT.md:464-466`); supercode's tracker stays backend `markdown`, teamKey `SUP`, validation `simple-sdlc` (`supercode/.volter/tracker-config.json`) — study §4 step 4.
- Stop-conditions already cleared at detection: `package.json` exists (`open-autonomy/docs/OPERATIONS.md:99-101` no-package.json stop) and real PR CI exists (`docs/INSTALL-AGENT.md:143-146` no-PR-CI stop) — see study §3.2 Phase-1 walk, re-verified at `add49ca`.
- Study: §4 steps 2 + 4, NEXT STEPS 7.

**Contract.** `export NODE_ENV=development`; `bun add termfleet @termfleet/core` (BOTH — backend bare-imports `@termfleet/core/local-providers.js`; twin precedent; docs gap recorded for U6); inspect `git diff package.json bun.lock` (OA-17); run `bun /workspace/oasc/open-autonomy/bin/preflight.ts` (clone path = F-A evidence). Tracker: deliberately NO `ztrack init` and no preset switch — the existing tracker (backend `markdown`, teamKey `SUP`, validation `simple-sdlc`) IS the board; `ztrack init` would be a silent no-op anyway (`INSTALL-AGENT.md:464-466`), and the preset stays per U7's preset-reality note (F-B).

**Acceptance criterion.** Preflight PASS (incl. the OA-06 NODE_ENV check and PTY probe); both packages resolve (`node -e "import('@termfleet/core/local-providers.js')"` or equivalent resolution proof); `.volter/tracker-config.json` unchanged.

## U9. Ports → pinned compile → kit verification

**Provenance.**
- Port-first, abort-if-answering: `open-autonomy/docs/INSTALL-AGENT.md:288-300` (an already-answering `/healthz` is a hard ABORT — the probe can't prove the occupant is yours; repo-unique prefix/ports, never the box defaults 7373/7402).
- The durable pin: `open-autonomy/bin/autonomy-compile.ts:12-15` (`--provider-url` emits a DURABLE `TERMFLEET_PROVIDER_URL` into `scheduler/schedule.json`'s `env`, surviving new shells/supervisors/re-runs; ambient env still overrides at runtime); the CLI's own next-steps instructs exactly this pin-recompile (`bin/autonomy-compile.ts:344-345`); the unpinned fallback hazard: `resolveDefaultProvider` auto-discovery (`open-autonomy/packages/substrate-local/src/backend.mjs:17`) could land on the LIVE fleet's provider (F-8; fleet-isolation is MANDATORY — `twin/docs/INSTALLING-OA-PROFILES.md:72-84`); pin emission `open-autonomy/packages/substrate-local/src/emit.ts:561-567`.
- Kit shape: U1's AC file set; the authoritative manifest is `.open-autonomy/generated.json` (`open-autonomy/packages/core/src/file-manifest.ts:14`; the under-install tell `twin/docs/INSTALLING-OA-PROFILES.md:22-24`).
- The paused-not-in-manifest subtlety (skeptic finding 8): `open-autonomy/packages/substrate-local/src/emit.ts:602-613` — the pause marker is added AFTER `withGeneratedManifest` computes the manifest, deliberately never recorded there (so prune can never silently unpause a running install); seeded on fresh installs only.
- Study: §4 step 3, NEXT STEPS 7.

**Contract.** Choose `TF_PREFIX=supercode-oa` console+provider ports with `/healthz` NOT answering (answering ⇒ ABORT, pick others); compile with the durable pin: `bun <OA>/bin/autonomy-compile.ts profiles/simple-gh local . --provider-url http://127.0.0.1:<provider-port>`.

**Acceptance criterion.** Emitted kit matches U1's file set; `.open-autonomy/generated.json` enumerates it EXCEPT `.open-autonomy/paused`, which emit.ts deliberately omits from the manifest — verify `paused` exists separately; `scheduler/schedule.json` `.env.TERMFLEET_PROVIDER_URL` equals the chosen URL; NO `merge.yml`/`reconcile-merged-issues.ts`; `node --check scheduler/run.mjs` passes.

## U10. Commit the harness to main

**Provenance.**
- Explicit-path staging discipline, never `git add -A`, gitignore append, HARD-STOP if no harness path staged: `open-autonomy/docs/INSTALL-AGENT.md:238-257` (the canonical block, incl. `git diff --cached package.json` before commit).
- Direct-to-main is legal and expected here: supercode main is unprotected (live-verified `protected: false`), and the study's own sequence commits before protection (study §4 step 5; `docs/INSTALL-AGENT.md:206`: "commit the harness first, wire the gate last").
- Post-push CI expectation: `open-autonomy/docs/INSTALL-AGENT.md:258-261` (whole-tree-linting CI could go red on the TS harness — supercode's cargo-only CI ignores it: `supercode/.github/workflows/ci.yml:15-26` has no JS/TS steps); expected green.
- No `.github/` changes to stage: simple-gh carries no workflows (U1 contract).
- Study: §4 step 5, NEXT STEPS 7.

**Contract.** Stage EXPLICIT paths only (`.claude .codex scheduler scripts standards .open-autonomy profiles/simple-gh package.json bun.lock` + gitignore append for `.worktrees/`/runner-state; NO `.github/` changes); HARD-STOP if no harness path staged; commit `chore: install open-autonomy (simple-gh, local runner)`; push to main (unprotected — and the study's own sequence commits before protection); confirm supercode CI green on main (cargo-only CI ignores the TS harness).

**Acceptance criterion.** Commit on `volter-ai/supercode` main whose file list = `generated.json` entries + the expected extras outside the manifest (`.open-autonomy/paused`, the adapted profile dir, `package.json`+`bun.lock`, the `.gitignore` append) and nothing else; post-push `ci` run green.

## U11. Branch protection — attempt, then escalate

**Provenance.**
- The documented PUT + read-back: `open-autonomy/docs/INSTALL-AGENT.md:266-281` (validate contexts, PUT `branches/<default>/protection` with `enforce_admins: true`, `required_pull_request_reviews: null`, then read back; errors on non-admin/under-scoped token → STOP, tell human).
- The expected failure: otto-runhuman has admin=FALSE on supercode (live-verified 2026-07-09) — protection administration requires admin.
- Never auto-merge: the simple-gh landing model (study §2.1 Decision 2; `twin/profiles/twin-sdlc/ir.yml:1-15` — auto-merge disabled repo-wide); INSTALL-AGENT's arm-auto-merge step (`docs/INSTALL-AGENT.md:402-407`) is explicitly NOT followed — that step belongs to `simple-gh-sdlc`'s model, not this profile's.
- The behavioral control while the mechanical one is missing: the manager doctrine (green-required-checks + recorded review before merge — U1 doctrine point 5).
- If the PUT unexpectedly succeeds: subsequent operator harness updates need `open-autonomy harness-push` (relax→push→always restore; `open-autonomy/docs/INSTALL-AGENT.md:486-490`) — record this in the install notes.
- Study: §4 step 6, NEXT STEPS 7.

**Contract.** Attempt the documented PUT (`repos/volter-ai/supercode/branches/main/protection`, contexts `["test + clippy + fmt"]`, `enforce_admins: true`, `required_pull_request_reviews: null`). Expected 403 (admin=false). On failure: record the exact ready-to-run command block in the final report as operator escalation; the manager skill's merge doctrine (green-required-checks before merge) remains the behavioral control until the mechanical one exists. Do NOT enable repo auto-merge ever. If the PUT unexpectedly succeeds, note the `harness-push` requirement for future harness updates.

**Acceptance criterion.** Either the protection read-back shows exactly the contexts + enforce_admins (if the PUT unexpectedly succeeds), or the escalation block exists verbatim in the final report and the limitation is stated in the install findings (U6).

## U12. Runtime bring-up under fleet isolation

**Provenance.**
- Dedicated console+provider, never attach to a foreign one: `open-autonomy/docs/INSTALL-AGENT.md:282-300`; `twin/docs/INSTALLING-OA-PROFILES.md:72-84` (fleet-isolation MANDATORY; own port/socket/prefix; pin the runner).
- Doctor as the mechanical gate: `open-autonomy/docs/INSTALL-AGENT.md:347-356` (`doctor --json`, parse `.verdict`; replaces hand-rolled probes incl. the bare curl that misreads a foreign provider — F-8); runner: `open-autonomy/bin/doctor.ts` (thin wrapper over `bin/doctor-checks.ts`).
- Why the identity check is MANUAL (skeptic finding 3): doctor deliberately does NOT claim provider ownership — no declared expected-prefix exists to compare against; it reports the occupant's self-reported kind/instanceId for the operator to eyeball: `open-autonomy/bin/doctor-checks.ts:562-575`.
- Why the loop proof is split (skeptic finding 1): `--once` checks PAUSED before the termfleet/provider machinery — `open-autonomy/packages/substrate-local/src/emit.ts:115-122` (PAUSED-first, exit nonzero) — so a `--once` run shows the fence but never reaches the provider line; the `[loop] provider <url> (schedule)` origin line (`emit.ts:258`, resolution-order comment `:218-262`) appears only on a run that gets past the gate.
- Study: §4 steps 7–8, NEXT STEPS 8.

**Contract.** Start dedicated termfleet console+provider on the U9 ports (`supercode-oa`); sanity-launch one trivial session; `bun <OA>/bin/doctor.ts --json` → verdict PASS — and because doctor deliberately does NOT claim provider identity (`bin/doctor-checks.ts:562-568`, no declared expected-prefix), MANUALLY compare the doctor JSON's provider-check detail (self-reported kind/instanceId) against the `supercode-oa` instance and record the matched instanceId as evidence. Loop proof is split (`emit.ts:115-122` — `--once` checks PAUSED before the provider log): (a) `node scheduler/run.mjs --once` → PAUSED message, exit ≠ 0, zero dispatches; (b) the `[loop] provider http://127.0.0.1:<port> (schedule)` durable-pin origin line observed either from a briefly-started-then-killed continuous run or on the U13 post-unpause first tick.

**Acceptance criterion.** Doctor JSON + matched provider instanceId saved as evidence; proof (a) and (b) both observed (OA-07 + OA-09 validated live).

## U13. Board scoping + unpause (operator-deputy call)

**Provenance.**
- The operator-scopes-dispatch intent: OA-07 (fresh installs start paused so a pre-existing backlog is never dispatched before review — `open-autonomy/packages/substrate-local/src/emit.ts:106-113,481-483`; `docs/INSTALL-AGENT.md` Phase-4 "operator board review then unpause", study §4 step 8).
- Why scoping is by STATUS, not the frontier (skeptic finding 2): ztrack `--actionable` is status-blind — any not-done, unblocked issue qualifies (`ztrack/README.md:107-112`), so all ~18 open PARITY items (`supercode/.volter/tracker/markdown/BACKLOG-INDEX.md:11`) would appear on the frontier; the dispatch set must be the `ready` state, which the operator controls.
- The doctrine this verifies: U7's dispatch-only-ready clause in `standards/workflow.md` + SKILL.md.
- The deputy authority: the session brief's autonomy directive (authority list, header); the state change is recorded and reversible.
- Study: §4 step 8 (board review + unpause), NEXT STEPS 9 (operator scopes the first wave).

**Contract.** Acting as operator's deputy (autonomy directive; rationale recorded): scope the first wave to ONE small, low-risk, well-specified open item from the board's priority order — prefer a tiny PARITY correctness item with crisp ACs. Scoping is by STATUS, not the frontier: set the chosen item to `ready` state and ensure it is the ONLY `ready`-state issue (demote any pre-existing `ready` items — a recorded, reversible state change consistent with OA-07's operator-scopes-dispatch intent); the U7 manager doctrine (`standards/workflow.md` + SKILL.md) must say "dispatch ONLY `ready`-state issues". Then `rm .open-autonomy/paused`; commit+push the scoping.

**Acceptance criterion.** `ztrack issue list --state ready` (or the preset's equivalent status filter) shows exactly the chosen item; the dispatch-only-ready doctrine is present in the adapted profile; paused file gone; rationale line in the report.

## U14. The supervised first governed cycle (the real-inputs proof)

**Provenance.**
- The supervised-first-cycle doctrine: `open-autonomy/docs/INSTALL-AGENT.md:339-343` ("the install is not done until the loop merges" — watch one trivial issue to a merged PR) and `:395-400` (the supervised first merge, gate must be green) — with the arm-auto-merge follow-up (`:402-407`) explicitly NOT executed (simple-gh landing model: in this profile EVERY merge is the supervised manager merge).
- The full cycle mechanics: manager doctrine points 3–6 (U1); worktree isolation (`.worktrees/`, doctrine point 4); the real gate `test + clippy + fmt` (`supercode/.github/workflows/ci.yml:12-13,21-26`); review verdict as structured PR comment, sha-bound (U1 review-fix item 4); done-with-PR-line discipline validated by ztrack (`ztrack/boilerplates/presets/simple-gh-sdlc.ts:582-594` as the doctrinal grammar; the installed `simple-sdlc` preset checks via `npx ztrack check` — U7 preset-reality note).
- The negative control's two halves: mechanical (branch protection blocks merge on red — pending U11's outcome, since admin=false may leave protection unwired) and doctrinal (the manager refuses on red — U1 doctrine point 5: "a red check or a fail verdict is a HARD BLOCKER").
- Usage + concurrency guards: the session brief (weekly limit → record state + stop; nothing else concurrent during the loop — environment-facts concurrency row).
- Study: §4 step 9, NEXT STEPS 9.

**Contract.** Run `node scheduler/run.mjs` (foreground/tmux; NOTHING else concurrent — memory cap). One full cycle: manager tick → picks the U13 item → implementation subagent on a `.worktrees/` worktree → branch pushed → PR on volter-ai/supercode → `test + clippy + fmt` green → review-subagent verdict recorded as structured PR comment (`oa-review: pass…`, sha-bound) → manager merges (`gh pr merge --squash`) → issue flipped done with `PR:` line → `npx ztrack check` green. **Negative control:** demonstrate a red required check observably blocking the merge — via doctrine observation or an induced trivial red commit on the PR branch (then fixed); since protection may be pending (U11), the control's mechanical half is conditional on protection and the doctrinal half (manager refuses on red) must be observed regardless. Usage guard: if the weekly Claude limit interrupts the cycle, record exact state + stop per the brief. Rework guard: ≤2 manager-loop failures get diagnosed and fixed (that IS dogfood data); a 3rd structural failure → capture evidence, revert to paused, report honestly.

**Acceptance criterion.** One merged PR on supercode main authored via the loop, carrying the recorded review verdict + green `test + clippy + fmt` at head; the issue `done` with PR line; `ztrack check` green; negative-control observation recorded; loop returned to a safe state afterward (paused re-armed or left running — decide and record based on stability observed; default: re-arm paused, since nobody supervises after this session).

## U15. End-of-objective skeptic panel

**Provenance.**
- The refutation stances mirror the two real failure modes this program has already caught elsewhere: the under-install/"plumbing called an install" failure (`twin/docs/INSTALLING-OA-PROFILES.md:13-24` — the tell) and hollow-green/fixture evidence (the reason U3's AC reads the `check:profiles` log line instead of trusting a green check).
- Sequential execution: the concurrency cap (environment-facts table; peer box OOM at 6 heavy subagents).
- The session brief's end-of-objective panel requirement (≥2 fresh default-refuted skeptics, ≥2 lenses, CANNOT-REFUTE to complete).

**Contract.** ≥2 fresh default-refuted Fable-5 skeptics, ≥2 distinct lenses (e.g. lens A: "the install is fake/hollow — kit files, CI wiring, governed landing"; lens B: "the working proof is a fixture — trace the U14 PR/issue/merge evidence end-to-end on GitHub + the board"), run SEQUENTIALLY (memory cap). Each gets the spec + pointers to canonical evidence and must return CANNOT-REFUTE for completion. Any REFUTED finding → fix → re-run that skeptic.

**Acceptance criterion.** Both verdicts CANNOT-REFUTE, quoted in the final report.

---

## Ordering & rationale

**Order:** U1→U2→U3 (G1) → U5-prep (G2 pre-install) → U7→U8→U9→U10→U11→U12→U13→U14 (G3) → U6+U4 (findings PR incl. the `LOCAL-*` issues) → U15 (panel) → final report + memory write.

**Rationale:** G3-U7 forks the LANDED profile, so G1 must land first; U6 needs G3's live evidence; U4 rides U6's governed PR (its issues live on OA's in-repo ztrack board); U5 sits between G1 and G3 because the release branch forks off post-U3 main and its (blocked) publish would have changed U8/U9's tool path from clone to registry — preparing it first records the F-A decision honestly before the install consumes the clone path.

## Cross-cutting rules

- **Build protocol:** each unit = ONE Sonnet-5 builder subagent (or inline work by the manager where the unit is thin orchestration/verification) + ONE Fable-5 review before accept; sequential, never >2 concurrent; commits pushed immediately.
- **Governed repos:** OA changes ONLY via PR→green→merge. The supercode harness commit is the documented direct-to-unprotected-main install step; supercode CODE changes (U14) only via the loop's PR.
- **Never:** `--admin` merges; auto-merge enablement; touching OA's human-required paths; >2 subagents; a second heavy process while the loop runs.
- **Honesty ledger:** every deviation from the study (npm publish blocked, protection blocked, anything else discovered) lands in U6's findings doc + the final report — no silent scope trims.

## Explicitly out of scope (decided, not deferred)

- **Cutting/publishing 0.4.2 to npm** — blocked on operator auth (npm `ENEEDAUTH`, live-verified); U5 prepares to the line; this is the brief's one legal escalation.
- **Wiring supercode branch protection** — blocked on admin=false (live-verified); U11 attempts + escalates with the exact command block.
- **`ztrack --sync github` GH-issue mirroring for supercode** — study: optional-later (`ztrack/README.md:107-112`'s GitHub door); the profile README documents the re-add condition for merge.yml/reconcile if it's ever enabled.
- **Migrating supercode's ~100-item ledger to the `simple-gh-sdlc` validation preset** — F-B: the gap ISSUE is in scope (U4), the migration is not; the preset-reality note (U7) is the contracted mitigation. Grounding: the PR-coupled rules would retro-fail history (`ztrack/boilerplates/presets/simple-gh-sdlc.ts:582-594`); twin shipped the same split deliberately (`twin/profiles/twin-sdlc/ir.yml:10-14`).
- **security.yml/dependabot for supercode** — INSTALL-AGENT ask #4's own default-skip on a non-bun repo (`open-autonomy/docs/INSTALL-AGENT.md:188-192`: the bun-based security workflow "can red your CI" on a non-bun repo); recorded in the profile README.
- **Durable operation + teardown** (study §4 step 10 — nohup/tmux supervision, spend watch, worktree pruning; `open-autonomy/docs/OPERATIONS.md:632` Stop & teardown): out of scope because nobody supervises after this session ends; U14 re-arms the paused fence on exit, and the operator (chris@volter.ai) owns unpausing for durable operation — the handoff commands land in the final report + U6 findings doc.
- **Arming native auto-merge** (INSTALL-AGENT Phase 4's final step, `docs/INSTALL-AGENT.md:402-407`) — never, by design: the simple-gh landing model replaces it with the manager's gated merge (study §2.1 Decision 2).

## Install-surface coverage map (INSTALL-AGENT.md phases 0–4 / OPERATIONS.md checklist → units)

| Install-surface step | Where |
|---|---|
| Phase 0 preflight (tools + auth, `INSTALL-AGENT.md:52-81`) | U8 (`bin/preflight.ts` covers it mechanically) + environment-facts table (claude signed in, node/tmux verified) |
| Phase 1 detect (`:84-155`, incl. stop-conditions `:143-146`, `OPERATIONS.md:99-101`) | Performed at study time (§3.2), re-verified at `add49ca` — encoded in the environment-facts table; no stop condition fires |
| Phase 2 ask (`:158-198`) | Owner-greenlit "all 3" + this spec's decisions: gate = `test + clippy + fmt` + enforce_admins (U7/U11); auto-merge never (cross-cutting); dependabot/security skip (out-of-scope); single identity acknowledged (U1 honesty section); first issue = U13 |
| Phase 3: deps (`:209-210`) | U8 (both packages — the doc's own gap recorded) |
| Phase 3: compile (`:229`) | U9 (clone path, pinned — F-A) |
| Phase 3: tracker (`:232`, no-op `:464-466`) | U8 (explicit no-op with grounded reason) |
| Phase 3: commit harness (`:238-262`) | U10 |
| Phase 3: branch protection (`:266-281`) | U11 (attempt→escalate) |
| Phase 3: termfleet start + pin (`:282-300`) | U9 (ports+pin) + U12 (bring-up) |
| Phase 4: doctor (`:347-356`) | U12 |
| Phase 4: PAUSED first tick → board review → unpause | U12 (fence proof) + U13 (scoping + unpause) |
| Phase 4: supervised first merge (`:395-400`) | U14 |
| Phase 4: arm auto-merge (`:402-407`) | out of scope forever (landing model) |
| Post-install: harness-push after gate (`:486-490`) | U11 note (conditional on protection existing) |
| OPERATIONS stop & teardown (`:632`) | out of scope with grounded reason (handoff to operator) |

---

## Appendix A — citation verification log (2026-07-09)

Every citation in this document was opened and confirmed against the repo states in the header. Corrections applied to previously-recorded line numbers:

| Claim | Old cite | Verified cite |
|---|---|---|
| `code:merge` is gate-only | `ir.ts:117-130` | `packages/core/src/ir.ts:118-129` |
| no propose+review on one agent | `ir.ts:131-135` | `ir.ts:130-134` |
| review edge validated only if present | `ir.ts:142-150` | `ir.ts:141-150` |
| profile auto-discovery | `bin/bundled-profiles.ts:16-28` | `bin/bundled-profiles.ts:19-27` |
| OA-04 collision guard (emitted) | `emit.ts` ~150-215 | `packages/substrate-local/src/emit.ts:141-215` |
| OA-03 uncommitted-harness guard (emitted) | `emit.ts` ~264-280 | `emit.ts:269-335` |
| provider resolution order + origin log | `emit.ts` ~218-262 | `emit.ts:218-262` (log line `:258`) |
| paused deliberately outside the manifest | (finding 8, uncited) | `emit.ts:602-613` |
| durable pin emission into schedule env | (implied) | `emit.ts:561-567` |
| backend bare-import of `@termfleet/core` | `backend.mjs:8,17` | `backend.mjs:8,16-17` |
| propose-effect gating (isolated + github host) | `runner-frontend.ts:84-91,148-149` | `runner-frontend.ts:83-92,147-150` |
| doctor declines provider-ownership claim | `doctor-checks.ts:562-568` | `doctor-checks.ts:562-575` (comment `:562-568`) |
| BL-29 preset resolution | `ztrack-preset.ts:29-40` | `ztrack-preset.ts:23-41` (`KNOWN_GOOD_ZTRACK` `:13`) |
| byte-identity guard is gh-actions-only | `check-profiles.ts:56-62,86-103` | `check-profiles.ts:56-62,84-103` |
| docs instruct `termfleet` only | `INSTALL-AGENT.md:207-209` | `INSTALL-AGENT.md:209` |
| commit-the-harness discipline | `INSTALL-AGENT.md:238-257` | `INSTALL-AGENT.md:238-262` |
| protection PUT + read-back | `INSTALL-AGENT.md:266-280` | `INSTALL-AGENT.md:266-281` |
| answering-port hard ABORT | `INSTALL-AGENT.md:293-300` | `INSTALL-AGENT.md:288-300` |
| doctor gate | `INSTALL-AGENT.md:344-356` | `INSTALL-AGENT.md:347-356` |
| twin preset-reality split | `twin ir.yml:9-13` | `twin/profiles/twin-sdlc/ir.yml:10-14` |
| twin provision manifest | `twin provision.json:8-12` | `twin/profiles/twin-sdlc/provision.json:5-13` |
| `check:profiles` smoke statement | `profiles/README.md:283-284` | `profiles/README.md:283` (main @ `65d4399`; the U1 branch shifts this file's numbering) |
| pack-smoke compiles from the packed tarball | `scripts/pack-smoke.ts` (uncited lines) | `scripts/pack-smoke.ts:1-15,146-166` |
| reviewer.yml gates | (workflow, uncited lines) | `.github/workflows/reviewer.yml:8,34` |

Unchanged-and-confirmed (spot list): `autonomy-compile.ts:12-15,172-178,344-345`; `emit.ts:115-122` (PAUSED-first in `--once`); `INSTALL-AGENT.md:3-5,13-16,25-33,34-44,143-146,188-192,229,395-400,464-466,486-490`; `OPERATIONS.md:70-95,99-101,632`; `CLAUDE.md:20`; `human-required-paths.json` (16 entries, no `profiles/**`); `package.json:3,40`; `VERSION` = 0.4.1; `simple-gh-sdlc/ir.yml:74-80`; `simple-gh-sdlc/skills/pm/SKILL.md:26-28`; `reconcile-merged-issues.ts:10-14`; twin `ir.yml:1-15,157-187,197-200`, `runner-defaults.mjs:1-6`, `run-agent.mjs:10`, `INSTALLING-OA-PROFILES.md:9-24,47-53,56-70,72-84`; ztrack `README.md:107-112,185-236,309-345,378-392`, `presets/simple-gh-sdlc.ts:12-17,560-567,582-594`; supercode `ci.yml:3-6,12-13,21-26`, `tracker-config.json`, `BACKLOG-INDEX.md:9-13`, `package.json:4`; `ADOPTION-FIXES-BACKLOG.md:11-17,30-43`.
