# Supercode `simple-gh` install — dogfood findings (OA-19)

**Finding:** OA-19 — the runner-deps doc line under-instructs (`termfleet` only) while the emitted backend
hard-requires two packages; recorded alongside a live-fire report of every guard the `simple-gh` install
walk actually exercised, one new mechanical-vs-doctrinal gap in the landing model, and the operability
lesson from a mid-cycle usage-limit interruption.
**Priority:** P2
**Fix target:** open-autonomy (doc fix, this PR) + two follow-up design-gap issues (LOCAL-48, LOCAL-49)

## Problem / provenance

`simple-gh` (landed via PR #129, commit `5e481d4`) was installed into `volter-ai/supercode` end-to-end,
per `supercode/docs/oa-install/OA-SIMPLE-GH-INSTALL-MAXIMAL-SPEC.md`. This is a provenance report of that
install — the guards it validated live, the frictions the study predicted that actually materialized, one
new failure mode, and the operating conditions the run was completed under. It reports facts only; no
finding here is embellished beyond what was directly observed.

**Install commits on supercode main:** profile fork `0b80563`/`10f1701` (U7); harness install `07ed57f`
(U8–U10); protection escalation note `7dfc8cc` (U11); wave scoping `0b3791c` (U13); first-cycle landing
PR #2 merged as `667eebb`, reverted (negative control) at `3399d8a`, TR-16 done `1e9d3bb`, paused re-armed
`657cb7d`, findings note `e46fe62`.

## Guards validated live

- **OA-06 (NODE_ENV effective-omit trap).** The install box exports `NODE_ENV=production`; every install
  step required `NODE_ENV=development` for the duration. Preflight's omit-devDeps check passed once run
  under `development` — confirming the check fires on the real condition, not a synthetic one.
- **OA-07 (paused fence).** The fresh install started paused. `node scheduler/run.mjs --once` exited
  PAUSED with zero dispatches against a pre-existing board of roughly 104 items. The fence was re-armed
  (`.open-autonomy/paused` restored) after the governed cycle completed.
- **OA-09 (durable provider pin).** Compiled with `--provider-url http://127.0.0.1:7621` baked into
  `scheduler/schedule.json`'s `env`. The continuous loop's first line read
  `[loop] provider http://127.0.0.1:7621 (schedule/env)`. Preflight flagged a foreign box provider
  answering on 7373 — the exact F-8 coexistence hazard — and the durable pin resolved it: the loop never
  touched the foreign occupant.
- **OA-18 (doctor).** `doctor --json`, run from the packed 0.4.2 CLI with the pin applied, returned
  verdict PASS across self/env/provider/auth/harness/skills. The provider check's self-reported
  `instanceId` matched the started instance (`c6adb6e1-…`), not the foreign 7373 occupant. Note: doctor
  deliberately does **not** assert provider OWNERSHIP from a bare URL pin
  (`bin/doctor-checks.ts:562-568`) — it reports the occupant's self-reported identity and leaves the
  match to the operator. A manual instanceId comparison was required to close this out; doctor's PASS
  alone would not have been sufficient evidence of non-collision.

## Frictions (F-A..F-F)

- **F-A (uncut release) — version drift is now LIVE.** The install ran from the OA clone
  (`bun <OA>/bin/…`), because npm was `ENEEDAUTH` — the 0.4.2 release was prepared (PR #131) but publish
  is operator-gated. **Update since the study:** PR #131 was auto-merged to OA main by
  `app/github-actions` at 13:43Z, so the repo's `VERSION`/`package.json` now read `0.4.2` while npm
  `latest` is still `0.4.1` and no `v0.4.2` tag exists. An adopter running `npx open-autonomy@latest`
  still gets the broken 0.4.1 (OA-01). This is exactly the OA-15 drift the release checklist warns
  against; `npm publish`, tagging `v0.4.2`, and `npm deprecate '<=0.4.1'` are now urgent operator actions
  (see OA-15/OA-01's escalation blocks — the commands are unchanged, only newly urgent because the
  version bump already landed unpublished).
- **F-B (preset-migration).** Applied the twin precedent: supercode's installed ztrack validation preset
  stays `simple-sdlc` for ledger compatibility with the ~104 pre-existing items, while the profile
  declares `simple-gh-sdlc` grammar (BL-29). Filed as LOCAL-48 (below) — this project has no documented
  or ztrack-assisted path for actually migrating a populated ledger's preset, so every real adopter
  hand-crafts this split.
- **F-C (both deps + non-JS texture).** `bun add termfleet @termfleet/core` — BOTH required. The emitted
  backend bare-imports `@termfleet/core/local-providers.js`
  (`packages/substrate-local/src/backend.mjs:8,16-17` — the header at `:8` already says the install
  "must have `termfleet` (+ `@termfleet/core`) in node_modules"), but `docs/INSTALL-AGENT.md:208`
  instructed `npm install termfleet` only. This is the doc fix landed in this same PR (OA-19). Also
  observed: supercode is a cargo repo; its `ci.yml` (`test + clippy + fmt`) ignores the TS harness
  entirely (correct behavior — cargo-only CI), and `package.json` had no `name`/`version` fields (npm
  warns on this, harmlessly).
- **F-D (ztrackPreset vocabulary).** The forked profile declares `policy.box.tracker.ztrackPreset:
  simple-gh-sdlc` explicitly (BL-29) — no loud-degrade fired.
- **F-E (landing-model vocabulary).** The IR cannot DECLARE that merges are performed by the operator's
  deputy — it can only stay silent (no `code:merge` capability exists to assign, per
  `packages/core/src/ir.ts:118-129`). Filed as LOCAL-49 (below).

## New finding: the merge gate is doctrinal-only without branch protection

`supercode` main has no branch protection (U11: the protection `PUT` is admin-only; `otto-runhuman` is
non-admin → 404). During the U14 negative control, a deliberately-red commit (an `fmt`/`clippy`
violation) was pushed to the PR branch and `gh pr merge --squash` **landed it at the red head** — nothing
mechanical enforced the required `test + clippy + fmt` check. The breakage was immediately reverted and
main restored to green (`657cb7d`).

**Lesson:** the `simple-gh` landing model's safety depends *entirely* on the branch-protection floor in
`provision.json` actually being applied by a repo admin. Until an admin runs that `PUT`, the manager
SKILL.md's green-before-merge rule is a **behavioral** control, not a **mechanical** one — a bug in the
manager's judgment, a prompt-injection, or a future looser doctrine could land red code with nothing to
stop it.

**Recommendation:**
1. `INSTALL-AGENT.md` / the `simple-gh` profile README should state plainly that an un-admin'd install has
   NO mechanical merge gate — the required-checks list in `provision.json` is aspirational until an admin
   applies it.
2. Consider a `doctor` check that WARNs when the `required_checks` declared in `provision.json` are not
   present in the live branch-protection settings (readable non-admin via `branches/<default>/protection`
   read endpoints where permitted, or via a documented manual verification step otherwise).

## Operability: usage-limit + deputy substitution

The manager session hit the Fable-5 weekly usage limit mid-cycle — after dispatching the implementer
subagent, before the Land step. The operator-deputy (Opus 4.8) completed the Land, and the review
subagent that ran during the substitution was Sonnet-5 (a Fable-5 substitution). The tiered-subagent model
tolerated this substitution without losing the cycle's evidence trail; the weekly usage ceiling is,
however, a real operability constraint for long unattended runs and should be budgeted for explicitly in
any future multi-cycle unattended install.

## Follow-ups filed

- **LOCAL-48** — F-B: canonicalize the populated-ledger preset-migration story (declared-grammar vs
  installed-preset split).
- **LOCAL-49** — F-E: IR/manifest vocabulary for the landing actor (`auto | operator | manager-deputy`).
- **OA-19** (this doc's own doc fix) — `docs/INSTALL-AGENT.md:208` corrected in this same PR to instruct
  both `termfleet` and `@termfleet/core`.
