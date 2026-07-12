---
name: draft
description: Draft verifiable ztrack simple-gh-sdlc issues from requests; use when converting an unshaped GitHub issue into a Ready work item in the committed store.
---

# ztrack simple-gh-sdlc Draft

Read:

- `standards/issue-and-evidence.md`
- `standards/visual-evidence.md`

Your work item is a **human GitHub intake issue number** in `$ZTRACK_ISSUE` — a raw, unshaped
request filed on GitHub. You shape it into a verifiable Ready work item **in the committed ztrack
store**: a new store issue (e.g. `COMBO-9`), minted with `ztrack issue create`, carrying a
ztrack-form body (summary + acceptance criteria) and `state: ready`. The GitHub intake issue itself
is never transitioned in place — it is closed once its content has been tracked into the store.

## Procedure

1. `echo "$ZTRACK_ISSUE"` — stop if missing/empty. It is a GitHub intake issue **number**.
2. Read the raw request: `gh issue view "$ZTRACK_ISSUE" --json title,body,comments`.
3. Compose the issue body in a **temp file outside the repo** (never write it into the tree yet —
   `ztrack issue create --body-file` reads it once, at creation time):
   `BODY_MD="$(mktemp)"; ztrack issue scaffold --title "<title>" > "$BODY_MD"` — a source-grounded
   summary and 1-3 ACs that are each observable and provable by a commit. Leave the ACs **unchecked**
   — develop adds the evidence later; do not pre-create evidence.
   **Every `dev/NN` AC gets a `plan:` sub-bullet declaring its evidence OWNER up front** — HOW it will be
   proven, decided now, before any work starts, not improvised at evidence time:
   ```
   - [ ] dev/01 v1 <observable, testable outcome>
     - status: pending
     - plan: visual-bookend
   ```
   `plan` is one of: `visual-bookend` (a human-observable AC proven by the baseline/dry-run screenshot
   pipeline — pair it with the `bk/01`/`bk/02` ACs below), `test:<name>` (a specific test that must pass),
   `api-output` (a real captured API response), `typecheck`, or `build` (a clean tool run). Pick the one
   that actually matches how this AC's proof will be produced — `ztrack check`'s `passed_ac_missing_plan`
   rule requires this line be present before the AC can be marked passed, and the develop skill's non-visual
   evidence-owner rule requires the eventual proof to cite the falsifier the plan named (not commit+prose
   alone). `bk/` ACs need no explicit `plan:` — they are inherently `visual-bookend`.
   **Every `dev/NN` AC that is user-facing (and every `bk/` AC) also gets a `paths:` relevance anchor** —
   the repo path(s) (globs OK) this AC's work concerns, e.g. `paths: apps/web/src/pages/subscriptions/**`
   or the specific evidence-producing dir. This is what makes `evidence_commit_unrelated` /
   `passed_ac_missing_paths` bite on this issue: without a `paths:` anchor, a real-but-unrelated commit with
   a recycled image could otherwise satisfy the AC's evidence requirement. Declare the narrowest path(s)
   that genuinely cover where the fix will land — broad enough to not need editing mid-implementation,
   narrow enough to actually exclude unrelated commits.
3a. **Bookkeeping (bk/) ACs — conditional, not automatic.** If the issue has **at least one
    user-facing AC** (an AC a human would observe by looking at the app — see `standards/visual-evidence.md`),
    also append these two, unchecked, right after the dev/ ACs:
    ```
    - [ ] bk/01 v1 Baseline captured: committed screenshot(s) prove the bug exists / feature is absent before implementation.
      - status: pending
      - paths: <same relevance anchor as the dev/ ACs this bookends>
    - [ ] bk/02 v1 Dry-run captured: committed fresh-world screenshot(s) prove the fixed state; proof names the bk/01 artifact it reverses/confirms.
      - status: pending
      - paths: <same relevance anchor as the dev/ ACs this bookends>
    ```
    **CRITICAL conditionality:** an issue that is **purely non-visual** (every AC is internal/API/data with
    no observable surface) must get **NO** `bk/` ACs at all. `bk_pair_incomplete` (the preset rule) requires
    BOTH bk/01 and bk/02 whenever EITHER is present — there is no such thing as a lone bookend — so adding
    one to a non-visual issue makes it permanently unmergeable; only add the pair, and only when at least one
    AC is genuinely user-facing.
4. Validate the shape: `ztrack check "$BODY_MD"` (it must parse + accept the ACs as a loose file before
   they're minted into the store).
5. **Preflight the next id — never trust ztrack's own allocator blindly.** ztrack mints the next store id
   from what currently exists in `.volter/tracker/markdown/` alone; it has no memory of an id that was
   minted, WORKED ON (a real `agent/issue-<id>` PR opened), and later had its store file deleted again (a
   scratch-proof cleanup, a reverted draft, …) — so it can hand out an id whose branch already has PR
   history, permanently stranding it (`pm`'s own dispatch rule refuses a `ready` issue whose
   `agent/issue-<id>` branch already has a PR — see `.claude/skills/pm/SKILL.md`). Worked example: if
   `COMBO-9` were minted, worked, and merged, then its store file later cleaned up (a scratch-proof
   cleanup, a reverted draft, …), a bare re-mint of `COMBO-9` afterward would be dead on arrival.
   Run `node scripts/next-free-issue-id.mjs` (a pure advisory helper — reads only, mints nothing) and note
   the id it prints — this is the EXPECTED next id, checked against real `agent/issue-<id>` PR history on
   GitHub (any PR, any state, means "used"), not just against the store's current file listing. It uses YOUR
   repo's own team key automatically (derived from `.volter/tracker-config.json`'s `local.teamKey` — the same
   `<team>-<n>` namespace ztrack itself mints in, e.g. `LOCAL-12` for team key `LOCAL`, not a hardcoded
   `COMBO`); it prints the team + where it resolved it to stderr. Pass `--team <key>` only to override that
   for a non-default namespace.
6. **Mint the store issue** — this is what puts the work item on the board (there is no "mark ready in
   place" step; a store id is created fresh, never number-shared with the GitHub intake issue):
   `npx ztrack issue create --title "<refined title>" --state ready --assignee "<login>" --body-file "$BODY_MD"`.
   Capture the new id it prints (e.g. `COMBO-9`).
   **Guard: the minted id must match step 5's expectation.** If ztrack's own id differs from what
   `next-free-issue-id.mjs` named (e.g. ztrack minted `COMBO-9` but the helper said `COMBO-12` was next
   free), STOP before proceeding — this means ztrack just reused a dead id. Delete the just-minted store
   file (`ztrack issue delete <id>` if available, else remove `.volter/tracker/markdown/<id>.md` directly
   and do not commit it), then re-run `ztrack issue create` — ztrack's own allocator advances past whatever
   it just consumed, so a second attempt lands on the next candidate; re-check that one against
   `next-free-issue-id.mjs` too before proceeding. Never push a store file for an id with prior
   `agent/issue-<id>` PR history.
7. `npx ztrack check <new-id>` — must be green.
8. **git add/commit/PUSH the new store file to `main` immediately** — worktrees the PM later dispatches
   base off `origin/main`, so an unpushed store file is invisible to every future `develop`/`pm` worktree
   even though it exists in your own working copy:
   `git add .volter/tracker/markdown/<new-id>.md && git commit -m "chore: draft <new-id> from #$ZTRACK_ISSUE" && git push origin main`.
   **Verify the push landed — never report done on an unconfirmed write** (this is the store-native
   analogue of the old push-verify discipline: there, the risk was a `gh issue edit` silently not taking;
   here, it's a `git push` rejected by a protected `main` or a race with another commit).
   `git fetch origin main --quiet && git rev-parse origin/main` must now equal your local commit's sha
   (`git rev-parse HEAD`). If it doesn't — a rejected push, a fast-forward failure, branch protection
   blocking a direct push to `main` — do **not** proceed as if it succeeded:
   - If `main` requires PRs for every change (no direct-push exception for drafting), fall back to opening
     a small `draft/<new-id>` branch + PR carrying just the new store file, and say so in your outcome —
     the new issue is not dispatchable until that PR merges.
   - If it was a simple non-fast-forward (someone else pushed meanwhile), `git pull --rebase origin main`
     and retry the push once; if it fails again, stop and report the mismatch rather than silently retrying
     forever.
9. Close the GitHub intake issue with a comment naming the new store id, then close it:
   `gh issue comment "$ZTRACK_ISSUE" --body "tracked: <new-id>"`, `gh issue close "$ZTRACK_ISSUE"`.
10. If the request is too vague to shape into provable ACs, do NOT create a store issue: comment the
   specific questions on the GitHub intake issue and leave it open (no `needs-info` label exists in the
   store — the intake issue itself stays the parking spot until a human clarifies).

End with `OUTCOME: drafted <new-id>` (store issue is `ready`, has ACs, pushed to `main`, intake issue
closed) or `OUTCOME: blocked <reason>`.
