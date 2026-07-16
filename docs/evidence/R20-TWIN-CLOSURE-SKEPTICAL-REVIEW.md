# R20 twin-conformant closure — skeptical review

Verdict: PASS for engineering conformance; no verdict on external validation.

The critical substitution boundary holds. `@volter/twin-slack` replaces only Slack's remote Events/Web API service;
it does not replace Hermes, the command-plane implementation, a worker/model, or a human. The integration invokes the
real Slack SDK and checks observable provider state after an accepted-response-loss fault and restart. Unit and
property tests cover authorization binding, expiry, replay, cross-thread and wrong-principal cases, typed
confirmation, evidence/unknown preservation, revocation, and audit reconstruction.

Attempted falsifications considered:

- Twin contract or scenario drift: the package is lockfile-pinned and the integration source is content-addressed by
  the closure ledger; the bench-world closure profile additionally rejects missing implementation revision or
  scenario digest.
- Claim inflation: the closure document explicitly excludes human, accessibility, unfamiliar-operator, real-workspace,
  and production-duration claims.
- Substrate substitution: the bench-world validator rejects a twin whose service identifier names Hermes or another
  compiled component.
- Silent delivery success: the test injects failure after provider acceptance, then requires reconciliation and one
  provider-side message after restart.

Remaining external questions are useful empirical validation work, but none falsifies the four R20 formal engineering
obligations as scoped by the normative evidence profiles.
