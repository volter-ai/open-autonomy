# profiles

Example **profiles** — substrate-agnostic recipes (agents + workflows + policy + resources, as IR).
A profile is the *what*; a substrate is the *how/where*. The same profile compiles to any substrate:

```
compile(profile, substrate) → installation
```

These are **co-equal examples**, none privileged. Each is the *recipe* form (skills + standards + an
IR manifest), **not** a compiled installation — `compile(profile, <substrate>)` produces the
installation (a local-loop folder, or github `.open-autonomy/` + `.github/workflows/`).

Planned gallery (recipes to extract here):

- **`simple-sdlc/`** — a PM → develop → review SDLC loop. Uses `ztrack` as its tooling. (Currently
  lives as a local installation in the ztrack repo; the recipe form lands here.)
- **`repo-maintenance/`** — open-autonomy's own self-maintenance recipe (pm/developer/reviewer/
  planner/strategist…). Compiled onto the github substrate, this is what drives open-autonomy itself.

A profile's agents pick their **tooling** (`ztrack`, or `gh` + `npm`); the core/substrates never
name a tool.
