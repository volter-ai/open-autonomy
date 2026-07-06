# OA-15: Version/doc skew — docs on `main` describe 0.4.x while the only working npm package is 0.3.1; make published-package ↔ docs skew visible and bounded

**Finding:** F-14 — version/doc skew: the only working package (0.3.1) is two minors behind the docs; its emitted "next steps" text differs from OPERATIONS in small ways; VERSION in git says one thing, npm latest another (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy

## Problem

An adopter today is simultaneously told three different version stories, with no marker anywhere that would let them notice:

1. **Docs describe 0.4.x; the only runnable package is 0.3.1.** The docs on `main` (git `2fa5614`) document 0.4.0-era surface — e.g. the `lint` verb (README.md:153), the clobber guard, the code-host-aware ztrack init forms — but `npm view open-autonomy dist-tags` → `latest: 0.4.1`, and 0.4.1/0.4.0 crash on `compile` (F-1/OA-01). The audit's driver had to run **0.3.1**, "an install two minor versions behind the docs" (narrative §1 Phase 3 step 7), with nothing in either the docs or the package saying which version the docs are written for.
2. **The 0.3.1 CLI's emitted "next steps" text disagrees with current OPERATIONS.** Verified in this session from the packed 0.3.1: its compile output says `npx ztrack init --preset simple-sdlc (then add work: npx ztrack issue create)` while current `docs/OPERATIONS.md:203` requires `npx ztrack issue create --title "…"` ("--title is required") — precisely the paper-cut the audit then hit as F-11's non-conforming issue. Worse, 0.3.1's next-steps ends with `Full guide: https://github.com/volter-ai/open-autonomy/blob/main/docs/OPERATIONS.md#local-runner-quickstart` — a **`blob/main`** link, so every old install's printed guide silently morphs into whatever the docs say *now*.
3. **The repo's own version artifacts disagree with each other.** `VERSION` contains `0.1.0`; `.open-autonomy/version.json` says `"version": "0.1.0"`; `package.json:3` says `"version": "0.4.1"`; npm latest is `0.4.1`; the only working publish is `0.3.1`. `docs/OPERATIONS.md:459-460` states "Open Autonomy releases are versioned by `VERSION` and `.open-autonomy/version.json`" — a claim the last two releases demonstrably did not follow.

None of this is enforced or even surfaced; skew accumulates invisibly until an adopter falls into the gap.

## Root cause (with file:line citations from this clone; for packaging, cite package.json scripts / build config lines)

1. **Two disjoint, contradictory release documents; the followed one doesn't cover versions, the version-covering one isn't followed.**
   - `docs/OPERATIONS.md:457-471` §Release process: step 1 (`:464`) says "Update `VERSION`, `.open-autonomy/version.json`, and `CHANGELOG.md`"; step 6 (`:470`) says tag `vX.Y.Z`. It never mentions npm or publishing at all — the word "npm" does not occur in the section.
   - Root `RELEASING.md` (orphaned — `grep -rn RELEASING docs/OPERATIONS.md README.md CONTRIBUTING.md` finds no reference) owns the npm flow: `RELEASING.md:20` "Bump the version in `package.json`", plus the packed smoke test (`RELEASING.md:27-34`). It never mentions `VERSION`/`version.json`.
   - Actual practice picked half of each: the `v0.4.0` release commit `a8142b4` touched **only** `CHANGELOG.md` + `package.json` and its message codifies the divergence explicitly: *"VERSION/version.json stay 0.1.0 (dogfood-locked template version); npm version is package.json alone."* `v0.4.1` (`67ae3f5`) did the same. So the written process (`OPERATIONS.md:464`) and the practiced one contradict, and **no check arbitrates**: `bun run check` (`package.json:51`) has 15 sub-checks and none compares `VERSION` ↔ `version.json` ↔ `package.json` ↔ `CHANGELOG.md`. (`VERSION` and `.open-autonomy/version.json` were last touched at commit `9cdd891`, many releases ago.)
2. **`version.json` is stamped into installs with the stale number.** `docs/OPERATIONS.md:473-475` says installs keep `.open-autonomy/version.json` "so runs can record the Open Autonomy version … used for each session" — but since it froze at `0.1.0`, every compiled install records a fiction. The mechanism designed to make version provenance visible is itself the stalest artifact.
3. **Docs carry no version statement.** Neither `README.md` nor `docs/OPERATIONS.md` nor `docs/INSTALL-AGENT.md` contains any "written for vX.Y" marker (`grep -rn "0\.4\|0\.3" README.md docs/OPERATIONS.md` → no version claims). A reader cannot detect that they are reading 0.4.x docs while running 0.3.1.
4. **The emitted next-steps hardlinks `main`.** `bin/autonomy-compile.ts:146`:
   ```ts
   `  Full guide: https://github.com/volter-ai/open-autonomy/blob/main/docs/OPERATIONS.md#local-runner-quickstart`,
   ```
   Both the 0.3.1 tarball's bundle and today's source pin `blob/main`, so the printed guide for *any* published version drifts with `main`. The next-steps prose itself (`bin/autonomy-compile.ts:135-147`) is maintained by hand in parallel with OPERATIONS' quickstart (`docs/OPERATIONS.md:59-214`) with no check tying them together — the tracker-init line has already been rewritten once between 0.3.1 and now (`bin/autonomy-compile.ts:124-133`, the code-host-aware forms), which is exactly the drift F-14 observed.
5. **Nothing verifies the registry before docs/tags advance.** Neither checklist has a "prove `npx open-autonomy@X.Y.Z` works from the registry" step; `RELEASING.md:36` tags *after* publish but verifies nothing post-publish, and `OPERATIONS.md`'s checklist never publishes at all. That is how npm `latest` stayed broken (F-1) for two releases while docs on `main` kept describing it.

## Proposed fix (spec depth: what changes, where, why this over alternatives)

Principle: **one version truth, machine-checked; docs and emitted text carry an explicit version stamp; the release checklist cannot tag/announce a version the registry can't run.** Five parts.

### 1. One version source + `check:release-consistency`

New `bin/check-release.ts` (bun, dev-only), wired as `"check:release-consistency": "bun bin/check-release.ts"` and appended to the `check` chain (`package.json:51`). Asserts, with actionable messages:

- `package.json` `.version` (the authority — it is what npm publishes) equals the full contents of `VERSION` and equals `.open-autonomy/version.json` `.version`. (Keep both mirrors: `version.json` is load-bearing — it ships into installs per `docs/OPERATIONS.md:473-475` and must finally tell the truth; `VERSION` is cheap to sync and the audit explicitly flagged its disagreement.)
- `CHANGELOG.md`'s **first** `## X.Y.Z` heading equals `package.json` version (the changelog gate: no release without notes; today's top heading is `## 0.4.1`, so this passes only when bump + notes move together).
- Every stamped doc (part 2) declares the same `vX.Y` (major.minor) as `package.json`.

Also update the dogfood profile's mirror if `version.json` is profile-carried (`profiles/self-driving/.open-autonomy/version.json` exists in this clone; the compile/dogfood gates — `check:dogfood`, `package.json:49` — will enforce whichever side is source).

### 2. A "written for" stamp in the adopter-facing docs

Add one line near the top of `README.md`, `docs/OPERATIONS.md`, and `docs/INSTALL-AGENT.md`:

```
> Documentation for **open-autonomy v0.4** (`npm install open-autonomy@^0.4.2`). Older packages: use the docs at that version's tag, e.g. `blob/v0.3.1/`.
```

Machine-checked by part 1 (regex `Documentation for \*\*open-autonomy v(\d+\.\d+)\*\*`, major.minor must equal `package.json`'s). This makes skew **visible** (every doc states what it describes) and **bounded** (a version bump without restamping fails `check` on the release PR/commit itself — the stamp can never lag more than the bump that CI refuses).

### 3. One release checklist, with a registry-verification gate before tagging

Rewrite `docs/OPERATIONS.md` §Release process (`:457-471`) as the single checklist; reduce root `RELEASING.md` to a two-line pointer at it, folding RELEASING's npm-token prerequisites and its "Gotchas" (`RELEASING.md:38-49`) into the section (they are hard-won and must survive). New ordered steps:

1. Write the `## X.Y.Z` CHANGELOG entry (with migration notes for compiled-install changes — absorbs current step 7, `OPERATIONS.md:471`).
2. Bump the version everywhere in one shot: `package.json`, `VERSION`, `.open-autonomy/version.json`, and the doc stamps. (Optionally a tiny `scripts/release-bump.ts <version>` that edits all five; the checker in part 1 makes the helper optional but the consistency mandatory.)
3. `bun run check` — which now transitively includes `check:release-consistency` (this spec) and `check:pack-smoke` (OA-01, every verb from the packed tarball).
4. `npm publish` (its `prepublishOnly` re-proves build + pack-smoke per OA-01, so a stale/broken artifact cannot ship even bypassing step 3).
5. **Verify from the registry, before any tag or announcement:** in a clean temp dir, `npx --yes open-autonomy@X.Y.Z --help`, `npx --yes open-autonomy@X.Y.Z compile simple-sdlc local .`, and `npx --yes open-autonomy@X.Y.Z compile self-driving gh-actions .` — under plain `node`, from the actual registry (catches registry-side artifact problems `npm pack` can't: bad publish contents, dist-tag mistakes, provenance/token mishaps). If this fails: fix, publish a patch, repeat — the tag and docs never point at a version this step didn't pass.
6. `git tag vX.Y.Z && git push --tags`; cut the GitHub release with the changelog entry.
7. Keep current steps 3/5 (`OPERATIONS.md:466`, `:469`): planner/preflight workflows on `main`; proof-ledger evidence.

Also rewrite the false versioning claim at `OPERATIONS.md:459-460` to name `package.json` as the authority with `VERSION`/`version.json` as enforced mirrors.

### 4. Version-pinned links + version-stamped output in the emitted next-steps

- `bin/autonomy-compile.ts:146`: replace `blob/main/...` with `` blob/v${CLI_VERSION}/... `` where `CLI_VERSION` is read from the CLI's own `package.json` at runtime (sibling of the entry dir: `join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')` — resolves in both the dev checkout (`bin/../package.json`) and the packed install (`dist/../package.json`), the exact dual-resolution pattern already used for `profilesRoot` at `bin/autonomy-compile.ts:18-21`). Checklist step 6 guarantees the tag exists moments after the package is live; the minutes-wide window between publish and tag is accepted and noted in the checklist.
- Prefix the next-steps block (`bin/autonomy-compile.ts:136`) with the version: `Next steps (local loop — open-autonomy vX.Y.Z):` so a user pasting output into an issue reveals their version instantly.

This *bounds* the emitted-text-vs-docs skew structurally: an old CLI now points at the docs snapshot that matches its own behavior, so the residual divergence is only ever "docs at tag vX vs CLI vX" (zero by construction at release time) instead of "docs at main vs CLI at anything".

### 5. Registry deprecation as skew signaling (remedial, with OA-01)

When 0.4.2 ships (OA-01), `npm deprecate` 0.4.0/0.4.1 with a message naming the fixed version. This closes F-14's live instance: `latest`, the docs stamp, and the newest working package become the same number, and anyone landing on a broken version is told so by npm itself.

Why this shape over alternatives: it attacks skew at every joint where F-14 observed it (repo artifacts ↔ each other, docs ↔ package, emitted text ↔ docs, registry ↔ docs) with **one** checker + **one** checklist, rather than a doc-only exhortation (which is what `OPERATIONS.md:464` already was, and it was silently abandoned by `a8142b4`).

## Alternatives rejected

- **Delete `VERSION` / `.open-autonomy/version.json` and let `package.json` stand alone** — `version.json` is functional (stamped into installs so runs can record their engine version, `OPERATIONS.md:473-475`); deleting it removes the one provenance channel installs have. Deleting only `VERSION` is defensible but the audit explicitly flags "VERSION file vs npm latest disagree"; asserting equality is one line of checker and zero migration risk.
- **Auto-generate `VERSION`/`version.json`/stamps in a `preversion`/`postversion` npm hook** — hooks fire only through `npm version`, which this repo's release practice doesn't use (releases are hand-committed: `a8142b4`, `67ae3f5`); a check that fails loudly on *any* path beats automation on one path. The optional `release-bump.ts` gives the convenience without relying on it.
- **Versioned docs site / docs snapshots per release (readthedocs-style)** — heavyweight for a repo whose docs are read on GitHub; `blob/vX.Y.Z/` tags already give immutable per-version docs for free, which part 4 exploits.
- **A "docs describe unreleased behavior" freeze (docs may only change with a release)** — fights the repo's dogfooding model (agents continuously edit docs on `main`, CLAUDE.md working agreement). The stamp approach lets `main` docs run ahead honestly: the stamp says what they're written for, and the changelog's `Unreleased`/next-version entry carries the delta.
- **Checking emitted next-steps text word-for-word against OPERATIONS (a `check:doc-vars`-style bidirectional gate)** — the two texts serve different lengths/audiences and *should* differ in wording; the failure mode F-14 hit was **version** mismatch, not paraphrase. Pinning the link to the version tag (part 4) fixes the class; a prose-equality gate would be brittle and constantly red. (`check:doc-vars`, `package.json:47`, works because rollout *variables* are exact strings; quickstart prose is not.)
- **Tag before publish** (so the link target surely exists before the package does) — then a failed registry verification (step 5) leaves a tag pointing at a version that was never healthy and can't be republished; verify-then-tag keeps tags meaning "live and verified", at the cost of a minutes-wide 404 window on the freshest install's link.

## Acceptance criteria (numbered, each independently testable, each must FAIL today and PASS after; name the exact command/test)

1. **Version artifacts agree.** `test "$(cat VERSION)" = "$(node -p 'require("./package.json").version')" && test "$(node -p 'require("./.open-autonomy/version.json").version')" = "$(node -p 'require("./package.json").version')"` — FAILS today (`0.1.0` vs `0.4.1`), PASSES after.
2. **The checker exists and is wired.** `bun run check:release-consistency` — FAILS today (missing script), PASSES after; and `node -e "const s=require('./package.json').scripts; if(!s.check.includes('check:release-consistency')) process.exit(1)"` — FAILS today, PASSES after.
3. **The checker bites on skew (mutation).** With `package.json` version temporarily bumped to `9.9.9` (no other edits), `bun run check:release-consistency` exits nonzero naming `VERSION`, `version.json`, `CHANGELOG.md`, and the doc stamps as stale — untestable today (no checker), PASSES (correctly fails) after. This is the "skew is bounded" property under test.
4. **Docs are stamped.** `grep -q "Documentation for \*\*open-autonomy v" README.md && grep -q "Documentation for \*\*open-autonomy v" docs/OPERATIONS.md && grep -q "Documentation for \*\*open-autonomy v" docs/INSTALL-AGENT.md` — FAILS today (no stamp anywhere), PASSES after.
5. **Changelog gate at publish.** With `package.json` version set to a value that has no `##` heading in `CHANGELOG.md`, `npm publish --dry-run` exits nonzero (via `prepublishOnly` running the consistency check) — FAILS today as a gate (today's `prepublishOnly`, `package.json:40`, is `bun run build` and passes regardless), PASSES after.
6. **The checklist includes registry verification before tagging.** `grep -q "npx --yes open-autonomy@" docs/OPERATIONS.md` — FAILS today (no such step; the section never mentions npm), PASSES after; and the tag step (`git tag vX.Y.Z`) appears **after** the registry-verify step in §Release process (inspect `docs/OPERATIONS.md` §Release process ordering).
7. **The false versioning claim is gone.** `grep -q 'releases are versioned by .VERSION' docs/OPERATIONS.md` — MATCHES today (`docs/OPERATIONS.md:459`), must find nothing after (inverted criterion: pass = no match).
8. **One checklist, not two.** `grep -q "OPERATIONS.md#release-process" RELEASING.md` — FAILS today (RELEASING.md is a full parallel procedure referencing OPERATIONS nowhere), PASSES after RELEASING.md becomes a pointer; and OPERATIONS' checklist names `check:pack-smoke` (`grep -q "check:pack-smoke" docs/OPERATIONS.md`) — FAILS today, PASSES after (depends on OA-01 landing the script).
9. **Emitted next-steps is version-pinned.** `D=$(mktemp -d); bun bin/open-autonomy.ts compile simple-sdlc local "$D" | grep -q "blob/v"` — FAILS today (`blob/main`, `bin/autonomy-compile.ts:146`), PASSES after; and the same command's output contains the CLI's own version string (`grep -q "open-autonomy v$(node -p 'require("./package.json").version')"`). Also verifiable from the packed tarball inside OA-01's `check:pack-smoke`.
10. **The live-registry instance is closed (post-release).** `npm view open-autonomy dist-tags.latest` names a version for which `npx --yes open-autonomy@latest compile simple-sdlc local .` (clean temp dir) exits 0, **and** that version's major.minor equals the docs stamp at the matching `vX.Y.Z` tag — FAILS today (latest = 0.4.1 crashes; no stamp exists), PASSES after 0.4.2+ ships through the new checklist.

## Dependencies (other OA-XX issues this blocks/is blocked by, with one-line reason)

- **Blocked by OA-01:** the checklist's pre-publish gate (`check:pack-smoke`, criterion 8's second half) is delivered by OA-01, and re-aligning npm `latest` with stamped docs (criterion 10) requires OA-01's fixed 0.4.2 publish + deprecations.
- **Sibling of OA-11 (no ordering):** OA-11 fixes CLI-text-vs-docs contradiction (help hint); this spec's checks cover version/stamp skew but deliberately not CLI prose — OA-11's help test is the CLI-side guard.

## Provenance (which audit finding + narrative step)

- Finding **F-14** (OA-INSTALL-AUDIT-FINDINGS.md §2, P2 list): "the only working package (0.3.1) is two minors behind the docs; its emitted 'next steps' text differs from OPERATIONS in small ways. VERSION in git says one thing, npm latest another."
- Narrative **§1 Phase 3 step 7** ("it means running an install two minor versions behind the docs"), audit header ("`open-autonomy` @ git `2fa5614` (docs) / npm `0.4.1` → `0.3.1`"), and **§1 Phase 3 step 11** (the `issue create` mismatch the stale 0.3.1 next-steps text funnels into, F-11).
- Independent verification in this session: `VERSION` = `0.1.0`, `.open-autonomy/version.json` = `0.1.0`, `package.json:3` = `0.4.1`, npm `latest` = `0.4.1` (crashing, per OA-01 repro), 0.3.1 tarball's emitted next-steps captured and diffed against `docs/OPERATIONS.md:194-214`; release commits `a8142b4`/`67ae3f5` inspected (`CHANGELOG.md` + `package.json` only, with the "VERSION/version.json stay 0.1.0" message); `RELEASING.md` confirmed orphaned.
