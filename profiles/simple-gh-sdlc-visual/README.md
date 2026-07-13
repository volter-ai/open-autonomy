# simple-gh-sdlc-visual

`simple-gh-sdlc` + visual evidence bookends: Playwright captures before/after implementation via
visual-edit runners inside sealed twin worlds, evidence written to ztrack. Realizes OA-11 /
`ZTRACK-INTEGRATION.md`'s phase-1 profile wiring plus its phase-3 loop-gate upgrade (the `prelaunch`
hook), proven end-to-end on a live testbed before this upstreaming (see "Testbed proof" below).

Four agents, each a prose skill the substrate runs model-interpreted:

| agent | trigger | does |
|---|---|---|
| `pm` | `cron */15` | the only dispatcher — sweeps the ztrack board, enforces WIP, **launches** the next eligible `develop` (review is automatic on the PR) |
| `draft` | `dispatch` | shapes an untriaged request into a verifiable Ready issue (sources + 1-3 ACs + evidence scaffold, incl. the `bk/01`/`bk/02` visual bookend pair when any AC is user-facing) |
| `develop` | `dispatch` | implements one Ready issue with before/after visual evidence and pushes its branch; the substrate opens an auto-merging PR. `code:propose`, reviewed by `reviewer`. Declares a `prelaunch` hook (see below) |
| `reviewer` | `event: pull_request_target` / `issue_comment` | the independent GitHub reviewer: verifies the PR (ztrack green + every passed AC backed by cited evidence, INCLUDING inspecting the visual bookend images) and posts `agent-review`. `code:review`, never merges |

## LOCAL substrate, GitHub code host

This profile deliberately declares `targets: [local]` only — narrower than `simple-gh-sdlc`'s
`[gh-actions, local]`. Agents always run on your machine via termfleet; `codeHost: github` still means
`develop`'s change lands as a real GitHub PR on `agent/issue-<id>`, gated by the same merge boundary
(`ci` + `security` + `agent-review` → native auto-merge — no agent merges).

Two upstream capabilities this profile is built on make that combination work without GitHub Actions
ever running the agents themselves:

- **`prelaunch` (PR #170)** — `develop` declares
  `prelaunch: npx ztrack loop start "$ZTRACK_ISSUE" --until in-review --max 8`, realized only on the
  local substrate today. It arms the in-session ztrack-loop Stop/SubagentStop gate *before* the
  developer's session spawns, so the session holds every turn until the issue reaches `in-review` with
  a green `ztrack check` — see `skills/develop/SKILL.md` step 1.
- **Local event-trigger delivery + reconcilers (PR #174)** — the local substrate has no GitHub webhook
  listener, so `reviewer`'s `event:` triggers (declared in `ir.yml` for portability to a future
  gh-actions compile of this same profile) are delivered instead by the compiler-emitted
  `scripts/reconcile-open-reviews.mjs` (polls open `agent/*` PRs, launches `reviewer` for any PR whose
  head sha lacks a fresh `agent-review` status), alongside `scripts/reconcile-ready-branches.mjs`
  (propose-recovery) and `scripts/reconcile-open-checks.mjs` (check convergence). These three are
  **substrate-emitted automatically** for any `codeHost: github` profile with a `code:propose` agent
  (and a `review:` edge, for the reviews reconciler) compiled to `local` — this profile's `ir.yml` does
  **not** list them in `resources:`, and does not need to.

The done-flip (`in-review` → `done`, PR #177/#OA5) is unaffected by the substrate choice — it is a
GitHub Actions workflow (`.github/workflows/flip-done.yml`) that runs on GitHub regardless of which
substrate launched the agents, gated by `scripts/check-flip-diff.ts`'s mechanical diff check.

## Self-contained

Every operative file this profile's skills and workflows reference is carried in this directory (listed
in `ir.yml`'s `resources:`) — none of it depends on a file that exists only in some other repo's
compiled root:

```
profiles/simple-gh-sdlc-visual/
  ir.yml
  provision.json
  README.md
  .claude/settings.json
  .open-autonomy/architecture-invariants.yml
  .github/dependabot.yml
  .github/workflows/{merge,security,security-gate,flip-done,agent-review-human,smoke,ci}.yml
  scripts/{rearm-auto-merge,reconcile-merged-issues,check-supply-chain,flip-done,check-flip-diff}.ts
  scripts/{evidence-attach,world-smoke,next-free-issue-id}.mjs
  skills/{pm,draft,develop,reviewer}/SKILL.md
  standards/{workflow,issue-and-evidence,risk-and-review,visual-evidence}.md
```

`agent-review-human.yml` is **profile-specific**, not something the real `open-autonomy` repo itself
needs (OA5/#177 established that): a real gh-actions install runs a live `reviewer.yml` Action that
posts `agent-review` on every PR, human-authored ones included. This profile's `reviewer` only ever
runs via the local reconcilers (above), which dispatch review for `agent/*` PRs, not human ones — so
without this workflow, requiring `agent-review` on `main` would wedge every human-authored PR forever.
It excludes **both** `agent/*` (owned by the local reviewer) and `flip/*` (owned by `flip-done.yml`'s
own diff-gated check) — it must never race or paper over either of those.

## Adopting this profile

The profile scaffolds structure; the app is yours. It does **not** ship `world.config.json`, a billing
app, seed data, or example tracked issues — those are adopter-specific. Fill in:

- `world.config.json` at your repo root — a sealed-world topology naming the twin services your app's
  vendor SDKs need (see `node_modules/@volter/twin-world`'s docs for the schema). `policy.box.visual_evidence.world_config`
  in `ir.yml` just names the path; it does not require any particular topology.
- `apps/web/.visual-edit/playwright-demos/` and `playwright-visual-states/` (or your own equivalents —
  update `policy.box.visual_evidence.demo_dir`/`state_dir` in `ir.yml` if you relocate them) — your
  own demo/visual-state scripts, authored per `standards/visual-evidence.md`'s human-moves-only
  discovery discipline.
- `scripts/evidence-attach.mjs`'s `APP_URL`-injecting world env and `scripts/world-smoke.mjs`'s
  vendor-coverage probe: the vendor-coverage half of `world-smoke.mjs` (stage 4, pass 1 — "does every
  external the app imports have a configured twin?") is fully vendor-agnostic already; the
  **op-level** probe (pass 2) ships one worked example (a live probe against a Stripe twin, gated
  behind the app actually importing `stripe` — a no-op otherwise) as a template to extend for your own
  vendor(s). `world-smoke.mjs`'s header comment documents the `SMOKE_*` env vars that let you point it
  at your own source-file layout, canonical visual-state script, and service count without editing the
  script.
- `npm run smoke` / `npm run typecheck` in your `package.json` — `ci.yml` and `smoke.yml` call them by
  name; `ci.yml`'s typecheck step uses `--if-present` so an app with no typecheck script yet doesn't
  fail the gate outright.

## ztrack version floor

The evidence workflow (`develop`'s §Baseline/§DryRun bookends, cited via a commit that may legitimately
predate the PR's eventual head — an earlier baseline/dry-run commit on the same branch, not necessarily
the head itself) needs ztrack's `simple-gh-sdlc` preset rule `evidence_sha_stale` to accept any evidence
commit that is an **ancestor of** (or equal to) the PR head — not only an exact head-sha match. That fix
is [`volter-ai/ztrack` PR #24](https://github.com/volter-ai/ztrack/pull/24) (`z2/evidence-sha-ancestor`),
**open and unmerged as of this writing** — no tagged ztrack release carries it yet (the latest tag at
integration time is `v1.2.0`; this repo's own `package.json` pins `ztrack@1.0.0` as a dev-dependency
floor for the CLI surface this profile's skills/CI invoke, independent of the preset-rule fix below).

**Floor: whichever ztrack release first merges PR #24** (its ancestor-ship, once cut, will be the first
tagged version ≥ that merge). Until then, a multi-commit evidence trail (baseline commit, then a later
dry-run/implementation commit, both cited on the same issue) will fail `evidence_sha_stale` under the
current exact-match rule unless every evidence line happens to cite the literal PR head — adopters
installing this profile before that ztrack release ships should expect that constraint, or pin ztrack to
a build off `z2/evidence-sha-ancestor` if they need multi-commit evidence sooner.

## Testbed proof

The store-native, fully-hands-off dispatch cycle this profile encodes (`pm` tick → `draft` mints a
Ready issue → `develop` implements with `prelaunch`-armed loop-gated §Baseline/§DryRun bookends → an
auto-merging PR → `reviewer`'s independent `agent-review` → native auto-merge → the `flip/<id>`
done-flip) was proven live on a dedicated testbed (a sealed-world billing app) before this upstreaming —
this profile is the self-contained, genericized distillation of that proof, not a fresh, unvalidated
design.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-gh-sdlc-visual local /tmp/simple-gh-sdlc-visual
```
