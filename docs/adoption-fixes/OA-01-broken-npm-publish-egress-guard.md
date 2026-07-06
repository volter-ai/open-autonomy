# OA-01: `open-autonomy@0.4.x` npm publishes are dead on arrival — `dist/egress-guard.sh` missing from the tarball; add a packed-tarball release smoke gate

**Finding:** F-1 — `open-autonomy@0.4.1` and `0.4.0` crash on `compile` (and `lint`/`upgrade`/`conformance`) with `ENOENT … dist/egress-guard.sh`; nobody can complete the README's headline one-liner today (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P0
**Fix target:** open-autonomy

## Problem

The two most recent npm publishes (`0.4.0`, `0.4.1` — `latest` and `latest−1`; `npm view open-autonomy dist-tags` → `latest: 0.4.1`) crash at startup of 4 of the 6 CLI verbs with:

```
Error: ENOENT: no such file or directory, open '…/node_modules/open-autonomy/dist/egress-guard.sh'
```

Reproduced in this session from the published tarballs (downloaded via `npm pack open-autonomy@0.4.1` etc.):

| verb (run from packed 0.4.1 under plain `node`) | result |
|---|---|
| `--help` | OK (exit 0) |
| `preflight` | OK (exit 0) |
| `compile simple-sdlc local <dir>` | **ENOENT crash** — the audit's hard-stop, even though `local` never uses the github substrate |
| `compile self-driving gh-actions <dir>` | **ENOENT crash** |
| `lint profiles/hello` | **ENOENT crash** |
| `upgrade` (even bare, expecting usage) | **ENOENT crash** |
| `conformance exec` | **ENOENT crash** |

`0.3.1` from the registry works (verified: `compile simple-sdlc local <dir>` → `installed 36 files` + next-steps text). This is the exact wall at which the audit judges a real cold adopter permanently stuck (narrative §1 Phase 3 step 7; §4 row 3): the only recovery is undocumented trial-and-error version downgrading.

## Root cause (with file:line citations from this clone; for packaging, cite package.json scripts / build config lines)

Four layers stack up: a data file added to a hand-maintained copy list that wasn't updated, a module-scope `readFileSync` that fires on import, eager cross-substrate imports that widen the blast radius to every verb, and a release process whose only packaging gate is optional human diligence — which was demonstrably skipped.

1. **The new sibling data file (introduced between 0.3.1 and 0.4.0).** Commit `7cd1940` ("fix(BL-10): egress-guard becomes runner-owned (substrate emits step + script together)"), first shipped in `v0.4.0`, moved `egress-guard.sh` from a `soc2-baseline` profile resource to `packages/substrate-github/src/egress-guard.sh` and added a **module-scope** read in `packages/substrate-github/src/emit.ts:33-36`:

   ```ts
   const EGRESS_GUARD = readFileSync(
     join(dirname(fileURLToPath(import.meta.url)), 'egress-guard.sh'),
     'utf8',
   );
   ```

   This is the third such `import.meta.url`-sibling read in that module (after `control-backend.mjs` at `emit.ts:14-17` and `runtime/` at `emit.ts:21-25`). At 0.3.1 (`a7c81d7`) `emit.ts` contained no `egress-guard` read at all (verified via `git show a7c81d7:packages/substrate-github/src/emit.ts`), which is why 0.3.1's tarball works despite shipping no `egress-guard.sh` anywhere (verified: `tar tzf open-autonomy-0.3.1.tgz | grep -c egress` → 0).

2. **The build script's hand-maintained data-file copy list was not updated.** The published CLI is a single bun bundle: `scripts/build-cli.ts:16-20` runs `bun build bin/open-autonomy.ts --target=node --outfile dist/cli.js`, and the header comment (`scripts/build-cli.ts:5-8`) documents the contract: *"The emit code reads sibling DATA files relative to import.meta.url … the bundle keeps import.meta.url pointing at dist/, so we copy those files next to the bundle."* The copy list at `scripts/build-cli.ts:23-27` covers exactly four things:

   ```ts
   copyFileSync('packages/substrate-local/src/backend.mjs', `${DIST}/backend.mjs`);
   copyFileSync('packages/substrate-local/src/runner-frontend.ts', `${DIST}/runner-frontend.ts`);
   copyFileSync('packages/substrate-github/src/control-backend.mjs', `${DIST}/control-backend.mjs`);
   cpSync('packages/substrate-github/src/runtime', `${DIST}/runtime`, { recursive: true });
   ```

   `egress-guard.sh` is absent — and `git show v0.4.0:scripts/build-cli.ts` confirms the list was identical at the release commit; `7cd1940` touched `emit.ts`/`emit.test.ts`/profile files but never `build-cli.ts`. In the bundle, `import.meta.url` resolves to `dist/cli.js`, so the read targets `dist/egress-guard.sh`, which neither the build nor the `files` whitelist (`package.json:28-33` — `dist/`, `profiles/`, `README.md`, `LICENSE`) ever produces. Verified: `tar tzf open-autonomy-0.4.1.tgz | grep egress` → nothing; `dist/` contains only `cli.js`, `backend.mjs`, `control-backend.mjs`, `runner-frontend.ts`, `runtime/*`.

3. **Why a `local` compile dies on a github-substrate asset.** The top-level CLI (`bin/open-autonomy.ts:40-58`) delegates via dynamic `import()`, so laziness exists *per verb* (which is why `--help`/`preflight` survive). But the compile verb's module statically imports **both** substrate compilers before looking at any argument — `bin/autonomy-compile.ts:13-15`:

   ```ts
   import { compileLocal } from '@open-autonomy/substrate-local';
   import { compileGithub } from '@open-autonomy/substrate-github';
   ```

   The substrate is only chosen at `bin/autonomy-compile.ts:69` (`const out = substrate === 'local' ? compileLocal(ir) : compileGithub(ir);`), long after module init of `substrate-github` has already executed `emit.ts:33-36` and thrown. Same eager imports kill the other verbs: `bin/lint-profile.ts:13`, `bin/autonomy-upgrade.ts:15`, `bin/autonomy-conformance.ts:7`. (In the crash repro, the stack shows the bundler's lazy `__esm` init wrappers firing on the `compile` chunk's import — bundling preserved the verb-level laziness but nothing below it.)

4. **Why it escaped release, twice.** There is **no publish CI at all** — `.github/workflows/` (and its source of truth `profiles/self-driving/.github/workflows/`: `ci.yml`, `codeql.yml`, `deploy.yml` [the model-proxy deploy], `human-approval.yml`, `merge.yml`, `open-autonomy-preflight.yml`, `security.yml`) contains no npm-publish or pack-smoke workflow; publishing is manual per `RELEASING.md`. Two written release procedures exist and only one would have caught this:
   - `RELEASING.md:27-34` prescribes a packed-artifact smoke test (`npm pack` → install into a throwaway repo → `npx --no-install open-autonomy compile self-driving github .`) and even warns at `RELEASING.md:47-49`: *"The source tree lies about packaging … Always run the step-3 packed smoke test before publishing."* This test **would have failed loudly** for 0.4.0/0.4.1 (even the gh-actions compile crashes at import).
   - `docs/OPERATIONS.md:457-471` §Release process, whose step 4 (`docs/OPERATIONS.md:467-468`) compiles **from the source tree** (`bun bin/open-autonomy.ts compile profiles/self-driving gh-actions <dir>`) — which always passes, because in a checkout `egress-guard.sh` sits right next to `emit.ts`.

   The `v0.4.0` release commit `a8142b4` records which one was actually run: *"Release checklist: full check green; compiled clean install's own check green (exit 0); migration notes in CHANGELOG"* — the source-tree variant, not the packed one. `v0.4.1` (`67ae3f5`) touched only `CHANGELOG.md` + `package.json` and shipped the same broken `dist/`. The repo's own gate `bun run check` (`package.json:51`) contains 15 sub-checks and none exercises a packed artifact; `check:compile` (`package.json:44`) also runs from source. `prepublishOnly` (`package.json:40`) is just `bun run build` — it rebuilds but verifies nothing.

## Proposed fix (spec depth: what changes, where, why this over alternatives)

Three independent layers: (A) ship the file, (B) make the failure mode impossible to widen (lazy data reads + per-substrate import), (C) a release gate that makes this whole *class* of bug unshippable. A alone fixes today's bug; B bounds the next one; C is what F-1 explicitly asks for ("Fix class: release CI that smoke-runs every published verb from the packed tarball").

### A. Packaging fix (the one-line bug)

In `scripts/build-cli.ts`, after line 26, add:

```ts
copyFileSync('packages/substrate-github/src/egress-guard.sh', `${DIST}/egress-guard.sh`);
```

Additionally, replace the four ad-hoc copy calls (`scripts/build-cli.ts:24-27`) with a single declared manifest + post-copy existence assertion, so the script fails the build (exit ≠ 0) if any listed source is missing, and the manifest is the *one* place a new sibling data file must be registered:

```ts
const DATA_FILES = [
  ['packages/substrate-local/src/backend.mjs', 'backend.mjs'],
  ['packages/substrate-local/src/runner-frontend.ts', 'runner-frontend.ts'],
  ['packages/substrate-github/src/control-backend.mjs', 'control-backend.mjs'],
  ['packages/substrate-github/src/egress-guard.sh', 'egress-guard.sh'],
] as const;
```

**Guard against the next unregistered sibling read:** after bundling, `build-cli.ts` scans the workspace sources that feed the bundle (`packages/*/src/*.ts`, `bin/*.ts`, excluding `*.test.ts` and `src/runtime/`) for the established sibling-read idiom — `join(dirname(fileURLToPath(import.meta.url)), '<literal>')` — and asserts every extracted `<literal>` exists under `dist/` after the copies. The idiom is a hard convention in this codebase (all five current sites match it: `emit.ts:15/21/34`, `substrate-local/src/emit.ts:34-35` [`backend.mjs`, `runner-frontend.ts` via `here` at `substrate-local/src/emit.ts:31`]), so a static scan is reliable; a miss becomes a **build** failure instead of a runtime ENOENT in production. Why in `build-cli.ts` and not a separate check: the knowledge ("which files must sit beside the bundle") lives where the copying happens; a separate checker would duplicate the manifest and drift.

### B. Blast-radius fix: a github-substrate asset must never kill a `local` compile

Two changes, both small, complementary — do both:

1. **Lazy, memoized data reads in `emit.ts`.** Convert the three module-scope constants (`packages/substrate-github/src/emit.ts:14-17`, `21-25`, `33-36`) into lazily-initialized memoized getters (e.g. `let _egressGuard: string | undefined; function egressGuardSrc() { return (_egressGuard ??= readFileSync(...)); }`), called from the emit sites that use them (`emit.ts:522` for `EGRESS_GUARD`, and the `AGENT_CONTROL`/`RUNTIME` use sites). Wrap the read to rethrow with an actionable message naming the missing file and the likely cause ("packaging bug — file missing next to the bundle; reinstall / report"). Apply the same treatment to `packages/substrate-local/src/emit.ts:31-35` (`RUNNER_BACKEND`/`RUNNER_FRONTEND`) for symmetry. After this, *importing* a substrate module never touches disk; only actually compiling to that substrate does. This is the deeper fix because `lint` (`bin/lint-profile.ts:13-14`) legitimately imports **both** substrates (it compiles a profile to every declared target) and `conformance` needs `GithubRunner` — per-verb import surgery alone can't save them.

2. **Substrate-selected dynamic import in `bin/autonomy-compile.ts`.** Replace the static imports at `bin/autonomy-compile.ts:14-15` with a dynamic import of only the chosen substrate after argument parsing (around line 69): `const { compileLocal } = await import('@open-autonomy/substrate-local')` / `const { compileGithub } = await import('@open-autonomy/substrate-github')`. This is defense-in-depth over (1): even a *non-data-file* init-time defect in the github substrate (a syntax-level regression, a future top-level await) can then no longer take down `compile <profile> local`. `bin/open-autonomy.ts` already establishes dynamic-import delegation as the house pattern (`bin/open-autonomy.ts:40-58`), and `bun build` demonstrably preserves that laziness in the bundle (the working `--help`/`preflight` verbs prove it).

Why not *only* B without A: the github compile path still needs the file; B merely scopes the failure correctly. Why not inline the shell script into `emit.ts` as a template literal: `7cd1940`'s design deliberately keeps `egress-guard.sh` a real sibling `.sh` file (editable, shell-lintable, same pattern as `control-backend.mjs`); inlining would fix packaging by destroying that property and would leave the identical trap for the *next* sibling file.

### C. Release smoke gate: every CLI verb, from the PACKED tarball, in CI and at publish time

New script `scripts/pack-smoke.ts` (bun, dev-only — not part of the runtime mirror set, like `bench-*.ts`; see CLAUDE.md "Scripts" grouping), exposed as `"check:pack-smoke": "bun scripts/pack-smoke.ts"` in `package.json` scripts. Behavior:

1. `bun run build`; then `npm pack` into a temp dir (use the scratchpad/`mktemp`).
2. **Tarball manifest assertion** — `tar tzf` output must contain: `package/dist/cli.js`, `package/dist/egress-guard.sh`, `package/dist/backend.mjs`, `package/dist/runner-frontend.ts`, `package/dist/control-backend.mjs`, at least one `package/dist/runtime/*.ts`, and `package/profiles/<p>/ir.yml` for every bundled profile in `profiles/*/ir.yml` (currently: hello, hello-human, self-driving, simple-gh-sdlc, simple-sdlc, soc2-baseline). Also assert the historical regression `RELEASING.md:40-43` documents: the self-driving profile's `gitignore` (no dot) resource is present (npm strips literal `.gitignore`).
3. Install the tarball into a fresh throwaway project (`git init && npm init -y && npm install <tgz>`), then run **every CLI verb** via `npx --no-install open-autonomy …` under plain `node` (not bun — the published artifact's runtime):
   - `--help` → exit 0, output non-empty.
   - `compile simple-sdlc local .` (fresh dir A) → exit 0; assert `scheduler/run.mjs` and `.claude/skills/` exist; assert the "Next steps" block printed. **This is the audit's exact failing command.**
   - `compile self-driving gh-actions .` (fresh dir B) → exit 0; assert `.gitignore` written and `.github/workflows/*.yml` non-empty (preserves RELEASING.md step-3's historical coverage).
   - `compile simple-gh-sdlc gh-actions .` (fresh dir C) → exit 0 (the additive gh overlay).
   - `lint <packed>/profiles/hello` → exit 0.
   - `conformance exec` → exit 0.
   - `upgrade` (no args) → exits with **usage** (exit 2 per its argument handling), stderr contains `usage`/flag help and **not** `ENOENT` — i.e. a controlled refusal, never a crash.
   - `preflight` → must not die with an unhandled stack trace; accept exit 0 or a documented nonzero *with its own diagnostic output* (it probes the host env, which CI can't fully guarantee; the gate asserts "no crash", not "env healthy").
   - `compile simple-sdlc local` **dry run** (no outDir) → exit 0, prints the file list (covers the no-outDir path, `bin/autonomy-compile.ts:149-151`).
4. Any failure prints the failing verb + captured output and exits nonzero.

Wiring (three hooks, so no single human's diligence is load-bearing again):

- **CI:** append `check:pack-smoke` to the `check` chain at `package.json:51` (or as a discrete step in the profile-owned CI workflow). The repo's CI runs `bun run check` at `profiles/self-driving/.github/workflows/ci.yml:36-37`; per the dogfood rules (CLAUDE.md "Editing shared control files"), any workflow edit happens in `profiles/self-driving/.github/workflows/ci.yml` and is recompiled to root — but if `pack-smoke` joins the `check` chain, **no workflow edit is needed at all**, which is why chaining into `check` is preferred. CI runners have node+npm+git available (setup-bun + ubuntu image), so the script is CI-clean.
- **Publish:** change `prepublishOnly` (`package.json:40`) from `bun run build` to `bun run build && bun run check:pack-smoke`. Even a maintainer hand-running `npm publish` on a laptop cannot ship a tarball whose verbs don't run.
- **Docs:** rewrite `RELEASING.md` step 3 (`RELEASING.md:22-36`) to invoke `bun run check:pack-smoke` instead of the inline shell one-liner (single source of truth; the inline recipe only covered one verb/one substrate). Cross-doc consolidation with `docs/OPERATIONS.md` §Release process is **OA-15's** scope; this spec only requires that both docs name the same script.

### Remediation of the live registry

As part of landing this: publish `0.4.2` from the fixed tree (its `prepublishOnly` now proves itself), then `npm deprecate open-autonomy@0.4.0 "broken publish: compile/lint/upgrade/conformance crash (missing dist/egress-guard.sh) — use >=0.4.2"` and the same for `0.4.1`, so `npm install` of the broken versions warns. Do **not** unpublish (breaks reproducibility; deprecation is the npm-sanctioned tool).

## Alternatives rejected

- **Ship `egress-guard.sh` via the `files` whitelist / move it under `profiles/`** — the read is `import.meta.url`-relative to `dist/cli.js` (`emit.ts:34`), so only a file *inside `dist/`* satisfies it; moving it back to a profile resource re-opens the exact bug `7cd1940` fixed (any non-soc2 flag-setting profile compiles agent jobs that die on a missing script).
- **Inline the shell source as a string constant in `emit.ts`** — fixes packaging but forfeits the sibling-source pattern (shell syntax highlighting/linting, byte-identical single source) and leaves the copy-list trap armed for the next sibling file. Rejected in favor of manifest + scan guard.
- **Only lazy-load (B) without the packaging fix (A)** — converts a total outage into "gh-actions compiles are broken", still a P0 for half the product; the file must ship.
- **A standalone GitHub Actions publish pipeline (npm publish from CI on tag)** — strictly more machinery (npm token custody in CI, provenance config) than this finding needs; worth doing eventually, but the minimal correct gate is "no green `check` / no publish without the packed verbs passing", which the three hooks deliver without new secrets. Nothing here precludes adding tag-triggered publish later; `check:pack-smoke` becomes its core step.
- **Testing verbs from the source tree instead of the tarball** — explicitly what failed here; `RELEASING.md:47-48` already states "The source tree lies about packaging." Rejected on the record.
- **Smoke-testing only `compile` (status quo RELEASING.md recipe)** — 0.4.x proves one verb isn't enough only by luck of shared crash sites; `lint`/`upgrade`/`conformance` have their own import graphs (`bin/lint-profile.ts:13`, `bin/autonomy-upgrade.ts:15`, `bin/autonomy-conformance.ts:6-7`) and must each be exercised.

## Acceptance criteria (numbered, each independently testable, each must FAIL today and PASS after; name the exact command/test)

Run from the repo root unless stated. "Today" = this clone at `2fa5614` + the published 0.4.1 tarball.

1. **Built dist contains the file.** `bun run build && test -f dist/egress-guard.sh` — FAILS today (file absent), PASSES after (A).
2. **Packed local compile works.** `TGZ=$(npm pack); T=$(mktemp -d); (cd "$T" && git init -q && npm init -y >/dev/null && npm install "$OLDPWD/$TGZ" && npx --no-install open-autonomy compile simple-sdlc local . && test -f scheduler/run.mjs)` — FAILS today with `ENOENT … dist/egress-guard.sh` (reproduced against 0.4.1; the freshly built tree fails identically), PASSES after.
3. **Packed gh-actions scaffold works.** Same harness with `compile self-driving gh-actions . && test -f .gitignore && ls .github/workflows/*.yml` — FAILS today (same ENOENT), PASSES after.
4. **Every other packed verb survives.** From the packed install: `npx --no-install open-autonomy lint node_modules/open-autonomy/profiles/hello` (exit 0), `npx --no-install open-autonomy conformance exec` (exit 0), `npx --no-install open-autonomy upgrade` (exit ≠ 0 but stderr contains `usage` and not `ENOENT`) — all three FAIL today with the ENOENT crash (verified against 0.4.1), all PASS after.
5. **The gate exists and is wired into `check`.** `bun run check:pack-smoke` — FAILS today (`Missing script: "check:pack-smoke"`), PASSES after; and `grep -q 'check:pack-smoke' package.json && node -e "const s=require('./package.json').scripts; if(!s.check.includes('check:pack-smoke')) process.exit(1)"` — FAILS today, PASSES after.
6. **The gate actually bites (mutation test).** With the `egress-guard.sh` entry removed from `build-cli.ts`'s manifest (temporary local mutation), `bun run check:pack-smoke` exits nonzero naming the missing file — untestable today (no gate), PASSES (i.e. correctly fails) after. This is the regression trap for the next sibling data file.
7. **Publish is self-gating.** `npm publish --dry-run` runs `prepublishOnly` → build + pack-smoke; on today's tree with today's `prepublishOnly` (`package.json:40`) a broken `dist/` sails through (FAILS as a gate), after the change the same command exits nonzero on mutation (6) and zero on the fixed tree.
8. **Local compile is isolated from github assets.** From a packed install with `node_modules/open-autonomy/dist/egress-guard.sh` deliberately deleted: `npx --no-install open-autonomy compile simple-sdlc local .` exits 0 (FAILS today — crashes; PASSES after B), while `npx --no-install open-autonomy compile simple-gh-sdlc gh-actions .` exits nonzero with an error message that names `egress-guard.sh` and is not a raw unhandled stack trace (FAILS today — raw ENOENT at import; PASSES after B).
9. **Existing behavior preserved.** `bun test packages/substrate-github/src/emit.test.ts` still passes (the `7cd1940` fixtures: flag-setting profile gets step + `scripts/egress-guard.sh`; flag unset gets neither) — PASSES today and must still PASS after B's lazy-read refactor (guards against the refactor changing emit output).
10. **Registry remediation.** `npm view open-autonomy@0.4.1 deprecated` prints a deprecation message and `npx --yes open-autonomy@latest compile simple-sdlc local .` in an empty temp dir exits 0 — both FAIL today (no deprecation; latest crashes), PASS after 0.4.2 ships. (Post-publish criterion; the only one requiring registry access.)

## Dependencies (other OA-XX issues this blocks/is blocked by, with one-line reason)

- **Blocks OA-11:** the corrected `--help` text only reaches adopters through a working publish; OA-11's packed-help acceptance check also runs inside OA-01's `check:pack-smoke` harness.
- **Blocks OA-15:** OA-15's release checklist names `check:pack-smoke` as its pre-publish gate and needs a working `0.4.2+` publish to re-align npm `latest` with the docs.
- **Blocked by:** nothing.

## Provenance (which audit finding + narrative step)

- Finding **F-1** (OA-INSTALL-AUDIT-FINDINGS.md §2, P0 list, first bullet) including its fix-class note ("release CI that smoke-runs every published verb from the packed tarball").
- Narrative **§1 Phase 3, step 7** (the `compile` ENOENT hard-stop and the 0.3.1 downgrade recovery); **§4 row 3** ("Downgraded npm package by trial until 0.3.1 worked"); **§5 prerequisite (1)** ("fix + CI-gate the npm publishes").
- Independent verification in this session: crash reproduced from the published `open-autonomy@0.4.1` tarball (`compile`/`lint`/`upgrade`/`conformance` all ENOENT; `--help`/`preflight` fine); `0.3.1` tarball compile verified working; tarball listings confirm no `egress-guard.sh` in any published version.
