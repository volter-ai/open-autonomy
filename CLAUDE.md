# Open Autonomy — working notes

## Editing shared control files

`profiles/self-driving/` is the source of a github installation. There is no hand-maintained
template — the installation is `compile(profiles/self-driving, github)`:

- **Skills / control docs / workflows / manifest** (`.codex/skills/`, `.open-autonomy/*`,
  `.github/workflows/`, `AGENTS.md`, `docs/*`): edit the files under `profiles/self-driving/`
  (workflows are real `.yml` files there). `check:compile` verifies the profile compiles.
- **Runtime** (`scripts/*` — `public-agent-*`, `model-proxy-*`, `codex-agent-run`, …): the substrate
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
