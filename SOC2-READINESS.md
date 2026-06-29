# SOC 2 Readiness & Gap Analysis — Open Autonomy

> **Status:** Assessment only. No functional code was changed to produce this document.
> **Date:** 2026-06-27 · **Repo state:** `main` @ v0.3.1
> **Scope of this doc:** the Open Autonomy product (this repo + the `agent-model-proxy` Cloudflare
> Worker it operates). It maps OA's *technical* controls to the SOC 2 Trust Services Criteria and
> calls out the *organizational* program that must wrap them.

---

## 0. Read this first — what SOC 2 actually is (and what it is not)

**SOC 2 certifies an *organization's* controls over a *time window*, not a repository or a piece of
software.** A CPA firm issues the report; there is no "SOC 2 compliant codebase." Two report types:

- **Type I** — an auditor attests that controls are *designed* appropriately **as of a single date**.
  Achievable in ~1–3 months once policies + tooling are in place.
- **Type II** — an auditor attests that those controls *operated effectively* over an **observation
  window of ~3–12 months** (6 months is typical for a first Type II). This is what customers actually
  ask for, and it cannot be shortcut: you must *run* the controls and generate evidence for months.

So this report is deliberately split into two things:

1. **Technical controls the OA product must implement** — these live in *this codebase / infra* and are
   what we can own and ship. (§3)
2. **The organizational program required** — policies, reviews, vendor management, an auditor, a
   compliance-automation platform. These are **company exercises**, not code, but they are **mandatory**
   and gate the report. (§4)

**Honest bottom line:** OA's *engineering* posture is unusually strong for its size — the merge
boundary, capability-scoped tokens, egress lockdown, pinned supply chain, and a deterministic human
gate are real, auditable controls (§3 shows many already PASS). But SOC 2 is ~70% organizational
program and ~30% technical controls, and **today OA has essentially none of the organizational layer**
(no formal policies, no risk assessment, no access-review cadence, no vendor inventory, no IR plan, no
HR controls). Type I is a few months of program-building away; Type II is that plus a 6-month
observation window. **Realistic first Type II: ~9–12 months** from a standing start.

---

## 1. System overview — what OA is, what it runs, what data it touches

Open Autonomy compiles an agent **profile** (`autonomy.ir.v1`) onto a **substrate** (GitHub Actions or a
local termfleet loop). It dogfoods itself: this repo's `main` is an installation of
`profiles/self-driving`. See `docs/ARCHITECTURE.md`, `CLAUDE.md`.

### 1.1 Components in audit scope

| Component | What it is | Where it runs | Citation |
|---|---|---|---|
| **Engine / core** | The IR, compiler, capability/merge-boundary logic | build-time + GitHub Actions | `packages/core/`, `packages/substrate-github/src/emit.ts` |
| **Agent runtime** | Scripts that execute an agent run, mint/exchange/revoke tokens, capture transcripts | GitHub Actions runners (ephemeral) | `scripts/claude-agent-run.ts`, `scripts/agent.ts`, `scripts/transcript.ts` |
| **agent-model-proxy** | Cloudflare Worker: gates *all* agent model spend, holds provider keys, serves the funding storefront | Cloudflare edge + Durable Objects | `services/agent-model-proxy/src/index.ts` |
| **GitHub control plane** | Branch protection, required checks, the human-approval gate | GitHub | `.github/workflows/*.yml`, `scripts/human-approval-gate.ts` |

### 1.2 Data inventory (the part auditors care most about)

| Data class | Sensitivity | Where it lives | Retention | Citation |
|---|---|---|---|---|
| **Customer/target source code** | High (confidential) | flows through model requests; **captured (truncated) into transcripts** committed to git | **Permanent** in git history | `scripts/transcript.ts:62-123` (1200/800-char caps); `.open-autonomy/history/<agent>/...` |
| **Model request/response bodies** (contain source code + prompts) | High | pass *through* the proxy | **Not persisted** by the proxy | proxy `src/anthropic.ts:13-88` — parsed in memory, never logged |
| **Live session window** (last ~20 turns, redacted) | High | RunBudget Durable Object; readable via `/v1/runs/{id}/session` | Run TTL (~2h) | `src/run-budget.ts`; redaction in `src/anthropic.ts:41` |
| **Run/spend ledger** (repo, issue, actor, USD, github_run_id) | Medium (operational + GitHub usernames) | LimitLedger Durable Object | **Unbounded — never pruned** | `src/limit-ledger.ts:24-65, 428-440` |
| **Funding/account data** (balances, sponsors, daily spend) | Medium (financial) | LimitLedger Durable Object | accounts unbounded; daily_spend last 14 days | `src/limit-ledger.ts` |
| **Secrets** (provider keys, HMAC, admin token) | Critical | Cloudflare Worker secrets + GitHub Actions secrets | n/a | §3.5 below |
| **GitHub issue/PR content + usernames** | Medium (may contain PII) | transcripts, ledger | permanent (transcripts) | `scripts/transcript.ts` |

**Key facts that shape the whole assessment:**
- The proxy is the **single chokepoint for model spend** and the **only holder of provider API keys**
  (`OPENROUTER_API_KEY`); agents never see provider keys (`src/anthropic.ts:31,46-50`).
- The proxy **does not persist request/response bodies** — a genuine confidentiality strength. The main
  data-at-rest exposure is **transcripts committed to git** (source code, truncated, secret-pattern
  redacted but not PII-redacted).
- Agents run on **ephemeral GitHub-hosted runners** under **capability-scoped `GITHUB_TOKEN`s** and a
  **blocked-egress** allowlist (`emit.ts:130-145`).

### 1.3 Auth model (summary; detail in §3.2)
- **Agent → proxy:** GitHub **OIDC** mints a **bounded, HMAC-SHA256-signed run token** (default 2h TTL,
  scoped to repo/issue/actor/spend caps). `scripts/model-proxy-mint.ts`, proxy `src/token.ts`,
  `src/github-oidc.ts`. Workflow allowlist enforced (`src/index.ts:379-393`, `wrangler.toml:35`).
- **Operator → proxy admin:** static `x-admin-token` header (`src/index.ts:495-498`).
- **Agent → GitHub:** per-job `GITHUB_TOKEN`, permissions derived from declared capabilities
  (`emit.ts:223-237`); the merge boundary is the `code:propose` ≠ `code:review` split.
- **Deploy → Cloudflare:** scoped `CLOUDFLARE_API_TOKEN`, gated behind admin-only `deploy-v*` tags + a
  `production` environment approval (`.github/workflows/deploy.yml`, `services/agent-model-proxy/DEPLOY.md`).

---

## 2. Trust Services Criteria — applicability to OA

| TSC | In scope? | Why |
|---|---|---|
| **Security / Common Criteria (CC1–CC9)** | **Mandatory** | Required in every SOC 2. Covers governance, risk, access, change mgmt, ops, monitoring. |
| **Confidentiality** | **Strongly recommended** | OA handles customer source code + repo access tokens. This is OA's core value-at-risk and a likely customer ask. |
| **Availability** | Recommended | The proxy is a hard dependency for every agent run (spend gating). If customers depend on the org's uptime, include it; otherwise defer. |
| **Processing Integrity** | Optional / partial | Relevant to the *spend ledger* (mint = consume + held invariant) and the merge boundary. Include only if customers care about ledger correctness. |
| **Privacy** | Likely out of scope (initially) | OA is not designed to process end-user PII; the only PII-ish data is GitHub usernames in transcripts/ledger. Recommend **excluding Privacy** from the first report and scoping PII out by policy. |

**Recommendation:** First report = **Security + Confidentiality** (Type II). Add Availability if you sell
the hosted proxy as a service. Leave Processing Integrity and Privacy out of v1.

---

## 3. Technical controls — what OA does vs. what's missing

Legend: **✅ PASS** (control exists, auditable) · **🟡 PARTIAL** (exists but gaps) · **❌ MISSING**.

### 3.1 Encryption — in transit & at rest

| Control | State | Detail & citation |
|---|---|---|
| TLS in transit (all hops) | ✅ | All proxy egress is `:443` HTTPS; harden-runner allowlist is HTTPS-only (`emit.ts:130-145`). GitHub/Cloudflare/OpenRouter all TLS. |
| Encryption at rest (proxy state) | 🟡 | Durable Objects / Cloudflare storage are encrypted at rest by Cloudflare, but this is **inherited from the subprocessor** and **not documented** as a control. Need a one-page data-handling note asserting it + linking Cloudflare's attestation. |
| Encryption at rest (transcripts) | 🟡 | Transcripts live in the **git repo** — encrypted only insofar as GitHub encrypts repos. Confidential source code in a (potentially public) repo is a **classification problem**, not an encryption one (see §3.9). |
| Secrets encrypted | ✅ | GitHub Actions secrets + Cloudflare Worker secrets are encrypted-at-rest by the platform. |

**Missing:** a written assertion of at-rest encryption referencing the subprocessors' SOC 2 reports
(Cloudflare, GitHub). Cheap to produce.

### 3.2 Access control / least privilege / authorization

| Control | State | Detail & citation |
|---|---|---|
| Capability → least-privilege token | ✅ | `GITHUB_TOKEN` permissions are derived from declared capabilities; baseline is read-only (`emit.ts:223-237`). |
| Merge boundary (no agent merges) | ✅ | `code:propose` (contents:write) and `code:review` (statuses:write) are **never on one actor**; no agent holds `code:merge`; native auto-merge lands PRs (`docs/SPEC.md#capabilities`, `emit.ts:217-232`). Branch protection requires `ci`+`agent-review`+`human-approval`. |
| OIDC-scoped, bounded run tokens | ✅ | HMAC-signed, repo/issue/actor/spend-scoped, ~2h TTL, workflow-allowlisted (`src/token.ts`, `src/github-oidc.ts:38-73`, `src/index.ts:351-393`). |
| Human approval gate | ✅ | Deterministic, per-head-SHA, verifies maintainer **repo permission** (not author_association), engages maintainers on sensitive paths (`scripts/human-approval-gate.ts:82-94,137-157`). |
| Admin auth to proxy | 🟡 | Single static `x-admin-token`, compared with `===` (**not constant-time** — `src/index.ts:497`). No per-admin identity, no MFA, no rotation cadence beyond `rotate-admin-token.ts`. |
| Per-IP / per-token rate limiting | ❌ | Only global/per-repo/per-actor *spend* caps; no request-rate limiting. A workflow at the per-actor run cap can spam the proxy. |
| Logical access reviews | ❌ | No periodic review of who has GitHub admin, Cloudflare access, or `CLOUDFLARE_API_TOKEN`. This is an **organizational control** (§4) but auditors will ask for evidence. |

**Missing/weak:** constant-time admin-token compare; admin identities (today it's a shared secret —
auditors dislike shared admin credentials); MFA enforcement on GitHub org + Cloudflare (org setting,
verify); documented quarterly access reviews.

### 3.3 Audit logging & tamper-evidence

| Control | State | Detail & citation |
|---|---|---|
| Spend/usage events | 🟡 | `UsageEvent`s recorded per run (last 200), money `flows` (last 200) — but they record **WHAT, not WHO** (no admin identity / OIDC subject on grants) (`src/limit-ledger.ts:273-276`). |
| Admin-action audit trail | ❌ | Admin mint/grant/account-moderation/coupon ops are **not logged** with actor identity (`src/index.ts` logging is sparse — errors + monthly accrue only). |
| Agent-action audit trail | 🟡 | Transcripts capture each run's tool calls/results (`scripts/transcript.ts`) and are git-committed (immutable history) — a decent agent audit trail, but truncated and not centralized/queryable. |
| Tamper-evidence / immutability | 🟡 | Git history is tamper-evident for transcripts; Durable Object state is **not** append-only and has no integrity log. No centralized, immutable audit log (e.g., shipped to a WORM/SIEM). |
| Log centralization & retention policy | ❌ | No SIEM/log aggregation; Cloudflare Worker `console.*` logs are ephemeral unless Logpush is configured. No defined retention. |

**Missing:** a who-did-what admin audit log with retention; Cloudflare **Logpush** to durable storage;
a defined log-retention policy (typically ≥ 1 year for SOC 2).

### 3.4 (covered under 3.2 — access) — n/a

### 3.5 Secrets management

| Secret | Store | Rotation | Citation |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Cloudflare Worker secret | manual | `src/types.ts`, `src/anthropic.ts:31` |
| `AGENT_PROXY_HMAC_SECRET` | Cloudflare Worker secret | **redeploy only — invalidates all live tokens** | `src/token.ts:33-36` |
| `AGENT_PROXY_ADMIN_TOKEN` | Cloudflare Worker secret + local `.env` | `scripts/rotate-admin-token.ts` (32-byte random) | `src/index.ts:495-498` |
| `GITHUB_SPONSORS_WEBHOOK_SECRET` | Cloudflare Worker secret | manual | `src/sponsors-webhook.ts:44` |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions env secret (`production`) | GitHub UI | `.github/workflows/deploy.yml:49` |

**State:** 🟡 Good fundamentals (platform-encrypted secret stores, scoped deploy token, no provider keys
on agents, secret-pattern redaction in transcripts at `scripts/transcript.ts:41-49`). **Gaps:** no
documented rotation **cadence/policy**; HMAC secret has no graceful (dual-key) rotation; admin token is a
shared secret in a local `.env` (risk of accidental commit — verify `.gitignore`); no secret-store
inventory doc.

### 3.6 Vulnerability + dependency / supply-chain management

| Control | State | Detail & citation |
|---|---|---|
| Lockfile + integrity hashes | ✅ | `bun.lock` with sha256+; `check:supply-chain` rejects non-registry / git / http deps and runs `bun audit` (`scripts/check-supply-chain.ts:18-77`), wired into `.github/workflows/security.yml`. |
| Actions pinned to SHAs | ✅ | All GitHub Actions pinned by commit SHA (`ci.yml`, `deploy.yml`); Dependabot weekly for Actions (`.github/dependabot.yml`). |
| SAST (CodeQL) | 🟡 | `.github/workflows/codeql.yml` runs on push/PR/weekly but is **not a required status check** (agent PRs bypass `pull_request`). |
| Workflow SAST (zizmor) | 🟡 | `security.yml` runs zizmor with a baseline (`.github/zizmor.yml`) — post-merge on push, not a required gate. |
| Secret scanning + push protection | 🟡 | Asserted enabled (`DEPLOY.md:42`) but **org-level setting, not verified in-repo**. |
| Dependabot for npm/bun deps | ❌ | `dependabot.yml` covers **GitHub Actions only** — no JS dependency alerts. |
| SBOM generation | ❌ | No SPDX/CycloneDX produced at build/deploy. |
| Defined remediation SLAs | ❌ | No policy mapping CVE severity → fix deadline (organizational). |

**Missing:** npm/bun Dependabot; elevate CodeQL/zizmor to required (for human PRs); SBOM; a documented
vuln-remediation SLA policy.

### 3.7 Secure SDLC / change management

| Control | State | Detail & citation |
|---|---|---|
| PR review required | ✅ | Branch protection requires `ci` + `agent-review` + `human-approval`; "require PR before merge" on. CODEOWNERS gates sensitive paths to `@yueranyuan` (`.github/CODEOWNERS`). |
| No direct push / no self-merge | ✅ | Permission split + native auto-merge; `enforce_admins:false` lets only **human admins** direct-push (agents forced through gated PRs) (`CLAUDE.md` invariants). |
| CI gates | ✅ | `bun run check`: tsc, core tests, conformance, runtime-sync, compile, profiles, dogfood, provision, supply-chain, public-agent, agent-proxy, proof (`package.json`, `CLAUDE.md`). |
| Deploy change control | ✅ | Admin-only `deploy-v*` tags + `production` environment approval + egress-locked deploy (`deploy.yml`, `DEPLOY.md:11-16`). |
| Signed commits | ❌ | DCO sign-off only (`-s`), **no GPG/sigstore signature enforcement** (`PULL_REQUEST_TEMPLATE.md:14`). |
| `enforce_admins` consistency | 🟡 | Production expects `enforce_admins:false` (so human admins can operate), but docs/scripts disagree in places (`docs/OPERATIONS.md:205` says `true` vs `scripts/provision-target-repo.ts:275` sets `false`). Reconcile + document the *intended* value and rationale for auditors. |

**SDLC is OA's strongest area.** Main gap: signed commits, and reconciling the documented branch-protection
config so the auditor sees one source of truth.

### 3.8 Availability — backup / DR, monitoring & alerting

| Control | State | Detail & citation |
|---|---|---|
| Health endpoint | 🟡 | `GET /healthz` + silence/dead thresholds (`src/health.ts`, `wrangler.toml:36-40`). |
| Uptime/SLO monitoring + alerting | ❌ | No external uptime monitor or paging. Operator-down detection is a **known, documented gap** (issues #66/#67, `CLAUDE.md`). |
| Backup / DR for ledger | ❌ | **No backup/export** of the LimitLedger/RunBudget Durable Objects (financial ledger!). Relies on Cloudflare replication; no snapshot to R2, no documented RTO/RPO. |
| Rollback | ✅ | Tag-based deploy + `wrangler` rollback (`DEPLOY.md:98`). |
| Capacity / spend ceiling | ✅ | Prepaid OpenRouter balance is a hard external ceiling; `ENFORCE_ACCOUNT_BALANCE=true` (`wrangler.toml`). |

**Missing (if Availability is in scope):** external uptime monitoring + alerting/on-call; a Durable
Object **backup** procedure (the funding ledger has no DR today — highest-priority Availability gap); a
written BC/DR plan with RTO/RPO + an annual restore test.

### 3.9 Data classification, retention & deletion

| Control | State | Detail & citation |
|---|---|---|
| Secret redaction in transcripts | ✅ | Pattern-based redaction of token shapes (`scripts/transcript.ts:41-49`). |
| Source-code classification | ❌ | Customer source code is captured into **permanently git-committed** transcripts with **no classification or PII redaction** (`scripts/transcript.ts:62-123`). |
| Ledger retention/deletion | ❌ | Run + account records grow **unbounded**, never pruned (`src/limit-ledger.ts`). No deletion-on-request path. |
| Retention policy | ❌ | No documented retention schedule for transcripts, session windows, or ledger. |
| Data deletion / customer request | ❌ | No mechanism or policy to delete a customer/repo's data. |

**Missing:** a data-classification + retention policy; a transcript-scrubbing/expiry path (or a decision
to keep transcripts out of public repos); a ledger-pruning/deletion routine.

### 3.10 Incident response (technical hooks)
- **State:** 🟡 A `SECURITY.md` with private vuln reporting + a defined trust model exists (good — many
  startups lack this). **Missing:** a real IR *plan* (roles, severity tiers, comms, timelines), and a
  monitoring→alert→page chain to *detect* incidents (today there's no alerting; see §3.8).

---

## 4. Organizational / process controls (company-level — mandatory, not code)

These are **required for the report** and are **not** satisfiable in the codebase. They are where OA is
furthest from ready. None of these exist today.

| # | Control area | What's required | Effort |
|---|---|---|---|
| O1 | **Security policies** | Written, version-controlled, leadership-approved policy set: InfoSec, Access Control, Change Mgmt, Vendor Mgmt, Data Classification & Retention, Encryption, Incident Response, BC/DR, Acceptable Use, SDLC, Risk Mgmt. (A compliance platform ships templates.) | M |
| O2 | **Risk assessment** | A documented, periodic (≥ annual) risk assessment with a risk register, scored + with treatment plans. | S–M |
| O3 | **Access reviews** | Quarterly review of access to GitHub org/admin, Cloudflare, the proxy admin token, secret stores; documented + remediated. | S (recurring) |
| O4 | **Vendor / subprocessor management** | Inventory + risk-rank subprocessors and **collect their SOC 2 reports**: GitHub, Cloudflare, OpenRouter, the model providers, the compliance platform. OpenRouter especially (your data + spend flows through it). | S–M |
| O5 | **Incident response program** | IR plan + at least one tabletop exercise during the observation window; defined severities, roles, comms, post-mortems. | M |
| O6 | **HR / personnel controls** | Background checks (where lawful), onboarding/offboarding checklists, security-awareness training, signed acceptable-use, role definitions. Even for a tiny team auditors require this. | S–M |
| O7 | **Change management (formalized)** | The *technical* gate exists (§3.7); needs a **written policy** tying PR review + CI + deploy approval to the control narrative, with evidence retention. | S |
| O8 | **Compliance automation platform** | Vanta / Drata / Secureframe / Sprinto: connects GitHub + Cloudflare + identity, runs continuous control monitoring, stores evidence, gives the auditor a portal. ~$7k–$25k/yr. **Strongly recommended** — it converts the technical controls into continuous evidence. | S to adopt |
| O9 | **CPA auditor** | A licensed CPA firm (often bundled/discounted via the platform). Type I ~$5k–$15k; Type II ~$12k–$40k+ depending on scope/firm. | external |
| O10 | **Org-level platform settings** | Enforce **MFA** across GitHub org + Cloudflare; verify GitHub secret-scanning + push-protection org-wide; least-privilege org roles. (Settings, not code — but evidence is collected.) | S |
| O11 | **Personnel / vendor inventory + DPA** | Data Processing Agreements with subprocessors; customer-facing data-handling commitments. | S–M |

---

## 5. Roadmap — prioritized, with effort and the Type I → Type II path

Effort key: **S** ≈ ≤ 1 day · **M** ≈ 2–5 days · **L** ≈ > 1 week. "Code" = ownable in this repo/infra.

### Phase 0 — Decide scope & stand up the program (weeks 0–4)
| Item | Type | Effort |
|---|---|---|
| Choose TSC scope: **Security + Confidentiality** (defer Privacy/Processing Integrity; add Availability iff selling the hosted proxy) | org | S |
| Adopt a compliance platform (Vanta/Drata) + engage a CPA auditor (O8/O9) | org | S |
| Draft the policy set from platform templates, tailored to OA's actual controls (O1) | org | M |
| Run the first risk assessment + risk register (O2) | org | M |
| Enforce MFA on GitHub org + Cloudflare; verify secret-scanning/push-protection (O10) | org | S |
| Subprocessor inventory + collect SOC 2 reports (GitHub, Cloudflare, OpenRouter, providers) (O4) | org | S |

### Phase 1 — Close the high-value technical gaps (weeks 2–8, mostly code we own)
| Item | Type | Effort | Refs |
|---|---|---|---|
| **Admin-action audit log** with actor identity (mint/grant/moderation/coupon) + ship Cloudflare **Logpush** to durable storage (R2/SIEM) with ≥ 1yr retention | code | M | §3.3; `src/index.ts`, `src/limit-ledger.ts` |
| **Durable Object backup/DR** for the funding ledger (scheduled export to R2 + documented restore + RTO/RPO) | code | M | §3.8; `src/limit-ledger.ts`, `src/run-budget.ts` |
| **Data classification + retention policy** and stop committing confidential source into git transcripts (scrub/expire, or keep transcripts in private storage only); add ledger pruning/deletion | code+org | M–L | §3.9; `scripts/transcript.ts`, `src/limit-ledger.ts` |
| Constant-time admin-token compare; add proxy **rate limiting**; document secret-rotation cadence + dual-key HMAC rotation | code | M | §3.2/§3.5; `src/index.ts:497`, `src/token.ts` |
| npm/bun **Dependabot**; elevate **CodeQL + zizmor** to required checks (human PRs); generate an **SBOM** at deploy | code | S–M | §3.6; `.github/dependabot.yml`, `codeql.yml`, `security.yml` |
| Enforce **signed commits** in branch protection | code/org | S | §3.7 |
| Reconcile `enforce_admins` across docs/scripts; write the branch-protection control narrative | code+doc | S | §3.7; `scripts/provision-target-repo.ts:275` vs `docs/OPERATIONS.md:205` |
| At-rest-encryption assertion doc referencing subprocessor reports | doc | S | §3.1 |
| External **uptime monitoring + alerting/on-call** (and/or land issues #66/#67) | code+org | M | §3.8 |

### Phase 2 — Operationalize (weeks 4–10)
| Item | Type | Effort |
|---|---|---|
| IR plan + one tabletop (O5) | org | M |
| HR onboarding/offboarding + security-awareness training (O6) | org | S–M |
| Formalize change-management + evidence retention narrative (O7) | org | S |
| First quarterly access review (O3) | org | S |
| Connect GitHub + Cloudflare + identity to the compliance platform; resolve failing checks | org | M |

### Phase 3 — Type I audit (≈ month 3)
Auditor attests control **design** as of a date. Achievable once Phases 0–2 land. Gives customers an
interim artifact while the Type II window runs.

### Phase 4 — Type II observation window (months 3–9+)
**Run the controls** and let the platform accrue evidence over **6 months** (minimum useful window).
During this window: access reviews execute on cadence, the IR tabletop happens, vuln SLAs are met,
deploys follow change-management, backups are tested. Then the auditor examines evidence and issues the
**Type II report**.

### Realistic timeline
- **Type I:** ~**2–3 months** from start (program + tech gaps + auditor).
- **Type II:** Type I **+ a 6-month window** → first Type II in ~**9–12 months**. The window length is a
  hard floor; engineering speed doesn't compress it.

---

## 6. Summary scorecard

| Domain | OA today | Biggest gap |
|---|---|---|
| Secure SDLC / change mgmt | **Strong ✅** | Signed commits; reconcile `enforce_admins`; written policy |
| Access control / merge boundary | **Strong ✅** | Shared admin token; MFA enforcement; access reviews |
| Supply chain | **Strong ✅** | npm Dependabot; SBOM; make SAST required |
| Secrets management | **Good 🟡** | Rotation policy; HMAC dual-key; admin identities |
| Encryption | **Good 🟡** | Written at-rest assertion (mostly inherited) |
| Audit logging | **Partial 🟡** | Admin who-did-what log; centralization + retention |
| Data classification / retention | **Weak ❌** | Source code in permanent git transcripts; unbounded ledger; no retention/deletion |
| Availability (backup/DR, monitoring) | **Weak ❌** | **No ledger backup**; no uptime alerting |
| Incident response | **Partial 🟡** | Real IR plan + detection chain |
| **Organizational program (O1–O11)** | **Absent ❌** | Policies, risk assessment, reviews, vendor mgmt, HR, platform, auditor |

**One-line verdict:** OA's engineering controls are well ahead of a typical pre-SOC-2 startup — the merge
boundary, capability-scoped OIDC tokens, egress lockdown, and pinned supply chain are real, auditable
strengths. The work is (a) a handful of ownable code/infra gaps — **audit logging, ledger backup/DR, and
data retention/classification** are the top three — and (b) the **entire organizational program**, which
is the long pole. Plan for **Type I in ~3 months** and a **first Type II in ~9–12 months**.

---

*Prepared as a readiness/gap analysis. Items marked "code" are ownable in this repo/infra; items marked
"org" are company exercises that gate the report regardless of engineering. File citations are accurate as
of the repo state noted at the top; re-verify line numbers before using as audit evidence.*
