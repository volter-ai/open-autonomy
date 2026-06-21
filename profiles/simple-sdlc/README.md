# simple-sdlc

A minimal software-delivery loop expressed as `autonomy.ir.v1`, ported from the ztrack `simple-sdlc`
profile. Four agents, each a prose skill the substrate runs model-interpreted:

| agent | trigger | does |
|---|---|---|
| `pm` | `cron */15` | the only dispatcher — sweeps the board, enforces WIP (≤1 in-progress, ≤1 in-review), produces the next lifecycle transition |
| `draft` | `task: open` | shapes an untriaged request into a verifiable Ready issue (sources + 1-3 ACs + evidence scaffold) |
| `develop` | `task: ready` | implements one Ready issue and produces real evidence per AC; stops on a human-required path/topic |
| `review` | `task: in-review` | gates an In-Review change: `ztrack check` green, every passed AC backed by cited evidence, then Done or rework |

The three workers are **lifecycle consumers**: they fire when a task enters a portable state
(`docs/TASK-LIFECYCLE.md`). The PM does not launch a worker process — it produces the transition the
worker consumes, and the substrate launches the matching worker. The work item arrives as
`$ZTRACK_ISSUE` via each trigger's `subject.ref` param.

The agents use [`ztrack`](https://github.com/volter-ai/ztrack) for tooling (issues, checks, evidence);
the shared `standards/` are read by every skill.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-sdlc local
bun bin/autonomy-compile.ts profiles/simple-sdlc github /tmp/simple-sdlc-gh
```
