# R20–R28 External Evidence Intake Skeptical Review

Scope: the common command that loads an externally configured trust module, authenticates that
module, invokes a checkpoint verifier, and emits a receipt. It does not review or certify any
campaign payload.

## Findings

1. **R28 was invoked without its required `nowIso` argument.** Confirmed and fixed. The intake now
   requires `--verified-at`, passes it to R26 and R28, and records it in the receipt. A production
   test submits a valid R28 campaign through the real routing table.
2. **R20–R26 could not use the hardened intake.** Confirmed and fixed. One exact checkpoint domain
   now routes R20 through R28; a test exercises every route and proves the same explicit timestamp
   reaches each verifier.
3. **An attacker could substitute an always-accept trust module.** Already mitigated. An external
   Ed25519 root signs the exact module digest and checkpoint. Wrong checkpoint, changed bytes,
   forged signature, missing root, and future-dated attestation are rejected.
4. **Implicit wall-clock time would make receipts non-replayable.** Fixed. No wall-clock default is
   used. Verification time is caller-supplied, validated, bound into the receipt digest, and must not
   precede the trust-module attestation.
5. **A successful receipt could be mistaken for closure.** Accepted residual risk. A receipt only
   proves that the named verifier returned successfully under the attested trust policy at the
   recorded time. Closure ledgers must independently bind the receipt, bundle, trust root, dependency
   DAG, and required external authorities.

## Preserved properties

- Malformed payloads, absent trust, unrecognized checkpoints, duplicate or incomplete arguments,
  invalid timestamps, unapproved trust modules, and verifier rejection produce no receipt.
- Receipts bind checkpoint, verification time, exact bundle bytes, exact trust-module bytes,
  trust-attestation digest, root-key fingerprint, and verifier result under a final semantic digest.
- The trust implementation remains external campaign policy rather than shipped substrate behavior.

## Decision

The intake is suitable as the common independently administered acceptance boundary for R20–R28.
It makes no external campaign true and closes no checkpoint on its own.
