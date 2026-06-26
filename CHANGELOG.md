# Changelog

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
