# @volter/oa

The open-autonomy **local substrate as a versioned CLI**. `oa start|once|pause|resume|status|dispatch|doctor`
realizes schedules, fences, triggers, agent-session lifecycle, concurrency, retry/backoff, and opaque
completion effects. Task services and code-host services are separate dependencies of the autonomy
program, not scheduler modes.

## Why this package exists (owner direction)

> the runner should be its own CLI, not byte-copied templates

Every `compileLocal()` install used to get its own literal copy of `scheduler/run.mjs`, and downstream
installs accumulated role names, tracker probes, PR queries, and divergent timing rules inside that copy.
`@volter/oa` provides one versioned execution substrate. It deliberately launches a due job without
asking whether a task is ready; the launched Manager (or any other declared role) makes that decision
through the configured task service.

## Adoption path

**New installs (opt-in during compile):** set `policy.box.local.runner: "cli"` in the profile's `ir.yml`
(the IR's only free-form governance slot is `policy.box` — see `docs/SPEC.md#the-ir`) before compiling.
`compileLocal()` then emits a thin `scheduler/run.mjs` shim instead of the full byte-copied template:

```js
#!/usr/bin/env node
import { runCli } from '@volter/oa';
const code = await runCli(process.argv.slice(2));
process.exit(code);
```

argv-compatible with the legacy contract — `node scheduler/run.mjs --once` / `node scheduler/run.mjs`
(continuous) both keep working unchanged. Add the dependency (the compile-time instructions print this
reminder when the opt-in is set):

```sh
npm install @volter/oa
```

`package.json` (and its lockfile) join `human_required_paths` the same way `termfleet`/`ztrack` already do
— governance relocates to **the pinned exact version**, not a copied file nobody re-reviews after install.

**DEFAULT IS UNCHANGED.** A profile that never sets `policy.box.local.runner` gets today's full byte-copied
`scheduler/run.mjs` template exactly as before — proven every run by `bun run check:profiles`, which
compiles every bundled profile and would fail on any drift.

Existing legacy `scripts` schedules remain readable. New CLI-runner compiles emit the generic `jobs`
shape, with independent cadence/retry/fence data and no task-backend or role-specific fields.

## Verbs

| Verb | What | Was |
|---|---|---|
| `oa start` | continuous generic job scheduler with fences, session singleton, concurrency, retry/backoff, reaping, and opaque effects | `node scheduler/run.mjs` |
| `oa once` | fire every currently unfenced job once | `node scheduler/run.mjs --once` |
| `oa pause [reason]` | touch `.open-autonomy/paused` — blocks NEW waves; an in-flight wave drains to completion | `touch .open-autonomy/paused` |
| `oa resume` | remove `.open-autonomy/paused` — the operator's act (a human ran the CLI); re-arms the reconciler within one heartbeat | `rm .open-autonomy/paused` |
| `oa status` | fence state + rationale, live sessions (via the runner SDK), and last-fire info per job | — (new) |
| `oa dispatch <agent>` | fire exactly the one schedule line for `<agent>` now, bypassing the fence (the documented first-run-while-paused workaround) | `AUTONOMY_AGENT=<agent> node scripts/run-agent.mjs` |
| `oa doctor [--live] [--json]` | offline: OA-04 dep-integrity probe + fence state + `schedule.json` parse + prompts/skills existence per declared agent; `--live` additionally probes the provider `/healthz` over the network | — (new; folds in checks that used to live only in `bin/doctor.ts`/`bin/collision-check.ts`) |
| `oa provider up` | (TG.1) bring up a termfleet console+provider on a repo-unique, genuinely-free port pair (never the box defaults 7373/7402/7620/7621); verify the thing that answered is REALLY termfleet (never a foreign occupant); pin `TERMFLEET_PROVIDER_URL` durably into `scheduler/schedule.json`'s `env`. Idempotent: no-ops on a healthy pin, restarts a dead one on the SAME pinned ports. | — (new) |
| `oa provider status` | report whether the pinned provider (and console) are up and really answering as termfleet | — (new) |
| `oa provider down` | stop the provider/console this install brought up (best-effort SIGTERM to the whole process tree — `npx` forks the real server rather than exec-replacing itself) | — (new) |

## Design contract (unchanged, honored throughout)

- **`.open-autonomy/paused` stays the source of truth.** `oa pause` touches it (never deletes it — deletion
  is the operator's act, spelled `oa resume` or `rm .open-autonomy/paused`, identical authority either way).
  `oa status` and the reconciler only ever *read* it. This CLI is ergonomics over the file, **never** a
  daemon holding state of its own — kill `oa start` and the fence file is still the only thing that
  matters; a fresh `oa start` on the same repo picks up exactly where the file says to.
- **The repo keeps committing `autonomy.yml`/`schedule.json`/prompts.** This package reads them from `cwd`
  — nothing is bundled, cached, or baked in at publish time. Point `oa` at a different repo and it reads
  *that* repo's config.
- **`schedule.json` accepts both shapes.** Legacy `{ intervalSeconds, scripts: string[] }` and the new
  generic job form:

  ```json
  {
    "maxConcurrent": 1,
    "jobs": [
      { "name": "manager", "command": "AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs",
        "intervalSeconds": 1800, "retrySeconds": 300, "fence": ".open-autonomy/paused", "agent": "manager" },
      { "name": "planner", "command": "AUTONOMY_AGENT=planner node scripts/run-agent.mjs",
        "intervalSeconds": 86400, "retrySeconds": 300, "fence": ".open-autonomy/audits-paused", "agent": "planner" }
    ]
  }
  ```
  Each job gets independent timing/backoff state. No job name selects task behavior.
- **The full run.mjs guard chain runs in BOTH modes.** `oa start` and `oa once` share one preflight
  (`src/preflight.ts`) that runs before any tick, in run.mjs's exact order: termfleet-installed refusal ->
  the OA-04 dep-integrity collision probe (a workspace member shadowing
  `termfleet`/`@termfleet/core`) -> the OA-09 provider-origin log + `AUTONOMY_PROVIDER_URL_SOURCE`
  export (propagated into every launched session via the tick env) -> the OA-03 uncommitted-harness
  refusal. `oa doctor` additionally folds the OA-04 probe into its offline checks; its provider `/healthz`
  probe is the one networked check and runs **only under `--live`** (a default doctor run is fully
  offline, scriptable on a box where the provider is intentionally down).

## Testing

Every verb is unit-tested against **stubbed** `gh`/`ztrack`/the termfleet runner SDK (`src/test-support/`)
— no real network calls, no real termfleet provider, no spend. `src/cli.test.ts` additionally spawns the
real `oa` executable as a real `node` subprocess (proving the package runs under plain `node` with zero
build step — Node 22.18+'s built-in TypeScript type-stripping, matching this monorepo's own `engines`
floor) and `packages/substrate-local/src/cli-runner-emit.test.ts` proves the `compileLocal()` opt-in end to
end, including a real subprocess run of the emitted shim wired to this package via a real (symlinked, not
stubbed) `node_modules/@volter/oa`.

```sh
bun test packages/local-runner-cli/src/*.test.ts
bun test packages/substrate-local/src/cli-runner-emit.test.ts
```
