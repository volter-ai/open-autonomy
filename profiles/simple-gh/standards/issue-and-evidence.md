# Issue And Evidence Standard

Read this from Manager, Planner, Kaizen, and implementation/review subagents.

## Task interface

The configured task tool is the only task interface. Agents list, view, transition, discuss, and
validate tasks through it. They do not inspect or hand-edit task persistence.

This profile uses ztrack, but role behavior depends on the portable lifecycle mapping in
`.open-autonomy/autonomy.yml`, not identifier prefixes, labels, Markdown paths, or the selected backing.
ztrack may use local Markdown, GitHub Issues, or synchronized storage without turning any backing into a
second task API. GitHub remains the separate code-host interface for branches, PRs, checks, reviews, and
merges.

## Publishing task documents

Planner and Kaizen may publish one Markdown document containing multiple tasks. Manager never imports or
parses those documents; after registration it consumes normalized tasks through the task tool.

Author `docs/plans/<topic>-<YYYY-MM-DD>.md` as ordinary Markdown:

```markdown
## Add a connected runtime-continuation proof

Status: draft

Explain the declared outcome, observed reality, impact, dependencies, and evidence.

### Acceptance Criteria

- [ ] dev/01 the ordinary consumer completes the declared continuation workflow
- [ ] dev/02 the regression fails if the adapter is disconnected
```

Use descriptive headings without task identifiers. Register the exact file with the configured task
tool (for ztrack, `npx ztrack import <file> --register`). The task service allocates identifiers from its
configured team and rewrites the document into strict source grammar. Never scan persistence to choose a
number.

Use the installed lifecycle mapping:

- Planner: proven proposals are `open`; Planner never sets `ready`.
- Kaizen: every process finding is `inputRequired`.
- Maintainer: triages `open` proposals and promotes approved work to `ready`.
- Manager: consumes only `ready`; it does not promote plan-document content.

## Audit receipts and retention

Planner and Kaizen persist compact reviewed receipts under `docs/audits` so later runs have an honest
cursor and maintainers can verify that claimed coverage occurred. A receipt retains only its time
window, depth or review class, surfaces inspected, stable evidence references, finding keys,
counterevidence, and conclusion. Raw transcripts, command dumps, large inventories, and working notes
remain scratch and are not committed.

A no-finding run still publishes a receipt but creates no empty task. Receipt-only PRs receive the same
current-SHA review and required-check boundary as task-bearing proposals.

## Acceptance criteria and evidence

Acceptance criteria must be observable, testable, and small enough to prove with a real change. Name the
consumer-visible result and the regression that would fail if it disappeared.

Unchecked criteria describe required work. A checked criterion carries real evidence and proof:

```markdown
- [x] dev/01 requests over the configured limit return 429
  - status: passed
  - evidence ev1: commit=abc1234 acv=1
  - proof: "the regression exercises the 429 response" -> ev1
```

Never invent commits, artifacts, source text, or approvals. If evidence does not exist, leave the
criterion unchecked.

## Task and PR discipline

- Implementation PRs cite the task id and summarize the effect.
- Reviews record `oa-review: pass|fail sha=<head-sha> — <findings>`.
- A review for an older SHA is stale.
- Done requires a merged implementation PR, passed criteria with evidence, task validation, and the
  mapped `done` state.
- Task state and publication changes are performed through the task tool and proposed through ordinary
  reviewed PRs when the selected backing is committed. Never edit persistence manually.
- Manager verifies a proposal by querying its normalized task delta in an isolated checkout; it does not
  classify task work by filenames or provenance markers.
