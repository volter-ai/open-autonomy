# OA-18: `open-autonomy doctor` — a self-verifying local-runner install (prove the loop end-to-end before the operator trusts it)

**Finding:** §5 verdict — the single biggest change (see OA-INSTALL-AUDIT-FINDINGS.md)
**Priority:** P0-adjacent (umbrella)
**Fix target:** open-autonomy

## Problem

The audit's §5 verdict: *"make the install self-verifying end-to-end — a `doctor`/verify step that,
before declaring success, proves the actual failure chain this audit walked."* Today the local-runner
install path has exactly one safety net — `open-autonomy preflight` (bin/preflight.ts) — and it checks
two things (node-pty rebuilt, lockfile-vs-CI-Node), one of which false-alarms on a healthy box (F-5).
Everything downstream of `compile` is verified by nothing:

- a broken npm publish crashes the headline command for every adopter (F-1);
- `NODE_ENV=production` silently no-ops the tracker install (F-6);
- workspace shadowing silently substitutes the host repo's dev code for the runner SDK (F-4);
- the doc-default port may belong to someone else's provider, and the docs' `curl` probe misreads it (F-8);
- `claude --version` is prescribed as a sign-in check and passes logged-out (F-13);
- the overlay may be uncommitted (F-3), or committed but invisible from the `origin/<trunk>`-based
  worktrees the runner actually creates (F-2) — either way every worker dies at launch with
  `Unknown command: /develop`, visible only inside a tmux window, while the PM reports the dead runs as
  finished and re-dispatches forever.

An expert needed ~25–40 minutes of source-reading and `node_modules` surgery to diagnose this chain; a
compliant adopter is permanently stuck (audit §4, steps 3/5/7). `docs/INSTALL-AGENT.md` preaches "verify
the loop before declaring done" for the GitHub path; the local path — the one with no independent gate and
uncapped spend — has no equivalent. This spec adds one: a `doctor` verb that walks the audit's exact
failure chain, in order, and refuses to bless an install that would produce a zombie loop.

## Root cause (why every failure between compile and first worker is invisible today — cite the code paths that swallow each failure, verified file:line)

Each failure the audit hit is swallowed at a specific, verifiable point. Nothing between `compile` and the
first surviving worker ever reports failure to the operator:

1. **Broken publish crashes with no pre-publish smoke (F-1).** `bin/autonomy-compile.ts:13-15` statically
   imports **both** substrate compilers, so even `compile … local` loads
   `@open-autonomy/substrate-github`, whose module top-level does
   `readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'egress-guard.sh'))`
   (packages/substrate-github/src/emit.ts:33-36). The publish build copies `backend.mjs`,
   `runner-frontend.ts`, `control-backend.mjs`, and `runtime/` into `dist/` (scripts/build-cli.ts:24-27)
   but **not** `egress-guard.sh` — and `prepublishOnly` only runs the build (package.json:40); no CI ever
   executes a verb from the packed tarball. The failure is invisible until an adopter runs the tarball.
2. **Preflight false-alarms instead of catching real env failures (F-5, F-6).** `bin/preflight.ts:27-28`
   decides pty health by `existsSync` on `build/{Release,Debug}/pty.node` under a hardcoded
   top-level `node_modules` path — it never *loads* the module the way termfleet will (the
   prebuilt-multiarch package can load from its shipped `prebuilds/` with no `build/` dir at all, and npm
   may nest the module), so `preflight.ts:40` declares "rebuild FAILED — install the build toolchain" on a
   working box and the gate at `preflight.ts:114-115` tells a compliant user to stop. Meanwhile preflight's
   entire check surface is `ensureNodePty()` + `verifyLock()` (`preflight.ts:112-113`): no `NODE_ENV`/npm
   `omit` check, no devDeps-resolvable check, no workspace-shadowing check — so F-6 and F-4 pass straight
   through the only gate whose job this is.
3. **Worktree base is chosen silently, network fetch included (F-2).** The emitted runner
   (`packages/substrate-local/src/runner-frontend.ts`, shipped verbatim as `scripts/runner.ts` —
   emit.ts:35, 237) creates a new agent worktree in `ensureWorktree`
   (runner-frontend.ts:256-284): it runs a best-effort `git fetch origin <trunk>`
   (runner-frontend.ts:269, failures ignored by design) and bases the branch on `origin/<trunk>` whenever
   that ref exists (runner-frontend.ts:270), falling back to `HEAD` only on remoteless repos
   (runner-frontend.ts:266). Nothing prints which base was chosen, and nothing checks the harness files
   exist at that base — so a committed-but-unpushed overlay (F-2) or an uncommitted overlay (F-3) produces
   a worktree with no skills and no error.
4. **A worker that dies at launch reads as success, four layers deep.**
   - The backend's `launch()` returns `status: 'running'` the moment termfleet hands back a `terminalId`
     (packages/substrate-local/src/backend.mjs:60-70) — it never probes that the session survived its
     first command.
   - The frontend's skill-launch path discards the child's exit status entirely
     (runner-frontend.ts:363 — `spawnSync(...)` with `stdio: 'inherit'`, return value dropped, `launch()`
     returns `void`).
   - `run-agent.mjs` maps a launch **timeout** to exit 0 (emit.ts:198:
     `process.exit(r.error?.code === 'ETIMEDOUT' ? 0 : (r.status ?? 1))`).
   - The loop driver's `fireTick` ignores every schedule command's exit status (emit.ts:92-96).
   - A session whose harness rejected `/develop` and sat at a prompt maps to `status: 'done'`,
     `note: 'idle (turn complete)'` (backend.mjs:148; same mapping in runner.ts:30) — indistinguishable
     from a finished run — and the idle reaper then closes the window (emit.ts:156-160), destroying the
     only evidence (the terminal output). The PM's `list` shows nothing in flight, so it re-dispatches
     every tick, forever.
5. **Provider attachment is discovery-based and identity-blind (F-8).** The backend resolves its provider
   via `resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL })` (backend.mjs:25-27;
   runner.ts:39): with no pin it auto-discovers *any* live local provider, and with a pin it never verifies
   the thing answering on that port is *this install's* provider rather than a pre-existing one — on fleet
   dev boxes, the default condition (audit §3.5). `docs/OPERATIONS.md:122` still tells the operator to use
   the shared default port 7373.
6. **Auth advice verifies nothing (F-13).** `docs/OPERATIONS.md:107` prescribes `claude --version`, which
   succeeds logged-out; the first evidence of a logged-out CLI is a hung real launch ~45s in.
7. **The overlay's own integrity record exists but nothing reads it at install time.** Every compile writes
   a provenance manifest of exactly what it owns: `withGeneratedManifest`
   (packages/core/src/file-manifest.ts:32-35) records `Object.keys(out.generated)` + every `copies[].to` +
   itself into `.open-autonomy/generated.json` (file-manifest.ts:14, 22-28) — the same path set as
   `compiledPaths` (packages/core/src/ir.ts:89-91). It is consumed only by the upgrade prune
   (file-manifest.ts:39-46); no tool ever checks those files are present, committed, or visible from a
   worktree. The one place the commit requirement is stated is a doc blockquote
   (docs/OPERATIONS.md:45-46), outside the numbered quickstart steps (F-3, F-15).

Net: between `compile` (which now at least clobber-guards, autonomy-compile.ts:96-106) and the first
surviving worker, **every** failure mode is either swallowed (`fetch` best-effort, exit codes dropped,
dead-session→`done`) or checked by nothing at all. The operator's only instrument is `tmux attach`.

## Proposed fix (the doctor check list, each check: probe / pass-fail criterion / failure message / finding it catches)

### Home: a new `doctor` verb, not an extended preflight

Add `doctor` to the verb switch in `bin/open-autonomy.ts:40-62`, delegating to a new `bin/doctor.ts`
(published inside `dist/cli.js` like every other verb). **Why not extend preflight:**

- **Different lifecycle point.** Preflight's documented contract is *pre-compile* ("run after installing
  the runner deps, BEFORE committing the harness" — preflight.ts:3-5); doctor's core checks (5–7) require
  a compiled, committed install with a manifest, a schedule, and a runnable runner. Bolting them onto
  preflight makes the one existing verb fail-by-design at the stage the docs tell you to run it.
- **Mutating vs proving.** Preflight *fixes* (rebuilds node-pty, regenerates the lockfile —
  preflight.ts:38, 99-105). Doctor must be **read-only** (sole exception: a throwaway probe
  worktree/branch it deletes), so its exit code is pure evidence. A verb that mutates while verifying
  can't be trusted as a gate — and preflight's gate already cries wolf (F-5).
- **One operator story anyway.** Doctor *includes* read-only versions of preflight's environment checks
  (check 2 below, with F-5 fixed), so the adopter's final gate is one command. Preflight remains the
  earlier "make it install-ready" fixer; its docs and `--help` line (bin/open-autonomy.ts:20) gain
  "then prove the install with `open-autonomy doctor`". Folding preflight's mutations into a future
  `doctor --fix` is optional follow-up, out of scope here.

### CLI contract

```
npx open-autonomy doctor [--live] [--json] [--branch-prefix oa-doctor]
```

- Runs checks 1→7 **in order** (the audit's failure chain order). A failed check does not stop the run
  unless later checks depend on its artifact (5 gates 6; 5–6 gate 7). Every check reports
  `PASS | FAIL | WARN | SKIP (reason)`.
- Exit 0 iff no `FAIL`. Exit 1 on any `FAIL`. Exit 2 on usage error. `--json` emits
  `{ checks: [{id, status, detail, finding}], verdict }` for CI/agents (INSTALL-AGENT.md can then gate on
  it mechanically).
- **Read-only guarantee:** no file in the repo is created/modified except the probe worktree under
  `.worktrees/` + its branch, both removed on exit (including failure paths) via
  `git worktree remove --force` + `git branch -D`.
- **Spend guarantee:** without `--live`, doctor launches no agent session and makes no model call.

### The checks

**Check 1 — the CLI runs from its installed artifact (`self`).**
*Probe:* doctor's own process **is** the installed artifact, so it self-exercises the publish: dynamically
import every verb module and both substrate compilers, verify every `import.meta.url`-relative data file
the emit paths read is present and readable next to the running bundle (`backend.mjs`,
`runner-frontend.ts`, `control-backend.mjs`, `runtime/*`, `egress-guard.sh` — the set
scripts/build-cli.ts:24-27 must ship, plus the file it currently forgets), then dry-run-compile every
bundled profile to every declared target **in memory** (the no-`outDir` path of autonomy-compile.ts:150 —
writes nothing). Print installed version vs the repo's pinned `open-autonomy` range.
*Pass:* all imports resolve, all data files readable, all bundled profiles compile in memory.
*Fail message:* `FAIL self: this open-autonomy install (<version>) is missing <file> from its published
artifact — every 'compile' invocation will crash (ENOENT). This is a broken publish, not your repo: pin
the last known-good version (npm install -D open-autonomy@<prev>) and report the version upstream.`
Version skew (installed vs docs `VERSION`) is a `WARN` naming both (F-14).
*Catches:* **F-1** (would have named `dist/egress-guard.sh` and the culprit version at minute ~1 instead of
the audit's trial-and-error downgrade), **F-14** (warn).

**Check 2 — toolchain/env sanity (`env`).**
*Probes (all read-only; supersedes preflight's checks with the F-5 fix):*
  a. Node ≥ `engines.node` (22.18), git ≥ 2.5 (worktrees), tmux present, bun present (the emitted
     `scripts/runner.ts` and the ztrack preset run under bun — runner-frontend.ts:107 uses `Bun.YAML`).
  b. **devDeps actually installed:** if `NODE_ENV=production` or npm config `omit` includes `dev`
     (`npm config get omit`), and the repo's `package.json` declares devDependencies the profile needs
     (ztrack for the simple-* presets), FAIL up front; independently, `createRequire(<repo>/package.json)
     .resolve('ztrack')` must succeed.
  c. **The pty module termfleet ACTUALLY depends on loads:** resolve `termfleet` →
     `@termfleet/core` from the repo, read *their* dependency graph to find the pty package they declare
     (never a hardcoded name — the F-5 bug class), then `node -e "require('<resolved pty path>')"` in a
     child process: the native binding must **load**, not merely exist on disk. No `npm rebuild`, no
     mutation — report only.
  d. **Workspace shadowing:** `realpath` the resolved `termfleet`/`@termfleet/core` (and the repo's own
     `package.json` name vs the bare specifiers `scripts/autonomy-runner.mjs` imports —
     backend.mjs:15-16). If any resolves into the host repo's own workspace/source tree instead of a
     registry install, or the host package name collides with a runner dependency (Node self-reference),
     FAIL.
*Pass:* a–d all hold.
*Fail messages (each names the culprit):*
  b: `FAIL env: NODE_ENV=production — 'npm install -D ztrack' silently installs nothing on this box.
  Fix: NODE_ENV=development npm install -D ztrack (or npm config delete omit).`
  c: `FAIL env: termfleet's pty module <pkg> is installed but does not load under node <v>
  (<loader error>) — the provider will crash at first launch. Fix: npm rebuild <pkg> …`
  d: `FAIL env: '@termfleet/core' resolves to your repo's own workspace at <path>, shadowing the
  published dependency — the runner would execute your in-development code as its SDK. npm cannot prefer
  the registry package over a workspace link; run the loop from a directory outside this workspace, or
  rename/version-fence the colliding package.`
*Catches:* **F-5** (and fixes its false alarm: load-test, actual dependency name, no bogus toolchain
advice), **F-6**, **F-4** (converted from a buried `ERR_PACKAGE_PATH_NOT_EXPORTED`/silent substitution to
a named diagnosis).

**Check 3 — provider/console reachability on the CONFIGURED ports (`provider`).**
*Probe:* resolve the provider exactly as the backend will —
`resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL })` (backend.mjs:25-27) — then call the
real SDK surface a launch needs (`ProviderClient.snapshot()`), never a bare `curl /` (the probe
INSTALL-AGENT prescribes misreads a live provider as "nothing running" — F-8). Verify **identity**: the
answering provider's name/prefix matches this install's configuration; if `TERMFLEET_PROVIDER_URL` is
unset, WARN that auto-discovery is in effect and print which provider was discovered and who owns it. If
the configured (or doc-default 7373/7402) port is occupied but the occupant is not the expected provider —
wrong prefix, wrong kind, or not termfleet at all — FAIL and identify the occupant (`lsof -i :<port>` pid +
command; if it speaks termfleet, its name/prefix/session count).
*Pass:* snapshot succeeds against a provider whose identity matches the pin; console (if configured)
answers likewise.
*Fail message:* `FAIL provider: port 7373 is answering but it is NOT this install's provider — it is
termfleet provider '<name>' (prefix '<p>', pid <pid>, <n> sessions, user-global session store). Attaching
this loop to it would grant launch rights on a shared box. Fix: run your own console/provider on
repo-unique ports and pin TERMFLEET_PROVIDER_URL=<url> everywhere the loop runs.`
*Catches:* **F-8** (foreign-occupant identification; pin verification), and the discovery half of F-12's
"times out against a provider it never started".

**Check 4 — coding-CLI auth actually verified (`auth`).**
*Probe:* never `--version` (F-13). For the configured harness (`TERMFLEET_AGENT`, default per
`runner-defaults.mjs`): use the CLI's own non-spending auth introspection where it exists (e.g.
`claude auth status` / `codex login status`) and require an authenticated identity in the output. If the
installed CLI version has no introspection command, report `WARN auth: cannot verify sign-in without a
model call — re-run with --live to prove it` (and `--live`'s check 7 then proves it for real, since a
logged-out CLI cannot survive launch).
*Pass:* introspection exits 0 and reports a signed-in identity.
*Fail message:* `FAIL auth: the '<claude>' CLI is installed but NOT signed in ('claude --version'
succeeding does not mean signed in). Fix: run 'claude' then '/login', and re-run doctor.`
*Catches:* **F-13**.

**Check 5 — harness integrity, proven from a FRESHLY CREATED worktree (`harness`).**
This is the load-bearing check; it subsumes F-2 and F-3 in one probe.
*What "every compile-owned file" means (cited):* the paths recorded in `.open-autonomy/generated.json` —
written by every compile via `withGeneratedManifest` (packages/core/src/file-manifest.ts:32-35), i.e. all
of `out.generated` + every `copies[].to` + the manifest itself (file-manifest.ts:22-28), the same set as
`compiledPaths()` (packages/core/src/ir.ts:89-91). Doctor reads it with `readGeneratedManifest`
(file-manifest.ts:39-46); an install with no manifest is `FAIL harness: no
.open-autonomy/generated.json — this directory is not a compiled install (or predates the manifest); run
'npx open-autonomy compile <profile> local .'`.
*Probe, in order:*
  a. every manifest path exists in the working tree;
  b. every manifest path is tracked and clean (`git ls-files --error-unmatch` + empty
     `git status --porcelain -- <paths>`);
  c. create a real worktree **through the runner's own code path** — NOT a doctor reimplementation of the
     base-ref logic. Mechanism: `ensureWorktree` (runner-frontend.ts:256-284) is exported from the emitted
     `scripts/runner.ts` behind a new probe entry (`bun scripts/runner.ts worktree-probe <branch>`; the
     export is a small runner-frontend.ts change coordinated with OA-02, which is rewriting the base-ref
     selection at runner-frontend.ts:261-271 anyway). Doctor invokes the *install's* `scripts/runner.ts`
     with a throwaway branch `oa-doctor/probe-<epoch>`, so the probe exercises exactly the fetch/base
     decision a real dispatch would — pre-OA-02 the origin/<trunk> behavior, post-OA-02 the fixed
     local-trunk behavior — and can never drift from it. Doctor records which base ref/SHA the runner
     chose (the probe verb prints it);
  d. inside that fresh worktree, every manifest path exists with bytes identical to the main checkout;
  e. cleanup: `git worktree remove --force` + delete the probe branch (also on failure/signal).
*Pass:* a–d all hold.
*Fail messages:*
  b: `FAIL harness: <n> compile-owned files are uncommitted (agents run in git worktrees, which see only
  committed files — every worker will die at launch): <list>. Fix: git add <paths> && git commit.`
  d: `FAIL harness: the runner based its worktree on <base> @ <sha>, which is missing <n> compile-owned
  files present on your local trunk: <list>. Your install's runner bases new worktrees on the fetched
  remote trunk whenever an 'origin' remote exists (scripts/runner.ts ensureWorktree) — so on this repo the
  harness is invisible to agents until it reaches origin/<trunk>. This contradicts the fully-local
  guarantee (known defect, fixed by OA-02); until your install carries that fix: push the harness branch,
  or upgrade open-autonomy.`
*Catches:* **F-2** (the origin-vs-local-trunk wedge — named, with the exact base SHA, in seconds instead
of the audit's `runner.ts`-source-reading + remote-rename), **F-3** (the uncommitted-overlay wedge),
and — because it uses the manifest — the "what did compile even write" half of F-9's missing-manifest
complaint.

**Check 6 — skill resolution in that worktree (`skills`).**
*Probe:* in check 5's probe worktree (SKIP if 5 could not create one), for every non-script,
non-human agent in `.open-autonomy/autonomy.yml`: the launch prompt file
`scripts/prompts/<harness>/<role>.txt` exists (emit.ts:206-216 keys prompts by role), its content
references skill `<behavior>` (`/name` for claude, `$name` for codex), and
`.claude/skills/<behavior>/SKILL.md` + `.codex/skills/<behavior>/SKILL.md` exist **in the worktree**
(emit.ts:283-284 is where compile installs them) with frontmatter `name:` equal to the folder — the same
contract `validateSkillFrontmatterIn` enforces at compile time (packages/core/src/materialize.ts:69-82),
now re-proven against what an agent will actually see at dispatch time.
*Pass:* every dispatchable agent's prompt resolves to a name-matching skill file in the worktree.
*Fail message:* `FAIL skills: agent 'develop' would die at launch with "Unknown command: /develop" —
.claude/skills/develop/SKILL.md is missing from the agent worktree (present on your working tree but not
at the worktree base; see the 'harness' check) [or: its frontmatter name '<x>' ≠ folder 'develop'].`
*Catches:* the **F-3** symptom by name (the audit's `Unknown command: /develop`, diagnosed today only via
tmux capture), plus post-compile skill drift no existing check covers.

**Check 7 — `--live`: one real tick that launches a worker which SURVIVES launch (`live`).**
Spend-gated behind the explicit `--live` flag (one real coding-CLI session; on a metered account this
costs money — say so in `--help`).
*Probe:* launch one session through the **same path a PM dispatch takes** — `run-agent.mjs` →
`scripts/autonomy-runner.mjs launch` → `ProviderClient.createAgentWindow` (emit.ts:172-199,
backend.mjs:30-71) — but with a doctor-owned payload: `AUTONOMY_PROMPT_DIR` pointed at a temp prompt dir
whose prompt is `Reply with exactly DOCTOR-OK and nothing else, then stop.`, launched in check 5's probe
worktree with the pinned env (proving the `TERMFLEET_PROVIDER_URL` pin is inherited by child launches —
the audit's unverifiable F-8 tail). Then poll `runner list`/`get` + the termfleet snapshot: the session
must still exist after a survival window (default 30s) **or** its captured terminal output must contain
`DOCTOR-OK`. On failure, capture and print the window's terminal contents *before* any reaper can close it
— the evidence that today dies inside tmux. Always `cancel` the session and clean up.
*Pass:* the session survives the window or emits `DOCTOR-OK`.
*Fail message:* `FAIL live: the worker died within <n>s of launch. Terminal capture: <first ~20 lines —
e.g. "Unknown command: /develop", a logged-out browser prompt, or a provider pty crash>. The scheduler
would have reported this run as finished and re-dispatched it every tick.`
*Catches:* the end-to-end composition of **F-2/F-3** (dead-at-launch worker made visible with its actual
terminal output), the launch half of **F-12** (osascript/iTerm noise and provider timeouts surface here
with the capture attached), **F-13** when check 4 could only WARN, and the pin-inheritance tail of
**F-8**. This is the local-path equivalent of INSTALL-AGENT's "verify the loop before declaring done".

### Finding coverage map

| Doctor check | Audit findings caught |
|---|---|
| 1 self | F-1 (fail), F-14 (warn) |
| 2 env | F-4, F-5 (incl. removing its false alarm), F-6 |
| 3 provider | F-8 (foreign occupant, pin) |
| 4 auth | F-13 |
| 5 harness | **F-2, F-3** (subsumed by one worktree probe), manifest half of F-9 |
| 6 skills | F-3's symptom (`Unknown command: /develop`), skill drift |
| 7 live | F-2/F-3 end-to-end, F-8 pin inheritance, F-12 launch noise, F-13 fallback |

Out of scope for doctor (owned by sibling specs): F-7 day-one backlog fence (a policy fix, not a health
check), F-9 collision detection at compile time, F-10 `--help` hint, F-11 tracker onboarding, F-15/F-17
docs/install-inertness. Doctor's failure messages reference their fixes where relevant.

### Docs wiring

`docs/OPERATIONS.md` local-runner quickstart gains a final numbered step — `npx open-autonomy doctor`
(and `doctor --live` before leaving the loop unattended) — and `docs/INSTALL-AGENT.md`'s verify phase
replaces its hand-rolled probes (including the misleading `curl` port probe, F-8) with `doctor --json`.

## Alternatives rejected

1. **Extend `preflight` instead of adding a verb.** Rejected: preflight is pre-compile and mutating (see
   "Home" above); its contract, run-order position in the docs, and current false-alarm reputation (F-5)
   all conflict with a trustworthy post-install gate. Doctor absorbs preflight's checks read-only instead.
2. **Documentation fix ("commit and push the overlay; check your ports; log in first").** Rejected by the
   audit itself: F-2's product-owner ruling says documenting "push first" converts fully-local into a
   GitHub-dependent mode; and the audit showed load-bearing facts scattered across three docs are missed
   (F-15). A gate that *executes* the requirements can't be skimmed past.
3. **Doctor reimplements the worktree-base logic (read `ensureWorktree`'s rules and mimic them).**
   Rejected explicitly: OA-02 is changing that logic (runner-frontend.ts:261-271); a mimic drifts the day
   it lands and doctor would then bless installs the runner wedges (or vice versa). The probe must execute
   the install's own `scripts/runner.ts` entry point.
4. **Make the scheduler/PM detect dead-at-launch workers instead (fix the swallowing at
   backend.mjs:148 / emit.ts:92-96,198).** Valuable, but it's a runtime-observability fix that reports
   failure *after* spend starts and *after* the operator walked away; it complements, not replaces, an
   install-time gate. (It also belongs to F-7's no-failure-detection note, a sibling item.)
5. **A `--live` default-on real tick (`scheduler/run.mjs --once`).** Rejected: a real tick lets the PM
   sweep an existing backlog (exactly F-7's uncapped-spend hazard) and spends without consent. Doctor's
   live probe launches a doctor-owned payload through the same code path instead, and only behind an
   explicit flag.
6. **Ship doctor as an emitted install script (`scripts/doctor.mjs`) rather than a CLI verb.** Rejected:
   check 1's whole point is proving the *published CLI artifact* runs — an emitted script can't self-test
   the tarball, and a broken publish (F-1) would break the emitter before any script exists. The CLI verb
   also runs pre-compile (checks 1–4) where no emitted file exists yet.

## Acceptance criteria (numbered, testable; include one AC per audit failure the doctor must catch, phrased as 'on a repo in state X, doctor exits non-zero naming Y')

1. **F-1:** On a repo whose installed `open-autonomy` package is missing a bundle data file (simulate:
   delete `egress-guard.sh` beside the installed `dist/cli.js`), `doctor` exits non-zero naming the
   missing file, the installed version, and "broken publish" with the pin-a-known-good remediation — for
   *any* target substrate, including `local`.
2. **F-6:** On a repo with `ztrack` in `devDependencies` but absent from `node_modules`, run with
   `NODE_ENV=production` (or npm `omit=dev`), `doctor` exits non-zero naming `NODE_ENV`/`omit` as the
   culprit and printing the `NODE_ENV=development npm install -D ztrack` fix.
3. **F-5 (both directions):** On a box where the pty module termfleet resolves fails to `require()`,
   `doctor` exits non-zero naming the *actual* resolved pty package and the loader error; on a healthy box
   where that module loads from `prebuilds/` with no `build/Release/pty.node` present, the env check
   PASSES (no false alarm, no build-toolchain advice).
4. **F-4:** On an npm-workspaces repo containing a workspace package named `@termfleet/core` (or whose
   root package is named `termfleet`), `doctor` exits non-zero naming the shadowing workspace path and
   stating the runner would execute the host's dev code as its SDK.
5. **F-8:** With the configured provider port occupied by a different termfleet provider (wrong
   name/prefix) or a non-termfleet process, `doctor` exits non-zero identifying the occupant (pid/command,
   and provider name/prefix when it speaks termfleet) and recommending repo-unique ports + a
   `TERMFLEET_PROVIDER_URL` pin; a plain HTTP 404 from the port is never reported as "nothing running".
6. **F-13:** With the coding CLI installed but signed out, `doctor` exits non-zero (or WARNs with an
   explicit "unverified — use --live" when the CLI offers no introspection) stating the CLI is not signed
   in; at no point does doctor cite `--version` success as auth evidence, and `doctor --live` on the same
   box exits non-zero with the captured login prompt.
7. **F-3:** On a repo where the compiled overlay is materialized but any compile-owned file (per
   `.open-autonomy/generated.json`) is untracked or dirty, `doctor` exits non-zero listing exactly those
   files and stating that agents run in worktrees that see only committed files.
8. **F-2:** On a repo with a GitHub `origin` whose `origin/<trunk>` lacks the committed-locally overlay,
   `doctor` (running against a pre-OA-02 runner) exits non-zero naming the base ref + SHA the runner chose
   and the compile-owned files missing from it; against a post-OA-02 runner on the same repo, the same
   check PASSES with no doctor code change — proven by asserting doctor invoked the install's own
   `scripts/runner.ts` worktree entry (not a reimplementation) in both runs.
9. **Skill resolution:** On a repo whose committed state lacks (or name-mismatches the frontmatter of)
   `.claude/skills/develop/SKILL.md`, `doctor` exits non-zero stating that agent `develop` would die at
   launch with `Unknown command: /develop`.
10. **Live tick:** On a fully healthy install, `doctor --live` launches exactly one session through
    `run-agent.mjs`→`autonomy-runner.mjs`, reports it survived (or emitted `DOCTOR-OK`), cancels it, and
    exits 0; on a repo in state 7 or 8, `doctor --live` exits non-zero and its output includes the
    captured terminal contents of the dead session.
11. **Spend gate:** Without `--live`, doctor performs no agent-session launch and no model call
    (verifiable: provider session count unchanged; no coding-CLI process spawned other than auth
    introspection).
12. **Read-only:** After any doctor run (pass or fail, including a `kill -INT` mid-run), `git status` in
    the target repo is unchanged and no `oa-doctor/*` branch or `.worktrees/oa-doctor-*` worktree remains.
13. **Reporting:** All independent checks report even when an earlier one FAILs (dependent checks report
    `SKIP` with the blocking check named); `--json` output validates against the documented shape and maps
    each check to its finding IDs; exit code is 0 iff no FAIL.
14. **F-14:** When the installed package version differs from the version the local docs describe, doctor
    prints both as a WARN without failing the run.
15. **Ordering:** The human-readable output lists checks in the audit's failure-chain order
    (self → env → provider → auth → harness → skills → live), so the first FAIL an operator reads is the
    first wall they would have hit.

## Dependencies

Doctor **consumes** two sibling fixes but is **buildable in parallel with stubs**:

- **OA-02 (worktree base / F-2 architecture fix)** — shared seam: the exported worktree-probe entry point
  on the emitted `scripts/runner.ts` (the `ensureWorktree` export around runner-frontend.ts:256). OA-02
  rewrites the base-ref selection inside that function; OA-18 only needs the function *callable and
  base-reporting* from outside. Build order: land the export + probe verb first (a small, behavior-neutral
  change either spec can carry — recommend OA-02 carries it since it owns the file), then OA-18's check 5
  binds to it. Doctor built against the pre-OA-02 runner is still correct — it reports the F-2 wedge as a
  FAIL, which is the truth until OA-02 lands.
- **OA-01 (publish integrity / F-1)** — check 1 is meaningful immediately (it fails on today's 0.4.x
  artifacts, correctly), but its long-term value is as OA-01's release gate: OA-01's tarball-smoke CI
  should run `open-autonomy doctor` (checks 1–2, no repo needed for 1) from the packed tarball, making
  every future publish self-verifying. Stub for parallel build: run check 1 against a locally packed
  `npm pack` artifact in tests.

Recommended ordering: **OA-01 and OA-02 fix; OA-18 proves.** Build OA-18's scaffold + checks 1–4 and 6
immediately (no dependency); land the runner probe export with OA-02 and bind check 5; wire check 1 into
OA-01's release CI last. Ship doctor to adopters only after OA-01 (otherwise `npx open-autonomy doctor`
itself crashes at import on the broken 0.4.x artifacts — the strongest argument for check 1 existing).

Non-dependencies, for the record: F-7's day-one fence, F-9's compile manifest/collision UX, and the
scheduler's failure-detection gap are sibling specs; doctor references them in failure text but does not
block on them.

## Provenance

- Report: `/workspace/open-autonomy-fixes/OA-INSTALL-AUDIT-FINDINGS.md` — §5 verdict (the self-verifying
  install, lines 128–134), §1 phases 3–4 (the failure chain, lines 37–62), §2 F-1…F-15, §4 stuck-log.
- Code read (all verified at branch `adoption-fixes-backlog`):
  - `bin/open-autonomy.ts:16-27` (HELP/verbs), `:40-62` (verb switch — doctor's insertion point).
  - `bin/preflight.ts:2-5` (pre-compile contract), `:27-28` (existence-not-load pty check, hardcoded
    top-level path), `:38-40` (rebuild + FAILED warn), `:112-115` (check surface + exit gate).
  - `bin/autonomy-compile.ts:13-15` (static import of both substrates), `:69` (compile selection),
    `:96-106` (clobber guard), `:150` (dry-run path list).
  - `packages/substrate-github/src/emit.ts:33-36` (module-top-level `readFileSync` of `egress-guard.sh`).
  - `scripts/build-cli.ts:16-27` (bundle + data-file copies; `egress-guard.sh` absent),
    `package.json:24-33,40` (bin → `dist/cli.js`, files, `prepublishOnly` = build only).
  - `packages/substrate-local/src/runner-frontend.ts:19` (emitted verbatim as `scripts/runner.ts`),
    `:256-284` (`ensureWorktree`), `:261-271` (fetch + `origin/<trunk>` base selection, HEAD fallback),
    `:314-316` (branch→worktree launch), `:363` (skill launch, exit status discarded),
    `:104-109` (manifest read).
  - `packages/substrate-local/src/emit.ts:35,237,239` (verbatim emission of runner frontend/backend),
    `:66-167` (LOOP_DRIVER; `fireTick` ignores exit codes at 92-96; reap at 156-160),
    `:172-199` (RUN_AGENT_DRIVER; ETIMEDOUT→exit 0 at 198), `:206-216` (prompt files `/name`),
    `:283-284` (skill copies to `.claude/skills`/`.codex/skills`), `:265` (schedule).
  - `packages/substrate-local/src/backend.mjs:15-16` (bare `termfleet` imports — self-reference hazard),
    `:25-27` (`resolveDefaultProvider` discovery), `:30-71` (launch returns `running` on terminalId),
    `:139-149` (`sessionOf`; dead-idle → `done` at 148).
  - `packages/core/src/ir.ts:89-91` (`compiledPaths`), `packages/core/src/file-manifest.ts:14,22-46`
    (`GENERATED_MANIFEST_PATH`, `withGeneratedManifest`, `readGeneratedManifest`),
    `packages/core/src/materialize.ts:7-18,69-82` (`materialize`, `validateSkillFrontmatterIn`).
  - `profiles/simple-sdlc/ir.yml` (targets `[local]`, codeHost `local-git`, PM cron + dispatch workers,
    resource `.claude/settings.json` at line 81).
  - `docs/OPERATIONS.md:45-46` (commit requirement as a blockquote outside the steps), `:107`
    (`claude --version` advice), `:122,137` (port 7373 default), `:168` (`--once` verify advice).
- Related specs (this backlog): OA-01 (publish/F-1), OA-02 (worktree base/F-2); doctor consumes both,
  see Dependencies.
