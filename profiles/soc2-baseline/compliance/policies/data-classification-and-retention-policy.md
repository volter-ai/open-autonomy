# Data Classification & Retention Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (CC6, Confidentiality, Privacy).

## Purpose
Classify the data this installation handles and set retention/deletion rules for it.

## Classification
| Class | Examples here | Handling |
|---|---|---|
| **Confidential** | Source code; model requests/responses; agent transcripts (contain truncated source) | Private repos only; redaction of secret shapes; retention-limited |
| **Internal** | Issues/PRs, run/spend metadata, GitHub usernames | Access-controlled; minimize PII in bodies |
| **Public** | This profile's code + docs | No restriction |
| **Secret** | Tokens, provider keys | Secret stores only; never in git; OIDC-minted where possible |

## Retention
- **Agent transcripts** (`.open-autonomy/history/**`): retained **[365] days**, then deleted by the
  `retention.yml` sweep (a gated PR — deletions are change-managed, C14). Override via
  `PUBLIC_AGENT_TRANSCRIPT_RETENTION_DAYS`.
- **Build artifacts / SBOM**: per the Actions retention setting (default 90 days).
- **Compliance evidence** (`compliance-evidence` branch): retained for the audit period + [1] year.
- **Spend/run ledger**: held by the model proxy (subprocessor); see `subprocessors.md`.

## PII
This installation is **not** designed to process end-user PII; the only PII-class data is GitHub usernames in
metadata. Do not place customer PII in issues, PRs, or code. The transcript redactor strips token shapes, not
PII — keep PII out of inputs. *(Moving transcripts out of git into private storage is a documented follow-on,
profile README C14-B.)*

## Deletion on request
On a documented request, [OWNER] removes the relevant data from the repo (and requests deletion from
subprocessors per their terms). Record the request and action.

## Evidence
This policy; retention sweep PRs; the artifact/branch retention settings.
