# Changelog

## Unreleased

### Fixed

- Exact-head reviewer results now safely normalize overlong summaries, and workflow reruns use distinct
  model-proxy identities instead of colliding with the original attempt.
- Reviewer runs now wait for live required checks before model judgment, route mechanical failures back
  to rework instead of parking them on a person, allocate no bounded model run when those checks fail, and
  require a durable typed ask for genuine human decisions.
- Human-approval re-evaluations now serialize instead of cancelling an in-flight required check, preventing
  a valid exact-head authorization from remaining merge-blocked by a cancelled duplicate context.

## 0.4.2

**The fixed npx install path.** `0.4.0`/`0.4.1` published DOA on `compile` (OA-01: a missing
`dist/egress-guard.sh` crashed `compile`/`lint`/`upgrade`/`conformance` on the packed tarball) — every
adopter since has had to clone `main` instead of running `npx open-autonomy`. This release folds in the
full 18-item adoption-fixes backlog (OA-01..OA-18) that closed that gap, the `simple-gh-sdlc` security-gate
hardening, and a new bundled profile for locally-run agents landing PRs on GitHub.

### Fixed
- **Local runner one-shot controls and session bootstrap reconciliation.** `oa once` and `oa dispatch`
  now honor declared concurrency and fence controls, manual dispatch preserves the selected schedule job's
  provider/env/singleton contract, and newly launched workspace leases plus completion effects survive the
  bounded interval before a provider first exposes the terminal through `list`.
- **Broken npm publish (OA-01).** `prepublishOnly` now runs `check:release-consistency` +
  `check:pack-smoke` — the packed tarball is installed into a throwaway project and every CLI verb is run
  under plain `node`, from the packed artifact, never the source tree — so a repeat of the missing-file
  publish is caught before it ships, not after.
- **Install guards against the failure modes that silently corrupted or froze fresh installs:** an
  overlay collision now refuses by name with a printed receipt instead of clobbering (`.claude/settings.json`
  gets a structured merge, OA-10); a fresh install lands **paused** so a pre-existing backlog is never
  dispatched before the operator reviews it, and the loop driver hard-stops on an uncommitted harness
  instead of producing zombie workers that die at launch (OA-03/OA-07); `NODE_ENV=production` (or any
  `omit=dev`-equivalent) devDep no-op installs are now detected by `preflight` instead of silently
  installing nothing (OA-06); `preflight` also detects npm-workspace/package-name collisions with the
  runner's own dependency tree before they shadow a bare `import` several process-hops deep (OA-04).
- **termfleet coexistence.** A shared/lived-in box's existing termfleet console or provider is now
  correctly classified instead of misread as "free" (`preflight`'s port probe reads the real body shape,
  not just an HTTP status); the resolved provider is pinned **durably** into `scheduler/schedule.json` via
  `compile --provider-url`, surviving new shells/supervisors/re-runs, so an unpinned loop can no longer
  silently attach to someone else's fleet (OA-09).
- **`open-autonomy doctor --json`** (OA-18): a 7-check, read-only, end-to-end install-evidence gate
  (`self`/`env`/`provider`/`auth`/`harness`/`skills`/`live`) that verifies the install would actually run
  before anyone leaves the loop unattended — replacing hand-rolled probes (a bare curl misreading a
  foreign provider, `--version` misread as a sign-in check, etc.) with one machine-parseable verdict.
- **One canonical Local install checklist** (OA-16, plus the doc-consolidator fixes it absorbed —
  OA-05/OA-11/OA-12/OA-13/OA-14/OA-17): every load-bearing local-install fact (deps, ports/pin, the commit
  step, the tracker, the stop-conditions, teardown) now has exactly one home in
  `docs/OPERATIONS.md#local-install-checklist`, with `docs/INSTALL-AGENT.md` walking an installing agent
  through it step by step instead of duplicating (or drifting from) it.
- **`simple-gh-sdlc`'s security scan is now a required, blocking merge gate** (#122), not advisory-only: a
  dispatched `security-gate.yml` posts a blocking `security` commit status for bot-authored PRs (which fire
  no `pull_request`), `provision.json` requires it in branch protection alongside `ci` + `agent-review`, and
  the reviewer skill now treats a red `security` check as a hard blocker (`agent-review=failure`,
  `human-required`) rather than a non-gating signal. Closes a hole where a security-flagged agent PR was
  mergeable with the check red.

### Added
- **Optional identity-aware native GitHub approval adapter** (#203): GitHub profiles now carry a dormant
  default-branch workflow that can turn an authoritative exact-head `agent-review=success` into a native
  APPROVE review through a distinct write-capable installation identity. It rejects self/weak/stale
  identities, never fans out by SHA, is retry-idempotent, and stays separate from `human-approval`.
  Provisioning now supports `dismiss_stale_reviews` for installations that opt into required native reviews.
- **`profiles/simple-gh`** (#129): a bundled profile for running agents on your own machine (local
  runner) while landing changes as **manually-merged PRs on GitHub** (code host) — one declared `manager`
  agent (`code:propose` + `tasks:author` + `tasks:converse`) that dispatches model-tiered in-session
  subagents for research/plan/implement/review on isolated git worktrees, lands plans as ztrack document
  sources, and merges each PR itself only once every required CI check is green **and** a fresh,
  sha-pinned review verdict is recorded — never native auto-merge. See `profiles/README.md`'s gallery
  entry for the honesty section (single credential, real-CI-as-gate, Claude-harness-only model tiering)
  and the contrast with `simple-gh-sdlc`.

### Migration notes
- Compiled installs on the local runner: re-compile with `--provider-url` to pick up the durable provider
  pin (OA-09), and run `npx open-autonomy doctor --json` once to confirm the 7-check gate passes before
  leaving the loop unattended.
- No breaking changes to existing compiled profiles; `simple-gh` is additive (new profile name only).

## 0.4.1

Security patch for the `human-approval` gate shipped in 0.4.0's profile resources — upgrade compiled
installs (re-compile / `autonomy-upgrade`) to pick up the fixed `human-approval.yml` +
`human-approval-gate.ts`.

### Fixed
- **The develop-only hold failed OPEN** (found by live testbed proof, BL-5 dev/03): the
  `human-approval` workflow never granted `issues: read`, so the gate's linked-issue label lookup
  failed and the error was swallowed into the same empty string as "no labels" — every
  `agent-develop-only` PR auto-passed the gate and merged. Fixed at both layers, in both profile
  carriers (self-driving, soc2-baseline): the workflow grants `issues: read`, and the lookup now
  **fails CLOSED** — an unreadable label set scopes the PR to require a maintainer Approve
  (`developOnlyFromLookup(null) === true`, unit-tested). Re-proven live: the held → Approve → merge
  path on a real develop-only PR, with the log showing a genuine label read.
- **Bench provisioning omitted `human-approval` from required checks** (`provision.template.json` +
  the self-driving workload seeds), so bench cells merged PRs on `ci` + `agent-review` alone. All
  three required contexts are now provisioned, matching the documented branch protection.

### Migration notes
- Compiled installs: re-run the upgrade (or re-compile) so the install's `.github/workflows/human-approval.yml`
  gains `issues: read` and `scripts/human-approval-gate.ts` gains the fail-closed lookup. Without the
  permission grant, the patched script will hold **every** PR with a linked issue (fail-closed), so
  ship both files together — the upgrade does.

## 0.4.0

The **adopter release**: everything surfaced by the four-persona adopter-docs audit of 0.3.1 (BACKLOG
BL-12..BL-29) plus the security/enforcement sweep that preceded it (BL-1..BL-11). The published package,
the front-door docs, and the compiled installs now describe and enforce the same system.

### Added
- **The human seam runs on the local substrate.** A `kind: human` actor is now *realized* locally, not
  just declared: the emitted `scripts/runner.ts` gains a third launch route that PARKS the ask (never
  auto-completes), engages the operator (console + `.open-autonomy/runner-state/human-attention.md` +
  optional `AUTONOMY_HUMAN_ENGAGE_CMD` hook), and resumes only on an authorized
  `update <id> --status done`. The runner CLI now implements all five Runner-contract verbs
  (launch/list/get/update/cancel). New example profile **`profiles/hello-human/`** demonstrates the
  full park → engage → verify → resume loop with no model or termfleet dependency; recipe in
  OPERATIONS ("Human-in-the-loop on the local runner").
- **Profile-authoring guide** at `profiles/README.md`: the minimal working profile, the SKILL.md
  contract, the capability/trigger-source catalogs, the `policy.box` conventions (each key with its
  reader), and the validate/compile workflow. SPEC.md cross-links it; SPEC stays normative.
- **`open-autonomy lint <profileDir>`**: parse + compile a profile to every declared target + the
  pre-materialize checks, writing nothing — full validation for profiles outside this repo.
- **Fresh-compile clobber guard.** Compiling a scaffold-class profile (self-driving) into a populated
  directory refuses when it would overwrite an existing file with different bytes, naming every
  collision; `--force` overrides. Additive profiles (hello, simple-sdlc, simple-gh-sdlc) are unaffected.
- **Profile validation floor.** `validateIR` now requires `policy`/`policy.box`/`resources` with
  actionable messages, names the `actors:`-vs-`agents:` mistake, and rejects unknown capability names
  and trigger-param sources instead of compiling them silently into a read-only agent or an empty
  param. The SKILL.md name==folder contract is enforced for any profile (shared core check).
- **`check:doc-vars`**: a deterministic guard that OPERATIONS' rollout-variable table matches the
  emitted install's real read-set in both directions (documented-but-never-read and
  read-but-undocumented both fail).
- **PM routes existing agent PRs to review instead of starting duplicate work.** The PM's sweep
  doctrine now checks for open PRs before dispatching a developer to an issue, and routes existing PRs
  to the reviewer via `bun scripts/runner.ts launch reviewer` when agent-review is missing or pending.
  (Issue #114, remaining scope — proof gate `pm-open-pr-review`.)
- `engines: { node: ">=22.18" }` in package.json.

### Fixed
- **SPEC's canonical profile example compiles verbatim** on both substrates (was failing twice), kept
  honest by a fixture test that extracts the exact yaml from the doc. Copy-sources are validated
  before materializing — a missing skill/resource is one clean error list, not an ENOENT partway
  through writing files.
- **`/agent pause repo` no longer silently pauses one issue.** The repo-wide kill-switch is
  variable-only by decision: the control plane now answers the repo-scoped command with the real
  mechanism (`gh variable set PUBLIC_AGENT_REPO_PAUSED`) and acts on nothing.
- **The emitted local scheduler fails friendly when termfleet is missing** (an `npm install termfleet`
  pointer instead of a buried ERR_MODULE_NOT_FOUND), and only when the schedule actually needs the
  runner. Preflight generalizes: required agent workflows derive from the compiled manifest,
  local-runner installs aren't warned about `MODEL_PROXY_URL`, and its output dir is created up front.
- **ztrack preset resolution is explicit.** Profiles declare `policy.box.tracker.ztrackPreset`
  (surviving a fork's directory rename); the basename fallback warns loudly on a miss.
- **Security/enforcement sweep (BL-1..BL-11):** the human-approval gate verifies maintainership by
  repo permission only (never `author_association`); the gate owns `agent-develop-only`; boundary
  scripts sit inside self-driving's human-gated scope; the egress guard is runner-owned (step +
  script emitted together); gate scripts are profile-carried code-host resources (byte-identical
  across carriers); block labels are one profile-owned vocabulary; every `policy.box` key has a
  reader (`check:policy-consumers`); SPEC separates contract constants from tunable policy.

### Docs
- **Operator docs describe the shipped control plane** — verb-for-verb against `agent-control.mjs`
  (retry/cancel/status semantics, phantom commands removed), the real kill-switch documented, and
  the OPERATIONS variable checklist regenerated from the emitted install's actual read-set (11 dead
  vars dropped, the `PUBLIC_AGENT_CLAUDE_CODE_VERSION` supply-chain pin called out).
- **Branch protection documents all three required checks** (`ci` + `agent-review` +
  `human-approval`) with the failure mode explained; ROADMAP stops narrating retired architecture as
  current (merge-gate job, auto-retry loop, repo-pause label — all marked superseded); termfleet
  links point at npm; dead references and retired vocabulary swept across the doc set.

### Migration notes (compiled installs)
- Re-compile (or `autonomy-upgrade`) to pick up: the new `scripts/runner.ts` (human route +
  `get`/`update` verbs), the `agent-control.mjs` repo-pause answer, the scheduler's termfleet
  guard, and the generalized preflight.
- Fresh compiles of scaffold profiles into non-empty directories now refuse on differing files —
  pass `--force` for the old overwrite behavior. Upgrades are unaffected.

## 0.3.1

Hardening from the **first live autonomous installs** (simple-gh-sdlc on a local runner driving real
volter-ai repos end-to-end): every fix below was surfaced by a real unsupervised develop → review → CI →
auto-merge cycle and is verified by a clean auto-merge.

### Fixed
- **OA's own working files no longer leak into agent PRs.** The develop/reviewer/draft skills write the
  loose issue/evidence file to a `mktemp` path **outside the repo** (never `issue.md` in the tree), and
  develop **stages only its intended change by path** — never `git add -A`, which had swept the evidence file
  and the tracker's `.volter/` sync-state churn into the PR. `agent-propose` likewise `git reset -- .volter`
  before its marker commit. The reviewer gets a **deterministic out-of-scope reject** for any OA harness file
  in the diff.
- **Agent worktrees are based on the freshest `origin/<trunk>`, not stale local `HEAD`.** The local runner
  runs on a persistent checkout that never pulls the agent PRs auto-merging on the remote, so new worktrees
  built on outdated code and conflicted with what actually merged. Now `ensureWorktree` fetches and branches
  from `origin/<trunk>` (HEAD fallback for a remoteless local-git repo).
- **Develop leaves no background process.** A lingering shell kept the session "running" so the runner never
  saw develop done and never opened the PR — the skill now runs checks in the foreground and backgrounds
  nothing.
- **`max_develop_attempts` is actually enforced** (the PM counts an `oa-rework:` marker and escalates at the
  cap), and **`human_required_paths` covers the complete OA harness** (every shipped `scripts/` file +
  `scripts/prompts/**`) so an in-scope issue can't auto-merge a rewrite of the loop's own machinery.

### Added
- **`open-autonomy preflight`** — run after installing the runner deps: rebuilds termfleet's `node-pty`
  native module if this Node has no prebuilt, and verifies `npm ci` under the repo's **CI Node version** (via
  `docker node:<major>`, non-destructively), regenerating `package-lock.json` if adding the deps desynced it
  (a failure `npm run build` can't catch locally but the first agent PR's CI would).
- **`open-autonomy harness-push`** — lands an operator harness/skill update past `enforce_admins:true` (which
  correctly blocks even admins): relax → push → always restore the gate.
- `INSTALL-AGENT.md` now calls these commands instead of asking the operator to remember the manual steps.

## 0.3.0

The **install model**: how an existing repo adopts open-autonomy, centered on the local-runner + GitHub
code-host setup (agents on your machine, auto-merging PRs on GitHub). Hardened over a long adversarial
subagent review.

### Added
- **`simple-gh-sdlc` now compiles to the `local` target** (declared `targets: [gh-actions, local]`) — run the
  agents on your own machine via termfleet while changes land as auto-merging PRs on GitHub. `check:profiles`
  now covers it, catching substrate drift.
- **`docs/INSTALL-AGENT.md`** — a guided **preflight → detect → ask → execute → verify** install playbook
  addressed to the installing agent: detect the repo (package manager, CI check names, admin/plan, the human
  login), ask the human only the judgment/irreversible calls (the merge gate, identity, the first issue, the
  uncapped-spend acknowledgment), run the overlay, and **prove the loop merges before declaring done**.
- **README + `docs/OPERATIONS.md` reframed around runner ⟂ code host** — the runner (where agents execute)
  is orthogonal to the code host (where code lives + how it merges). Three setups: hosted (Actions+GitHub),
  local-agents→GitHub-PRs, and fully-local (local-git, PR-free). Replaces the old "local = no GitHub"
  conflation; corrects the now-false "self-driving is GitHub-only" / "no auto-merge locally" claims.

### Fixed
- **Honest local merge boundary.** The `code:propose`/`code:review` scoped-token split is enforced only on
  the **hosted** runner; on a local runner the agents share your own (admin) token, so the reviewer is not
  independent and "no agent can merge" is not technically enforced. The docs now say so plainly: on local the
  real controls are **your CI in the gate + `enforce_admins: true` + supervision + a trusted repo**. The
  branch-protection payload sets `enforce_admins: true`; auto-merge is armed only **after** a supervised first
  merge; the gate-wiring validates the required contexts (rejects unfilled placeholders and an
  `agent-review`-only gate).
- **`max_develop_attempts` is now actually enforced** (it was inert — referenced by the PM but read by
  nothing). The `simple-gh-sdlc` PM gathers issue comment history and caps rework by counting a structured
  `oa-rework:` marker, escalating to `human-required` at the cap instead of relaunching forever.
- **`human_required_paths` now protects the complete OA harness** — every shipped script under `scripts/`
  (including the privileged `reconcile-merged-issues.ts` / `rearm-auto-merge.ts` / `check-supply-chain.ts`
  that `merge.yml`/`security.yml` execute) plus `scripts/prompts/**`, the skills, `scheduler/`, and
  `.open-autonomy/` — so an in-scope issue can't auto-merge a rewrite of the machinery that runs the loop.
  Scoped by filename so an adopter's own `scripts/` isn't blocked.
- **`open-autonomy compile` next-steps** now print the correct Node floor (**22.18+**, for the `.mts` ztrack
  preset) and a code-host-aware `ztrack init` (`--sync github --repo …` for a GitHub code host) instead of a
  bare `ztrack init` that silently no-ops once `.volter/` exists.
- Numerous install-guide correctness fixes from the review: portable harness staging (no `git add -A`, no
  `*.lock*` glob that aborts under zsh), reliable GitHub issue-number capture, CI-check detection that reads
  a PR's checks (not the default-branch push) and excludes push-only/path-filtered jobs, a Phase-0 preflight
  (tools + `gh` admin scope), and a Teardown section.

## 0.2.5

### Fixed
- **No second developer for an issue already in flight.** The local runner's `agent:list` now carries each
  isolated session's work-item `ref` (the issue number), so a multi-developer PM (self-driving) dedups PER
  ISSUE, not just per agent — it won't launch a second developer for an issue that already has one in flight,
  including a finished-but-not-yet-proposed (`proposing`) one. This closes the launch-level duplicate the
  deterministic PR backstop was masking (a self-driving hands-off run launched the developer twice; only one
  PR resulted, but the second run was wasted).

Also verified (no code change): the substrate-agnostic self-driving PM's github dispatch is byte-identical to
before — `runner.ts launch developer --ref N --branch …` on the gh-actions seam emits exactly
`gh workflow run developer.yml -f issue_number=N` (the `--branch` dropped) — so OA's production fleet on
gh-actions is unaffected by the rework.

## 0.2.4

### Fixed
- **self-driving now compiles to a local install.** `compileLocal` didn't map the `.gitignore` resource to its
  on-disk `gitignore` source (npm strips files named `.gitignore` from published packages; `compileGithub`
  already did this), so self-driving — the only profile carrying `.gitignore` — failed to materialize to a
  local runner (a half-written install + a swallowed stack trace). self-driving also now declares `local` in
  its `targets`, so `check:profiles` compiles it to local and catches this class of drift.

Proven: **self-driving runs hands-off on a local runner end to end** — the reworked PM dispatches the developer
through the seam, the developer isolates on its worktree branch, the reviewer posts `agent-review` with
`GITHUB_REPOSITORY` **unset** (code-host-blind), native auto-merge lands a single PR (no duplicate), and
`merge.yml`'s reconcile closes the issue. The `human-approval` gate auto-passes routine PRs and correctly
demands a maintainer Approve for human-required scope.

## 0.2.3

### Changed
- **The runner is strictly code-host-blind.** Reverted a `GITHUB_REPOSITORY` / `github.com` leak that had
  crept into the runner (the backend's env filter + a remote parser in the frontend) — the runner injects no
  repo identity. `agent-propose` and all reviewer skills now resolve their own repo via `gh`'s `{owner}/{repo}`
  placeholders (filled from the remote), so they work on GitHub Actions and a local runner alike with nothing
  injected. SPEC now documents explicit `--branch` isolation and the code-host-blind runner.

### Fixed
- **Local-runner edges.** The develop skill tolerates already being on its worktree branch
  (`git checkout -b … || git checkout …`); cron agents are single-instance (a tick skips if one is already
  actively in flight), so PM ticks no longer pile up.
- **Both duplicate-PR races are now closed.** 0.2.2 closed the reap→propose window (a pending effect counts as
  in-flight). A live hands-off run surfaced a SECOND window: a PR can merge minutes before its `Closes #<n>`
  auto-closes the issue, and the PM relaunched the developer in that lag → a duplicate PR for already-merged
  work. Closed two ways: (1) a **deterministic backstop** — `agent-propose` refuses to open a PR when the
  branch already has a merged one; (2) the simple-gh-sdlc PM checks `gh pr list --head agent/issue-<n>
  --state all` and does not relaunch when a merged PR exists.

Proven live end to end (hands-off, with `GITHUB_REPOSITORY` **unset**): a ready issue → PM → develop on its
worktree branch → the reviewer posts `agent-review` via `{owner}/{repo}` → native auto-merge → issue closed;
the deterministic backstop then refused the duplicate when the PM relaunched in the close lag.

## 0.2.2

### Changed
- **self-driving's PM dispatches through the Runner seam — it is no longer github-only.** The PM previously
  called `gh workflow run developer.yml` / `gh run list` / `gh run cancel` directly (the last github-native
  holdout), so it could not function on a local runner. Now it launches/lists/cancels via
  `bun scripts/runner.ts launch|list|cancel`, passing `--branch agent/issue-<n>` to isolate the developer —
  exactly like simple-gh-sdlc. Behavior on github is identical (the github seam turns `runner.ts launch
  developer --ref n` into the same `gh workflow run developer.yml -f issue_number=n`); the live-session peek
  via the model proxy stays as a github-box observability option. Proven live: self-driving compiled to a
  local runner isolates its developer in a worktree on `--branch` and runs on trunk without it.

### Fixed
- **No more duplicate PR from the reap→propose race.** A finished proposer session whose propose effect has
  not run yet now counts as in-flight: `agent:list` (the local runner) includes pending post-session effect
  markers, deduped by id against live sessions. So a WIP/dedup caller (the PM) never relaunches the proposer
  in the window between its session being reaped and its PR opening — which previously opened a second PR.
  Proven live: after a developer session ends, `runner.ts list developer` still reports it (`status:
  proposing`) until the PR opens.

### Added
- **`runner.ts cancel <id>`** on both substrates, completing the `agent:cancel` verb in the uniform seam:
  github cancels the Actions run (`gh run cancel`), a local runner cancels the termfleet session.

## 0.2.1

### Changed
- **Isolation is requested EXPLICITLY, not inferred from a capability.** The local runner no longer reads
  `code:propose` to decide whether to isolate a launch (or to record its post-session propose effect). A
  capability is a *permission*, and locally a fictional one — the box already trusts the agent with the
  filesystem — so using it to gate behavior was particular and opaque ("does this fake permission mean
  isolate?"). Now a caller ISOLATES a launch by naming a **`--branch`**: universal (any caller, any agent) and
  explicit (it spells out exactly what it is). The PM passes `--branch agent/issue-<n>` for a worker that
  should be isolated — matching what simple-sdlc already did — and the github runner ignores `--branch` (it
  isolates via the job's fresh checkout), so the same launch stays substrate-agnostic. `code:propose` is gone
  from the runner's behavior gating entirely (it remains the github capability → token permission). This
  supersedes 0.2.0's capability-inferred auto-isolation.
- **The post-session propose effect is gated on the code-host signal, not a capability.** `codeHost` is now
  carried in the manifest (a first-class IR signal, orthogonal to the runner); the local runner records the
  propose effect only for an isolated session (`--branch` named) on a `github` code host — where a finished
  branch becomes a PR. A `local-git` code host has the PM merge worktrees, so no propose effect. Both gating
  signals are explicit and declared, never inferred.

Re-proven live: `launch develop --ref N --branch agent/issue-N` isolates the worktree and records the marker;
the same launch WITHOUT `--branch` runs on trunk with no isolation and no marker (even though the agent
"holds `code:propose`").

## 0.2.0

### Added
- **Architecture-invariants immune system.** A per-project `.open-autonomy/architecture-invariants.yml`
  (human-owned: seed-once, drift-exempt, in `human_required_paths`) declares the design boundaries the
  autonomy loop must not erode. The reviewer ENFORCES them via a fastidious `architecture` rubric criterion —
  enumerate every applicable invariant (don't sample), emit a per-invariant `[id] PASS/FAIL — file:line`
  checkoff. An accidental VIOLATION → fail (rework); an AMENDMENT / an edit to the file / genuine ambiguity →
  human-required. **"No agent re-architects"** joins "no agent merges" and "no agent deploys" as the third
  production boundary: the loop builds *within* the architecture but cannot change it autonomously (only a
  human ratifies an invariant; the reviewer may propose one). Adoptable by any repo — ships a blank template
  the adopter ratifies.

### Changed
- **The local runner now genuinely mirrors github's job lifecycle** (completing the runner ⟂ code-host
  separation). The propose effect is an agent-owned script (`agent-propose.ts`), not runner emit; the code
  host (`codeHost: github | local-git`) is a first-class IR signal orthogonal to the runner (`targets`); and
  a **local-runner + github-code-host install is now autonomous end to end**:
  - **Isolation is the runner's job.** A `code:propose` agent is auto-isolated in a derived `agent/issue-<ref>`
    worktree (github isolates via the job's fresh checkout; local via the worktree), so the PM stays
    substrate-agnostic — it just `launch develop --ref N`, never assigning isolation.
  - **The propose effect runs on session completion**, via a per-session lifecycle hook: launch records a
    marker keyed by the session's terminalId, and the loop runs the effect in that worktree once the session
    finishes and is reaped — the local twin of github's post-skill job step. This **replaces the old
    propose-sweep poller**, which scanned `.worktrees` and reconstructed SDLC state inside the runner (a
    methodology leak the immune system would now fail).
  - **The `review:` edge is realized through the runner seam.** After opening the PR, the proposer launches
    the reviewer the same way the PM launches any worker (`runner.ts launch <reviewer> --ref <pr>`): on a
    local runner a termfleet reviewer session that reads the PR and posts the `agent-review` status; on
    github, the existing workflow dispatch (unchanged).

### Fixed
- **Local launches no longer lose the terminalId.** `createAgentWindow` blocks until the launched agent's
  first response (cold-start + setup), but the backend passed no ack timeout, so the SDK default fired while
  the window was already created server-side — the launch errored and the terminalId never returned (so no
  effect marker, so a finished proposer never proposed). It is now given a real `createTimeoutMs` (default
  120s, `TERMFLEET_CREATE_TIMEOUT_MS` overrides), with the outer spawn cap raised to match.

Proven live, end to end, through the shipped scheduler (headless termfleet provider + a disposable github
repo): a PM-style `launch develop --ref N` → auto-isolated worktree + recorded marker → session completion →
`scheduler/run.mjs` reconcile runs `agent-propose` in the worktree → PR opened on github → reviewer launched
via the runner seam.

## 0.1.8

### Changed
- **The github-Actions runner-substrate is renamed `github` → `gh-actions`.** The substrate is the agent
  *runner*; naming it `github` collided with the github *code host* (repo, PRs, CI, merge, deploy) and
  conflated two orthogonal axes (a `local` runner can drive a github code host). `targets: [gh-actions]` and
  `policy.box.gh-actions` are canonical; **`github` is accepted as a back-compat alias** (normalized on
  parse), so existing profiles/installs keep working. Code-host `github` references (`github.token`,
  `.github/`, the repo, deploy) are unchanged. Docs (ARCHITECTURE, SPEC) updated to define substrate = runner,
  distinct from the code host. Internal package/symbol names (`substrate-github`, `compileGithub`) unchanged.

## 0.1.7

### Changed
- **The merge is now a code-host resource, not agent-runner logic.** Arming native auto-merge and
  reconciling merged-issue closes left the agent workflows (the proposer's inline arm; the tasks:author
  PM/planner reconcile+re-arm) and became `merge.yml`, a carried resource on the proposer-bearing github
  profiles (self-driving + simple-gh-sdlc). The proposer dispatches it (symmetric with ci/agent-review,
  since a bot PR fires no `pull_request` event); a schedule is the deterministic backstop. This is the
  sibling of deploy's "no agent deploys" — substrate = actor runner, the merge is the profile's. See
  `docs/CODE_HOST_RESOURCES.md`. merge.yml holds `contents:write` (required to ENABLE auto-merge); the
  merge gate is branch protection (ci + agent-review, no bypass), not the permission set.

### Added
- **The github substrate now defaults the box model.** When a profile names no `policy.box.github.model`
  (e.g. the generic simple-gh-sdlc preset), the substrate supplies `deepseek/deepseek-v4-flash` instead of
  compiling `--models ""` and failing at mint. A capability default — overridable by the profile or
  `vars.PUBLIC_AGENT_MODEL`; `proxy_host`/`oidc_audience` remain profile/install config (no org identity in
  the engine).

### Verified
- Proven live end-to-end on a disposable simple-gh-sdlc fixture: agent PRs armed zero-touch via the
  dispatched `merge.yml`, auto-merged on green ci+agent-review, and reconcile closed every issue.

## 0.1.6

### Fixed

- **`simple-gh-sdlc` now actually runs end-to-end.** The 0.1.5 profile was compile-verified but had never
  run live; a real deploy found three ztrack↔substrate bugs that blocked the loop. Reworked it onto
  `self-driving`'s proven GitHub-native pattern: work items are **GitHub issues by number**, state is
  GitHub-native (a `ready` label + open-PR = in-review + merged = done), and ztrack is the **acceptance
  gate on the issue body** (`gh issue view <n> --json body --jq .body > issue.md; ztrack check issue.md`),
  not the board. `develop` commits + cites its own SHA on `agent/issue-<n>`; the `reviewer` posts the
  `agent-review` commit status itself (it holds `statuses:write`). The shared `substrate-github` propose
  step is now additive — it pushes an already-committed agent branch (and `--allow-empty` for the `Closes`
  commit) — backward compatible with `self-driving`'s commit-the-tree flow. Proven live: ready issue →
  PM → develop → PR → `ci` + `agent-review` → native auto-merge → reconcile-close.
- **`simple-sdlc` (local) rework + conflict handling.** The PM now re-dispatches a review-rejected
  in-progress issue (it checks `runner.ts list develop` for a live worker rather than assuming a branch
  means one), and aborts a merge conflict cleanly (`git merge --abort` → blocked human-required).

## 0.1.5

### Added

- **`simple-gh-sdlc` profile** — the GitHub PR-based counterpart of `simple-sdlc`: same ztrack-tracked
  dispatch loop (cron PM launches `develop`), but the merge boundary is GitHub's — `develop`
  (`code:propose`) lands its change as an auto-merging PR gated by an independent `reviewer`
  (`code:review` → `agent-review`); `ci` + `agent-review` green → native auto-merge (done = merged PR).
  Uses the ztrack `simple-gh-sdlc` preset. Compile-verified coherent (the self-driving merge bar).

### Changed

- `simple-sdlc` is `targets: [local]` (it's PR-free; github's merge boundary needs the PR model — that's
  `simple-gh-sdlc`'s job).

## 0.1.4

### Changed

- **The Runner contract is now async** (`launch`/`get`/`list`/`update`/`cancel` return `Promise`s) —
  enabling backend runners that talk to a provider over the network. `ExecRunner`, `HumanRunner`,
  `GithubRunner`, the conformance battery, and the `autonomy` CLI updated accordingly.
- **The local `TermfleetRunner` drives termfleet through its SDK** (`termfleet` / `@termfleet/core`),
  not a `termfleet` binary on PATH: `ProviderClient.createAgentWindow`/`snapshot`/`closeWindow`, with
  provider auto-discovery via `resolveDefaultProvider`. Replaces the brittle `spawnSync` + stdout-`JSON.parse`
  path with a typed, version-pinned `node_modules` dependency. Local installs now `npm install termfleet`
  (and run its console/provider via `npx termfleet`); see `docs/OPERATIONS.md#local-quickstart`.

## 0.1.3

### Changed

- **IR: replaced the `task:` trigger with `dispatch`** (breaking). A task is a work *item* whose
  lifecycle state is a property the orchestrator reads — not a trigger the substrate watches. The two
  portable trigger kinds are now `cron` (time) and `dispatch` (on-demand via the Runner / `agent:launch`);
  `event` stays the substrate-native escape hatch. The agent-facing `scripts/runner.ts` is now a uniform
  CLI (`bun scripts/runner.ts launch <agent> --ref <work-item>`) so an orchestrator dispatches workers the
  same way on every substrate.
- **`simple-sdlc` runs PR-free on local.** Its workers are `dispatch` agents the PM launches; it uses
  ztrack's `simple-sdlc` preset (commit+proof evidence, verdict-based done, no PR/remote). Skills aligned
  to ztrack 0.30's lowercase states and current `ac patch` evidence API.

### Added

- **Local / closed-source onboarding**: `docs/OPERATIONS.md#local-quickstart`, a README front-door fork (GitHub vs
  fully-local), and a next-steps print after `open-autonomy compile <profile> local`.

### Fixed

- License field corrected to `Apache-2.0` (matches `LICENSE` + README).

## Unreleased

### Fixed

- Fixed a dangling sentence in `docs/OSS_AGENT_RUNBOOK.md` — the incomplete "is in" fragment now correctly references `docs/ARCHITECTURE.md`.
- Fixed inconsistent catalog count in `docs/SPEC.md` — the "shape of the whole thing" section said "three catalogs" (missing task lifecycle) while the intro correctly states "four catalogs."

### Changed

- PM now routes existing open agent PRs to review instead of starting duplicate developer work. When the PM sweep finds an issue with an open PR, it explicitly dispatches the reviewer (or comments green status) rather than launching a new developer run. The "still in flight" case now actively dispatches review rather than passively waiting.

### Cutover

- Cut over to the **credentialed-skill agent model**: each agent is a single
  credentialed job scoped to its capabilities. The merge boundary is the
  `code:review` / `code:propose` permission split plus native auto-merge
  (required checks: `ci` + `agent-review`). There is no publisher, bundle, or
  merge-gate job.

- Collapsed the IR to **one unit, the agent** (`behavior + capabilities + triggers(+params)` plus
  optional `timeout`/`result`/`kind`) and migrated open-autonomy's own profile onto it: the 6 agent
  workflows + control plane are now *generated* from `profiles/self-driving/ir.yml`; the 5 deterministic
  agents are self-contained `scripts/agent-*.ts` orchestrators, the developer is the privilege-separated
  codex wrapper. Added the `subject.actorRole` trigger source.
- Upgrading an installation is now a **maintainer-run local command**
  (`scripts/open-autonomy-upgrade-cli.ts`), not an autonomous workflow: it compiles the canonical
  template, applies the diff to your working tree, and stops — you review, commit, and push. An upgrade
  can touch `.github/workflows/**` (a `human_required` path the CI `GITHUB_TOKEN` cannot push at all),
  so a human with their own credentials is the right actor; this needs no PAT.
- Fixed (surfaced by live-running the migrated pipeline): the `ci` status check was unsatisfiable
  (the `ci.yml` job was named `public-agent`); the merge-gate CI evaluator read a passed check as
  "pending" (misread `gh pr checks` state); PM's develop dispatch passed a `command` input the wrapper
  no longer accepts. The first two had made the autonomous reviewer unable to ever auto-merge.
- Restructured into a monorepo: the substrate-agnostic engine lives in `packages/`
  (`@open-autonomy/core`, `substrate-local`, `substrate-github`); the IR/Runner contract/
  conformance battery moved out of flat `scripts/`.
- Profiles are now first-class: `profiles/<name>/ir.yml` recipes compile to any substrate via
  `bin/autonomy-compile.ts` (`compile(profile, substrate) → installation`); added a runnable
  `profiles/hello`.
- OSS hardening: fixed a `pull_request_target` fork-escalation in the review workflow; added
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, a PR template, `CODEOWNERS`, `FUNDING.yml`; rewrote the
  README around the substrate model; gated the conformance battery in CI.

## 0.1.0 - 2026-06-16

- Added root control files, planner workflow, fleet preflight, governance
  reporting, durable decision indexing, and cookbook repository structure.
- Added template/testbed proof workflows for planner, preflight, and governance
  reports.
- Consolidated roadmap direction into `docs/ROADMAP.md`.
