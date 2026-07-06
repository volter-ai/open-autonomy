# open-autonomy — Cold-Adopter Install/UX Audit Findings

**Date:** 2026-07-06
**Auditor:** fresh-eyes simulation (agent-driven), following only the public onboarding surface: `README.md`, `docs/OPERATIONS.md`, `docs/INSTALL-AGENT.md`, and CLI `--help`.
**Tool:** `open-autonomy` @ git `2fa5614` (docs) / npm `0.4.1` → `0.3.1` (see F-1); termfleet npm `0.2.0`; ztrack `0.47.1`.
**Target:** a disposable clone of `volter-ai/termfleet` — an existing, lived-in repo (own `scripts/`, own CI, npm workspaces, a populated ztrack board, a GitHub origin). Chosen deliberately as the "adopt into an existing repo" scenario.
**Setup exercised:** the **fully-local** path (`simple-sdlc` profile, local runner, ztrack board) — the only one exercisable without pushing to GitHub. The GitHub paths were audited on paper only.

---

## TL;DR verdict

**Not currently reasonable for a cold adopter.** The documented happy path is broken at three independent points before the first agent ever runs — two of them hard crashes in the published npm artifacts (`open-autonomy@0.4.x` compile is dead on arrival for everyone; `termfleet@0.2.0`+`@termfleet/core@0.2.1` skew breaks in workspace repos), and one an **architecture violation of the fully-local mode's core guarantee**: "fully local" is supposed to mean *zero dependency on GitHub, period* — but on any repo with a GitHub remote (nearly every real repo, including every repo in this fleet) the runner silently fetches `origin/<trunk>`, so agents cannot see the harness until it is pushed to GitHub. The "no GitHub needed" promise is broken for the normal case, not a corner case (F-2). Even doing everything right, the first worker dies with `Unknown command: /develop` visible only inside a tmux session, while the PM keeps re-dispatching it forever and reports the dead runs as "finished."

An expert driver reached a firing loop in ~25 minutes of wall clock **only by** downgrading npm packages by trial, hand-editing `node_modules`, reading the runner's source, and renaming the git remote — none of which is documented. A real engineer following the docs would be hard-stuck at the `compile` crash (~10 minutes in) with no path forward.

The conceptual docs are honest and often excellent (the local-runner security caveats in particular). The failures are all in the seam between docs and shipped artifacts, and in undocumented assumptions an existing repo violates.

---

## 1. What actually happened, in order

Times are wall clock for an agent driver who reads instantly and diagnoses fast; multiply reading/diagnosis by 3–10× for a human first-timer.

### Phase 1 — Reading the onboarding path (~7 min agent; est. 1–2 h human)

The path is `README.md` → `docs/OPERATIONS.md` (§ Install & operate + § Local-runner quickstart) → `docs/INSTALL-AGENT.md`, ~1,100 lines combined.

**What's good:** What OA *is* comes across (profiles compile onto substrates; agents propose, a gate merges). The existing-repo vs new-repo split is prominent and repeated: `self-driving` is a scaffold, `simple-gh-sdlc`/`simple-sdlc` are additive overlays — exactly my scenario, called out by name. The local-runner security section (no independent reviewer on a shared token, "CI is the real gate") is unusually candid. `INSTALL-AGENT.md` is a genuinely thoughtful detect→ask→execute→verify playbook with real stop conditions.

**What's not:** the three docs overlap heavily but each holds one or two *load-bearing* facts the others omit (see F-3, F-8, F-15). The CLI's own `--help` adoption hint recommends `compile self-driving gh-actions .` — the scaffold the docs explicitly say NOT to use on an existing repo (F-10).

### Phase 2 — Prerequisites (~3 min)

All present (Node 22.23.1, tmux 3.3a, bun 1.3.14, claude CLI 2.1.201, gh 2.95.0). Nit: the docs say to verify Claude Code sign-in with `claude --version`, which succeeds logged-out (F-13).

### Phase 3 — Install into the existing repo (~30 min agent; a human is likely hard-stuck here)

Following `OPERATIONS.md` § Local-runner quickstart, in order:

1. **`npm install termfleet`** — succeeded, but silently rewrote the repo's existing `@termfleet/core` pin (`^0.2.0` → `^0.2.1`) in `package.json`. Install is not inert on an existing repo (F-17).
2. **`npx open-autonomy preflight`** (docs: run once after installing deps) — **FAILED**, with contradictory output ("rebuilt dependencies successfully" / "node-pty rebuild FAILED — install the build toolchain"). False alarm: preflight checks for `node-pty`, but termfleet 0.2.0 uses `@homebridge/node-pty-prebuilt-multiarch`, which was installed and loads fine. The advice (install a build toolchain) is unfixable noise — the toolchain was already present. The gate says "fix and re-run"; a compliant user is stuck at step 1 (F-5). I proceeded anyway (undocumented judgment call). Credit: preflight's lockfile-vs-CI-Node check correctly detected the repo's CI uses Node 24 vs local 22.
3. **`npx termfleet console serve …`** (docs step 2) — **hard crash**: `ERR_PACKAGE_PATH_NOT_EXPORTED: './agent-launch.js' is not defined by exports in @termfleet/core/package.json`. Root cause took real forensics: the target repo is an **npm-workspaces monorepo whose own `packages/core` is `@termfleet/core`**; npm links the repo's in-development source over the published dep, and the published CLI is incompatible with it. There is **no supported npm way** to prefer the registry package over a workspace link. Docs never mention workspaces (F-4). Workaround used: run termfleet from a clean directory outside the repo — undocumented.
   - Clean-room check: `npm install termfleet` in an empty dir works, so this is an existing-repo collision, not a broken publish. (The extreme form here — the target *is* termfleet — won't repeat on other fleet repos, but any monorepo with a workspace package name-colliding with a termfleet/OA dep hits the same wall.)
4. **Port collision on a shared box:** the doc-default port 7373 was already held by this machine's own pre-existing termfleet provider (fleet dev boxes run termfleet as infrastructure). `INSTALL-AGENT.md`'s probe (`curl http://127.0.0.1:7373/`) misidentifies a provider (404) as "nothing running," and its advice to "re-use a running console/provider if one is up" would attach the OA loop to *someone else's* provider with launch rights across the whole box (F-8). Used repo-unique ports/prefix (mentioned only in INSTALL-AGENT, not the human quickstart) and pinned `TERMFLEET_PROVIDER_URL` everywhere out of caution.
5. **Console started but noisy:** on Linux it still tries the macOS-only iTerm driver for its default provider (`spawnSync osascript ENOENT` unhandled-rejection stack trace) then times out against a provider it never started — on the happy path (F-12).
6. **Sanity check** `npx termfleet claude new --prompt "say hello"` — refused with a panel-review hint until re-run with an undocumented `-y`; then worked (a real Claude session launched). `sessions recent` showed `"total": 430` — the session store is user-global, mixing my audit sessions with the box's other work (F-8).
7. **`npx open-autonomy compile simple-sdlc local .`** — **hard crash**: `ENOENT … dist/egress-guard.sh` inside the published package. `open-autonomy@0.4.1` **and** `0.4.0` both ship broken (`compile` loads the github-substrate module even for `local` targets, and the tarball lacks the file). Recovery: try older versions until `0.3.1` worked — pure trial and error, and it means running an install two minor versions behind the docs (F-1). **This is where a real cold adopter is hard-stuck.**
8. **Overlay result (0.3.1):** genuinely additive on `package.json`/`README`/`.gitignore` as promised — but it wrote 13 files straight into the repo's **existing `scripts/` directory**, intermixed with the repo's own 6 scripts, with no collision check, warning, or manifest of what it wrote (F-9). It also emitted `.claude/settings.json` containing a **Stop hook that runs in every Claude Code session in the repo — including human developers' interactive ones** — and would have clobbered a pre-existing `.claude/settings.json` (this repo had none; most fleet repos do) (F-9).
9. **`npm install -D ztrack`** — reported success, installed nothing: the box has `NODE_ENV=production`, so npm omits devDependencies. `ztrack init` then helpfully warned that ztrack isn't resolvable and told me to run… the exact command that had just silently no-opped. Undocumented; fixed with `NODE_ENV=development npm install -D ztrack` (F-6).
10. **`npx ztrack init --preset simple-sdlc`** — "Already initialized": the repo already had `.volter/` tracker config, so init is a **silent no-op** (documented only in INSTALL-AGENT's re-run appendix, not the quickstart). Lucky here (the existing config was already the right preset); on a repo with a *different* existing tracker config the documented step would silently do nothing and the loop's assumptions would be wrong (F-11).
11. **`npx ztrack issue create --title "…"`** (docs verbatim) — created the issue but immediately flagged `issue_missing_assignee: does not fully conform to the installed preset`. The quickstart never mentions assignees for the local flavor; a fresh user can't tell if this matters. It also minted a `LOCAL-911` id alongside the repo's existing `TF-xxx` scheme (F-11).

### Phase 4 — Exercising the loop (~25 min, 4 ticks to get one real worker)

12. **Tick 1** (`node scheduler/run.mjs --once`) — **crash**: OA's emitted `scripts/autonomy-runner.mjs` imports the bare specifier `termfleet`, and Node's self-reference resolution pointed it at the host repo itself (whose package name is `termfleet`) → `Cannot find module …/dist/index.js`. After building the repo it got further and then died on the workspace-shadowed `@termfleet/core` again. Continuing required **hand-copying the published `@termfleet/core` over the workspace symlink in `node_modules`** — far beyond any reasonable adopter (F-4). *Generalizable part:* OA's runtime resolves its deps from the host repo's dependency namespace and assumes no overlap.
13. **Tick 1′ (after surgery)** — the loop **fired**: PM launched as a real Claude session, read the board, and dispatched `develop` for **TF-603 — a pre-existing backlog item whose body explicitly says "do not dispatch it"** (deferred decision), size L, rather than my tiny fresh issue. Day one on an existing board, the loop starts spending on old backlog the owners had parked (F-7).
14. **The worker died instantly:** `Unknown command: /develop`. Cause: agents run in **git worktrees, which only see committed files**, and the quickstart's steps 1–5 never say to commit the overlay (the requirement lives in a side-note in a different section). Failure is silent at the scheduler level — you only see it by capturing the worker's terminal. The PM meanwhile treats the dead run as "finished" and re-dispatches every tick, forever (F-3, plus the no-failure-detection note in F-7).
15. **Committed the harness (39 files, +2,309 lines), tick 2** — worker died the same way. The worktree was based on **`origin/main`**: `runner.ts` fetches and bases worktrees on the remote trunk whenever a remote exists, falling back to local HEAD only on remoteless repos. A local `git update-ref` simulation was undone by the runner's own network fetch — conclusively: **on a repo with a GitHub origin, the "fully local, PR-free, no GitHub" profile requires pushing the harness to GitHub before any agent can run** (F-2). No doc states this — and per the product-owner framing recorded under F-2, this is an architecture violation of the fully-local guarantee in the normal case, not a documentation gap.
16. **Renamed the remote away (disposable-clone workaround), tick 4** — see the addendum below for the final worker outcome.

Elapsed at the end of phase 4: **~25–40 min wall clock** for an expert driver, including all diagnosis. A realistic human estimate for the same distance: **a half-day to days — or, more likely, permanently stuck at step 7** (the `compile` crash) unless they think to downgrade npm packages.

---

## 2. Friction points, ranked by derail severity

**P0 — hard-stops on the documented happy path (a cold adopter cannot proceed):**

- **F-1. `open-autonomy@0.4.1` and `0.4.0` (npm latest and latest−1) crash on `compile`** — `dist/egress-guard.sh` missing from the published tarball; the CLI reads it whenever the compile path loads the github-substrate module, even for `local` targets. Nobody can complete the README's headline one-liner today. Recovery (downgrade to 0.3.1) is undocumented trial-and-error and leaves you running an install the current docs don't describe. *Fix class: release CI that smoke-runs every published verb from the packed tarball.*
- **F-2. Architecture violation: the fully-local mode's core guarantee ("GitHub is not needed") is broken in the normal case.** `runner.ts` bases agent worktrees on fetched `origin/<trunk>` whenever a remote exists — so `simple-sdlc`, whose entire pitch is "private repo you won't push"/"no GitHub at all", in fact depends on GitHub (push the harness to origin, or remove the remote) on any repo that has a GitHub remote. Per the product owner, this finding must not be read as a docs gap or edge case:

  > The intended bar for 'fully local' is NOT a soft preference ('GitHub should not be used') — it's a hard architectural guarantee ('GitHub is not needed', i.e. zero dependency on GitHub, period). Those are two very different things. Under the correct bar, this bug is significantly worse than 'an undocumented edge case for repos with no remote': since nearly every real repo has a GitHub remote (including every repo in this fleet), the runner silently fetching origin/<trunk> means the 'no GitHub needed' promise is broken for the NORMAL case, not a rare corner case. This is a genuine architecture violation of the core fully-local guarantee, not a docs gap.

  The remoteless fallback (base on local HEAD) is the *only* configuration that honors the guarantee, and it is the rare shape, not the common one. Compounding it: the failure symptom is F-3's silent zombie, so the violation is also nearly undiagnosable from the outside. Documenting "push first" would NOT close this finding — it would convert the fully-local mode into a GitHub-dependent mode; the fix has to be architectural (base worktrees on local trunk when the profile's code host is local-git).
- **F-3. The local quickstart omits the mandatory "commit the overlay" step.** Agents run in worktrees; worktrees see only committed (per F-2: *pushed*) files. OPERATIONS steps 1–5 never say commit; the requirement lives in a side-note in a different section and in the GitHub-flavored INSTALL-AGENT. A verbatim quickstart user gets a loop that looks alive while every worker dies at launch with `Unknown command: /develop` — visible only via terminal capture.
- **F-4. npm-workspaces / package-name collisions are fatal and unhandled.** A workspace package that name-collides with a termfleet/OA dependency gets silently linked over the published one; the emitted runner also resolves bare `termfleet` via Node self-reference if the host package is named the same. Crashes here; in a built repo it would *silently run the host's dev code as the runner SDK*. No supported workaround exists inside the repo; docs never say the word "workspace." (Extreme form is target-specific; the class is not.)

**P1 — majors (proceed only with luck or expertise):**

- **F-5. `preflight` hard-fails falsely on a healthy environment.** It checks `node-pty` while termfleet ships `@homebridge/node-pty-prebuilt-multiarch`; output simultaneously claims rebuild success and failure; the prescribed fix (install a build toolchain) was already satisfied and cannot clear the gate. First documented command after the dep install, and it tells a compliant user to stop.
- **F-6. `NODE_ENV=production` makes the tracker install silently no-op.** `npm install -D ztrack` "succeeds" without installing; ztrack's own warning then prescribes the same no-op command. Neither docs nor preflight (whose job this is) check `NODE_ENV`/npm `omit`.
- **F-7. No day-one fence against an existing backlog.** The PM's first tick swept the repo's ~52 pre-existing issues and dispatched a size-L item whose body explicitly said *do not dispatch* (state machine said `ready`; the prose said deferred). On the local runner this is uncapped spend on the wrong work. There is no "start paused," no new-work allowlist, no dry-run tick, and — compounding — the PM cannot distinguish a worker that died at launch from one that finished, so it re-dispatches the same doomed item every tick without escalation.
- **F-8. Pre-existing termfleet infrastructure (the fleet's normal case) is a minefield.** Default port 7373 was already a provider on this box; INSTALL-AGENT's curl probe misreads a provider as "nothing running"; its "re-use a running console/provider" advice would attach OA's loop to an unrelated provider with box-wide launch rights; the session store is user-global (my sessions listed among 430 others); and whether the PM's *child* launches inherit a `TERMFLEET_PROVIDER_URL` pin is undocumented (mine landed correctly, but I couldn't verify why). The human quickstart mentions none of this.
- **F-9. The overlay writes into common paths with no collision detection or manifest.** 13 files intermixed into the repo's existing `scripts/`; `.claude/settings.json` emitted (would clobber an existing one — most Claude-using repos have one) containing a Stop hook that fires in **every** Claude Code session in the repo, human sessions included; re-compile is documented to overwrite it and to resurrect files you deleted. Nothing prints "here is what I wrote/changed."

**P2 — moderates (confusion, wrong defaults, paper-cuts):**

- **F-10. `open-autonomy --help` recommends the wrong profile for existing repos** (`compile self-driving gh-actions .`), directly contradicting the README's warning for exactly this case.
- **F-11. Tracker onboarding is rough on a repo with tracker history:** `ztrack init` silently no-ops if `.volter/` exists (documented only in a re-run appendix); the docs' verbatim `issue create` yields a non-conforming issue (`issue_missing_assignee`) with no guidance; new issues get a `LOCAL-` team key beside the repo's existing `TF-` ids; `npx` fetched `ztrack@1.0.0` while the repo pins `0.47.1`.
- **F-12. Happy-path noise that reads as breakage:** the console attempts the macOS-only iTerm driver on Linux (osascript ENOENT stack trace + supervisor timeout); the sanity-check launch needs an undocumented `-y` when any panel exists.
- **F-13. Wrong verification advice:** `claude --version` does not verify sign-in; a logged-out user finds out ~45s into the first real launch.
- **F-14. Version/doc skew:** the only working package (0.3.1) is two minors behind the docs; its emitted "next steps" text differs from OPERATIONS in small ways. VERSION in git says one thing, npm latest another.
- **F-15. Load-bearing facts live in exactly one of three overlapping docs** (ports/prefix advice and teardown only in INSTALL-AGENT; the commit requirement only in a side-note; human quickstart lacks the stop-conditions). A reader of any single doc — including the one addressed to them — misses something fatal.
- **F-17. Installs mutate the host repo beyond their remit:** dep-range rewrites in `package.json` (`@termfleet/core` `^0.2.0`→`^0.2.1`) with no mention.

*(F-16 intentionally unused.)*

---

## 3. Existing repo vs. blank repo — what's specifically harder

The overlay-vs-scaffold docs handle the *file-copy* level well (nothing overwrote `package.json`/`README`). Everything that actually broke was one level deeper — state an existing repo has that a blank one doesn't:

1. **A dependency/namespace history** → workspace shadowing, self-reference resolution, dep-pin rewrites (F-4, F-17). Blank repos can't collide.
2. **A git remote** → worktrees silently track `origin/<trunk>`; the fully-local mode's "zero dependency on GitHub" guarantee is violated (F-2). Since nearly every real repo has a GitHub remote, this breaks the *normal* case; a blank local-only repo is the rare shape that works, and it works by accident of the fallback path.
3. **A populated tracker/backlog** → day-one dispatch of parked work, id-scheme mixing, init no-op (F-7, F-11). A blank board makes the same steps look safe.
4. **An existing `scripts/` dir, `.claude/` config, CI that lints the whole tree** → interleaving, clobber and hook-injection risk (F-9); and (paper audit, not exercised) OA's bun-targeted TS committed at the repo root can red an existing repo's full-tree lint/typecheck CI — acknowledged only in an INSTALL-AGENT comment, with "exclude our files from your lint" as the remedy.
5. **Shared/prior termfleet infrastructure** — for this fleet specifically: every dev box already runs termfleet, so the port/discovery/session-store collisions in F-8 are the *default* condition, not an edge case.

Net: the docs' additive-overlay story is true for *files* and false for *everything else an existing repo owns* — dependency graph, remote, board, CI, editor config, running infrastructure.

## 4. Where a real new user would have been stuck (explicit log)

| # | Moment | What I did that a fresh user wouldn't know to do |
|---|--------|--------------------------------------------------|
| 1 | `preflight` FAILED falsely | Ignored a hard gate after proving the pty module loads by hand |
| 2 | termfleet CLI crash in-repo | Diagnosed npm workspace shadowing; ran termfleet from an outside directory |
| 3 | `compile` ENOENT crash | Downgraded npm package by trial until 0.3.1 worked |
| 4 | `npm install -D` no-op | Knew `NODE_ENV=production` omits devDeps; overrode it |
| 5 | Runner import crash | Built the host repo; then hand-replaced a `node_modules` symlink with the published package |
| 6 | Worker `Unknown command: /develop` | Knew worktrees see only committed files; found the side-note; committed |
| 7 | Still failing after commit | Read `runner.ts` source to find the `origin/<trunk>` fetch; renamed the git remote |
| 8 | Shared-box ports/providers | Chose unique ports/prefix and pinned `TERMFLEET_PROVIDER_URL` defensively |

Steps 3, 5 and 7 are, in my judgment, beyond a competent engineer who is new to this stack — each looks like "the tool is just broken."

## 5. Verdict

**No-go for broad rollout as-is.** Two of the three showstoppers (F-1 broken publishes, F-2/F-3 — where F-2 is an architecture violation of the fully-local guarantee in the normal case, surfacing as F-3's silent-zombie failure) affect *every* adopter, not just awkward targets like this one; the third class (F-4 namespace collisions) will recur across a fleet that hosts JS monorepos. F-2 in particular cannot be closed by documentation: "push the harness first" would simply redefine fully-local as GitHub-dependent.

**The single biggest change needed:** make the install *self-verifying* end-to-end — a `doctor`/verify step (or an extended preflight) that, before declaring success, proves the actual failure chain this audit walked: published CLI runs from its own tarball → provider reachable on a non-conflicting port → overlay committed **and visible from a freshly created worktree** (this one check subsumes F-2 and F-3) → a skill invocation resolves → one tick launches a worker that survives launch. INSTALL-AGENT.md already preaches "verify the loop before declaring done" for the GitHub path; the local path — the path with no independent gate and uncapped spend — has no equivalent, and every failure between `compile` and the first working worker is currently invisible.

Prerequisites to even schedule a rollout, in order: (1) fix + CI-gate the npm publishes (F-1); (2) document-and-check the commit/push-to-origin requirement (F-2/F-3); (3) a day-one fence for existing backlogs — install paused, or restrict the PM to issues labeled after install (F-7); (4) collision detection + a written manifest for the overlay (F-9), with an explicit statement about `.claude/settings.json` hooks; (5) fix the preflight false alarm (F-5) so the one safety net that exists stops crying wolf.

---

## Addendum — final worker outcome (tick 4, remoteless repo)

With the remote renamed away (runner falls back to local HEAD) the loop finally ran clean end-to-end: PM tick → dispatch → fresh worktree from the committed harness → `/develop` resolved → the developer did real, high-quality work. Notably, **the developer caught what the PM missed**: it read TF-603, chased the TF-601 decision record, concluded the item is explicitly deferred ("the resolution was 'defer', not 'accept'"), refused to implement a broad auth-topology rewrite against a recorded maintainer decision, made **no commits**, and exited with `OUTCOME: blocked human-required`, then marked the issue blocked on the tracker. That is exactly the escalation the standards prescribe — the safety doctrine works at the worker layer, at the cost of one dispatched session per bad pick and with no PM-level memory that the pick was bad.

So the core loop is *real*: once the (many) undocumented preconditions are met, agents launch, respect worktree isolation, follow the standards, and escalate rather than freelance. The product underneath the onboarding is more solid than the onboarding.

**Total elapsed, cold clone → one correctly-behaving worker: ~26 minutes** (11:21–11:47 UTC) for an agent driver, of which the majority was diagnosing the four hard failures (F-1…F-5). Zero of the four could have been resolved from the docs alone.

**State left behind in this disposable clone:** the OA overlay committed locally as `c9938a9` (39 files, never pushed); `node_modules/@termfleet/core` hand-replaced with the published 0.2.1; the `agent-issue-TF-603` worktree/branch from the successful run; TF-603 marked blocked on the local board; this report, uncommitted. Nothing was pushed anywhere; the box's own termfleet infrastructure (port 7373) was never used or modified; all audit tmux sessions and my console/provider (7573/7602) are stopped.
