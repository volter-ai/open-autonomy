# Installing Open Autonomy — a guide for the installing agent

> **You are an agent installing Open Autonomy (OA) onto someone's repo for them.** This is a *guided*
> install: you do the work, but the human owns the judgment + irreversible calls. Follow the four phases —
> **detect** (read the repo, don't ask), **ask** (only the judgment calls, with defaults), **execute**
> (the deterministic overlay), **verify** (prove the loop merges before you call it done). Never enable
> auto-merge without a real CI gate; never leave the first runs unattended.
>
> This guide covers the **local runner + GitHub code host** setup (`simple-gh-sdlc` on `local`): the
> agents run on the human's machine via termfleet, and a change lands as an **auto-merging PR on GitHub**.
> For the other setups (fully hosted on GitHub Actions; fully local with no GitHub) see
> [`OPERATIONS.md`](./OPERATIONS.md#install--operate).

## The merge boundary, and what it does NOT give you on local

OA's design is *agent proposes, an independent reviewer blesses, no agent merges* — the merge boundary is
GitHub branch protection. **On the hosted (GitHub Actions) substrate that boundary is technically
enforced**: each agent job gets a *scoped* token (the proposer's omits `statuses`, the reviewer's omits
`contents`), so no single agent can both write code and post `agent-review`, and none can merge.

**On the local runner this enforcement does not exist.** The agents run as termfleet sessions using *your
own logged-in `gh`/git credentials* — typically a repo **admin** token, unscoped. That means, honestly:

- **There is no independent reviewer.** The developer and reviewer share one token; the developer *could*
  post its own `agent-review=success`. The capability split is real only with scoped tokens (hosted) or
  two distinct identities. On a single local token, `agent-review` is a self-check, not an independent gate.
- **Branch protection only binds the agents if you set `enforce_admins:true`** (this guide does). With it
  false, an agent running as admin could `gh pr merge --admin` or push to the branch and bypass the gate.

So on local, the things that *actually* protect the repo are, in order:

1. **Your real CI in the gate** — CI runs server-side on GitHub and the agents can't make failing tests
   pass, so it's the load-bearing control; **require a real CI check that runs on PRs** (not just
   `agent-review`). Caveat for full honesty: the shared token's `statuses:write` covers *any* context name,
   so a single local token could also post a fake `<your-ci>=success` status — GitHub generally prefers the
   real check-run, but the only *cryptographic* independence is scoped tokens (hosted) or a separate
   reviewer identity. On a single token, CI + supervision are strong, not airtight.
2. **`enforce_admins:true`** — so even the admin-identity agents go through the gate.
3. **Your supervision** — watch the first runs; you can stop the loop any tick.
4. **A trusted, private repo** — see the boundary on public repos below.

**Use local + GitHub for a repo you trust and supervise.** For a *technically enforced* boundary
(scoped tokens, true reviewer independence), use the hosted substrate, or give the reviewer a separate
bot identity. Be upfront with the human about this — do not claim "no agent can merge" on local.

---

## Phase 1 — DETECT (read the repo; do **not** ask)

Run from the repo root and record every answer — they parameterize everything and several are **stop
conditions**. Never ask the human for what you can read.

```bash
# Is this even a JS repo? (termfleet + ztrack are JS deps; a Go/Python repo has no package.json)
test -f package.json && echo "JS project" || echo "NO package.json — STOP (see below)"

# Package manager — use it for every install below (do NOT hardcode npm):
ls bun.lock 2>/dev/null && echo bun; ls pnpm-lock.yaml 2>/dev/null && echo pnpm; ls package-lock.json 2>/dev/null && echo npm

# Do you have admin? (branch protection requires it). Is it private? (a private repo on a FREE plan can't use
# classic branch protection — the Phase-3 PUT will 403; the install wires protection BEFORE auto-merge so that
# failure stops safely). `.owner.type` is account type, not plan — probe the plan separately (may be null if
# the token can't see it; treat unknown-private as "may fail, handle the 403"):
gh api "repos/{owner}/{repo}" --jq '{admin: .permissions.admin, private: .private, owner: .owner.login}'
gh api user --jq '.plan.name' 2>/dev/null   # or: gh api "orgs/<owner>" --jq '.plan.name' for an org repo

# The default branch (the merge target — never hardcode `main`):
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name

# THE CI CHECKS that gate PULL REQUESTS. This is the trickiest detect — getting it wrong DEADLOCKS every PR.
# NEVER read the default-branch push commit, and NEVER trust a MERGED PR's head check-runs: a merged head
# carries BOTH its pull_request run AND its push run, so push-only jobs (e.g. `if: github.event_name=='push'`
# Deploy/Health-Check) contaminate the list. Two reliable sources:
#   (a) best — an OPEN PR (head not yet on the default branch): its check-runs are exactly the PR gate:
PR=$(gh pr list --state open --limit 1 --json number --jq '.[0].number')
[ -n "$PR" ] && gh api "repos/{owner}/{repo}/commits/$(gh pr view $PR --json headRefOid --jq .headRefOid)/check-runs" \
  --jq '[.check_runs[].name] | unique'
#   (b) no open PR — read the workflows triggered `on: pull_request` and take each job's check name (its
#       `name:` if set, else the job id), EXCLUDING any job that may SKIP on a normal PR: gated `if:` on
#       `github.event_name == 'push'/'release'`, on `vars.*`/`secrets.*`/an environment, or behind a
#       `paths:` filter. These are CANDIDATE contexts — confirm at ask #1, since without an actual PR run
#       the exact names are a best-guess (matrix jobs add `(value)` suffixes):
grep -rl 'pull_request' .github/workflows/ 2>/dev/null   # then read each: drop push-only/path-filtered jobs
#   STOP CONDITION: if neither an OPEN PR nor any `pull_request`-triggered workflow exists, there is NO PR CI.

# Visibility + existing posture (affects the public-repo boundary + whether OA's dependabot/security add value):
gh repo view --json visibility --jq .visibility
ls .github/dependabot.yml .github/workflows/ 2>/dev/null | grep -iE 'dependabot|security|codeql'
```

**Stop conditions to surface at the first ask (do not silently proceed):**
- **No `package.json`** → OA's runner needs JS deps; this repo can't host it as-is. Stop.
- **No PR CI at all** (no PR to observe *and* no `pull_request`-triggered workflow) → the gate would be
  `agent-review`-only, which on local is self-blessing. **Do not enable auto-merge.** Tell the human they
  need a real CI check (offer to help add one) first. (CI exists but no PR yet → not a stop; read the
  candidate check names from the `pull_request` workflows and confirm them at ask #1.)
- **Not admin**, or **private repo on a free plan** → you cannot set classic branch protection. Stop and
  tell the human (an org owner must do it, or use repo **rulesets** / upgrade the plan).
- **Public repo** → see the boundary below; default to *not* installing unless issue authorship is
  restricted to maintainers.

Then **find a candidate first issue**: read the repo (README, open issues, a small obvious gap) and pick
the *smallest, lowest-blast-radius, well-scoped* change — a validation tweak, an error message, a tiny
helper. You'll propose it at an ask-point.

---

## Phase 2 — ASK (only judgment / preference / irreversible — give a default each)

Ask as one batch, each with your recommended default. **If a Phase-1 stop condition fired, lead with it —
it gates everything.**

1. **The merge gate (safety-critical) — and what it does *not* enforce on local.** "Your `<default-branch>`
   will require **`<pr-ci-checks>` + `agent-review`** with **`enforce_admins:true`** and native auto-merge.
   **No human review is required to merge** (`required_pull_request_reviews: null`), and on the local
   runner the agents share your token so `agent-review` is *not* an independent reviewer — your **CI is the
   real gate**. Confirm these are the right required checks, and that you accept CI-as-the-gate without a
   required human approval?" *Default:* your detected PR checks + `agent-review`. **If no real CI check
   exists, do not proceed to auto-merge** (Phase-1 stop).
2. **Continuous, uncapped spend.** "This runs on your machine and bills **your** model provider every tick
   with **no OA spend cap**. The throttle is the tick interval (default `*/15`) and WIP=1. OK to run, and
   at what interval/WIP?" *Default:* `*/15`, WIP 1 — surfaced now, not buried.
3. **The harness lives in the repo (committed).** "OA adds ~40 files (`scripts/`, `.claude/`, `.codex/`,
   `scheduler/`, `standards/`, `.open-autonomy/`, `.github/workflows/merge.yml`) and **commits them to
   `<default-branch>`** — the agents run in git worktrees, which only see committed files (this is how OA
   maintains itself). OK?" *Default:* yes (the only supported model; a clean/symlinked mode is not built).
   If they refuse, stop.
4. **OA's Dependabot + Security workflows (net-new CI surface).** "OA also ships `.github/dependabot.yml`
   (weekly Actions-bumps → PRs the PM triages) and `.github/workflows/security.yml` (a **bun**-based
   supply-chain + workflow scan that runs on your PRs and `<default-branch>`). On a non-bun repo the
   security workflow can red your CI. Keep them, or skip?" *Default:* **skip both** unless the repo is bun
   and wants them (always keep `merge.yml` — the auto-merge reconcile).
5. **Identity.** "Run under your own token (simplest, but no reviewer independence — see the gate note), or
   wire a separate bot identity for real independence?" *Default:* bot identity if available; else your
   token, **flagged** that the reviewer isn't independent.
6. **The first issue.** "I'll start with: *'<the candidate you found>'* — good first issue?" *Default:*
   your candidate.

---

## Phase 3 — EXECUTE (only after the confirmations)

Use the **detected** package manager (examples show `npm`; for bun use `bun add` / `bun add -d`). Run from
the repo root. **Order matters: commit the harness first, wire the gate last.**

```bash
# 1. Runner deps IN this repo (use the detected PM — do NOT npm-install into a bun/pnpm repo):
npm install termfleet            # or: bun add termfleet
npm install -D ztrack            # or: bun add -d ztrack    (a PROJECT dep so its preset resolves)

# 2. The overlay — additive; generates NO package.json/README/.gitignore over the repo:
npx open-autonomy compile simple-gh-sdlc local .

# 3. The tracker, linked to GitHub Issues (writes .volter/ config, committed with the harness):
npx ztrack init --preset simple-gh-sdlc --sync github --repo <owner>/<repo>

# 4. (Phase-2 #4) if skipping OA's net-new CI surface:
#    rm -f .github/dependabot.yml .github/workflows/security.yml

# 5. Commit the harness (Phase-2 #3) to the STILL-UNPROTECTED branch. Keep runtime scratch out:
printf '\n# open-autonomy runtime\n.worktrees/\n.open-autonomy/runner-state/\n' >> .gitignore
git add -A && git commit -m "chore: install open-autonomy (simple-gh-sdlc, local runner)"
git push

# 6. NOW wire the gate (Phase-2 #1). Set BRANCH PROTECTION FIRST, verify it took, THEN enable auto-merge —
#    so a failed protection PUT (e.g. private repo on a free plan: 403) never leaves auto-merge on WITHOUT a
#    gate. Fill contexts with your detected PR checks + agent-review; DO NOT leave a <...> placeholder literal
#    (a context that never reports DEADLOCKS every PR). e.g. contexts: ["build","acceptance","agent-review"]
gh api -X PUT "repos/<owner>/<repo>/branches/<default-branch>/protection" --input - <<JSON
{ "required_status_checks": { "strict": false, "contexts": ["<pr-ci-check-1>", "agent-review"] },
  "enforce_admins": true, "required_pull_request_reviews": null, "restrictions": null }
JSON
# verify protection is in place (non-empty contexts) BEFORE enabling auto-merge — if this errors, STOP:
gh api "repos/<owner>/<repo>/branches/<default-branch>/protection/required_status_checks/contexts" --jq '.'
gh repo edit <owner>/<repo> --enable-auto-merge

# 7. Start termfleet + sign in to the coding CLI BEFORE running the loop (verify a session can launch):
npx termfleet console serve --name dev --port 7373 &
npx termfleet provider serve --kind virtual-tmux --prefix dev --count 1 --port 7402 &
#   claude → /login    then sanity-check:  npx termfleet claude new --prompt "say hi"
```

Then author + file the **first issue** (Phase-2 #6). The assignee comes from the `--assignee` flag (the
stored column — the `Assignee:` body line below is human-readable but inert), and the body needs a
`## Acceptance Criteria` block with at least one AC so `ztrack check` passes; the PM keys on the `ready` label:

```bash
cat > issue.md <<'MD'
Assignee: <login>

<one-line summary of the change>

## Acceptance Criteria
- [ ] dev/01 v1 <one observable, testable outcome>
  - status: pending
MD
npx ztrack issue create --title "<first issue>" --body-file issue.md --state ready --assignee <login>
npx ztrack sync github
gh label create ready -R <owner>/<repo> --color 0e8a16 2>/dev/null
gh issue edit <n> -R <owner>/<repo> --add-label ready
```

> **Point of no return.** The gate is now live: the next green PR **auto-merges into `<default-branch>`
> with no human approval**. Watch the first one to completion (Phase 4) before walking away.

---

## Phase 4 — VERIFY (the install is not done until the loop merges)

Start the loop and **watch one trivial issue all the way to a merged PR**. Asserting "installed" without
this is the most common way a guided install silently ships broken.

```bash
node scheduler/run.mjs &        # the loop: each tick the PM sweeps the board + launches workers
```

Poll the cycle (~every 20s; longer if the repo's CI is slow):

```bash
gh pr list -R <owner>/<repo> --state all --json number,headRefName,state   # exactly ONE PR on agent/issue-<n>
gh api repos/<owner>/<repo>/commits/agent/issue-<n>/status \
  --jq '.statuses[]|select(.context=="agent-review")|.state'               # the reviewer's verdict
npx termfleet sessions recent --live                                       # the live agent sessions
```

**Done looks like:** PM → developer in an isolated worktree → committed on `agent/issue-<n>` → **one** PR
→ `agent-review=success` → **your CI green** → native auto-merge landed it → the issue closed (a
`merge.yml` reconcile closes it if the `Closes #n` keyword lags). One PR, merged, issue closed, your tests
green. That is a proven install.

---

## Failure modes (what you'll actually hit)

- **`createAgentWindow returned no terminalId` / a launch times out** — termfleet console/provider aren't
  running or the coding CLI isn't signed in. Re-run `npx termfleet claude new --prompt hi` in isolation.
- **A PR opens but never merges** — branch protection requires a check that isn't posted on PRs. Confirm
  the required `contexts` are the **exact** check-run names that run on a *pull request* (re-read from *this
  open PR's* check-runs — never a merged PR, whose head also carries push-run checks), with no leftover
  `<...>` placeholder and no release-only (`publish`/`deploy`), push-only (`Deploy`, `Health Check`), or
  path-filtered check.
- **The loop does nothing each tick** — no eligible work: issue open + `ready` + assigned + `npx ztrack
  check` green on its body.
- **Slow/flaky CI** — auto-merge *waits* for required checks; a 30-min suite means a 30-min verify loop, a
  flaky required check leaves PRs un-merged. Set expectations; don't poll at 20s on a slow suite.
- **Spend** — no OA cap on local; watch `termfleet sessions recent --live`, stop the loop to bound it.

---

## Boundaries (uphold these; they are the point)

- **Never enable auto-merge without a real PR-gating CI check.** On local the reviewer is not independent;
  CI is the gate. No CI → no auto-merge.
- **`enforce_admins:true`** — so the gate binds the admin-identity agents. Don't ship it false on local.
- **Do not install on a public repo where outside contributors can open issues/comments** that reach the
  agents. The developer implements issue text and the reviewer reads PR/issue/comment text; a prompt
  injection runs with the user's full token (push, secrets, malicious PRs). Restrict the PM to
  maintainer-authored/labeled issues, or use the hosted scoped-token substrate.
- **Verify before declaring done** (Phase 4). A green compile is not a working install.
- **Supervise the first runs.** Hand off to autonomous operation only once you've watched it merge clean.
- **Be honest about the boundary** (the safety section): local + your token is supervised-and-CI-gated, not
  a technically-enforced "no agent can merge." Say so.

> This guide is the agent-executable companion to [`OPERATIONS.md`](./OPERATIONS.md) (the human reference).
> It can graduate into a published OA skill (`install`) so a fleet can onboard the next repo itself.
