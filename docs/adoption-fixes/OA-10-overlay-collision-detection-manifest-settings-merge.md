# OA-10: overlay writes need collision detection everywhere, a printed manifest, and a merge policy for `.claude/settings.json`

**Finding:** F-9 — The overlay writes into common paths with no collision detection or manifest: 13 files intermixed into an existing `scripts/`, `.claude/settings.json` emitted (would clobber an existing one) with a Stop hook firing in every Claude Code session including humans', re-compile resurrects deleted files, nothing prints what was written (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

Compiling an "additive" profile into a lived-in repo writes into paths the repo already owns, with the
operator never told what landed:

- **Interleaving without a receipt:** the audit's compile (§1 phase 3, item 8) wrote 13 files straight
  into the target's existing `scripts/` directory, intermixed with the repo's own 6 scripts — "with no
  collision check, warning, or manifest of what it wrote". The CLI's entire report is one line:
  `installed N files into <dir>`.
- **`.claude/settings.json` clobber + hook injection:** the overlay emits `.claude/settings.json`
  containing a **Stop hook** that Claude Code runs at the end of **every** session in the repo — agent
  *and human interactive* sessions alike (Claude Code project settings are not scoped to the loop's
  sessions). The audit's target had no pre-existing settings file; "most fleet repos do", and for them the
  write is a wholesale replacement of the developers' own hooks/permissions. No doc tells a human adopter
  the file exists, what the hook does, or that it fires in their own sessions.
- **Re-compile resurrects deletions:** re-running `compile` re-creates files the operator deliberately
  deleted; today this is documented only as agent-facing folklore (`docs/INSTALL-AGENT.md:371-374`:
  "re-creates the `dependabot.yml`/`security.yml` you deleted in step 4 — re-run that `rm` after any
  re-compile"), and never guarded in code.

**Status correction (important):** the audit exercised the published `open-autonomy@0.3.1` (the only
working npm version, per F-1). On this branch two of F-9's four asks **already exist in source**:
byte-level collision refusal (`findClobbers`, BL-14) and a written manifest
(`.open-autonomy/generated.json`). What remains broken in source — and what this spec covers — is:
(a) the collision guard's messaging/comments wrongly assume only the `self-driving` scaffold can trip it,
(b) the manifest is written but never *printed* or pointed at, (c) `.claude/settings.json` has no merge
path (refuse-or-`--force`-clobber only, and the upgrade path overwrites it unconditionally),
(d) operator deletions are silently resurrected, and (e) the Stop hook's human-session blast radius is
undocumented everywhere a human reads.

## Root cause (verified file:line citations)

All paths relative to the repo root; all lines verified by reading on branch `adoption-fixes-backlog`.

**Where files are written:**

- `packages/core/src/materialize.ts:7-18` — `materialize()` writes every `generated` entry and every
  `copies` entry unconditionally (`writeFileSync`, line 12); it returns the written list (line 17) but the
  only consumer prints its length, not its contents.
- `packages/substrate-local/src/emit.ts:218-266` — `compileLocal` builds the `scripts/` payload: the
  shared runtime minus github-only files (lines 231-233), plus `scripts/runner.ts`, `scripts/run-agent.mjs`,
  `scripts/autonomy-runner.mjs`, `scripts/runner-defaults.mjs` (lines 237-242) and
  `scripts/prompts/<harness>/<role>.txt` (line 266) — all destined for the universally-user-owned
  `scripts/` directory of the target repo. The copies loop (lines 269-298) adds skills and profile
  resources verbatim.
- `profiles/simple-sdlc/ir.yml:80-84` — `resources:` lists `.claude/settings.json` first;
  `profiles/simple-gh-sdlc/ir.yml:129-131` likewise. The actual hook payload is
  `profiles/simple-sdlc/.claude/settings.json:1-14`: a `hooks.Stop` command entry running
  the profile-pinned ztrack `stop-loop.sh`. The current mandatory contract fails closed when that target
  is missing and exits normally only when no task loop is armed. Because it ships as a **whole-file
  resource copy**, materialize/upgrade can only replace the entire file — there is no structured merge
  anywhere.
- `packages/substrate-local/src/emit.ts:244-247` — the design note placing settings.json ownership with
  the *profile* ("installed on every runner"); nothing in that note or elsewhere addresses coexistence
  with an adopter's pre-existing settings.

**The existing (partial) collision guard — the "self-driving scaffold refusal" the fix must mirror:**

- `packages/core/src/materialize.ts:42-60` — `findClobbers()`: paths a materialize would overwrite with
  DIFFERENT bytes, checking both `generated` (line 57) and `copies` (line 58). This is BL-14, and it is
  exactly the refusal `docs/OPERATIONS.md:48-52` documents for `self-driving`.
- `bin/autonomy-compile.ts:92-106` — the guard wired into the compile CLI, `--force` to override
  (lines 96-97). **Defects:**
  - Lines 93-95, the comment: "An additive profile (simple-*, hello) carries none of the files that could
    collide, so this is a no-op for them — only a whole-repo scaffold (self-driving) can trip it." **False:**
    `simple-sdlc`/`simple-gh-sdlc` carry `.claude/settings.json` — the single most likely path to
    pre-exist in a Claude-using repo — and any same-named file under `scripts/`, `standards/`,
    `scheduler/`, `.claude/skills/` also trips it.
  - Lines 99-103, the refusal message is hardcoded scaffold prose: `"<profile>" is a whole-repo SCAFFOLD
    (it carries these as resources) … or compile an additive profile (simple-gh-sdlc, simple-sdlc, hello)
    into this repo instead.` When `simple-sdlc` itself trips the guard on an existing
    `.claude/settings.json`, the CLI would tell the user that *simple-sdlc is a whole-repo scaffold* and
    to *compile simple-sdlc instead* — nonsense that buries a real, actionable collision.
- The guard flags **existing-different** files only; a file the operator **deleted** does not exist, so
  re-materialize silently re-creates it (`materialize.ts:9-14` has no notion of prior state) — the
  resurrection half of F-9 has no guard at all.

**The manifest — written, never surfaced:**

- `packages/core/src/file-manifest.ts:14` — `GENERATED_MANIFEST_PATH = '.open-autonomy/generated.json'`;
  lines 22-35 — `withGeneratedManifest()` records every generated+copied path (compileLocal applies it at
  `emit.ts:299`); lines 39-46 — `readGeneratedManifest()` reads a prior install's footprint (today
  consumed only by upgrade prune, `packages/core/src/upgrade.ts:97-103`).
- `bin/autonomy-compile.ts:108` — `console.log(\`installed ${written.length} files into ${outDir}\`)` —
  the count, never the list, never a pointer to `generated.json`. This is the residual truth of the
  audit's "nothing prints what was written".

**Upgrade/re-compile semantics for settings.json:**

- `packages/core/src/upgrade.ts:88-95` — every non-install-owned derived file that differs is `update`d
  (overwritten) on upgrade; `.claude/settings.json` is not in `INSTALL_OWNED_PATHS` (lines 17-37), so an
  adopter's merged/customized settings are reverted by every upgrade — same clobber, different verb.

**Documentation:**

- `docs/OPERATIONS.md:41-46` (the overlay promise: "ship only OA-specific files (`scripts/`,
  `.claude/skills/`, `scheduler/`, `.open-autonomy/`, `standards/`, `.github/workflows/merge.yml`)") and
  `docs/OPERATIONS.md:158-163` (step 3's overlay file list) — **neither mentions `.claude/settings.json`
  at all**, let alone that its Stop hook runs in human sessions. `grep -n hooks docs/OPERATIONS.md` → no
  hits. The only written trace of the re-compile overwrite is agent-facing
  (`docs/INSTALL-AGENT.md:371-374`).

## Proposed fix

### (a) Pre-write collision detection — correct scope, correct message (extend BL-14, don't rebuild it)

1. Fix the false comment at `bin/autonomy-compile.ts:93-95` and replace the refusal message (lines
   99-103) with a profile-agnostic one that names each colliding path **with its disposition**, e.g.:

   ```
   open-autonomy: compiling "simple-sdlc" into "." would overwrite 2 existing file(s) that differ:
     .claude/settings.json   (yours differs — see the merge note below / docs/OPERATIONS.md#claude-settings)
     scripts/agent.ts        (a file of yours with the same name)
   Nothing was written. Re-run with --force to overwrite, or move/rename your conflicting files first.
   ("self-driving" only: this profile is a whole-repo SCAFFOLD — for an existing repo use an additive
    profile instead: simple-gh-sdlc, simple-sdlc, hello.)
   ```

   The scaffold-specific advice is emitted only when the profile actually carries repo-shell resources
   (README.md/package.json/.gitignore among the clobbers), not keyed to the profile's name.
2. **Deletion-resurrection guard** (new): before materializing into a directory that has a prior
   `.open-autonomy/generated.json`, compute `resurrections` = paths that are (i) listed in the prior
   manifest (`readGeneratedManifest`, `file-manifest.ts:39-46`), (ii) absent on disk, and (iii) present in
   the new compile output. Refuse (same style as clobbers, same `--force` override) listing them:
   "you deleted these open-autonomy-generated files; re-compiling would re-create them". Implement beside
   `findClobbers` in `packages/core/src/materialize.ts` (e.g. `findResurrections(out, destDir,
   priorManifest)`) so upgrade can reuse it; wire into `bin/autonomy-compile.ts` next to the existing
   guard. This turns `docs/INSTALL-AGENT.md:371-374`'s "re-run that `rm` after any re-compile" folklore
   into a refusal. (State files with intentional-delete semantics — e.g. OA-07's `.open-autonomy/paused`
   — are excluded by the same install-owned/state list upgrade already honors.)

### (b) A written manifest, printed at compile end

3. Keep `.open-autonomy/generated.json` as the machine manifest (it already travels with every install —
   `file-manifest.ts:32-35`). Optionally alias/extend it as the audit's suggested
   `.open-autonomy/installed-files.json`; a second copy of the same data is not required — one manifest,
   one schema, documented.
4. Replace `bin/autonomy-compile.ts:108`'s count with a grouped summary of `written` (the list
   `materialize` already returns, `materialize.ts:17`):

   ```
   installed 39 files into . — full list: .open-autonomy/generated.json
     scripts/            17 files (runner, prompts, runtime)
     .claude/            5 files  (skills/*, settings.json — adds a Stop hook; see note)
     .codex/skills/      4 files
     scheduler/          2 files
     standards/          3 files
     .open-autonomy/     3 files
   NOTE: .claude/settings.json wires a mandatory Claude Code Stop hook that runs in EVERY
   Claude Code session in this repo, including your own interactive ones. A missing pinned
   ztrack hook target fails closed; only the no-armed-loop state exits normally.
   Details: docs/OPERATIONS.md#claude-settings
   ```

   Print the same summary for a `--force` run, marking which paths were overwritten/resurrected.

### (c) `.claude/settings.json`: merge, don't clobber — and say what the hook does

5. **Structured merge on collision.** Special-case `.claude/settings.json` in the compile CLI (and the
   upgrade path): when the destination file exists and differs, parse both as JSON and merge instead of
   refusing/overwriting — append OA's `hooks.Stop` entry to the existing `hooks.Stop` array iff an entry
   with the identical `command` string is not already present; leave every other key of the adopter's file
   untouched. Report `merged: .claude/settings.json (+1 Stop hook)` in the summary. Fall back to the
   named-refusal (a) only when the existing file is not parseable JSON. Implementation shape: a per-path
   merge-strategy map passed to `materialize()`/`findClobbers()` from `bin/autonomy-compile.ts` (core
   stays generic; the CLI owns the policy), with the same strategy applied in
   `planUpgrade`/`applyUpgrade` (`upgrade.ts:88-95,109-122`) so upgrades stop reverting adopter
   settings — a merged file whose OA hook entry is present counts as "up to date".
6. **Docs state the blast radius plainly.** `docs/OPERATIONS.md` step 3 (lines 158-163) adds
   `.claude/settings.json` to the overlay file list with an explicit callout (anchor
   `#claude-settings`): what the Stop hook is (the ztrack drive-to-green loop gate), that Claude Code
   project settings apply to **every** session in the repo **including human developers' interactive
   ones**, and that the current invariant contract makes Stop/SubagentStop mandatory: the command fails
   closed when the pinned ztrack target is missing, compile/upgrade restore the entries, and operators use
   `.open-autonomy/paused` instead of deleting the gate. `simple-gh-sdlc` ships the same file. Mirror one
   line in the `docs/OPERATIONS.md:41-46` overlay note and in
   `docs/INSTALL-AGENT.md`'s install phase (which currently mentions the file only in the re-run
   appendix, line 371).

## Alternatives rejected

- **Relocate emitted runtime to a namespaced dir (`.open-autonomy/scripts/`) instead of `scripts/`** —
  eliminates the interleaving class wholesale, but breaks every cwd-relative path baked into skills,
  standards, prompts, and docs (`bun scripts/runner.ts launch …` appears in PM/worker doctrine and in the
  emitted prompt files), diverges local from github (whose runtime also lands in `scripts/`), and
  invalidates existing installs. Detection + receipt + merge achieves the finding's asks at a fraction of
  the churn; relocation can be a separate, larger proposal.
- **Make `.claude/settings.json` install-owned (seed-once, never overwritten — add to
  `INSTALL_OWNED_PATHS`)** — stops the clobber but also stops profile hook fixes from ever reaching
  installs, and does nothing for the fresh-compile collision (seed-once still writes when the file exists?
  no — it would skip, silently NOT installing the hook, breaking the loop gate with no signal). The
  structured merge propagates hook updates *and* preserves adopter content, and it fails loudly.
- **Refuse-only for settings.json (no merge)** — an existing `.claude/settings.json` is the *normal* case
  in Claude-using repos ("most fleet repos have one"); refusing makes the documented happy path require
  `--force`, which then clobbers — exactly the failure being fixed. Merge is deterministic (JSON,
  append-if-absent) and therefore safe to automate.
- **A brand-new `installed-files.json` distinct from `generated.json`** — two manifests of the same facts
  will drift; upgrade prune already keys on `generated.json` (`upgrade.ts:97-103`). Keep one manifest,
  print it, document it.
- **Git-based receipt ("just run `git status` after compile")** — true but insufficient: the target may be
  dirty already, `.gitignore`d paths (e.g. `.open-autonomy/runner-state`) don't show, and the audit's ask
  is that the *tool* accounts for its own writes.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Named refusal on a scripts/ collision, additive profile.** In a repo with a pre-existing
   `scripts/run-agent.mjs` (different content): `npx open-autonomy compile simple-sdlc local .` → exits
   nonzero, writes nothing (`git status --porcelain` empty), lists `scripts/run-agent.mjs` by name, and
   the message contains **no** claim that simple-sdlc is a scaffold nor advice to "compile an additive
   profile instead". *Fails today:* the guard fires (BL-14) but with the scaffold message
   (`bin/autonomy-compile.ts:99-103`) telling the user to compile the profile they just compiled.
2. **Merge instead of clobber for an existing `.claude/settings.json`.** In a repo with
   `.claude/settings.json` = `{"permissions":{"allow":["Bash(npm test)"]}}`:
   `npx open-autonomy compile simple-sdlc local .` → succeeds; the resulting file still contains the
   `permissions` key unchanged AND the OA `hooks.Stop` entry
   (`jq '.permissions.allow[0], .hooks.Stop[0].hooks[0].command' .claude/settings.json`); the summary line
   reports the merge by name. Idempotent: re-running does not duplicate the hook entry
   (`jq '.hooks.Stop | length'` unchanged). *Fails today:* refusal (this branch) or silent clobber
   (published 0.3.1); no merge path exists.
3. **Unparseable settings refuse by name.** With `.claude/settings.json` containing invalid JSON, the same
   compile refuses, names the file, and explains the manual merge. *Fails today:* generic scaffold-worded
   refusal.
4. **Deletion is respected.** Fresh compile into a clean repo, then `rm .github/workflows/security.yml`
   (or any manifest-listed emitted file for the profile compiled), then re-run the same compile → refusal
   naming the deleted path as operator-deleted; with `--force` it is re-created and reported as
   `resurrected:`. *Fails today:* silently re-created (`materialize.ts:9-14`; documented as folklore at
   `docs/INSTALL-AGENT.md:371-374`).
5. **Compile prints the receipt.** Any successful compile prints (i) every written path or a grouped
   per-directory summary with counts, (ii) the literal path `.open-autonomy/generated.json`, and (iii) the
   Stop-hook note when the profile carries `.claude/settings.json`. Assert:
   `npx open-autonomy compile simple-sdlc local . | grep -c 'generated.json'` ≥ 1 and
   `… | grep -ci 'stop hook'` ≥ 1. *Fails today:* output is exactly `installed N files into .`
   (`bin/autonomy-compile.ts:108`).
6. **Manifest lists every written path.** After compile,
   `jq -r '.files[]' .open-autonomy/generated.json | sort` equals the sorted list of paths the compile
   wrote (including itself). *Passes today* (BL-14 heritage — regression-pin it with a unit test beside
   `packages/core/src/manifest.test.ts` / `materialize.test.ts`).
7. **Upgrade preserves a merged settings file.** After AC-2, run the upgrade path
   (`npx open-autonomy upgrade --profile <dir> --target . --apply`) → `.claude/settings.json` still
   contains the adopter's `permissions` key (not reverted to the profile's whole-file copy). *Fails
   today:* `planUpgrade` marks it `update` and `applyUpgrade` overwrites (`upgrade.ts:94-95,109-122`).
8. **Docs name the human-session hook.** `grep -n 'settings.json' docs/OPERATIONS.md` hits in the step-3
   overlay list and in a callout that contains the words "every Claude Code session" (or equivalent
   explicit human-session statement). *Fails today:* zero occurrences of `settings.json` in
   OPERATIONS.md.

## Dependencies (OA-XX edges + reason)

- **← OA-07 (F-7, install paused):** OA-07's `.open-autonomy/paused` marker relies on this spec's
  guard semantics treating intentional operator deletion of state files as normal (AC-4's resurrection
  guard must exempt the state/install-owned set, or unpausing would be flagged/undone). Land the exemption
  list as part of this spec.
- **→ OA-12 (F-11, tracker onboarding docs):** both edit `docs/OPERATIONS.md`'s quickstart; coordinate the
  step-3/step-5 wording to avoid conflicting hunks (soft edge, ordering-free).
- **Related:** F-14 (docs/npm version skew) explains why the audit saw a weaker CLI (0.3.1, pre-BL-14)
  than source; shipping this spec without fixing the publish pipeline (F-1) would strand it unpublished —
  release-gating is F-1's spec, not this one.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-9; §1 phase 3 item 8; §3 item 4; §5 prerequisite (4).
- Source read on branch `adoption-fixes-backlog` (git `2fa5614`):
  `packages/core/src/materialize.ts:7-18,42-60`;
  `packages/core/src/file-manifest.ts:14,22-35,39-46`;
  `packages/core/src/upgrade.ts:17-37,88-103,109-122`;
  `packages/substrate-local/src/emit.ts:218-266,244-247,269-299`;
  `bin/autonomy-compile.ts:92-108`;
  `profiles/simple-sdlc/ir.yml:80-84`; `profiles/simple-sdlc/.claude/settings.json:1-14`;
  `profiles/simple-gh-sdlc/ir.yml:129-131`;
  `docs/OPERATIONS.md:41-52,158-163`; `docs/INSTALL-AGENT.md:371-374`.
- Status correction verified in source: collision refusal (BL-14, `findClobbers`) and the generated-files
  manifest already exist on this branch; the audit exercised published `open-autonomy@0.3.1`, which
  predates both.
- Spec authored 2026-07-06 as part of the cold-adopter install-audit fix backlog.
