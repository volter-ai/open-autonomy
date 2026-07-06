# BL-1 Boundary & policy backlog — charter

assignee: yueranyuan

**Theme (ratified in discussion, 2026-07-06):** substrate = triggers/crons/agent-runners/credentials
only; code-host behavior = profile-carried resources; every `policy.box` key is a **parameter with a
reader** (deterministic or agent-at-runtime) or it doesn't exist. Sources: `PROFILE-CONFIG-AUDIT.md`
(findings cited per item) and `ROADMAP-DISTILLED.md` (each item names the OA-5/OA-6 AC it
discharges). This file is the *working layer*: the roadmap holds the strategic ACs; this holds the
per-change spec (files, fix shape, proof).

**Waves:** 1 = pure wiring (no file moves) — BL-2..BL-7, independently landable. 2 = placement
moves — BL-8 then BL-9 (ordering: gating globs name post-move paths), BL-10 independent. 3 = spec —
BL-11. **Constraint:** all work lands as local commits on this worktree branch; unit/fixture ACs are
earnable now, live-proof ACs stay open until the branch ships through the gated lane.

### Acceptance Criteria

- [ ] dev/01 v1 Every BL item below is done (all its ACs checked with evidence) or explicitly dropped with a recorded reason in this file.

## BL-2 Block labels: one profile-owned vocabulary

assignee: yueranyuan

Audit §1.1, §1.7, §2.2 · discharges OA-5 dev/06. The sweep hardcodes a 4-label `HOLD` set that omits
the policy's own `agent-blocked` (a labeled green PR auto-merges through the declared block), the
policy key is read by nothing, and the branch filter hardcodes a profile-agent name (`strategist`) in
the vendored mirror — a literal `substrate-is-runner-only` violation, and legacy (all live proposer
branches are `agent/*`; the last `strategist/*` ref is closed PR #79).

Files: `scripts/rearm-auto-merge.ts` (+ mirror via `bun bin/sync-runtime.ts`),
`profiles/self-driving/ir.yml:169`, `profiles/self-driving/skills/pm/SKILL.md:156-157`,
`profiles/self-driving/skills/reviewer/SKILL.md:69-70`, new unit test.

Fix shape: the sweep reads `policy.merge.maintainer_block_labels` from `.open-autonomy/autonomy.yml`
(the merge.yml job checks out the repo; fall back to the current constants only when the file/key is
absent, so mid-upgrade installs don't fail open). Branch filter becomes `/^agent\//` — the one prefix
`agent-propose.ts:27` creates (seam-contract constant). Skills replace their hand-kept lists with
"consult `policy.merge.maintainer_block_labels` in `.open-autonomy/autonomy.yml`".

### Acceptance Criteria

- [x] dev/01 v1 rearm-auto-merge.ts reads the label set from policy.merge.maintainer_block_labels (fallback documented + tested); a unit test with a fixture autonomy.yml proves a PR labeled agent-blocked is skipped.
  - status: passed
  - evidence ev-dev-01: commit=0b434b6339682f95f240a778a86a48e999fd3a94 acv=1
  - proof: "loadHoldLabels() in scripts/rearm-auto-merge.ts reads policy.merge.maintainer_block_labels from .open-autonomy/autonomy.yml with a documented fail-closed DEFAULT_HOLD fallback; scripts/rearm-auto-merge.test.ts includes a fixture-autonomy.yml test proving a PR labeled agent-blocked gets disposition held (9 tests pass)." -> ev-dev-01
- [x] dev/02 v1 The branch filter is /^agent//; strategist no longer appears in any packages/substrate-* file (invariant clean).
  - status: passed
  - evidence ev-dev-02: commit=0b434b6339682f95f240a778a86a48e999fd3a94 acv=1
  - proof: "AGENT_BRANCH is /^agent// in scripts/rearm-auto-merge.ts and the synced mirror; grep -rn strategist over packages/substrate-github/src and packages/substrate-local/src returns nothing (reconcile comment reworded too); a unit test asserts strategist/roadmap-123 is not matched." -> ev-dev-02
- [x] dev/03 v1 ir.yml declares the ratified label set (recorded human decision — proposed: do-not-merge, human-required, agent-blocked, agent-paused, agent-maintainer-hold), and check:dogfood is green after regeneration.
  - status: passed
  - evidence ev-dev-03: commit=0b434b6339682f95f240a778a86a48e999fd3a94 acv=1
  - proof: "profiles/self-driving/ir.yml declares maintainer_block_labels: [do-not-merge, human-required, agent-blocked, agent-paused, agent-maintainer-hold] with the ownership comment; root regenerated via open-autonomy-upgrade-cli; check:dogfood green (57 managed files)." -> ev-dev-03
- [x] dev/04 v1 pm/reviewer skills consult the policy key; their hand-kept label lists are gone (grep-clean).
  - status: passed
  - evidence ev-dev-04: commit=0b434b6339682f95f240a778a86a48e999fd3a94 acv=1
  - proof: "pm SKILL.md and reviewer SKILL.md now instruct reading policy.merge.maintainer_block_labels from autonomy.yml (reviewer carves out human-required for the separate gate); grep for the old hand-kept lists (agent-maintainer-hold enumerations) in skills returns only the policy declaration." -> ev-dev-04
- [ ] dev/05 v1 Live proof: a green testbed PR labeled agent-blocked is NOT re-armed by the sweep (run URL recorded).
  - status: pending

## BL-3 policy.box passes the parameter-with-a-reader test

assignee: yueranyuan

Audit §2, §2.1 · discharges OA-6 dev/06 (policy half). Nine dead keys; `human_required_topics`
triplicated as drifted prose; no guard against future rot.

Files: `profiles/self-driving/ir.yml:121-176`, pm `SKILL.md:67`, reviewer `SKILL.md:95`, maintainer
`SKILL.md`, new `bin/check-policy-consumers.ts` (or a check in an existing gate), `package.json`
check wiring.

### Acceptance Criteria

- [x] dev/01 v1 Deleted from ir.yml (+ regenerated): autonomy.require_visible_pm_status, planner.enabled, autonomy.max_ci_retries, autonomy.max_review_retries, autonomy.stale_needs_info_minutes, human.decision_types (the maintainer skill keeps the decision-types sentence as prose).
  - status: passed
  - evidence ev-dev-01: commit=80493552a82019f3307fb1804ceefa6b7d52c1d0 acv=1
  - proof: "ir.yml deletions: require_visible_pm_status, planner.enabled, max_ci_retries, max_review_retries, stale_needs_info_minutes, human.decision_types (maintainer skill keeps the four ask types as prose, key reference dropped); root regenerated; check:dogfood green." -> ev-dev-01
- [x] dev/02 v1 risk.human_required_topics: pm + reviewer skills consult the key from autonomy.yml; the three drifted prose lists are deleted.
  - status: passed
  - evidence ev-dev-02: commit=80493552a82019f3307fb1804ceefa6b7d52c1d0 acv=1
  - proof: "pm SKILL.md (out-of-scope/risky triage) and reviewer SKILL.md (human-required constraint) instruct reading policy.risk.human_required_topics from autonomy.yml; the drifted enumerations (auth, secrets, workflow edits, billing... / workflow/CI/secret/auth/billing...) are deleted. Sibling declarers wired too." -> ev-dev-02
- [x] dev/03 v1 check:policy-consumers runs in bun run check: every declared policy.box key must have a read site (emit, runtime script, or a skill read-instruction); the 9-dead-keys state would have failed it (regression-tested with a fixture).
  - status: passed
  - evidence ev-dev-03: commit=80493552a82019f3307fb1804ceefa6b7d52c1d0 acv=1
  - proof: "bin/check-policy-consumers.ts runs in bun run check (after check:profiles): every box key needs a whole-word read site in engine/runtime code or the declaring profile's own non-test files. Unit test reproduces the historical dead-keys state and asserts it fails; live mutation test (planted zz_unread_key in hello) exited 1." -> ev-dev-03
- [x] dev/04 v1 merge.require_ci/require_low_risk_review/require_current_head_sha: recorded decision — delete as descriptions (recommended), or provision derives branch protection from them (if the latter, BL-7's provision.json decision merges into this).
  - status: passed
  - evidence ev-dev-04: commit=80493552a82019f3307fb1804ceefa6b7d52c1d0 acv=1
  - proof: "Recorded decision: DELETED as descriptions. require_ci/require_low_risk_review/require_current_head_sha described branch-protection + gate behavior (the seam contract), not tunables — no provision derivation (provision.json stays the manifest, BL-7 dev/04). ir.yml comment + SOC2-BASELINE-PROFILE.md M5 record the ruling." -> ev-dev-04

## BL-4 Human-approval gate: maintainership by permission only

assignee: yueranyuan

Audit §1.3 · discharges OA-5 dev/08. `qualifies()` short-circuits on
`author_association ∈ {OWNER, MEMBER, COLLABORATOR}` before the repo-permission lookup its own
comment (and the operator's standing rule) says is the truth; a read-only collaborator's Approve
satisfies the gate.

Files: `scripts/human-approval-gate.ts:92-95` (+ mirror), unit test.

Fix shape: delete the `MAINTAINER` association set; `qualifies()` = APPROVED + current head SHA +
`isMaintainer(login)` (the permission lookup already implemented at :82-88). One extra API call per
review event — negligible.

### Acceptance Criteria

- [x] dev/01 v1 The association fast path is gone; a unit test proves an APPROVED review from a login whose repo permission is read does NOT qualify, and one with write/maintain/admin does.
  - status: passed
  - evidence ev-dev-01: commit=b3587caf7dcd02362565b71e9e0f4bb0c8d390ca acv=1
  - proof: "scripts/human-approval-gate.ts: the MAINTAINER association set is deleted; qualifies(review, headSha, isMaintainer) requires APPROVED + commit_id==head + repo-permission write/maintain/admin. scripts/human-approval-gate.test.ts proves read-permission (even with author_association OWNER) does not qualify and write/maintain/admin do (58 script tests green)." -> ev-dev-01
- [ ] dev/02 v1 Live proof: a maintainer Approve on a testbed human-required PR still flips the gate to success (run URL recorded).
  - status: pending

## BL-5 The gate owns `agent-develop-only`

assignee: yueranyuan

Audit §1.2 + review note · discharges OA-5 dev/07. Three components disagree about whose job the
label is, so it's decorative — and the bench expectation is itself semantically wrong: develop-only
means "held for maintainer approval" (its own label description), which is human-approval semantics;
failing `agent-review` for a governance hold conflates "review found defects" with "merge is held".

Files: `scripts/human-approval-gate.ts` (+ mirror), `scripts/bench-operate.ts:334-352`
(`opDevelopOnly`), reviewer `SKILL.md:73-77` (one-line: the gate owns it).

Fix shape: the gate (trusted; runs from BASE) resolves the PR's linked issue (GraphQL
`closingIssuesReferences`, fallback "Closes #N" parse) and treats `agent-develop-only` on the issue
like `human-required` on the PR. Bench asserts the corrected outcome.

### Acceptance Criteria

- [x] dev/01 v1 The gate holds (status pending, engage comment) when the linked issue carries agent-develop-only; unit test with a fixture PR→issue link.
  - status: passed
  - evidence ev-dev-01: commit=a15b36fe17724b5668683ef0802107510dcf2762 acv=1
  - proof: "human-approval-gate.ts resolves linked issues via closingIssuesReferences with a close-keyword body-parse fallback (linkedIssueNumbers), and a linked issue carrying agent-develop-only makes the PR scoped → status pending + engage comment (the existing scoped-and-unapproved path). human-approval-gate.test.ts covers the fixture PR→issue link, graph-preferred/fallback parsing, and the scoping decision." -> ev-dev-01
- [x] dev/02 v1 opDevelopOnly expects: agent-review SUCCESS on merit, human-approval pending, PR unmerged (not agent-review:FAILURE).
  - status: passed
  - evidence ev-dev-02: commit=a15b36fe17724b5668683ef0802107510dcf2762 acv=1
  - proof: "bench-operate.ts opDevelopOnly now waits for both agent-review and human-approval contexts and asserts agent-review:SUCCESS + human-approval not SUCCESS + PR unmerged; the old agent-review:FAILURE expectation is gone." -> ev-dev-02
- [ ] dev/03 v1 Live proof: the governance-develop-only scenario passes on the testbed (run URL recorded).
  - status: pending

## BL-6 Doctrine cites only mechanisms that exist

assignee: yueranyuan

Audit §3 (with the 3.2 correction) · discharges OA-6 dev/05. Batch of prose fixes — no behavior
changes, but each one currently trains an agent to act on a fiction.

Files: pm `SKILL.md:132`, maintainer `SKILL.md:30,36` (path `policy.human.sla_minutes`, not
`policy.box.human.*`); strategist `SKILL.md:29` (dedup by `agent/ir-strategist-*` head-branch
prefix — NOT `origin:strategist`, which nothing applies, and NOT `strategist/**`, which is legacy);
developer `SKILL.md:31-36` (install-owned files — `AGENTS.md`, top-level `docs/*` — are seeded once,
NOT regenerated; a profile edit to them silently never reaches root); reviewer `SKILL.md:74` +
maintainer `SKILL.md:23-24` (drop the false `wrangler.toml`-is-gated claim; the same file's :66-68
already explains why services/** is deliberately ungated); `human-approval-gate.ts:47-49` (the
"defaults ∪" comment — audit §1.4); `strategy-rubric.yml:27` (governance-respect admits strategist
retirements + planner operational edits); `check-dogfood.ts:7` (comment lists autonomy.yml as
excluded; the code compares it).

### Acceptance Criteria

- [x] dev/01 v1 All eight citations above are fixed in the profile sources, root is regenerated, and check:dogfood + check:compile are green.
  - status: passed
  - evidence ev-dev-01: commit=8980d4ad735b59c5257f7c5a5c35f47492903d6a acv=1
  - proof: "All eight citations fixed in profile sources (pm/maintainer sla+decision_types paths, maintainer+reviewer scope lists sans wrangler.toml, strategist dedup by agent/ir-strategist- prefix, developer install-owned-seeds truth, gate scope comment, strategy-rubric governance-respect, check-dogfood comment); root regenerated (upgrade-changes=9); check:dogfood + check:compile green." -> ev-dev-01
- [x] dev/02 v1 A grep for the fictions returns empty: policy.box.human, origin:strategist (as a dedup instruction), strategist/**, the wrangler.toml-gated claim, "merge-sensitive defaults".
  - status: passed
  - evidence ev-dev-02: commit=044814818a9fe1d7cd1ccfd3e68f657538da2144 acv=1
  - proof: "grep over profiles/, .codex, .claude/skills, scripts/, packages/ returns empty for: policy.box.human (last mention in emit.test.ts reworded), origin:strategist, the wrangler.toml-gated claim, and merge-sensitive defaults; remaining strategist/ hits are the skill directory name and the deliberate negative test." -> ev-dev-02

## BL-7 Legacy hygiene

assignee: yueranyuan

Audit §4 + review · discharges OA-6 dev/06 (legacy half). Dead artifacts and stale seeds every new
install inherits.

### Acceptance Criteria

- [x] dev/01 v1 profiles/self-driving/skills/open-autonomy-upgrade/ is deleted (no actor declares the behavior; the upgrade is a maintainer CLI); tests asserting the retired workflow stays deleted still pass.
  - status: passed
  - evidence ev-dev-01: commit=24a55303d47ad107abf5557e2e3688728afd333a acv=1
  - proof: "git rm of profiles/self-driving/skills/open-autonomy-upgrade/; check:core (upgrade prune tests incl. the retired open-autonomy-upgrade.yml fixture) still green — 73 tests." -> ev-dev-01
- [x] dev/02 v1 The AGENTS.md profile seed is refreshed from root (merge-boundary paragraph, operator-commands note, LIVE_TESTING_STRATEGY pointer, fixed skills glob — the dead .codex/skills/open-autonomy-*/SKILL.md glob ships to no new install).
  - status: passed
  - evidence ev-dev-02: commit=24a55303d47ad107abf5557e2e3688728afd333a acv=1
  - proof: "Seed now carries the merge-boundary paragraph, operator-commands note, LIVE_TESTING_STRATEGY pointer, and the live .codex/.claude skills glob; the dead .codex/skills/open-autonomy-*/SKILL.md glob is gone; both copies corrected to ci + agent-review + human-approval." -> ev-dev-02
- [x] dev/03 v1 Recorded decision on the maintainer skill (audit §4.3): ship human-actor skills too (emit stops skipping kind:human, the gate's engage comment links the spec) or drop the dangling agents.maintainer.skill manifest key. Implemented per the decision.
  - status: passed
  - evidence ev-dev-03: commit=24a55303d47ad107abf5557e2e3688728afd333a acv=1
  - proof: "Decision: ship human-actor skills. emit.ts skill-copy loop is kind-agnostic (behavior slot is universal); compile now resolves 49 copies incl. skills/maintainer to .codex+.claude; agents.maintainer.skill no longer dangles. Engage comment intentionally kept generic (no profile names in runtime)." -> ev-dev-03
- [x] dev/04 v1 Recorded decision on provision.json (audit §4.4): self-driving ships a seed, or the INSTALL_OWNED entry is annotated optional. Implemented per the decision (may merge with BL-3 dev/04 if provision derives from policy.merge).
  - status: passed
  - evidence ev-dev-04: commit=24a55303d47ad107abf5557e2e3688728afd333a acv=1
  - proof: "Decision: INSTALL_OWNED provision.json annotated OPTIONAL in packages/core/src/upgrade.ts — no profile seed required (provision-target-repo takes --manifest/defaults); the entry exists to protect adopter-written manifests from upgrade." -> ev-dev-04
- [x] dev/05 v1 open-autonomy-preflight.yml's dead watch path scripts/public-agent-*.ts is removed or corrected to the files that exist.
  - status: passed
  - evidence ev-dev-05: commit=24a55303d47ad107abf5557e2e3688728afd333a acv=1
  - proof: "scripts/public-agent-*.ts removed from open-autonomy-preflight.yml watch paths (profile source + regenerated root); remaining paths all exist." -> ev-dev-05

## BL-8 Finish the code-host split at the script layer

assignee: yueranyuan

Audit §2.2 · discharges OA-6 dev/07. The 2026-06-25/26 CODE_HOST_RESOURCES split moved the
*workflows* to profile resources and left their *scripts* in the runner's vendored mirror — the doc's
own "Open / deferred" flagged exactly this; the friction it waited for is now demonstrated (§1.1
drift, §1.5 gating gap). After this, `bin/sync-runtime.ts`'s header ("the mirror holds only
substrate machinery") becomes true.

Files: `scripts/{rearm-auto-merge,reconcile-merged-issues,human-approval-gate,check-supply-chain}.ts`
→ carried by every profile whose workflows call them (self-driving: all four; simple-gh-sdlc:
merge+security pair; soc2-baseline: merge+human-approval+security set; hello: `check-supply-chain`
only); `bin/sync-runtime.ts` exclusion lists; `packages/substrate-github/src/runtime/` (pruned);
`docs/CODE_HOST_RESOURCES.md`.

### Acceptance Criteria

- [x] dev/01 v1 The four scripts are profile-carried resources in every carrying profile; compiled output paths are unchanged (scripts/<name>.ts at root); check:dogfood, check:compile, check:profiles, check:runtime-sync all green.
  - status: passed
  - evidence ev-dev-01: commit=410ada443c94adb4dbe78da034d2da89663d2bd6 acv=1
  - proof: "Four gate scripts declared in resources: of all carrying profiles (self-driving+soc2: all four; simple-gh-sdlc: merge pair+supply-chain; hello: supply-chain), sources at profiles/*/scripts/. Installed path unchanged (scripts/<name>.ts — root diff shows only autonomy.yml resources list). bun run check green end-to-end incl. check:dogfood/compile/profiles/runtime-sync; check:profiles byte-identity guard now covers the script paths." -> ev-dev-01
- [x] dev/02 v1 The runtime mirror no longer contains them (sync-runtime prunes; its header/exclusion comments describe reality); upgrade on a fixture install does not orphan-prune a profile-carried script.
  - status: passed
  - evidence ev-dev-02: commit=410ada443c94adb4dbe78da034d2da89663d2bd6 acv=1
  - proof: "sync-runtime CODE_HOST_RESOURCE exclusion set added; write-mode prune removed the four from packages/substrate-github/src/runtime/ (9 files remain, all actor-execution — header now factual). New upgrade.test.ts fixture: a manifest-listed path moving generated→profile-copy plans update (never delete) under prune, because desired = generated+copies." -> ev-dev-02
- [x] dev/03 v1 Recorded decision on agent-propose.ts: stays vendored as the one capability-realization script the emitted effect step invokes (recommended — it carries no policy vocabulary), or migrates with the others. Documented in CODE_HOST_RESOURCES.md either way.
  - status: passed
  - evidence ev-dev-03: commit=410ada443c94adb4dbe78da034d2da89663d2bd6 acv=1
  - proof: "Decision recorded in docs/CODE_HOST_RESOURCES.md: agent-propose.ts STAYS VENDORED — it is the one script the engine-emitted effect step invokes (emit.ts writes 'bun scripts/agent-propose.ts' into every code:propose workflow), the runner-side realization of the capability, carries zero policy vocabulary (verified by grep); emitted workflows may depend only on engine-shipped runtime. emit.test.ts pins it as generated." -> ev-dev-03
- [x] dev/04 v1 docs/CODE_HOST_RESOURCES.md's Open/deferred section records the ruling (substrate owns no label vocabulary; scripts moved; what triggered the revisit).
  - status: passed
  - evidence ev-dev-04: commit=410ada443c94adb4dbe78da034d2da89663d2bd6 acv=1
  - proof: "CODE_HOST_RESOURCES.md: Done(2026-07-06) entry records the ruling (substrate owns no label vocabulary and no code-host gate logic; substrate = triggers/crons/agent-runners/credentials only), what triggered the revisit (audit §1.1 substrate-shipped hold labels, §1.5 gating gap), and the moved scripts + carrier map; Open/deferred bullet replaced (only the base-resource-set deferral remains)." -> ev-dev-04

## BL-9 Boundary scripts enter self-driving's gated scope

assignee: yueranyuan

Audit §1.5 · discharges OA-5 dev/09 · ordered AFTER BL-8 (globs name final paths). The human gate's
own qualification logic is one un-human-gated agent PR from change. The pattern already exists:
simple-gh-sdlc and soc2-baseline enumerate every OA-shipped script by name in their
`human_required_paths` ("MUST be kept complete"); self-driving is the outlier.

Files: `profiles/self-driving/ir.yml` `risk.human_required_paths` (+ regenerated autonomy.yml +
`human-required-paths.json`).

### Acceptance Criteria

- [ ] dev/01 v1 self-driving's `human_required_paths` enumerates (by name, per the siblings' pattern) the boundary scripts at both their installed paths (`scripts/…`) and their profile source paths (`profiles/self-driving/scripts/…`), plus the sync-runtime tool itself if the scripts remain mirrored anywhere.
- [ ] dev/02 v1 Gate fixture: a PR touching `scripts/human-approval-gate.ts` is in human-required scope (unit test on `isSensitivePath` with the regenerated globs).
- [ ] dev/03 v1 Live proof: a testbed PR editing a boundary script parks at `human-approval` pending until a maintainer Approve (run URL recorded).

## BL-10 egress-guard becomes runner-owned

assignee: yueranyuan

Audit §1.6 · prerequisite inside OA-5 dev/04. `private_egress_guard` is a substrate flag whose
implementation exists only as one profile's resource — any other flag-setter gets agent jobs that die
on a missing file. Egress lockdown of the credentialed job is runner security ("which box, how it's
wrapped"): the inverse of the BL-8 misplacement.

Files: `profiles/soc2-baseline/scripts/egress-guard.sh` → substrate runtime;
`packages/substrate-github/src/emit.ts:24` (the mirror loader takes only `.ts` — must carry `.sh`),
`emit.ts:177-185`; soc2-baseline `ir.yml` resources.

### Acceptance Criteria

- [ ] dev/01 v1 `egress-guard.sh` ships with the substrate runtime: compiling ANY profile with `private_egress_guard: true` emits both the job step and `scripts/egress-guard.sh`; a compile fixture proves it.
- [ ] dev/02 v1 soc2-baseline drops its profile copy; its compiled output is functionally unchanged; alternatively (fallback decision) compile FAILS loudly when the flag is set and the script is absent — one of the two, recorded.
- [ ] dev/03 v1 A fixture proves the pre-fix failure mode is closed: flag-setting profile ≠ soc2-baseline compiles to an install whose agent job does not reference a nonexistent file.

## BL-11 SPEC: contract constants vs tunable policy

assignee: yueranyuan

Audit §2.2 residue · discharges OA-6 dev/08. Without the written distinction, future work either
over-parameterizes the seam contract or hardcodes org policy (this backlog exists because of the
latter).

Files: `docs/SPEC.md` (capabilities/merge-boundary section), `scripts/open-autonomy-preflight.ts:112`.

### Acceptance Criteria

- [ ] dev/01 v1 SPEC documents the split: seam-contract constants (status contexts `ci`/`agent-review`/`human-approval`; labels `human-required`, `agent-develop-only`, the control plane's `agent-paused` marker; branch prefix `agent/`) vs org-tunable policy (`merge.maintainer_block_labels`, `risk.human_required_paths`/`topics`), with the rule for which a new name belongs to.
- [ ] dev/02 v1 Preflight's seeded label list derives from the contract constants + the profile's policy (block labels, planner prefix labels) instead of a fifth hand-kept copy.
