# Bench — the workload suite

Bench measures **org design**, not models. An experiment is a **cell**: `profile × substrate × workload`
(see `docs/VISION.md`). We hand an autonomous org a substantial **goal**, let it run for **real time**,
and score the **outcome by judgment** — an AI judge against a rubric — not a unit-test oracle. That fitness
reading has two axes:

- **quality** — did it actually achieve the goal? (`scripts/bench-judge.ts`, AI judge on the rubric)
- **autonomy** — how much was done by agents vs humans? (`scripts/autonomy-ratio.ts`, over decision records)

## A workload

`bench/workload/<name>/` is one workload — a diverse, human-owned task. The suite spans the SDLC task
taxonomy (docs / bug / feature / refactor / security / flaky test); diversity is mandatory, or you find the
best org for *one* repo, not the best org.

```
bench/workload/<name>/
  workload.json   # metadata + the rubric (weighted criteria the judge scores)
  goal.md         # the substantial goal, in prose — what "done" means
  seed/           # the starting repository (empty-ish for greenfield, rough code for refactor/bug)
```

`workload.json`:

```jsonc
{
  "name": "todo-cli",
  "kind": "feature",              // docs | bug | feature | refactor | security | flaky
  "summary": "...",
  "timeBudgetMinutes": 120,        // how long the org gets — a bench takes real time
  "appliesTo": ["self-driving", "simple-sdlc"],
  "rubric": [
    { "id": "core", "weight": 3, "criterion": "...", "guidance": "what 0 vs 3 vs 5 looks like" }
  ]
}
```

The rubric is the contract: each criterion is scored 0–5 by the judge with a justification grounded in the
result repo, then weighted into a single 0–1 score. Write criteria a skeptical reviewer could defend —
absent tests, stubs, and TODOs must score low.

## Running a cell

**Preflight (static, cheap, deterministic) — `bun bin/bench.ts`.** For every cell it overlays
`compile(profile, substrate)` onto the workload and asserts the install *coexists* with the project: it may
seed an install-owned file (`package.json`/`README`…) when missing, but never overwrites the project's own
source, and never leaks another profile's agents. This gates a cell before spending real time/money on a
live run. (Pure per-profile compile coherence is `check:profiles`.)

**Live (the real bench) — `bun bin/bench.ts --live` (being wired).** Per cell: provision a disposable repo
from `seed/`, seed the goal as the org's intake, run the profile **autonomously** for its time budget —
*set preconditions, let cron drive it, never hand-crank the autonomy* (a hand-driven run contaminates its
own fitness reading) — then tear down and score:

```
bun scripts/bench-judge.ts --workload bench/workload/todo-cli --result <run-repo> --out score.json
bun scripts/autonomy-ratio.ts <run-repo>/.agent-run/.../decisions
```

The judge uses the transparent model seam (`scripts/model-call.ts`): point `OPENAI_BASE_URL`/`OPENAI_API_KEY`
or `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY` at the box endpoint (a real provider, or the universal proxy).

## Live bench: one-time setup

Disposable bench repos live in a sandbox org (`volter-test-fixtures`). For their agents to actually run,
three things must be true for that org — set once:

1. **Proxy trusts the org.** The model proxy mints per run via OIDC and gates on
   `GITHUB_OIDC_ALLOWED_WORKFLOW`. Add an owner wildcard (`volter-test-fixtures/*`) so disposable repos
   mint without per-repo edits, then redeploy the worker.
2. **Org Actions policy allows write.** GitHub orgs default workflow tokens to read-only and block
   Actions from creating PRs; the publisher needs both. Set once:
   `gh api -X PUT orgs/<org>/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true`.
3. **A funded pool account.** `ENFORCE_ACCOUNT_BALANCE` is on, so each repo needs its own balance to mint.
   Fund a pool (a treasury action, admin token) — e.g. grant the `volter-test-fixtures` account a budget —
   from which cells are funded.

## Funding is a transaction (fund → spend → refund)

Each cell is **explicitly funded at bootstrap** with a *bounded* grant, so a runaway in one repo can only
drain its own budget — never the pool or a sibling. Funding is a ledger transaction; the unused remainder
is **refunded** (the reverse transaction) at teardown, so the pool only ever loses the actual model spend.
The agent (the GitHub action) only *reads/spends* its budget via OIDC — allocation is the operator's job,
done by `bench --live`/`--teardown`, never in the agent's CI.

```
MODEL_PROXY_ADMIN_TOKEN=… bun bin/bench.ts --live    --workload todo-cli --profile self-driving \
    --funder volter-test-fixtures --fund-usd-cents 500       # grant the cell a bounded $5 from the pool
# … the agents run autonomously on cron, spending only the cell's own budget …
bun bin/bench.ts --score --repo <owner/name> --workload todo-cli
MODEL_PROXY_ADMIN_TOKEN=… bun bin/bench.ts --teardown --repo <owner/name> --funder volter-test-fixtures
                                                            # refund the unused balance + delete the repo
```

## Discipline

One run is a noisy sample (model nondeterminism + workload variance) — repeat and treat the score as a
**distribution, not a point**. Use a strong judge model, and keep the judge blind to the profile under test.

## Adding a workload

Drop a new `bench/workload/<name>/` with `workload.json` + `goal.md` + `seed/`. Keep the goal substantial
(it should take real autonomous work) and the rubric grounded in observable evidence. `bun bin/bench.ts`
picks it up automatically.
