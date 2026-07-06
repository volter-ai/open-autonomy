# ztrack in the self-driving profile — design proposal

**Status:** design consideration (2026-07-06), staged for ratification as roadmap item
`ztrack-typed-tracker` (OA-11 in `ROADMAP-DISTILLED.md`). Nothing here is built.

## Why this is a fit, not a bolt-on

ztrack's thesis — **"done is earned, not declared"**: a checked acceptance criterion must cite a
commit that exists, evidence captured at that commit, and pass an editable repo-local ruleset
(`ztrack check`, exit 0/1) — is the *same sentence* as OA's constitution ("done is verified, not
presumed", "capabilities are demonstrated, not asserted"). Today that value is enforced at exactly
one layer: the merge boundary (ci + agent-review + human-approval). Below it, an issue's "done" is
`the linked PR merged` (`reconcile-merged-issues.ts`), and the *content* of done — the acceptance
criteria in the issue body the planner wrote — is checked by nobody. Above it, `check:proof` is
string-presence (review §I.1, OA-2). ztrack is a deterministic oracle purpose-built for both gaps,
it is volter's own product (the dogfood loop runs both ways), and its preset vocabulary already
mirrors OA's profile vocabulary (`simple-sdlc`, `simple-gh-sdlc` — the PR-based preset matches the
gh-actions substrate's flow).

## The two placement rules (from OA's own governance)

1. **Profile layer only.** `architecture-invariants.yml` (`substrate-is-runner-only`) *names ztrack
   by name* as methodology a substrate must never embed — the invariant exists because a local
   propose-sweep once hardcoded tracker parsing. So: **zero ztrack in `packages/*`**. Integration
   surface = the profile's skills (doctrine), resources (ci.yml, config seeds), policy.box, and
   `package.json` (dev-dep). This is also why the integration is portable: another profile simply
   doesn't carry it.
2. **It passes the scripts-only-for-security test.** "An agent must not control the boundary that
   certifies its own work" is precisely the class where OA permits determinism. `ztrack check` is a
   verification gate like the merge boundary and `check:proof` — not a script doing agent work. The
   judgment stays in agents (what to build, how to decompose, what evidence means); the oracle only
   refuses fabricated proof.

## The five plug points

**P1 — Planner authors checkable issues.** The planner already writes acceptance criteria into
tracking issues; the change is to write them in the checkable grammar (AC rows with ids/versions —
`ztrack issue scaffold` gives the shape) so they become verifiable objects instead of prose.
Linked-sync mode (`ztrack init --sync github`) keeps **GitHub Issues as the source of truth** — the
tasks seam, choreography, `roadmap:<id>` labels, and the PM's `gh`-based sweep are all unchanged;
ztrack is a *schema on top of the same issues*, not a second tracker (the local store is gitignored
in linked mode; the sqlite/loop state under `.volter/` already is).

**P2 — Developer earns done.** Doctrine change: before finishing, patch the issue's ACs citing the
real commits + evidence (`ztrack ac patch`), and `ztrack check <issue>` green joins `bun run check`
in the definition of finished. A fabricated SHA, an uncommitted screenshot, or a commit that doesn't
touch the claimed area (`paths:` relevance anchors) fails deterministically. This directly attacks
the SDLC assessment's weakest link: the fleet's "done" currently rests on the reviewer's prose
judgment alone.

**P3 — CI gate (the enforcement).** A `ztrack check` step in the profile's `ci.yml` (a profile
resource, not engine output) for the PR's linked issue: a PR cannot merge while its issue's checked
ACs cite evidence that doesn't verify. Ordering stays coherent with the existing wiring — verify
pre-merge (ci), close post-merge (reconcile sweep). This is a *fifth* deterministic gate alongside
ci/agent-review/human-approval/branch-protection, same family, same justification.

**P4 — Reviewer consumes the oracle.** The reviewer's rubric gains one line: run `ztrack check` on
the linked issue and cite its result in the verdict. The reviewer stops re-deriving "did they
actually do the ACs" from prose and spends its judgment on what the checker can't do — relevance,
design, security.

**P5 — The proof ledger (OA-2 alignment).** ztrack's evidence model (commit-exists,
artifact-at-commit, relevance anchor, versioned criteria) is the shape `check:proof` should have.
Phase 2 either drives `open-autonomy-proof-audit.ts` through ztrack's SDK (`docs/API.md`) or models
each roadmap proof gate as a ztrack issue whose ACs cite run URLs + committed transcripts. Don't
build OA-2's verifier twice.

## Governance: the preset is a measuring stick

`.volter/tracker/validation/preset.mts` **defines what counts as done** — it is exactly the class of
file the constitution says humans own (like `architecture-invariants.yml` and the rubrics). So the
integration must add `.volter/tracker-config.json` + `.volter/tracker/validation/**` to
`risk.human_required_paths`: agents may *propose* a rule change, a maintainer approves it. Without
this line, the fleet could quietly weaken its own oracle — the same self-certification loophole the
merge boundary exists to prevent.

## What NOT to do

- No ztrack in substrates (invariant, above) and no tracker parsing in emit/runner code.
- Don't script the PM around `issue list --actionable` — the PM's sweep stays judgment (it *may*
  read the listing as one more input, like it reads `gh issue list` today).
- Don't adopt `ztrack loop` (the Stop-hook ralph loop) in phase 1. It's harness-specific (Claude
  Code plugin / manual `hooks/stop-check.sh` wiring), and holding a credentialed gh-actions job open
  until green interacts with `timeout:` and per-run budget in ways that need their own live proof.
  It is the natural phase-3 upgrade for the developer job (turn PM re-dispatch cycles into in-run
  iterations); earn it separately.
- Don't commit tracker runtime state (already gitignored: sqlite, loop files, sync dirs).

## Phasing (live-proof-first, per the testing strategy)

- **Phase 0 — prove the gate on the testbed.** One issue in the grammar; one developer run drives it
  green; the red→green demo (fake SHA → `evidence_commit_not_found` exit 1 → real SHA → exit 0) runs
  as the fixture. No profile change ships before this run is recorded.
- **Phase 1 — wire the profile.** ztrack dev-dep in the profile's `package.json` seed; planner +
  developer + reviewer skill edits (P1/P2/P4); `ztrack check` step in `ci.yml` (P3); preset paths
  into `human_required_paths`; linked-sync init documented in OPERATIONS. All via the gated lane —
  these are skill/workflow edits, so the human-approval gate fires by construction.
- **Phase 2 — proof-ledger convergence (P5)** with OA-2, plus the `simple-gh-sdlc` preset↔profile
  pairing as the shipped default for new installs.
- **Phase 3 — loop gate on the developer job**, if phase 1's live window shows re-dispatch cycles
  are the dominant waste (the SDLC assessment suggests they are: 4 developer fires, 2 failures).

## Honest risks

Grammar burden on fleet models (mitigation: `scaffold`/`import` produce the shape; per AGENTS.md an
agent miss is a prompt problem and self-corrects). Node ≥ 22.18 on runners (ubuntu-latest fine; the
preset is `.mts` — bun runs it natively). Sync conflicts fail `check` by design — in a fleet where
two agents can touch one issue, that's a feature (a surfaced race), but the first live window should
watch for it. And the meta-risk this repo already demonstrated: **a declared-but-unread config is
worse than none** (see `PROFILE-CONFIG-AUDIT.md` §2) — every doctrine line this design adds must
land with the mechanism that reads it, or not land at all.
