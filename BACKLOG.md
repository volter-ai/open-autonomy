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

- [x] dev/01 v1 Every BL item below is done (all its ACs checked with evidence) or explicitly dropped with a recorded reason in this file.
  - status: passed
  - evidence ev-dev-01: run=https://github.com/volter-test-fixtures/bench-self-driving-conformance-self-driving-mr90gwhj/actions/runs/28783523081 acv=1
  - proof: "Rollup over BL-2..BL-11: every AC is checked with evidence (unit/fixture commits + the four
    live testbed proofs — BL-2 dev/05 run 28782004703, BL-4 dev/02 run 28782716760, BL-5 dev/03 run
    28783523081, BL-9 dev/03 run 28782469988). No item dropped; the cited run is the last live proof
    to land." -> ev-dev-01

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
- [x] dev/05 v1 Live proof: a green testbed PR labeled agent-blocked is NOT re-armed by the sweep (run URL recorded).
  - status: passed
  - evidence ev-dev-05: run=https://github.com/volter-test-fixtures/bench-self-driving-conformance-self-driving-mr90gwhj/actions/runs/28782004703 acv=1
  - proof: "Live on a funded bench cell (2026-07-06): PR #27 fully green (ci+agent-review+human-approval
    success), auto-merge disabled, labeled agent-blocked; the rearm sweep run logged 'rearm: 0 PR(s)
    re-armed, 1 held (6 open)' and PR #27 stayed OPEN with autoMergeRequest null." -> ev-dev-05

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
- [x] dev/02 v1 Live proof: a maintainer Approve on a testbed human-required PR still flips the gate to success (run URL recorded).
  - status: passed
  - evidence ev-dev-02: run=https://github.com/volter-test-fixtures/bench-self-driving-conformance-self-driving-mr90gwhj/actions/runs/28782716760 acv=1
  - proof: "Live on a funded bench cell (2026-07-06): PR #34 labeled human-required parked at the gate
    (run 28782621375: 'scoped=true approved=false → pending', mergeStateStatus BLOCKED with ci +
    agent-review green); a maintainer Approve (repo admin permission — no association shortcut) flipped
    it ('scoped=true approved=true → success') and only then did the PR merge." -> ev-dev-02

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
- [x] dev/03 v1 Live proof: the governance-develop-only scenario passes on the testbed (run URL recorded).
  - status: passed
  - progress (2026-07-06): the first live attempt FOUND A REAL FAIL-OPEN BUG instead of a proof — the
    gate's workflow token had no `issues: read`, so the linked-issue label lookup failed, gh() swallowed
    the error into '' ("no labels"), developOnly evaluated false, and the develop-only PR (#32, bench
    cell run 28782283869) auto-passed and merged. Fixed both layers same day: `issues: read` granted in
    human-approval.yml (both profile carriers + emitted root) and the lookup now FAILS CLOSED
    (developOnlyFromLookup(null)=scoped, unit-tested).
  - evidence ev-dev-03: run=https://github.com/volter-test-fixtures/bench-self-driving-conformance-self-driving-mr90gwhj/actions/runs/28783523081 acv=1
  - proof: "Re-proof with the fixed gate (canonical 8038b4d deployed to the cell as e5692f1): issue #35
    labeled agent-develop-only → agent PR #36 (Closes #35, ci+agent-review green) HELD at
    human-approval:pending, log `scoped=true approved=false → pending` with NO label-read error (a real
    scope decision, not the fail-closed fallback; held run 28783416668) → maintainer Approve flipped it
    `scoped=true approved=true → success` and only then did auto-merge land (mergedAt 10:01:36Z)." -> ev-dev-03

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

- [x] dev/01 v1 self-driving's human_required_paths enumerates (by name, per the siblings' pattern) the boundary scripts at both their installed paths (scripts/…) and their profile source paths (profiles/self-driving/scripts/…), plus the sync-runtime tool itself if the scripts remain mirrored anywhere.
  - status: passed
  - evidence ev-dev-01: commit=fa9a45531e5ce6ad8361a9d3c14018a8e5aa7983 acv=1
  - proof: "self-driving human_required_paths enumerates the four boundary scripts by name at installed (scripts/<name>.ts) AND profile-source (profiles/self-driving/scripts/<name>.ts) layers, per the siblings' pattern. sync-runtime intentionally not listed with the rationale recorded in the ir.yml comment: post-BL-8 the scripts are never mirrored (the AC's condition is false); sibling profiles' copies covered transitively by check:profiles byte-identity. autonomy.yml + human-required-paths.json regenerated." -> ev-dev-01
- [x] dev/02 v1 Gate fixture: a PR touching scripts/human-approval-gate.ts is in human-required scope (unit test on isSensitivePath with the regenerated globs).
  - status: passed
  - evidence ev-dev-02: commit=fa9a45531e5ce6ad8361a9d3c14018a8e5aa7983 acv=1
  - proof: "isSensitivePath extracted to a pure export and unit-tested against the REAL regenerated .open-autonomy/human-required-paths.json (not a fixture): scripts/human-approval-gate.ts (and the other three, both layers) in scope; bench-judge/transcript/agent NOT scoped; history/ exclusion + missing-file fallback pinned. 15/15 gate tests green." -> ev-dev-02
- [x] dev/03 v1 Live proof: a testbed PR editing a boundary script parks at human-approval pending until a maintainer Approve (run URL recorded).
  - status: passed
  - evidence ev-dev-03: run=https://github.com/volter-test-fixtures/bench-self-driving-conformance-self-driving-mr90gwhj/actions/runs/28782469988 acv=1
  - proof: "Live on a funded bench cell (2026-07-06): PR #31 edited scripts/rearm-auto-merge.ts (a
    boundary script); the gate scoped it by PATH alone (no label — run 28782239343: 'scoped=true
    approved=false → pending', PR blocked ~4 min with ci + agent-review green) until a maintainer
    Approve flipped it to success and it merged." -> ev-dev-03

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

- [x] dev/01 v1 egress-guard.sh ships with the substrate runtime: compiling ANY profile with private_egress_guard: true emits both the job step and scripts/egress-guard.sh; a compile fixture proves it.
  - status: passed
  - evidence ev-dev-01: commit=7cd19400ff880c4f1de224b50904adf48ad56bbf acv=1
  - proof: "egress-guard.sh ships with the substrate (packages/substrate-github/src/, the control-backend.mjs sibling-source pattern); compileGithub emits scripts/egress-guard.sh whenever githubBox(ir).private_egress_guard is set, adjacent to the egressGuard() job step. Fixture: emit.test.ts compiles a generic flagged IR and asserts the workflow contains 'bash scripts/egress-guard.sh' AND generated['scripts/egress-guard.sh'] carries the implementation." -> ev-dev-01
- [x] dev/02 v1 soc2-baseline drops its profile copy; its compiled output is functionally unchanged; alternatively (fallback decision) compile FAILS loudly when the flag is set and the script is absent — one of the two, recorded.
  - status: passed
  - evidence ev-dev-02: commit=7cd19400ff880c4f1de224b50904adf48ad56bbf acv=1
  - proof: "Primary option taken and recorded: soc2-baseline dropped its resource copy (git mv preserved bytes, so its compiled output is functionally unchanged — same step, same content, same installed path). Recorded in soc2 ir.yml comments, profile CHANGELOG 1.3.4, and CODE_HOST_RESOURCES.md (the inverse-ruling paragraph). check:profiles compiles soc2 green without the resource." -> ev-dev-02
- [x] dev/03 v1 A fixture proves the pre-fix failure mode is closed: flag-setting profile ≠ soc2-baseline compiles to an install whose agent job does not reference a nonexistent file.
  - status: passed
  - evidence ev-dev-03: commit=7cd19400ff880c4f1de224b50904adf48ad56bbf acv=1
  - proof: "Fixture proves the pre-fix failure mode closed: the emit.test.ts flagged IR is NOT soc2-baseline (resources: [], asserted in-test) yet its agent job's egress step and the referenced scripts/egress-guard.sh both come from the one compile — no dependence on any profile resource; flag-unset compiles emit neither." -> ev-dev-03

## BL-11 SPEC: contract constants vs tunable policy

assignee: yueranyuan

Audit §2.2 residue · discharges OA-6 dev/08. Without the written distinction, future work either
over-parameterizes the seam contract or hardcodes org policy (this backlog exists because of the
latter).

Files: `docs/SPEC.md` (capabilities/merge-boundary section), `scripts/open-autonomy-preflight.ts:112`.

### Acceptance Criteria

- [x] dev/01 v1 SPEC documents the split: seam-contract constants (status contexts ci/agent-review/human-approval; labels human-required, agent-develop-only, the control plane's agent-paused marker; branch prefix agent/) vs org-tunable policy (merge.maintainer_block_labels, risk.human_required_paths/topics), with the rule for which a new name belongs to.
  - status: passed
  - evidence ev-dev-01: commit=392698e6860710ef66e5d5c5c581faee3a83cc8a acv=1
  - proof: "docs/SPEC.md gained 'Contract constants vs tunable policy' after the merge/deploy boundary sections: contract constants enumerated (ci/agent-review/human-approval contexts + per-SHA re-earn; human-required, agent-develop-only, agent-paused, needs-info, agent-blocked labels — the last two included because control-backend.mjs hardcodes them; agent/ prefix) vs tunable policy.box parameters-with-readers, plus the one-question rule for filing a new name (author-time knowledge → constant/spec change; runtime-readable → policy + reader)." -> ev-dev-01
- [x] dev/02 v1 Preflight's seeded label list derives from the contract constants + the profile's policy (block labels, planner prefix labels) instead of a fifth hand-kept copy.
  - status: passed
  - evidence ev-dev-02: commit=392698e6860710ef66e5d5c5c581faee3a83cc8a acv=1
  - proof: "Preflight's hand-kept fifth label list replaced by expectedLabels(root) = exported SEAM_CONTRACT_LABELS + the compiled manifest's policy (merge.maintainer_block_labels, planner origin-prefix + priority labels). 4 new tests incl. one against the REAL dogfood autonomy.yml (do-not-merge/agent-maintainer-hold/origin:roadmap-planner/priority:high all derived). Profile source synced; check:dogfood + full check green." -> ev-dev-02

## BL-12 Adopter-docs audit (2026-07-06) — charter

assignee: yueranyuan

A four-persona audit — (A) profile author, (B) local-substrate adopter, (C) github-substrate adopter,
(D) docs cross-reference — ran the new-adopter journey against the published `open-autonomy@0.3.1`
package and the front-door docs (README → OPERATIONS → SPEC). Findings marked *verified live* were
reproduced by executing commands, not by reading prose. Verdict: the local path works end-to-end with
papercuts; the hosted github path is effectively maintainer-only as documented; the SPEC's own profile
example is broken; the operator docs describe a control plane that no longer exists. BL-13..BL-29 file
every finding, one item per finding (cohesive batches stay batched). Distinct stream from the BL-1
boundary/policy backlog (BL-2..BL-11) — BL-1's rollup reads over its own wave list only.

**Initiatives (ratified 2026-07-06):** the findings decompose into five kinds of work, and only two
are workable from this backlog:
- **Wave A — docs-truth sweep** (prose only; doc == shipped reality): BL-17, BL-19, BL-21, BL-25,
  BL-26, BL-27 dev/02, BL-16 (doc-side). Workable now.
- **Wave B — engine/CLI hardening** (product code for external adopters): BL-14, BL-15, BL-22,
  BL-29, BL-27 dev/01+03. Workable now.
- **LIFTED → roadmap intent `hosted-adopter-path`** (strategic: is hosted adoption a product yet?):
  BL-13, BL-18, BL-24. Their sections below are the planner's spec, not workable backlog items.
- **DECISION ITEMS** (blocked on a maintainer fork choice before any build): BL-20, BL-23.
  BL-28's decision is made (maintainer, 2026-07-06: ship the full realization) and built — see its section.
- **Externally gated:** BL-16's repo flip (maintainer-initiated only — never offered or asked about).
  BL-26's CONSTITUTION edits landed 2026-07-06 as a maintainer-approved amendment (81cfc9e).

### Acceptance Criteria

- [x] dev/01 v1 Every BL-13..BL-29 item is done (all ACs checked with evidence) or explicitly dropped with a recorded reason in this file.
  - progress (2026-07-06): everything is done or lifted EXCEPT one AC: BL-26 dev/01's CONSTITUTION.md
    edits (line 26 AUTONOMY-IR ref, rule-6 "template" vocabulary), which are maintainer-hand-only per
    the amendment rule — all other BL-26 references were fixed in a3ece03. BL-13/BL-18/BL-24 are
    LIFTED → roadmap intent `hosted-adopter-path` (ratified 2026-07-06, planner issue #120). This
    rollup closes when the maintainer amends CONSTITUTION.
  - evidence ev-dev-01: commit=81cfc9e acv=1
  - proof: "The last open AC closed: CONSTITUTION amended on the maintainer's explicit approval (81cfc9e). Board disposition — BL-14/15/17/19/21/22/25/26/27/28/29 + BL-16 doc-side + BL-20/23 done with evidence; BL-13/18/24 LIFTED → hosted-adopter-path (issue #120); BL-16's repo flip is explicitly out of scope until the maintainer says otherwise (never offered again)." -> ev-dev-01

## BL-13 Hosted path terminates at the maintainer's private proxy

assignee: yueranyuan

**LIFTED → roadmap intent `hosted-adopter-path`** (2026-07-06): strategic, not workable from this
backlog — this section is the spec the planner decomposes. Adopter-docs audit · personas C + D,
found independently. Compiled installs default the model-proxy
endpoint to the maintainer's Worker — `vars.PUBLIC_AGENT_PROXY_HOST ||
'volter-agent-model-proxy.aaron-0ed.workers.dev'` (emitted `developer.yml:51`;
`profiles/self-driving/ir.yml:128-129`; compiled `autonomy.yml:149`) — and that proxy is closed three
ways: `wrangler.toml:35` `GITHUB_OIDC_ALLOWED_WORKFLOW` allowlists only `volter-ai/*`,
`ENFORCE_ACCOUNT_BALANCE="true"`, `DEFAULT_FUNDING_ACCOUNT` set. No adopter-facing doc says "deploy
your own Worker" (DO migration; secrets `AGENT_PROXY_ADMIN_TOKEN`/`AGENT_PROXY_HMAC_SECRET`/
`OPENROUTER_API_KEY` per `services/agent-model-proxy/src/types.ts:6-8`; wrangler.toml edits; ledger
funding). The only deploy guide (`services/agent-model-proxy/DEPLOY.md:43-46`) is
maintainer-machine-specific ("approver is yueranyuan… keyring") and OPERATIONS never links it. Bonus
contradiction: the proxy README says `ENFORCE_ACCOUNT_BALANCE` defaults false; wrangler.toml sets "true".

### Acceptance Criteria

- [ ] dev/01 v1 Compiled installs carry no maintainer endpoint as a silent default: the proxy host is a required install-time setting (unset → preflight fails loudly) or a profile-declared value, with no volter fallback baked into emitted workflows.
- [ ] dev/02 v1 OPERATIONS (or a doc it links) gains an adopter-facing "deploy your own model proxy" path: wrangler deploy, the DO migration, the three secrets, the wrangler.toml vars to change, and ledger funding; DEPLOY.md is marked maintainer-only.
- [ ] dev/03 v1 The ENFORCE_ACCOUNT_BALANCE default is documented consistently with wrangler.toml.

## BL-14 README's hosted quickstart clobbers the adopter's repo

assignee: yueranyuan

Adopter-docs audit · personas B + C, **verified live** independently. `npx open-autonomy compile
self-driving gh-actions .` (`README.md:68`) silently overwrote a test repo's README.md, package.json,
and .gitignore (73 files written). The overlay-safety note (`docs/OPERATIONS.md:41-47,143-145`) names
only the `simple-*` profiles; nothing tells an adopter self-driving is a whole-repo scaffold, not an
overlay. Same failure class as the repo's own compile-clobbers-install-owned rule — now shipped to
strangers as the first hosted command.

### Acceptance Criteria

- [x] dev/01 v1 Compiling a scaffold-class profile into a directory whose existing files would be overwritten refuses with a clear error (opt-in --force to proceed), proven by a fixture.
  - status: passed
  - evidence ev-dev-01: commit=e764b043e51c366896483186d223c53a9b5a1d1e acv=1
  - proof: "packages/core/src/materialize.ts: findClobbers(out, destDir, readSource) returns byte-differing paths a materialize would overwrite. bin/autonomy-compile.ts's outDir branch calls it before writing and exits 1 listing collisions unless --force. bin/autonomy-compile.test.ts spawns the real CLI: self-driving into a dir with a differing README.md exits 1 and stderr names README.md + mentions --force; the same invocation with --force exits 0 and installs; simple-gh-sdlc compiled into the SAME populated dir (README.md + package.json present) exits 0 with no refusal (additive profiles carry no colliding resources); a fresh nested dir is never refused. 4/4 tests pass; wired into check:compile." -> ev-dev-01
- [x] dev/02 v1 README.md:68 and the OPERATIONS overlay-safety note steer adopters to the additive profiles and label self-driving as a scaffold.
  - status: passed
  - evidence ev-dev-02: commit=e764b043e51c366896483186d223c53a9b5a1d1e acv=1
  - proof: "README.md's setup table + compile examples now label self-driving 'new/dedicated repo' scaffold vs simple-gh-sdlc 'your existing repo', with a blockquote calling out the refuse+--force behavior and pointing at OPERATIONS' overlay note; docs/OPERATIONS.md's setup table + overlay blockquote (~L33-53) gained the same new/dedicated-vs-existing framing and an explicit 'self-driving is the opposite: a whole-repo SCAFFOLD' paragraph naming the refusal + --force + the simple-gh-sdlc alternative." -> ev-dev-02

## BL-15 SPEC's canonical profile example fails twice

assignee: yueranyuan

Adopter-docs audit · persona A, **verified live**. The canonical ir.yml example at `docs/SPEC.md:72`
uses `actors:` but the parser requires `agents:` (`packages/core/src/ir.ts:30` — the rename is
mid-migration); the verbatim error `invalid profile IR: no agents` is not actionable. `SPEC.md:74,:83`
shows `behavior: skills/developer` but both compilers prepend `skills/` themselves (substrate-local
`emit.ts:247`, substrate-github `emit.ts:546`) → ENOENT `skills/skills/…/SKILL.md` from
`materialize.ts`, surfacing only after 14 files were already written; `--dry-run` exits 0 and misses
it. Every docs-first profile author hits both.

### Acceptance Criteria

- [x] dev/01 v1 The SPEC example compiles verbatim on both substrates (a fixture test compiles the doc's exact YAML).
  - status: passed
  - evidence ev-dev-01: commit=535360b7c91fbf35c69c62542e219b22a2a18cc9 acv=1
  - proof: "docs/SPEC.md's `## The IR` example now uses `agents:` (not `actors:`) and bare behavior names (`developer`/`maintainer-review`/`planner`, not `skills/developer`); packages/substrate-local/src/spec-example.test.ts extracts the exact ```yaml fenced block from the doc (regex on the file, not a hand-copy) and asserts it parses, validates clean, and compiles on both compileGithub and compileLocal with zero missing copy sources. bun test packages/*/src/*.test.ts: 82 pass." -> ev-dev-01
- [x] dev/02 v1 The "no agents" error names the expected agents: key (and the actors:→agents: migration) so a docs-first author can self-correct.
  - status: passed
  - evidence ev-dev-02: commit=535360b7c91fbf35c69c62542e219b22a2a18cc9 acv=1
  - proof: "packages/core/src/ir.ts validateIR: an `actors:` key with no `agents:` now errors `no agents (found \"actors:\" — the key is \"agents:\")`; a plain missing/empty agents map errors `no agents (the top-level key is \"agents:\")`. Verified live: compiling a profile with `actors:` throws exactly `invalid profile IR:\n  no agents (found \"actors:\" — the key is \"agents:\")`. Fixture tests in packages/core/src/ir.test.ts cover both messages." -> ev-dev-02
- [x] dev/03 v1 Copy-source existence (skills + resources) is validated before any file is written, and --dry-run reports the same failure.
  - status: passed
  - evidence ev-dev-03: commit=535360b7c91fbf35c69c62542e219b22a2a18cc9 acv=1
  - proof: "packages/core/src/materialize.ts adds copySources/missingCopySources/missingCopySourcesIn (substrate-shared, core-owned); bin/autonomy-compile.ts runs missingCopySourcesIn BEFORE the outDir branch, so both --dry-run (no outDir) and materialize report the identical missing-file list and exit 1 with nothing written. Verified live against a profile with a missing skill dir + missing resource: both invocations print the same two-path error. Fixture tests in packages/core/src/materialize.test.ts." -> ev-dev-03

## BL-16 termfleet's public docs are a 404

assignee: yueranyuan

Adopter-docs audit · persona B, **verified live**. `README.md:49` and `docs/OPERATIONS.md:56` link
github.com/volter-ai/termfleet — dead. `OPERATIONS.md:121-122` instructs adopters to read termfleet's
SECURITY.md before exposing it; that file exists nowhere (the npm tarball ships none). termfleet is the
load-bearing local-runner dependency. **Note:** the real fix (flipping the termfleet repo public) is
reserved for the maintainer's explicit "flip it" — this item's doc-side fixes must not perform the flip.

### Acceptance Criteria

- [x] dev/01 v1 No adopter-facing termfleet link 404s: links point at npmjs.com/package/termfleet (or the public repo, once the maintainer flips it).
  - status: passed
  - evidence ev-dev-01: commit=4727ec594abbccb04eb2fc07de13968f92933905 acv=1
  - proof: "README.md:49 + OPERATIONS.md:56 repointed to npmjs.com/package/termfleet (curl: repo 404, npm live); grep for github.com/volter-ai/termfleet over README+docs returns empty." -> ev-dev-01
- [x] dev/02 v1 The security guidance OPERATIONS depends on exists and is reachable (an inline section or a shipped SECURITY.md).
  - status: passed
  - evidence ev-dev-02: commit=4727ec594abbccb04eb2fc07de13968f92933905 acv=1
  - proof: "The dead 'see termfleet's SECURITY.md' pointer replaced with inline guidance in OPERATIONS step 2: loopback-only default, the provider launches sessions as your user, never bind/forward 7373/7402 to a non-local interface." -> ev-dev-02

## BL-17 The rollout's variable checklist is ~60% dead

assignee: yueranyuan

Adopter-docs audit · personas C + D, found independently (grep of a fresh compile). Of the 18 vars in
`docs/OPERATIONS.md:282-301`, 11 are read by nothing: PUBLIC_AGENT_MODELS, PM_MODEL, REVIEW_MODEL,
TRIAGE_MAX_USD_CENTS, PM_MAX_USD_CENTS, REVIEW_MAX_USD_CENTS, MAX_DEVELOP_ATTEMPTS,
MAX_OPEN_AGENT_PRS, STALE_NEEDS_INFO_MINUTES, PM_LIMIT, ALLOWED_PATHS (knobs since migrated to the
policy box); PUBLIC_AGENT_TRIGGER_TOKEN is referenced nowhere at all. The vars the emitted workflows DO
read are absent: PUBLIC_AGENT_PROXY_HOST, PUBLIC_AGENT_CLAUDE_CODE_VERSION (unset → @latest
supply-chain surprise), PUBLIC_AGENT_MAINTAINERS, PUBLIC_AGENT_TRIAGE_MODEL.

### Acceptance Criteria

- [x] dev/01 v1 The OPERATIONS variable table is regenerated against a fresh compile: every listed var has a read site in the emitted install and every var the emitted workflows read is listed (grep-verified both directions).
  - status: passed
  - evidence ev-dev-01: commit=c177be0a6773a742937c3d02718f3a97283333a9 acv=1
  - proof: "Table rebuilt from grep of vars.* over .github/workflows + scripts: 10 vars each with read-site + default (PROXY_HOST, CLAUDE_CODE_VERSION incl. the @latest supply-chain warning, MAINTAINERS, TRIAGE_MODEL now present); the 11 dead vars gone; phantom PUBLIC_AGENT_TRIGGER_TOKEN secret dropped; rollout-policy bullets point at the policy box." -> ev-dev-01
- [x] dev/02 v1 A guard keeps it honest (every documented PUBLIC_AGENT_* var must have a read site, mirroring the check:policy-consumers pattern) — or a recorded decision to waive with reason.
  - status: passed
  - evidence ev-dev-02: commit=d21765cda81e4591ae1d3bd6d0ea8c635e574402 acv=1
  - proof: "bin/check-doc-vars.ts mirrors check-policy-consumers: parseDocVars() extracts every backtick-quoted PUBLIC_AGENT_*/MODEL_PROXY_* name from OPERATIONS.md's rollout table row format; extractReadSites() scans .github/workflows/*.yml + .github/*.mjs + scripts/*.ts (excluding *.test.ts) for vars.NAME (GitHub Actions) and process.env.NAME/process.env['NAME'] (runtime) reads — deliberately narrower than a bare substring grep so a step-local env alias (e.g. pm.yml's PUBLIC_AGENT_CITED_VERSION, a rename of vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION) doesn't false-positive as undocumented. noReadSite() fails any documented var with no read site (docs rot); undocumentedPublicAgentVars() symmetrically fails any PUBLIC_AGENT_* var read by the emitted install but missing from the table (MODEL_PROXY_* is exempt from the symmetric direction — MODEL_PROXY_ADMIN_TOKEN/MODEL_PROXY_TOKEN are proxy-side secrets, not rollout-table variables). Wired into package.json as check:doc-vars, in the check chain next to check:policy-consumers. Passes clean on the current tree — all 10 documented rows have a read site, no undocumented PUBLIC_AGENT_* var found — so no doc-side correction was needed. bin/check-doc-vars.test.ts: 13/13 tests pass; full `bun run check` (all gates) green after wiring." -> ev-dev-02

## BL-18 simple-gh-sdlc on gh-actions wedges every PR (undocumented CI dispatch contract)

assignee: yueranyuan

**LIFTED → roadmap intent `hosted-adopter-path`** (2026-07-06): spec for the planner, not a
workable backlog item. Adopter-docs audit · persona C. The proposer dispatches CI by literal filename with sha/pr inputs and
expects it to post the `ci` commit status (`scripts/agent-propose.ts:141`); dispatch failure is
"non-fatal" after 6 retries (`agent-propose.ts:49-51`). simple-gh-sdlc's gh-actions compile ships NO
ci.yml → the required check never posts and every agent PR wedges forever. The contract (the proposer
dispatches ci/agent-review/human-approval/merge by filename; each must post its status context;
GITHUB_TOKEN anti-recursion is why) is documented nowhere.

### Acceptance Criteria

- [ ] dev/01 v1 simple-gh-sdlc ships a ci.yml resource that posts the ci status — or compile fails loudly when a code:propose profile lacks the workflows its effect step dispatches.
- [ ] dev/02 v1 The dispatch contract is documented (SPEC or OPERATIONS): which filenames the proposer dispatches, which status contexts each must post, and why.

## BL-19 Documented branch protection omits the human-approval check (security-relevant)

assignee: yueranyuan

Adopter-docs audit · personas C + D, found independently. `docs/OPERATIONS.md:321` tells adopters to
require only `ci` + `agent-review`; README/OPERATIONS never mention `human-approval` as a required
check (zero grep hits). An adopter who follows the doc gets a `human_required_paths` policy whose gate
is decorative — PRs touching gated paths auto-merge with no human. `scripts/provision-target-repo.ts`
automates the correct protection but is dev-only and referenced by no adopter doc.

### Acceptance Criteria

- [x] dev/01 v1 Every adopter-facing branch-protection instruction lists all three required checks: ci, agent-review, human-approval.
  - status: passed
  - evidence ev-dev-01: commit=3621a30c2c05df5182b5b558a63f0ba53a2b8be2 acv=1
  - proof: "OPERATIONS rollout bullet now requires ci + agent-review + human-approval and states the failure mode of omitting the gate (human_required_paths PRs auto-merge with no human). The local-runner simple-gh-sdlc section's two-check protection is correct as-is — that profile has no human-approval workflow." -> ev-dev-01
- [x] dev/02 v1 provision-target-repo.ts is documented as the provisioning step (or its settings inlined into the rollout doc).
  - status: passed
  - evidence ev-dev-02: commit=3621a30c2c05df5182b5b558a63f0ba53a2b8be2 acv=1
  - proof: "Same bullet names scripts/provision-target-repo.ts as the automated provisioning of exactly this protection." -> ev-dev-02

## BL-20 The documented repo kill-switch doesn't exist (security-relevant)

assignee: yueranyuan

**DECIDED** (maintainer, 2026-07-06): variable-only — no repo-wide control verb. The kill-switch must
not depend on the fleet's own control plane being able to run; `PUBLIC_AGENT_REPO_PAUSED` is the one
mechanism, and `/agent pause repo` now answers with that command instead of silently mislabeling.
Adopter-docs audit · personas C + D, found independently. `README.md:172` and
`docs/OSS_AGENT_RUNBOOK.md:92-93` document `/agent pause repo` setting PUBLIC_AGENT_REPO_PAUSED=true;
`.github/agent-control.mjs:20` implements only cancel|pause|resume|status|retry|decide|answer — no repo
variant, and nothing anywhere reads or writes that variable. Worse: the prefix regex matches the bare
`pause` verb, so `/agent pause repo` silently labels that one issue agent-paused while the operator
believes the fleet is stopped. `docs/ROADMAP.md:701-706,713-715` claims the repo pause is "Implemented…
proven live" — historically true, false today (pairs with BL-25).

### Acceptance Criteria

- [x] dev/01 v1 Recorded decision: reimplement the repo-wide pause (control verb sets the repo variable + emitted workflows honor it) OR remove it from README/RUNBOOK and document the real kill-switch (set the repo variable / disable workflows manually).
  - progress (2026-07-06, commit 64092c8): the doc side is already truthful — the phantom verb is
    gone from README/RUNBOOK/LIVE_TESTING_STRATEGY and the real kill-switch (the
    `PUBLIC_AGENT_REPO_PAUSED` repository variable, which every emitted agent job's `if:` honors) is
    documented in all three. The open half is the FORK itself: whether to also add a maintainer-gated
    `/agent pause repo` verb to agent-control.mjs. Maintainer call.
  - status: passed
  - evidence ev-dev-01: commit=7be83fa acv=1
  - proof: "Decision recorded above (variable-only, with rationale) in this section and in the
    control-backend.mjs header comment; docs were already variable-only from 64092c8." -> ev-dev-01
- [x] dev/02 v1 Per the decision: docs and ROADMAP corrected, and `/agent pause repo` no longer silently does the wrong thing (errors or performs the documented action).
  - progress: docs + ROADMAP corrected (64092c8, 7459b64). Remaining: agent-control.mjs still label-pauses
    the single issue on `/agent pause repo` (prefix match) — the verb-level fix lands with dev/01's decision.
  - status: passed
  - evidence ev-dev-02: commit=7be83fa acv=1
  - proof: "control-backend.mjs intercepts the repo scope: '/agent pause|resume repo' posts the
    gh variable command (pause→true, resume→false) and labels nothing; per-issue pause/resume
    unchanged. Root .github/agent-control.mjs regenerated via the upgrade CLI (check:dogfood green);
    guarded by public-agent-production.test.ts 'repo-wide pause is variable-only' (15/15 pass);
    full bun run check green." -> ev-dev-02

## BL-21 Operator-command docs describe a control plane that doesn't exist

assignee: yueranyuan

Adopter-docs audit · personas C + D. Against the shipped `.github/agent-control.mjs`: `/agent cancel`
does NOT revoke proxy runs (`README.md:175` claims it does; `agent-control.mjs:33-41` only cancels the
gh run); `/agent retry` semantics are inverted (`README.md:174` promises "without a fresh develop
pass"; `agent-control.mjs:50-67` launches a fresh developer run — new mint, new spend); `/agent status`
posts 5 run links, not the documented labels/PR/proxy-runs report (an OPERATIONS drill would judge a
correct install failed); the "Model Proxy Admin" workflow invoked by two drills doesn't exist
(`OPERATIONS.md:354`, `OSS_AGENT_RUNBOOK.md:79,107` — and `OPERATIONS.md:314-319` itself says there is
no in-repo admin workflow); `RUNBOOK:74` uses the stale `/agent develop` verb and "Public Agent PM"
workflow name; `RUNBOOK:113` dead-links PUBLIC_AGENT_PRODUCTION_ROLLOUT.md; `RUNBOOK:63-67` documents a
`blocked.md` terminal artifact with zero references in code; `README.md:144` offers conformance
`<exec|termfleet|github>` where the CLI takes `gh-actions`.

### Acceptance Criteria

- [x] dev/01 v1 Every documented operator verb matches the implementation (doc corrected or verb extended — recorded per verb), including cancel's proxy-revoke claim and retry's semantics.
  - status: passed
  - evidence ev-dev-01: commit=64092c8be4522088c9e6763a1859d3618979dfc0 acv=1
  - proof: "Per-verb reconciliation against agent-control.mjs across README/OPERATIONS/RUNBOOK: status = 5-recent-runs comment; retry = relaunch only after a failed check on the issue's agent PR (a FRESH run, fresh spend — inverted claim fixed); cancel = gh run cancel only, proxy slots reap at token TTL (~2h); pause/resume = the agent-paused label. Docs corrected in every case (no verbs extended)." -> ev-dev-01
- [x] dev/02 v1 The phantom references are gone: Model Proxy Admin workflow, blocked.md, the dead ROLLOUT link, /agent develop, "Public Agent PM", and the conformance runner-name mismatch.
  - status: passed
  - evidence ev-dev-02: commit=64092c8be4522088c9e6763a1859d3618979dfc0 acv=1
  - proof: "grep over README+docs (excl. PROOF_LEDGER history + ROADMAP phase records) returns empty for: Model Proxy Admin, blocked.md, PUBLIC_AGENT_PRODUCTION_ROLLOUT, '/agent develop', 'Public Agent PM'; admin drills now say operator-run GET /admin/limits/status; RUNBOOK terminal artifacts = result.json|pr.md with the blocked-path explained; README conformance verb corrected to exec|termfleet|gh-actions." -> ev-dev-02

## BL-22 Profile authoring has no validation floor

assignee: yueranyuan

Adopter-docs audit · persona A, all **verified live**. `validateIR` doesn't check `policy`/`resources`
→ raw engine TypeErrors (no policy → `manifest.ts:73`; `policy: {}` → substrate-github `emit.ts:154`;
no resources → `emit.ts:501`). Capability typos compile silently — `[code:proposal, tasks:chat,
totally-made-up]` exits 0; `capsToPermissions` (`emit.ts:275-287`) skips unknown names → a read-only
agent that fails at runtime. Trigger param sources and policy.box keys are equally unchecked.
`SPEC.md:238-239` promises compile warns on unsupported target features — not implemented (the CLI
never reads `ir.targets`). The SKILL.md frontmatter name==folder contract is undocumented (enforced
only by in-repo `bin/check-profiles.ts:88-91`; noted in `emit.ts:243-246` comments) — a mismatch
compiles clean and the launch prompt never resolves. Every safety net (`check:profiles` byte-identity,
`check:policy-consumers`) iterates this repo's `profiles/` only; an external author gets none of it,
and there is no `open-autonomy lint <profileDir>`.

### Acceptance Criteria

- [x] dev/01 v1 validateIR requires (or defaults) policy.box and resources; the three raw TypeErrors become actionable validation errors (fixture tests).
  - status: passed
  - evidence ev-dev-01: commit=fd2527c8fa43c97b06d4b166eb797afe44964ce5 acv=1
  - proof: "packages/core/src/ir.ts validateIR: missing `policy` -> 'missing policy (add \"policy: { box: {} }\" ...)'; `policy: {}` (no box) -> 'policy.box is required ...' (the substrate-github emit.ts:154 TypeError); missing `resources` -> 'missing resources (add \"resources: []\" ...)' (the emit.ts:501 TypeError). Fixture tests in packages/core/src/ir.test.ts cover all three plus the accept-the-minimum-form case. 98 packages/*/src tests pass." -> ev-dev-01
- [x] dev/02 v1 Unknown capability names, trigger param sources, and policy.box keys produce compile-time warnings or errors (fixture-tested).
  - status: passed
  - evidence ev-dev-02: commit=fd2527c8fa43c97b06d4b166eb797afe44964ce5 acv=1
  - proof: "validateIR checks agent capabilities (after stripping @scope) against KNOWN_CAPABILITIES (the docs/SPEC.md#capabilities catalog: code:propose/review/merge, tasks:author/converse, agent:launch/list/update/cancel) and trigger params against KNOWN_TRIGGER_SOURCES (subject.ref/actor/actorRole/text, trigger.kind) — an unrecognized value is a hard validation error naming the catalog. Verified against every profiles/*/ir.yml (none use anything outside these catalogs, so no false positives; check:profiles green). policy.box's OWN keys are deliberately NOT validated against a catalog: docs/SPEC.md#the-ir is explicit the box is per-profile, open-ended governance data the core carries verbatim and never interprets (IRPolicy.box comment) — a generic key catalog would be a restructure of that contract, not a validation floor, and would false-positive on every profile's own namespaced keys (self-driving's autonomy/risk/merge/planner/human, soc2-baseline's gh-actions, etc.) with no way to derive a correct catalog from the core alone. Recorded decision: skip general box-key validation; check:policy-consumers (BL-3) already catches the adjacent DEAD-key failure mode (a declared key nothing reads) for this repo's own profiles. Fixture tests in packages/core/src/ir.test.ts." -> ev-dev-02
- [x] dev/03 v1 The SKILL.md name==folder contract is documented and validated at compile time for external profiles.
  - status: passed
  - evidence ev-dev-03: commit=fd2527c8fa43c97b06d4b166eb797afe44964ce5 acv=1
  - proof: "packages/core/src/materialize.ts adds validateSkillFrontmatterIn(ir, profileDir) (substrate-agnostic — works off IR + profile dir), wired into bin/autonomy-compile.ts BEFORE any file is written and into bin/check-profiles.ts (replacing its old in-repo-only inline duplicate, so both share one implementation). docs/SPEC.md#the-ir documents the contract in prose right after the behavior/kind paragraph. Fixture tests in packages/core/src/materialize.test.ts (mismatch rejected, match + script-behavior accepted, missing SKILL.md skipped since missingCopySourcesIn reports that separately)." -> ev-dev-03
- [x] dev/04 v1 Recorded decision on open-autonomy lint <profileDir> (expose check-profiles-grade validation through the published CLI), and the SPEC targets-warning claim is implemented or removed.
  - status: passed
  - evidence ev-dev-04: commit=fd2527c8fa43c97b06d4b166eb797afe44964ce5 acv=1
  - proof: "Decision: BUILD it. bin/lint-profile.ts + the `lint` verb in bin/open-autonomy.ts: parses a profile, compiles it to every target it declares, runs missingCopySourcesIn + validateSkillFrontmatterIn, writes nothing — check-profiles-grade validation minus the two in-repo-only parts (cross-profile byte-identity, scripts/*.ts import-closure) that are meaningless for a single external profile dir. Verified live: `open-autonomy lint profiles/self-driving` exits 0; a fixture profile with a missing resource + a skill/folder name mismatch exits 1 naming both. bin/lint-profile.test.ts (wired into check:profiles) covers the clean case, the combined-failure case, and the no-ir.yml usage error. README.md's CLI verb list gained `lint` (and `preflight`, also missing — BL-27 dev/01 finding, fixed here since it's the same list). SPEC.md's conformance section is corrected: it now describes the MINIMAL warning actually implemented (compile warns when the requested substrate isn't in the profile's declared targets:, wired into bin/autonomy-compile.ts) and explicitly flags the fuller feature-conformance claim ('a profile uses a feature its target does not support') as NOT implemented (would need compile to consult the conformance battery's per-feature matrix)." -> ev-dev-04

## BL-23 No "write your own profile" guide

assignee: yueranyuan

**DECIDED** (maintainer, 2026-07-06): the guide lives at `profiles/README.md` — top of the `profiles/`
directory, next to the profile folders, bundled with the npm package (`files: ["profiles/", ...]` already
ships it wholesale), and explicitly NOT a profile resource (no `ir.yml` lists it, so it never compiles
into any installation). Adopter-docs audit · persona A. The entire authoring surface was one sentence
(`profiles/README.md:11` and `docs/OPERATIONS.md:187-188` "fork the profile"). The policy.box vocabulary
existed only as comments in substrate-github `emit.ts:113-186`; `SPEC.md:117`'s "four catalogs" omitted
`subject.actorRole`, which SPEC's own table (`SPEC.md:504-507`) and `profiles/simple-gh-sdlc/ir.yml:55`
use. hello is the right starting point but was not self-contained (needed a SKILL.md + 3 resource files
an author had to discover by error message).

### Acceptance Criteria

- [x] dev/01 v1 An authoring guide exists (profiles/README.md or a SPEC section): a minimal working ir.yml (agents:, bare behavior name), the SKILL.md contract, resources, the policy.box key catalog with semantics, the capability catalog, and trigger params including subject.actorRole.
  - status: passed
  - evidence ev-dev-01: commit=90f65d50ea742ad961c4035b5669c3f0b92fe44d acv=1
  - proof: "profiles/README.md gained a 'Writing your own profile' section: the complete minimal ir.yml (agents: vs actors: trap with the exact validateIR error text, bare behavior name, policy: { box: {} }, resources: []), the SKILL.md name==folder contract, the full capability catalog (one-line semantics each) + the merge boundary rule citing docs/SPEC.md#capabilities rather than duplicating it, the three trigger forms + the complete trigger-param source catalog (subject.ref/subject.actor/subject.actorRole/subject.text/trigger.kind), and a policy.box key catalog grepped live from profiles/*/ir.yml with each key's reader (script or skill), framed as 'conventions the bundled profiles use' not a closed schema. docs/SPEC.md gained a one-line 'Authoring tutorial: profiles/README.md' cross-link at the top of the IR section. bun run check green end-to-end." -> ev-dev-01
- [x] dev/02 v1 hello is documented as the authoring template with its complete required file set.
  - status: passed
  - evidence ev-dev-02: commit=90f65d50ea742ad961c4035b5669c3f0b92fe44d acv=1
  - proof: "profiles/README.md's 'The minimal working profile' section names profiles/hello/ as the recommended starting template and lists its complete required file set (ir.yml + skills/greeter/SKILL.md), calling out that hello's three resources: entries are optional extras, not part of the required set — closing the audit's 'not self-contained' finding." -> ev-dev-02

## BL-24 No hosted step-by-step install path

assignee: yueranyuan

**LIFTED → roadmap intent `hosted-adopter-path`** (2026-07-06): spec for the planner, not a
workable backlog item. Adopter-docs audit · persona C. "GitHub production rollout" (`docs/OPERATIONS.md:276-380`) is an
environment checklist, not an install path — it never says compile → commit → seed labels → enable
auto-merge → set workflow permissions → create the production environment; INSTALL-AGENT.md scopes
itself to local (`INSTALL-AGENT.md:11`). Required repo settings are listed nowhere: "Allow auto-merge"
(`rearm-auto-merge.ts:92` `gh pr merge --auto`), "Allow GitHub Actions to create and approve pull
requests" (`agent-propose.ts:132`), the production environment + deploy-tags-admin-only ruleset.
Required labels are never seeded or listed — `gh issue edit --add-label agent-paused`
(`agent-control.mjs:43`) errors on a fresh repo; the vocabulary lives only in
`scripts/open-autonomy-preflight.ts:54-87` (expectedLabels) and `bench/provision.template.json`.

### Acceptance Criteria

- [ ] dev/01 v1 OPERATIONS gains a numbered hosted install path: compile → commit → seed labels → repo settings (auto-merge, Actions-create-PRs) → branch protection (three checks) → vars → proxy → preflight → smoke test.
- [ ] dev/02 v1 Label seeding is documented or automated from expectedLabels() / provision-target-repo.ts — not left for the first control-plane command to crash on.

## BL-25 ROADMAP narrates retired architecture as current

assignee: yueranyuan

Adopter-docs audit · persona D. Four fictions: the REMOVED auto-retry loop described as current
(`docs/ROADMAP.md:28,87,94-96` — contradicting `docs/LIVE_TESTING_STRATEGY.md:101-105` "NO automatic
retry loop" and `RUNBOOK:80-83`); the retired "merge gate" job narrated as acting
(`ROADMAP.md:817-818,565-567,580-581` vs `docs/SPEC.md:366-369,466-467` "no merge gate job"); the
removed PUBLIC_AGENT_REPO_PAUSED / agent-repo-paused fallback claimed "Implemented… proven live"
(`ROADMAP.md:701-706,713-715` — no such code today; pairs with BL-20); `/agent stop` and
`/agent summarize` verbs that don't exist (`ROADMAP.md:633-637`).

### Acceptance Criteria

- [x] dev/01 v1 The four retired narratives are corrected or explicitly marked historical.
  - status: passed
  - evidence ev-dev-01: commit=7459b647a9a3a9758db08ecebf2eaad02b48adfb acv=1
  - proof: "Header supersession note names the three retired mechanisms (merge-gate job, auto-retry loop, repo-pause label fallback) and rules SPEC wins on conflict; Target Loop + CI Model rewritten to the shipped model (PM decides from history, never loops; branch protection + native auto-merge, per-SHA); the 'Implemented' repo-pause bullet marks the label fallback RETIRED; /agent stop|summarize noted as folded into cancel|status; two stale Open Design Choices marked RESOLVED." -> ev-dev-01
- [x] dev/02 v1 A grep sweep confirms ROADMAP no longer contradicts SPEC / LIVE_TESTING_STRATEGY / the shipped control plane on these four points.
  - status: passed
  - evidence ev-dev-02: commit=7459b647a9a3a9758db08ecebf2eaad02b48adfb acv=1
  - proof: "Grep: no current-tense develop_retry/max_ci_fix_attempts rules (historical note only); remaining 'merge gate' hits are phase records under the supersession header; agent-repo-paused appears only as RETIRED; /agent stop|summarize only in the folded-verbs note. ROADMAP now agrees with LIVE_TESTING_STRATEGY:101-105 and SPEC's no-merge-gate-job." -> ev-dev-02

## BL-26 Dead references and retired vocabulary across the doc set

assignee: yueranyuan

Adopter-docs audit · persona D (full link/anchor sweep — these were the only failures; every other
link resolves). Five refs to the retired AUTONOMY-IR.md (`docs/VISION.md:4,96,101`;
`docs/CONSTITUTION.md:26`; `docs/PROJECT.md:7` — PROJECT contradicts itself by :18). `SPEC.md:238` says
`scripts/autonomy-conformance.ts` (actually `bin/`). `docs/CODE_HOST_RESOURCES.md:64` says
`visual-verify.ts` (actually `agent-visual-verify.ts`). `docs/LIVE_TESTING_STRATEGY.md:78-79` and
`services/agent-model-proxy/wrangler.toml:35` reference the retired monolithic `public-agent.yml`
workflow (emitted workflows are per-agent). `LIVE_TESTING_STRATEGY.md:140` lists decision memory as
`done` coverage while ROADMAP Phase 1 (`ROADMAP.md:234-252`) has it as the first "Next Implementation".
`CONSTITUTION.md:68-69` rule 6 uses retired "install the template" vocabulary (vs
`ARCHITECTURE.md:130-131` "no templates/"); same vocabulary at `ROADMAP.md:922,941-945` and
`OPERATIONS.md:398`. **Note:** CONSTITUTION.md is human-owned — amended, never auto-edited; its two
fixes need the maintainer's hand and must be flagged, not auto-applied.

### Acceptance Criteria

- [x] dev/01 v1 All listed references are fixed (the CONSTITUTION edits done by the maintainer per its amendment rule; the wrangler.toml allowlist entry corrected or documented as intentional legacy).
  - progress (2026-07-06, commit a3ece03): everything except CONSTITUTION is done — AUTONOMY-IR refs →
    docs/SPEC.md (VISION ×3, PROJECT; SPEC:6's mention is the consolidation-history note, intentional);
    SPEC conformance path scripts/→bin/; CODE_HOST_RESOURCES agent-visual-verify; LIVE_TESTING_STRATEGY
    per-agent workflows + decision-memory coverage RETIRED-pending; wrangler.toml public-agent.yml@
    entries documented KNOWN-STALE (removal is deploy-gated); template vocabulary → compile(profile).
  - evidence ev-dev-01: commit=81cfc9e acv=1
  - proof: "CONSTITUTION amended on the maintainer's explicit approval (2026-07-06): line 26 AUTONOMY-IR.md → docs/SPEC.md (autonomy.ir.v1); rule 6 'install the template' → 'install a compiled profile'. The amendment rule held: the human decided, the edit was applied for them, never autonomously." -> ev-dev-01
- [x] dev/02 v1 A docs link-check pass is clean (no dead file references in docs/ or README).
  - status: passed
  - evidence ev-dev-02: commit=a3ece031ab183c33a51292dcd18049aabd398514 acv=1
  - proof: "Script check: every relative markdown file-link in README.md + docs/*.md resolved against the tree — link-check clean (0 dead)." -> ev-dev-02

## BL-27 Local-substrate papercuts batch

assignee: yueranyuan

Adopter-docs audit · personas B + C (each item **verified live**). Packaging/CLI: no `engines` field in
the published package despite the documented Node 22.18+ floor (`OPERATIONS.md:78`); the load-bearing
`preflight` verb is absent from the OPERATIONS quickstart steps and the README CLI list
(`README.md:143-146`); running the scheduler before `npm install termfleet` dies with raw
ERR_MODULE_NOT_FOUND; `README.md:149-152` hedges "once published" though the package IS published;
`npx ztrack issue create` as documented (`OPERATIONS.md:178,211`) errors (needs --title) and the repo
pins ztrack ^0.49.0 vs npm latest 1.0.0. Docs: `gh` missing from the prerequisites table though step 5
and the emitted runner need it; emitted scheduler daemons are backgrounded with `&` and no
lifecycle/stop guidance; maintainer bleed-through — `OPERATIONS.md:284-317` lists 18 PUBLIC_AGENT_*
vars with no provenance, `:357-369` cites private trial evidence, and the README funding badge points
at the maintainer's workers.dev. Emitted-install hygiene: hello ("no code host" demo) ships
PR/auto-merge scripts (human-approval-gate.ts etc.); the maintainer's deploy.yml ships into adopter
installs (builds services/agent-model-proxy, which isn't in the install); preflight nits — a bare run
crashes ENOENT (no mkdir for .agent-run/), reports ready:true with MODEL_PROXY_URL unset (warn-only),
and REQUIRED_FILES is self-driving-shaped so it can't validate simple-gh-sdlc.

### Acceptance Criteria

- [x] dev/01 v1 Packaging/CLI fixes: engines field, preflight in the documented CLI surface + quickstart, a friendly missing-termfleet error, the "once published" hedge removed, ztrack examples corrected (and the pin refreshed or the divergence recorded).
  - status: passed
  - evidence ev-dev-01: commit=b6efa5100dd92cf5671301fc13d93b0c9f20adfc acv=1
  - proof: "package.json declares engines: { node: \">=22.18\" }. README's CLI verb list gained `lint` + `preflight` (landed in the BL-22 commit, fd2527c, since it's the same list this finding names); OPERATIONS.md's local-runner Prerequisites step now tells the adopter to run `npx --yes open-autonomy preflight` right after `npm install termfleet`. packages/substrate-local/src/emit.ts's LOOP_DRIVER checks up front whether the schedule needs the runner (a skill-agent launch via run-agent.mjs) and whether termfleet is installed, printing an `npm install termfleet` fix and exiting 1 instead of a buried ERR_MODULE_NOT_FOUND; verified live (compiled hello to a fresh dir with no termfleet, `node scheduler/run.mjs --once` printed the friendly message, no raw stack trace) and a script-only schedule confirmed to never trip it — packages/substrate-local/src/scheduler-termfleet-guard.test.ts covers both. README's 'no clone required once published' hedge is gone (`npm view open-autonomy version` confirms 0.3.1 is live). docs/OPERATIONS.md's two `ztrack issue create` examples now include --title (verified against volter-ztrack's own cliRegistry.ts, which requires it). ztrack pin divergence: repo package.json pins ztrack ^0.49.0; `npm view ztrack version` = 1.0.0. Recorded decision: left the pin UNCHANGED per instruction — this is a maintainer call (breaking-change risk across every ztrack-using profile) outside this backlog item's scope, noted here rather than silently bumped." -> ev-dev-01
- [x] dev/02 v1 Docs fixes: gh in prereqs, scheduler lifecycle/stop guidance, maintainer bleed-through removed or marked maintainer-only.
  - status: passed
  - evidence ev-dev-02: commit=bab404378d55d31e0c04df70a9a24ee6b1bad2b1 acv=1
  - proof: "gh row added to the local prereqs table (GitHub code host only); 'Stopping the loop' block after step 4 (Ctrl-C scheduler, kill console/provider, in-flight tmux sessions, spend-stop note); Private Trial Evidence marked maintainer-history (adopters can't access those run IDs). The var-list bleed-through was fixed by BL-17 (c177be0); the README funding badge stays — it is the canonical repo's own storefront, repo-owned." -> ev-dev-02
- [x] dev/03 v1 Emitted-install hygiene: hello stops shipping PR/auto-merge scripts, deploy.yml stops shipping to adopter installs, and preflight mkdirs its output dir + validates against the compiled profile's own file set (with a recorded decision on MODEL_PROXY_URL warn-vs-fail).
  - status: passed
  - evidence ev-dev-03: commit=b6efa5100dd92cf5671301fc13d93b0c9f20adfc acv=1
  - proof: "Emitted-install hygiene half was ALREADY FIXED by the prior code-host-split wave (docs/CODE_HOST_RESOURCES.md 'Done 2026-07-06') — verified live rather than re-done: profiles/hello/ir.yml's resources carry only .github/workflows/security.yml, .github/dependabot.yml, scripts/check-supply-chain.ts (no human-approval-gate.ts/rearm-auto-merge.ts/merge.yml/human-approval.yml); `grep -rn deploy.yml profiles/*/ir.yml` shows it declared ONLY by self-driving; `bun bin/check-profiles.ts` confirms hello/simple-gh-sdlc/simple-sdlc/soc2-baseline all compile with no deploy.yml or gated scripts they don't declare. Preflight half (edited at its source of truth, profiles/self-driving/scripts/open-autonomy-preflight.ts, then re-synced to root via `bun scripts/open-autonomy-upgrade-cli.ts --apply` — it's a profile-carried resource, not a runtime-mirrored script; check:dogfood green after): main() now mkdir -p's dirname(--out) before writeFileSync (a bare run into a missing dir used to crash ENOENT); REQUIRED_FILES' four hardcoded agent-workflow names (developer/reviewer/pm/planner.yml) are replaced by agentWorkflowFiles(root), which reads the compiled manifest's own `agents[].workflowFile` — a self-driving fork that renames/adds/removes agents is now checked against ITS OWN shape, not a frozen snapshot (fixture-tested: a renamed-agent manifest is checked for its own files, not the old four; a kind:human actor with no workflowFile is correctly never checked). MODEL_PROXY_URL: recorded decision — stays a WARN never a FAIL (an operator may be mid-setup; a hard preflight FAIL on a cheap-to-add var is disproportionate vs a genuinely missing structural file), AND now recognizes a local-runner install (scheduler/run.mjs present — a substrate-local-only emit artifact, a reliable derived signal) as not needing MODEL_PROXY_URL at all, reporting pass with an explanatory message instead of perpetually warning on a var that install will never set. scripts/open-autonomy-preflight.test.ts covers all three (10 tests); bun run check (full, all gates) green after the change." -> ev-dev-03

## BL-28 The human seam on the local substrate is spec-only for adopters

assignee: yueranyuan

**DECIDED** (maintainer, 2026-07-06): build the full realization — ship the adopter-facing example AND
drive the human route in the local runner itself, not a docs-only descope. Adopter-docs audit · persona B.
No adopter-facing profile declared a kind:human actor; substrate-local's emit had no human-actor emission
path; HumanRunner (`packages/core/src/runner.ts:93`) was the documented "no-op bookkeeping floor"
(`SPEC.md:667,687`); there was no runnable human-in-the-loop recipe an adopter could follow, even though
the local substrate is where HumanRunner is actually driven.

### Acceptance Criteria

- [x] dev/01 v1 Recorded decision: ship an adopter-facing human-in-the-loop example (a profile declaring kind:human on the local substrate + a doc recipe) OR mark the local human seam designed-not-built in adopter-facing docs.
  - status: passed
  - evidence ev-dev-01: commit=926dac5 acv=1
  - proof: "Maintainer decision (2026-07-06): build the full realization, not the designed-not-built descope — ship BOTH the adopter-facing example and the local-runner drive. Recorded in this BACKLOG entry and in CLAUDE.md's Built-vs-designed section (commit=9dee69d), which moves the local human seam from 'still designed' to 'Built'." -> ev-dev-01
- [x] dev/02 v1 Implemented per the decision.
  - status: passed
  - evidence ev-dev-02: commit=926dac5 acv=1
  - proof: "compileLocal (packages/substrate-local/src/emit.ts) is now kind-aware: a kind:human actor is excluded from scheduler/schedule.json (even if it carries a cron — human-seam.test.ts's guard case) and from launch prompts, but its SKILL.md is still copied as doctrine, mirroring compileGithub's own choices exactly. The emitted scripts/runner.ts (packages/substrate-local/src/runner-frontend.ts) gained a THIRD launch route: manifestAgent(agent).kind === 'human' -> launch() PARKS a session under .open-autonomy/runner-state/human-sessions.json (id/agent/status/params/note, matching core's HumanRunner semantics verbatim) and NEVER auto-completes; engage prints to console + appends to .open-autonomy/runner-state/human-attention.md, plus an optional AUTONOMY_HUMAN_ENGAGE_CMD command hook (session JSON on stdin) for a real notification path (Slack/email/paging) — black-box, never required. Design decision (recorded): the route is REIMPLEMENTED inline in runner-frontend.ts rather than importing core's HumanRunner verbatim, because this file ships into every install with NO dependency on @open-autonomy/core; core's class remains the substrate-neutral reference (packages/core/src/runner.test.ts) this route matches. The runner CLI now implements all five Runner-contract verbs (launch/list/get/update/cancel, not just three): get/update operate on the local human-session store for a parked human ask, and delegate straight to the termfleet backend (backend.mjs, which already implemented get/update) for an agent session — so both realizations are reachable through the one seam, beyond the backlog's minimum (human-only) ask. list <actor> now also surfaces parked (running) human sessions. profiles/hello-human/ is the new adopter-facing example (one script `requester` + a declared human `approver`, no termfleet needed); docs/OPERATIONS.md gained a 'Human-in-the-loop on the local runner' recipe (park -> engage -> operator acts -> update done -> resume) pointing at it. Tests: packages/substrate-local/src/human-seam.test.ts (8 tests) cover compileLocal's kind-awareness plus the emitted runner.ts's human route driven as a REAL subprocess against a scaffolded install. LIVE PROOF (not just unit tests): compiled profiles/hello-human to a scratch dir outside the repo and ran the full flow for real — `bun scripts/request-approval.ts` parked an ask with `approver` and printed '[runner] HUMAN ENGAGE: approver #approver-1783330552588-562768 — approve the hello-human demo change'; the attention file appeared with the ask + resume command; re-running the requester before resolution reported 'still running — waiting on the human operator' (no presumed-done); acting as the operator, `bun scripts/runner.ts update approver-1783330552588-562768 --status done` exited 0; `bun scripts/runner.ts get <id>` then showed status=done and `list approver` returned `[]` (no longer in-flight); re-running the requester reported 'resolved: status=done — proceeding'. Transcript saved to <scratchpad>/bl28-live-run-transcript.txt. Note for the SPEC-holding agent: docs/SPEC.md's Runner/Handoffs sections describe the human realization generically but do not yet name the LOCAL runner's specific engage/park mechanics (console+file+cmd-hook) the way they should eventually parallel the github section's specificity — left unedited per this task's scope guard; a follow-up SPEC line would read something like 'on local, engage = console + a well-known attention file + an optional operator command hook.' `bun run check` is green (autonomy/core/conformance/runtime-sync/compile/profiles/policy-consumers/doc-vars/dogfood/provision/supply-chain/public-agent/agent-proxy/proof/soc2-register)." -> ev-dev-02

## BL-29 simple-gh-sdlc fork hazards

assignee: yueranyuan

Adopter-docs audit · persona A. The ztrack preset is keyed by the profile directory's basename
(`bin/autonomy-compile.ts:67`) — renaming a fork silently selects a nonexistent preset. The profile's
`human_required_paths` is hand-maintained with an in-comment admission "no automated guard"
(`profiles/simple-gh-sdlc/ir.yml:80-105`) — a fork inherits a silent security hole the moment it adds
a script.

### Acceptance Criteria

- [x] dev/01 v1 The preset is keyed by an explicit profile declaration (not directory basename), or basename misses degrade to a loud warning + documented fallback.
  - status: passed
  - evidence ev-dev-01: commit=40117910c9d161fe77393de2350ace6a78fc2fb9 acv=1
  - proof: "bin/ztrack-preset.ts's resolveZtrackPreset() resolves policy.box.tracker.ztrackPreset first (survives a directory rename outright); the directory-basename fallback now degrades LOUDLY (a printed WARNING naming the exact fix) when that basename isn't a bundled preset name, instead of silently printing a doomed ztrack command. profiles/simple-gh-sdlc/simple-sdlc/soc2-baseline now declare the key explicitly. Verified live: a profile copied to a renamed directory with the key declared still resolves the ORIGINAL preset name; the same profile undeclared in a renamed directory prints the warning naming the mismatch and the fix. bin/ztrack-preset.test.ts (3 tests) + bin/autonomy-compile.test.ts unaffected; wired into check:compile." -> ev-dev-01
- [x] dev/02 v1 A guard (or a documented fork instruction) keeps human_required_paths complete when OA-shipped scripts are added or renamed.
  - status: passed
  - evidence ev-dev-02: commit=40117910c9d161fe77393de2350ace6a78fc2fb9 acv=1
  - proof: "Decision: DOCUMENTED FORK INSTRUCTION, not an automated guard. Investigated a generic 'every scripts/ resource must appear in human_required_paths' check and REJECTED it: this repo's own self-driving profile legitimately ships scripts/ resources (open-autonomy-preflight.ts, open-autonomy-upgrade-cli.ts, open-autonomy-config.ts) that are correctly NOT gated there (maintainer-run tooling; open-autonomy-preflight.yml itself only runs read-only, contents:read/issues:read, so it isn't a merge-relevant privilege-escalation path) — a blanket guard would false-positive on the repo's own canonical profile, and the correct scope (only scripts an automated merge/security workflow actually EXECUTES against agent-authored code) is a per-script security judgment, not something a generic script can derive. profiles/simple-gh-sdlc/ir.yml's human_required_paths comment now spells out the fork instruction (what to add, when, and why it isn't automated) in place of the old bare 'no automated guard' admission; verified the profile's current state is already complete (its 3 resource-shipped gate scripts — rearm-auto-merge.ts, reconcile-merged-issues.ts, check-supply-chain.ts — are all listed)." -> ev-dev-02
