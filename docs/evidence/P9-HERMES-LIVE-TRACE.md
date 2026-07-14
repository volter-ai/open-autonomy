# P9 Hermes local live trace

Observed 2026-07-14 EDT against Hermes Agent `v0.18.2 (2026.7.7.2)`, pinned upstream revision
`226e8de8`. This is an identified local component trace, not a claim about a hosted Slack deployment.

The proof used the isolated board `oa-p9-proof-20260714`; it did not switch or mutate the default board. Its SQLite
database is `/home/porta/.hermes/kanban/boards/oa-p9-proof-20260714/kanban.db`.

## Durable unrelated work and idempotent intake

- Creation with idempotency key `p9-live-a` returned task `t_551063c1`.
- Repeating creation with the same key and different title/body returned the same `t_551063c1` and retained the
  original fields.
- Independent key `p9-live-b` created distinct task `t_703ce2b4`.
- Separate `hermes kanban ... list/show/runs` processes observed both tasks, demonstrating recovery from durable board
  state rather than original controller memory.

## Worker loss, fencing, reassignment, and completion

Task `t_551063c1` was claimed as run 1 by `proof-worker`, heartbeated, and given a durable question comment. A
completion attempt pinned to nonexistent run 999 printed `cannot complete ...`; importantly, the Hermes CLI returned
exit status 0 despite refusing the mutation, so an adapter must validate resulting state/output rather than trusting
process exit alone. The task remained running.

Run 1 was manually reclaimed with reason `P9 injected worker loss`, the task was reassigned to `proof-reviewer`, and
run 2 claimed it. Completion pinned to run 2 succeeded with metadata `{evidence: live-local, tests: 1}`. The final
history identifies run 1 as `reclaimed` and run 2 as `completed`; the task is `done`.

## Delayed input and fresh attempt

Task `t_703ce2b4` was claimed as board-global run 3, blocked with typed reason `needs_input`, and observed as blocked
from a fresh CLI process. A durable answer comment explicitly correlated `t_703ce2b4/run 3`; unblocking created a new
claim, run 4, which completed successfully. The final history contains two separately addressable attempts: run 3
`blocked`, run 4 `completed`.

An earlier deliberate/diagnostic call pinned the task to run 1 instead of its actual board-global run 3. Hermes
refused the state transition while still appending the CLI's human-readable BLOCKED/UNBLOCK comments. This is retained
as adversarial evidence: Open Autonomy must use the observed current run/fence and must not interpret comments or exit
status as authoritative transition success.

Final live board state: two tasks, both `done`, zero running/blocked/ready tasks. The deterministic controller tests
cover signed Slack-envelope classification/correlation, duplicate events, restart/outbox replay, capacity, reviewer
admission, budget exhaustion, forged completion, artifact-bound approvals, and prompt-like untrusted messages without
requiring live external Slack credentials.
