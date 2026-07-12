# Workflow Standard

Read this from the PM and Reviewer skills.

## The board is the committed store

Work items are **ztrack store issues** (identified by store id, e.g. `COMBO-9`), living in
`.volter/tracker/markdown/` — committed, un-gitignored, the single source of truth (see
`.volter/tracker-config.json`). State is the store's own `state` field — durable across stateless
runs. ztrack is both the **board** (`ztrack issue list`/`view`) and the acceptance **gate** on each
issue's content (the ACs + evidence in its body) — there is no separate GitHub-issue board to keep
in sync with it.

| State | How it is represented in the store |
|---|---|
| `draft` | store issue with `state: draft` (rare — draft mints straight to `ready`) |
| `ready` | store issue with `state: ready` + acceptance criteria in its body |
| in progress | store issue with `state: in-progress` (develop's first act) — or a `develop` run in flight (`runner.ts list develop`) |
| in review | store issue with `state: in-review` + a `PR:` line + an **open PR** on branch `agent/issue-<id>` (the substrate triggers the `reviewer` on it) |
| `done` | store issue with `state: done` (`ztrack check`'s `done_requires_merged_pr` requires the `PR:` to point at a merged commit) — landed via a `flip/<id>` bookkeeping PR, never a direct push to `main` (see "The done-flip" below) |
| parked | the `human-required` label on the store issue (waiting on a human) |

## The done-flip

`main` branch protection (`enforce_admins`, required `ci`+`security`+`agent-review`, no bypass) rejects
every direct push — including `github-actions[bot]`'s. So the `in-review` -> `done` flip (anchoring
`PR:<merge-sha>` once an `agent/issue-<id>` PR merges) is itself a PR, same as any other change:
`.github/workflows/flip-done.yml` (+ `scripts/flip-done.ts`) opens `flip/<id> -> main` on a merged agent
PR, computing the SAME `ztrack issue patch`/`ztrack issue edit --state done` a human would run. It is
auto-approved (`agent-review=success`) and auto-merged **only** after `scripts/check-flip-diff.ts`
mechanically verifies the diff touches exactly `.volter/tracker/markdown/<id>.md` and changes only
`state:`/`stateType:`/`PR:` — never an AC, never a second file. A diff that fails this check is left
unmerged and unreviewed, loudly (a workflow annotation), never silently approved or silently dropped.

**Branch-deletion invariant**: `agent/issue-<id>` must never be deleted while an issue's `PR:` still names
that branch (the value the develop skill writes at `in-review`, before the flip anchors the real merge
sha) — deleting it early would leave `ztrack check`'s `done_requires_merged_pr` / evidence-ancestry
resolution unable to find the ref it's citing. Once the flip PR lands and `PR:` points at the merge-commit
sha instead, the branch is safe to delete (the sha, not the branch name, is what's cited from then on).
This repo currently never deletes `agent/*` branches at all (`delete_branch_on_merge: false`
repo-wide) — if that is ever turned on, it must be sequenced strictly AFTER the flip, never on the
agent PR's own merge.

## Adding a new issue to the board

Board-add is store-native, full stop: `npx ztrack issue create --title "<title>" --state ready
--assignee "<login>" --body-file <file>` mints a brand-new store issue (never edits an existing store
file in place, never shares a number with the GitHub intake issue that prompted it), then `git add
.volter/tracker/markdown/<new-id>.md && git commit ... && git push origin main` lands it — see the
draft skill for the full procedure, including verifying the push actually landed (worktrees the PM
later dispatches base off `origin/main`, so an unpushed store file is invisible to them). There is no
separate document-source/sync step and no plan-doc reconciler: the committed store
(`.volter/tracker/markdown/`) is the record of truth, and the PR diff carries the evidence — Phase 1 of
the store-native refactor retired the old doc-source + gitignored-store + GitHub-body triad in favor of
this one committed store, and Phase 3 removed the band-aid scripts that existed only to reconcile that
older, multi-source-of-truth model.

## WIP

- **At most one develop in flight.** The PM reads `runner.ts list develop` + the open agent PRs and does
  not launch a second developer while one is running or an issue already has an open PR.
- PM is the only dispatcher — it launches `develop` (and `draft` on request) **by store id** (or, for
  `draft`, by the GitHub intake issue number); it does NOT dispatch review.
- The developer handles one issue, commits its implementation + its own store-file transitions on
  `agent/issue-<id>`, and stops; the substrate opens the auto-merging PR and triggers the independent
  `reviewer`.
- **Review is on the PR**: the `reviewer` posts the `agent-review` status. `ci` + `agent-review` green →
  native auto-merge lands it (done = merged PR, which the store's own `PR:` line then points at). Never
  an agent merge.
- **Rework**: a `changes-requested` review leaves the PR open with the failure noted (as a PR comment —
  there is no GitHub issue backing a store-native item); the PM re-launches develop for that issue's
  store id. The PM **caps rework at `max_develop_attempts`** (`.open-autonomy/autonomy.yml`,
  default **2**) by counting its own prior `oa-rework:` marker comments on the PR, and **escalates to
  `human-required`** at the cap instead of relaunching — so a permanently-failing issue can't loop and
  burn spend. Never loop.

## Gates

`develop` and `reviewer` run `ztrack check <store-id>` directly against the committed store — no
temp file, no fetch/push dance. The develop skill reads via `ztrack issue view`, writes via
`ztrack issue edit`/`ztrack ac patch`, and commits every store-file mutation onto its own
`agent/issue-<id>` branch (so the store file rides in the PR diff as the evidence-of-record). The
reviewer checks out the PR's own head and runs `ztrack check` against THAT commit's store file, never
against whatever `main` currently has. The reviewer cannot pass a red issue. Done is only reached
when the PR merges with all ACs passed-with-evidence and `ci` + `agent-review` both green.
