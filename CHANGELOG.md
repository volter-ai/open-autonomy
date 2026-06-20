# Changelog

## Unreleased

- Collapsed the IR to **one unit, the agent** (`behavior + capabilities + triggers(+params) + config`)
  and migrated open-autonomy's own profile onto it: the 6 agent workflows + control plane are now
  *generated* from `profiles/self-driving/ir.yml`; the 5 deterministic agents are self-contained
  `scripts/agent-*.ts` orchestrators, the developer is the privilege-separated codex wrapper. Added the
  `subject.actorRole` trigger source and the `model`/`workflowFile`/`persistCredentials`/`permissions`
  config keys (all documented in the standard).
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
