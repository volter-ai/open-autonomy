# OA-13: Happy-path noise that reads as breakage — Linux iTerm-adapter crash on console start, and the undocumented `-y` on the sanity-check launch

**Finding:** F-12 — the console attempts the macOS-only iTerm driver on Linux (osascript ENOENT stack trace + supervisor timeout); the sanity-check launch needs an undocumented `-y` when any panel exists (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** termfleet (cross-repo), plus one open-autonomy-owned docs line-fix

## Problem

Two first-contact moments on the documented happy path emit output indistinguishable from a broken install (audit §1 steps 5-6):

1. **On Linux, `npx termfleet console serve …` prints a crash.** The console, by default, tries to supervise a macOS-only **iTerm** provider: the operator sees an unhandled-rejection stack trace containing `spawnSync osascript ENOENT`, followed ~30s later by a supervisor failure for a provider that never existed on this OS. A cold adopter reading OA's quickstart (which says nothing about iTerm) reasonably concludes the install is broken. It is not — the virtual-tmux provider they actually need is fine.
2. **The docs' sanity check silently requires `-y`.** OA's quickstart says to verify wiring with `npx termfleet claude new --prompt "say hello"` (`docs/OPERATIONS.md:129`). When the provider already has *any* panel — true after the very first launch, and always true on a shared provider — the command refuses with a panel-review report ending "…add -y to the new command". The flag appears in no OA doc, so the documented verification step fails on its second-ever run.

## Root cause (verified citations; mark termfleet-dist citations as such)

The defect lives in the **termfleet** package, not in this repo. Root-caused at observed-behavior level from the published artifact (all citations below are termfleet-dist: npm `termfleet@0.2.0` / `@termfleet/core@0.2.1`, installed into the audit scratchpad — NOT this repo's source):

**(1) Linux iTerm attempt — no platform gate on the default local adapter:**

- The console's first-run settings unconditionally include an iTerm adapter: `termfleet/dist/server/console-settings.js:12-14` — `const initialLocalAdapters = [{ kind: "iterm", port: standardLocalAdapterPorts.iterm }]` (port 7375, :7-10), persisted into `~/.termfleet/settings.json` and used as `localAdapters` (:30) and even seeded into `chat.providers` (:24). There is **no `process.platform` check anywhere on this path** — the only darwin gates in the whole dist are in `wezterm-driver.js:414,514,523` and the `openBrowser` helper (`cli.js:691`).
- `console serve` reconciles those adapters into running providers: `cli.js:789` passes `localAdapters: resolveLocalAdapters(flags, settings)` into `startConsoleServer`, which calls `fleetLiveness.reconcileManagedProviders(localAdapters)` (`termfleet/dist/server/console-server.js:220`) → `ProviderSupervisor.reconcile/ensure` (`server/provider-supervisor.js:26,64-72`) → the controller **spawns a child `provider serve --kind iterm` subprocess** (`server/provider-controllers.js:84,188-196`).
- Inside that child, the iTerm paths call `osascript` unconditionally: `termfleet/dist/lib/iterm.js:2-5` (`assertIterm2()` → `requireCommand("osascript")` + `run("osascript", …)`) and `termfleet/dist/instance/drivers/iterm-driver.js:415,445,461,508,587,655,731` call `run("osascript", …)` **without** a preceding `requireCommand`. The shared `run()` helper re-throws the raw spawnSync error (`@termfleet/core/dist/lib/exec.js:15-32`: `throw result.error`), whose message on Linux is `spawnSync osascript ENOENT` — thrown inside async provider code with no catch → the **unhandled-rejection stack trace** the audit saw (the child's stdio is surfaced through the console process).
- The child never becomes healthy, so the supervisor's post-spawn wait times out: `waitForProviderHealth` polls `/healthz` against a 30s deadline (`server/provider-controllers.js:306-315`) and the failure surfaces as `[termfleet:supervisor:ensure.failed] http://127.0.0.1:7375: …` (`server/provider-supervisor.js:70`) — the "supervisor timeout for a provider it never started".

**(2) `claude new` refuses without `-y` whenever any panel exists:**

- `termfleet/dist/cli.js:1836-1850` — `assertProviderIsReadyForNew(flags)`: returns immediately iff `flags.y === true`; otherwise it snapshots the provider and, if `snapshot.windows.length > 0`, **throws** the panel report built by `formatExistingPanelsReport` (`cli.js:1868-1881`): "Provider already has N panel(s). Reuse an existing panel unless creating another agent is intentional. … Create another panel only after reviewing the existing panels: add -y to the new command."
- It guards every `new` path (`cli.js:1528,1595,1714`); `-y` is parsed as a boolean at `cli.js:2006`.
- The behavior itself is a deliberate agent-facing guard, not a bug — the defect is (a) it presents as a thrown error (nonzero exit, error-styled output) on a *human* sanity check, and (b) **OA's docs omit the flag**: `docs/OPERATIONS.md:129` (quickstart sanity check), `docs/OPERATIONS.md:333` (troubleshooting re-run), `docs/INSTALL-AGENT.md:240` (phase-3 step 7 comment: `sanity-check: npx termfleet claude new --prompt "say hi"`), `docs/INSTALL-AGENT.md:322-323` (failure-modes re-run) — none carries `-y`. These four lines are the open-autonomy-owned piece of this finding.

## Proposed fix

**termfleet repo (cross-repo issue — file with the citations above so the builder lands directly on the code):**

1. **Platform-gate the default local adapters**: `initialLocalAdapters` (console-settings.js) should include the iTerm adapter only when `process.platform === "darwin"` (mirroring the existing wezterm-driver darwin checks); on other platforms default to `[]` (or `virtual-tmux` if a managed default is desired). Also skip/strip a persisted iterm adapter on non-darwin at `resolveLocalAdapters` time with one info line ("iTerm adapter skipped: requires macOS"), so boxes with an already-seeded `~/.termfleet/settings.json` heal too.
2. **Fail fast and clean in `provider serve --kind iterm` on non-macOS**: an upfront guard (`process.platform !== "darwin"` → clear one-line error naming the requirement, nonzero exit) instead of an unhandled `spawnSync osascript ENOENT` rejection deep in the driver; add the missing `requireCommand("osascript")` (which already produces a human message, `@termfleet/core/dist/lib/exec.js:9-14`) before the raw `run("osascript", …)` call sites in `iterm-driver.js`.
3. **Supervisor messaging**: when the spawned provider child *exited* (vs never answered), say so — "provider subprocess exited (see its error above)" instead of only the 30s health timeout, so the causal error and the timeout don't read as two unrelated failures.
4. **`new` guard ergonomics**: present the existing-panels refusal as guidance (stdout, exit code distinct from a crash) rather than a thrown error with a stack, and mention `-y` in `termfleet claude new --help`.

**open-autonomy repo (this repo — docs only):**

5. Add `-y` to every documented sanity-check launch, with a half-line of why: `npx termfleet claude new -y --prompt "say hello"` ("`-y` skips the existing-panels review prompt — required whenever the provider already has any panel"). Exact lines today: `docs/OPERATIONS.md:129`, `docs/OPERATIONS.md:333`, `docs/INSTALL-AGENT.md:240`, `docs/INSTALL-AGENT.md:322-323`.

## Alternatives rejected

- **Document the Linux stack trace as "benign noise" in OA's docs instead of fixing termfleet** — leaves every non-macOS adopter's first command printing a crash; "ignore the scary output" instructions are exactly the docs-vs-artifact seam the audit flags (and the onboarding surface already carries one such apology at `docs/INSTALL-AGENT.md:296-298` for a different case). The termfleet fix is small and root-causal. The docs `-y` fix, by contrast, IS taken (the guard is intentional behavior, not a defect to remove).
- **Have OA's quickstart pass `--no-auto-local-adapters` to `console serve`** — works today (`termfleet/dist/cli.js:797` supports it) and is a reasonable *interim* docs mitigation, but it only shields OA-following users; any other `console serve` invocation on the box still crashes, and it papers over a default that is wrong on ~every fleet box. Acceptable as a stopgap line in the same docs edit if the termfleet release lags; not the fix of record.
- **Remove the `-y` guard in termfleet** — the guard exists to stop agents from stampeding panels on a shared provider (the report text is written to an agent audience); removing it trades a docs paper-cut for a real multi-agent footgun.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **(termfleet) Linux console start is clean.** On a Linux box with a fresh `TERMFLEET_HOME`: `npx termfleet console serve --name t --port 7473 &`; capture 45s of output. It contains no `osascript`, no `ENOENT`, no unhandled-rejection stack, and no `[termfleet:supervisor:ensure.failed] http://127.0.0.1:7375` line; at most one info line noting the iTerm adapter is macOS-only. **Fails today** on termfleet@0.2.0 (all four appear); passes after.
2. **(termfleet) `provider serve --kind iterm` on Linux fails fast and clean.** `npx termfleet provider serve --kind iterm --name x --port 7475`; expect nonzero exit within ~2s, a single-line error naming the macOS/osascript requirement, and no stack trace. Fails today (unhandled rejection + hang until killed); passes after.
3. **(termfleet) Existing macOS behavior unchanged.** On macOS with iTerm installed, `console serve` still brings up the iTerm adapter on 7375 (`curl -sS http://127.0.0.1:7375/healthz` → `{"ok":true,"provider":"iterm",…}`). Passes today; must still pass after.
4. **(open-autonomy) Docs carry `-y`.** `grep -n 'claude new' docs/OPERATIONS.md docs/INSTALL-AGENT.md` — every launch snippet includes `-y`. **Fails today** (zero of the four lines have it: OPERATIONS.md:129,333; INSTALL-AGENT.md:240,322-323); passes after.
5. **(end-to-end) The documented sanity check succeeds on a warm provider.** Against a provider that already has one panel: run the quickstart snippet verbatim as documented; it launches a session (JSON with a `terminalId`) instead of refusing. Fails today (refusal: "Provider already has 1 panel… add -y"); passes after (because the documented snippet now carries `-y`).

## Dependencies (OA-XX edges + reason)

- **OA-16** (canonical local-install checklist) — the corrected `-y` sanity-check snippet must be what OA-16's canonical checklist enshrines; land this docs edit before or with OA-16 so the checklist isn't written twice.
- **OA-09** — same doc region (`docs/OPERATIONS.md` step 2 / `docs/INSTALL-AGENT.md` step 7) is rewritten by OA-09; coordinate the edits (OA-09's recipe should already include `-y` in its sanity-check line).
- The termfleet-side items (AC 1-3) are independent of all OA specs and can ship on the termfleet release train; OA's docs fix (AC 4-5) must not wait for them.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-12, §1 steps 5-6 (observed on Linux, termfleet npm 0.2.0, audit box's console/provider on 7573/7602).
- Repo source (branch `adoption-fixes-backlog`, open-autonomy-owned lines): `docs/OPERATIONS.md:126-134,129,330-334,333`; `docs/INSTALL-AGENT.md:235-241,240,319-323`.
- termfleet-dist evidence (npm `termfleet@0.2.0` → `@termfleet/core@0.2.1`, installed into the audit scratchpad, NOT this repo's source): `termfleet/dist/server/console-settings.js:6-14,24,30`; `termfleet/dist/cli.js:691,789,797-806,1528,1595,1714,1836-1850,1868-1881,2006`; `termfleet/dist/server/console-server.js:220`; `termfleet/dist/server/provider-supervisor.js:26,64-72,70`; `termfleet/dist/server/provider-controllers.js:84,188-196,306-315`; `termfleet/dist/lib/iterm.js:2-5`; `termfleet/dist/instance/drivers/iterm-driver.js:415,445,461,508,587,655,731`; `termfleet/dist/instance/drivers/wezterm-driver.js:414,514,523`; `@termfleet/core/dist/lib/exec.js:2-14,15-32`.
