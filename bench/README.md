# Bench — the workload suite

Bench is the **one** live-eval harness — it measures **org design**, not models. (The former standalone
`testbed`/`scaffold`/`bootstrap-*` scripts were folded in here.) An experiment is a **cell**:
`profile × substrate × workload` (see `docs/VISION.md`). We
provision a real repo, hand the autonomous org its intake, let it run for **real time**, then **grade** the
outcome.

### Development execution worlds

The creation/conformance stack may run a real compiled substrate inside a controlled service world. The typed
`bench/dev/bench-world.ts` contract keeps four roles disjoint: the real compiled target (Hermes, Paperclip, or
local composition), external service dependencies, Volter twins that substitute only those services, and explicitly
labeled behavioral simulators. This is bench scaffolding, not Organization IR and not content shipped in a compiled
installation. A twin cannot replace the substrate under test, and simulator evidence cannot satisfy substrate or
service conformance.

This service-twin machinery is distinct from the **organizational twin** in R25: the latter is an executable,
calibrated mathematical model used by the autonomous-improvement loop. It may be shipped as product functionality;
Volter service twins and bench behavioral simulators are creation-time infrastructure only.

Campaign/readiness accounting follows the same dependency direction. The R20–R28 progress verifier lives under
`bench/dev/evidence/` and may inspect bench fixtures and Volter dependency pins; core never imports the bench or
hardcodes a service-twin implementation.

External R27 experiment-closure and R28 long-running-campaign verifiers live in the same bench evidence layer.
Core owns the reusable experiment and bounded-improvement semantics; bench decides whether external evidence is
strong enough to close their punch-list checkpoints.

Independently administered R20–R28 evidence is consumed through `bun run verify:external-campaign -- --checkpoint
R20..R28 --verified-at <ISO-8601> --bundle <json> --trust-module <module> --trust-attestation <json> --trust-root <pem> --out <receipt.json>`.
The explicit verification time is included in the receipt, bounds trust-module attestations, and is
passed to the time-sensitive R26 and R28 verifiers. No wall-clock default is permitted.

R20 acquisition freezes the externally signed registration, then exposes immutable requests for
each preregistered trial. Requests may be handled in parallel, but only by the participant and key
assigned to that trial. Collection remains unavailable until every observation is accepted. The
independent collector then declares its identity and signing time before receiving the digest of the
exact complete campaign to sign:

```sh
bun run acquire:r20 -- init --state campaign.state.json --registry external-registry.json
bun run acquire:r20 -- issue-registration --state campaign.state.json --out registration.request.json
bun run acquire:r20 -- issue-observation --state campaign.state.json --trial trial-id --out trial.request.json
bun run acquire:r20 -- accept-observation --state campaign.state.json --trial trial-id --response trial.response.json
bun run acquire:r20 -- status --state campaign.state.json
```

The other actions are `accept-registration`, `issue-collector-intent`,
`accept-collector-intent`, `issue-collection`, `accept-collection`, and `assemble`. As with R27 and
R28, every issued request is persisted before exposure, and assembly still requires the production
external verifier.

R27 evidence collection uses a separate, restart-safe custody protocol. Initialize it with an
externally supplied registry whose roles have distinct Ed25519 public keys, then issue and accept
one stage at a time:

```sh
bun run acquire:r27 -- init --state campaign.state.json --registry external-registry.json
bun run acquire:r27 -- issue --state campaign.state.json --stage dependencies --out dependencies.request.json
bun run acquire:r27 -- accept --state campaign.state.json --stage dependencies --response dependencies.response.json
bun run acquire:r27 -- status --state campaign.state.json
bun run acquire:r27 -- assemble --state campaign.state.json --out r27-external-bundle.json
```

Each response signs the canonical JSON of `{schema, requestDigest, fragmentDigest, signerKeyId,
signedAt}` and contains the exact `fragment`. Requests bind the campaign, role, fixed protocol
manifest, and accepted prerequisite response digests. The collector rejects premature stages,
role substitution, altered fragments, equivocation, duplicate cryptographic identities, and
invalid signatures. Successful state transitions use atomic replacement plus file and directory
`fsync`. Assembly is impossible until every stage is accepted; assembly does not establish R27
closure. The resulting bundle must still pass the independently configured external verifier and
trust-module attestation command above.

R28 uses an append-only variant because the final artifact represents at least 90 days of live
operation. Its externally signed registration freezes the dependency, bounds, protected-control,
role-grant, and repository-baseline inputs. Four independently custodied streams (`heartbeats`,
`crashes`, `proposals`, and `audit`) are then appended and externally sealed. Completion binds the
final repository, attack drills, pause result, zero residuals, and generation time. Finally, a
distinct validator first declares its identity and key, then signs the exact assembled campaign:

```sh
bun run acquire:r28 -- init --state campaign.state.json --registry external-registry.json
bun run acquire:r28 -- issue-registration --state campaign.state.json --out registration.request.json
bun run acquire:r28 -- issue-append --state campaign.state.json --stream heartbeats --out heartbeat.request.json
bun run acquire:r28 -- accept-append --state campaign.state.json --stream heartbeats --ordinal 1 --response heartbeat.response.json
bun run acquire:r28 -- issue-seal --state campaign.state.json --stream heartbeats --out heartbeat-seal.request.json
bun run acquire:r28 -- status --state campaign.state.json
```

The remaining CLI actions are `accept-registration`, `accept-seal`, `issue-completion`,
`accept-completion`, `issue-validator-intent`, `accept-validator-intent`, `issue-validation`,
`accept-validation`, and `assemble`. Every issuance is persisted before its request file is exposed.
The final campaign must still pass `verify:external-campaign`; collection is not closure.

The trusted module exports `trust` implementing
the checkpoint contract. It must also be supplied with `--trust-attestation <json> --trust-root <pem>`: an external
Ed25519 authority signs the exact module digest and checkpoint, preventing an unapproved always-allow policy from
being substituted. Verification writes one content-addressed canonical receipt only after the trust binding and
complete campaign verifier pass; malformed or rejected evidence produces no receipt.

### Graders — pluggable per workload

Each workload declares which graders apply (`"graders": [...]`) — the eval-framework idiom (one case suite,
scorers chosen per case; cf. OpenAI Evals / HELM / braintrust). Two exist:

- **`rubric`** — quality: did it achieve the goal? An AI judge investigates the result repo and scores the
  workload's weighted rubric (`scripts/bench-judge.ts`). Right for **open-ended** goals (feature/refactor),
  where a fixed test oracle would over-constrain.
- **`coverage`** — did each wired capability fire? Maps the run's live issues/PRs/runs to `[oa-test:<id>]`
  scenarios (`scripts/bench-coverage.ts`). Right for **conformance/smoke** workloads.

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
