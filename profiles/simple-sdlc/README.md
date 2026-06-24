# simple-sdlc

A minimal software-delivery loop expressed as `autonomy.ir.v1`, ported from the ztrack `simple-sdlc`
profile. Four agents, each a prose skill the substrate runs model-interpreted:

| agent | trigger | does |
|---|---|---|
| `pm` | `cron */15` | the only dispatcher — sweeps the board, enforces WIP (≤1 in-progress, ≤1 in-review), launches the next eligible worker |
| `draft` | `dispatch` | shapes an untriaged request into a verifiable Ready issue (sources + 1-3 ACs + evidence scaffold) |
| `develop` | `dispatch` | implements one Ready issue and produces real evidence per AC; stops on a human-required path/topic |
| `review` | `dispatch` | gates an In-Review change: `ztrack check` green, every passed AC backed by cited evidence, then Done or rework |

The PM is the only autonomous trigger (`cron`). The three workers are **`dispatch`** agents: the PM reads
the ztrack board on its tick, decides the next move from each issue's state (a property it READS, not a
trigger), and **launches** the matching worker through the Runner (`agent:launch`):

```bash
bun scripts/runner.ts launch develop --ref <issue-id>
```

The work item rides in as `--ref` and the worker reads it as `$ZTRACK_ISSUE` (its `subject.ref` param).
This is fully substrate-agnostic — `cron` + `agent:launch` are the two portable primitives, so the same
loop runs on local and github with no substrate task-state machinery (`docs/RUNNER.md`).

The agents use [`ztrack`](https://github.com/volter-ai/ztrack) for tooling (issues, checks, evidence);
the shared `standards/` are read by every skill.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-sdlc local
bun bin/autonomy-compile.ts profiles/simple-sdlc github /tmp/simple-sdlc-gh
```
