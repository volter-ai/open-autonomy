# R20 twin-conformant engineering closure

R20 closes the engineering command-plane checkpoint under the `twin-conformant-engineering` evidence profile. The
typed command plane binds tenant, principal, channel, thread, work, decision, artifact, scope, expiry, nonce, and
idempotency. Ambiguous or prompt-like text cannot cross a privileged confirmation boundary. Evidence-bearing status
preserves conflicts and unknowns, and accepted Slack delivery survives response loss and process restart without a
duplicate effect.

The Slack integration executes the real `@slack/web-api` SDK against `@volter/twin-slack` 0.1.0 pinned by `bun.lock`.
The scenario covers threaded delivery, provider metadata reconciliation, accept-then-timeout, durable restart, and
duplicate suppression. R10, R17, R18, and R19 are closed dependencies; the Hermes live-substrate proof remains real
and is not replaced by the Slack twin.

This closure does not claim real-human usability, keyboard or screen-reader accessibility, unfamiliar-operator
performance, real Slack workspace custody, or production duration. Those are separately tracked
`external-validation` claims in `R20-R23-EXTERNAL-PARTICIPATION.md`.
