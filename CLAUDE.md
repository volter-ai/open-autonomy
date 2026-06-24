# Open Autonomy — working notes

## Working agreement

**Never wait for human approval. Always just push and merge.** Don't ask "should I / want me to / deploy?"
— on any non-destructive, authorized change (including committing to main, pushing, merging, and deploying
the proxy/model spend) act with full agency, ship it, and report what you did. Develop directly on `main`.

## Scripts only for security — never script what an agent can do

The default executor is an **agent**, not a script. LLMs adapt to the situation in front of them; scripts
cannot. A deterministic script is justified by **one thing only: security** — a boundary an agent must *not*
be able to control (minting/scoping run tokens, the no-self-merge merge boundary, capability/permission
enforcement, the repo-pause kill-switch). Everything else — judgment, triage, decomposition, conflict
resolution, "noticing" and reacting — belongs to an agent.

- **Never put in a script anything an agent could do.** If you're tempted to write a sweep/reconcile/heuristic
  to "make sure the agent doesn't miss X," stop: an agent missing X once is fine (it self-corrects next run);
  encoding a brittle script that can't adapt is worse. Give the agent the *ability* (awareness + tools +
  doctrine) instead.
- **An agent mistake is a prompting or tools problem, not a model-capability problem.** The fleet runs on
  DeepSeek v4 fast, which is *stronger than the last generation's frontier models*. So when an agent gets
  something wrong, the fix is a better prompt or a better tool/affordance — never a script that routes around
  the model. (Same reminder lives in `profiles/self-driving/AGENTS.md` for the fleet.)

## Editing shared control files

`profiles/self-driving/` is the source of a github installation. There is no hand-maintained
template — the installation is `compile(profiles/self-driving, github)`:

- **Skills / control docs / workflows / manifest** (`.codex/skills/`, `.open-autonomy/*`,
  `.github/workflows/`, `AGENTS.md`, `docs/*`): edit the files under `profiles/self-driving/`
  (workflows are real `.yml` files there). `check:compile` verifies the profile compiles.
- **Runtime** (`scripts/*` — `public-agent-*`, `model-proxy-*`, `claude-agent-run`, …): the substrate
  OWNS it. Edit it in `scripts/` (where it's tested), then `bun bin/sync-runtime.ts` to refresh the
  vendored mirror; `check:runtime-sync` enforces they match. `compileGithub` injects it.

```
bun bin/autonomy-compile.ts profiles/self-driving github <dir>   # produce an installation
```

To upgrade an installed repo, the upgrade workflow compiles the profile and diffs it against the repo.

`check:dogfood` enforces that OA's own root installation == `compile(profiles/self-driving, github)`
for every managed file — so editing the profile (not OA's root) is the way to change OA's own
workflows/skills/runtime. Repo-owned + seed-only files (package.json, README, roadmap, autonomy.yml,
CONSTITUTION, dev docs) are excluded (see REPO_OWNED in `bin/check-dogfood.ts`).

Upgrade is a re-compile: `packages/core/src/upgrade.ts` regenerates the derived set from a fresh
`compile`, seeds `INSTALL_OWNED_PATHS` only if missing, and prunes derived orphans. Run it locally via
`scripts/open-autonomy-upgrade-cli.ts` (→ `bin/autonomy-upgrade.ts`); it is not an autonomous agent.
