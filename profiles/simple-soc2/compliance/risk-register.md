# Risk register / risk assessment

> **Owner:** [OWNER] · **Last assessment:** [DATE] · **Cadence:** ≥ annually + on material change (CC3).

Score = Likelihood (1–5) × Impact (1–5). Treat anything ≥ 12 with a dated remediation plan. The seeded rows
are the risks inherent to running an autonomous fleet on this stack — review, re-score for your context, and
add your product-specific risks.

| ID | Risk | L | I | Score | Treatment | Control / owner | Status |
|----|------|---|---|-------|-----------|------------------|--------|
| R1 | An agent lands unreviewed/malicious code | 2 | 5 | 10 | Merge boundary + required checks + human gate | C2/C4/C5 / [OWNER] | Open |
| R2 | Prompt-injected agent exfiltrates a token/secret | 2 | 5 | 10 | Egress lockdown; capability-scoped tokens; secret redaction | C3/C1/C13 / [OWNER] | Open |
| R3 | Source code leaks via a subprocessor (proxy/OpenRouter/provider) | 3 | 4 | 12 | Vendor mgmt + DPAs; proxy persists no bodies | O4/C18 / [OWNER] | Open |
| R4 | Vulnerable dependency enters the build | 3 | 3 | 9 | Supply-chain gate, dependency review, SBOM, Dependabot | C7/C9/C10 / [OWNER] | Open |
| R5 | Confidential code retained too long in transcripts | 3 | 3 | 9 | Retention sweep + classification policy | C14 / [OWNER] | Open |
| R6 | The fleet (PM) silently stops — work/alerts stall | 3 | 3 | 9 | Liveness watchdog | C17 / [OWNER] | Open |
| R7 | Spend runaway / cost-control bypass | 2 | 3 | 6 | Per-run caps (proxy); repo-pause kill-switch | C18 / [OWNER] | Open |
| R8 | Branch protection drifts off (control silently disabled) | 2 | 5 | 10 | Evidence snapshot detects drift; provision.json reconciles | C5/C16 / [OWNER] | Open |
| R9 | Stale/over-privileged collaborator access | 3 | 4 | 12 | Quarterly access review off the evidence snapshot | O3/C16 / [OWNER] | Open |
| R10 | _[your product risk]_ | | | | | | |

## Method

1. Identify assets + threats (this table). 2. Score L×I. 3. Decide treatment (mitigate/accept/transfer/avoid)
with an owner + date. 4. Track to closure. 5. Re-assess on the cadence above and after any incident or
material architecture change. Retain each dated assessment as evidence (CC3).
