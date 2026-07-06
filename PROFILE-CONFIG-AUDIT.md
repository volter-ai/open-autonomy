# Profile & Config Consistency Audit (self-driving + its compiled installation)

**Status:** companion to `ARCHITECTURE-REVIEW.md` (2026-07-05/06). Scope: `profiles/self-driving/**`
(ir.yml, policy.box, skills, seeds, hand-written workflows), the compiled root config
(`.open-autonomy/*`, generated workflows), and every consumer that reads them (`emit.ts`, runtime
scripts, check gates). Method: every declared key traced to its read site; every doctrine claim
checked against the code that would honor it. Assess-and-report; nothing fixed here.

**Headline:** the *structure* is sound — the capability→permission map matches doctrine, the seven
hand-written workflows match root, the rubric/invariants/reviewer trilogy is coherent, and the
template seeds (roadmap.yml `items: []`, CONSTITUTION with REPLACE markers, the 6-line ROADMAP.md
pointer) are exactly right. The rot is concentrated in two patterns: **policy.box keys that nothing
reads** (behavior actually lives in prose duplicates that have already drifted), and **doctrine that
cites mechanisms that don't exist**. Each finding names its owning roadmap item.

---

## 1. Deployed-behavior findings (machine disagrees with declared policy) → OA-5

**1.1 The hold-label vocabulary has no single source of truth — and the policy key is read by
nothing.** Four sources, four different sets:

| Source | Honors |
|---|---|
| `ir.yml:169` `merge.maintainer_block_labels` (the *declared* policy) | `do-not-merge, human-required, agent-blocked` |
| `scripts/rearm-auto-merge.ts:53` `HOLD` (the *enforcing* sweep) | `agent-paused, agent-maintainer-hold, human-required, do-not-merge` |
| reviewer `SKILL.md:69-70` (explicit-HOLD rule) | `do-not-merge, agent-blocked, agent-maintainer-hold, hold` |
| pm `SKILL.md:156-157` | `agent-paused, agent-maintainer-hold` |

`maintainer_block_labels` is consumed by zero code and zero skills (grep: only bench mentions it in
comments). Concrete failure: a maintainer applies **`agent-blocked`** — the label the policy
declares — to a PR whose `agent-review` already passed. Nothing re-fires the reviewer, and
`rearm-auto-merge` (whose HOLD set omits `agent-blocked`) re-arms auto-merge: the PR lands through
the declared block. Fix direction: one label set in policy, read by the sweep and injected into the
skills — not four hand-kept copies.

**1.2 `agent-develop-only` is enforced by nothing — three components disagree about whose job it
is.** `bench-operate.ts:336-339` (the `governance-develop-only` scenario) expects the *reviewer* to
fail `agent-review` when the linked issue carries it; reviewer `SKILL.md:73-77` explicitly declines
("gated by the deterministic human-approval check — do NOT auto-fail") and its HOLD list omits the
label; `human-approval-gate.ts:77` checks only the `human-required` label + path globs. In
production the label is decorative. Decide the owner (cleanest: the gate treats it like
`human-required`) and align the other two.

**1.3 The human-approval gate's `author_association` fast path partially undoes its own permission
check.** `human-approval-gate.ts:92-95`: an Approve qualifies if `author_association ∈
{OWNER,MEMBER,COLLABORATOR}` **or** the repo-permission lookup passes. The comment (`:79-81`)
correctly says the association label is unreliable — then the fast path trusts it anyway. A
read-only collaborator's Approve satisfies the gate. Drop the association shortcut (or restrict it
to OWNER) and rely on the permission lookup it already implements.

**1.4 The gate's "merge-sensitive defaults" are fiction.** `human-approval-gate.ts:47-49` documents
the glob file as "the substrate's merge-sensitive defaults ∪ the profile's human_required_paths";
`emit.ts:521-523` writes **only** the profile list (no defaults exist anywhere). Consequence of note:
`wrangler.toml` is NOT in scope — see 3.4.

**1.5 The merge boundary's own scripts are outside the deterministically gated scope.**
`risk.human_required_paths` (ir.yml:153-163) gates `.github/workflows/**` — the *shells* of the
boundary — but neither `scripts/**` nor `packages/substrate-github/src/runtime/**`: the *logic* of
the boundary (`human-approval-gate.ts`, `rearm-auto-merge.ts`, `reconcile-merged-issues.ts`).
`human-approval.yml:39-43` correctly checks out BASE, so a PR's edit to the gate script is inert
pre-merge — but *merging* that edit needs only ci + agent-review + the auto-passing human-approval
status: an agent PR editing the gate's own qualification logic (plus its runtime mirror, to keep
`check:runtime-sync` green) lands with no human sign-off, and every subsequent gate run executes it.
The only defense today is reviewer judgment (prose). The policy *source* is transitively gated
(editing `ir.yml`'s risk lists forces a regenerated `.open-autonomy/autonomy.yml`, which IS in the
globs); the scripts are the gap. Fix: add the boundary-script paths to `human_required_paths` —
which the §2.2 migration makes natural (profile-carried scripts, gated like the workflows they serve).

## 2. Dead config: declared in `policy.box`, read by nothing → OA-6 (decide) / OA-5 (validate)

Traced every key in `ir.yml:121-176` to its consumers. Live keys: `gh-actions.*` (emit.ts:143),
`risk.human_required_paths` (emit → gate), `human.maintainers_var` (gate + provision-deploy),
`autonomy.max_open_agent_prs` (pm SKILL + ingest-manifest), `autonomy.max_develop_attempts` (pm
SKILL), `human.sla_minutes` (pm/maintainer SKILL), `planner.issue_origin_label_prefix` /
`phase_label_prefix` / `priority_labels` (planner SKILL). **Dead — no code, no skill reads them:**

- `autonomy.max_ci_retries`, `autonomy.max_review_retries` (ir.yml:139-140)
- `autonomy.stale_needs_info_minutes` (:141) — pm re-triage is event-driven only; no staleness rule
- `autonomy.require_visible_pm_status` (:142) — the pm demands visible status *in prose*, never reads the flag
- `merge.require_ci`, `merge.require_low_risk_review`, `merge.require_current_head_sha` (:166-168) —
  true *descriptions* of branch protection + gate behavior, but nothing derives behavior from them
- `merge.maintainer_block_labels` (:169) — finding 1.1
- `planner.enabled` (:171)
- `human.decision_types` (:151) — echoed as prose in maintainer SKILL only
- `risk.human_required_topics` (:164) — **duplicated, not derived**: pm `SKILL.md:67` hardcodes a
  *different* list (omits `deployment`, `dependency trust`) and reviewer `SKILL.md:95` a third
  variant. Editing the policy key changes nothing.

This is review §5.2 ("the policy.box grab-bag") made concrete: roughly half the box is decoration.
Each key should be wired (injected into the skill prompt / read by the sweep), or deleted — a policy
file that half-lies trains readers to ignore all of it.

### 2.1 The decision rule (what earns a key its place in the box)

"Is it substrate-enforced?" is the wrong test — it would evict the tunables into skill prose and
reproduce the paraphrase-drift disease in the other direction. The right test:

> **A key belongs in `policy.box` iff it is a *parameter* with exactly one authoritative copy and at
> least one real reader.** Two reader channels are legitimate: **(a) deterministic** — the
> compiler/gate/sweep derives behavior from it; **(b) agent-at-runtime** — a skill instructs the
> agent to read the key from `autonomy.yml` (and never paraphrases its value). **Norms** (judgment
> sentences) live in skill doctrine. **Descriptions** of behavior enforced elsewhere live in docs.
> **No reader → delete.**

Channel (b) is legitimate because parameters and norms change on different cycles: an operator
tuning `sla_minutes` or an install forking `max_open_agent_prs` should not need a doctrine edit; the
skill states the norm, the box carries the value. The corollary discipline is the one this repo
violated: a skill **reads** a key, it never inlines a copy (`human_required_topics` triplicated into
three drifted prose lists is what inlining produces).

Applied to §2's inventory, OA-6 dev/06 resolves each key three ways:

| Disposition | Keys |
|---|---|
| **Keep** (already earning) | `gh-actions.*`, `risk.human_required_paths`, `human.maintainers_var`, `autonomy.max_open_agent_prs`, `autonomy.max_develop_attempts`, `human.sla_minutes` (fix the `policy.box.*` citation, 3.1), `planner.issue_origin_label_prefix` / `phase_label_prefix` / `priority_labels` |
| **Wire** (parameter whose rightful reader isn't reading it) | `merge.maintainer_block_labels` → read by `rearm-auto-merge.ts` + consulted by reviewer/pm skills (collapses 1.1's four-way drift to one source); `risk.human_required_topics` → skills consult the key, the three prose copies deleted; *optionally* `merge.require_*` → provision derives branch protection from them (which would also fix 4.4 by generating `provision.json` instead of hand-owning it) — else delete as mere description |
| **Delete** (norms-as-flags and orphans) | `autonomy.require_visible_pm_status` (a boolean for a prose norm), `planner.enabled` (the roster is the enable flag), `autonomy.max_ci_retries` / `max_review_retries` (the real knob is `max_develop_attempts`), `autonomy.stale_needs_info_minutes` (SLA covers cadence), `human.decision_types` (the sentence stays in the maintainer skill) |

Regression guard so the box can't rot again: a **`check:policy-consumers`** lint — every declared
box key must appear either in runtime-script code or in a skill as a read-instruction — turns
wire-or-delete from a one-time cleanup into an invariant. (Candidate AC under OA-6.)

### 2.2 Where the block-label machinery belongs — OA already ruled, the split stopped halfway

The placement question ("are block labels substrate or profile?") is **already answered** by
`docs/CODE_HOST_RESOURCES.md` (2026-06-25/26): *substrate = the actor runner (which box, how it's
wrapped, the scoped token) — **nothing else***. Triggers, crons, agent runners. A merge is neither an
agent run nor a human run — it's a code-host event, so `merge.yml`/`human-approval.yml` are
**code-host resources carried by the profile** (a local-substrate org still has a github repo with
merge blockers; the code host is orthogonal to the runner — `architecture-invariants.yml`
`code-host-orthogonal-to-runner` says the same). And emit's only legitimate policy output is
**security DATA derived from the IR** — the doc's own precedent is
`.open-autonomy/human-required-paths.json`, "the IR projected into a runtime-readable form."

The split was executed at the **workflow layer** (merge.yml/human-approval.yml live in
`profiles/self-driving/.github/workflows/` — verified byte-identical at root) **and stopped there**.
The residue, of which finding 1.1 is the symptom:

- **The scripts those resource workflows call** (`rearm-auto-merge.ts`, `human-approval-gate.ts`,
  `reconcile-merged-issues.ts`) are still vendored by the *runner* compiler (`emit.ts:19-20`:
  "runtime backend… a profile never carries it"). So the code-host resource is a thin shim whose
  logic body lives in the layer the doc says owns nothing but running agents. (`emit.ts:481` itself
  concedes "the runtime's eventual neutral home" is elsewhere.)
- **The vocabulary is authored constants in that vendored script** (`HOLD`,
  `rearm-auto-merge.ts:53`) instead of IR-projected data. Because the label set lived in a file the
  profile has no channel to, the declared `merge.maintainer_block_labels` went unread and four prose
  copies drifted — 1.1 was structurally guaranteed.
- **The substrate should own zero labels — including `agent-paused`.** Pausing agent *runs* is
  runner lifecycle (the kill-switch); "a paused org also lands no PRs" is an org-policy choice the
  profile expresses by listing `agent-paused` in its block set. No "substrate defaults ∪ profile"
  union is needed (that fiction is finding 1.4): one list, profile-declared, mechanism-read.

Fix shape (per the doc's own pattern): the sweep reads the label set from
`.open-autonomy/autonomy.yml` (or emit projects it like `human-required-paths.json`); skills consult
the same key (§2.1 wire); and the three boundary scripts migrate from the runtime mirror to
profile-carried resources (the `profiles/self-driving/scripts/` + `resources:` mechanism already
exists and already carries preflight/config/upgrade-cli), with `human_required_paths` extended to
cover them (closes 1.5). After that, "local substrate + github code host + merge blockers" is just a
profile choice, as the architecture intends.

## 3. Doctrine that cites mechanisms that don't exist → OA-6

- **3.1** pm `SKILL.md:132` + maintainer `SKILL.md:30,36` cite `policy.box.human.sla_minutes` "from
  `.open-autonomy/autonomy.yml`" — the manifest **flattens** `box` away (`manifest.ts:73`); the real
  path is `policy.human.sla_minutes`. An agent following the instruction literally finds nothing.
- **3.2** strategist `SKILL.md:29` dedups against prior PRs via `--label origin:strategist` — **no
  mechanism applies that label** (`agent-propose.ts` adds no labels; the emit effect step adds none;
  preflight seeds only `origin:roadmap-planner`). One live PR (#79) carries it, hand-applied. The
  reliable key already exists: the `strategist/**` branch prefix (`rearm-auto-merge.ts:55`).
- **3.3** developer `SKILL.md:31-36` teaches that root `AGENTS.md` "and `docs/*`" are "GENERATED"
  from the profile — edit profile + regenerate. **False for install-owned files** (`AGENTS.md`,
  `docs/CONSTITUTION|PROJECT|ROADMAP|ARCHITECTURE.md` — `upgrade.ts:17-35`): upgrade seeds
  only-if-missing and `check-dogfood.ts:16,27` skips them, so a doctrine-following edit to the
  profile copy **silently never reaches the live file** and no check notices. True only for
  skills/workflows/`docs/standards/*`. (Already happened in reverse — see 4.2.)
- **3.4** reviewer `SKILL.md:74` + maintainer `SKILL.md:23-24` claim PRs touching `wrangler.toml`
  are human-approval-gated. The deployed globs (`.open-autonomy/human-required-paths.json`) contain
  no such entry, and `ir.yml:160-162` *deliberately* excludes `services/**` — which the reviewer's
  own §"security-critical paths" paragraph (`SKILL.md:66-68`) correctly explains. The same file
  contradicts itself.
- **3.5** `strategy-rubric.yml:27` (`governance-respect`): "the proposal only **adds** roadmap
  items" — predates strategist **retirements** (strategist `SKILL.md:41-47`) and planner operational
  edits; a legitimate retire fails the rubric's letter.
- **3.6** `check-dogfood.ts:7` comment lists `autonomy.yml` among the excluded repo-owned files; the
  code compares it (it is generated output, not install-owned). Comment-only.

## 4. Legacy artifacts and seed drift → OA-6

- **4.1** `profiles/self-driving/skills/open-autonomy-upgrade/SKILL.md` is **dead**: no actor
  declares `behavior: open-autonomy-upgrade` (the upgrade became a maintainer CLI, `ir.yml:73-75`);
  nothing compiles or references it except tests asserting the *retired workflow* stays deleted. Delete the dir.
- **4.2** The `AGENTS.md` **seed is stale relative to root** — drift in the direction doctrine 3.3
  can't see: root gained the merge-boundary paragraph, operator-commands note, LIVE_TESTING_STRATEGY
  pointer, and the **fixed** skills glob; the profile seed still ships the dead glob
  `.codex/skills/open-autonomy-*/SKILL.md` (matches nothing since the v0 OSS-kit naming was
  retired). Every new install is seeded with the stale copy. Also: both copies point agents at
  `docs/ROADMAP.md` "for current direction" — the 1131-line legacy narrative at root (the *seed*
  ROADMAP.md is a correct 6-line pointer; the root file is the OA-6 dev/01 cleanup).
- **4.3** The maintainer skill **ships nowhere**: `emit.ts:527-531` copies skills only for non-human
  actors, so `skills/maintainer/SKILL.md` — self-described as "the task spec **handed to a person**"
  — is never handed to anyone; and the compiled manifest dangles (`autonomy.yml` `agents.maintainer.skill:
  maintainer` with no `skills:` map entry, no `.codex/.claude` copy). Either ship human skills too
  (and let the gate's engage comment link the spec) or drop the manifest key.
- **4.4** `provision.json` is in `INSTALL_OWNED_PATHS` (`upgrade.ts:33`) but the self-driving
  profile ships **no seed** (soc2-baseline does; bench workloads carry their own) and canonical root
  has none — a fresh self-driving install gets no branch-protection manifest unless bench-provisioned.

## 5. Verified consistent (so nobody re-audits these)

Capability→permission map matches every skill's claims (`emit.ts:262-274`; pm's
`pull-requests: write` via `tasks:author`, reviewers hold no `contents`). The 7 hand-written profile
workflows are byte-identical at root. The reviewer-skill ↔ review-rubric ↔ architecture-invariants
trilogy is mutually consistent (same fastidious per-invariant procedure, same amendment path). The
install-owned seeds are proper templates, not stale dumps of OA's own state (`roadmap.yml` seed
`items: []`; CONSTITUTION seed with REPLACE markers; ROADMAP.md seed a 6-line pointer). No retired
doc names (AUTONOMY-IR et al.) anywhere in the shipped resource set. `.gitignore`→`gitignore`
dotfile mapping is deliberate and documented (`emit.ts:534-538`). `strategist-sources.json` root
divergence is intended install-owned customization. `ci.yml`/`merge.yml` dispatch wiring matches the
anti-recursion model, with the scheduled sweep as backstop.

## 6. Disposition

Findings 1.1–1.5 extend **OA-5** (deployed boundary soft spots — new ACs dev/06–09; 1.5 is the
sharpest of the batch: the human gate's own logic is one un-human-gated agent PR from change, with
only reviewer judgment in the way). Findings in §2–§4 extend **OA-6** (one-truth reconciliation —
new ACs dev/05–07; dev/07 completes the CODE_HOST_RESOURCES split at the script layer per §2.2).
Nothing here breaks the merge boundary outright; the pattern-level lessons: **declared config must
be read by the machine or deleted**, doctrine must cite only mechanisms that exist, and **a
documented architectural split must be finished at every layer, or the unfinished layer becomes the
drift site** (§2.2).
