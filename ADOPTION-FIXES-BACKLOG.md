# Adoption-Fixes Backlog — cold-adopter audit remediation

**Branch:** `adoption-fixes-backlog` · **Date:** 2026-07-06 · **For:** Tony (builder-driving on his machine)
**Source:** `OA-INSTALL-AUDIT-FINDINGS.md` (committed at repo root on this branch) — a fresh-eyes install audit of open-autonomy into an existing repo (a termfleet clone), fully-local path, published artifacts. Findings F-1…F-17 plus the §5 verdict.
**What this branch contains:** 18 build-ready fix specs (`docs/adoption-fixes/OA-01…OA-18`), each seeded as a ztrack issue on this repo's own board (`LOCAL-30…LOCAL-47`), with a dependency graph. **No fixes are implemented on this branch** — it is a backlog, deliberately.

The specs were **authored by Fable 5** against this clone's actual source (every `file:line` citation verified by reading; the packaging findings reproduced live from the published tarballs). They are ready to build against.

## The backlog at a glance

| Issue | Spec | Finding | Priority | One-liner |
|---|---|---|---|---|
| LOCAL-30 | [OA-01](docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md) | F-1 | **P0 · rollout-gating** | 0.4.x publishes DOA (`dist/egress-guard.sh` missing); add packed-tarball smoke gate |
| LOCAL-31 | [OA-02](docs/adoption-fixes/OA-02-local-git-worktrees-must-base-on-local-trunk.md) | F-2 | **P0 · rollout-gating** | ARCHITECTURE: local-git worktrees must base on local trunk, never fetched `origin/<trunk>` |
| LOCAL-32 | [OA-03](docs/adoption-fixes/OA-03-quickstart-commit-step-and-uncommitted-harness-guard.md) | F-3 | **P0 · rollout-gating** | Quickstart commit step + loop-driver guard for an uncommitted harness (blocked by OA-02) |
| LOCAL-33 | [OA-04](docs/adoption-fixes/OA-04-workspace-name-collision-detection.md) | F-4 | P0 | Detect npm-workspace/package-name collisions with the runner dep tree; fail loudly |
| LOCAL-34 | [OA-05](docs/adoption-fixes/OA-05-preflight-false-pty-failure.md) | F-5 | P1 | preflight false pty failure — probe-load the real module, not a phantom artifact |
| LOCAL-35 | [OA-06](docs/adoption-fixes/OA-06-node-env-production-devdep-noop.md) | F-6 | P1 | preflight must detect `NODE_ENV=production`/omit=dev devDep no-op installs |
| LOCAL-36 | [OA-07](docs/adoption-fixes/OA-07-day-one-backlog-fence-install-paused.md) | F-7 | **P1 · rollout-gating** | Day-one fence: install lands PAUSED; PM must read an issue before dispatch |
| LOCAL-37 | [OA-08](docs/adoption-fixes/OA-08-launch-verification-and-dead-worker-escalation.md) | F-7b | P1 | Fail fast on unresolvable skills; PM escalates repeated failed launches |
| LOCAL-38 | [OA-09](docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md) | F-8 | P1 | Coexist with existing termfleet infra: unique ports, durable provider pin, truthful probes |
| LOCAL-39 | [OA-10](docs/adoption-fixes/OA-10-overlay-collision-detection-manifest-settings-merge.md) | F-9 | P1 | Overlay collision refusal everywhere, printed manifest receipt, `.claude/settings.json` merge |
| LOCAL-40 | [OA-11](docs/adoption-fixes/OA-11-help-adoption-hint-wrong-profile.md) | F-10 | P2 | `--help` adoption hint recommends the scaffold for existing repos (blocked by OA-01) |
| LOCAL-41 | [OA-12](docs/adoption-fixes/OA-12-tracker-onboarding-docs-and-compile-hint.md) | F-11 | P2 | Tracker onboarding: conforming issue-create, pinned ztrack, inline `.volter/` caveat |
| LOCAL-42 | [OA-13](docs/adoption-fixes/OA-13-termfleet-happy-path-noise.md) | F-12 | P2 | Cross-repo (termfleet): Linux iTerm-adapter crash; OA docs gain the `-y` |
| LOCAL-43 | [OA-14](docs/adoption-fixes/OA-14-claude-signin-verification.md) | F-13 | P2 | Real sign-in probe (`claude auth status --json`), not `--version` |
| LOCAL-44 | [OA-15](docs/adoption-fixes/OA-15-version-doc-skew-release-process.md) | F-14 | P2 | Reconcile the release process; version stamps; npm/VERSION/version.json consistency (blocked by OA-01) |
| LOCAL-45 | [OA-16](docs/adoption-fixes/OA-16-canonical-local-install-checklist.md) | F-15 | P2 | One canonical Local install checklist (blocked by OA-09/13/14) |
| LOCAL-46 | [OA-17](docs/adoption-fixes/OA-17-install-mutates-host-dep-pins.md) | F-17 | P2 | Document dep-pin rewrites; diff `package.json` before the harness commit |
| LOCAL-47 | [OA-18](docs/adoption-fixes/OA-18-doctor-self-verifying-install.md) | §5 | **P0-adjacent umbrella** | `open-autonomy doctor` — 7-check end-to-end install evidence gate (blocked by OA-01/02) |

Board: `npx ztrack issue list` from the repo root (58 issues total on this repo's board; ours are `LOCAL-30…47`, all titled `OA-NN: …`, assignee `tony`). Five issues sit in `draft` because they carry hard blockers (`Blocked by:` lines in their bodies name the blocking `LOCAL-` ids); the other thirteen are `ready`.

## Priority order

Per the product owner, **F-1, F-2, F-3, F-7 are the rollout-gating four** → build **OA-01, OA-02, OA-03, OA-07** first. Recommended sequence, respecting the graph:

1. **OA-01** (unblocks live verification of everything; today `npx open-autonomy` can't even compile — note the crash covers `lint`/`upgrade`/`conformance` too, not just `compile`)
2. **OA-02** then **OA-03** (in that order — OA-02's local-trunk semantics define what OA-03's commit step means; OA-02 is the F-2 **architecture violation**: a docs-only "push first" fix is rejected by the owner, see the spec's Alternatives)
3. **OA-07** (the last rollout-gater; also gives local its missing kill-switch)
4. **OA-18** doctor (checks 1–4, 6 can be built in parallel any time; bind check 5 to OA-02's probe when it lands; ship to adopters only after OA-01)
5. OA-04, OA-05→OA-06, OA-08, OA-09, OA-10 (P1s; OA-05 before OA-04/06 — same `bin/preflight.ts` surface)
6. The P2 tail: OA-12, OA-13, OA-14, OA-17, then the doc-consolidators OA-11, OA-15, OA-16 last (they canonicalize the corrected text of earlier fixes).

## How to drive this (Tony)

Standard fleet playbook — the specs are already written, so each issue is pickup-able cold:

1. `git fetch origin adoption-fixes-backlog && git checkout adoption-fixes-backlog` (or cherry-pick the board+specs onto your working branch).
2. Pick the next **actionable** issue (state `ready`, no unresolved `Blocked by:`): `npx ztrack issue list` / `issue view LOCAL-NN`.
3. **Dispatch a Sonnet 5 builder into an isolated worktree** with the issue's spec (`docs/adoption-fixes/OA-NN-*.md`) as the build brief. The spec's §Proposed fix names the files; its §Acceptance criteria are the contract — every AC is written to *fail today and pass after*, with the exact command.
4. **Independently verify with a tamper probe** — don't take the builder's word: run the spec's ACs yourself, and revert-spot-check one (undo a core hunk, confirm the AC fails again, restore).
5. Merge to your integration branch, flip the issue `done` (`ztrack issue edit LOCAL-NN --state done`), unblock dependents (drop the `Blocked by:` line, flip `draft`→`ready`).
6. Repeat. The four rollout-gaters first; after OA-01+OA-02+OA-03+OA-07 land, re-run the audit's cold-install path as the integration proof (the audit report §1 is the script).

Notes for builders: this repo is spec-first (see `CLAUDE.md`) — the per-issue specs here follow that convention and cite the owning docs; `bun run check` is the repo's gate suite; specs that touch emitted files (`packages/substrate-local/src/*.mjs|ts`) remind you they ship verbatim into installs, so keep them dependency-free.

## Honest deltas found during spec-writing (audit vs. current source)

The audit ran against the published `0.3.1` artifact (the only one that works); the source on `main` has moved. The specs are scoped to what is *actually* still broken in source — trust the specs over the audit report where they differ:

- **F-9 is half-fixed in source:** a byte-level clobber guard (BL-14) and a written manifest already exist; the residuals (scaffold-worded refusal text, unprinted manifest, no `settings.json` merge, deletion resurrection) are what OA-10 covers.
- **F-11's "bare `ztrack init` hint" is already fixed** (preset-aware since BL-29); OA-12 covers the real residuals and corrects the now-stale INSTALL-AGENT claim.
- **F-5's mechanism refined:** preflight names the right package but tests the wrong *artifact* (`build/Release/pty.node`, which prebuilt installs never create). Same symptom, sharper root cause; reproduced exactly.
- **F-8's open question resolved:** a *pinned* loop propagates `TERMFLEET_*` env into child launches by design — the misattachment risk is only for unpinned loops. OA-09 makes the pin durable and default.
- **F-1 is broader than the audit said:** `lint`, `upgrade`, and `conformance` are equally DOA in 0.4.x, and a written packed-tarball smoke test already exists in `RELEASING.md` — the gap is that nothing enforces it. OA-01 wires it into `bun run check` + `prepublishOnly`.
- **F-14 is worse than the audit said:** the version split was *deliberate* (0.4.x releases bumped only `package.json`), and `.open-autonomy/version.json` has stamped `0.1.0` into every install ever produced.

## Boundaries this branch respects

Backlog only — no fixes implemented, no builders dispatched, nothing merged. Pushed as `adoption-fixes-backlog`; `main` untouched; no PR opened. The audit target (a disposable termfleet clone on the audit box) was never pushed anywhere; the audit report travels here as provenance.
