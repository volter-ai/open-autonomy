# OA-02: local-git worktrees must base on the local trunk, never on fetched `origin/<trunk>`

**Finding:** F-2 — Architecture violation: the fully-local mode's core guarantee ("GitHub is not needed") is broken in the normal case — the runner bases agent worktrees on fetched `origin/<trunk>` whenever a remote exists (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P0
**Fix target:** open-autonomy

## Problem

`simple-sdlc`'s entire pitch is "fully local, PR-free, **no GitHub at all**" (`docs/OPERATIONS.md:26-27`,
`:66-68`, `:151`). But the local runner's worktree-isolation code decides the base commit of every agent
worktree by asking git — not the profile — whether a remote exists: it fetches `origin/<trunk>` and, if the
remote-tracking ref resolves, bases the new agent branch on it, falling back to local `HEAD` **only when the
repo has no remote**. Since nearly every real repo has a GitHub remote, this means:

- The operator commits the compiled harness locally (as required — agents run in worktrees and worktrees see
  only committed files). They do **not** push, because the whole point of `simple-sdlc` is a private repo you
  won't push.
- The PM dispatches a worker: `bun scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>`.
- The runner fetches `origin/<trunk>` and bases the worktree on it. The remote trunk predates the harness
  commit, so the worktree contains **no** `.claude/skills/`, no `scripts/`, no `standards/`.
- The worker session launches, its `/develop` invocation fails to resolve (`Unknown command: /develop`), and
  it parks as a zombie (surfacing as F-3/OA-03's silent-failure symptom, and re-dispatched forever per
  F-7/OA-08).

Net effect, observed live in the install audit (§1 phase 4, item 15): **on any repo with a GitHub origin, the
"fully local, zero-GitHub-dependency" mode requires pushing the harness to GitHub before any agent can run.**
The remoteless fallback — the only configuration that honors the guarantee — is the rare shape, not the
common one. Per the product owner (quoted verbatim in OA-INSTALL-AUDIT-FINDINGS.md §2 F-2), "fully local" is
a **hard architectural guarantee** ("GitHub is not *needed*, period"), not a soft preference; this is an
architecture violation of that guarantee in the NORMAL case, not a docs gap or an edge case. That framing is
binding for this fix.

## Root cause (file:line citations you have verified by reading them)

All paths relative to the repo root; all lines verified by reading on branch `adoption-fixes-backlog`.

- **`packages/substrate-local/src/runner-frontend.ts:256-284` — `ensureWorktree()`**, the sole place agent
  worktree bases are decided. The defect is lines 260-271:

  ```ts
  const branchExists = git(['rev-parse', '--verify', '--quiet', branch]).status === 0;
  // Base a NEW agent branch on the FRESHEST default branch, not the local HEAD. The local trunk goes stale as
  // agent PRs auto-merge on the REMOTE (this loop never pulls them back), so branching from HEAD builds on
  // outdated code and the PR conflicts with what actually merged. Fetch the trunk and branch from
  // origin/<trunk> when a remote-tracking ref exists (a GitHub code host); fall back to HEAD for a remoteless
  // local-git repo (where there is no such drift — the PM lands work locally).
  let base = 'HEAD';
  if (!branchExists) {
    const trunk = git(['symbolic-ref', '--short', 'HEAD']).stdout.trim() || 'main';
    git(['fetch', 'origin', trunk]); // best-effort: a no-op (non-zero) without a remote
    if (git(['rev-parse', '--verify', '--quiet', `origin/${trunk}`]).status === 0) base = `origin/${trunk}`;
  }
  ```

  The condition on line 270 is **"does `origin/<trunk>` resolve"** — a property of the git repo — when the
  comment's own rationale ("a GitHub code host"… "a remoteless local-git repo") is a property of the
  **declared code host**. The code conflates "has a remote" with "is a GitHub code host". On a local-git
  install in a repo that happens to have a remote (the normal case), the branch is based on stale/foreign
  remote state and the harness commit is invisible to every worker. Note also line 269 performs a live
  network `git fetch` on every fresh-branch launch — a hard GitHub dependency (network egress + remote
  freshness) inside the mode whose guarantee is "zero dependency on GitHub".

- **The runner already knows the code host and already reads it for exactly this kind of gating**:
  `packages/substrate-local/src/runner-frontend.ts:114-119` — `manifestCodeHost()` parses
  `.open-autonomy/autonomy.yml` and returns its `codeHost` field; it is already consumed at
  `runner-frontend.ts:331` (`if (worktree && manifestCodeHost() === 'github')`) to gate the post-session
  propose effect on the code host. The worktree-base decision at :270 simply never consults it.

- **`codeHost` is a first-class, compiled-in signal**: declared in the profile
  (`profiles/simple-sdlc/ir.yml:19` — `codeHost: local-git`; typed at `packages/core/src/ir.ts:76` as
  `'github' | 'local-git'`), serialized into the install's manifest by `emitAutonomy`
  (`packages/core/src/manifest.ts:76` — `...(ir.codeHost ? { codeHost: ir.codeHost } : {})`), which
  `compileLocal` writes to `.open-autonomy/autonomy.yml` (`packages/substrate-local/src/emit.ts:227-229`).
  Verified: a compiled simple-sdlc install's `autonomy.yml` carries `codeHost: local-git`.

- **This file ships verbatim into every install**: `packages/substrate-local/src/emit.ts:35` reads
  `runner-frontend.ts` as `RUNNER_FRONTEND`, and `emit.ts:237` emits it as `scripts/runner.ts`. So the
  emitted `scripts/runner.ts` the audit grepped **is** this source file. (The audit cites the fetch at
  emitted lines ~166-172 — that was `open-autonomy@0.3.1`'s emitted copy; code added since, e.g. the human
  route at :121-216, shifted the same logic to source lines 262-271. Same code, same defect.)

- **Why local `HEAD` is the *correct* base for local-git, not merely an acceptable fallback**: on a local-git
  code host the PM itself integrates finished branches into the local trunk —
  `profiles/simple-sdlc/skills/pm/SKILL.md:54-59` ("**Integrate** a finished issue … `git merge --no-ff -m
  "integrate <id>" agent/issue-<id>`"). The staleness rationale in the comment at :262-265 ("agent PRs
  auto-merge on the REMOTE (this loop never pulls them back)") describes *only* the GitHub code host. Under
  local-git the local trunk is the single authoritative trunk **by design**; `origin/<trunk>` is at best
  stale and at worst somebody else's state.

## Proposed fix (spec depth; what/where/why-over-alternatives)

**Architectural rule (the owner's framing, verbatim intent):** when the install's declared code host is
`local-git`, agent worktrees are based on the **local trunk (local `HEAD`)** and the runner **never fetches
origin — no network operation of any kind**. The fetch-and-base-on-`origin/<trunk>` behavior remains correct
**only** when the declared code host is `github` (where merged PRs land on the remote and the local trunk
genuinely drifts).

### 1. Gate the worktree base on the declared code host — `packages/substrate-local/src/runner-frontend.ts`

Change `ensureWorktree()` so the origin path is entered only for a `github` code host:

- Give `ensureWorktree` the code host explicitly: change the signature to
  `ensureWorktree(branch: string, worktree: string, codeHost: string)` and pass `manifestCodeHost()` from
  the one existing call site (`launch()`, currently `runner-frontend.ts:316`). Passing it (rather than
  calling `manifestCodeHost()` inside) keeps `ensureWorktree` a pure function of its inputs and lets
  `launch()` read the manifest **once** per launch (it already calls `manifestCodeHost()` at :331 for the
  effect gate — hoist that single read to the top of the skill-agent path and reuse it for both decisions).
- Replace lines 266-271 with, in behavior:

  ```ts
  let base = 'HEAD';
  if (!branchExists && codeHost === 'github') {
    const trunk = git(['symbolic-ref', '--short', 'HEAD']).stdout.trim() || 'main';
    git(['fetch', 'origin', trunk]); // best-effort: a no-op (non-zero) without a remote
    if (git(['rev-parse', '--verify', '--quiet', `origin/${trunk}`]).status === 0) base = `origin/${trunk}`;
  }
  ```

  i.e. exactly today's logic, entered **iff `codeHost === 'github'`**. For `local-git` — and for an absent
  `codeHost` ('' from `manifestCodeHost()`, e.g. the `hello` profile, which declares none) — the base is
  unconditionally local `HEAD` and **no `git fetch` runs**. Default-to-`HEAD` for the absent case is
  deliberate: the *only* justification for the origin base is the GitHub code host's remote-merge drift
  (comment :262-265), so the origin path must be opt-in by declaration, never inferred from repo shape.
  (This is the same polarity as the propose-effect gate at :331, which also runs only on an explicit
  `=== 'github'`.)
- Rewrite the comment block at :261-265 to state the new rule: *the base is a function of the declared code
  host, never of whether a remote exists. github → fetch + `origin/<trunk>` (remote merges make local HEAD
  stale); local-git / undeclared → local `HEAD` (the PM merges locally; the local trunk is authoritative;
  fetching would create a GitHub dependency inside the fully-local guarantee).* Cite F-2/OA-02 in the
  comment so the invariant survives future refactors.

### 2. Make the decision unit-testable — same file

Extract the base decision into an exported pure helper so it can be tested without a live termfleet stack,
mirroring the existing `mergeInFlight` pattern (`runner-frontend.ts:392` is exported exactly for this
reason):

```ts
/** The base ref for a NEW agent branch: a function of the DECLARED code host, never of repo shape. */
export function worktreeBase(codeHost: string, originTrunkResolves: boolean, trunk: string): string;
// github + resolvable origin/<trunk>  -> `origin/${trunk}`
// everything else                     -> 'HEAD'
```

`ensureWorktree` performs the fetch only when `codeHost === 'github'`, then calls this with the rev-parse
result. Add a test file (e.g. `packages/substrate-local/src/worktree-base.test.ts`, or extend
`spec-example.test.ts`) covering the truth table plus an integration case (see AC below).

### 3. No changes needed anywhere else — verify, don't touch

- `packages/substrate-local/src/emit.ts` needs no change: it already emits `runner-frontend.ts` verbatim
  (:35, :237) and already writes `codeHost` into the manifest (:227-229 via `manifest.ts:76`).
- `simple-gh-sdlc` (local runner + GitHub code host) keeps today's behavior byte-for-byte, including the
  best-effort fetch tolerance.
- The GitHub-Actions substrate is untouched (its isolation is the job checkout;
  `runner-frontend.ts` never runs there).

### Why this over alternatives

The runner already treats `codeHost` as *the* declared signal that distinguishes "a finished branch becomes
a PR on GitHub" from "the PM merges worktrees locally" (:110-118 comment, :331 gate). The worktree base is
the same distinction one step earlier in the lifecycle. Using the declared signal (a) restores the hard
guarantee — with `codeHost: local-git`, no code path can touch the network or the remote, provably, (b) is
deterministic and declaration-driven rather than inferred from repo shape, matching the codebase's own
stated design ("a declared IR signal", :54-56), and (c) is a ~4-line change at the single decision point,
with no new configuration surface.

## Alternatives rejected

1. **Docs-only "push the harness to origin first" — explicitly rejected by the product owner.** Quoting the
   binding framing in OA-INSTALL-AUDIT-FINDINGS.md §2 F-2: "Documenting 'push first' would NOT close this
   finding — it would convert the fully-local mode into a GitHub-dependent mode; the fix has to be
   architectural (base worktrees on local trunk when the profile's code host is local-git)." A push
   requirement redefines "GitHub is not needed" as "GitHub is needed once per harness change", i.e. abolishes
   the guarantee for private/unpushable repos — the exact audience `simple-sdlc` exists for
   (`docs/OPERATIONS.md:66-68`).
2. **Documenting "remove/rename the git remote"** (the audit's own workaround, §1 item 16). Rejected:
   mutates operator-owned repo config, breaks the human's own fetch/push workflows, and still leaves the
   runner's behavior dependent on repo shape rather than declaration.
3. **An env-var override (e.g. `AUTONOMY_WORKTREE_BASE=HEAD`).** Rejected: leaves the violating behavior as
   the default for the normal case; the guarantee must hold with zero operator configuration.
4. **Heuristics — prefer local `HEAD` when it is ahead of / diverged from `origin/<trunk>` (merge-base
   check), or use `origin/<trunk>` only when the fetch succeeds.** Rejected: still performs the fetch
   (a network/GitHub dependency inside the fully-local mode — the violation itself, not just its symptom),
   is nondeterministic under network conditions, and infers intent from repo state when the intent is
   already declared in the IR.
5. **Have the PM pass an explicit `--base` at launch.** Rejected: pushes a substrate-internal decision into
   agent doctrine; the runner's own architecture note (:222-224) says the runner "derives nothing and
   decides nothing" *about the branch* — but the base-of-a-fresh-branch is precisely the isolation mechanism
   the runner owns, and it must be correct without any agent cooperating.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

All in a scratch dir. "Harness" = the files `compile simple-sdlc local .` writes (listed in
`.open-autonomy/generated.json`).

1. **The audit's exact scenario — repo WITH a GitHub-shaped remote, committed-but-unpushed harness → the
   worker's worktree contains the harness.** FAILS today; PASSES after.
   ```bash
   git init --bare /tmp/oa02/origin.git && git clone /tmp/oa02/origin.git /tmp/oa02/repo && cd /tmp/oa02/repo
   git commit --allow-empty -m base && git push origin main        # origin/main now resolves locally
   bun <checkout>/bin/autonomy-compile.ts simple-sdlc local .
   git add -A && git commit -m "install harness"                    # committed, NOT pushed
   bun scripts/runner.ts launch develop --ref 1 --branch agent/issue-1   # (termfleet may be absent; the
                                                                          # worktree is created before the
                                                                          # session spawn — assert on it)
   test -f .worktrees/agent-issue-1/.claude/skills/develop/SKILL.md      # after: exit 0; today: exit 1
   git -C .worktrees/agent-issue-1 rev-parse HEAD^                       # after: == the harness commit's
                                                                          # parent lineage (branched from
                                                                          # local HEAD, not origin/main)
   ```
   Today the worktree is based on `origin/main` (the empty base commit) and contains no
   `.claude/skills/develop/SKILL.md`.
2. **Zero network dependency for local-git.** With the same repo, break the remote
   (`git remote set-url origin https://127.0.0.1:1/nope.git`) and delete the branch/worktree from AC-1;
   re-run the launch. After: the worktree is created from local `HEAD` immediately, no fetch attempted, exit
   unaffected. Today: `git fetch` fails (best-effort) but the **stale clone-time `origin/main` ref still
   resolves** at :270, so the worktree is still based on it — proving the dependency is on remote *state*,
   not just network. Assert as in AC-1 plus (unit level) that no `fetch` is invoked when
   `codeHost !== 'github'` (via the extracted helper + a spy on `git`, or `GIT_TRACE=1` capture).
3. **Unit truth table for the extracted helper** (`bun test packages/substrate-local`):
   `worktreeBase('local-git', true, 'main') === 'HEAD'`; `worktreeBase('', true, 'main') === 'HEAD'`;
   `worktreeBase('github', true, 'main') === 'origin/main'`; `worktreeBase('github', false, 'main') ===
   'HEAD'`. FAILS today (helper doesn't exist); PASSES after.
4. **GitHub-code-host regression — behavior unchanged.** Same fixture but compile `simple-gh-sdlc local .`
   (manifest `codeHost: github`), push the harness, then advance `origin/main` past local HEAD (commit in a
   second clone + push, `git fetch` NOT run manually). Launch a worker: the fresh worktree's base ==
   `origin/main`'s new tip (the runner fetched). PASSES today; must still PASS after.
5. **Existing suite stays green:** `bun run check` (includes `check:compile`, substrate-local tests) passes.

## Dependencies (OA-XX blocks/blocked-by + reason; OA-02 and OA-03 are closely related — state the ordering you recommend)

- **OA-02 blocks OA-03 (recommended order: OA-02 first).** OA-03 adds a quickstart "commit the harness" step
  and a scheduler guard whose remediation message is "commit these paths". That instruction is *sufficient*
  only once OA-02 makes a local commit visible to workers on remote-having repos; before OA-02, the honest
  instruction on the normal repo would be "push", which is the owner-rejected framing. Land OA-02 first so
  OA-03's docs/guard text is written once, correctly ("commit", never "push", for local-git).
- **OA-02 is independent of OA-08** (no edge). But note the interaction: today OA-02's failure *manifests
  as* OA-08's zombie (skill missing from the origin-based worktree). OA-08's deterministic pre-check would
  have converted this audit's two silent days-of-debugging failures into one named error at launch —
  another reason both land.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-2 (including the binding product-owner quote), §1 phase 4 items
  15-16, §3 item 2, §5, and the addendum (remoteless run proving local-HEAD basing works end-to-end).
- Source verified by reading on branch `adoption-fixes-backlog`:
  `packages/substrate-local/src/runner-frontend.ts:114-119, 256-284, 314-316, 331, 472-473`;
  `packages/substrate-local/src/emit.ts:35, 227-229, 237`; `packages/core/src/manifest.ts:76`;
  `packages/core/src/ir.ts:76`; `profiles/simple-sdlc/ir.yml:19`;
  `profiles/simple-sdlc/skills/pm/SKILL.md:54-59`; `docs/OPERATIONS.md:26-27, 66-68, 151`.
- Emitted-file line offset note: the audit's grep target (emitted `scripts/runner.ts` ~166-172) is
  `open-autonomy@0.3.1`'s copy of this same source; current source lines are 262-271.
