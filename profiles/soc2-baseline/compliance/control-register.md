# SOC 2 control register — soc2-baseline

> GENERATED from `control-register.yml` by `scripts/soc2-register.ts render`. Do not hand-edit — edit the YAML.
> Covers all **61** AICPA TSC criteria (2017, rev 2022). class: **a**=automatable+tracked · **b**=human-process tracked/visible · **c**=inherently external.

Criteria: **61/61** · enforced 10 · tracked 49 · external 2.

## Criteria

| Criterion | Statement | Class | Status | Owner | Evidence | Control refs |
|---|---|---|---|---|---|---|
| CC1.1 | Commitment to integrity & ethical values | b | tracked | leadership | policy-ack | compliance/policies/acceptable-use-policy.md, compliance/policies/information-security-policy.md |
| CC1.2 | Board independence & oversight of internal control | c | external | leadership | management-review-record _(ext: board / leadership — no board in a small org; substituted by a recorded management review)_ | — |
| CC1.3 | Structures, reporting lines, authorities & responsibilities | b | tracked | leadership | org-roles-record | compliance/policies/information-security-policy.md |
| CC1.4 | Commitment to competence (attract/develop/retain) | b | tracked | hr | training+background-records | compliance/policies/hr-security-policy.md |
| CC1.5 | Accountability for internal-control responsibilities | b | tracked | leadership | policy-ack | compliance/policies/hr-security-policy.md, compliance/policies/information-security-policy.md |
| CC2.1 | Use relevant, quality information for internal control | b | tracked | leadership | evidence-ledger | compliance/policies/information-security-policy.md |
| CC2.2 | Internally communicate objectives & responsibilities | b | tracked | hr | training+ack-records | compliance/policies/information-security-policy.md |
| CC2.3 | Externally communicate matters affecting internal control | b | tracked | leadership | external-comms-record | SECURITY.md, compliance/policies/privacy-policy.md |
| CC3.1 | Specify objectives to enable risk identification | b | tracked | leadership | risk-register | compliance/policies/risk-management-policy.md |
| CC3.2 | Identify & analyze risks | b | tracked | leadership | risk-register | compliance/risk-register.md |
| CC3.3 | Consider potential for fraud | b | tracked | leadership | risk-register(fraud) | compliance/risk-register.md |
| CC3.4 | Identify & assess change that impacts internal control | b | tracked | leadership | risk-register | compliance/policies/risk-management-policy.md |
| CC4.1 | Perform ongoing/separate monitoring evaluations | a+,+b | tracked | maintainer | evidence-ledger+mgmt-review | .github/workflows/evidence-collect.yml, .github/workflows/heartbeat.yml |
| CC4.2 | Evaluate & communicate control deficiencies (incl. senior mgmt/board) | a+,+b+,+c | tracked | maintainer | deficiency-issues _(ext: leadership/board (comms leg) — deficiency identification is human/agent judgment; board communication is external — watchdog only surfaces overdue cadence)_ | .github/workflows/compliance-cadence.yml |
| CC5.1 | Select & develop control activities | b | tracked | maintainer | control-register | compliance/control-register.md |
| CC5.2 | Technology general controls | a | enforced | substrate | ci-workflows | C1, C2, C5, C7, C8, C11 |
| CC5.3 | Deploy controls via policies & procedures | b | tracked | leadership | policy-ack | compliance/policies/ |
| CC6.1 | Logical access security software/architecture | a | enforced | substrate | workflow-perms | C1, C15, compliance/policies/access-control-policy.md |
| CC6.2 | Register/authorize/deprovision credentials | a+,+b | tracked | maintainer | collaborators-snapshot+offboarding | .github/workflows/evidence-collect.yml, compliance/policies/hr-security-policy.md |
| CC6.3 | RBAC / least-privilege / segregation of duties | a | enforced | substrate | merge-boundary | C1, C2 |
| CC6.4 | Physical access to facilities/assets | c | external | subprocessor | - _(ext: GitHub / Cloudflare — data-center physical security inherited; covered by their SOC2)_ | — |
| CC6.5 | Secure disposal so data cannot be recovered | a+,+b+,+c | tracked | maintainer | retention-PRs _(ext: subprocessor (media sanitization) — C14 covers transcript retention; full media/backup sanitization is procedure + subprocessor)_ | C14, compliance/policies/data-classification-and-retention-policy.md |
| CC6.6 | Protect against threats from outside the boundary | a | enforced | substrate | egress-guard | C3, C12 |
| CC6.7 | Protect data in transmission/movement/removal | a | enforced | substrate | https-egress | C15 |
| CC6.8 | Prevent/detect unauthorized or malicious software | a+,+c | tracked | maintainer | supply-chain-checks _(ext: org IT / endpoint admin — supply-chain/pinning shrink malicious-dep surface; endpoint anti-malware/EDR is external)_ | C7, C8, C11 |
| CC7.1 | Detect config changes & new vulnerabilities | a+,+b | enforced | substrate | scan-runs | C8, C9, C11, .github/workflows/security.yml |
| CC7.2 | Monitor for anomalies/security events | a+,+c | tracked | maintainer | audit-snapshots _(ext: org SecOps / SIEM — weekly snapshot + liveness != real-time anomaly detection; SIEM is external)_ | C16, C17 |
| CC7.3 | Evaluate security events to determine incidents | b | tracked | maintainer | incident-records | compliance/policies/incident-response-policy.md |
| CC7.4 | Respond to identified security incidents | b | tracked | maintainer | ir-tabletop-record | compliance/policies/incident-response-policy.md, SECURITY.md |
| CC7.5 | Recover from identified security incidents | b | tracked | maintainer | dr-test-record | C20, compliance/policies/business-continuity-dr-policy.md |
| CC8.1 | Authorize/design/test/approve/implement changes | a | enforced | substrate | pr-history | C2, C4, C5, C6, C7, compliance/policies/change-management-policy.md |
| CC9.1 | Mitigate business-disruption risk (BCP/DR, insurance) | b+,+c | tracked | leadership | dr-test-record _(ext: org/leadership (insurance) — cyber-insurance is an external policy)_ | C20, compliance/policies/business-continuity-dr-policy.md |
| CC9.2 | Assess & manage vendor/business-partner risk | b | tracked | leadership | vendor-assessments | compliance/subprocessors.md, compliance/policies/vendor-management-policy.md |
| A1.1 | Maintain/monitor/forecast processing capacity | a+,+b | tracked | maintainer | capacity-record | C17 |
| A1.2 | Environmental protections, backups, recovery infra | a+,+b | tracked | maintainer | git-replicated-evidence | C16, C20, compliance/policies/business-continuity-dr-policy.md |
| A1.3 | Test recovery/continuity procedures periodically | b | tracked | maintainer | dr-test-record | compliance/policies/business-continuity-dr-policy.md |
| C1.1 | Identify & retain confidential information | a+,+b | enforced | maintainer | classification+retention | C14, compliance/policies/data-classification-and-retention-policy.md |
| C1.2 | Securely dispose of confidential information | a | enforced | maintainer | retention-PRs | C14 |
| PI1.1 | Communicate processing/spec definitions | b | tracked | maintainer | spec-records | compliance/policies/secure-sdlc-policy.md |
| PI1.2 | Input completeness & accuracy controls | a | tracked | substrate | ci-tests | .github/workflows/ci.yml |
| PI1.3 | Processing controls (only reviewed/passing/intended lands) | a | enforced | substrate | merged-pr-history | C2, C4, C5, C7 |
| PI1.4 | Output completeness/accuracy/timeliness controls | a | tracked | substrate | build-reconciliation | .github/workflows/ci.yml |
| PI1.5 | Storage integrity controls | a+,+b | tracked | maintainer | retention+evidence | C14, C16 |
| P1.1 | Provide & update privacy notice | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P2.1 | Communicate choices & obtain consent | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P3.1 | Collect PI consistent with objectives | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P3.2 | Explicit consent before collection | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P4.1 | Limit use to identified purposes | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P4.2 | Retain PI per objectives | a+,+b | tracked | leadership | privacy-policy+DSR | C14, compliance/policies/privacy-policy.md |
| P4.3 | Securely dispose of PI | a+,+b | tracked | leadership | privacy-policy+DSR | C14, compliance/policies/privacy-policy.md |
| P5.1 | Data-subject access + copies | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P5.2 | Correct/amend PI + propagate | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P6.1 | Disclose only with consent | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P6.2 | Record authorized disclosures | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P6.3 | Record unauthorized disclosures/breach | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P6.4 | Vendor privacy commitments + periodic assess | b | tracked | leadership | privacy-policy+DSR | compliance/policies/vendor-management-policy.md, compliance/policies/privacy-policy.md |
| P6.5 | Vendor breach-notification commitments | b | tracked | leadership | privacy-policy+DSR | compliance/policies/vendor-management-policy.md, compliance/policies/privacy-policy.md |
| P6.6 | Breach notification to subjects/regulators | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P6.7 | Accounting of PI held/disclosed | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P7.1 | Maintain accurate/complete PI | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |
| P8.1 | Inquiries/complaints/disputes process | b | tracked | leadership | privacy-policy+DSR | compliance/policies/privacy-policy.md |

## Process / Type-II cadence (the periodic controls; `last`/`next` derive from the evidence ledger)

| Process | Cadence | Owner | Last evidence | Next due | State | Criteria |
|---|---|---|---|---|---|---|
| access-review | quarterly | maintainer | 2026-06-29 (since install) | 2026-09-29 | ok | CC6.2, CC6.3 |
| vendor-reassessment | annual | leadership | 2026-06-29 (since install) | 2027-06-30 | ok | CC9.2, P6.4, P6.5 |
| hr-onboard-offboard | per-event | hr | — | — | event-driven | CC6.2, CC1.4 |
| security-training | annual | hr | 2026-06-29 (since install) | 2027-06-30 | ok | CC1.4, CC2.2 |
| background-check | per-event | hr | — | — | event-driven | CC1.1, CC1.4 |
| ir-tabletop | annual | maintainer | 2026-06-29 (since install) | 2027-06-30 | ok | CC7.3, CC7.4 |
| dr-test | annual | maintainer | 2026-06-29 (since install) | 2027-06-30 | ok | A1.3, CC7.5, CC9.1 |
| change-mgmt-infra | per-change | maintainer | — | — | event-driven | CC8.1 |
| risk-assessment | annual | leadership | 2026-06-29 (since install) | 2027-06-30 | ok | CC3.1, CC3.2, CC3.3, CC3.4 |
| management-review | annual | leadership | 2026-06-29 (since install) | 2027-06-30 | ok | CC4.1, CC4.2, CC5.1 |
| policy-review-ack | annual | leadership | 2026-06-29 (since install) | 2027-06-30 | ok | CC1.1, CC2.2, CC5.3 |
| pen-test | annual | maintainer | 2026-06-29 (since install) | 2027-06-30 | ok | CC7.1 |
| evidence-collection | weekly | maintainer | 2026-06-29 (since install) | 2026-07-07 | ok | CC4.1, C1.1 |

## External residuals (status: external — visible, never faked as automated)

| Criterion | Owner | Why external |
|---|---|---|
| CC1.2 | board / leadership | no board in a small org; substituted by a recorded management review |
| CC4.2 | leadership/board (comms leg) | deficiency identification is human/agent judgment; board communication is external — watchdog only surfaces overdue cadence |
| CC6.4 | GitHub / Cloudflare | data-center physical security inherited; covered by their SOC2 |
| CC6.5 | subprocessor (media sanitization) | C14 covers transcript retention; full media/backup sanitization is procedure + subprocessor |
| CC6.8 | org IT / endpoint admin | supply-chain/pinning shrink malicious-dep surface; endpoint anti-malware/EDR is external |
| CC7.2 | org SecOps / SIEM | weekly snapshot + liveness != real-time anomaly detection; SIEM is external |
| CC9.1 | org/leadership (insurance) | cyber-insurance is an external policy |
