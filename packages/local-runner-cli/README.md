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

There is no profile-level scheduler selector. `compileLocal()` always emits the generic `jobs` schedule
shape and a self-contained `scheduler/run.mjs`; profile policy cannot choose a different implementation.
Historical `scripts` schedules remain readable during upgrades.

This package exposes the richer operator CLI from an open-autonomy source checkout. It is currently
private and unpublished, so compiled installs do not import it or print an unusable `npm install` step.
Once it is published, adopting the CLI is a packaging/release change—not a new semantic policy key.

## Verbs

| Verb | What | Was |
|---|---|---|
| `oa start` | continuous generic job scheduler with fences, session singleton, concurrency, retry/backoff, reaping, and opaque effects | `node scheduler/run.mjs` |
| `oa once` | fire every currently unfenced job once | `node scheduler/run.mjs --once` |
| `oa pause [reason]` | touch the conventional `.open-autonomy/paused` fence; jobs assigned that fence drain and stop | `touch .open-autonomy/paused` |
| `oa resume` | remove `.open-autonomy/paused`; jobs assigned that fence are re-armed within one heartbeat | `rm .open-autonomy/paused` |
| `oa status` | fence state + rationale, live sessions (via the runner SDK), and last-fire info per job | — (new) |
| `oa dispatch <agent>` | fire exactly the one schedule line for `<agent>` now, bypassing the fence (the documented first-run-while-paused workaround) | `AUTONOMY_AGENT=<agent> node scripts/run-agent.mjs` |
| `oa doctor [--live] [--json]` | offline: OA-04 dep-integrity probe + fence state + `schedule.json` parse + prompts/skills existence per declared agent; `--live` additionally probes the provider `/healthz` over the network | — (new; folds in checks that used to live only in `bin/doctor.ts`/`bin/collision-check.ts`) |
| `oa provider up` | (TG.1) bring up a termfleet console+provider on a repo-unique, genuinely-free port pair (never the box defaults 7373/7402/7620/7621); verify the thing that answered is REALLY termfleet (never a foreign occupant); pin `TERMFLEET_PROVIDER_URL` durably into `scheduler/schedule.json`'s `env`. Idempotent: no-ops on a healthy pin, restarts a dead one on the SAME pinned ports. | — (new) |
| `oa provider status` | report whether the pinned provider (and console) are up and really answering as termfleet | — (new) |
| `oa provider down` | stop the provider/console this install brought up (best-effort SIGTERM to the whole process tree — `npx` forks the real server rather than exec-replacing itself) | — (new) |

## Design contract

- **Fence state lives in declared marker files.** Emitted jobs use `.open-autonomy/paused` by default, and
  `oa pause`/`oa resume` manipulate that conventional marker. A profile can assign another marker to an
  independently controlled job, as the example below does for audits. The scheduler reads each job's
  declared fence; it does not hardcode one marker as an override for every job. Marker files remain the
  source of truth across scheduler restarts—there is no hidden fence state in a daemon.
- **The repo keeps committing `autonomy.yml`/`schedule.json`/prompts.** This package reads them from `cwd`
  — nothing is bundled, cached, or baked in at publish time. Point `oa` at a different repo and it reads
  *that* repo's config.
- **`schedule.json` accepts both shapes.** Legacy `{ intervalSeconds, scripts: string[] }` and the new
  generic job form:

  ```json
  {
    "maxConcurrent": 1,
    "jobs": [
      { "name": "worker", "command": "AUTONOMY_AGENT=worker AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs",
        "intervalSeconds": 1800, "retrySeconds": 300, "fence": ".open-autonomy/paused", "agent": "worker" },
      { "name": "audit", "command": "bun scripts/audit.ts",
        "intervalSeconds": 86400, "retrySeconds": 300, "fence": ".open-autonomy/audits-paused" }
    ]
  }
  ```
  Each job gets independent timing/backoff state, persisted atomically across scheduler restarts. No job
  name selects task behavior.
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
floor) and `packages/substrate-local/src/cli-runner-emit.test.ts` proves that every local compile emits the
same generic job contract regardless of opaque profile policy.

```sh
bun test packages/local-runner-cli/src/*.test.ts
bun test packages/substrate-local/src/cli-runner-emit.test.ts
```
