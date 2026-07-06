# OA-11: `open-autonomy --help` recommends the whole-repo scaffold (`self-driving`) as the way to "Adopt into the current repo"

**Finding:** F-10 — the CLI's `--help` adoption hint recommends `compile self-driving gh-actions .`, the scaffold the docs explicitly warn against for existing repos (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy

## Problem

The first actionable command a cold adopter sees from the tool itself — the `--help` output's one adoption hint — is:

```
Adopt into the current repo:  npx open-autonomy compile self-driving gh-actions .  (bundled profiles: self-driving, simple-gh-sdlc, simple-sdlc, hello; "github" still accepted)
```

"The current repo" is, for nearly every adopter, an **existing** repo — exactly the case for which the README's own callout says the opposite: *"`self-driving` is a whole-repo SCAFFOLD, not an overlay … Adopting into an existing repo? Use `simple-gh-sdlc` / `simple-sdlc` / `hello` instead — they're purely additive"* (README.md:64-68). The README's setup table (README.md:60-62) likewise reserves `self-driving` for a "new/dedicated repo". An adopter who trusts the CLI over the README runs the scaffold against their lived-in repo and (since 0.4.0's clobber guard) hits a refusal error — or, on 0.3.1 (the only working publish today, per F-1), silently risks clobbering `README.md`/`package.json`-class files, since the guard didn't exist yet. Either way the tool's front door contradicts its own documentation at the single highest-traffic decision point (audit narrative §1 Phase 1: "The CLI's own `--help` adoption hint recommends `compile self-driving gh-actions .` — the scaffold the docs explicitly say NOT to use on an existing repo").

Secondary defect in the same line: the parenthetical bundled-profiles list is stale — it names 4 profiles, while the package bundles 6 (`profiles/*/ir.yml` exists for `hello`, `hello-human`, `self-driving`, `simple-gh-sdlc`, `simple-sdlc`, `soc2-baseline`; all 6 ship in the 0.4.1 tarball under `package/profiles/`). The same drift class, one line apart.

## Root cause (with file:line citations from this clone; for packaging, cite package.json scripts / build config lines)

- The hint is a hardcoded string in the static `HELP` template at **`bin/open-autonomy.ts:25`**:

  ```
  Adopt into the current repo:  npx open-autonomy compile self-driving gh-actions .  (bundled profiles: self-driving, simple-gh-sdlc, simple-sdlc, hello; "github" still accepted)
  ```

  inside the `HELP` constant (`bin/open-autonomy.ts:16-27`), printed at `bin/open-autonomy.ts:31-34` and on unknown commands at `bin/open-autonomy.ts:60`. Nothing derives it from the profiles the package actually bundles, and no test asserts anything about help content (no `bin/*help*.test.ts` exists; the CLI test files are `bin/autonomy-compile.test.ts`, `bin/ztrack-preset.test.ts`, `bin/lint-profile.test.ts`, etc.).

- The rest of the codebase already knows better, in three places the help line ignores:
  - **README.md:64-68** — the scaffold-vs-overlay warning quoted above, plus the command block at README.md:70-80 that leads with the correct pairings (scaffold = "NEW/dedicated repo"; existing repo = `simple-gh-sdlc`).
  - **`bin/autonomy-compile.ts:96-105`** — the fresh-compile clobber guard's error text explicitly teaches the distinction: *"`self-driving` is a whole-repo SCAFFOLD (it carries these as resources), not an overlay onto an existing repo … compile an additive profile (simple-gh-sdlc, simple-sdlc, hello) into this repo instead."* The CLI corrects, at failure time, the mistake its own `--help` induced.
  - **`bin/autonomy-compile.ts:28-30`** — `bundledProfileNames()` already computes the real bundled-profile list by scanning `profilesRoot` for `ir.yml`, exactly what the stale parenthetical should be derived from (used today in the usage/error paths at `bin/autonomy-compile.ts:49` and `:55`, but not in `HELP`).

- Why the stale list: `hello-human` and `soc2-baseline` were added to `profiles/` after the `HELP` string was written (hello-human landed with 0.4.0 per CHANGELOG.md "New example profile `profiles/hello-human/`"), and there is no check tying `HELP` to `profiles/`.

## Proposed fix (spec depth: what changes, where, why this over alternatives)

### 1. Rewrite the adoption hint in `bin/open-autonomy.ts` — overlays first, scaffold explicitly labeled

Replace the single line at `bin/open-autonomy.ts:25` with a short block (still inside `HELP`, still plain text). Wording (mirrors README.md:60-80's table and labels so CLI and README can never argue):

```
Adopt into the CURRENT repo (existing repo — additive overlays, write no README/package.json/.gitignore):
  npx open-autonomy compile simple-gh-sdlc gh-actions .   # GitHub Actions runner, auto-merging PRs
  npx open-autonomy compile simple-gh-sdlc local .        # agents on your machine, PRs on GitHub
  npx open-autonomy compile simple-sdlc local .           # fully local, PR-free (ztrack board)
Start a NEW/dedicated repo (whole-repo SCAFFOLD — carries README.md/package.json/.gitignore):
  npx open-autonomy compile self-driving gh-actions .
("github" still accepted as an alias for gh-actions)
```

Design constraints the wording must keep (each traceable to a doc statement):

- **Overlay commands come first** and are tagged "existing repo"; the scaffold is physically below them and carries the word **SCAFFOLD** plus what it clobbers — the same vocabulary as README.md:64 and the guard message at `bin/autonomy-compile.ts:101`. A skimmer copying the first command now gets a safe, additive compile.
- All three "setups people actually use" from README.md:58-62 appear (hosted overlay, local-runner + GitHub PRs, fully local), so the hint is a working decision table, not just a warning.
- Keep the `"github"` alias note (currently at the end of `bin/open-autonomy.ts:25`; behavior implemented at `bin/autonomy-compile.ts:47`).

### 2. Derive the bundled-profiles list instead of hardcoding it

Move the `profilesRoot` + `bundledProfileNames()` logic (`bin/autonomy-compile.ts:21-30`) into a tiny shared helper (e.g. `bin/bundled-profiles.ts`, ~10 lines) imported by both `bin/open-autonomy.ts` and `bin/autonomy-compile.ts`, and render the help's profile list from it: `Bundled profiles: ${bundledProfileNames().join(', ')}`. Notes:

- The scan is one `readdirSync` over a directory that ships in the package (`files` whitelist, `package.json:28-33` includes `profiles/`) — negligible cost on the help path, and it is *definitionally* correct in both the dev checkout (`bin/../profiles`) and the packed install (`dist/../profiles`), per the resolution comment at `bin/autonomy-compile.ts:18-20`.
- The refactor must not change `bin/autonomy-compile.ts`'s observable behavior (its usage strings at `:49`/`:55` keep using the same helper).
- Static-import safety: the helper must import only `node:fs`/`node:path` (never the substrate packages), so adding it to `bin/open-autonomy.ts` cannot regress the verb-level lazy-import property that keeps `--help` alive when packaging is broken (see OA-01 root cause 3 — this matters: help was one of only two surviving verbs in 0.4.x).

### 3. Pin it with a test

New `bin/open-autonomy-help.test.ts` (bun test, joins the `check:compile`-adjacent test set in `package.json:44` or its own entry) that spawns `bun bin/open-autonomy.ts --help` and asserts:

- the first `compile` command mentioned after the adopt heading targets an additive profile (regex: the substring `compile simple-` occurs before the substring `compile self-driving`);
- the line/block containing `compile self-driving` also contains `SCAFFOLD` (case-sensitive) and `NEW`;
- every directory in `profiles/*/ir.yml` appears in the help output (catches the next `hello-human`-style addition);
- exit code is 0 for `--help` and 2 for bare invocation (current behavior, `bin/open-autonomy.ts:31-34`).

Why a spawn test rather than exporting `HELP`: the printed bytes are the product surface; testing the exported constant would pass even if the print path regressed.

Why this over alternatives: the fix is pure presentation + a derivation, no behavior change to `compile`; it makes the CLI agree with README.md and with `autonomy-compile.ts`'s own guard text, and the test converts "docs said so" into a failing check the next time someone edits `HELP` carelessly.

## Alternatives rejected

- **Point the hint at the docs instead of a command** ("see README's 'Run it on your repo'") — the help hint is valuable precisely because it is copy-pasteable; deferring to docs reproduces the audit's Phase-1 problem (load-bearing facts scattered across documents, F-15) at the one place the CLI could be self-sufficient.
- **Keep `self-driving` first but add a warning suffix** — ordering *is* the message for skimmers; the audit shows adopters act on the first plausible command. Overlays-first with the scaffold labeled is strictly clearer at identical length.
- **Make `compile self-driving <substrate> .` interactively confirm when the target dir is non-empty** — a behavior change out of proportion to a P2 help-text finding, and redundant since 0.4.0: the clobber guard (`bin/autonomy-compile.ts:96-105`) already refuses destructive scaffold compiles with a corrective message. The help hint should stop *sending* people there; the guard remains the backstop.
- **Drop the scaffold from help entirely** — `self-driving` on a new/dedicated repo is a real, documented top-of-table setup (README.md:60); hiding it trades one confusion for another. Label it, don't bury it.
- **Hardcode the corrected profile list** — that is exactly how the list went stale (2 of 6 profiles missing today); the scanning helper already exists at `bin/autonomy-compile.ts:28-30` and costs nothing to share.

## Acceptance criteria (numbered, each independently testable, each must FAIL today and PASS after; name the exact command/test)

1. **Overlay-first ordering.** `bun bin/open-autonomy.ts --help | grep -n "compile simple-\|compile self-driving" | head -1 | grep -q "compile simple-"` — FAILS today (first match is `compile self-driving`, from `bin/open-autonomy.ts:25`), PASSES after.
2. **Scaffold labeled.** `bun bin/open-autonomy.ts --help | grep "compile self-driving" -B1 -A0 | grep -q "SCAFFOLD"` — FAILS today (the word SCAFFOLD appears nowhere in help), PASSES after. Companion: `bun bin/open-autonomy.ts --help | grep -qi "existing repo"` — FAILS today, PASSES after.
3. **No "adopt into the current repo ⇒ self-driving" pairing.** `bun bin/open-autonomy.ts --help | grep -i "current repo" | grep -q "self-driving"` returns **match** today (FAIL state) and **no match** after (invert in the test harness: the criterion passes when the grep finds nothing).
4. **Complete, derived profile list.** `bun bin/open-autonomy.ts --help | grep -q "hello-human" && bun bin/open-autonomy.ts --help | grep -q "soc2-baseline"` — FAILS today (stale hardcoded list at `bin/open-autonomy.ts:25`), PASSES after. Mutation check: add a temporary `profiles/zz-test/ir.yml` and re-run help — the new name appears without a code edit.
5. **The pin test exists and passes.** `bun test bin/open-autonomy-help.test.ts` — FAILS today (file does not exist), PASSES after; and it is reachable from `bun run check` (grep the `check:compile` entry at `package.json:44` — or whichever check script adopts it — for the new test file).
6. **Packed-artifact help says the same thing.** Inside OA-01's `check:pack-smoke` harness (or manually: `npm pack`, install into a temp project), `npx --no-install open-autonomy --help | grep -q "SCAFFOLD"` — FAILS today (0.4.1's published help carries the wrong hint; verified against the downloaded tarball), PASSES once a fixed version is packed. (Registry-latest flavor of this check passes only after OA-01's 0.4.2 ships — see Dependencies.)

## Dependencies (other OA-XX issues this blocks/is blocked by, with one-line reason)

- **Blocked by OA-01 (soft — for delivery, not for landing):** the corrected help only reaches `npx` users via a working publish, and criterion 6's packed check runs inside OA-01's `check:pack-smoke`; the source-tree fix itself can land independently.
- **Feeds OA-15 (informational):** the "CLI text contradicts docs" class is the CLI-side twin of OA-15's docs-vs-published-package skew; OA-15's doc-stamp checks do not cover CLI strings, which is why criterion 5's test is needed here.

## Provenance (which audit finding + narrative step)

- Finding **F-10** (OA-INSTALL-AUDIT-FINDINGS.md §2, P2 list, first bullet).
- Narrative **§1 Phase 1** ("The CLI's own `--help` adoption hint recommends `compile self-driving gh-actions .` — the scaffold the docs explicitly say NOT to use on an existing repo (F-10)").
- Independent verification in this session: the hint reproduced verbatim from `bin/open-autonomy.ts:25` in this clone and from the published 0.4.1 tarball's `--help` output (one of the two verbs that still run, per OA-01); README.md:60-68 warning text read and cited; stale profile list confirmed against `profiles/*/ir.yml` (6 bundled, 4 listed).
