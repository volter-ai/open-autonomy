# R28 Long-Running Acquisition Skeptical Review

Scope: R28 evidence acquisition and custody, not the semantic validity or closure of an autonomous
organization campaign.

## Preserved invariants

- Registration freezes the campaign, dependencies, resource bounds, protected controls, grants,
  and canonical repository baseline under an external signature.
- Heartbeat, crash, proposal, and audit streams are independently custodied hash chains. Each
  append request binds its ordinal and previous accepted response. Pending requests replay exactly.
- A stream cannot accept gaps, overwrite an accepted entry, append after sealing, or change its
  externally signed seal count and head.
- Completion cannot be requested until all four stream authorities seal their streams. Its final
  repository must preserve the registered remote and baseline, and its residual set must be empty.
- The validator key is cryptographically distinct from all acquisition roles. Validator intent is
  frozen before a second request presents the exact signable campaign digest. Assembly accepts only
  the validator's Ed25519 signature over that campaign.
- State reload recomputes request causality, stream heads, seals, baseline/final joins, validator
  intent, campaign signature, and any claimed assembly digest. State and request outputs are
  atomically replaced and `fsync`ed; request state is durable before the request file is exposed.

## Exercised attacks

Tests cover premature collection, append gaps, duplicate issuance, fragment substitution,
authority substitution, forged signatures, equivocation, seal truncation, append-after-seal,
pending-request tampering, persisted-fragment tampering, baseline substitution, duplicate
cryptographic identities, validator candidate binding, CLI restart, and a 91-entry daily heartbeat
chain surviving persistence and reload.

## Residual limitations

1. Acquisition signatures prove custody, not the truth of their payloads. The separate R28 verifier
   must still validate all 28 dependencies, real repository mutation, grants, heartbeat timing,
   process/storage crashes, proposals, accounting, attacks, pause state, audit chain, and validator.
2. The 91-day test proves append/restart mechanics, not elapsed real time. Only externally timestamped
   live heartbeats accepted by the final verifier establish the required duration.
3. One CLI writer is assumed per state path. Immutable requests may be handled concurrently by
   external authorities, but state mutations must be serialized.
4. No external authority has populated the protocol. R28 remains open, as do its R0–R27 dependency
   requirements.

## Decision

The protocol is structurally suitable to acquire a real long-running campaign without allowing the
local controller to synthesize, reorder, truncate, or silently replace external evidence. It does
not itself constitute campaign evidence or closure.
