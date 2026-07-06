# OA-17: Document that the runner-dep install step can rewrite existing dependency ranges; instruct installers to diff and surface package.json changes

**Finding:** F-17 — installs mutate the host repo beyond their remit: `npm install termfleet` rewrote an existing dep pin (`@termfleet/core` `^0.2.0` → `^0.2.1`) in the host's `package.json` with no mention anywhere (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy (docs only — the mutation itself is npm behavior open-autonomy does not control)

## Problem

The documented install step `npm install termfleet` is presented as inert on the host beyond adding the new dep ("purely additive", docs/OPERATIONS.md:43). On the audit target it also rewrote a **pre-existing** dependency range in the host's `package.json` (`@termfleet/core`: `^0.2.0` → `^0.2.1`) — a change to the host's own pins that no doc warns about and no step surfaces. The Phase-3 commit block then stages `package.json` wholesale, so the rewrite rides silently into the "install open-autonomy" commit under a message that doesn't describe it. On a lived-in repo, an unreviewed range bump is a real change to the host's build (a different version can now resolve in CI).

Honest scoping: this is **npm's** (Arborist's) behavior when re-resolving a tree during `npm install <pkg>` — open-autonomy cannot prevent it, and it is not fully deterministic (see Provenance: it did **not** reproduce in a flat repo or in a synthetic workspaces repo on npm 11.12.1; it did happen on the audited target). What open-autonomy *can* do is stop promising inertness it doesn't control, and make its install playbook look at the diff it creates. This spec does exactly that and no more.

## Root cause (verified file:line citations)

- **The docs assert an additivity the install step can't guarantee.** `docs/OPERATIONS.md:41-46` (the overlay note) frames the whole install as additive, with the dep installs at :45 (`npm install termfleet`, `npm install -D ztrack`) mentioned as the only `package.json` effect. The quickstart install line `docs/OPERATIONS.md:97` (`npm install termfleet  &&  npx --yes open-autonomy preflight`) and the prerequisites row :86 carry no note that npm may also touch *existing* entries or the lockfile beyond adding the dep.
- **INSTALL-AGENT's execute phase never inspects what the installs changed.** `docs/INSTALL-AGENT.md:172-186` (Phase 3 — EXECUTE, step 1): the install block at :178-180 runs `npm install termfleet` / `npm install -D ztrack` and moves straight on to preflight (:186) and the overlay (:190). No step diffs `package.json`/lockfile after the installs.
- **The commit step stages the mutation blind.** `docs/INSTALL-AGENT.md:198-210` (Phase 3, step 5): the staging loop at :204-205 explicitly `git add`s `package.json package-lock.json pnpm-lock.yaml bun.lock yarn.lock`, and the guard at :206-208 only checks that *harness* paths were staged — nothing surfaces pre-existing-pin changes to the human before :209's `git commit`. (The block is otherwise very careful — it forbids `git add -A` precisely to avoid sweeping unrelated changes — which makes the unreviewed `package.json` sweep the one gap in its own doctrine.)
- **The audit's observed mutation:** OA-INSTALL-AUDIT-FINDINGS.md §1 phase 3 step 1 — `npm install termfleet` "silently rewrote the repo's existing `@termfleet/core` pin (`^0.2.0` → `^0.2.1`) in `package.json`". Mechanism: npm re-resolves the tree when adding a dep and may re-save ranges for existing direct deps it re-places (workspace/dedupe-dependent; not something the CLI exposes a switch to prevent short of `--no-save`, which would also not record `termfleet` itself).

## Proposed fix

Docs-only; three small amendments plus one honesty fix. No code changes: preflight runs *after* the installs (`docs/INSTALL-AGENT.md:186`), so it has no pre-install snapshot to diff against, and blocking on lock/manifest churn it can't attribute would recreate an F-5-style false gate (see Alternatives).

1. **`docs/OPERATIONS.md` — warn at the install line.** After the preflight snippet at :96-98 (or as a sentence in the :91-94 paragraph), add:
   > Note: `npm install termfleet` may also adjust **existing** entries in your `package.json`/lockfile while re-resolving the tree (npm behavior, e.g. an existing `@termfleet/core` range was bumped `^0.2.0`→`^0.2.1` in one install). Review `git diff package.json package-lock.json` before you commit (step 5).
2. **`docs/OPERATIONS.md` — soften the inertness claim.** In the overlay note at :41-46, after "You still merge the runner's deps into your repo (…) — step 1 below" (:44-45), add the clause: "npm may rewrite existing dependency ranges while doing so — review the diff it leaves."
3. **`docs/INSTALL-AGENT.md` Phase 3, step 1 (:178-186)** — append to the install block, immediately after the installs (before preflight at :186):
   ```bash
   # npm can rewrite EXISTING dependency ranges while adding these deps (it re-resolves the tree).
   # Inspect what the installs changed beyond adding termfleet/ztrack, and REPORT any changed
   # pre-existing pin to the human (Phase-2 style confirmation) — do not silently commit it:
   git diff package.json
   ```
4. **`docs/INSTALL-AGENT.md` Phase 3, step 5 (:198-210)** — before the `git commit` at :209, add one line to the block:
   ```bash
   git diff --cached package.json   # surface dep-range changes to the human before committing
   ```
   plus a sentence in the step's prose: "If the diff shows changes to pins that existed before the install, call them out in your report — the commit message says 'install open-autonomy', and a range bump is not that."

What open-autonomy **can** control (stated in the docs text so expectations are honest): announcing the possibility, and making the installer look. What it **cannot** control (also stated): whether npm rewrites, or which ranges — that is Arborist's resolution, varies by tree shape and npm version, and has no opt-out compatible with recording the new dep.

## Alternatives rejected

- **A preflight/CLI check that detects the rewrite.** Preflight runs after the install (docs/INSTALL-AGENT.md:186, docs/OPERATIONS.md:97) with no "before" snapshot; distinguishing "npm bumped a pre-existing pin" from "the operator's own uncommitted work" from git state alone is guesswork, and a false gate here repeats F-5. The git diff *in the playbook*, read by the installing agent/human who knows what they just did, is the reliable version of the same idea at zero code cost.
- **Wrapping the installs (`npm install --no-save` + manual package.json edit, or pinning exact versions).** Fights the package manager, breaks the documented "use the detected PM" flexibility (docs/INSTALL-AGENT.md:174: npm/bun/pnpm), and `--no-save` would drop the intended change (recording `termfleet`) along with the unintended one. Out of open-autonomy's remit to re-implement npm's save semantics.
- **An open-autonomy-owned snapshot/diff command (e.g. `open-autonomy install-deps` that snapshots `package.json`, runs npm, prints the delta).** Genuinely nice, but it adds a new CLI surface and a second way to install deps for a P2 paper-cut; the docs fix delivers the safety property (a human sees the change before it's committed) now. Revisit if F-9's overlay-manifest work ("here is what I wrote/changed") lands — this belongs in that manifest's scope.
- **Doing nothing ("it's just npm").** The audit's point stands: OA's docs *chose* npm-install-into-the-host as the delivery mechanism and promise additivity around it (docs/OPERATIONS.md:41-46); owning the delivery mechanism means owning the caveat.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **OPERATIONS warns at the install line.** `sed -n '85,105p' docs/OPERATIONS.md | grep -i 'existing.*rang\|rewrite\|git diff package.json'` — *Today:* no match (verified: no such text anywhere in the file). *After:* matches the new note adjacent to the :96-98 install snippet, and it names `git diff package.json`.
2. **The overlay-note inertness claim is qualified.** `sed -n '41,47p' docs/OPERATIONS.md | grep -i 'rewrite\|existing'` — *Today:* no match. *After:* the additive-overlay note carries the "npm may rewrite existing ranges" clause.
3. **INSTALL-AGENT Phase 3 step 1 gains the diff-and-report step.** `sed -n '172,195p' docs/INSTALL-AGENT.md | grep -c 'git diff package.json'` — *Today:* 0 (verified: the only `git diff` in the file is the staged-paths guard at :207). *After:* ≥1, with adjacent text instructing the installer to **report changed pre-existing pins to the human** before proceeding.
4. **INSTALL-AGENT step 5 surfaces the staged manifest diff pre-commit.** `sed -n '198,212p' docs/INSTALL-AGENT.md | grep -c 'git diff --cached package.json'` — *Today:* 0. *After:* ≥1, placed before the `git commit` line (currently :209).
5. **End-to-end (playbook walk-through):** an agent executing Phase 3 verbatim in a repo where the install rewrites a pin produces, in its report to the human, an explicit mention of the changed pin *before* the harness commit exists. *Today:* the audit demonstrates the opposite (the rewrite surfaced only because the auditor diffed on their own initiative). Testable as an instruction-following check on the INSTALL-AGENT transcript; no code artifact.

## Dependencies (OA-XX edges + reason)

- **OA-06 (soft, same doc block):** OA-06 amends the same INSTALL-AGENT Phase-3 step-1 block (:178-186) and the same OPERATIONS install lines; coordinate so the block gains one coherent caveat area (env no-op + range-rewrite) instead of two interleaved edits.
- **No edges to OA-04/OA-05** (different files/concerns). Related-but-out-of-scope: F-9's overlay manifest ("print what I wrote/changed") is the natural future home for a mechanical version of this check.

## Provenance

- Authored 2026-07-06 by Claude (Fable 5), adoption-fixes spec pass on branch `adoption-fixes-backlog` @ `2fa5614`, from OA-INSTALL-AUDIT-FINDINGS.md (F-17; narrative §1 phase 3 step 1; §3 item 1).
- Docs verified in this clone: `docs/OPERATIONS.md:41-46,86,91-98` and `docs/INSTALL-AGENT.md:172-186,198-210` (staging of `package.json` at :204-205, commit at :209); `grep -n 'git diff' docs/INSTALL-AGENT.md` → only :207 (staged-name guard); `grep -in 'rewrite\|existing rang' docs/OPERATIONS.md` → no install-step caveat.
- Empirical scoping (scratchpad, Node v22.23.1, npm 11.12.1, linux-x64): the rewrite did **not** reproduce in (a) a flat repo with `"@termfleet/core": "^0.2.0"` pre-installed then `npm install termfleet` (range untouched, transitive 0.2.1 installed), nor (b) a synthetic workspaces repo named `termfleet` with workspace `@termfleet/core@0.2.0` (range untouched; npm added `"termfleet": "^0.2.0"` only). Conclusion recorded in the spec: the mutation is real (audit-observed on the actual target) but tree-shape/version-dependent — which is precisely why the fix is "warn + always diff" rather than a deterministic detector.
