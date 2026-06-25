# Changelog

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

- **Local / closed-source onboarding**: `docs/LOCAL-QUICKSTART.md`, a README front-door fork (GitHub vs
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
