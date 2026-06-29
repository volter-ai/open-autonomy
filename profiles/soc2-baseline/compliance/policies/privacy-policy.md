# Privacy Policy (Privacy TSC)

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (SOC 2 **Privacy** TSC; aligns with GDPR/CCPA where applicable).

## Purpose
Govern how [ORG] collects, uses, retains, discloses, and disposes of **personal information (PI)** in this
installation. SOC 2 Privacy requires that PI handling matches your stated commitments (notice, choice,
collection, use, retention, access, disclosure, quality, monitoring, disposal).

## Scope & posture
This installation is **not designed to process end-user PI**. The only personal data it inherently touches is
**GitHub usernames** (in run/spend metadata and transcripts). Personnel are responsible for keeping customer
PI **out** of issues, PRs, code, and prompts (`data-classification-and-retention-policy.md`,
`acceptable-use-policy.md`). If your adoption *does* process PI, complete the sections below and extend the
controls accordingly.

## Commitments (the Privacy TSC criteria)
- **Notice & purpose:** state what PI is collected and why. For v1: GitHub usernames for attribution/audit.
- **Choice & consent:** obtain consent where the law requires it for any PI you add.
- **Collection minimization:** collect only PI needed for the stated purpose; prohibit PI in agent inputs.
- **Use & retention:** use PI only for the stated purpose; retain per
  `data-classification-and-retention-policy.md` (transcripts pruned by `retention.yml`).
- **Access:** provide a path for a data subject to request access/correction (see DSR process below).
- **Disclosure & subprocessors:** PI may transit subprocessors (`subprocessors.md`); ensure DPAs cover PI.
- **Quality, monitoring, disposal:** keep PI accurate; monitor for unauthorized PI; dispose per retention.

## Data-Subject Request (DSR) process
1. Intake a request (access / correction / deletion / portability) via [contact].
2. Verify the requester's identity.
3. Locate the PI (repo history, transcripts on `compliance-evidence`/`.open-autonomy/history`, the proxy
   ledger via the operator).
4. Fulfil within the statutory window ([e.g. 30 days]); for deletion, remove from the repo and request
   subprocessor deletion per their terms.
5. Record the request + action as evidence.

## Breach of PI
A confirmed PI breach follows `incident-response-policy.md` plus any statutory notification duty (regulator +
affected individuals within the required window).

## Evidence
This policy; the DSR log; retention-sweep records; subprocessor DPAs covering PI.
