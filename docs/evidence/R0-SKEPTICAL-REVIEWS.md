# R0 independent skeptical reviews

Two independently tasked agents performed read-only reviews against the R0 AC and implementation on 2026-07-15.
They did not edit the reviewed files. This record preserves findings and dispositions; it is not evidence that
downstream controls already exist.

## Proof-accounting review

The review demonstrated false completion with evidence-free `assumed` claims, malformed enum values, and deleted
dependencies. It also identified weak disposition/residual invariants, empty semantic coverage, duplicate checkpoint
and evidence identities, unenforced lifecycle transitions, destructive reinitialization, and combined negative tests.

Disposition: the three demonstrated closure exploits and identity/coverage/residual checks were fixed in
`organization-runtime-ledger.ts` with dedicated minimal-counterexample tests. Append-only transition history,
assurance-to-evidence policies, artifact digest resolution, and non-destructive migrations remain owned by R3, R5,
R8, R9, and R18; R0 must not claim those later guarantees.

## Threat, failure, and economic review

The review inspected the GitHub/local substrates, model proxy, durable ledgers, session capture, provisioning, and
provider integration. It found the concrete privacy, credential, tenancy, ambient-authority, OIDC, provider,
idempotency, economic, branch-protection, external-effect, Durable Object, and transcript boundaries now enumerated
in `R0-BASELINE-THREAT-MODEL.md`.

Disposition: every finding is assigned to at least one R1–R28 control point. No finding is rejected or considered
fixed merely by inventorying it. The R0 residual invariant is therefore zero *unowned* findings, not zero known risk.
