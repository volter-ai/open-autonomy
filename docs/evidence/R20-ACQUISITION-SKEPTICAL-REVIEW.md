# R20 External Campaign Acquisition Skeptical Review

Scope: custody and assembly of the R20 campaign. No live Slack workspace, real participant, or
accessibility evidence was produced during this review.

## Claims that survive review

- The registration authority is cryptographically distinct from every participant and the final
  collector. Its accepted registration freezes the exact campaign and trial assignments.
- The participant registry must equal the set named by the registration. Each immutable trial
  request binds campaign, assignment digest, ordinal, participant identity, and accepted
  registration response.
- Trials may complete in parallel, but unregistered, omitted, reassigned, duplicated, substituted,
  forged, or equivocated observations cannot reach collection. The embedded observation signature
  and acquisition response must both verify under the assigned participant key.
- The collector cannot declare intent until every registered trial has one accepted observation.
  Its declared signing time must follow all participant signatures. Its final signature binds the
  exact ordered campaign accepted by `signableR20Campaign`.
- Persisted state revalidates authorities, pending requests, accepted response signatures,
  assignment joins, completeness, collector intent, final campaign signature, and assembly digest.
  Writes use atomic replacement plus file and directory `fsync`.
- The full valid Slack/web/CLI fixture was collected in reverse trial order, reconstructed
  byte-semantically, and accepted by the real R20 external verifier.

## Attacks exercised

Tests reject pre-registration work, invented trials, incomplete collection, assignment
substitution, wrong participant keys, response forgery, equivocation, duplicate cryptographic
identities, and pending-request tampering across restart. CLI issuance is proven durable before its
request file becomes visible.

## Residual limitations

1. The synthetic end-to-end fixture proves protocol composition, not live Slack authenticity or
   human participation. Those remain explicit R20 closure requirements.
2. Acquisition validates participant custody and matrix joins. The final verifier remains
   authoritative for provider receipts, raw evidence artifacts, causal audit joins, accessibility
   capabilities, recovery behavior, timing, and all command/attack coverage.
3. One CLI writer is assumed per state path. External participants can process immutable requests
   concurrently, but accepted responses must be serialized into the state.
4. No external authority has populated this protocol; R20 remains ready but open.

## Decision

The acquisition layer is structurally ready for an externally administered R20 campaign and cannot
promote its local fixture to closure.
