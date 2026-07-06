# OA-12: tracker onboarding on a repo with tracker history — conforming issue-create in docs, pinned ztrack install, inline `.volter/` caveat, corrected compile hint

**Finding:** F-11 — Tracker onboarding is rough on a repo with tracker history: `ztrack init` silently no-ops when `.volter/` exists (documented only in a re-run appendix); the docs' verbatim `issue create` yields a non-conforming issue (`issue_missing_assignee`) with no guidance; new issues get a `LOCAL-` team key beside the repo's existing `TF-` scheme; `npx` fetched `ztrack@1.0.0` while the repo pinned `0.47.1` (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy (docs + compile next-steps hint); cross-repo notes for ztrack listed explicitly

## Problem

On a repo that already has tracker history, the documented local-git tracker steps mislead at every turn
(§1 phase 3, items 9-11):

- **Silent init no-op:** `npx ztrack init --preset simple-sdlc` printed "Already initialized" because the
  target repo already had `.volter/` config — the documented step silently did nothing. The audit got
  lucky (the existing config happened to be the right preset); on a repo with a *different* existing
  tracker config the loop's assumptions would be silently wrong. The only written warning lives in
  `docs/INSTALL-AGENT.md`'s re-run appendix — the human quickstart says nothing.
- **Non-conforming first issue:** the quickstart's verbatim
  `npx ztrack issue create --title "Wire the widget"` created an issue immediately flagged
  `issue_missing_assignee: does not fully conform to the installed preset`, with no docs guidance on
  whether that matters (it does: the preset requires an assignee, `standards/issue-and-evidence.md:8`, and
  the loop's gates key on conformance). The GitHub-flavor docs already know this — they document
  `--assignee` and the AC body at length — the local flavor never got the same treatment.
- **Version drift:** the docs say bare `npm install -D ztrack` / rely on `npx ztrack`, so the audit's
  `npx` fetched `ztrack@1.0.0` while the target repo pinned `0.47.1` — two majors of skew between the tool
  the docs drive and the one the repo tests against, with no pin recommended anywhere.
- **Id-scheme mixing:** the new issue minted a `LOCAL-911` id beside the repo's existing `TF-xxx` scheme
  (ztrack behavior — cross-repo, see below).

Most of ztrack is a separate package. **This spec scopes to what open-autonomy owns:** its docs
(`docs/OPERATIONS.md` step 5 local-git block, the overlay note, `docs/INSTALL-AGENT.md`'s stale
cross-reference) and its compile next-steps hint (`bin/autonomy-compile.ts`). Everything requiring a
ztrack code change is listed under cross-repo follow-ups.

## Root cause (verified file:line citations)

All paths relative to the repo root; all lines verified by reading on branch `adoption-fixes-backlog`.

**`docs/OPERATIONS.md` — the local-git step 5 lines the audit followed verbatim:**

- `docs/OPERATIONS.md:196-204` — the whole local-git tracker block. Specifically:
  - `:199` — `npm install -D ztrack` (unpinned; the accompanying comment on lines 199-201 explains
    project-dep-not-global but says nothing about *which version*).
  - `:202` — `npx ztrack init --preset simple-sdlc        # the PR-free dev preset (the \`default\`); no
    remote needed` — no mention that init silently no-ops when `.volter/` already exists, and no
    instruction to verify the applied preset afterwards.
  - `:203` — `npx ztrack issue create --title "Wire the widget"   # add a work item (repeat for each
    task; --title is required)` — no `--assignee`, no body/AC guidance → produces exactly the
    `issue_missing_assignee` non-conformance the audit hit. Contrast the same doc's **GitHub flavor**,
    `docs/OPERATIONS.md:235-236`, which at least appends the `ready`-label step, and the fully conforming
    treatment in `docs/INSTALL-AGENT.md:243-262`: lines 243-248 explain the assignee is load-bearing
    ("drop it and the developer's `ztrack check` fails `issue_missing_assignee`"), and line 261 shows the
    conforming create: `npx ztrack issue create --title "<first issue>" --body-file issue.md --state
    ready --assignee <login>`. The local-git quickstart — the flavor whose preset *also* requires an
    assignee (`profiles/simple-sdlc/standards/issue-and-evidence.md:8`: "Non-canceled issues have an
    assignee") — never got this.
- `docs/OPERATIONS.md:45` — the overlay note's `npm install -D ztrack` (also unpinned).

**`docs/INSTALL-AGENT.md` — the `.volter/` caveat is appendix-only, and one claim is now stale:**

- `docs/INSTALL-AGENT.md:366-370` — under "Re-running / repairing the install": "**`ztrack init` is a
  silent no-op if `.volter/` already exists** — it will NOT (re)apply `--sync github`. Never run a bare
  `ztrack init` first (OA's compile next-steps hint shows one); …". Two problems:
  - The caveat lives only in the re-run appendix of the *agent-facing* doc; the human quickstart
    (`OPERATIONS.md:202`) never states it, though "repo already has `.volter/`" is a first-install
    condition on any repo with tracker history, not a re-run condition.
  - The parenthetical "(OA's compile next-steps hint shows one [a bare `ztrack init`])" is **stale on
    this branch**: the hint has been preset-aware since BL-29 — see next item.

**`bin/autonomy-compile.ts` — the compile next-steps hint (found; partially fixed, three gaps remain):**

- `bin/autonomy-compile.ts:115-133` — the tracker section of the local "Next steps" print
  (`usesZtrack` at :115; preset resolution via `resolveZtrackPreset` at :121, per BL-29 —
  `bin/ztrack-preset.ts`). Lines 124-126's comment even says "Show the RIGHT init — never a bare `ztrack
  init`, which is a silent no-op once `.volter/` exists and never applies `--sync`" — so the *bare-init*
  half of the audit's complaint is already fixed in source (the audit ran published 0.3.1). Remaining
  defects:
  - `:129` — the local-git branch prints
    `npx ztrack init --preset ${presetName}   (then add work: \`npx ztrack issue create\`)` — the
    trailing hint is a **bare, non-conforming** `issue create` (no `--title`, which is required; no
    `--assignee`; no body), reproducing F-11's second bullet in the CLI's own guidance.
  - `:131-133` — `npm install -D ztrack` (unpinned) in the printed command, same drift exposure as the
    docs.
  - Nothing in the printed hint mentions the `.volter/`-exists no-op, even though its own source comment
    (:125-126) knows about it.

**The version to pin exists in-repo:**

- `package.json:65` — open-autonomy itself pins `"ztrack": "1.0.0"` in devDependencies: the version this
  release's `check:compile`/preset tests run against — i.e. the known-good pin the docs/hint should name
  instead of leaving `npx` to fetch whatever `latest` is (the audit: `npx` pulled `1.0.0` into a repo
  pinned to `0.47.1`).

## Proposed fix

All changes are docs + one CLI print + one small constant; no runtime behavior changes.

1. **Conforming issue-create in the local-git quickstart.** Replace `docs/OPERATIONS.md:203` with a
   conforming create mirroring `docs/INSTALL-AGENT.md:261`'s gh flavor, adapted to local-git:

   ```bash
   # a conforming work item: the preset REQUIRES an assignee, and the body needs "## Acceptance Criteria"
   # (an unassigned/AC-less issue is created but flagged non-conforming — issue_missing_assignee — and
   # the loop's gates key on conformance; see standards/issue-and-evidence.md)
   cat > issue.md <<'MD'
   ## Acceptance Criteria
   - [ ] dev/01 <one observable, testable outcome>
   MD
   npx ztrack issue create --title "Wire the widget" --assignee <your-login> --body-file issue.md --label oa-approved
   ```

   with a one-line footnote explaining `issue_missing_assignee` (what the warning means, why it matters,
   how to fix an already-created issue: `npx ztrack issue edit <id> --assignee <login>`). The
   `--label oa-approved` rides along once OA-07's dispatch allowlist ships (soft edge; drop the flag if
   OA-07 has not landed). Verify the exact flag set (`--assignee`, `--body-file`, `--label`) against the
   pinned ztrack version at authoring time — `--assignee`/`--body-file` are proven at
   `docs/INSTALL-AGENT.md:261`; `--label` on create is unverified (fallback:
   `npx ztrack issue edit <id> --add-label oa-approved`, proven at `profiles/simple-sdlc/skills/pm/SKILL.md:66`).
2. **Pinned install, single-sourced.** Change `docs/OPERATIONS.md:199` and `:45` to
   `npm install -D ztrack@1.0.0` with a comment "pin the version this open-autonomy release is tested
   against — a floating `npx ztrack` may fetch a different major than your repo's pin". Add a
   `KNOWN_GOOD_ZTRACK` constant in `bin/ztrack-preset.ts` (the existing ztrack-glue module), render it
   into the compile hint (`bin/autonomy-compile.ts:133`), and add a unit assertion in
   `bin/ztrack-preset.test.ts` that the constant equals `package.json`'s devDependency pin (:65) — so the
   docs/hint can never silently drift from the tested version again (the doc side is covered by AC-6's
   grep or, better, this repo's existing `bin/check-doc-vars.ts` mechanism if a doc-var fits).
3. **Inline `.volter/` caveat in the quickstart.** After `docs/OPERATIONS.md:202`, add:

   > If the repo **already has `.volter/`** (prior tracker history), `ztrack init` is a **silent no-op**
   > — it will not change the preset or apply anything. Inspect `.volter/config`: if the installed preset
   > is not `simple-sdlc`, decide deliberately (migrate the board, or fork the profile to match your
   > preset) before running the loop. New issues may also mint a different team key (e.g. `LOCAL-`)
   > beside your existing ids — a ztrack behavior; see its docs.

4. **Correct the compile hint.** In `bin/autonomy-compile.ts`:
   - `:129` — replace the trailing `(then add work: \`npx ztrack issue create\`)` with a pointer to the
     conforming form: `(then add work — a conforming issue needs --title, --assignee and an
     "## Acceptance Criteria" body: see docs/OPERATIONS.md#local-runner-quickstart step 5)` or print the
     full conforming one-liner if line width allows.
   - `:131-133` — print `npm install -D ztrack@${KNOWN_GOOD_ZTRACK}`.
   - Append one line to the tracker step: `(already tracker-initialized? \`ztrack init\` silently no-ops
     when .volter/ exists — verify the preset in .volter/config)`.
5. **Un-stale the cross-reference.** Rewrite `docs/INSTALL-AGENT.md:368-370`'s parenthetical: the hint is
   preset-aware since BL-29; keep the substantive rule ("if the GitHub link is missing, fix
   `.volter/config` directly rather than re-running init") and point the `.volter/` no-op caveat at the
   quickstart's new inline warning as the canonical statement (one source, two readers).

**Cross-repo follow-ups (need issues on the ztrack repo — out of scope here, listed for tracking):**

- `ztrack init` should fail loudly (or at minimum print a prominent warning naming the installed preset)
  when `.volter/` exists, instead of a silent "Already initialized" no-op — OA docs can only caveat this.
- `ztrack issue create` should either require the fields the installed preset mandates (assignee) or
  print the conformance fix-hint (`issue edit <id> --assignee …`) at create time, not only from a later
  `ztrack check`.
- Team-key adoption: on a board with an existing id scheme (`TF-`), `init`/`create` should adopt or
  prompt, not silently mint `LOCAL-` beside it.
- Version-skew warning: when the `npx`-resolved ztrack version differs (major) from the repo's pinned
  ztrack, warn.

## Alternatives rejected

- **Have the compile hint / docs run `ztrack issue create` with a generated template body automatically**
  (a `open-autonomy first-issue` verb): over-automation for a P2 docs fix; the draft agent already exists
  for shaping issues, and a wrong auto-body would just move the non-conformance around.
- **Vendor/wrap ztrack (OA prints `npx ztrack@<pin> …` everywhere via an alias script)** — `npx
  ztrack@1.0.0` inline in every command is noisy and still drifts from the project dep; the project-dep
  pin (`npm install -D ztrack@1.0.0`) makes `npx ztrack` resolve the local pinned copy, which is the
  behavior the preset already requires (`OPERATIONS.md:199-201` — the preset `import`s it from the repo).
- **Fix only the docs, leave the hint** — the hint is the first thing a compile-first adopter sees
  (before opening OPERATIONS.md); the audit chain shows the hint is treated as authoritative
  (INSTALL-AGENT.md even warns about it). Both surfaces or neither.
- **Document the `LOCAL-` team key / silent no-op as OA-side workarounds in depth** — the behaviors are
  ztrack's; OA docs get one-line caveats + pointers, the real fixes are the cross-repo follow-ups above.
  Duplicating ztrack's semantics in OA docs would rot.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Docs create a conforming issue.** Following `docs/OPERATIONS.md` step 5 (local-git) verbatim in a
   fresh repo (after init): the created issue passes `npx ztrack check --json` with **no**
   `issue_missing_assignee` (and no missing-AC complaint). *Fails today:* `:203`'s command has no
   assignee/body → flagged non-conforming, reproduced live (§1 item 11).
2. **Docs pin the tested ztrack.** `grep -n 'install -D ztrack' docs/OPERATIONS.md` → every hit carries
   `@1.0.0` (or the then-current `KNOWN_GOOD_ZTRACK`); a test (`bin/ztrack-preset.test.ts`) asserts the
   constant equals `package.json`'s `ztrack` devDependency. *Fails today:* `:45` and `:199` are unpinned;
   no constant, no test.
3. **Quickstart carries the `.volter/` caveat inline.** `grep -n '.volter' docs/OPERATIONS.md` hits
   within the step-5 local-git block (lines ~196-210), stating "silent no-op" and the verify-the-preset
   instruction. *Fails today:* zero occurrences of `.volter` in OPERATIONS.md; the caveat exists only at
   `docs/INSTALL-AGENT.md:368-370`.
4. **Compile hint prints pinned install + conforming-create pointer + no-op caveat.**
   `npx open-autonomy compile simple-sdlc local . && node -e ''` — capture the compile stdout:
   it contains `npm install -D ztrack@1.0.0`, does **not** contain a bare `npx ztrack issue create`
   without the conforming-fields pointer, and mentions the `.volter/` no-op. Unit-testable against
   `bin/autonomy-compile.ts`'s print (extend `bin/autonomy-compile.test.ts`). *Fails today:* `:129`
   prints a bare `issue create`; `:133` unpinned; no caveat.
5. **Stale cross-reference corrected.** `grep -n 'compile next-steps hint shows one' docs/INSTALL-AGENT.md`
   → no match (the parenthetical rewritten to reflect the preset-aware hint). *Fails today:* `:369`
   asserts the hint shows a bare `ztrack init`, which `bin/autonomy-compile.ts:124-129` disproves.
6. **Cross-repo follow-ups filed.** The four ztrack-side items above exist as issues on the ztrack repo
   (or the fleet's board) and are linked from this spec's PR description. *Fails today:* not filed.

## Dependencies (OA-XX edges + reason)

- **← OA-07 (F-7, dispatch allowlist):** the documented conforming create includes `--label oa-approved`
  only once OA-07's policy fence exists; if OA-12 lands first, ship without the flag and add it in
  OA-07's docs pass (soft, ordering-tolerant edge).
- **→ OA-10 (F-9, overlay receipt/docs):** both edit `docs/OPERATIONS.md`'s quickstart (step 3/step 5)
  and the compile-end output (`bin/autonomy-compile.ts` print). Coordinate hunks; no semantic coupling.
- **Cross-repo (not OA-XX):** ztrack repo issues per the follow-ups list — the silent init no-op, the
  create-time conformance hint, `LOCAL-` team-key minting, and npx-vs-pin skew warnings cannot be closed
  from this repo.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-11; §1 phase 3 items 9-11 (init no-op, `issue_missing_assignee`,
  `LOCAL-911` beside `TF-xxx`, npx `1.0.0` vs pinned `0.47.1`); §3 item 3.
- Source read on branch `adoption-fixes-backlog` (git `2fa5614`):
  `docs/OPERATIONS.md:41-46,196-210,215-237`;
  `docs/INSTALL-AGENT.md:243-262,366-374`;
  `bin/autonomy-compile.ts:115-133` (and `bin/ztrack-preset.ts` per its BL-29 reference at
  `profiles/simple-sdlc/ir.yml:63-68`);
  `package.json:65`;
  `profiles/simple-sdlc/standards/issue-and-evidence.md:5-9`;
  `profiles/simple-sdlc/skills/pm/SKILL.md:66`.
- Status correction verified in source: the audit-era "bare `ztrack init`" compile hint is already fixed
  (preset-aware, BL-29) on this branch; `docs/INSTALL-AGENT.md:369`'s claim about it is stale. The
  remaining hint defects are the bare `issue create` (:129), the unpinned install (:133), and the missing
  `.volter/` caveat.
- Spec authored 2026-07-06 as part of the cold-adopter install-audit fix backlog.
