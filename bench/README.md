# Bench — the workload suite

Bench is the **one** live-eval harness — it measures **org design**, not models. (The former standalone
`testbed`/`scaffold`/`bootstrap-*` scripts were folded in here.) An experiment is a **cell**:
`profile × substrate × workload` (see `docs/VISION.md`). We
provision a real repo, hand the autonomous org its intake, let it run for **real time**, then **grade** the
outcome.

### Graders — pluggable per workload

Each workload declares which graders apply (`"graders": [...]`) — the eval-framework idiom (one case suite,
scorers chosen per case; cf. OpenAI Evals / HELM / braintrust). Three exist:

- **`rubric`** — quality: did it achieve the goal? An AI judge investigates the result repo and scores the
  workload's weighted rubric (`scripts/bench-judge.ts`). Right for **open-ended** goals (feature/refactor),
  where a fixed test oracle would over-constrain.
- **`coverage`** — did each wired capability fire? Maps the run's live issues/PRs/runs to `[oa-test:<id>]`
  scenarios (`scripts/bench-coverage.ts`). Right for **conformance/smoke** workloads.
- **`autonomy`** — how much was done by agents vs humans, over the decision records (`scripts/autonomy-ratio.ts`).

`bun bin/bench.ts --score` runs exactly the graders the workload declares.

## A workload

`bench/workload/<name>/` is one workload — a diverse, human-owned task. The suite spans the SDLC task
taxonomy (docs / bug / feature / refactor / security / flaky test); diversity is mandatory, or you find the
best org for *one* repo, not the best org.

```
bench/workload/<name>/
  workload.json   # metadata + graders + intake mode (+ the rubric, if graded by rubric)
  goal.md         # the substantial goal / what "done" means (or, for smoke, what the scenarios cover)
  seed/           # the starting repository (empty-ish for greenfield, rough code for refactor/bug,
                  #   the scenario repo + seeder for conformance) — PROJECT input only, never generated files
```

The four current workloads span the taxonomy: `todo-cli` (feature, rubric), `kv-harden` (refactor, rubric),
`self-driving-conformance` (smoke, coverage), `self-driving-greenfield` (greenfield self-start, rubric).

`workload.json`:

```jsonc
{
  "name": "todo-cli",
  "kind": "feature",              // docs | bug | feature | refactor | security | flaky | smoke | greenfield
  "summary": "...",
  "timeBudgetMinutes": 120,        // how long the org gets — a bench takes real time
  "appliesTo": ["self-driving", "simple-sdlc"],
  "graders": ["rubric", "autonomy"],     // which graders --score runs (rubric | coverage | autonomy)
  "intake": { "mode": "goal" },          // goal (seed goal.md as one issue) | scenarios (run a seeder) | none (self-start)
  "rubric": [                            // required when graders includes "rubric"
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

**Live (the real bench) — `bun bin/bench.ts --live`.** Per cell: compile the profile, overlay the workload
`seed/` (install-owned files kept so the runtime survives), provision a disposable repo, seed the org's
intake per the workload's `intake.mode` (a goal issue / a scenario seeder / nothing for self-start),
bootstrap-fund a bounded budget, then let the org run **autonomously** for its time budget — *set
preconditions, let cron drive it, never hand-crank the autonomy* (a hand-driven run contaminates its own
fitness reading). When it settles, score and tear down:

```
bun bin/bench.ts --score --repo <owner/name> --workload todo-cli   # runs the workload's declared graders
bun bin/bench.ts --teardown --repo <owner/name> --funder volter-test-fixtures
```

The judge is an **independent** agentic scorer (evaluator ≠ evaluated): it runs on the **operator's own
model access** — your local `claude -p` (default) or `codex exec` (`--harness codex`) with *your* login —
**never** the cell's funded proxy. It investigates the result repo (reads the diff, runs the tests) before
scoring. `--model`/`BENCH_JUDGE_MODEL` override; otherwise each harness uses its own default. Keep it blind
to the profile under test.

## Live bench: one-time setup

Disposable bench repos live in a sandbox org (`volter-test-fixtures`). For their agents to actually run,
three things must be true for that org — set once:

1. **Proxy trusts the org.** The model proxy mints per run via OIDC and gates on
   `GITHUB_OIDC_ALLOWED_WORKFLOW`. Add an owner wildcard (`volter-test-fixtures/*`) so disposable repos
   mint without per-repo edits, then redeploy the worker.
2. **Org Actions policy allows write.** GitHub orgs default workflow tokens to read-only and block
   Actions from creating PRs; a `code:propose` agent needs both. Set once:
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
