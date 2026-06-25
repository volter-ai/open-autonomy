# profiles

**Profiles** are substrate-agnostic recipes — a composition of agents (skills) + workflows + policy +
resources, written as `autonomy.ir.v1` in an `ir.yml`. A profile is the *what*; a substrate is the
*how/where*. The same profile compiles to any substrate:

```
compile(profile, substrate) → installation
```

A profile is a directory with an `ir.yml` and a `skills/<name>/SKILL.md` per agent (plus any
`standards/` it references). The compiler reads the `ir.yml`, validates it, and emits a
substrate-specific installation — it is the *recipe*, not a compiled installation.

## Compile a profile

```bash
# dry run — list the installation a substrate would produce
bun bin/autonomy-compile.ts profiles/hello local
bun bin/autonomy-compile.ts profiles/hello github

# materialize it into a directory
bun bin/autonomy-compile.ts profiles/hello github /tmp/hello-gh
```

## Gallery

- **`hello/`** — the minimal runnable profile: one `greeter` agent on a cron trigger. Compiles to
  both `local` (a scheduler-loop installation) and `github` (manifest + workflow + control plane).
  Start here to see the whole path.
- **`self-driving/`** — open-autonomy's own self-maintenance recipe (pm / developer / reviewer /
  planner / upgrade / strategist / strategy-reviewer). `compile(self-driving, github)` produces a
  complete self-driving installation; it is the **single source** of that installation (there is no
  hand-maintained template — `scaffold` and the upgrade workflow both compile this profile). The
  github runtime (`scripts/*`) is **not** in the profile — the substrate owns and injects it, the same
  way `substrate-local` injects its runner backend (`check:runtime-sync` + `check:compile` guard it).
- **`simple-sdlc/`** — a four-agent software-delivery loop (pm / draft / develop / review) ported from
  the ztrack `simple-sdlc` profile. The PM is the only autonomous trigger (a `cron` tick that enforces
  WIP); the three workers are **`dispatch`** agents — the PM reads the ztrack board, decides from each
  issue's state (a property it reads, not a trigger), and **launches** the matching worker through the
  Runner (`bun scripts/runner.ts launch develop --ref <id>`), delivering the work item as `$ZTRACK_ISSUE`.
  Targets **`local` only** — it is PR-free (review = the reviewer's verdict over commit-evidence), and
  github's merge boundary requires an auto-merging PR + `agent-review` it doesn't provide; the GitHub
  PR-based SDLC is `simple-gh-sdlc`'s job. Its agents use `ztrack` for tooling.
- **`simple-gh-sdlc/`** — the **github** counterpart of simple-sdlc (pm / draft / develop / reviewer).
  Same ztrack-tracked dispatch loop, but the merge boundary is GitHub's: `develop` (`code:propose`) lands
  its change as an auto-merging PR gated by an independent `reviewer` (`code:review` → `agent-review`) —
  the permission split, native auto-merge, done = merged PR (self-driving's merge model on a generic
  ztrack SDLC). Targets `github`; uses the ztrack `simple-gh-sdlc` preset.

Every profile in this directory is smoke-checked by `check:profiles` (parses + compiles to each
declared target). A profile's agents pick their own **tooling** (`ztrack`, or `gh` + `npm`); the core
and substrates never name a tool.
