# Trigger params — the cross-substrate contract

A trigger fires a workflow and **forwards params to the launched agent** — the producing end of the
Runner contract's `launch(agent, params)` (opaque `LaunchParams`). This is how an agent learns *what to
act on* — explicitly, from declared config, **never** by reaching into a substrate's implicit event
context.

## The shape

In the IR, a trigger may declare `params`:

```yaml
triggers:
  - event: issues
    config: { types: [labeled] }
    params: { ISSUE: subject.ref }       # opaque name  ->  documented source
```

- **Param name** (`ISSUE`) — the profile's choice. **The core never interprets it**; it only wires it
  through to `launch(agent, params)`.
- **Source** (`subject.ref`) — drawn from the **documented vocabulary below**. Every substrate MUST be
  able to resolve each documented source from its own firing context.

The agent receives the resolved params (github: as job env; local: as `AUTONOMY_FORWARD` env) and its
**tooling** interprets them (`gh` on github, ztrack on local). The substrate's own runtime may also use
a resolved source for its realization (github fetches the `subject.ref` work item to bundle/PR it) — but
that is the substrate reading the *documented* source, not implicit event magic.

## The source vocabulary (every substrate must implement these)

| source | meaning | github resolves from | local resolves from |
|---|---|---|---|
| `subject.ref` | id of the work item that fired the trigger | `event.issue.number` / `event.inputs.issue_number` / `event.pull_request.number` | work-store item id |
| `subject.actor` | who initiated it | `event.sender.login` / `github.actor` | requester |
| `subject.text` | the text that fired it (comment/body); empty if N/A | `event.comment.body` / `event.issue.body` | queued message |
| `trigger.kind` | why it fired | `event.action` / `event_name` | queue event kind |

A source a substrate cannot resolve for a given trigger resolves to empty — the agent's tooling decides
what to do with that. New sources are added here first, then implemented by each substrate; profiles
depend only on this vocabulary, never on a substrate's raw event shape.

## How github realizes it (reference)

`compileGithub` unions a launch workflow's declared trigger params, resolves each source via the table
above into the `setup` and agent job env (keyed by the opaque param name), and the agent fetches its
work item from the `subject.ref` param via `gh` — replacing the old implicit `$GITHUB_EVENT_PATH`
reach-in. The run id is deterministic per run, so no params are threaded between jobs.
