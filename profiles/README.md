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
- **`repo-maintenance/`** — open-autonomy's own self-maintenance recipe (pm / developer / reviewer /
  planner / upgrade / strategist / strategy-reviewer). `compile(repo-maintenance, github)` produces
  exactly `templates/self-driving-repo`, **byte-for-byte** — proven and CI-gated (`check:regen`).
  That template is therefore a *generated artifact*: the profile (+ the substrate's injected runtime)
  is its single source. The github runtime (`scripts/*`) is **not** in the profile — the substrate
  owns and injects it, the same way `substrate-local` injects its runner backend.

A profile's agents pick their own **tooling** (`ztrack`, or `gh` + `npm`); the core and substrates
never name a tool.
