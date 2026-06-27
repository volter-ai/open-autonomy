# Installing Open Autonomy — a guide for the installing agent

> **You are an agent installing Open Autonomy (OA) onto someone's repo for them.** This is a *guided*
> install: you do the work, but the human owns a handful of judgment + irreversible calls. Follow the
> four phases below in order — **detect** (read the repo, don't ask), **ask** (only the judgment calls,
> with defaults), **execute** (the deterministic overlay), **verify** (prove the loop merges before you
> call it done). Never skip the gate; never leave the first runs unattended.
>
> This guide covers the **local runner + GitHub code host** setup (`simple-gh-sdlc` on `local`): the
> agents run on the human's machine via termfleet, and a change lands as an **auto-merging PR on GitHub**.
> For the other setups (fully hosted on GitHub Actions; fully local with no GitHub), see
> [`OPERATIONS.md`](./OPERATIONS.md#install--operate) — the model and the prerequisites are the same; only
> the runner/code-host wiring differs.

## The one thing that makes this safe

You are about to wire **native auto-merge** on a real repo. The agents can *propose* and the reviewer can
*bless*, but **no agent ever merges** — the merge boundary is **GitHub branch protection**: a PR lands
only when the repo's **real CI checks** *and* the independent **`agent-review`** status are all green.
So the single rule you must never break:

- **Require the repo's real CI in branch protection — not just `agent-review`.** With only `agent-review`
  required, you would be auto-merging on the reviewer agent's say-so alone. The human's tests are the
  safety net; keep them in the gate.

And two more you hold the human to:

- **First runs are supervised, not fire-and-forget.** Watch the first few issues all the way to merge.
- **Identity:** for the *agent proposes / human approves* boundary to be real, the agents should act as a
  **bot identity** (a GitHub App / dedicated account) distinct from the human maintainer. GitHub forbids a
  user approving their own PR, so a single shared identity collapses the human-approval gate. (Fine to
  start under the human's token for an unsupervised-merge profile like `simple-gh-sdlc`, which gates on
  `ci + agent-review`, not human approval — but flag it.)

---

## Phase 1 — DETECT (read the repo; do **not** ask)

Run these from the repo root and record the answers — they parameterize everything later. Never ask the
human for something you can read.

```bash
# package manager (the runner's deps go here)
ls bun.lock pnpm-lock.yaml package-lock.json 2>/dev/null   # → bun | pnpm | npm

# the repo's own test/build commands (context for the first issue + sanity)
node -p "Object.entries(require('./package.json').scripts||{}).map(([k,v])=>k+': '+v).join('\n')" 2>/dev/null

# the default branch (the merge target)
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name

# the CI CHECK NAMES branch protection must require — read the actual check-run names
# from a recent commit on the default branch (NOT the workflow filename):
gh api "repos/{owner}/{repo}/commits/$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)/check-runs" \
  --jq '[.check_runs[].name] | unique | join(", ")'

# public/private (affects whether dependabot/codeql add value)
gh repo view --json visibility --jq .visibility

# existing posture you must NOT clobber or duplicate
ls .github/dependabot.yml 2>/dev/null && echo "has dependabot"
ls .github/workflows/ 2>/dev/null | grep -iE 'security|codeql' && echo "has security/codeql"
```

> **Reading CI check names is the step people get wrong.** The required-status-check *context* is the
> check-run **name** (e.g. `build`, `acceptance`, `test`), which is often *not* the workflow filename
> (`ci.yml`). Always read it from `check-runs`, and **exclude release-only checks** (a `publish` / `deploy`
> check that runs on tags, not PRs) — requiring one would deadlock every PR.

Then **find a candidate first issue**: read the repo (README, open issues, TODOs, a small obvious gap) and
pick the *smallest, lowest-blast-radius, well-scoped* change you can — a validation tweak, an error
message, a tiny helper, a doc/flag. You'll propose it at an ask-point, not invent busywork.

---

## Phase 2 — ASK (only judgment / preference / irreversible — give a default each)

Ask these as a single batch, each with your recommended default. These are the human's calls:

1. **The merge gate (safety-critical).** "Your `main` will require **`<ci-checks-from-detect>` + `agent-review`**
   before a PR can merge, with native auto-merge on. Confirm these are the right required checks?"
   *Default:* the PR-relevant CI checks you detected, plus `agent-review`.
2. **The harness lives in the repo.** "OA adds ~40 files (`scripts/`, `.claude/skills/`, `.codex/skills/`,
   `scheduler/`, `standards/`, `.open-autonomy/`, `.github/workflows/merge.yml`) and **commits them to
   `main`**. The agents run in git worktrees, which only see committed files — this is how OA maintains
   itself, too. Think of it as autonomy infrastructure (like your CI config). OK to commit it?"
   *Default:* yes (it's the only supported model today; a gitignored/symlinked 'clean' mode is not built).
   If they refuse, stop — OA can't run on this repo without it.
3. **Redundant code-host resources.** Only if detect found existing dependabot/security: "You already have
   `<dependabot/codeql>` — skip OA's so it doesn't duplicate or open dep-bump PRs the PM then triages?"
   *Default:* skip OA's; always keep `merge.yml` (the auto-merge reconcile — essential).
4. **Identity.** "Run the agents under your token for now, or wire a bot identity (GitHub App / dedicated
   account)?" *Default:* bot identity if available; otherwise the token, **flagged** (see the safety rule).
5. **Turn on the gate now?** "Enable auto-merge + branch protection on `main` now (irreversible-ish, but
   reversible)?" *Default:* yes — but only after they've confirmed #1.
6. **The first issue.** "I'll start with: *'<the candidate you found>'* — good first issue?"
   *Default:* your candidate; let them substitute.

---

## Phase 3 — EXECUTE (only after the confirmations)

Use the detected package manager throughout (examples show `npm`). Run from the repo root. **Order
matters: lay down + commit the harness first, wire the gate last** (so the harness commit lands on an
unprotected branch).

```bash
# 1. Prereqs the runner needs IN this repo (the deps the overlay can't ship — see OPERATIONS step 1):
npm install termfleet            # the local runner drives termfleet via its SDK
npm install -D ztrack            # the tracker; a PROJECT dep so its preset resolves (a global install fails check)

# 2. The overlay — additive; generates NO package.json/README/.gitignore over the repo:
npx open-autonomy compile simple-gh-sdlc local .

# 3. The tracker, linked to GitHub Issues (GitHub is the source of truth). Writes .volter/ config:
npx ztrack init --preset simple-gh-sdlc --sync github --repo <owner>/<repo>

# 4. (If Phase-2 #3 said skip) remove OA's redundant code-host resources before committing:
#    rm -f .github/dependabot.yml .github/workflows/security.yml

# 5. Commit the harness (Phase-2 #2) to the still-unprotected branch. Keep runtime scratch out:
printf '\n# open-autonomy runtime\n.worktrees/\n.open-autonomy/runner-state/\n' >> .gitignore
git add -A && git commit -m "chore: install open-autonomy (simple-gh-sdlc, local runner)"
git push

# 6. NOW wire the merge gate (Phase-2 #1 + #5): require the REAL CI checks + agent-review, enable auto-merge.
#    Fill contexts with your detected PR checks + agent-review, e.g. ["build","acceptance","agent-review"]:
gh repo edit <owner>/<repo> --enable-auto-merge
gh api -X PUT "repos/<owner>/<repo>/branches/<default-branch>/protection" --input - <<JSON
{ "required_status_checks": { "strict": false, "contexts": ["<ci-check-1>", "<ci-check-2>", "agent-review"] },
  "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null }
JSON

# 7. Start termfleet (console + a local provider) + sign in to the coding CLI (see OPERATIONS step 1-2):
npx termfleet console serve --name dev --port 7373 &
npx termfleet provider serve --kind virtual-tmux --prefix dev --count 1 --port 7402 &
#   claude  → /login   (the agents use the human's own logged-in CLI for model access)
```

Then add the **first issue** (Phase-2 #6) — a Ready GitHub issue with ACs in the body, an assignee, and
the `ready` label (the PM keys on `ready`):

```bash
npx ztrack issue create --title "<first issue>" --body-file issue.md --state ready --assignee <login>
# issue.md must include a top "Assignee: <login>" line + a "## Acceptance Criteria" block; then:
npx ztrack sync github
gh label create ready -R <owner>/<repo> --color 0e8a16 2>/dev/null
gh issue edit <n> -R <owner>/<repo> --add-label ready
```

---

## Phase 4 — VERIFY (the install is not done until the loop merges)

Start the loop and **watch one trivial issue all the way to a merged PR**. Asserting "installed" without
this is the single most common way a guided install silently ships broken.

```bash
node scheduler/run.mjs &        # the loop: each tick the PM sweeps the board + launches workers
```

Watch the cycle (poll every ~20s):

```bash
gh issue list -R <owner>/<repo> --state open --json number,labels         # the board
gh pr list -R <owner>/<repo> --state all --json number,headRefName,state  # the PR (exactly ONE on agent/issue-<n>)
gh api repos/<owner>/<repo>/commits/agent/issue-<n>/status \
  --jq '.statuses[]|select(.context=="agent-review")|.state'              # the reviewer's verdict
npx termfleet sessions recent --live                                      # the live agent sessions
```

**Done looks like:** the PM launched the developer in an isolated worktree → the developer committed on
`agent/issue-<n>` → the runner opened **one** PR → the reviewer posted `agent-review=success` → your CI
went green → **native auto-merge landed it** → the issue closed (a `merge.yml` reconcile closes it if the
`Closes #n` keyword lags). One PR, merged, issue closed, your tests green. That is a proven install.

---

## Failure modes (what you'll actually hit, and how to read them)

- **`createAgentWindow returned no terminalId` / a launch times out** — termfleet console/provider aren't
  running or the coding CLI isn't signed in. Re-run the `npx termfleet claude new --prompt hi` sanity check
  in isolation. (The runner waits ~120s for a cold agent start; a missing CLI fails fast.)
- **A PR opens but never merges** — branch protection requires a check that isn't being posted. Re-check
  the required `contexts` are the **exact** check-run names from Phase 1 and that none is a release-only
  (`publish`/`deploy`) check. The reviewer posts `agent-review` itself; CI is the repo's own.
- **Two PRs for one issue** — should not happen (the runner dedups per-issue and `agent-propose` refuses a
  branch that already has a merged PR), but if you tuned the tick very fast, slow it
  (`scheduler/schedule.json` → `intervalSeconds`).
- **The loop does nothing each tick** — no eligible work: confirm the issue is open, `ready`-labeled,
  assigned, and `npx ztrack check` passes on its body.
- **Spend** — the local runner has no open-autonomy spend cap; the human's model provider bills them. Watch
  `termfleet sessions recent --live`; stop the loop (`Ctrl-C` / kill the agents) to bound it.

---

## Boundaries (uphold these; they are the point)

- **Never merge, and never require less than the human's real CI + `agent-review` in branch protection.**
- **Never approve a PR you (the agent) opened** — that's the identity boundary; it needs the human or a
  distinct maintainer identity.
- **Verify before declaring done** (Phase 4). A green compile is not a working install.
- **Supervise the first runs.** Hand off to autonomous operation only once you've watched it merge clean.

> This guide is the agent-executable companion to [`OPERATIONS.md`](./OPERATIONS.md) (the human reference).
> It can graduate into a published OA skill (`install`) so a fleet can onboard the next repo itself — the
> detect/ask/execute/verify spine is the same.
