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
The dispatch model is substrate-agnostic (`cron` + `agent:launch`), but this profile targets **`local`
only**: it is **PR-free** — review is the reviewer's verdict over commit-evidence, not a pull request.
The github substrate lands a `code:propose` change as an auto-merging PR gated by an independent
`agent-review` status (a boundary this profile doesn't provide), so a PR-free process can't merge there.
The GitHub PR-based SDLC is `simple-gh-sdlc`'s job.

The agents use [`ztrack`](https://github.com/volter-ai/ztrack) for tooling (issues, checks, evidence);
the shared `standards/` are read by every skill.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-sdlc local
```
