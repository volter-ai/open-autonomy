# simple-gh-sdlc

The GitHub PR-based software-delivery loop — the github counterpart of `simple-sdlc`. Same
ztrack-tracked dispatch loop, but the merge boundary is GitHub's: a change lands as an auto-merging
**pull request** gated by an independent `agent-review` status, not the local reviewer's verdict.
Four agents, each a prose skill the substrate runs model-interpreted:

| agent | trigger | does |
|---|---|---|
| `pm` | `cron */15` | the only dispatcher — sweeps the ztrack board, enforces WIP, **launches** the next eligible `develop` (review is automatic on the PR) |
| `draft` | `dispatch` | shapes an untriaged request into a verifiable Ready issue (sources + 1-3 ACs + evidence scaffold) |
| `develop` | `dispatch` | implements one Ready issue with evidence and pushes its branch; the substrate opens an auto-merging PR. `code:propose`, reviewed by `reviewer` |
| `reviewer` | `event: pull_request_target` | the independent GitHub reviewer: verifies the PR (ztrack green + every passed AC backed by cited evidence) and posts `agent-review`. `code:review`, never merges |

The PM (cron) reads each issue's state (a property it READS, not a trigger) and **launches** `develop`
through the Runner (`bun scripts/runner.ts launch develop --ref <id>`; the work item rides in as `--ref`
→ `$ZTRACK_ISSUE`). It does **not** dispatch review: the developer's change opens an auto-merging PR and
the substrate triggers the `reviewer` on it. The **merge boundary** is the `code:propose` / `code:review`
permission split — no agent holds both, none can land unreviewed code; `ci` + `agent-review` green →
native auto-merge (done = merged PR). This is `self-driving`'s merge model, generalized to a ztrack-tracked
SDLC.

Targets **`github`** (the PR/agent-review boundary is github's). For the PR-free local loop, use
[`simple-sdlc`](../simple-sdlc). The agents use [`ztrack`](https://github.com/volter-ai/ztrack) (preset
`simple-gh-sdlc`: PR at in-review, merged PR for done) for issues, checks, and evidence; the shared
`standards/` are read by every skill.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-gh-sdlc github /tmp/simple-gh-sdlc
```
