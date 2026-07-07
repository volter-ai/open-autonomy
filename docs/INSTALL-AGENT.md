# Installing Open Autonomy — a guide for the installing agent

> Documentation for **open-autonomy v0.4** — the doc-version marker (machine-checked by
> `bun run check:release-consistency`). npm `0.4.0`/`0.4.1` are known-broken on `compile` (OA-01/F-1);
> install `0.4.2+` once published. Older docs: read them at their version tag, e.g. `blob/v0.4.0/`.

> **You are an agent installing Open Autonomy (OA) onto someone's repo for them.** This is a *guided*
> install: you do the work, but the human owns the judgment + irreversible calls. Follow the phases —
> **preflight** (tools + auth), then **detect** (read the repo, don't ask), **ask** (only the judgment calls,
> with defaults), **execute** (the deterministic overlay), **verify** (prove the loop merges before you call
> it done). Never enable auto-merge without a real CI gate; never leave the first runs unattended.
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

## Phase 0 — PREFLIGHT (tools + auth; stop if any fails)

**Run the snippets under `bash`** (macOS defaults to zsh, where the heredocs/globs behave differently).
Confirm the toolchain + auth before touching the repo (the tools below are required; `jq` is not):

```bash
for t in bash node git gh curl tmux; do command -v "$t" >/dev/null || echo "MISSING (required): $t"; done
command -v jq >/dev/null || echo "note: jq not found (optional — the guide avoids it)"
node -e 'const[a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || echo "Node >= 22.18 required (the installed ztrack validation preset is .mts → needs TS type-stripping)"
gh auth status || echo "gh not authenticated"
claude auth status --json 2>/dev/null | grep -Eq '"loggedIn"[[:space:]]*:[[:space:]]*true' || test -n "$ANTHROPIC_API_KEY" \
  || echo "claude not signed in — run: claude, then /login (or set ANTHROPIC_API_KEY); TERMFLEET_AGENT=codex? verify with: codex login status"
```

- **`node` ≥ 22.18** — the `ztrack` preset this install commits is `.mts` (loaded via Node type-stripping);
  older Node cannot load it. `git`, `gh`, `curl`, **`tmux`** (termfleet's local provider runs sessions in
  tmux) must be on PATH. `jq` is optional (the guide avoids it).
- **`gh` authenticated as an ADMIN of the repo** with `repo` scope — branch protection needs
  `administration:write` and the agents post commit statuses; a logged-in-but-under-scoped token 403s the
  same as a non-admin (see Phase-3 step 6).
- **A coding CLI (Claude Code / Codex) installed and signed in** — the agents' model access (the loop
  launches `claude` by default; `claude` then `/login`). Verify with `claude auth status --json` (the
  snippet above) — **never** the bare `--version` flag, which exits `0` identically whether signed in or
  not and would let a logged-out box pass this gate, only to fail ~45s into the loop's first real launch.
  For `TERMFLEET_AGENT=codex`, the analogous probe is `codex login status` (not independently verified
  against a pinned codex CLI here — confirm with `codex login --help` if your CLI reports differently).
- **npm registry reachable** — `npx open-autonomy|ztrack|termfleet` fetch from it (an air-gapped/proxied box
  needs them pre-installed). The guide uses `npx --yes` so a cold box doesn't hang on an install prompt.

---

## Phase 1 — DETECT (read the repo; do **not** ask)

Run from the repo root and record every answer — they parameterize everything and several are **stop
conditions**. Never ask the human for what you can read.

```bash
# Is this even a JS repo? (termfleet + ztrack are JS deps; a Go/Python repo has no package.json)
test -f package.json && echo "JS project" || echo "NO package.json — STOP (see below)"

# Package manager — use it for every install below (do NOT hardcode npm):
ls bun.lock 2>/dev/null && echo bun; ls pnpm-lock.yaml 2>/dev/null && echo pnpm; ls package-lock.json 2>/dev/null && echo npm

# npm WORKSPACES + name collisions — a workspace member (or the root package itself) named termfleet,
# @termfleet/core, ztrack, open-autonomy, or anything in termfleet's own dependency tree (e.g. ws) will
# shadow (workspace link) or self-reference (Node ESM self-reference on the root name) the runner's real
# published dependency once installed — a silent, several-process-hops-deep failure with no supported npm
# override. Cross-check every declared member's name against the root's own name and against the direct
# set above BEFORE `npm install termfleet`; `open-autonomy preflight` / `compile` also detect this (see
# docs/adoption-fixes/OA-04-workspace-name-collision-detection.md), but catching it here means you can flag
# it to the human before spending an install cycle on it:
node -e "const p=require('./package.json'); console.log('workspaces:', JSON.stringify(p.workspaces||'(none)'))"

# Do you have admin? (branch protection requires it). Is it private? (a private repo on a FREE plan can't use
# classic branch protection — the Phase-3 PUT will 403; the install wires protection BEFORE auto-merge so that
# failure stops safely). `.owner.type` is account type, not plan — probe the plan separately (may be null if
# the token can't see it; treat unknown-private as "may fail, handle the 403"):
gh api "repos/{owner}/{repo}" --jq '{admin: .permissions.admin, private: .private, owner: .owner.login}'
gh api user --jq '.plan.name' 2>/dev/null   # or: gh api "orgs/<owner>" --jq '.plan.name' for an org repo

# The HUMAN's login (the issue assignee + the `Assignee:` body line the developer's loose-file `ztrack check`
# reads). NOT the repo owner — on an ORG repo `owner` is the org, which is not an assignable user:
gh api user --jq .login

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
   will require **`<pr-ci-checks>` + `agent-review`** with **`enforce_admins:true`**; once you've watched one
   PR merge under supervision, native auto-merge is armed so green PRs land without you.
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
   - **`.claude/settings.json` specifically wires a Claude Code Stop hook that fires at the end of EVERY
     Claude Code session in this repo — including the human's own interactive sessions**, not just the
     loop's (it self-guards, no-op unless `node_modules/ztrack/...` exists). If an existing
     `.claude/settings.json` is present, `compile` merges the hook into it rather than overwriting (keeps
     the human's own `permissions`/hooks); if it isn't valid JSON, `compile` refuses by name instead —
     hand-merge it. The hook is **install-managed**: deleting the entry is re-added by the next
     compile/upgrade, so a human who wants it gone must set the durable sentinel
     `"_openAutonomyStopHookOptOut": true` in their settings.json (compile AND upgrade honor it). Full
     detail: `docs/OPERATIONS.md#claude-settings`.
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
#    NODE_ENV=production / npm omit=dev makes the -D install a silent no-op (exits 0, installs nothing) —
#    use: npm install -D ztrack --include=dev (works on every omit source; NODE_ENV=development only helps
#    when NODE_ENV is the cause, not an .npmrc omit=dev / npm_config_omit / legacy production=true)
#    Then make the environment install-ready — `preflight` does this STRUCTURALLY so you never hit the
#    install-time gotchas: it verifies termfleet's PTY native module loads (rebuilding only if needed —
#    the provider can't start otherwise), and verifies `npm ci` under the repo's *CI Node version* —
#    regenerating package-lock.json if adding the deps desynced it (which `npm run build` won't catch
#    locally, but the first agent PR's CI would). If it regenerates the lock, commit it (step 5 stages it).
#    `preflight` (below) also now checks for this NODE_ENV/omit condition mechanically.
#
#    npm can rewrite EXISTING dependency ranges while adding these deps (it re-resolves the tree, and
#    may re-save ranges for pre-existing direct deps it re-places — tree-shape/npm-version dependent).
#    Inspect what the installs changed beyond adding termfleet/ztrack, and REPORT any changed
#    pre-existing pin to the human (Phase-2 style confirmation) — do not silently commit it:
git diff package.json
npx --yes open-autonomy preflight

# 2. The overlay — additive; generates NO package.json/README/.gitignore over the repo (`--yes` so a cold
#    box doesn't hang on npx's install prompt — open-autonomy isn't a local dep):
npx --yes open-autonomy compile simple-gh-sdlc local .

# 3. The tracker, linked to GitHub Issues (writes .volter/ config, committed with the harness):
npx ztrack init --preset simple-gh-sdlc --sync github --repo <owner>/<repo>

# 4. (Phase-2 #4) if skipping OA's net-new CI surface:
#    rm -f .github/dependabot.yml .github/workflows/security.yml

# 5. Commit the harness (Phase-2 #3) to the STILL-UNPROTECTED branch. This is the canonical commit step —
#    docs/OPERATIONS.md#4-commit-the-harness (WHY: worktrees only see committed files; the generated.json
#    manifest is the authoritative file list) — PLUS these agent-specific deltas an unattended install needs:
#    also stage .volter/ (the tracker config from step 3), .github/, and the lockfiles; keep runtime scratch
#    out (guard the .gitignore append so a re-run doesn't duplicate it); and `git push` (GitHub code host).
#    Stage the overlay paths EXPLICITLY — never `git add -A` (it
#    would sweep unrelated/secret files in the human's dirty tree onto the default branch) and never a glob
#    like `*.lock*` (zsh aborts the whole `git add` on no-match; it also misses `package-lock.json`). Add only
#    paths that exist, then HARD-STOP if nothing staged (a silent empty commit = a no-op install). Before
#    committing, diff the staged manifest (below): if it shows changes to pins that existed before the
#    install, call them out in your report — the commit message says "install open-autonomy", and a range
#    bump is not that:
grep -q 'worktrees/' .gitignore || printf '\n# open-autonomy runtime\n.worktrees/\n.open-autonomy/runner-state/\n' >> .gitignore
for p in .claude .codex .github scheduler scripts standards .open-autonomy .volter .gitignore \
         package.json package-lock.json pnpm-lock.yaml bun.lock yarn.lock; do [ -e "$p" ] && git add "$p"; done
# HARD-STOP unless an actual harness path staged (a lone .gitignore change ≠ a real install — `compile` failed):
git diff --cached --name-only | grep -qE '^(scripts/|\.open-autonomy/|\.claude/)' \
  || { echo "ABORT: harness not staged — did 'compile' run in this repo?"; exit 1; }
git diff --cached package.json   # surface dep-range changes to the human before committing
git commit -m "chore: install open-autonomy (simple-gh-sdlc, local runner)"
git push
# The overlay commits OA's own bun-targeted TS (scripts/*.ts). If the repo's CI lints/typechecks/tests the
# WHOLE tree, it may now go red on those files (Bun globals, different tsconfig) — and that same CI is your
# required gate, so the first PR would deadlock. After the push, CONFIRM the default-branch CI is green; if
# not, exclude `scripts/ scheduler/ .open-autonomy/` from the repo's lint/tsc/test config, or don't arm the gate.

# 6. Set BRANCH PROTECTION (the gate). NOT auto-merge yet — that goes on in Phase 4 after you've watched one
#    PR merge. Build the contexts in a SHELL VARIABLE and VALIDATE+PUT in ONE block, so a failed check aborts
#    BEFORE the PUT (run as one unit — don't split the validate and the PUT into separate shell calls): a
#    literal "<pr-ci-check-1>" is a non-empty context that never reports and DEADLOCKS every PR; contexts of
#    just ["agent-review"] is the forbidden no-CI gate (on local the reviewer self-blesses). Uses only
#    tr/grep (no jq dependency).
CHECKS='["build","acceptance","agent-review"]'   # <- your detected PR-CI check names + agent-review
{
  case "$CHECKS" in *'<'*) echo "ABORT: unfilled <...> placeholder in contexts"; exit 1;; esac
  real=$(printf '%s' "$CHECKS" | tr -d '[]" ' | tr ',' '\n' | grep -vx 'agent-review' | grep -vx '')
  [ -z "$real" ] && { echo "ABORT: no real CI check (agent-review alone is not a gate on local)"; exit 1; }
  gh api -X PUT "repos/<owner>/<repo>/branches/<default-branch>/protection" --input - <<JSON
{ "required_status_checks": { "strict": false, "contexts": $CHECKS },
  "enforce_admins": true, "required_pull_request_reviews": null, "restrictions": null }
JSON
}
# confirm protection took (errors on a free private plan / non-admin / under-scoped token → STOP, tell human):
gh api "repos/<owner>/<repo>/branches/<default-branch>/protection/required_status_checks/contexts" --jq '.'

# 7. Start termfleet + sign in to the coding CLI BEFORE running the loop. The canonical console + provider
#    recipe (the exact `npx termfleet console serve` / `provider serve` commands, the repo-unique
#    prefix/port choice, the /healthz body-shape probe) is docs/OPERATIONS.md#2-start-termfleet-console--a-local-provider
#    — run those two commands now, with these agent-specific deltas on top:
#    - On a shared/lived-in box, NEVER attach to a console/provider this install did not start — a
#      termfleet provider can launch terminal sessions as the HUMAN's user, box-wide. Re-use is defensible
#      ONLY on a single-user box where this install started that provider itself — and even then, still
#      pin (auto-discovery / a stray `termfleet use` can still drift).
#    - Treat an already-answering port as a hard ABORT, not a human eyeball judgment call: the /healthz
#      probe only tells you WHETHER something answers, never that it's YOURS; Phase 4's `doctor --json` is
#      the identity check.
TF_PREFIX="$(basename "$PWD")-oa"; TF_CONSOLE=7573; TF_PROVIDER=7602   # repo-unique — NOT the box defaults 7373/7402
curl -sS "http://127.0.0.1:$TF_CONSOLE/healthz" 2>/dev/null | grep -q '"ok":true' \
  && { echo "ABORT: port $TF_CONSOLE already answers — pick a different --port for $TF_PREFIX"; exit 1; }
curl -sS "http://127.0.0.1:$TF_PROVIDER/healthz" 2>/dev/null | grep -q '"ok":true' \
  && { echo "ABORT: port $TF_PROVIDER already answers — pick a different --port for $TF_PREFIX"; exit 1; }
# both ports free — now run docs/OPERATIONS.md step 2's `console serve` / `provider serve` commands with
# --name/--prefix "$TF_PREFIX" and --port "$TF_CONSOLE"/"$TF_PROVIDER" (background both with `&`), then:
export TERMFLEET_PROVIDER_URL="http://127.0.0.1:$TF_PROVIDER"   # PIN — required in shared environments
#   claude → /login    then sanity-check:  npx termfleet claude new -y --prompt "say hi"
#   (-y auto-approves the panel-review prompt that fires once any panel already exists)
```

Then author + file the **first issue** (Phase-2 #6). The PM keys on the **`ready` label** (not the assignee),
but the developer later validates a *loose file* — `gh issue view --json body --jq .body > issue.md; ztrack
check issue.md` — which has no stored assignee column and reads the owner from a top **`Assignee: <login>`
body line**. So that body line is load-bearing: drop it and the developer's `ztrack check` fails
`issue_missing_assignee` even with perfect evidence. Use the human's login (detected in Phase 1, **not** the
repo owner — an org isn't assignable) for both the body line and `--assignee`. The body also needs a
`## Acceptance Criteria` block with at least one AC:

```bash
cat > issue.md <<'MD'
Assignee: <login>

<one-line summary of the change>

## Acceptance Criteria
- [ ] dev/01 v1 <one observable, testable outcome>
  - status: pending
MD
npx ztrack issue create --title "<first issue>" --body-file issue.md --state ready --assignee <login>
npx ztrack sync github                       # THIS creates the GitHub issue (ztrack create only made a local id)
# capture the GITHUB issue number — `ztrack create` returned a ztrack id (ZT-1), NOT the GH number, and the
# PM keys on the `ready` LABEL, so the issue MUST be labeled or the loop silently skips it forever:
n=$(gh issue list -R <owner>/<repo> --state open --json number,title --jq '.[]|select(.title=="<first issue>")|.number' | head -1)
[ -n "$n" ] || { echo "ABORT: could not resolve the GitHub issue number (sync may have failed)"; exit 1; }
gh label create ready -R <owner>/<repo> --color 0e8a16 2>/dev/null
gh issue edit "$n" -R <owner>/<repo> --add-label ready
```

> **Note on the gate.** Branch protection is live, but **auto-merge is NOT enabled yet** — you turn it on in
> Phase 4 *after* watching one PR merge under supervision. So nothing auto-merges into `<default-branch>`
> until you've proven the gate end-to-end.

---

## Phase 4 — VERIFY (the install is not done until the loop merges)

Start the loop and **watch one trivial issue all the way to a merged PR**. Asserting "installed" without
this is the most common way a guided install silently ships broken.

**First, a mechanical gate — before you (or the human) spend any attention on the loop at all:**

```bash
npx open-autonomy doctor --json     # parse .verdict; a FAIL names exactly what to fix, with a remediation
```

This REPLACES hand-rolled polling probes — including a bare `curl` port check (Phase 3 step 7), which
misreads a live-but-FOREIGN provider as "nothing running" (F-8) — with checks that actually verify publish
integrity, toolchain/env sanity, provider IDENTITY, coding-CLI sign-in, and harness integrity from a real
freshly-created agent worktree (not just "the files exist here"). It is read-only and spends nothing. A
`FAIL` here means STOP and fix the named item before touching the loop; a clean `PASS`/`WARN` doesn't skip
the live proof below (doctor's own `--live` flag launches a doctor-owned probe session, not the human's
actual backlog item — see `docs/OPERATIONS.md#8-verify-the-install`).

**Expect the first tick to report PAUSED, not to launch anything.** Every local install (`compile` in
Phase 3) lands with `.open-autonomy/paused` present — a fresh install never dispatches before *someone*
has looked at the board, even one this guide just populated with a single issue. Confirm the fence, then
ask the human before lifting it (this is a judgment call, not yours to default):

```bash
node scheduler/run.mjs --once   # expect: "[loop] PAUSED ..." on stderr, exit nonzero, nothing launched
```

Tell the human: *"This install starts paused so an existing backlog is never worked without review. I've
filed one issue (labeled `ready`) — should I unpause now, or do you want to review the board first?"* On a
**go-ahead**, unpause (durable — a later re-compile/upgrade never re-adds the marker):

```bash
rm .open-autonomy/paused
```

Then start the loop:

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

The PR won't appear the instant the developer stops — on local it opens after the develop session goes idle
and is reaped (tens of seconds to minutes), then the reviewer launches. (You'll also see benign
`ci dispatch failed (non-fatal)` log lines: the proposer optimistically kicks a `ci.yml`/`human-approval.yml`
that a `simple-gh-sdlc` install doesn't ship — harmless, because the PAT-opened PR fires *your own* CI.)

**The supervised first merge (then arm auto-merge):** once the PR shows `agent-review=success` **and your
CI green**, merge this first one **yourself** to prove the gate end-to-end:

```bash
gh pr merge <pr> -R <owner>/<repo> --squash    # the supervised first merge (gate must be green)
```

Confirm it landed and the issue closed (a `merge.yml` reconcile closes it if the `Closes #n` keyword lags).
**Only now enable native auto-merge** for ongoing operation:

```bash
gh repo edit <owner>/<repo> --enable-auto-merge   # from here, green PRs land without you — see Durable operation
```

**Done looks like:** one PR, gated by your CI + `agent-review`, merged, issue closed, your tests green —
proven *before* auto-merge went live. That is a proven install.

---

## Failure modes (what you'll actually hit)

- **`createAgentWindow returned no terminalId` / a launch times out** — termfleet console/provider aren't
  running, **`tmux` isn't installed** (the provider needs it), or the coding CLI isn't signed in. Re-run
  `npx termfleet claude new -y --prompt hi` in isolation (`-y` skips the existing-panels review prompt,
  which fires once any panel already exists).
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

## Durable operation, observability & re-runs

Phase 4 proves *one* merge. For the loop to actually run a backlog over days, set these up — otherwise the
"install" is an ephemeral demo that dies when the terminal closes.

- **Make the loop durable.** `node scheduler/run.mjs &` dies on terminal close / logout / reboot. Run it
  under a supervisor that restarts it: a `launchd` plist (macOS) / `systemd --user` unit (Linux), or at
  minimum `nohup node scheduler/run.mjs >> ~/oa-loop.log 2>&1 &` inside a persistent `tmux`. Add a liveness
  check (is the process up?). The same goes for the termfleet console/provider.
- **Feed the backlog.** The loop runs whatever is `ready` on the GitHub board. Add work the same way as the
  first issue (`ztrack issue create … --state ready` → `ztrack sync github` → label `ready`). A `ready` issue
  **must already carry** a `## Acceptance Criteria` block and the top `Assignee: <login>` line — the PM never
  drafts, so a bare `ready`-labeled issue with no ACs goes straight to develop and fails `ztrack check`
  (churns to `human-required`). To hand the loop a raw request, leave it **unlabeled** and ask the PM to
  `draft` it. WIP is 1, so issues are worked one at a time, in order.
- **Observe + intervene on local (there is no `/agent` control plane locally).** The `/agent pause|retry|
  cancel` issue-comment commands work only on the GitHub-Actions runner. On local you steer with: the board
  (`gh issue list`, `gh pr list --json number,headRefName,statusCheckRollup,mergeStateStatus`), the live
  sessions (`npx termfleet sessions recent --live`), and the worktrees (`ls .worktrees/`). To pause one
  issue, remove its `ready` label or add a hold label your PM honors; to stop everything, kill the loop
  process. The PM is instructed to cap rework at `max_develop_attempts` (default 2) — it counts its prior
  `oa-rework:` marker comments on the issue and escalates to `human-required` at the cap — but that is **PM judgment,
  not a hard deterministic gate**, so watch a repeatedly-failing issue and stop the loop if it churns.
- **Idle spend.** Even with an empty board the PM wakes every tick (`*/15` → ~96 sessions/day) and bills your
  model provider. Widen `scheduler/schedule.json` `intervalSeconds` or stop the loop when the backlog is
  drained.
- **Housekeeping the loop does NOT do for you (yet):** merged-issue worktrees under `.worktrees/agent/issue-*`
  are not auto-pruned — `git worktree prune && rm -rf .worktrees/agent-issue-*` periodically.

### Re-running / repairing the install (it is only partly idempotent)

- **`ztrack init` is a silent no-op if `.volter/` already exists** — it will NOT (re)apply `--sync github`.
  (OA's compile next-steps hint has been preset-aware since BL-29 — it never prints a bare `ztrack init` —
  but the no-op itself is ztrack's behavior regardless of which command names the preset.) The canonical
  statement of this caveat is the local install checklist's inline warning,
  `docs/OPERATIONS.md#6-give-the-loop-work--by-code-host` (the local-git flavor, right after its
  `ztrack init` line) — read it there; if the GitHub link is missing, fix `.volter/tracker-config.json`
  directly rather than re-running init.
- **Re-running `compile` regenerates the harness files** (scripts/, .claude/skills/, .open-autonomy/, …) —
  but two collision classes are now GUARDED, not silent (OA-10): (1) `.claude/settings.json` is
  **merged**, not overwritten (your `permissions` and other keys survive; only the Stop hook entry is
  appended if missing) — no `--force` needed for it specifically; (2) re-compiling **refuses** to
  re-create any OA-generated file you deliberately deleted (e.g. the `dependabot.yml`/`security.yml` from
  step 4) — it names the path and explains it was in a prior `.open-autonomy/generated.json` but is now
  gone from disk; `--force` re-creates it if you actually want that (reported as `resurrected:`). State
  files (`.open-autonomy/paused`) are exempt from guard (2) — deleting one is a normal operator action, not
  a "deletion to undo". Stage only the harness files you actually changed (don't sweep in the `.volter/`
  sync-state churn a re-compile leaves behind).
- **`upgrade` does NOT have guard (2)** — it is a re-compile of the derived set and **re-creates** any
  derived file you deleted (no refusal, no `--force`), so a deletion you want to persist (e.g. removing
  `security.yml`, or the raw Stop hook) must be **re-applied after every `upgrade`** or dropped at the
  source (fork the profile). The Stop hook is the exception: its durable sentinel opt-out
  (`"_openAutonomyStopHookOptOut": true` in `.claude/settings.json`) is honored by `upgrade` too.
- **Updating the committed harness AFTER the gate is wired:** `enforce_admins:true` (correctly) blocks even
  an admin's direct push to the default branch (`GH006: N of N required status checks are expected`), so an
  operator pushing a harness/skill update can't `git push` to `main`. Use **`npx open-autonomy harness-push`**
  — it relaxes `enforce_admins`, pushes, and **always restores the gate** (even if the push fails). (The gate
  is for *agent* changes; operator harness maintenance is the one legitimate out-of-band push.)
- **Interrupted between commit (step 5) and protection (step 6):** just re-run step 6 — the protection PUT is
  idempotent. The runtime is crash-safe (effect markers replay; `agent-propose` refuses a branch with a
  merged PR), so a restarted loop won't double-PR.

### Teardown (how the human backs OA out)

The canonical teardown sequence (stop the loop + termfleet, disarm the GitHub gate, revert/remove the
harness commit, prune worktrees/runner-state, optionally remove the deps) is
`docs/OPERATIONS.md#stop--teardown` — run it as written; this setup (`simple-gh-sdlc` on `local`) uses all
of it, including the GitHub-gate-disarm step. There is no local-git-only delta here: nothing about this
setup's teardown is GitHub-agent-specific beyond what the canonical sequence already covers.

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
