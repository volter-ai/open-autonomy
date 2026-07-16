# @open-autonomy/dry-run

Hermetic execution substrate for autonomy workflows: run the REAL workflow —
not a mock of it — with zero external egress, before it ever touches a real
vendor account.

**The rule: dry-run is a dependency configuration, not a second workflow
implementation.** A workflow depends on port contracts (`ports.ts`) for every
external effect — messaging, documents, code host, builds, and the clock —
and the mode decides which adapter set is wired in:

| Adapter set | What it is | When |
|---|---|---|
| `sim` (`adapters/sim.ts`) | in-process, deterministic, zero servers | unit tests, CI e2e |
| twin | the same contracts over loopback HTTP against local vendor twins | high-fidelity local rehearsal of live call shapes |
| live | real credentials, same contracts | production |

## What the substrate owns

- **`clock.ts`** — injectable time. `virtualClock` lets a scenario advance a
  30-minute quiet window in microseconds; no test ever sleeps.
- **`ledger.ts`** — an append-only JSONL record of every externally visible
  action: in dry-run, the complete "what WOULD have hit the world" audit.
- **`guard.ts`** — fail-closed hermeticity. `assertDryRunConfig` refuses
  non-loopback endpoints and real-looking credentials at startup;
  `installEgressGuard` replaces `globalThis.fetch` so any non-loopback request
  rejects and is recorded. "External egress was zero" becomes a checked fact.
- **`adapters/sim.ts`** — seedable in-process ports (messaging with
  per-author identity and cursor reads, revisioned documents, a symbolic code
  host, a deterministic build simulator with a flaky-runner hook).
- **`adapters/git-code-host.ts`** — a CodeHostPort backed by a real local bare
  repository: shas, merges, and release diffs are actual git ground truth.

## What the consumer owns

The workflow itself — its state machine, gates, and policy — plus its
idempotency keys (persist a claim per externally visible action so a restart
re-runs into the same single outcome). The substrate deliberately has no
workflow engine; see the repo docs for the consumer contract patterns
(quiet windows, human-attestation gates, restart-at-every-boundary tests).

The first proven consumer is a daily delivery cycle (document intake →
derived issues → candidate branch → built artifact → human approvals over
identity-bearing messages → quiet window → outbound PR) that runs its entire
journey in both the sim world and a twin world with the egress guard armed.
