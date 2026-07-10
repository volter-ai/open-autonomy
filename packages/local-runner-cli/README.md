# @volter/oa

The open-autonomy **local substrate as a versioned CLI**. `oa start|once|pause|resume|status|dispatch|doctor`
— the runner is now a dependency like `termfleet`/`ztrack` already are, instead of a byte-copied template
that forks the moment an install customizes it.

## Why this package exists (owner direction)

> the runner should be its own CLI, not byte-copied templates

Every `compileLocal()` install used to get its own literal copy of `scheduler/run.mjs`. That was fine until
two installs (supercode, twin) independently needed the *same* upgrade — a state-gated, eligibility-driven
continuous reconciler (the "ensured agent" primitive, study §II.6.1/§II.6.3) instead of a dumb interval
timer. Because the file was copied, not depended-on, the upgrade had to be **hand-ported twice**:

- **S6** (supercode, `scheduler/run.mjs`): the reconciler against a `manager` agent, a **ztrack** board
  (`ztrack issue list --state ready|in-progress`), and a `gh pr list` PR-concluded leg.
- **T6** (twin, `scheduler/run.mjs`): the *same* reconciler, hand-adapted for a `pm` agent, a **GitHub
  issues** board (`gh issue list --label ready`, parked-label aware), and the identical PR-concluded leg
  — plus one real bugfix (the `StatusContext.state` arm, needed because twin's own `agent-review` required
  check is a commit status, not a Checks-API run) that had to be *manually back-ported* to S6 to keep them
  from diverging further.

Two proven, byte-similar-but-not-identical forks of the same logic, each one a future merge conflict with
itself. `@volter/oa` retires both: `packages/local-runner-cli/src/reconciler.ts` **is** the reconciler,
`src/eligibility.ts` carries **both** proven board-probe variants behind one config key
(`eligibility: "ztrack" | "gh-issues"`), and a release of this package reaches every install that depends
on it — no more re-copying a `.mjs` file by hand and hoping the diff stays clean.

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

**How supercode/twin migrate:** each repo's own `scheduler/run.mjs` (S6/T6) becomes a fork this package
retires — swap in the CLI opt-in at the next `open-autonomy upgrade`, delete the hand-maintained
`.mjs`, add `@volter/oa` to `package.json`, and the S6-vs-T6 divergence (manager/ztrack vs pm/gh-issues)
collapses into one `eligibility:` config key per install. Until that migration lands, S6/T6 keep running
unmodified — this package changes nothing for an install that hasn't opted in.

## Verbs

| Verb | What | Was |
|---|---|---|
| `oa start` | continuous mode: the state-gated reconciler heartbeat (~20s poll; `!paused && no session in flight && eligible`) | `node scheduler/run.mjs` |
| `oa once` | fire the full schedule exactly once, unconditionally — no state-gating | `node scheduler/run.mjs --once` |
| `oa pause [reason]` | touch `.open-autonomy/paused` — blocks NEW waves; an in-flight wave drains to completion | `touch .open-autonomy/paused` |
| `oa resume` | remove `.open-autonomy/paused` — the operator's act (a human ran the CLI); re-arms the reconciler within one heartbeat | `rm .open-autonomy/paused` |
| `oa status` | fence state + rationale, live sessions (via the runner SDK), last-fire info per reconciled agent | — (new) |
| `oa dispatch <agent>` | fire exactly the one schedule line for `<agent>` now, bypassing the fence (the documented first-run-while-paused workaround) | `AUTONOMY_AGENT=<agent> node scripts/run-agent.mjs` |
| `oa doctor [--live] [--json]` | OA-04 dep-integrity probe + provider `/healthz` + fence state + `schedule.json` parse + prompts/skills existence per declared agent | — (new; folds in checks that used to live only in `bin/doctor.ts`/`bin/collision-check.ts`) |

## Design contract (unchanged, honored throughout)

- **`.open-autonomy/paused` stays the source of truth.** `oa pause` touches it (never deletes it — deletion
  is the operator's act, spelled `oa resume` or `rm .open-autonomy/paused`, identical authority either way).
  `oa status` and the reconciler only ever *read* it. This CLI is ergonomics over the file, **never** a
  daemon holding state of its own — kill `oa start` and the fence file is still the only thing that
  matters; a fresh `oa start` on the same repo picks up exactly where the file says to.
- **The repo keeps committing `autonomy.yml`/`schedule.json`/prompts.** This package reads them from `cwd`
  — nothing is bundled, cached, or baked in at publish time. Point `oa` at a different repo and it reads
  *that* repo's config.
- **`schedule.json` accepts both shapes.** Legacy `{ intervalSeconds, scripts: string[] }` (one shared
  min-gap for every line, S6/T6's own shape) and the new per-script object form:

  ```json
  {
    "scripts": [
      { "cmd": "AUTONOMY_AGENT=manager AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs",
        "reconciled": true, "eligibility": "ztrack", "intervalSeconds": 60 },
      { "cmd": "AUTONOMY_AGENT=planner node scripts/run-agent.mjs", "intervalSeconds": 1800 }
    ]
  }
  ```

  `reconciled` marks which script gets the eligibility-driven reconciler treatment (default: detected via
  the same `AUTONOMY_AGENT=manager|pm` regexes S6/T6 hardcoded, kept as the fallback when the flag is
  absent). Every reconciled script gets its **own** independent backoff/min-gap/last-fire state — this is
  the per-agent-cadence generalization that closes the shared-single-interval limitation both forks
  inherited from the original `run.mjs` (a second reconciled agent, e.g. a scheduled strategist, no longer
  has to share cadence with the first).
- **Governance = OA-04 + doctor.** The dep-integrity collision probe (a workspace member shadowing
  `termfleet`/`@termfleet/core`/`ztrack`) is ported verbatim and folds into both `oa start`/`oa once`
  preflight and `oa doctor`.

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
