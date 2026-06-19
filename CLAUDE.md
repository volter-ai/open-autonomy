# Open Autonomy — working notes

## Editing shared control files

`profiles/repo-maintenance/` is the source of a github installation. There is no hand-maintained
template — the installation is `compile(profiles/repo-maintenance, github)`:

- **Skills / control docs / workflows / manifest** (`.codex/skills/`, `.open-autonomy/*`,
  `.github/workflows/`, `AGENTS.md`, `docs/*`): edit the files under `profiles/repo-maintenance/`
  (workflows are real `.yml` files there). `check:compile` verifies the profile compiles.
- **Runtime** (`scripts/*` — `public-agent-*`, `model-proxy-*`, `codex-agent-run`, …): the substrate
  OWNS it. Edit it in `scripts/` (where it's tested), then `bun bin/sync-runtime.ts` to refresh the
  vendored mirror; `check:runtime-sync` enforces they match. `compileGithub` injects it.

```
bun bin/autonomy-compile.ts profiles/repo-maintenance github <dir>   # produce an installation
```

To upgrade an installed repo, the upgrade workflow compiles the profile and diffs it against the repo.

Known gap: OA's own root installation (`.github/workflows`, `.codex/skills`, `.open-autonomy`) is still
hand-maintained alongside the profile rather than regenerated from it; a dogfood sync-check (compile ==
root) would close that. `MANAGED_PREFIXES` in `scripts/open-autonomy-upgrade.ts` also omits `docs/`.
