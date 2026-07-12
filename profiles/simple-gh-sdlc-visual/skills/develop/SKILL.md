---
name: develop
description: Implement one ztrack simple-gh-sdlc issue with before/after visual evidence and push a branch for PR review; use when dispatched a Ready or rework issue by PM.
---

# ztrack simple-gh-sdlc-visual Develop

Read:

- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`
- `standards/visual-evidence.md`

Your work item is a **ztrack store id** (e.g. `COMBO-9`) in `$ZTRACK_ISSUE`. Its acceptance
criteria live in the committed store file `.volter/tracker/markdown/$ZTRACK_ISSUE.md` — the
single source of truth (there is no GitHub issue body to fetch or push back). You implement the
ACs, **commit your work on `agent/issue-$ZTRACK_ISSUE`** (the store file's own edits ride the same
branch, alongside your implementation), and the substrate opens the auto-merging PR for your
committed branch; the independent `reviewer` gates it (`ci` + `agent-review` → native auto-merge).
You never open the PR, request review, or merge.

## Procedure

1. `echo "$ZTRACK_ISSUE"` — stop if missing/empty. It is a ztrack store id (e.g. `COMBO-9`).
   The runner's declared `prelaunch` (`.open-autonomy/autonomy.yml`) already arms the in-session
   ztrack-loop gate for you before this session started (`npx ztrack loop start "$ZTRACK_ISSUE"
   --until in-review --max 8`) — your own Stop/SubagentStop hooks now hold every turn until
   `$ZTRACK_ISSUE` reaches `in-review` with a green `ztrack check`. Belt-and-suspenders: you may run
   that exact same command yourself at any point (e.g. if you suspect it wasn't armed) — re-arming
   the SAME target is idempotent (a safe refresh: new `startedAt`, swept iteration counters, no
   refusal), so running it again never breaks anything.
2. Read the issue: `npx ztrack issue view "$ZTRACK_ISSUE" --json identifier,title,state,body,assignee`.
   Implement **only** its ACs. Stop with `OUTCOME: blocked human-required` if it needs a
   human-required path/topic from `risk-and-review.md`.
3. Make sure your commits land on `agent/issue-$ZTRACK_ISSUE` so they become the PR. The runner may already
   have placed you on it (a local runner gives you an isolated worktree already on that branch); create it only
   if needed — don't fail if you're already there:
   `git checkout -b "agent/issue-$ZTRACK_ISSUE" 2>/dev/null || git checkout "agent/issue-$ZTRACK_ISSUE"`.
4. **First act: mark the issue in-progress and commit that store change immediately** — before any
   implementation work — so the store never silently disagrees with reality:
   `npx ztrack issue edit "$ZTRACK_ISSUE" --state in-progress`, then
   `git add .volter/tracker/markdown/"$ZTRACK_ISSUE".md && git commit -m "chore: $ZTRACK_ISSUE in-progress"`.

## §Smoke (step 0, before §Baseline)

Run `npm run smoke`. It boots its own throwaway world end-to-end (boot+doctor, the
sealed-egress negative test, seed+idempotency, a mock-coverage probe against every vendor
op the app actually calls, a real headless Playwright capture, and an evidence-adapter
dry-run) and tears itself down — non-mutating, no git/tracker writes.

If it fails, **STOP — do NOT attempt development.** Report `OUTCOME: blocked` with the
smoke diagnosis (which stage failed and why, verbatim from its output). The environment is
unfit and any evidence you produce against it — baseline or dry-run screenshots, mock
responses, "the feature is missing" claims — would be untrustworthy: you cannot tell
"feature genuinely absent" apart from "environment broken" until this passes clean.

## §Baseline (BEFORE bookend)

Immediately before implementation, for **every user-facing AC** in `$ZTRACK_ISSUE` (an AC a human would
observe by looking at the app — skip this section entirely for ACs that are purely internal/API/data
and have no visible surface):

(a) Boot the world **fresh**: `npx volter-world up world.config.json --mode sealed` (or `npm run
    world:up`), then `npx volter-world doctor combo-dev` (or `npm run world:doctor`) to confirm the
    twin/services are healthy. Seed it **inside the world env** — `npm run seed` (which already runs
    `volter-world env combo-dev -- node scripts/seed-world.mjs`), never bare.
(b) Run or author the relevant visual-edit demo/visual-state script **headlessly**, with a pinned run
    id, **inside the world env** so it sees the injected app URL and TLS/proxy vars:
    `npx volter-world env combo-dev -- env PLAYWRIGHT_DEMO_RUN_ID=<issue>-baseline node apps/web/.visual-edit/playwright-demos/<slug>.mjs`
    (the world env already injects `APP_URL`; a visual-state script under `playwright-visual-states/`
    instead, when the AC is a state to reach rather than a flow to demo).
(c) **Inspect each captured screenshot before describing it.** Baseline evidence must PROVE the bug
    exists or the feature is absent — a screenshot you haven't looked at proves nothing.
(d) **Baseline artifacts are cited by `bk/01` ONLY — never by any `dev/NN` AC.** If the issue carries a
    `bk/01`/`bk/02` pair (the draft skill adds these whenever any AC is user-facing — see the draft skill's
    conditionality rule; a purely non-visual issue has neither, and this whole §Baseline section is already
    skipped for it), the baseline run itself must **ASSERT the buggy/absent before-state** in the demo/state
    script (so its `summary.json` reports `status: pass` — the evidence adapter refuses a non-`pass` run) and
    commit that proof as `bk/01`'s durable evidence — a checked, committed tracker record, not a discarded
    worksheet file (its §DryRun counterpart re-asserts the post-change/fixed state instead — see §DryRun(b)):
    1. Point the baseline script's `acIds` at `<issue>#bk/01` (e.g. `acIds: ['COMBO-9#bk/01']` on the relevant
       step/visualState) — same convention `scripts/evidence-attach.mjs` already parses for dev/ ACs.
    2. Run the adapter against the **stored issue**, mapping the baseline run's step to `bk/01`:
       `node scripts/evidence-attach.mjs --run <baseline-run-dir> --issue "$ZTRACK_ISSUE"` — this commits
       the baseline PNG (capture → evidence add → `git add` by path → commit → cite, the same ordering
       §DryRun(d) requires) and patches `bk/01`'s `evidence`/`proof` fields onto the committed store file for
       you via `ztrack ac patch`. Never hand-edit the store markdown.
    3. `dev/NN` ACs still never cite a baseline artifact — only `bk/01` does. The worksheet dir
       (`full-develop-worksheets/<issue>/baseline/`) may still hold the raw run outputs (video/ARIA dumps)
       for your own before/after diffing convenience, but the PNG `bk/01` cites is the one committed via the
       adapter above, not a reference to that worksheet copy.
(e) **Discovery before scripting.** Explore the flow with one-action-at-a-time Playwright (ARIA
    snapshots preferred over raw screenshots for verifying structure). A demo/state script may only
    **REPLAY** a flow you've already discovered by hand — never script a flow you haven't walked
    yourself. Only **human-performable** browser moves are allowed (real clicks, real typed text, real
    navigation) — no state injection, no synthetic/dispatched events, no reaching into app internals.
(f) **Seed and all app interaction MUST run inside the world env** (`npm run seed`, or `volter-world env
    combo-dev -- …`). NEVER run seed/scripts bare: the app's fallback fake key means a bare run escapes
    the sealed world and hits real vendor APIs (proven: bare seed → real api.stripe.com 401).

4. Implement. Verify with a **fast, TARGETED** check — the build/typecheck plus the specific test(s) your
   change affects (or a quick runtime spot-check). **Do NOT run the project's full/slow suite locally**
   (e.g. a non-visual e2e suite that takes many minutes) — CI runs the full suite on the PR and is the
   real gate; running it in-session just doubles the wait. Accept a targeted check that exits 0. The
   visual-evidence bookends below are the ONE exception to "no browser suites in-session": for
   user-facing ACs they are REQUIRED, not optional — they are the oracle this profile ships, not slow
   test-suite noise. Every other slow/browser suite remains out of scope for this session.

## §DryRun (AFTER bookend)

Immediately after implementation and its checks (step 4), before committing/recording evidence, for
**every user-facing AC**:

(a) Tear down and boot a **FRESH** world — never reuse the baseline stack (a reused stack can carry
    baseline state that makes the "after" proof dishonest): `npx volter-world down combo-dev` (or `npm
    run world:down`) then `npx volter-world up world.config.json --mode sealed` (or `npm run world:up`),
    and re-seed exactly as in §Baseline — **inside the world env, via `npm run seed`, never bare** (see
    (h) below).
(b) Re-run the same demo/state script's **flow/navigation** with run id `<issue>-dryrun`, **inside the
    world env** (`npx volter-world env combo-dev -- …`), exactly as in §Baseline(b) — but its
    **assertions and captured moments must target the now-FIXED state, not the buggy/absent one**.
    Since §Baseline(d) requires the baseline run to assert the buggy/absent before-state (so it
    reports `status: pass`), the same script cannot pass both bookends unmodified: update its
    `validateDemoStep`/assertions (or maintain a paired dry-run variant) so this run's `summary.json`
    also reports `status: pass` — this time because it genuinely proves the fix. Every AC's now-fixed
    state must be asserted by the script AND captured in the screenshots — not merely "should now work".
(c) Run the evidence adapter — this is the ONLY way evidence fields get written, see (g) below:
    `node scripts/evidence-attach.mjs --run <run-dir> --issue "$ZTRACK_ISSUE"`. There is no `--map` flag —
    the AC each step/screenshot proves is the `<issue>#<acId>` string the demo/state script itself sets on
    that step's `acIds` (e.g. `acIds: ['COMBO-9#dev/01', 'COMBO-9#bk/02']`); the adapter only parses it (see
    the acId convention comment at the top of `scripts/evidence-attach.mjs`). For every mapped step it
    invokes `ztrack evidence add <png> --commit`, commits the artifact, and patches both the `evidence`
    array (`image=<path> sha256=sha256:<hex> commit=<sha> acv=<n>`) and `proof` fields onto the AC via
    `ztrack ac patch` (no manual editing of these fields — ever). If the issue carries a `bk/01`/`bk/02`
    pair, the SAME dry-run step that proves a `dev/NN` AC's now-fixed state also proves `bk/02` — give it
    both acIds (`['COMBO-9#dev/01', 'COMBO-9#bk/02']`) so one screenshot serves both. `bk/02`'s proof must
    **name the `bk/01` evidence path it reverses/confirms**: pass `--note bk/02=reverses bk/01
    (<path-to-bk/01-image>)` so the adapter appends that cross-reference into `bk/02`'s proof text —
    restoring the before↔after linkage now that both are committed, citable records rather than a
    worksheet-only comparison.
(d) **ORDERING (hard rule, no exceptions):** capture the screenshot → run the evidence adapter (evidence
    add) → `git add` the artifacts BY PATH → commit → the commit the evidence line cites IS that commit.
    Never cite a commit that predates the artifact it's supposed to prove.
(e) **`image=sha256:` blob refs are BANNED.** The adapter parses a `sha256:` value only to VERIFY the
    artifact's hash — never accept or fabricate a bare blob-ref in place of a real committed `image=<path>`.
(f) `npx ztrack check "$ZTRACK_ISSUE"` must be green before you propose (this folds into step 7 below —
    do not consider the dry-run done until this passes).
(g) **Evidence fields are NEVER hand-written.** ALL AC evidence MUST be produced by
    `node scripts/evidence-attach.mjs --run <run-dir> --issue "$ZTRACK_ISSUE"`, which routes every evidence
    write through `ztrack evidence add <png> --commit` (a real committed file) followed by
    `ztrack ac patch`. A bare `image=sha256:<hex>` blob ref is BANNED — ztrack parses it but verifies
    nothing, so a hand-written blob ref is an evidence-forgery vector. If you catch yourself editing
    `.volter/tracker/markdown/$ZTRACK_ISSUE.md`'s evidence lines directly instead of running the adapter,
    stop — that edit is invalid no matter how accurate it looks.
(h) **Seed and all app interaction MUST run inside the world env** (`npm run seed`, or `volter-world env
    combo-dev -- …`). NEVER run seed/scripts bare: the app's fallback fake key means a bare run escapes
    the sealed world and hits real vendor APIs (proven: bare seed → real api.stripe.com 401).
(i) **Tear the world down** — leave NO background processes (folds into the final no-background-process
    rule in step 9; do this here too so a crashed step doesn't leak a running world).

5. **Commit your implementation — stage ONLY the files you changed for this issue, BY PATH.**
   **NEVER `git add -A` / `git add .`** — those sweep OA's own working files (the tracker's `.volter/`
   sync-state, any scratch, etc.) into the PR, which the reviewer will (correctly) reject as unrelated
   scope. Add your implementation file(s), explicitly:
   `git add <path/to/changed-file> && git commit -m "feat: <what> ($ZTRACK_ISSUE)"`.
   Capture `sha="$(git rev-parse HEAD)"`. Then sanity-check the diff is clean — `git show --stat HEAD`
   must list **only** your intended change. `.volter/tracker/markdown/$ZTRACK_ISSUE.md` (your own issue's
   store file) and `.volter/evidence/*` are EXPECTED PR contents (see step 8) — no OTHER `.volter/` path,
   and no `.open-autonomy/`, `scripts/`, or other harness path, belongs in this commit. For a
   **non-visual** AC's evidence, cite this commit directly. For a **user-facing** AC, its evidence commit
   is the one `scripts/evidence-attach.mjs` makes in §DryRun(d) — a separate, later commit that adds the
   screenshot artifact(s) BY PATH; do not fold artifact commits into this implementation commit (keeps the
   capture→add→commit ordering honest and the diff reviewable).
6. Record evidence for each genuinely satisfied AC via `ztrack ac patch` — never hand-edit the store
   markdown. For a **non-visual** AC (no bookend — purely internal/API/data, nothing a human would look
   at), patch it directly:
   ```
   npx ztrack ac patch "$ZTRACK_ISSUE" dev/NN --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","commit":"<sha>","acVersion":<n>}],"proof":{"explanation":"how the commit shows this AC is met","evidenceRefs":["ev1"]}}'
   ```
   then `git add .volter/tracker/markdown/"$ZTRACK_ISSUE".md && git commit -m "chore: $ZTRACK_ISSUE dev/NN evidence"`.
   For a user-facing AC, `scripts/evidence-attach.mjs` (§DryRun(c)) already ran the equivalent `ac patch`
   and committed the store change for you — review it, don't hand-author a duplicate patch. A
   checked/passed AC with no real evidence fails `check` — never fabricate one.
   **Non-visual AC evidence owner:** a non-visual AC is NOT satisfied by commit + prose alone. Its proof
   must cite a **concrete falsifier** — something that could actually have failed and didn't: a passing
   test name (`"tests/foo.test.ts › returns 409 for insufficient stock passed" -> ev1` with the commit as
   `ev1`), a typecheck/build command's clean output, or a real API-response capture (status code + body
   actually observed, not asserted from memory). A proof whose only content is "the code does X" with no
   falsifier named is not evidence — it is the same unearned claim the visual bookends exist to prevent for
   user-facing ACs, applied to non-visual ones instead. **The falsifier the proof cites must match the AC's
   `plan:` field** the draft skill already set (e.g. `plan: test:foo.test.ts` → the proof names that exact
   test passing; `plan: typecheck` → the proof names the clean typecheck run; `plan: api-output` → the
   proof names the captured status/body). `passed_ac_missing_plan` (the preset rule) requires the `plan:`
   field itself be present before you check the box — if the issue somehow has none (drafted before this
   rule existed), add one now (`ztrack ac patch "$ZTRACK_ISSUE" dev/NN --json '{"plan":"test:…"}'`) rather
   than marking passed without it.
7. **Gate locally:** `ztrack check "$ZTRACK_ISSUE"` (it validates the AC structure and that the
   cited commits exist — your commit(s) from step 5 and the adapter's commit from §DryRun do). Iterate
   until it is green — this is the same gate §DryRun(f) requires before you propose.
8. **Terminal: write the PR ref and move to in-review.** The branch you've been committing to IS the PR
   (its ref resolves in the worktree, no separate push-and-verify dance needed):
   `npx ztrack issue patch "$ZTRACK_ISSUE" --json '{"pr":{"url":"agent/issue-'$ZTRACK_ISSUE'"}}'`, then
   `npx ztrack issue edit "$ZTRACK_ISSUE" --state in-review`. Commit these store changes —
   `git add .volter/tracker/markdown/"$ZTRACK_ISSUE".md && git commit -m "chore: $ZTRACK_ISSUE in-review"` —
   they ride in the PR alongside your implementation and evidence commits; the evidence-of-record is the
   diff itself, not a separately-pushed body. `ztrack check "$ZTRACK_ISSUE"` must be green **before**
   `OUTCOME: ready-for-review` — this is the terminal gate; there is nothing to "verify landed" beyond it,
   because there is no second write destination to race against (unlike the old `gh issue edit --body-file`
   push, the store file only ever exists on this branch's own commits).
9. **Leave NO background process running**, then stop. Run every check in the FOREGROUND to completion;
   never start a watcher/dev-server/`&`-backgrounded job (`tsc --watch`, `npm run dev`, a server, a
   `run_in_background` shell) and walk away. A lingering shell keeps your session "running" so the substrate
   never sees you done — it won't open the PR and the issue stalls. If you backgrounded anything, kill it
   before ending. Then the substrate pushes `agent/issue-$ZTRACK_ISSUE`, opens the auto-merging PR, and
   triggers the reviewer — do not open the PR or merge.

Honest escape (never fake green): leave the AC unchecked and end `OUTCOME: blocked <reason>`,
descope it, or `ztrack waiver sign "$ZTRACK_ISSUE" --code <code> --reason "…"` (then commit the store
change it makes).

End with `OUTCOME: ready-for-review` (branch committed; PR will open) or `OUTCOME: blocked <reason>`.
Never merge — the boundary is `ci` + the reviewer's `agent-review`, landed by native auto-merge.
