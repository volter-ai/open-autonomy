# soc2-baseline — W12: the executive-assistant layer (FROZEN spec, rev 3)

> STATUS: **FROZEN — maximality-confirmed.** Additive to the original 50-AC spec; W12.1–W12.11 are appended
> to `docs/SOC2-BASELINE-OBJECTIVE-SPEC.json` (61 ACs total; the 50 stay valid). Adds an AI
> **executive-assistant** layer over the human seam — the human is the executive who reads/understands/signs;
> the AI does all the toil. Rev 1 was REFUTED by the skeptic panel; rev 2 fixed the SoD-mislabel + verifier
> demotion + scope + playbooks + collision; rev 3 fixed the metadata-framing + assertion-authorship +
> label-guard. Now building + live-proving (as W1–W11).

## 0. The model: the AI is the executive's EA / secretary

The human is the **executive**; the AI is the **executive assistant**. The EA prepares the *entire* package —
gathers the inputs, drafts the evidence, writes a one-screen brief, runs a second-set-of-eyes check, flags
what's missing or uncertain — and lays it on the desk. **The executive still reads, understands, and signs.**

What moves to the EA: 100% of the *toil*. What stays with the executive: 100% of the *judgment* — the
understanding and the signature. This is a genuine review made effortless, which is exactly what a SOC 2
auditor wants: an **informed** sign-off, fast. The decision is never eliminated; it is de-toiled.

> This resolves the rev-1 "rubber stamp" tension correctly: we do not claim the human can skip understanding.
> The doctrine is an executive who genuinely reads and signs — the EA just makes that take seconds instead of
> hours. We accelerate the real review; we do not replace it.

## 1. Stance: no added friction; the metadata is the audit trail of the decision + the context surfaced

The human approves in **one click** — the system adds no artificial friction (the locked "visible, not
enforced" stance). The recorded metadata (approver, time-to-decide, verifier-finding-count,
AI-drafted-vs-human-attested) is the **audit trail of the decision and the context the EA put in front of the
executive** — for the org's own governance and the auditor. It does **not** *prove* the decision was informed,
and it is not declawed: **time-to-decide is an admissible detective signal** an auditor MAY use (a population
of 2-second sign-offs over finding-laden controls is a real review-effectiveness finding). The doctrine,
stated in the maintainer skill, is that the executive genuinely reviews; the EA makes that review fast and
well-informed, and the trail records what was surfaced — it neither blocks a fast click nor pretends a fast
click was studied.

## 2. Actors (additive to `profiles/soc2-baseline/ir.yml`)

| Actor | kind | capabilities | role |
|---|---|---|---|
| `compliance-drafter` | agent | `code:propose`, read evidence/repo | on a `soc2-control-due` issue, runs the control's **playbook**, opens the gated PR: pre-filled ledger artifact + evidence doc + one-screen **decision brief**. |
| `compliance-verifier` | agent | `code:review` (statuses:write), read | the EA's **second set of eyes** — checks the drafter's PR for missing/wrong, posts findings as a NON-required `compliance-check` status. Explicitly an *assistant pre-check, not an independent SoD control* (§4). |
| `maintainer` (existing) | human | the `human-approval` gate | the **executive** — reads, understands, approves (signs) or requests changes. |

## 3. Choreography (composes existing primitives — no new gate)

```
cadence watchdog opens  soc2-control-due  issue   (W4/W7, exists; INTERVAL-GATED controls only — §6)
        │   trigger: compliance-drafter is an  event: issues (action: labeled)  actor, GUARDED by
        ▼   github.event.label.name == 'soc2-control-due'  (a label-name `if:` the emitter must add — emit.ts
        │   currently gates only on action==labeled, so without the name guard the drafter would launch on
        │   EVERY label; the guard, or an explicit self-no-op in the drafter body, is REQUIRED — not assumed)
compliance-drafter ── playbook ──▶ gated PR on branch  agent/issue-<N>  : ledger artifact + evidence + BRIEF
        │   (reuses the standard code:propose effect that dispatches ci + agent-review + human-approval)
        ▼
compliance-verifier ── second-eyes ──▶ findings as `compliance-check` status (non-required) + PR comment
        │
        ▼   the executive's desk = the PR: draft + brief + dissent + the assertion to sign
   maintainer ──▶ (a) COMMIT/EDIT the assertion text on the PR  then  (b) Approve (human-approval gate)
        │         OR  Request-changes (→ drafter).  The assertion is HUMAN-AUTHORED, not a one-click of AI words.
        ▼   on Approve: human-approval passes → PR merges → ledger artifact lands
   currency gate (W6/W8) green  +  a check verifies  assertion.author == approver  +  reconcile closes issue <N>
```

The executive's interface is exactly a **PR review** — the artifact IS the evidence, the brief IS the
summary, the verifier's findings ARE the dissent. `compliance/**` is a `human_required_path`, so the
drafter's PR **already forces a per-head-SHA maintainer approve** — that approve *is* the executive signature
(no new mechanism). To keep "human-attested" from laundering AI words, the executive **commits or materially
edits the `assertion` field** before approving, and the register check verifies `assertion.author == approver`
(an authorship affordance, not just a click). Auto-close depends on the `agent/issue-<N>` branch convention
(`reconcile-merged-issues.ts`).

## 4. Integrity invariants (corrected — the AI split is TOOLING, the SoD is human-side)

- **I1 — The AI drafter/verifier split is NOT segregation of duties; do not claim CC6.3/CC8 for it.** Neither
  agent is an accountable party. SoD remains **human-side and unchanged**: the maintainer's approval is the
  human control, and for **world-act** controls (DR test, pen test, background check) the honest requirement
  is **performer ≠ attester** (a second human) OR an **artifact-of-performance attached** — the EA cannot
  witness a real-world act it didn't perform. **The artifact-of-performance is a committed file** (DR-restore
  log, pen-test PDF, screenshot of the revoked account, training roster) — ideally committed to the immutable,
  versioned `compliance-evidence` branch, or attached to the PR — which is exactly what an auditor samples. It
  raises the floor from "a signature on a doc" to "a signature **plus the act's artifact**"; it is strong
  evidence, not bulletproof (an attachment is forgeable, so human accountability still backs it — as with all
  SOC 2 evidence). The spec states this rather than papering it with an AI-split that doesn't satisfy CC6.3.
- **I2 — The verifier is an assistant pre-check, optionally cross-model.** Two instances of one model share
  blind spots, so the verifier is NOT an independent control — it is the EA's second set of eyes that *raises
  the floor*. To make it meaningfully independent it SHOULD run a **different model/provider** than the
  drafter; if it can't, the correlation is disclosed and it stays a convenience check, not an assurance.
- **I3 — Provenance never blurred; the human authors the assertion, and it's verified.** The trail labels
  AI-drafted vs human-attested. The signed assertion is **committed or materially edited by the human** (not a
  one-click of AI-written words), and the register check enforces **`assertion.author == approver`** — so AI
  words can't launder into "human-attested." For world-acts the assertion must reference the independent
  artifact-of-performance.
- **I4 — The decision metadata is the audit trail, with teeth.** time-to-decide + finding-count + provenance
  record the decision and what the EA surfaced; they are **not used to block** (no friction), but
  **time-to-decide is an admissible detective signal** — an auditor MAY treat a population of instant
  sign-offs over finding-laden controls as a review-effectiveness finding. The trail neither pretends a fast
  click was studied nor prevents it.
- **I5 — No fabrication; honest degrade on no-input.** The drafter cites real evidence pointers (verifier
  checks they resolve — extends the W10 file-existence gate). For a control with **no machine-readable input**
  (e.g. vendor reassessment needs the subprocessor's external SOC 2 PDF the fleet cannot see), the EA produces
  a **template marked `un-evidenced: needs <X> from the executive`** — never a fabricated assessment.

## 5. Decision-ready brief (the executive UX)

One screen on the PR: control + criteria · what the EA did · evidence links · **verifier findings** · the
**specific assertion** to sign · **"open items needing your judgment / inputs only you can provide."** The
executive acts in two ways: **Approve** (sign) or **Request-changes** (back to the EA).

## 6. Scope: interval-gated controls only; per-event handled differently; honest reach

The drafter is triggered by `soc2-control-due`, which the watchdog opens **only for interval-gated**
processes. So W12 covers: access-review, vendor-reassessment, security-training, ir-tabletop, dr-test,
risk-assessment, management-review, policy-review-ack, pen-test. **Per-event controls** (hr-onboard-offboard,
background-check, change-mgmt-infra) are **out of W12's trigger** (no due-issue is opened for them) and stay
event-driven — stated, not conflated.

| Control | EA reaches (toil removed) | Executive still |
|---|---|---|
| access review | filled review: collaborators ⨉ role matrix, anomalies flagged | decides revokes + signs |
| policy review/ack | redline vs last version; ack roster reconciled to headcount | approves; staff ack |
| risk assessment | proposed risks from incidents/diffs | scores + owns |
| management review | drafted review pack from evidence ledger + dashboards | holds + signs |
| vendor reassessment | **template** + report-freshness flags (external PDF = `un-evidenced`) | obtains report; accepts risk |
| dr-test · pen-test · ir-tabletop | the **record template** + completeness check | **performs the act**, attaches artifact-of-performance, signs |

## 7. The hard 80% — the playbooks

The **per-control playbook** (what the drafter actually gathers/computes/drafts) is the substance of W12 — the
choreography is the easy 20%. A complete W12 ships **one playbook per interval-gated control** with an
explicit degraded path ("no input → template, flagged un-evidenced"). The first build can land a subset
(e.g. access-review + policy-review-ack, the most data-available) and grow; the spec must not pretend the
playbooks are free.

## 8. Honest limits

- The executive's **understanding and signature are irreducible** — by design (the point).
- The verifier is **correlated unless cross-model** — an assistant check, not an independent assurance.
- The EA **can't see outside the repo** — no-input controls degrade to flagged templates; the executive
  supplies the missing artifact.
- The human review **genuineness is required and is the control** — W12 makes it fast and informed; it does
  not (and must not claim to) make it unnecessary.

## 9. Acceptance criteria (W12.x — DRAFT, rev 2)

| AC | Statement | Acceptance |
|---|---|---|
| W12.1 | drafter + verifier as distinct IR actors; capability split (`code:propose` / `code:review`); neither merges/closes; the split is documented as TOOLING not SoD | ir.yml + manifest; doc states it's not CC6.3. |
| W12.2 | the drafter fires on `event: issues` (action labeled) **guarded by `label.name == 'soc2-control-due'`** (label-name `if:` added to the emitter, or explicit drafter self-no-op) — not a bare dispatch, and not on every label | manifest shows the event trigger + the name guard; live: a `soc2-control-due` label launches the drafter, an unrelated label does not. |
| W12.3 | drafter opens a gated PR (branch `agent/issue-<N>`) with ledger artifact + evidence doc + decision brief | live PR carrying all three. |
| W12.4 | verifier posts a NON-required `compliance-check` status + findings; reconciled with the generic `reviewer` (no status collision) | live status; the generic `agent-review` still gates, `compliance-check` is advisory. |
| W12.5 | ledger schema **version-extended** for provenance + decision metadata (approver, time-to-decide, finding-count, drafted-vs-attested) + `soc2-register.ts` validates it | schema v2 + checker update; structural gate green. |
| W12.6 | only the human approval closes the control; no AI self-close | live: drafter+verifier run, control stays OPEN until maintainer approves; then currency green + issue closed (via `agent/issue-<N>` + reconcile). |
| W12.7 | the signed assertion is human-committed/edited and the check enforces `assertion.author == approver`; world-acts require an attached artifact-of-performance | live: an unedited AI-authored assertion fails the check; a human-edited one passes (+ artifact-of-performance for world-acts). |
| W12.8 | I5 honest-degrade: a no-input control yields a `un-evidenced` template, never a fabricated assessment | live: vendor-reassessment draft is a flagged template, not an invented assessment. |
| W12.9 | ≥1 real playbook shipped + live-proven end-to-end (e.g. access-review) | the EA produces a real filled access-review from collaborators ⨉ role-matrix; executive approves; loop closes. |
| W12.10 | honest-limits doc updated (irreducible human review; verifier correlated unless cross-model; no-input degrade; the AI split is not SoD) | committed. |
| W12.11 | ≥2 fresh skeptics confirm: no false SoD/CC6.3 claim, no AI self-close, provenance not blurred, no fabricated assessment, trigger genuinely wired | committed verdicts. |

## 10. Fit with OA doctrine

**"Scripts only for security; agents for judgment."** The watchdog + human-approval gate + currency gate stay
deterministic (the boundary). The EA's drafting + checking is judgment → agents. It is the OA thesis applied
to the org itself — the human seam reduced to an **informed signature**, with the EA doing everything around
it. W12 adds *no* new security primitive; it composes W1–W11 (the `event:` trigger, the `code:propose`
effect, the human-approval gate, the currency gate, `reconcile-merged-issues.ts`).
