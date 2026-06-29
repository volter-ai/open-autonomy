# soc2-baseline — COMPLETE-SOC2 widening (DRAFT spec + gap analysis)

> STATUS: **DRAFT — pending maximality confirm.** Additive to the FROZEN 39-AC spec
> (`docs/SOC2-BASELINE-OBJECTIVE-SPEC.json`); the 39 ACs stay valid. This widens scope from
> *technical enforcement* to *complete SOC2* — the process/organizational controls + Type-II
> evidence-over-time the 39 under-scoped. Nothing here is implemented yet (ORDER: spec → HOLD → build).

## 0. The reframing (default-skeptical answer)

**Is soc2-baseline a COMPLETE autonomous SOC2 repo today? NO.** It is a *complete technical-enforcement*
layer with *drafted* policies. SOC 2 is ~**60% process/governance** evidence (CC1–CC5 + CC9 are
process-dominated; only CC6–CC8 are technical-dominated). The repo proves the technical ~9 of 33 Common
Criteria deterministically and **drafts** the rest as policies, but it does **not**:
- enumerate the **full** AICPA TSC criteria set as a tracked universe (it maps coarse control→family, not
  criterion-by-criterion);
- make the **process controls visible/tracked** (access review, vendor reassessment, IR tabletop, DR test,
  training, risk assessment, pen test, policy review+acknowledgement, management review) — they're prose
  "the org must do X" with no owner/status/cadence/next-due/evidence-per-interval;
- track **Type-II evidence over the observation window** (only a weekly config snapshot exists; no
  per-periodic-control "one artifact per interval, missing-interval = exception" ledger);
- track/communicate **control deficiencies** (CC4.2) at all.

So "complete SOC2" requires (1) the full-TSC register, (2) a visible cadence/evidence tracking system, and
(3) closing every *closeable* gap while making residual human/external items explicitly visible.

## 1. The full TSC universe (canonical AICPA 2017 TSC, rev. 2022) — 61 criteria

Counts cross-checked against the AICPA red-lined PDF + ≥2 vendor reproductions:
**CC = 33** (CC1:5, CC2:3, CC3:4, CC4:2, CC5:3, CC6:8, CC7:5, CC8:1, CC9:2) ·
**Availability A1 = 3** · **Confidentiality C1 = 2** · **Processing Integrity PI1 = 5** ·
**Privacy P1–P8 = 18** (P1.1; P2.1; P3.1–.2; P4.1–.3; P5.1–.2; P6.1–.7; P7.1; P8.1). **Total = 61.**

## 2. Coverage × classification matrix (every criterion)

Coverage: **E**=enforced/proven technical control · **P**=policy-drafted only (untracked) · **G**=gap (not
mapped/tracked). Class: **(a)** automatable+tracked in-repo · **(b)** human-process but trackable/VISIBLE
in-repo · **(c)** inherently external (track+document only).

### Common Criteria
| Crit | Intent | Now | Class | Today's artifact | Widening action |
|---|---|---|---|---|---|
| CC1.1 | Integrity & ethics | P | b | acceptable-use / info-sec policy | register row + annual policy-ack cadence |
| CC1.2 | Board/oversight independence | G | c | — | external (no board) → "management review" record substitute, documented |
| CC1.3 | Structures, authority, responsibility | P | b | info-sec policy (roles) | register row + org-chart/roles evidence |
| CC1.4 | Competence (hire/develop/retain) | P | b | hr-security policy | training + background-check cadence tracked |
| CC1.5 | Accountability | P | b | hr-security / info-sec | register row + acknowledgement evidence |
| CC2.1 | Quality info for internal control | P | b | info-sec policy | register row + evidence ledger ref |
| CC2.2 | Internal communication of responsibilities | P | b | policy distribution | annual acknowledgement cadence |
| CC2.3 | External communication | P | b | SECURITY.md, privacy notice | register row + external-comms evidence |
| CC3.1 | Objectives specified | P | b | risk-management policy | register row |
| CC3.2 | Identify & analyze risk | P | b | risk-register.md | annual risk-assessment cadence + watchdog |
| CC3.3 | Fraud risk considered | G | b | — | add fraud section to risk register + cadence |
| CC3.4 | Change-impact risk | P | b | risk-management policy | triggered-reassessment cadence |
| CC4.1 | Ongoing/separate monitoring evaluations | P | a/b | evidence-collect + heartbeat | management-review cadence + monitoring ledger |
| CC4.2 | Communicate deficiencies | G | a+b+c | — | watchdog (a) surfaces overdue *cadence*; deficiency *identification* is (b) human/agent judgment; senior-mgmt/board *communication* is (c). **Watchdog ≠ deficiency control — only the reminder leg is automated** (skeptic finding #1) |
| CC5.1 | Select control activities | P | b | the control set | register = the enumerated control activities |
| CC5.2 | Tech general controls | E | a | C1–C16 | register row (covered) |
| CC5.3 | Deploy via policies/procedures | P | b | 13 policies | policy-acknowledgement cadence |
| CC6.1 | Logical access security/architecture | E | a | C1, C15, access-control policy | register row (covered) |
| CC6.2 | Register/authorize/deprovision credentials | P | b | collaborators snapshot | onboarding/offboarding cadence + evidence |
| CC6.3 | RBAC / least-priv / SoD | E | a | C1, C2 (merge-boundary SoD) | register row (covered) |
| CC6.4 | Physical access | G | c | — | external (GitHub/Cloudflare DCs) → subprocessor-inherited, documented |
| CC6.5 | Secure disposal | P | a/b/c | C14 retention (transcripts only), data-class policy | C14 covers transcript retention/disposal; full media/backup/offboarding-data sanitization is (b) procedure + (c) subprocessor — **not plain E** (skeptic finding #7) |
| CC6.6 | External-boundary threat protection | E | a | C3 egress, C12 | register row (covered) |
| CC6.7 | Transmission protection | E | a | C15 encryption-in-transit | register row (covered) |
| CC6.8 | Anti-malware / unauthorized software | P | a+c | C7, C8, C11 (pinning/supply-chain) | supply-chain/pinning shrink malicious-dep surface (a); **endpoint anti-malware/EDR is external (c), NOT covered by pinning** (skeptic finding #3) |
| CC7.1 | Vuln detection (config + new vulns) | E | a | C8, C9, C11, security.yml | + external pen-test cadence (b) |
| CC7.2 | Anomaly/security-event monitoring | P | a+c | C16 audit log (weekly snapshot), C17 heartbeat (liveness) | snapshot+liveness ≠ anomaly detection; **real-time security-event/SIEM monitoring is external (c)** — **not E** (skeptic finding #2) |
| CC7.3 | Evaluate events → incidents | P | b | incident-response policy | IR cadence |
| CC7.4 | Incident response program | P | b | IR policy, SECURITY.md | **IR tabletop cadence + record (untracked today)** |
| CC7.5 | Recovery from incidents | P | b | C20 BC/DR | **DR restore-test cadence + record (untracked today)** |
| CC8.1 | Change management | E | a | C2/C4/C5/C6/C7 + policy | register row (strongly covered) |
| CC9.1 | Business-disruption mitigation | P | b | C20, BC/DR policy | DR-test cadence + insurance note |
| CC9.2 | Vendor/business-partner risk | P | b | subprocessors.md, vendor policy | **vendor-reassessment cadence + report-freshness (untracked)** |

### Availability · Confidentiality · Processing Integrity
| Crit | Intent | Now | Class | Widening action |
|---|---|---|---|---|
| A1.1 | Capacity monitoring/forecast | P | a/b | heartbeat is liveness not capacity → add capacity note + cadence |
| A1.2 | Backup/recovery infrastructure | P | a/b | git-replicated evidence branch + backup posture; register row |
| A1.3 | Recovery-plan testing | G | b | **DR restore-test cadence + dated record (untracked today)** |
| C1.1 | Identify & retain confidential | E | a/b | C14 + data-class policy; register row |
| C1.2 | Secure disposal | E | a | C14 retention; register row |
| PI1.1 | Process/spec definition | P | b | change pipeline spec; register row |
| PI1.2 | Input controls (complete/accurate) | P | a | CI/tests; register row |
| PI1.3 | Processing controls | E | a | C2/C4/C5/C7 (only reviewed/passing/intended lands); register row |
| PI1.4 | Output controls | P | a | CI/build reconciliation; register row |
| PI1.5 | Storage controls | P | a/b | retention + integrity; register row |

### Privacy (P1–P8) — scaffolded; enumerate all 18, classify, track via privacy-policy + DSR
| Crit | Intent | Now | Class |
|---|---|---|---|
| P1.1 Notice | Provide/update privacy notice | P | b |
| P2.1 Choice/Consent | Communicate choices + obtain consent | P | b |
| P3.1 Collection | Collect consistent w/ objectives | P | b |
| P3.2 Collection | Explicit consent before collection | P | b |
| P4.1 Use | Limit use to identified purposes | P | b |
| P4.2 Retention | Retain per objectives | P/E | a/b (C14) |
| P4.3 Disposal | Securely dispose PI | P | a/b/c (C14 transcripts only; full PI/media sanitization (b)+(c)) |
| P5.1 Access | Data-subject access + copies | P | b (DSR) |
| P5.2 Access | Correct/amend + propagate | P | b (DSR) |
| P6.1 Disclosure | Disclose only w/ consent | P | b |
| P6.2 Disclosure | Record authorized disclosures | G | b |
| P6.3 Disclosure | Record unauthorized disclosures/breach | G | b |
| P6.4 Disclosure | Vendor privacy commitments + periodic assess | P | b (vendor policy) |
| P6.5 Disclosure | Vendor breach-notification commitments | P | b |
| P6.6 Disclosure | Breach notification to subjects/regulators | P | b (IR policy) |
| P6.7 Disclosure | Accounting of PI held/disclosed | G | b |
| P7.1 Quality | Maintain accurate/complete PI | P | b |
| P8.1 Monitoring | Inquiries/complaints/disputes process | P | b |

> Privacy posture stays **PI-minimizing** (keep PI out of inputs); the 18 are enumerated + tracked so the
> register is complete, with the privacy-policy + DSR process as the (b) home. Adopters who process PI
> operate them; the repo makes the obligations visible, not hidden.

## 3. The 13 process/Type-II control families → cadence (auditor-sampled)

| Process control | Crit | Cadence | Now | Class |
|---|---|---|---|---|
| Access review (recertification) | CC6.1–.3 | quarterly | G (snapshot only, no sign-off/tracking) | a-remind + b-signoff |
| Vendor/subprocessor reassessment | CC9.2, P6.4/.5 | annual (pre-onboard first) | P (inventory, no cadence) | a-remind + b-assess |
| HR onboarding/offboarding | CC6.2, CC1.4 | per-event (deprov ≤24h) | P (policy) | b |
| Security-awareness training | CC1.4, CC2.2 | at hire + annual | P (policy) | b |
| Background checks | CC1.1, CC1.4 | at hire | P (policy) | b/c |
| IR policy + tabletop + post-incident | CC7.3–.5 | annual tabletop | P (policy, no drill record) | b |
| BCP/DR + restore/failover test | A1.2/.3, CC7.5, CC9.1 | annual | G (no test record) | b |
| Change mgmt beyond code (infra/emergency) | CC8.1 | per-change | P (policy; code path E) | a/b |
| Risk assessment | CC3.1–.4 | annual + triggered | P (register, undated) | b |
| Control monitoring + management review | CC4.1/.2 | continuous + annual review | G (no mgmt review) | a/b |
| Policy lifecycle: review + acknowledgement | CC1.1, CC2.2, CC5.3 | annual review + ack at hire | P (no ack/review record) | a-remind + b-ack |
| Vuln mgmt + pen test | CC7.1/.2, CC4.1 | scans monthly/continuous + pen test annual | E-scan / G-pentest | a + b |
| Evidence-collection cadence | CC4.1 (cross-cut) | continuous; artifact-per-interval | partial (weekly snapshot) | a |

## 4. Gap themes (what "complete" requires beyond the 39)

1. **No full-TSC register.** Coarse control→family map exists; no criterion-by-criterion universe with
   owner/status/evidence/cadence/next-due. → BUILD the register.
2. **Process controls invisible/untracked.** 13 families have no cadence/owner/next-due/evidence-per-interval
   in-repo. → BUILD a cadence watchdog + evidence ledger.
3. **No Type-II over-time tracking.** Weekly config snapshot ≠ per-periodic-control artifact-per-interval
   with missing-interval detection. → EXTEND the evidence ledger.
4. **No deficiency tracking/communication (CC4.2).** → the watchdog opens/assigns deficiency issues.
5. **No completeness drift-guard.** Nothing fails when a criterion is unmapped or an (a)-automation is
   missing. → BUILD `check:soc2-register`.

## 5. The VISIBLE in-repo tracking system (ask #4 — design)

| Artifact | What | Answers |
|---|---|---|
| `compliance/control-register.yml` | machine-readable: one entry per 61 criteria — `{id, family, statement, class:a\|b\|c, control_refs, owner_role, status:enforced\|tracked\|external, evidence:{type,pointer}, cadence:{interval,last,next}}` | "every criterion, owner, status, evidence" |
| `compliance/control-register.md` | rendered auditor-facing single pane (generated from the YAML; drift-guarded) | "is it all VISIBLE?" |
| `compliance-evidence` branch ledger | extend `evidence-collect.yml` to write a dated **per-interval index**; one artifact per required interval; missing interval surfaced. **The ledger artifact timestamp — NOT a self-reported register field — is the source of truth for `last`** (skeptic finding #4) | Type-II over-time |
| `.github/workflows/compliance-cadence.yml` | scheduled: computes next-due from the **ledger artifact** `last`; opens/updates a `soc2-control-due` tracking issue for any due/overdue (a)/(b) control, assigned to the owner role. **An issue can only be closed by committing the interval's evidence artifact to the ledger** (closure is bound to a real artifact, not honor-system) | "track process audits / never hidden" |
| `bin/check-soc2-register.ts` + `check:soc2-register` | **two gates**: (i) *structural* — every 61 criteria mapped, each (a) names automation, each (b) periodic has cadence+owner; (ii) **currency** — for each periodic control, the latest ledger artifact is no older than its cadence, else FAIL (skeptic finding #4: structure ≠ substance) | completeness + currency drift-guard |
| meta-monitor (extend `heartbeat.yml` / a `cadence-liveness` assertion) | asserts `compliance-cadence.yml` **and** `evidence-collect.yml` each had a successful run within their interval; if the watchdog itself stalls, THIS opens an issue (skeptic finding #5: watcher-of-the-watchdog) | the watchdog can't silently die |
| `bin/soc2-register-render.ts` | YAML→md generator (compile/dogfood pattern) | keeps md == yaml |

**Security/scripts boundary:** the cadence watchdog is deterministic *visibility* plumbing (compute next-due
from a real ledger artifact, surface an issue) — it makes **no judgment**. It is explicitly **not** the CC4.2
deficiency control: identifying a deficiency (the access review found stale access; a control substantively
failed) and communicating it to senior management/board stays human/agent (skeptic finding #1). The watchdog
only guarantees the *cadence is visible and un-hideable* and that *substance can't lapse while CI stays green*
(the currency gate). Consistent with "scripts only for security": visibility/boundary mechanism, not scripted
judgment.

## 6. Widened spec — additive W-series ACs (DRAFT)

| AC | Statement | Acceptance |
|---|---|---|
| **W1 tsc-universe** | The register enumerates ALL 61 AICPA TSC criteria (CC1.1–CC9.2, A1.1–A1.3, C1.1–C1.2, PI1.1–PI1.5, P1.1–P8.1). | `control-register.yml` has 61 rows; each has ≥1 `control_ref` or an explicit external owner; 0 unmapped. |
| **W2 visible-register** | A single auditor-facing register renders every criterion with owner/status/evidence/cadence/next-due. | `control-register.md` generated from YAML; drift-guarded (md==yaml). |
| **W3 class-a-automation** | Every (a)-class control is automated + tracked. | each (a) row names its workflow/check; cadence ones wired to the watchdog/evidence-collect. |
| **W4 class-b-visible** | Every (b)-class human-process control has an in-repo evidence home + cadence + auto-opened tracking issue when due/overdue (never hidden). | live-proof: the cadence workflow opens a real `soc2-control-due` issue for an overdue control. |
| **W5 class-c-honesty** | Every (c)-class control enumerated as external with named owner + why-not-in-repo. | register `status:external` rows + ceiling doc updated; 0 silent omissions. |
| **W6 type-II-ledger** | Per-periodic-control evidence captured per interval; the **ledger artifact timestamp is the source of `last`**; a MISSING interval is surfaced (cardinal Type-II rule). | live-proof: an interval with no artifact shows overdue; issue-closure is bound to committing the artifact (not self-report). |
| **W7 deficiency-comms** | Overdue *cadence* is surfaced + assigned to owners; deficiency *identification/communication* (CC4.2) is honestly marked (b)+(c), **not** claimed as automated. | watchdog opens+assigns `soc2-control-due` issues; CC4.2 register row shows the human/board legs. |
| **W8 completeness+currency-guard** | `check:soc2-register` has TWO gates: structural (no unmapped criterion / missing (a)-automation / missing (b)-cadence) **and currency** (no periodic control's latest ledger artifact older than its cadence). | both gates in `bun run check` + CI; live red→green on a stale interval. |
| **W11 watchdog-liveness** | The cadence + evidence-collect workflows are themselves monitored; if either stalls, an issue opens (watcher-of-the-watchdog). | meta-monitor asserts last-success freshness; live-proof: a disabled watchdog surfaces. |
| **W9 process-cadence** | Policy review+ack, training, risk assessment, pen test, vendor reassessment, access review, IR tabletop, DR test each have a register cadence + watchdog. | each present in register with cadence + owner. |
| **W10 skeptic-complete** | ≥2 fresh independent skeptics confirm the register covers the full TSC with correct a/b/c classification + no hidden residual. | committed skeptic verdicts. |

Founding constraints carried: deterministic where it's a boundary; **visible-not-hidden**; honest ceiling
(this still cannot pass the Type-II *time window* or make subprocessors compliant — those stay (c)); <$10.

## 7. Honest residual after the widening (the (c) set that stays external) — each a visible tracked row with a NAMED owner

| (c) external item | Crit | Named owner | Why not in-repo |
|---|---|---|---|
| CPA auditor engagement (O9) | — | org/leadership | only a CPA firm issues the report |
| Org-wide MFA / IdP enforcement (O10) | CC6.1 | org GitHub/IdP admin | org-level identity setting |
| Board oversight / independence | CC1.2 | board/leadership | governance body |
| Physical security of data centers | CC6.4 | GitHub / Cloudflare (subprocessor) | inherited; covered by their SOC2 |
| Subprocessor SOC2 posture | C18 | model-proxy / GitHub / Cloudflare / OpenRouter | their own audits |
| Signing legal DPAs | O11 | org/legal | legal agreements |
| Background-check execution | CC1.4 | org/HR + screening vendor | external screening |
| **Endpoint anti-malware / EDR** | CC6.8 | org IT / endpoint admin | workstation/server endpoints, not the repo (skeptic #3) |
| **Real-time security monitoring / SIEM** | CC7.2 | org SecOps / SIEM | runtime anomaly detection, external system (skeptic #2) |
| **Cyber-insurance** | CC9.1 | org/leadership | insurance policy (skeptic #6) |
| **The Type-II observation window itself** | cross-cut | time | ~3–12 months must elapse with evidence accruing |

Every row above ships in the register as `status:external` with this owner — **never silent** (W5).
