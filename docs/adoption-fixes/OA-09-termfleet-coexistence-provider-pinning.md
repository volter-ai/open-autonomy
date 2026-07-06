# OA-09: Coexistence with pre-existing termfleet infrastructure — unique ports, explicit provider pinning, truthful port probes

**Finding:** F-8 — Pre-existing termfleet infrastructure (the fleet's normal case) is a minefield: default port 7373 already held by the box's own provider, a probe that misreads "occupied" as "free", re-use advice that attaches OA to a foreign provider with box-wide launch rights, a user-global session store, and undocumented env-pin inheritance (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P1
**Fix target:** open-autonomy

## Problem

On every fleet dev box, termfleet already runs as infrastructure. The documented local install collides with it four ways:

1. **Doc-default ports collide.** The human quickstart hardcodes the console on 7373 and the provider on 7402 (`docs/OPERATIONS.md:121-124`) with no "check first" step and no unique-prefix advice. On the audit box, 7373 was already held by the box's own provider; a second `serve` on a bound port fails silently behind `&` (acknowledged only in INSTALL-AGENT, `docs/INSTALL-AGENT.md:236-237`).
2. **The documented probe misreads a provider as "nothing running".** `docs/INSTALL-AGENT.md:238` probes `curl -fsS http://127.0.0.1:7373/` — `-f` fails on any HTTP error, and a termfleet **provider** answers `/` with 404, so an *occupied* port reads as *free*, and the fallback `console serve` on the same line then fails silently behind `&`.
3. **The docs tell you to attach to whatever is running.** `docs/INSTALL-AGENT.md:235-237` ("Re-use a running console/provider if one is up (one provider is GLOBAL across repos)") would attach OA's uncapped autonomous loop to an **unrelated** provider that can launch terminal sessions as that user across the whole box.
4. **Whether a `TERMFLEET_PROVIDER_URL` pin survives into the PM's child launches was undocumented** — the audit pinned it "out of caution" and could not verify why it held (§1 step 4). Root-caused below: it *does* propagate, by design; the real leak is the **unpinned** path.

Cosmetic but disorienting: `termfleet sessions recent` listed the audit's sessions among the box's 430 others — the session index is user-global by construction (termfleet-dist: `@termfleet/core@0.2.1 dist/agent-session-index.js:86` walks `~/.claude/projects`, the harness's own user-global transcript store). OA cannot fix that; the docs must set the expectation.

## Root cause (verified citations; mark termfleet-dist citations as such)

**How the emitted runner resolves a provider (this repo's source):**

- `packages/substrate-local/src/backend.mjs:25-27` (emitted verbatim into installs as `scripts/autonomy-runner.mjs`, see `packages/substrate-local/src/emit.ts:239`) and its SDK twin `packages/substrate-local/src/runner.ts:38-42` resolve the provider once via `resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL })`.
- There is deliberately **no default provider URL**: `packages/substrate-local/src/runner-config.ts:8-11` — "No providerUrl default on purpose … the runner passes --url only when TERMFLEET_PROVIDER_URL is explicitly set."
- **The unpinned resolution chain is user-global** (termfleet-dist citation: `@termfleet/core@0.2.1 dist/local-providers.js:166-186`): `--url` flag → `TERMFLEET_PROVIDER_URL` → **`~/.termfleet/current.json`** ("current-context", written by any `termfleet use` by any project on the box, `local-providers.js:132-146`) → auto-discovery over the machine-global advertisement store **`~/.termfleet/providers/*.json`** (`local-providers.js:38-48,55-68`), health-probed via each provider's `/healthz` (`local-providers.js:99-131`).
- Two live local providers → a **loud** `ambiguous_provider` error (`local-providers.js:181`). So the silent-misattachment window is precisely: (a) the foreign provider is the *only* live one — e.g. OA's own `serve` died silently on the bound doc-default port, exactly the F-8 sequence; or (b) `~/.termfleet/current.json` points somewhere foreign, which **beats discovery without any ambiguity check**. Both attach OA's loop to a provider with box-wide launch rights, silently.

**Whether the pin propagates into launched agent sessions (the audit's open question) — yes, definitively:**

- The launch path re-exports the pin *into the launched session's shell*: `packages/substrate-local/src/backend.mjs:38-48` (and `runner.ts:48-60`) builds `setupCommand` from `process.env` filtered by `/^(TERMFLEET_.*|AUTONOMY.*|PATH)$/` and sends it as `export K=V; …` lines run inside the new tmux session (`createAgentWindow({ …, setupCommand })`, `backend.mjs:56-58`).
- So the chain is closed transitively: scheduler env → `scheduler/run.mjs` tick (`emit.ts:94` merges `Object.assign({}, schedule.env, process.env)`) → `scripts/run-agent.mjs` (`emit.ts:182,197` passes `{...process.env}`) → backend → `setupCommand` → **the PM's session shell now has the pin exported** → the PM's nested `bun scripts/runner.ts launch developer …` (`packages/substrate-local/src/runner-frontend.ts:318-323` spreads `process.env`) → run-agent → backend again → the developer's session. A pinned loop cannot leak onto another provider; **only an unpinned loop can**, via current-context/auto-local above.
- The pin's *origin* is the gap: `compileLocal` emits `scheduler/schedule.json` with an always-empty env — `packages/substrate-local/src/emit.ts:265`: `generated['scheduler/schedule.json'] = JSON.stringify({ intervalSeconds, env: {}, scripts: … })`. Nothing durable carries the pin; it exists only if the operator remembered to export it in the shell that starts the loop. Note the merge order at `emit.ts:94`: `process.env` **wins over** `schedule.env`, i.e. schedule env is a default, ambient env is the override (consistent with the TERMFLEET_* override doctrine in `runner-config.ts:3`).

**The docs (exact lines):**

- `docs/OPERATIONS.md:114-139` — quickstart step 2 ("Start termfleet"): hardcoded `--port 7373` / `--port 7402` recipe (:121-124), auto-discovery described as "no URL config needed (set `TERMFLEET_PROVIDER_URL` only to pin a specific one)" (:118-119), no occupancy check, no shared-box guidance. Pinning appears only in Troubleshooting (`docs/OPERATIONS.md:339-340`).
- `docs/INSTALL-AGENT.md:235-239` — phase-3 step 7: the re-use advice (:235-237), the `-f`-on-`/` probe that misreads a provider as free (:238), and the provider probe on `/healthz` (:239) which is correct in shape but never *identifies* what answered.

## Proposed fix

**(a) Docs: repo-unique ports/prefix + a truthful is-it-really-free probe in the HUMAN quickstart** (`docs/OPERATIONS.md:114-139`):

- Replace the fixed recipe with a repo-unique one, e.g.:
  ```bash
  # pick a repo-unique prefix and a free port pair (NOT the box defaults 7373/7402/7375)
  TF_PREFIX=<repo>-oa; TF_CONSOLE=7573; TF_PROVIDER=7602
  npx termfleet console serve --name $TF_PREFIX --port $TF_CONSOLE &
  npx termfleet provider serve --kind virtual-tmux --prefix $TF_PREFIX --count 1 --port $TF_PROVIDER &
  export TERMFLEET_PROVIDER_URL=http://127.0.0.1:$TF_PROVIDER   # pin — see (b)
  ```
- Document the correct probe semantics: `curl -sS http://127.0.0.1:$PORT/healthz` — a JSON body `{"ok":true,"provider":"<kind>","instanceId":…}` means **an existing termfleet provider holds the port** (that is termfleet's own identity contract — termfleet-dist citation: `termfleet@0.2.0 dist/server/provider-controllers.js:276-305` `assertTermfleetProviderIdentity`); *any* HTTP answer (including 404 on `/`) means **occupied by something**; only connection-refused means free. Explicitly state that `curl -fsS …/` cannot distinguish these.
- Set the session-store expectation: `sessions recent` is user-global (reads the harness's `~/.claude/projects` transcript index); filter by your `--prefix`/window names, use `--live`.

**(b) Invert the re-use advice; make the pin durable and first-class:**

- Rewrite `docs/INSTALL-AGENT.md:235-239`: on a shared/lived-in box, **never attach to a console/provider this install did not start**. A provider can launch terminal sessions as the user box-wide; OA's loop must run against its own provider, pinned. Re-use is acceptable only on a single-user box where the operator started that provider themselves — and then still pin.
- Require explicit `TERMFLEET_PROVIDER_URL` pinning in shared environments, and have `compileLocal` emit the pin into the schedule: add a `--provider-url <url>` compile option that lands in the currently-always-empty `env: {}` of `scheduler/schedule.json` (`packages/substrate-local/src/emit.ts:265`), so the pin survives shells, supervisors (`systemd`/`launchd` per INSTALL-AGENT's durable-operation section), and re-runs. Keep the existing precedence (ambient `process.env` overrides `schedule.env`, `emit.ts:94`) — it is the documented TERMFLEET_* override doctrine — but compensate with visibility: the loop driver (`LOOP_DRIVER`, `emit.ts:66-167`) and the backend log one line at startup/first-resolve stating the **effective provider URL and its source** (`flag/env/schedule/current-context/auto-local` — `resolveDefaultProvider` already returns `source`), so a misattachment is visible in the first tick's output instead of never.

**(c) Preflight/doctor: default-port occupancy that names the occupant.** Add a check to `bin/preflight.ts` (today it runs only `ensureNodePty()` + `verifyLock()`, `bin/preflight.ts:111-113`):

- Probe the doc-default/configured ports (7373, 7402, plus any pinned URL's port): classify each as *free* / *termfleet provider (kind, instanceId from `/healthz`)* / *termfleet console* / *foreign HTTP service*, with an `ss -ltnp`/`lsof -iTCP:<port> -sTCP:LISTEN` fallback to name the pid/command when the HTTP shape is unrecognized.
- Read the machine-global termfleet state the resolution chain will actually consult: list `~/.termfleet/providers/*.json` advertisements and warn if `~/.termfleet/current.json` exists (a `termfleet use` context **silently beats auto-discovery** for an unpinned loop).
- Output on conflict: name the occupant and prescribe the repo-unique-port + pin recipe from (a)/(b). Warn (not hard-fail) when the install is pinned to a different port; hard-warn when unpinned and a foreign provider is live.

## Alternatives rejected

- **Bake a default provider port back into the runner** — explicitly removed for cause; a hardcoded port drifts to a dead provider (`packages/substrate-local/src/runner-config.ts:8-11`). The fix is a durable *per-install* pin, not a global default.
- **Make `schedule.env` override `process.env`** — would make the schedule pin authoritative but breaks the documented "TERMFLEET_* env vars override at runtime" contract (`runner-config.ts:3`, `emit.ts:241`) and every existing override workflow (`TERMFLEET_AGENT=codex node scheduler/run.mjs`, `docs/OPERATIONS.md:176`). Chosen instead: keep precedence, log the effective resolution + source.
- **Rely on termfleet's `ambiguous_provider` error as the guard** — it only fires with ≥2 *live* providers (termfleet-dist: `local-providers.js:181`); the observed failure mode is exactly the case it cannot catch (OA's serve died on the bound port, leaving the foreign provider as the single live candidate; or a foreign `current.json` short-circuits discovery entirely).
- **Always hard-require a pin (refuse to run unpinned)** — punishes the legitimate zero-config single-user box that auto-discovery was built for (termfleet-dist: `local-providers.js:1-16` design note). Preflight warning + emitted pin + startup source-logging achieves the safety without breaking the demo path.
- **Fix the session-store mixing in OA** — not OA's to fix: the index walks the harness's user-global `~/.claude/projects` (termfleet-dist: `@termfleet/core dist/agent-session-index.js:86`). Docs set the expectation; anything more is a termfleet feature request, out of scope here.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

1. **Preflight names a foreign provider on 7373.** Setup: from an unrelated directory, `npx termfleet provider serve --kind virtual-tmux --prefix decoy --count 0 --port 7373 &`. Test: `npx --yes open-autonomy preflight` in the adopter repo prints a warning that identifies the occupant (at minimum: port, "termfleet provider", kind, and instanceId or pid) and prescribes a repo-unique port + `TERMFLEET_PROVIDER_URL` pin. **Fails today** (preflight has no port check — `bin/preflight.ts:111-113`); passes after.
2. **Preflight names a foreign non-termfleet service.** Setup: `python3 -m http.server 7373 &`. Test: preflight reports port 7373 occupied by a non-termfleet service, naming the listening process. Fails today; passes after.
3. **Compile can emit a durable pin.** `npx open-autonomy compile simple-sdlc local . --provider-url http://127.0.0.1:7602` then `grep -q '"TERMFLEET_PROVIDER_URL": "http://127.0.0.1:7602"' scheduler/schedule.json`. **Fails today** (no such option; env is always `{}` — `packages/substrate-local/src/emit.ts:265`); passes after.
4. **The effective provider + source is visible on the first tick.** `node scheduler/run.mjs --once` (with the pin from AC-3) prints one line matching `provider .*http://127.0.0.1:7602.*(schedule|env)`; with no pin and one live local provider it prints `…(auto-local)…`. Fails today (no such output); passes after.
5. **The docs' probe no longer misclassifies an occupied port as free.** With the AC-1 decoy on 7373, following the (rewritten) documented check verbatim yields "occupied by a termfleet provider", not a silent second `console serve`. Concretely: `docs/INSTALL-AGENT.md` no longer contains `curl -fsS http://127.0.0.1:7373/ >/dev/null 2>&1 ||` (today at line 238), and both docs' probes use `/healthz` + body-shape interpretation. Fails today; passes after (`grep -n 'curl -fsS http://127.0.0.1:7373/' docs/INSTALL-AGENT.md` returns nothing).
6. **The re-use advice is inverted.** `grep -n 'Re-use a running console/provider' docs/INSTALL-AGENT.md` returns nothing; the step 7 replacement text requires starting a dedicated provider with a repo-unique prefix/port and pinning `TERMFLEET_PROVIDER_URL` in shared environments. Fails today (advice present at :235); passes after.
7. **End-to-end misattachment scenario is closed.** On a box with only a foreign provider live on 7373: a fresh install following the new quickstart (unique ports + pin) runs `node scheduler/run.mjs --once` and every launched session lands on the pinned provider (verify: `npx termfleet list --url http://127.0.0.1:7602` shows the PM window; the foreign provider on 7373 shows none). Today the same walk risks silent attachment to 7373 whenever the install's own serve fails or `~/.termfleet/current.json` intervenes.

## Dependencies (OA-XX edges + reason)

- **OA-16** (canonical local-install checklist) — OA-16 will make one OPERATIONS section the single home of the ports/pin recipe this spec rewrites; land OA-09's content first (or in the same change) so OA-16 canonicalizes the *corrected* recipe, not the 7373/7402 one.
- **F-5's preflight fix (spec id outside this batch)** — both add checks to `bin/preflight.ts`; coordinate output format and the warn-vs-fail policy so the port check doesn't inherit F-5's cry-wolf problem.
- No dependency on OA-13/OA-14.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-8, §1 steps 4 and 6, §3 item 5, §4 row 8 (audited box: foreign provider on 7373; audit used 7573/7602 + a defensive pin).
- Repo source (branch `adoption-fixes-backlog`): `packages/substrate-local/src/emit.ts:66-167,94,182,197,239,241,265`; `packages/substrate-local/src/backend.mjs:25-27,38-48,56-58`; `packages/substrate-local/src/runner.ts:38-42,48-60`; `packages/substrate-local/src/runner-frontend.ts:318-323`; `packages/substrate-local/src/runner-config.ts:3,8-11`; `bin/preflight.ts:111-115`; `docs/OPERATIONS.md:114-139,176,339-340`; `docs/INSTALL-AGENT.md:235-240`.
- termfleet-dist evidence (npm `termfleet@0.2.0` → `@termfleet/core@0.2.1`, installed into the audit scratchpad, NOT this repo's source): `@termfleet/core/dist/local-providers.js:1-16,38-48,55-68,99-131,132-146,166-186,181`; `termfleet/dist/server/provider-controllers.js:224-305`; `@termfleet/core/dist/agent-session-index.js:86`.
